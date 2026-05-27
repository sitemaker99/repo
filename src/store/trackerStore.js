import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { syncProgressToAnilist } from '../api_routes/anilistSync';

// ── Bookmark TTL ──────────────────────────────────────────────────────────────
// Each bookmark has an `expiresAt` timestamp.
// Every time the app loads, open bookmarks get their expiry refreshed by 30 days.
// Bookmarks that have passed their expiry are pruned on load.
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const LIBRARY_STATUSES = [
    { value: 'reading',    label: 'Reading',    color: '#a07cf8' },
    { value: 'rereading',  label: 'Rereading',  color: '#60c8f5' },
    { value: 'planned',    label: 'Planned',    color: '#9aa0ac' },
    { value: 'completed',  label: 'Completed',  color: '#6fcf97' },
    { value: 'paused',     label: 'Paused',     color: '#f2994a' },
    { value: 'dropped',    label: 'Dropped',    color: '#eb5757' },
];

export const useTrackerStore = create(
    persist(
        (set, get) => ({
            library: {},
            readChapters: {},
            authenticReadChapters: {},
            pageProgress: {},
            knownChapters: {},
            visitHistory: [],
            readingStats: {
                totalTimeMs: 0,
                timeByManga: {}
            },

            // ── Called once on app boot (in AppInit) ────────────────────────
            // Prunes expired bookmarks and refreshes TTL on all active ones.
            refreshBookmarks: () => set((state) => {
                const now = Date.now();
                const updated = {};
                for (const [id, entry] of Object.entries(state.library)) {
                    // If expiresAt is missing (legacy) treat as still valid
                    if (entry.expiresAt && entry.expiresAt < now) continue; // pruned
                    updated[id] = { ...entry, expiresAt: now + TTL_MS };   // refreshed
                }
                return { library: updated };
            }),

            // ── Library ──────────────────────────────────────────────────────
            addToLibrary: (mangaId, mangaData, status = 'reading') => set((state) => ({
                library: {
                    ...state.library,
                    [mangaId]: {
                        id: mangaId,
                        anilistId: mangaData.anilistId || null,
                        title: mangaData.title,
                        poster: mangaData.poster || null,
                        status,
                        addedAt:   Date.now(),
                        expiresAt: Date.now() + TTL_MS,
                        totalChapters: mangaData.chapters?.length ?? 0,
                    }
                }
            })),

            removeFromLibrary: (mangaId) => set((state) => {
                const lib   = { ...state.library };
                const known = { ...state.knownChapters };
                delete lib[mangaId];
                delete known[mangaId];
                return { library: lib, knownChapters: known };
            }),

            updateLibraryStatus: (mangaId, status) => set((state) => ({
                library: {
                    ...state.library,
                    [mangaId]: { ...state.library[mangaId], status }
                }
            })),

            updateLibraryChapterCount: (mangaId, count) => set((state) => {
                if (!state.library[mangaId]) return state;
                if (state.library[mangaId].totalChapters === count) return state;
                return {
                    library: {
                        ...state.library,
                        [mangaId]: { ...state.library[mangaId], totalChapters: count }
                    }
                };
            }),

            // ── Visit history ─────────────────────────────────────────────────
            recordVisit: (mangaId, mangaData) => set((state) => {
                const entry = {
                    id: mangaId,
                    title: mangaData.title ?? 'Unknown',
                    poster: mangaData.poster ?? null,
                    visitedAt: Date.now(),
                };
                const filtered = state.visitHistory.filter(v => v.id !== mangaId);
                return { visitHistory: [entry, ...filtered].slice(0, 20) };
            }),

            // ── Chapter read/unread ───────────────────────────────────────────
            markChapterRead: (mangaId, chapterId) => set((state) => {
                const cur = state.readChapters[mangaId] || [];
                if (cur.includes(chapterId)) return state;
                const newRead = [...cur, chapterId];
                
                const libEntry = state.library[mangaId];
                if (libEntry && libEntry.anilistId) {
                    syncProgressToAnilist(libEntry.anilistId, newRead.length);
                }
                
                return { readChapters: { ...state.readChapters, [mangaId]: newRead } };
            }),

            markChapterUnread: (mangaId, chapterId) => set((state) => {
                const cur = state.readChapters[mangaId] || [];
                const newRead = cur.filter(id => id !== chapterId);
                
                const libEntry = state.library[mangaId];
                if (libEntry && libEntry.anilistId) {
                    syncProgressToAnilist(libEntry.anilistId, newRead.length);
                }
                
                return { readChapters: { ...state.readChapters, [mangaId]: newRead } };
            }),

            markAllChaptersRead: (mangaId, allChapterIds) => set((state) => {
                const libEntry = state.library[mangaId];
                if (libEntry && libEntry.anilistId) {
                    syncProgressToAnilist(libEntry.anilistId, allChapterIds.length);
                }
                return { readChapters: { ...state.readChapters, [mangaId]: [...allChapterIds] } };
            }),

            markAllChaptersUnread: (mangaId) => set((state) => {
                const libEntry = state.library[mangaId];
                if (libEntry && libEntry.anilistId) {
                    syncProgressToAnilist(libEntry.anilistId, 0);
                }
                return { readChapters: { ...state.readChapters, [mangaId]: [] } };
            }),

            markAuthenticChapterRead: (mangaId, chapterId) => set((state) => {
                const cur = state.authenticReadChapters[mangaId] || [];
                if (cur.includes(chapterId)) return state;
                const newRead = [...cur, chapterId];
                return { authenticReadChapters: { ...state.authenticReadChapters, [mangaId]: newRead } };
            }),

            addReadingTime: (mangaId, deltaMs) => set((state) => {
                const currentTotal = state.readingStats?.totalTimeMs || 0;
                const currentMangaTime = state.readingStats?.timeByManga?.[mangaId] || 0;
                
                return {
                    readingStats: {
                        totalTimeMs: currentTotal + deltaMs,
                        timeByManga: {
                            ...(state.readingStats?.timeByManga || {}),
                            [mangaId]: currentMangaTime + deltaMs
                        }
                    }
                };
            }),

            // ── Page progress ─────────────────────────────────────────────────
            savePageProgress: (mangaId, chapterId, pageIndex) => set((state) => {
                const existing = state.pageProgress[mangaId] ?? {};
                return {
                    pageProgress: {
                        ...state.pageProgress,
                        [mangaId]: {
                            ...existing,
                            lastChapterId: chapterId,
                            updatedAt: Date.now(),
                            [chapterId]: { page: pageIndex, updatedAt: Date.now() },
                        }
                    }
                };
            }),

            getSavedPage: (mangaId, chapterId) => {
                return get().pageProgress[mangaId]?.[chapterId]?.page ?? 0;
            },

            getLastPosition: (mangaId) => {
                const p = get().pageProgress[mangaId];
                if (!p?.lastChapterId) return null;
                return { chapterId: p.lastChapterId, page: p[p.lastChapterId]?.page ?? 0 };
            },

            // ── Known chapters (for new-chapter notifications) ────────────────
            syncKnownChapters: (mangaId, chapterIds) => set((state) => ({
                knownChapters: { ...state.knownChapters, [mangaId]: chapterIds }
            })),

            // Marks the given chapter IDs as "seen" so they no longer show as new
            dismissNotifications: (mangaId, chapterIds) => set((state) => {
                const existing = state.knownChapters[mangaId] || [];
                const merged   = Array.from(new Set([...existing, ...chapterIds]));
                return { knownChapters: { ...state.knownChapters, [mangaId]: merged } };
            }),

            getNewChapterIds: (mangaId, currentChapterIds) => {
                const known = new Set(get().knownChapters[mangaId] || []);
                return currentChapterIds.filter(id => !known.has(id));
            },

            isChapterRead: (mangaId, chapterId) => {
                return (get().readChapters[mangaId] || []).includes(chapterId);
            },

            // ── Reading streak ────────────────────────────────────────────────
            getReadingStreak: () => {
                const progress = get().pageProgress;
                const days = new Set();
                Object.values(progress).forEach(mangaProg => {
                    Object.values(mangaProg).forEach(val => {
                        if (val && typeof val === 'object' && val.updatedAt)
                            days.add(new Date(val.updatedAt).toDateString());
                    });
                });
                if (days.size === 0) return 0;
                const sorted = [...days].map(d => new Date(d).getTime()).sort((a, b) => b - a);
                const today     = new Date().toDateString();
                const yesterday = new Date(Date.now() - 86400000).toDateString();
                const newestDay = new Date(sorted[0]).toDateString();
                if (newestDay !== today && newestDay !== yesterday) return 0;
                let streak = 1;
                for (let i = 1; i < sorted.length; i++) {
                    if (sorted[i - 1] - sorted[i] <= 86400000 + 1000) streak++;
                    else break;
                }
                return streak;
            },
        }),
        { name: 'manga-tracker-storage' }
    )
);
