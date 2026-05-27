import { useEffect } from 'react';
import { useTrackerStore } from '../store/trackerStore';
import { useNotificationStore } from '../store/notificationStore';

/**
 * useServiceWorker
 *
 * - Registers /sw.js
 * - Syncs library + knownChapters into the SW via postMessage so it can poll
 *   even when the tab is closed (via Periodic Background Sync API)
 * - Listens for NEW_CHAPTERS messages from the SW (fires when tab is open
 *   but in background) and writes them into notificationStore
 */
export function useServiceWorker() {
    const library       = useTrackerStore(s => s.library);
    const knownChapters = useTrackerStore(s => s.knownChapters);
    const addAlerts     = useNotificationStore(s => s.addAlerts);

    const postStoreUpdate = (sw) => {
        if (!sw) return;
        sw.postMessage({
            type: 'STORE_UPDATE',
            library: useTrackerStore.getState().library,
            knownChapters: useTrackerStore.getState().knownChapters,
        });
    };

    // ── Register SW once ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;


        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then(async (r) => {
                postStoreUpdate(r.active ?? r.waiting ?? r.installing ?? navigator.serviceWorker.controller);
                const readyReg = await navigator.serviceWorker.ready;
                postStoreUpdate(readyReg.active ?? navigator.serviceWorker.controller);

                // Register for periodic background sync if supported
                if ('periodicSync' in r) {
                    try {
                        const status = await navigator.permissions.query({
                            name: 'periodic-background-sync',
                        });
                        if (status.state === 'granted') {
                            await r.periodicSync.register('chapter-poll', {
                                minInterval: 15 * 60 * 1000, // 15 min
                            });
                        }
                    } catch { /* permission not available */ }
                }
            })
            .catch(() => { /* SW registration failed - non-critical */ });

        // Listen for messages from the SW
        const handler = (e) => {
            if (e.data?.type === 'NEW_CHAPTERS') {
                const alerts = (e.data.alerts ?? []).map(a => ({
                    id:           `${a.mangaId}::${a.chapterId}`,
                    mangaId:      a.mangaId,
                    mangaTitle:   a.mangaTitle,
                    mangaPoster:  a.mangaPoster,
                    chapterId:    a.chapterId,
                    chapterNum:   a.chapterNum,
                    chapterTitle: null,
                    detectedAt:   Date.now(),
                    read:         false,
                }));
                addAlerts(alerts);
            }
        };

        navigator.serviceWorker.addEventListener('message', handler);
        return () => navigator.serviceWorker.removeEventListener('message', handler);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sync library + knownChapters to SW whenever they change ───────────────
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        const target = navigator.serviceWorker.controller ?? navigator.serviceWorker.ready.then(r => r.active).catch(() => null);
        Promise.resolve(target).then((sw) => {
            if (!sw) return;
            sw.postMessage({
                type: 'STORE_UPDATE',
                library,
                knownChapters,
            });
            sw.postMessage({ type: 'POLL_NOW' });
        });
    }, [library, knownChapters]);
}

/**
 * Request push-notification permission and return the result.
 * Call this on a user gesture (button click).
 */
export async function requestNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    const result = await Notification.requestPermission();
    return result;
}
