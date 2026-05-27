import {
    getAtsuHomePage, getAtsuMangaDetails, getAtsuSearch, getAtsuSearchFilters,
    getAtsuChapterPages,
    getHomeSection, getTrending, getMostBookmarked, getHotUpdates,
    getTopRated, getPopular, getRecentlyAdded, getRecentlyUpdated,
    getBrowse, getRecommendations, getSimilarManga,
    getChapters, getHasMoreChapters, getMoreChapters,
    resolveImage, getCover, getBanner, getTitle, normalizeItem,
    extractMangaId, extractChapterId,
    countryLabel, statusLabel, chapterNum, chapterId,
    BROWSE_MODES,
} from './atsuProvider.js';
import { fetchAnilistDetails } from './anilistProvider.js';

/**
 * Abstraction layer — all UI components call these instead of a specific provider.
 * Swap the provider imports above to change backends globally.
 */

// ─── Home ─────────────────────────────────────────────────────────────────────
export async function getHomePage()       { return await getAtsuHomePage(); }
export { getHomeSection, getTrending, getMostBookmarked, getHotUpdates,
         getTopRated, getPopular, getRecentlyAdded, getRecentlyUpdated };

// ─── Browse ───────────────────────────────────────────────────────────────────
export { getBrowse, BROWSE_MODES };

// ─── Manga detail ─────────────────────────────────────────────────────────────
export async function getMangaDetails(mangaId, skipAnilist = false) {
    const mangaData = await getAtsuMangaDetails(mangaId);
    if (!skipAnilist && mangaData?.anilistId) {
        const extra = await fetchAnilistDetails(mangaData.anilistId);
        if (extra) mangaData.extendedDetails = extra;
    }
    return mangaData;
}

export { getRecommendations, getSimilarManga };

// ─── Chapters ─────────────────────────────────────────────────────────────────
export { getChapters, getHasMoreChapters, getMoreChapters };

// ─── Chapter pages ────────────────────────────────────────────────────────────
export async function getChapterPages(mangaId, chapterId, pageCount = null) {
    return await getAtsuChapterPages(mangaId, chapterId, pageCount);
}

// ─── Search ───────────────────────────────────────────────────────────────────
export async function searchManga(query, filters = {}, page = 1) { return await getAtsuSearch(query, filters, page); }
export async function getSearchFilters()               { return await getAtsuSearchFilters(); }

// ─── AniList ──────────────────────────────────────────────────────────────────
export async function getAnilistExtended(anilistId) { return await fetchAnilistDetails(anilistId); }

// ─── Helpers (re-exported for use in UI components) ───────────────────────────
export { resolveImage, getCover, getBanner, getTitle, normalizeItem,
         extractMangaId, extractChapterId,
         countryLabel, statusLabel, chapterNum, chapterId };