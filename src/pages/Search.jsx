import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, Loader2, AlertCircle, ChevronDown, Trash2, X, SlidersHorizontal } from 'lucide-react';
import { searchManga, getSearchFilters } from '../api_routes/mangaAdapter';
import { fetchAtsuJson } from '../api_routes/atsuProvider';

/** Try every possible field/shape that Typesense might return for a poster */
function resolveSearchPoster(item) {
    if (!item) return null;

    const STATIC = '/atsu-api/static/';
    const toUrl  = (v) => {
        if (!v || typeof v !== 'string') return null;
        v = v.trim();
        if (!v) return null;
        if (v.startsWith('http')) return v;
        // Search API returns paths like "/static/posters/..." — avoid doubling
        if (v.startsWith('/static/')) return `/atsu-api${v}`;
        return `${STATIC}${v}`;
    };

    if (item.posterMedium) return toUrl(item.posterMedium);
    if (item.posterSmall)  return toUrl(item.posterSmall);
    if (item.poster)       return toUrl(item.poster);
    if (item.image)        return toUrl(item.image);
    if (item.coverImage)   return toUrl(item.coverImage);
    if (item.thumbnail)    return toUrl(item.thumbnail);

    const nested = item.posterObj || item.posterData;
    if (nested) {
        const path = nested.mediumImage || nested.smallImage || nested.image || nested.largeImage;
        return toUrl(path);
    }

    return null;
}

/**
 * Image component that:
 * 1. Uses whatever URL the search result provides
 * 2. If that fails/is missing, fetches the manga detail API for the real poster
 * 3. Shows a skeleton while loading
 */
function MangaCardImage({ manga }) {
    const directUrl = resolveSearchPoster(manga);
    const [src, setSrc]           = useState(directUrl);
    const [status, setStatus]     = useState(directUrl ? 'loading' : 'fetching');
    const fetchedRef              = useRef(false);

    // If no direct URL, fetch from the detail API
    useEffect(() => {
        if (directUrl || fetchedRef.current) return;
        fetchedRef.current = true;
        fetchAtsuJson(`/api/manga/page?id=${manga.id}`).then(data => {
            const page   = data?.mangaPage ?? {};
            const poster = page.poster;
            const STATIC = '/atsu-api/static/';
            const toStaticUrl = (v) => {
                if (!v || typeof v !== 'string') return null;
                if (v.startsWith('http')) return v;
                if (v.startsWith('/static/')) return `/atsu-api${v}`;
                return `${STATIC}${v}`;
            };
            let url = null;
            if (poster) {
                if (typeof poster === 'string') {
                    url = toStaticUrl(poster);
                } else {
                    const path = poster.mediumImage || poster.smallImage || poster.image || poster.largeImage;
                    if (path) url = toStaticUrl(path);
                }
            }
            if (!url && page.image) url = toStaticUrl(page.image);
            setSrc(url);
            setStatus(url ? 'loading' : 'error');
        }).catch(() => setStatus('error'));
    }, [manga.id, directUrl]);

    if (status === 'error' || (!src && status !== 'loading' && status !== 'fetching')) {
        return <div className="img-placeholder card-img-placeholder" />;
    }

    if (status === 'fetching' || !src) {
        return <div className="img-placeholder card-img-placeholder img-skeleton" />;
    }

    return (
        <img
            src={src}
            alt={manga.title}
            loading="lazy"
            className="manga-card-img"
            onLoad={() => setStatus('loaded')}
            onError={() => {
                // If the direct URL failed, try fetching from API
                if (directUrl && !fetchedRef.current) {
                    fetchedRef.current = true;
                    setSrc(null);
                    setStatus('fetching');
                    fetchAtsuJson(`/api/manga/page?id=${manga.id}`).then(data => {
                        const page   = data?.mangaPage ?? {};
                        const poster = page.poster;
                        const STATIC = '/atsu-api/static/';
                        const toStaticUrl = (v) => {
                            if (!v || typeof v !== 'string') return null;
                            if (v.startsWith('http')) return v;
                            if (v.startsWith('/static/')) return `/atsu-api${v}`;
                            return `${STATIC}${v}`;
                        };
                        let url = null;
                        if (poster) {
                            if (typeof poster === 'string') {
                                url = toStaticUrl(poster);
                            } else {
                                const path = poster.mediumImage || poster.smallImage || poster.image || poster.largeImage;
                                if (path) url = toStaticUrl(path);
                            }
                        }
                        if (!url && page.image) url = toStaticUrl(page.image);
                        setSrc(url);
                        setStatus(url ? 'loading' : 'error');
                    }).catch(() => setStatus('error'));
                } else {
                    setStatus('error');
                }
            }}
        />
    );
}

function MultiSelectDropdown({ label, options, selected, onToggle, onClear, getId, getName }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const resolveId = getId ?? (o => o.id ?? o);
    const resolveName = getName ?? (o => o.name ?? o);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectedNames = options.filter(o => selected.includes(resolveId(o))).map(resolveName);
    const displayLabel  = selectedNames.length > 0 ? selectedNames.join(', ') : label;

    return (
        <div className={`filter-dropdown${open ? ' filter-dropdown--open' : ''}`} ref={ref}>
            <button type="button"
                className={`filter-dropdown__trigger${selected.length > 0 ? ' filter-dropdown__trigger--active' : ''}`}
                onClick={() => setOpen(v => !v)}>
                <span className="filter-dropdown__label" title={displayLabel}>{displayLabel}</span>
                <ChevronDown size={16} className="filter-dropdown__chevron" />
            </button>
            {open && (
                <div className="filter-dropdown__menu">
                    {selected.length > 0 && (
                        <button type="button" className="filter-dropdown__clear"
                            onClick={() => { onClear(); setOpen(false); }}>
                            <X size={12} /> Clear
                        </button>
                    )}
                    {options.map(opt => {
                        const id = getId(opt); const name = getName(opt);
                        return (
                            <label key={id} className="filter-dropdown__item">
                                <input type="checkbox" checked={selected.includes(id)} onChange={() => onToggle(id)} />
                                <span>{name}</span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// 3-state genre picker: neutral → include (✓) → exclude (✗) → neutral
function GenreDropdown({ label, options, includeGenres, excludeGenres, onToggle, onClear }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const activeCount = includeGenres.length + excludeGenres.length;
    const parts = [];
    if (includeGenres.length) parts.push(`+${includeGenres.length}`);
    if (excludeGenres.length) parts.push(`-${excludeGenres.length}`);
    const displayLabel = parts.length ? `Genres (${parts.join(' ')})` : label;

    return (
        <div className={`filter-dropdown${open ? ' filter-dropdown--open' : ''}`} ref={ref}>
            <button type="button"
                className={`filter-dropdown__trigger${activeCount > 0 ? ' filter-dropdown__trigger--active' : ''}`}
                onClick={() => setOpen(v => !v)}>
                <span className="filter-dropdown__label">{displayLabel}</span>
                <ChevronDown size={16} className="filter-dropdown__chevron" />
            </button>
            {open && (
                <div className="filter-dropdown__menu genre-dropdown__menu">
                    <div className="genre-dropdown__hint">Click once to include ✓, twice to exclude ✗</div>
                    {activeCount > 0 && (
                        <button type="button" className="filter-dropdown__clear" onClick={() => { onClear(); }}>
                            <X size={12} /> Clear all genres
                        </button>
                    )}
                    {options.map(opt => {
                        const id   = opt.id   ?? opt;
                        const name = opt.name ?? opt;
                        const isIncluded = includeGenres.includes(id);
                        const isExcluded = excludeGenres.includes(id);
                        return (
                            <button
                                key={id}
                                type="button"
                                className={`filter-dropdown__item genre-item${isIncluded ? ' genre-item--include' : isExcluded ? ' genre-item--exclude' : ''}`}
                                onClick={() => onToggle(id)}
                            >
                                <span className="genre-item__icon">
                                    {isIncluded ? '✓' : isExcluded ? '✗' : '○'}
                                </span>
                                <span>{name}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function SingleSelectDropdown({ label, options, value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className={`filter-dropdown${open ? ' filter-dropdown--open' : ''}`} ref={ref}>
            <button type="button"
                className={`filter-dropdown__trigger${value ? ' filter-dropdown__trigger--active' : ''}`}
                onClick={() => setOpen(v => !v)}>
                <span className="filter-dropdown__label">{value || label}</span>
                <ChevronDown size={16} className="filter-dropdown__chevron" />
            </button>
            {open && (
                <div className="filter-dropdown__menu">
                    <label className="filter-dropdown__item">
                        <input type="radio" name={label} checked={!value} onChange={() => { onChange(''); setOpen(false); }} />
                        <span>Any</span>
                    </label>
                    {options.map(opt => (
                        <label key={opt} className="filter-dropdown__item">
                            <input type="radio" name={label} checked={value === opt} onChange={() => { onChange(opt); setOpen(false); }} />
                            <span>{opt}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

const MIN_SCORE_OPTIONS = [
    { key: '', label: 'Any Score' },
    { key: '9', label: '9+ (Masterpiece)' },
    { key: '8', label: '8+ (Great)' },
    { key: '7', label: '7+ (Good)' },
    { key: '6', label: '6+ (Fine)' },
];

function matchesTypeFilter(item, selectedTypes) {
    if (!selectedTypes?.length) return true;
    const raw = String(item?.type ?? '').toLowerCase();
    return selectedTypes.some((t) => {
        const type = String(t).toLowerCase();
        if (type === 'manhwa' || type === 'manwha') {
            return raw === 'manhwa' || raw === 'manwha' || raw === 'kr';
        }
        if (type === 'manhua') {
            return raw === 'manhua' || raw === 'cn' || raw === 'hk';
        }
        if (type === 'manga') {
            return raw === 'manga' || raw === 'jp';
        }
        return raw === type;
    });
}

function matchesStatusFilter(item, selectedStatuses) {
    if (!selectedStatuses?.length) return true;
    const status = String(item?.status ?? '').toLowerCase();
    return selectedStatuses.some((s) => {
        const target = String(s).toLowerCase();
        if (target === 'hiatus') return status.includes('hiatus');
        if (target === 'ongoing') return status.includes('ongoing');
        if (target === 'completed') return status.includes('completed') || status.includes('complete');
        return status.includes(target);
    });
}

function applyClientFilters(items, {
    selectedTypes,
    selectedStatuses,
    selectedYear,
    minScore,
}) {
    const min = minScore ? Number(minScore) : null;
    return (items ?? []).filter((item) => {
        if (!matchesTypeFilter(item, selectedTypes)) return false;
        if (!matchesStatusFilter(item, selectedStatuses)) return false;
        if (selectedYear && String(item?.year ?? '') !== String(selectedYear)) return false;
        if (min !== null) {
            const score = Number(item?.avgRating ?? item?.rating ?? item?.score ?? 0);
            if (!Number.isFinite(score) || score < min) return false;
        }
        return true;
    });
}

export default function Search() {
    const [searchParams, setSearchParams] = useSearchParams();
    const query = searchParams.get('q') || '';

    const [results, setResults]         = useState([]);
    const [totalFound, setTotalFound]   = useState(0);
    const [loading, setLoading]         = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [error, setError]             = useState(null);

    const [availableFilters, setAvailableFilters] = useState({ genres: [], types: [], statuses: [], years: [] });
    const [includeGenres, setIncludeGenres] = useState([]);
    const [excludeGenres, setExcludeGenres] = useState([]);
    const [selectedTypes,    setSelectedTypes]    = useState([]);
    const [selectedStatuses, setSelectedStatuses] = useState([]);
    const [selectedYear,     setSelectedYear]     = useState('');
    const [minScore,         setMinScore]         = useState('');
    const [minChapters,      setMinChapters]      = useState('');
    const [officialOnly,     setOfficialOnly]     = useState(false);
    const [showAdult,        setShowAdult]        = useState(false);
    const [extraOpen,        setExtraOpen]        = useState(false);
    const extraRef = useRef(null);

    useEffect(() => {
        const handler = (e) => { if (extraRef.current && !extraRef.current.contains(e.target)) setExtraOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        getSearchFilters().then(setAvailableFilters).catch(console.error);
    }, []);

    const activeFilterCount =
        includeGenres.length + excludeGenres.length + selectedTypes.length + selectedStatuses.length +
        (selectedYear ? 1 : 0) + (minScore ? 1 : 0) + (minChapters ? 1 : 0) + (officialOnly ? 1 : 0) + (showAdult ? 1 : 0);

    const extraActiveCount =
        (selectedYear ? 1 : 0) + (minScore ? 1 : 0) + (minChapters ? 1 : 0) + (officialOnly ? 1 : 0) + (showAdult ? 1 : 0);

    const performSearch = async (searchQuery, filters) => {
        if (!searchQuery.trim()) return;
        setLoading(true); setHasSearched(true); setError(null);
        try {
            const { hits, found } = await searchManga(searchQuery, filters);
            const rawResults = Array.isArray(hits) ? hits : [];
            const filtered = applyClientFilters(rawResults, {
                selectedTypes,
                selectedStatuses,
                selectedYear,
                minScore,
            });
            setResults(filtered);
            setTotalFound(filtered.length > 0 ? filtered.length : (found ?? 0));
        } catch (err) {
            console.error('Search failed:', err);
            setError('Search failed. Please check your connection and try again.');
            setResults([]); setTotalFound(0);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (query) {
            performSearch(query, {
                includeGenreIds: includeGenres, excludeGenreIds: excludeGenres, types: selectedTypes, statuses: selectedStatuses,
                year: selectedYear, minChapters, officialOnly, showAdult,
            });
        } else {
            setResults([]); setTotalFound(0); setHasSearched(false); setError(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, includeGenres, excludeGenres, selectedTypes, selectedStatuses, selectedYear, minScore, minChapters, officialOnly, showAdult]);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        const newQuery = (new FormData(e.target).get('query') || '').trim();
        if (newQuery) setSearchParams({ q: newQuery });
    };

    const clearFilters = () => {
        setIncludeGenres([]); setExcludeGenres([]); setSelectedTypes([]); setSelectedStatuses([]);
        setSelectedYear(''); setMinScore(''); setMinChapters(''); setOfficialOnly(false); setShowAdult(false);
    };

    const toggle = (setter) => (id) => setter(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    return (
        <div className="search-page fade-in">
            <div className="search-header">
                <h1>Discover New Stories</h1>
                <form className="search-bar-form" onSubmit={handleSearchSubmit}>
                    <SearchIcon className="search-icon" size={20} />
                    <input type="text" name="query" className="search-input"
                        placeholder="Search for manga, manhwa, titles..." defaultValue={query} autoFocus />
                    <button type="submit" className="btn btn-search">Search</button>
                </form>
            </div>

            <div className="filter-bar">
                <div className="filter-bar__left">
                    <div className="filter-bar__group">
                        <span className="filter-bar__label">Genres</span>
                        <GenreDropdown label="Genres" options={availableFilters.genres}
                            includeGenres={includeGenres}
                            excludeGenres={excludeGenres}
                            onToggle={(id) => {
                                if (excludeGenres.includes(id)) {
                                    setExcludeGenres(v => v.filter(g => g !== id));
                                } else if (includeGenres.includes(id)) {
                                    setIncludeGenres(v => v.filter(g => g !== id));
                                    setExcludeGenres(v => [...v, id]);
                                } else {
                                    setIncludeGenres(v => [...v, id]);
                                }
                            }}
                            onClear={() => { setIncludeGenres([]); setExcludeGenres([]); }} />
                    </div>
                    <div className="filter-bar__group">
                        <span className="filter-bar__label">Manga Type</span>
                        <MultiSelectDropdown label="Types" options={availableFilters.types}
                            selected={selectedTypes} onToggle={toggle(setSelectedTypes)} onClear={() => setSelectedTypes([])}
                            getId={o => o} getName={o => o} />
                    </div>
                    <div className="filter-bar__group">
                        <span className="filter-bar__label">Publishing Status</span>
                        <MultiSelectDropdown label="Statuses" options={availableFilters.statuses}
                            selected={selectedStatuses} onToggle={toggle(setSelectedStatuses)} onClear={() => setSelectedStatuses([])}
                            getId={o => o} getName={o => o} />
                    </div>
                    <div className="filter-bar__group" ref={extraRef}>
                        <span className="filter-bar__label">More</span>
                        <div className={`filter-dropdown${extraOpen ? ' filter-dropdown--open' : ''}`}>
                            <button type="button"
                                className={`filter-dropdown__trigger${extraActiveCount > 0 ? ' filter-dropdown__trigger--active' : ''}`}
                                onClick={() => setExtraOpen(v => !v)}>
                                <SlidersHorizontal size={14} />
                                <span className="filter-dropdown__label">
                                    {extraActiveCount > 0 ? `${extraActiveCount} active` : 'Filters'}
                                </span>
                                <ChevronDown size={16} className="filter-dropdown__chevron" />
                            </button>
                            {extraOpen && (
                                <div className="filter-dropdown__menu extra-filters-menu">
                                    <div className="extra-filter-row">
                                        <label className="extra-filter-label">Year</label>
                                        <SingleSelectDropdown label="Years" options={availableFilters.years}
                                            value={selectedYear} onChange={setSelectedYear} />
                                    </div>
                                    <div className="extra-filter-row">
                                        <label className="extra-filter-label">Minimum Chapters</label>
                                        <input type="number" className="extra-filter-input" min="0" placeholder="0"
                                            value={minChapters} onChange={e => setMinChapters(e.target.value)} />
                                    </div>
                                    <div className="extra-filter-row">
                                        <label className="extra-filter-label">Minimum Score</label>
                                        <SingleSelectDropdown
                                            label="Score"
                                            options={MIN_SCORE_OPTIONS.map(o => o.label)}
                                            value={MIN_SCORE_OPTIONS.find(o => o.key === minScore)?.label || ''}
                                            onChange={(label) => {
                                                const next = MIN_SCORE_OPTIONS.find(o => o.label === label)?.key ?? '';
                                                setMinScore(next);
                                            }}
                                        />
                                    </div>
                                    <label className="filter-dropdown__item extra-toggle">
                                        <input type="checkbox" checked={officialOnly} onChange={e => setOfficialOnly(e.target.checked)} />
                                        <span>Only Official Translations</span>
                                    </label>
                                    <label className="filter-dropdown__item extra-toggle">
                                        <input type="checkbox" checked={showAdult} onChange={e => setShowAdult(e.target.checked)} />
                                        <span>Show Adult Content</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {activeFilterCount > 0 && (
                    <button className="btn-clear-filters" onClick={clearFilters}>
                        <Trash2 size={14} /> Clear filters
                    </button>
                )}
            </div>

            {loading && (
                <div className="search-loading">
                    <Loader2 className="spin-anim" size={40} />
                    <p>Searching...</p>
                </div>
            )}

            {!loading && error && (
                <div className="error-state"><AlertCircle size={32} /><p>{error}</p></div>
            )}

            {!loading && !error && hasSearched && results.length === 0 && (
                <div className="empty-state">
                    No results found for &ldquo;{query}&rdquo;
                    {activeFilterCount > 0 && ' with the selected filters'}.{' '}
                    {activeFilterCount > 0
                        ? <button className="btn-text" onClick={clearFilters}>Clear filters</button>
                        : 'Try a different keyword.'}
                </div>
            )}

            {!loading && results.length > 0 && (
                <div className="search-results">
                    <h2>
                        {(totalFound > 0 ? totalFound : results.length).toLocaleString()} results
                        {' '}for &ldquo;{query}&rdquo;
                        {activeFilterCount > 0 && <span className="results-filter-note"> (filtered)</span>}
                    </h2>
                    <div className="results-grid">
                        {results.map((manga) => {
                            return (
                                <Link to={`/manga/${manga.id}`} key={manga.id} className="manga-card">
                                    <MangaCardImage manga={manga} />
                                    <div className="manga-card__info">
                                        <h3>{manga.englishTitle || manga.title}</h3>
                                        {manga.type   && <span className="manga-card__tag">{manga.type}</span>}
                                        {manga.status && <span className="manga-card__tag manga-card__tag--status">{manga.status}</span>}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
