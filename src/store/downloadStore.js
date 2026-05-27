import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────
const DB_NAME = 'atsu-downloads';
const STORE_NAME = 'images';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbGetAllKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useDownloadStore = create(
  persist(
    (set, get) => ({
      // Map of mangaId -> { title, poster, chapters: { chapterId: { title, images, downloadedAt, sizeBytes, status } } }
      downloads: {},

      // ── Download a chapter ──────────────────────────────────────────────
      downloadChapter: async (mangaId, mangaTitle, mangaPoster, chapterId, chapterTitle, imageUrls) => {
        // Initialize manga entry if needed, set chapter to downloading
        set((state) => {
          const manga = state.downloads[mangaId] || { title: mangaTitle, poster: mangaPoster, chapters: {} };
          return {
            downloads: {
              ...state.downloads,
              [mangaId]: {
                ...manga,
                title: mangaTitle,
                poster: mangaPoster,
                chapters: {
                  ...manga.chapters,
                  [chapterId]: {
                    title: chapterTitle,
                    images: imageUrls,
                    downloadedAt: Date.now(),
                    sizeBytes: 0,
                    status: 'downloading',
                  },
                },
              },
            },
          };
        });

        let totalSize = 0;

        try {
          for (let i = 0; i < imageUrls.length; i++) {
            const url = imageUrls[i];
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch image ${i}: ${response.status}`);
            }
            const blob = await response.blob();
            totalSize += blob.size;

            const key = `dl_${mangaId}_${chapterId}_${i}`;
            await idbPut(key, blob);
          }

          // Mark complete
          set((state) => {
            const manga = state.downloads[mangaId];
            if (!manga) return state;
            return {
              downloads: {
                ...state.downloads,
                [mangaId]: {
                  ...manga,
                  chapters: {
                    ...manga.chapters,
                    [chapterId]: {
                      ...manga.chapters[chapterId],
                      sizeBytes: totalSize,
                      status: 'complete',
                      downloadedAt: Date.now(),
                    },
                  },
                },
              },
            };
          });
        } catch (err) {
          console.error('Download failed:', err);
          // Mark failed
          set((state) => {
            const manga = state.downloads[mangaId];
            if (!manga) return state;
            return {
              downloads: {
                ...state.downloads,
                [mangaId]: {
                  ...manga,
                  chapters: {
                    ...manga.chapters,
                    [chapterId]: {
                      ...manga.chapters[chapterId],
                      sizeBytes: totalSize,
                      status: 'failed',
                    },
                  },
                },
              },
            };
          });
        }
      },

      // ── Get downloaded images as blob URLs ──────────────────────────────
      getDownloadedImages: async (mangaId, chapterId) => {
        const state = get();
        const manga = state.downloads[mangaId];
        if (!manga) return [];
        const chapter = manga.chapters[chapterId];
        if (!chapter) return [];

        const urls = [];
        for (let i = 0; i < chapter.images.length; i++) {
          const key = `dl_${mangaId}_${chapterId}_${i}`;
          try {
            const blob = await idbGet(key);
            if (blob) {
              urls.push(URL.createObjectURL(blob));
            }
          } catch (err) {
            console.error(`Failed to read blob for key ${key}:`, err);
          }
        }
        return urls;
      },

      // ── Remove a single chapter ────────────────────────────────────────
      removeChapter: (mangaId, chapterId) => {
        const state = get();
        const manga = state.downloads[mangaId];
        if (!manga) return;
        const chapter = manga.chapters[chapterId];
        if (!chapter) return;

        // Delete blobs from IndexedDB
        const imageCount = chapter.images.length;
        for (let i = 0; i < imageCount; i++) {
          const key = `dl_${mangaId}_${chapterId}_${i}`;
          idbDelete(key).catch((err) => console.error('Failed to delete blob:', err));
        }

        // Remove from state
        set((state) => {
          const manga = { ...state.downloads[mangaId] };
          const chapters = { ...manga.chapters };
          delete chapters[chapterId];

          // If no chapters left, remove the manga entirely
          if (Object.keys(chapters).length === 0) {
            const downloads = { ...state.downloads };
            delete downloads[mangaId];
            return { downloads };
          }

          return {
            downloads: {
              ...state.downloads,
              [mangaId]: { ...manga, chapters },
            },
          };
        });
      },

      // ── Remove an entire manga ─────────────────────────────────────────
      removeManga: (mangaId) => {
        const state = get();
        const manga = state.downloads[mangaId];
        if (!manga) return;

        // Delete all blobs for this manga
        for (const [chapterId, chapter] of Object.entries(manga.chapters)) {
          for (let i = 0; i < chapter.images.length; i++) {
            const key = `dl_${mangaId}_${chapterId}_${i}`;
            idbDelete(key).catch((err) => console.error('Failed to delete blob:', err));
          }
        }

        set((state) => {
          const downloads = { ...state.downloads };
          delete downloads[mangaId];
          return { downloads };
        });
      },

      // ── Clear everything ────────────────────────────────────────────────
      clearAllDownloads: () => {
        idbClear().catch((err) => console.error('Failed to clear IndexedDB:', err));
        set({ downloads: {} });
      },

      // ── Computed helpers ────────────────────────────────────────────────
      getTotalSize: () => {
        const { downloads } = get();
        let total = 0;
        for (const manga of Object.values(downloads)) {
          for (const chapter of Object.values(manga.chapters)) {
            total += chapter.sizeBytes || 0;
          }
        }
        return total;
      },

      getTotalChapters: () => {
        const { downloads } = get();
        let total = 0;
        for (const manga of Object.values(downloads)) {
          total += Object.keys(manga.chapters).length;
        }
        return total;
      },
    }),
    { name: 'atsu-downloads-meta' }
  )
);
