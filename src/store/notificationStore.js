import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * notificationStore
 *
 * Stores structured "new chapter" alerts for bookmarked manga.
 * Each alert lives until the user dismisses it.
 *
 * Alert shape:
 * {
 *   id:           string,          // unique alert id
 *   mangaId:      string,
 *   mangaTitle:   string,
 *   mangaPoster:  string | null,
 *   chapterId:    string,
 *   chapterNum:   string | number,
 *   chapterTitle: string | null,
 *   detectedAt:   number,          // Date.now()
 *   read:         boolean,
 * }
 */

export const useNotificationStore = create(
    persist(
        (set, get) => ({
            alerts: [],          // Array<Alert>
            lastChecked: null,   // timestamp of last successful poll
            pollHealth: {
                consecutiveFailures: 0,
                lastSuccessAt: null,
                lastErrorAt: null,
                lastError: null,
            },

            /** Called by the poller when new chapters are found */
            addAlerts: (newAlerts) => set((state) => {
                const existingIds = new Set(state.alerts.map(a => a.id));
                const fresh = newAlerts.filter(a => !existingIds.has(a.id));
                if (fresh.length === 0) return state;
                // Prepend new ones; prune oldest READ alerts beyond 50, hard cap 200
                let merged = [...fresh, ...state.alerts];
                const unread = merged.filter(a => !a.read);
                const read   = merged.filter(a =>  a.read).slice(0, 50); // keep only 50 read
                merged = [...unread, ...read].slice(0, 200);
                return { alerts: merged };
            }),

            /** Mark a single alert as read */
            markRead: (alertId) => set((state) => ({
                alerts: state.alerts.map(a =>
                    a.id === alertId ? { ...a, read: true } : a
                )
            })),

            /** Mark all alerts as read */
            markAllRead: () => set((state) => ({
                alerts: state.alerts.map(a => ({ ...a, read: true }))
            })),

            /** Dismiss (delete) a single alert */
            dismiss: (alertId) => set((state) => ({
                alerts: state.alerts.filter(a => a.id !== alertId)
            })),

            /** Dismiss all alerts for a manga */
            dismissManga: (mangaId) => set((state) => ({
                alerts: state.alerts.filter(a => a.mangaId !== mangaId)
            })),

            /** Dismiss all alerts */
            dismissAll: () => set({ alerts: [] }),

            setLastChecked: (ts) => set({ lastChecked: ts }),
            reportPollSuccess: () => set((state) => ({
                pollHealth: {
                    ...state.pollHealth,
                    consecutiveFailures: 0,
                    lastSuccessAt: Date.now(),
                    lastError: null,
                }
            })),
            reportPollFailure: (err) => set((state) => ({
                pollHealth: {
                    ...state.pollHealth,
                    consecutiveFailures: (state.pollHealth?.consecutiveFailures ?? 0) + 1,
                    lastErrorAt: Date.now(),
                    lastError: typeof err === 'string' ? err : (err?.message ?? 'Unknown polling error'),
                }
            })),

            // Selectors
            getUnreadCount: () => get().alerts.filter(a => !a.read).length,
            getUnread:      () => get().alerts.filter(a => !a.read),
        }),
        { name: 'manga-notifications-storage' }
    )
);
