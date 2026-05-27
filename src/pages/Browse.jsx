import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getBrowse, BROWSE_MODES, getCover } from '../api_routes/mangaAdapter';
import { Loader2, Star, ChevronDown, Check } from 'lucide-react';

// ── Type filter options matching the API exactly ──────────────────────────────
const TYPE_OPTIONS = [
    { label: 'All Types',      value: 'Manga,Manwha,Manhua' },
    { label: 'Manga',          value: 'Manga' },
    { label: 'Manhwa',         value: 'Manwha' },
    { label: 'Manhua',         value: 'Manhua' },
    { label: 'OEL',            value: 'OEL' },
    { label: 'Manga + OEL',    value: 'Manga,OEL' },
    { label: 'Manga + Manhwa', value: 'Manga,Manwha' },
];

// ── Type dropdown ─────────────────────────────────────────────────────────────
function TypeDropdown({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const current = TYPE_OPTIONS.find(o => o.value === value) ?? TYPE_OPTIONS[0];

    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    return (
        <div className="browse-type-dropdown" ref={ref}>
            <button
                className="browse-type-trigger"
                onClick={() => setOpen(v => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span>{current.label}</span>
                <ChevronDown size={14} className={`browse-chevron${open ? ' open' : ''}`} />
            </button>

            {open && (
                <div className="browse-type-menu" role="listbox">
                    {TYPE_OPTIONS.map(opt => {
                        const isActive = opt.value === value;
                        return (
                            <button
                                key={opt.value}
                                className={`browse-type-item${isActive ? ' active' : ''}`}
                                role="option"
                                aria-selected={isActive}
                                onClick={() => { onChange(opt.value); setOpen(false); }}
                            >
                                <span>{opt.label}</span>
                                {isActive && <Check size={14} className="browse-type-check" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Manga card ────────────────────────────────────────────────────────────────
function MangaCard({ manga }) {
    const imgSrc = getCover(manga);
    return (
        <Link to={`/manga/${manga.id}`} className="manga-card">
            {imgSrc
                ? <img src={imgSrc} alt={manga.title} loading="lazy" onError={e => e.currentTarget.style.display = 'none'} />
                : <div className="img-placeholder" />
            }
            {manga.rating && (
                <span className="manga-card-rating"><Star size={10} fill="currentColor" /> {Number(manga.rating).toFixed(1)}</span>
            )}
            {manga.type && <span className="manga-card-type">{manga.type}</span>}
            <h3>{manga.title}</h3>
        </Link>
    );
}

// ── Main Browse page ──────────────────────────────────────────────────────────
export default function Browse() {
    const [mode, setMode]               = useState(BROWSE_MODES[0].key);
    const [types, setTypes]             = useState(TYPE_OPTIONS[0].value);
    const [items, setItems]             = useState([]);
    const [page, setPage]               = useState(0);
    const [hasMore, setHasMore]         = useState(true);
    const [loading, setLoading]         = useState(false);
    const [initialLoad, setInitialLoad] = useState(true);
    const observerRef                   = useRef(null);
    const sentinelRef                   = useRef(null);
    const loadingRef                    = useRef(false); // ref mirror so callbacks never go stale

    const loadPage = useCallback(async (currentMode, currentPage, currentTypes, reset = false) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            const result = await getBrowse(currentMode, { page: currentPage, types: currentTypes });
            setItems(prev => reset ? result.items : [...prev, ...result.items]);
            setHasMore(result.hasNextPage);
            setPage(currentPage + 1);
        } catch (e) {
            console.error('Browse error:', e);
        } finally {
            loadingRef.current = false;
            setLoading(false);
            setInitialLoad(false);
        }
    }, []); // stable — ref handles the guard

    // Reset + reload when mode or types change
    useEffect(() => {
        setItems([]);
        setPage(0);
        setHasMore(true);
        setInitialLoad(true);
        loadPage(mode, 0, types, true);
    }, [mode, types]); // eslint-disable-line react-hooks/exhaustive-deps

    // Infinite scroll
    useEffect(() => {
        if (!sentinelRef.current) return;
        observerRef.current?.disconnect();
        observerRef.current = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && hasMore && !loadingRef.current) {
                loadPage(mode, page, types);
            }
        }, { threshold: 0.1 });
        observerRef.current.observe(sentinelRef.current);
        return () => observerRef.current?.disconnect();
    }, [hasMore, mode, page, types, loadPage]);

    return (
        <div className="browse-page fade-in">
            <div className="browse-header">
                <h1>Browse</h1>
                <div className="browse-controls">
                    <div className="browse-mode-tabs">
                        {BROWSE_MODES.map(m => (
                            <button
                                key={m.key}
                                className={`filter-tab${mode === m.key ? ' active' : ''}`}
                                onClick={() => setMode(m.key)}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <TypeDropdown value={types} onChange={setTypes} />
                </div>
            </div>

            {initialLoad ? (
                <div className="search-loading">
                    <Loader2 className="spin-anim" size={40} />
                    <p>Loading...</p>
                </div>
            ) : items.length === 0 ? (
                <div className="error-state">
                    <p>No results found.</p>
                </div>
            ) : (
                <>
                    <div className="browse-grid">
                        {items.map((manga, i) => <MangaCard key={`${manga.id}-${i}`} manga={manga} />)}
                    </div>

                    <div ref={sentinelRef} style={{ height: 40 }} />

                    {loading && !initialLoad && (
                        <div className="search-loading" style={{ padding: '1rem' }}>
                            <Loader2 className="spin-anim" size={24} />
                        </div>
                    )}

                    {!hasMore && items.length > 0 && (
                        <p style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                            All {items.length} titles loaded
                        </p>
                    )}
                </>
            )}
        </div>
    );
}