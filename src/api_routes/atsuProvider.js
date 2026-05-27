const ATSU_BASE_URL = '/atsu-api';
const FETCH_TIMEOUT_MS = 10000; // 10 second hard timeout
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 450;
const IMAGE_PROXY_BASE = '/api/image-proxy';

/** Fetch with a timeout — prevents silent hangs on slow/dead API */
function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(endpoint, attempts = RETRY_ATTEMPTS) {
    let lastError = null;

    for (let i = 0; i < attempts; i++) {
        try {
            const res = await fetchWithTimeout(`${ATSU_BASE_URL}${endpoint}`);
            if (!res.ok) throw new Error(`Failed to fetch ${endpoint}: ${res.status}`);
            return await res.json();
        } catch (e) {
            lastError = e;
            if (i < attempts - 1) {
                const jitter = Math.floor(Math.random() * 150);
                await sleep(RETRY_BASE_DELAY_MS * (i + 1) + jitter);
            }
        }
    }

    throw lastError ?? new Error(`Failed to fetch ${endpoint}`);
}

/**
 * In-flight deduplication cache.
 * If two callers hit the same endpoint simultaneously, the second one waits
 * for the first's Promise instead of firing a duplicate network request.
 */
const inFlight = new Map();

export async function fetchAtsuJson(endpoint) {
    if (inFlight.has(endpoint)) {
        return inFlight.get(endpoint);
    }
    const promise = (async () => {
        try {
            return await fetchJsonWithRetry(endpoint);
        } catch (e) {
            if (e.name === 'AbortError') {
                console.warn(`Request timed out: ${endpoint}`);
            } else {
                console.error(`Atsu API error [${endpoint}]:`, e.message);
            }
            return null;
        } finally {
            inFlight.delete(endpoint);
        }
    })();
    inFlight.set(endpoint, promise);
    return promise;
}

export async function getAtsuHomePage() {
    const data = await fetchAtsuJson('/api/home/page');
    return data?.homePage ?? null;
}

export async function getAtsuMangaDetails(mangaId) {
    if (!mangaId) return null;

    const [pageData, infoData] = await Promise.all([
        fetchAtsuJson(`/api/manga/page?id=${mangaId}`),
        fetchAtsuJson(`/api/manga/info?mangaId=${mangaId}`)
    ]);

    const metadata = pageData?.mangaPage ?? {};
    const rawChapters = infoData?.chapters ?? [];
    const fullChapters = deduplicateChapters(sortChapters(rawChapters.map(normalizeChapter)));

    // Guard: if both requests failed, return null so the UI shows "not found"
    if (!pageData && !infoData) return null;

    return {
        ...metadata,
        chapters: fullChapters,
        totalChapterCount: fullChapters.length,
        hasMoreChapters: false,
        externalLinks: {
            anilist: metadata.anilistId ? `https://anilist.co/manga/${metadata.anilistId}` : null,
            mal: metadata.malId ? `https://myanimelist.net/manga/${metadata.malId}` : null,
            kitsu: metadata.kitsuId ? `https://kitsu.io/manga/${metadata.kitsuId}` : null,
        }
    };
}

export async function getAtsuSearch(query, filters = {}, page = 1) {
    if (!query || !query.trim()) return { hits: [], found: 0, page };

    // ── Build Typesense filter_by string ──────────────────────────────────────
    // Observed syntax from network logs:
    //   include genre:  genreIds:=`id`
    //   exclude genre:  genreIds:!=[`id1`,`id2`]
    //   type:           type:=[`Manga`,`Manwha`]
    //   status:         status:=[`Ongoing`,`Completed`]
    const filterParts = ['views:>0'];

    // Types — backtick-wrap each value
    if (Array.isArray(filters.types) && filters.types.length > 0) {
        const vals = filters.types.map(t => `\`${t}\``).join(',');
        filterParts.push(`type:=[${vals}]`);
    } else if (filters.type) {
        filterParts.push(`type:=\`${filters.type}\``);
    }

    // Statuses — backtick-wrap each value
    if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
        const vals = filters.statuses.map(s => `\`${s}\``).join(',');
        filterParts.push(`status:=[${vals}]`);
    } else if (filters.status) {
        filterParts.push(`status:=\`${filters.status}\``);
    }

    // Genre INCLUDE — each ID gets its own clause: genreIds:=`id`
    if (Array.isArray(filters.includeGenreIds) && filters.includeGenreIds.length > 0) {
        for (const id of filters.includeGenreIds) {
            filterParts.push(`genreIds:=\`${id}\``);
        }
    }

    // Genre EXCLUDE — single clause: genreIds:!=[`id1`,`id2`]
    if (Array.isArray(filters.excludeGenreIds) && filters.excludeGenreIds.length > 0) {
        const vals = filters.excludeGenreIds.map(id => `\`${id}\``).join(',');
        filterParts.push(`genreIds:!=[${vals}]`);
    }

    if (filters.year) {
        filterParts.push(`year:=${filters.year}`);
    }

    if (filters.minChapters && Number(filters.minChapters) > 0) {
        filterParts.push(`totalChapterCount:>=${Number(filters.minChapters)}`);
    }

    if (filters.officialOnly) {
        filterParts.push(`isOfficial:=true`);
    }

    if (!filters.showAdult) {
        filterParts.push(`isAdult:!=true`);
    }

    const params = new URLSearchParams({
        q: query.trim(),
        query_by: 'title,englishTitle,otherNames,authors',
        query_by_weights: '4,3,2,1',
        num_typos: '4,3,2,1',
        include_fields: 'id,title,englishTitle,poster,posterSmall,posterMedium,type,isAdult,status,year',
        filter_by: filterParts.join(' && '),
        page: String(page),
        per_page: '40',
    });

    const res = await fetchWithTimeout(`${ATSU_BASE_URL}/collections/manga/documents/search?${params}`);
    if (!res) return { hits: [], found: 0, page };

    let data;
    try {
        data = await res.json();
    } catch {
        return { hits: [], found: 0, page };
    }

    const rawHits = data.hits ?? [];
    const hits = rawHits.map(hit => hit.document ?? hit);
    return { hits, found: data.found ?? hits.length, page, outOf: data.out_of };
}

// ── Static filter definitions sourced directly from Atsumaru ──────────────────

// Genre IDs confirmed from live atsu.moe Typesense network logs
const ATSUMARU_GENRES = [
    { id: 'Ip0',  name: 'Action' },
    { id: 'oU1',  name: 'Adult' },
    { id: 'wY2',  name: 'Adventure' },
    { id: '6n3',  name: 'Avant Garde' },
    { id: '6f4',  name: 'Award Winning' },
    { id: 'Dw5',  name: 'Boys Love' },
    { id: 'pr6',  name: 'Comedy' },
    { id: 'CA7',  name: 'Doujinshi' },
    { id: 'ME8',  name: 'Drama' },
    { id: 'Gf9',  name: 'Ecchi' },
    { id: '2S10', name: 'Erotica' },
    { id: 'yv11', name: 'Fantasy' },
    { id: 'Zw12', name: 'Gender Bender' },
    { id: '8613', name: 'Girls Love' },
    { id: 'jk14', name: 'Gourmet' },
    { id: 'hg15', name: 'Harem' },
    { id: 'd416', name: 'Hentai' },
    { id: 'qW17', name: 'Historical' },
    { id: 'NH18', name: 'Horror' },
    { id: 'Uq19', name: 'Josei' },
    { id: 'XZ20', name: 'Lolicon' },
    { id: 'n421', name: 'Mahou Shoujo' },
    { id: 'XO22', name: 'Martial Arts' },
    { id: 'Gi23', name: 'Mature' },
    { id: 'N824', name: 'Mecha' },
    { id: 'Eh25', name: 'Music' },
    { id: 'Xz26', name: 'Mystery' },
    { id: 'FV27', name: 'Psychological' },
    { id: 'Ex28', name: 'Romance' },
    { id: 'Zu29', name: 'School Life' },
    { id: '3j30', name: 'Sci-Fi' },
    { id: 'pw31', name: 'Seinen' },
    { id: 'rv32', name: 'Shotacon' },
    { id: '4W33', name: 'Shoujo' },
    { id: 'hM34', name: 'Shoujo Ai' },
    { id: 'W935', name: 'Shounen' },
    { id: 'DE36', name: 'Shounen Ai' },
    { id: 'YX37', name: 'Slice of Life' },
    { id: 'ZB38', name: 'Smut' },
    { id: 'NC39', name: 'Sports' },
    { id: 'hT40', name: 'Supernatural' },
    { id: 'WM41', name: 'Suspense' },
    { id: 'e742', name: 'Thriller' },
    { id: 'tn43', name: 'Tragedy' },
    { id: '7D44', name: 'Yaoi' },
    { id: 'po45', name: 'Yuri' },
];

const ATSUMARU_TYPES    = ['Manga', 'Manhwa', 'Manhua', 'OEL'];
const ATSUMARU_STATUSES = ['Ongoing', 'Completed', 'Hiatus', 'Canceled'];

// Generate a range of years from 1950 to current year, newest first
const CURRENT_YEAR = new Date().getFullYear();
const ATSUMARU_YEARS = Array.from(
    { length: CURRENT_YEAR - 1949 },
    (_, i) => String(CURRENT_YEAR - i)
);

export async function getAtsuSearchFilters() {
    // Try the live API first; fall back to the hardcoded Atsumaru values
    try {
        const data = await fetchAtsuJson('/api/search/filters');
        if (data) {
            return {
                genres:   Array.isArray(data.genres)   && data.genres.length   ? data.genres   : ATSUMARU_GENRES,
                types:    Array.isArray(data.types)    && data.types.length    ? data.types    : ATSUMARU_TYPES,
                statuses: Array.isArray(data.statuses) && data.statuses.length ? data.statuses : ATSUMARU_STATUSES,
                years:    Array.isArray(data.years)    && data.years.length    ? data.years    : ATSUMARU_YEARS,
            };
        }
    } catch {
        // Fall through to static defaults
    }

    return {
        genres:   ATSUMARU_GENRES,
        types:    ATSUMARU_TYPES,
        statuses: ATSUMARU_STATUSES,
        years:    ATSUMARU_YEARS,
    };
}

// ─── Chapter Pages ─────────────────────────────────────────────────────────────

/**
 * Fetches real page URLs for a chapter.
 * 1. Calls /api/read/chapter — returns exact URLs including correct extension (.webp or .jpeg)
 * 2. Falls back to probing /static/pages/{chapterId}/0.webp to confirm existence,
 *    then builds the full list (pages are 0-indexed on the server)
 */
export async function getAtsuChapterPages(mangaId, chapterId, pageCount = null) {
    if (!mangaId || !chapterId) return [];

    const base = `${ATSU_BASE_URL}/static/pages/${chapterId}`;

    // ── 1. Always call the API first — it returns exact URLs with correct
    //       file extensions (.webp or .jpeg). pageCount is NOT used to build
    //       URLs because some pages are .jpeg and would 404 if guessed as .webp
    try {
        const res = await fetchWithTimeout(
            `${ATSU_BASE_URL}/api/read/chapter?mangaId=${mangaId}&chapterId=${chapterId}`
        );
        if (res?.ok) {
            const data = await res.json();
            const pages = extractChapterPages(data);
            if (pages.length > 0) return pages;
        }
    } catch { /* fall through */ }

    // ── 2. Fallback: use pageCount to build URLs if API failed.
    //       We try .webp first per page; the Reader's onError handles wrong ext.
    //       This is a last resort only — some pages may show broken if mixed ext.
    if (pageCount && pageCount > 0) {
        return Array.from({ length: pageCount }, (_, i) => `${base}/${i + 1}.webp`);
    }

    // ── 3. Last resort: probe and cap at 200 ──────────────────────────────────
    try {
        const probe1 = await fetchWithTimeout(`${base}/1.webp`);
        if (probe1?.ok) {
            return Array.from({ length: 200 }, (_, i) => `${base}/${i + 1}.webp`);
        }
    } catch { /* fall through */ }

    return [];
}

function extractChapterPages(data) {
    if (!data) return [];

    // Shape: { readChapter: { pages: [{ image, number, width, height }] } }
    const arr = data?.readChapter?.pages ?? [];
    if (arr.length > 0) {
        // Sort by page number to guarantee correct order
        const sorted = [...arr].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
        return sorted
            .map(p => resolveAtsuPageUrl(p.image ?? p.url ?? p.src ?? ''))
            .filter(Boolean);
    }

    // Fallback: flat array
    if (Array.isArray(data)) {
        return data
            .map(p => resolveAtsuPageUrl(typeof p === 'string' ? p : p.url ?? p.image ?? ''))
            .filter(Boolean);
    }

    return [];
}

function resolveAtsuPageUrl(raw) {
    if (!raw) return null;
    if (raw.startsWith('http')) return proxiedImage(raw);
    // Paths like /static/pages/... → proxy through atsu-api
    if (raw.startsWith('/static/')) return `/atsu-api${raw}`;
    return `${ATSU_BASE_URL}/${raw.replace(/^\//, '')}`;
}

// ─── Image / title helpers ────────────────────────────────────────────────────

export function resolveImage(path) {
    if (!path) return '';
    if (typeof path === 'object' && !Array.isArray(path)) {
        const nested =
            path.medium ?? path.large ?? path.small ??
            path.mediumImage ?? path.largeImage ?? path.image ?? path.smallImage ??
            path.url ?? '';
        if (!nested) return '';
        path = nested;
    }
    if (typeof path !== 'string') return '';
    if (path.startsWith('http')) return proxiedImage(path);
    if (path.startsWith('//')) return `https:${path}`;
    // Paths from API start with /static/ — map through proxy
    if (path.startsWith('/static/')) return `/atsu-api${path}`;
    return `/atsu-api/static/${path.replace(/^\//, '')}`;
}

function proxiedImage(url, referer = 'https://atsu.moe/') {
    const q = new URLSearchParams({ url, referer });
    return `${IMAGE_PROXY_BASE}?${q.toString()}`;
}

export function getCover(item) {
    if (!item) return '';
    if (item.poster && typeof item.poster === 'object' && !Array.isArray(item.poster)) {
        const img = item.poster.medium ?? item.poster.large ?? item.poster.small;
        if (img) return resolveImage(img);
    }
    const raw =
        item.posterMedium ?? item.posterSmall ?? item.posterLarge ?? item.poster ??
        item.mediumImage  ?? item.smallImage  ?? item.largeImage  ??
        item.image ?? item.coverImage ?? item.cover ?? item.thumbnail ?? '';
    return resolveImage(raw);
}

export function getBanner(item) {
    if (!item) return '';
    if (item.banner && typeof item.banner === 'object' && !Array.isArray(item.banner)) {
        const img = item.banner.large ?? item.banner.medium ?? item.banner.small;
        if (img) return resolveImage(img);
    }
    const raw = item.bannerLarge ?? item.bannerMedium ?? item.banner ?? item.coverLarge ?? '';
    if (raw && typeof raw === 'string') return resolveImage(raw);
    const id = item.id ?? item.hid ?? item.slug ?? '';
    if (id) return `/atsu-api/static/banners/${id}.jpg`;
    return '';
}

export function getTitle(item) {
    if (!item) return 'Unknown';
    return (
        item.title || item.englishTitle || item.name ||
        item.otherNames?.[0] || item.md_titles?.[0]?.title ||
        item.titles?.en || item.altTitle || item.originalTitle ||
        item.slug || 'Unknown'
    );
}

// ─── Browse modes ─────────────────────────────────────────────────────────────

export const BROWSE_MODES = [
    { key: 'trending',        label: 'Trending',          icon: 'trending' },
    { key: 'topRated',        label: 'Top Rated',         icon: 'topRated' },
    { key: 'popular',         label: 'Popular',           icon: 'popular' },
    { key: 'recentlyUpdated', label: 'Recently Updated',  icon: 'recentlyUpdated' },
    { key: 'recentlyAdded',   label: 'Recently Added',    icon: 'recentlyAdded' },
    { key: 'mostBookmarked',  label: 'Most Bookmarked',   icon: 'mostBookmarked' },
];

// ─── Home sections ────────────────────────────────────────────────────────────

export async function getHomeSection(key) {
    const data = await fetchAtsuJson('/api/home/page');
    const sections = data?.homePage?.sections ?? [];
    const section = sections.find(s => s.key === key);
    return (section?.items ?? []).map(normalizeItem);
}

export async function getTrending()        { return getHomeSection('trending-carousel'); }
export async function getMostBookmarked()  { return getHomeSection('most-bookmarked'); }
export async function getHotUpdates()      { return getHomeSection('hot-updates'); }
export async function getTopRated()        { return getHomeSection('top-rated'); }
export async function getPopular()         { return getHomeSection('popular'); }
export async function getRecentlyAdded()   { return getHomeSection('recently-added'); }
export async function getRecentlyUpdated() { return getHomeSection('recently-updated'); }

// ─── Browse (infinite scroll) ─────────────────────────────────────────────────

export async function getBrowse(mode = 'trending', { page = 0, types = 'Manga,Manwha,Manhua', timeframe = 7 } = {}) {
    // topRated is auth-gated on the infinite API — fall back to the public home page section
    if (mode === 'topRated') {
        try {
            const items = await getTopRated();
            return { items, hasNextPage: false, total: items.length, page: 0 };
        } catch {
            return { items: [], hasNextPage: false, total: 0, page: 0 };
        }
    }

    try {
        const apiPage = page + 1;
        const params = mode === 'mostBookmarked'
            ? { page: apiPage, timeframe, types }
            : { page: apiPage, types };
        const url = `${ATSU_BASE_URL}/api/infinite/${mode}?${new URLSearchParams(params)}`;
        const res = await fetchWithTimeout(url);
        if (!res?.ok) return { items: [], hasNextPage: false, total: 0, page };
        const data = await res.json();
        const section =
            data?.[mode] ??
            data?.items ?? data?.results ??
            data?.trending ?? data?.topRated ?? data?.popular ??
            data?.recentlyUpdated ?? data?.recentlyAdded ?? data?.mostBookmarked ??
            (Array.isArray(data) ? data : null);
        const items = Array.isArray(section?.items)   ? section.items   :
                      Array.isArray(section?.results) ? section.results :
                      Array.isArray(section)           ? section         : [];
        return {
            items: items.map(normalizeItem),
            hasNextPage: section?.hasNextPage ?? (items.length >= 20),
            total: section?.total ?? null,
            page,
        };
    } catch (e) {
        console.error(`[atsu] getBrowse(${mode}) error:`, e);
        return { items: [], hasNextPage: false, total: 0, page };
    }
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export async function getRecommendations(mangaId) {
    if (!mangaId) return [];
    try {
        const data = await fetchAtsuJson(`/api/manga/page?id=${mangaId}`);
        const raw = data?.mangaPage ?? data?.manga ?? data?.comic ?? data ?? {};
        const merged = [...(raw.recommendations ?? []), ...(raw.similarManga ?? raw.similar ?? [])];
        const seen = new Set();
        return merged.map(normalizeItem).filter(item => {
            if (!item?.id || seen.has(item.id)) return false;
            seen.add(item.id); return true;
        });
    } catch { return []; }
}

export async function getSimilarManga(mangaId) {
    return getRecommendations(mangaId);
}

// ─── Full chapter list (fixes first-10 + last-10 truncation) ─────────────────

export async function getChapters(mangaId) {
    if (!mangaId) return [];

    // Step 1: /api/manga/info returns full list for most titles
    try {
        const data = await fetchAtsuJson(`/api/manga/info?mangaId=${mangaId}`);
        const manga = data?.mangaPage ?? data?.manga ?? data?.comic ?? data ?? {};
        if (Array.isArray(manga?.chapters) && manga.chapters.length > 0) {
            const chapters = deduplicateChapters(sortChapters(manga.chapters.map(normalizeChapter)));
            const hasMore = manga.hasMoreChapters === true ||
                (manga.totalChapterCount ?? 0) > chapters.length;
            if (!hasMore) return chapters;
            const full = await _paginateAllChapters(mangaId, chapters);
            return full.length > chapters.length ? full : chapters;
        }
    } catch { /* intentionally swallowed */ }

    // Step 2: paginate /api/manga/chapters directly
    try {
        const chapters = await _paginateAllChapters(mangaId, []);
        if (chapters.length > 0) return chapters;
    } catch { /* intentionally swallowed */ }

    // Step 3: last resort — /api/manga/page (only first 10 + last 10)
    try {
        const data = await fetchAtsuJson(`/api/manga/page?id=${mangaId}`);
        const raw = data?.mangaPage ?? data?.manga ?? data?.comic ?? data ?? {};
        if (Array.isArray(raw?.chapters) && raw.chapters.length > 0) {
            return deduplicateChapters(sortChapters(raw.chapters.map(normalizeChapter)));
        }
    } catch { /* intentionally swallowed */ }

    return [];
}

async function _paginateAllChapters(mangaId, seed = []) {
    const seen = new Set(seed.map(c => c.id));
    const all  = [...seed];
    let page   = 0;
    const MAX_PAGES = 40;

    while (page < MAX_PAGES) {
        let batch = [];
        try {
            const data = await fetchAtsuJson(`/api/manga/chapters?id=${mangaId}&page=${page}`);
            const raw = data?.chapters ?? data?.data ?? data?.items ?? [];
            batch = Array.isArray(raw) ? raw.map(normalizeChapter) : [];
        } catch { /* intentionally swallowed */ }

        if (batch.length === 0) {
            // Try mangaId param variant
            try {
                const data = await fetchAtsuJson(`/api/manga/chapters?mangaId=${mangaId}&page=${page}`);
                const raw = data?.chapters ?? data?.data ?? data?.items ?? [];
                batch = Array.isArray(raw) ? raw.map(normalizeChapter) : [];
            } catch { /* intentionally swallowed */ }
        }

        if (batch.length === 0) break;
        batch.forEach(ch => { if (!seen.has(ch.id)) { seen.add(ch.id); all.push(ch); } });
        if (batch.length < 50) break; // last page
        page++;
    }
    return deduplicateChapters(sortChapters(all));
}

export async function getHasMoreChapters(mangaId) {
    if (!mangaId) return false;
    try {
        const data = await fetchAtsuJson(`/api/manga/info?mangaId=${mangaId}`);
        const manga = data?.mangaPage ?? data?.manga ?? data?.comic ?? data ?? {};
        return manga.hasMoreChapters === true ||
            (manga.totalChapterCount ?? 0) > (manga.chapters?.length ?? 0);
    } catch { return false; }
}

export async function getMoreChapters(mangaId, page = 0) {
    if (!mangaId) return [];
    try {
        const data = await fetchAtsuJson(`/api/manga/chapters?id=${mangaId}&page=${page}`);
        const chapters = data?.chapters ?? data?.data ?? data?.items ?? [];
        if (Array.isArray(chapters) && chapters.length > 0)
            return deduplicateChapters(sortChapters(chapters.map(normalizeChapter)));
    } catch { /* intentionally swallowed */ }
    try {
        const data = await fetchAtsuJson(`/api/manga/chapters?mangaId=${mangaId}&page=${page}`);
        const chapters = data?.chapters ?? data?.data ?? data?.items ?? [];
        if (Array.isArray(chapters) && chapters.length > 0)
            return deduplicateChapters(sortChapters(chapters.map(normalizeChapter)));
    } catch { /* intentionally swallowed */ }
    return [];
}

function normalizeChapter(ch) {
    return {
        ...ch,
        id:        ch.id ?? ch.hid ?? ch.chapterId ?? ch.slug ?? '',
        number:    ch.number ?? ch.chap ?? ch.chapter ?? ch.num ?? '?',
        title:     ch.title ?? null,
        pageCount: ch.pages ?? ch.pageCount ?? ch.page_count ?? null,
        createdAt: ch.createdAt ?? ch.created_at ?? ch.publishedAt ?? ch.date ?? null,
        index:     ch.index ?? null,
        lang:      ch.lang ?? ch.language ?? ch.translatedLanguage ?? null,
        group:     ch.group ?? ch.group_name ?? ch.scanlator ?? ch.uploader ?? null,
    };
}

function sortChapters(chs) {
    return [...chs].sort(
        (a, b) => parseFloat(b.number ?? 0) - parseFloat(a.number ?? 0) // newest first
    );
}

/**
 * Deduplicate chapters by number — the API returns one entry per scanlation
 * group/language for each chapter. Keep the single best entry per number:
 *   1. Prefer English (lang === 'en' or null/undefined — most are English)
 *   2. Then prefer highest page count (more complete)
 *   3. Then prefer most recent upload
 */
function deduplicateChapters(chs) {
    const map = new Map(); // chapterNumber → best chapter so far

    for (const ch of chs) {
        const key = String(ch.number ?? ch.index ?? '?');
        const existing = map.get(key);

        if (!existing) {
            map.set(key, ch);
            continue;
        }

        // Prefer English or unspecified language over non-English
        const chIsEn  = !ch.lang || ch.lang === 'en';
        const exIsEn  = !existing.lang || existing.lang === 'en';
        if (chIsEn && !exIsEn) { map.set(key, ch); continue; }
        if (!chIsEn && exIsEn) continue;

        // Both same language — prefer more recent upload as primary signal
        // (pageCount is frequently absent/zero in API responses, so date wins)
        const chDate = ch.createdAt ? new Date(ch.createdAt).getTime() : 0;
        const exDate = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
        if (chDate > exDate) { map.set(key, ch); continue; }
        if (exDate > chDate) continue;

        // Same date — prefer higher page count as tiebreaker
        const chPages = ch.pageCount ?? 0;
        const exPages = existing.pageCount ?? 0;
        if (chPages > exPages) { map.set(key, ch); }
    }

    return [...map.values()];
}

// ─── ID / URL helpers ─────────────────────────────────────────────────────────

export function extractMangaId(urlOrId) {
    if (!urlOrId) return '';
    const s = String(urlOrId);
    if (!s.includes('/')) return s;
    const m = s.match(/\/manga\/([^/?#]+)/);
    if (m) return m[1];
    const r = s.match(/\/read\/([^/?#]+)/);
    if (r) return r[1];
    return s.split('/').filter(Boolean).pop() ?? '';
}

export function extractChapterId(urlOrId) {
    if (!urlOrId) return '';
    const s = String(urlOrId).split('#')[0];
    if (!s.includes('/')) return s;
    const r = s.match(/\/read\/[^/]+\/([^/?#]+)/);
    if (r) return r[1];
    return s.split('/').filter(Boolean).pop() ?? '';
}

// ─── Label helpers ────────────────────────────────────────────────────────────

export function countryLabel(code) {
    if (!code) return 'Comic';
    const c = String(code).toLowerCase();
    return { jp: 'Manga', kr: 'Manhwa', cn: 'Manhua', hk: 'Manhua',
             manga: 'Manga', manwha: 'Manhwa', manhwa: 'Manhwa', manhua: 'Manhua',
             oel: 'OEL' }[c] ?? code;
}

export function statusLabel(status) {
    if (typeof status === 'string')
        return { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus',
                 cancelled: 'Cancelled' }[status.toLowerCase()] ?? status;
    return { 1: 'Ongoing', 2: 'Completed', 3: 'Cancelled', 4: 'Hiatus' }[status] ?? 'Unknown';
}

export function chapterNum(ch) {
    return ch?.number ?? ch?.chap ?? ch?.chapter ?? ch?.name ?? '?';
}

export function chapterId(ch) {
    const raw = ch?.url ?? ch?.id ?? ch?.hid ?? ch?.chapterId ?? ch?.slug ?? '';
    return extractChapterId(raw) || raw;
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

export function normalizeItem(item) {
    if (!item) return item;
    const id = item.id ?? item.hid ?? item.slug ?? extractMangaId(item.url ?? '') ?? '';
    return {
        ...item,
        id,
        title:           getTitle(item),
        cover:           getCover(item),
        banner:          getBanner(item),
        type:            item.type ?? item.country ?? '',
        countryLabel:    countryLabel(item.type ?? item.country ?? ''),
        url:             item.url ?? (id ? `https://atsu.moe/manga/${id}` : ''),
        genres:          normalizeGenres(item),
        authors:         normalizeAuthors(item),
        description:     item.description ?? item.desc ?? item.synopsis ?? item.summary ?? '',
        rating:          item.avgRating ?? item.rating ?? item.bayesian_rating ?? item.score ?? null,
        year:            item.year ?? item.releaseYear ?? item.startYear ?? null,
        status:          item.status ?? null,
        totalChapters:   item.totalChapterCount ?? item.chapterCount ?? null,
        hasMoreChapters: item.hasMoreChapters ?? false,
        views:           item.view ?? item.views ?? item.viewCount ?? null,
        follows:         item.follow_count ?? item.follows ?? item.followCount ?? null,
        anilistId:       item.anilistId ?? item.anilist_id ?? null,
        malId:           item.malId ?? item.mal_id ?? null,
    };
}

function normalizeGenres(item) {
    if (Array.isArray(item.genres) && typeof item.genres[0] === 'string') return item.genres;
    if (Array.isArray(item.genres) && item.genres[0]?.name) return item.genres.map(g => g.name).filter(Boolean);
    if (Array.isArray(item.md_comic_md_genres))
        return item.md_comic_md_genres.map(g => g.md_genres?.name).filter(Boolean);
    return [];
}

function normalizeAuthors(item) {
    if (typeof item.author === 'string') return item.author;
    if (typeof item.authors === 'string') return item.authors;
    if (Array.isArray(item.authors)) {
        if (item.authors[0]?.name) return item.authors.map(a => a.name).filter(Boolean).join(', ');
        if (typeof item.authors[0] === 'string') return item.authors.join(', ');
    }
    return '';
}
