/* Atsumaru Service Worker — background chapter polling + push notifications */

const CACHE_NAME = 'atsumaru-v1';
const POLL_TAG   = 'chapter-poll';
const FETCH_RETRIES = 3;

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(clients.claim());
});

// ── Periodic background sync ───────────────────────────────────────────────────
self.addEventListener('periodicsync', (e) => {
    if (e.tag === POLL_TAG) {
        e.waitUntil(pollChapters());
    }
});

// ── Message from main thread ──────────────────────────────────────────────────
self.addEventListener('message', (e) => {
    if (e.data?.type === 'POLL_NOW') {
        pollChapters();
    }
    if (e.data?.type === 'STORE_UPDATE') {
        // Store latest library/knownChapters in IndexedDB for use when page is closed
        storeData('library',       e.data.library);
        storeData('knownChapters', e.data.knownChapters);
    }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
    const data = e.data?.json() ?? {};
    e.waitUntil(
        self.registration.showNotification(data.title ?? 'Atsumaru', {
            body:    data.body ?? 'New chapter available',
            icon:    '/brand/favicon-128.jpg',
            badge:   '/brand/favicon-128.jpg',
            tag:     data.tag ?? 'atsumaru-chapter',
            data:    { url: data.url ?? '/' },
        })
    );
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = e.notification.data?.url ?? '/';
    e.waitUntil(
        clients.matchAll({ type: 'window' }).then(cs => {
            const existing = cs.find(c => c.url.includes(self.location.origin));
            if (existing) { existing.focus(); existing.navigate(url); }
            else clients.openWindow(url);
        })
    );
});

// ── Offline fetch fallback ────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
    // Only handle navigation requests for offline fallback
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(() =>
                caches.match('/index.html')
            )
        );
    }
});

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('atsumaru-sw', 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('kv');
        };
        req.onsuccess  = () => resolve(req.result);
        req.onerror    = () => reject(req.error);
    });
}

async function storeData(key, value) {
    try {
        const db = await openDB();
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(value, key);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch {}
}

async function loadData(key) {
    try {
        const db  = await openDB();
        const tx  = db.transaction('kv', 'readonly');
        const req = tx.objectStore('kv').get(key);
        return new Promise((res, rej) => {
            req.onsuccess = () => res(req.result);
            req.onerror   = () => rej(req.error);
        });
    } catch { return null; }
}

// ── Core polling logic ────────────────────────────────────────────────────────
async function pollChapters() {
    const library       = await loadData('library')       ?? {};
    const knownChapters = await loadData('knownChapters') ?? {};

    const mangaList = Object.values(library);
    if (mangaList.length === 0) return;

    const newAlerts = [];
    let failures = 0;

    for (const manga of mangaList) {
        try {
            const chapters = await fetchChaptersWithFallback(manga.id);
            if (!Array.isArray(chapters) || chapters.length === 0) continue;

            const currentIds = chapters.map(c => c.id);
            const known      = new Set(knownChapters[manga.id] ?? []);

            if (known.size === 0) {
                // First time — seed silently
                const updated = { ...knownChapters, [manga.id]: currentIds };
                await storeData('knownChapters', updated);
                continue;
            }

            const freshIds = currentIds.filter(id => !known.has(id));
            if (freshIds.length > 0) {
                freshIds.forEach(chId => {
                    const ch = chapters.find(c => c.id === chId);
                    newAlerts.push({
                        mangaId:     manga.id,
                        mangaTitle:  manga.title,
                        mangaPoster: manga.poster ?? null,
                        chapterId:   chId,
                        chapterNum:  ch?.number ?? ch?.index ?? '?',
                        url:         `/manga/${manga.id}`,
                    });
                });

                const updated = { ...knownChapters, [manga.id]: currentIds };
                await storeData('knownChapters', updated);
            }

            // Polite delay
            await new Promise(r => setTimeout(r, 600));
        } catch {
            failures += 1;
        }
    }

    await storeData('pollHealth', {
        lastCheckedAt: Date.now(),
        failuresInLastRun: failures,
        totalTracked: mangaList.length,
        status: failures === 0 ? 'ok' : (failures < mangaList.length ? 'degraded' : 'error'),
    });

    // Fire grouped notification
    if (newAlerts.length > 0) {
        const title = newAlerts.length === 1
            ? `New chapter: ${newAlerts[0].mangaTitle}`
            : `${newAlerts.length} new chapters available`;
        const body = newAlerts.length === 1
            ? `Chapter ${newAlerts[0].chapterNum} is out!`
            : newAlerts.map(a => `${a.mangaTitle} Ch.${a.chapterNum}`).join(', ');

        await self.registration.showNotification(title, {
            body,
            icon:  '/brand/favicon-128.jpg',
            badge: '/brand/favicon-128.jpg',
            tag:   'atsumaru-chapters',
            data:  { url: newAlerts[0].url },
        });

        // Notify open tabs so they update their stores
        const cs = await clients.matchAll({ type: 'window' });
        cs.forEach(c => c.postMessage({ type: 'NEW_CHAPTERS', alerts: newAlerts }));
    }
}

async function fetchChaptersWithFallback(mangaId) {
    const primary = `/api/chapters/${encodeURIComponent(mangaId)}`;
    const fallback = `/atsu-api/api/manga/info?mangaId=${encodeURIComponent(mangaId)}`;

    try {
        return await fetchJsonWithRetry(primary, FETCH_RETRIES);
    } catch {
        const raw = await fetchJsonWithRetry(fallback, FETCH_RETRIES);
        const chapters = raw?.chapters ?? [];
        return chapters.map(ch => ({
            id: ch.id ?? ch.chapterId,
            number: ch.number ?? ch.chapterNumber ?? ch.index,
            title: ch.title ?? null,
        }));
    }
}

async function fetchJsonWithRetry(url, attempts = 3) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (err) {
            lastError = err;
            if (i < attempts - 1) {
                await new Promise(r => setTimeout(r, 500 * (i + 1)));
            }
        }
    }
    throw lastError;
}
