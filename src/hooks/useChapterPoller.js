import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTrackerStore } from '../store/trackerStore';
import { useNotificationStore } from '../store/notificationStore';
import { getMangaDetails, getCover } from '../api_routes/mangaAdapter';

/**
 * useChapterPoller
 *
 * Polls for new chapters on bookmarked manga that are still being actively
 * followed (status: reading | rereading | planned).
 *
 * Design decisions:
 * - Uses refs for store values so the interval is created ONCE and never
 *   restarted — avoids the stale-closure / constant-reset problem.
 * - First run: if a manga has no knownChapters entry, we silently seed it
 *   instead of firing false "new chapter" alerts.
 * - Uses getMangaDetails (single request per manga) instead of getChapters
 *   (which can fire up to 40 paginated requests). Notifications don't need
 *   the full paginated list — they just need to detect IDs not seen before.
 * - Skips polling when the tab is hidden (Page Visibility API).
 * - Only polls manga with "active" statuses — skips Completed / Dropped.
 * - Resets isBusy with a hard timeout so a stalled poll never blocks forever.
 */

const ACTIVE_STATUSES = new Set(['reading', 'rereading', 'planned']);
const BETWEEN_MANGA_DELAY = 1200; // ms between each manga request
const BUSY_TIMEOUT_MS     = 5 * 60 * 1000; // 5 min hard reset

export function useChapterPoller(intervalMs = 15 * 60 * 1000) {
    const isBusy    = useRef(false);
    const busyTimer = useRef(null);

    // Keep refs to latest store state so the interval never needs recreating.
    const libraryRef           = useRef({});
    const knownChaptersRef     = useRef({});
    const syncKnownChaptersRef = useRef(null);
    const getNewChapterIdsRef  = useRef(null);
    const addAlertsRef         = useRef(null);
    const setLastCheckedRef    = useRef(null);
    const dismissMangaRef      = useRef(null);
    const reportPollSuccessRef = useRef(null);
    const reportPollFailureRef = useRef(null);

    const library           = useTrackerStore(s => s.library);
    const knownChapters     = useTrackerStore(s => s.knownChapters);
    const syncKnownChapters = useTrackerStore(s => s.syncKnownChapters);
    const getNewChapterIds  = useTrackerStore(s => s.getNewChapterIds);
    const addAlerts         = useNotificationStore(s => s.addAlerts);
    const setLastChecked    = useNotificationStore(s => s.setLastChecked);
    const dismissManga      = useNotificationStore(s => s.dismissManga);
    const reportPollSuccess = useNotificationStore(s => s.reportPollSuccess);
    const reportPollFailure = useNotificationStore(s => s.reportPollFailure);

    useLayoutEffect(() => {
        libraryRef.current           = library;
        knownChaptersRef.current     = knownChapters;
        syncKnownChaptersRef.current = syncKnownChapters;
        getNewChapterIdsRef.current  = getNewChapterIds;
        addAlertsRef.current         = addAlerts;
        setLastCheckedRef.current    = setLastChecked;
        dismissMangaRef.current      = dismissManga;
        reportPollSuccessRef.current = reportPollSuccess;
        reportPollFailureRef.current = reportPollFailure;
    });

    useEffect(() => {
        async function poll() {
            // Skip if tab is hidden — poll will fire again when user returns
            if (document.visibilityState === 'hidden') return;
            if (isBusy.current) return;

            const allManga = Object.values(libraryRef.current);
            // Only poll manga the user is actively following
            const activeManga = allManga.filter(m => ACTIVE_STATUSES.has(m.status));
            if (activeManga.length === 0) return;

            isBusy.current = true;
            // Hard safety reset: if something hangs for >5 min, unlock
            busyTimer.current = setTimeout(() => { isBusy.current = false; }, BUSY_TIMEOUT_MS);

            try {
                let hadFailure = false;
                for (const manga of activeManga) {
                    // Skip if tab went hidden mid-poll — pause until next tick
                    if (document.visibilityState === 'hidden') break;

                    try {
                        // Single lightweight request — details endpoint returns
                        // the chapter list without pagination overhead.
                        const data = await withRetries(() => getMangaDetails(manga.id, true), 3, 900);
                        const chapters = data?.chapters;
                        if (!Array.isArray(chapters) || chapters.length === 0) continue;

                        const currentIds = chapters.map(c => c.id);
                        const known = knownChaptersRef.current[manga.id];
                        const isFirstTime = !known || known.length === 0;

                        if (isFirstTime) {
                            // Silently seed on first poll — don't alert for existing chapters
                            syncKnownChaptersRef.current(manga.id, currentIds);
                        } else {
                            const newIds = getNewChapterIdsRef.current(manga.id, currentIds);

                            if (newIds.length > 0) {
                                const newAlerts = newIds.map(chId => {
                                    const ch = chapters.find(c => c.id === chId);
                                    return {
                                        id:           `${manga.id}::${chId}`,
                                        mangaId:      manga.id,
                                        mangaTitle:   manga.title,
                                        mangaPoster:  manga.poster || getCover(data) || null,
                                        chapterId:    chId,
                                        chapterNum:   ch?.number ?? ch?.index ?? '?',
                                        chapterTitle: ch?.title ?? null,
                                        detectedAt:   Date.now(),
                                        read:         false,
                                    };
                                });
                                addAlertsRef.current(newAlerts);
                                notifyInPage(newAlerts);
                            }

                            // Advance the known set regardless (catches deletions too)
                            syncKnownChaptersRef.current(manga.id, currentIds);
                        }

                        await sleep(BETWEEN_MANGA_DELAY);
                    } catch {
                        hadFailure = true;
                        reportPollFailureRef.current?.(`Failed to check ${manga.title}`);
                    }
                }
                if (!hadFailure) reportPollSuccessRef.current?.();
            } finally {
                clearTimeout(busyTimer.current);
                isBusy.current = false;
                setLastCheckedRef.current(Date.now());
            }
        }

        // Re-poll when tab becomes visible again after being hidden
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') poll();
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        // First run after a short boot delay, then on the interval
        const initial  = setTimeout(poll, 5000);
        const interval = setInterval(poll, intervalMs);

        return () => {
            clearTimeout(initial);
            clearInterval(interval);
            clearTimeout(busyTimer.current);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — refs handle fresh values
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetries(fn, attempts = 3, baseDelay = 800) {
    let lastError;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (i < attempts - 1) {
                const jitter = Math.floor(Math.random() * 250);
                await sleep(baseDelay * (i + 1) + jitter);
            }
        }
    }
    throw lastError;
}

function notifyInPage(alerts) {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!Array.isArray(alerts) || alerts.length === 0) return;

    const first = alerts[0];
    const title = alerts.length === 1
        ? `New chapter: ${first.mangaTitle}`
        : `${alerts.length} new chapters available`;
    const body = alerts.length === 1
        ? `Chapter ${first.chapterNum}${first.chapterTitle ? ` - ${first.chapterTitle}` : ''}`
        : alerts.slice(0, 3).map(a => `${a.mangaTitle} Ch.${a.chapterNum}`).join(', ');

    try {
        new Notification(title, { body, tag: 'atsumaru-new-chapters' });
    } catch {
        // Notification API can throw in some embedded contexts.
    }
}
