import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { getHomePage, getCover, getBanner } from '../api_routes/mangaAdapter';
import { Link, useNavigate } from 'react-router-dom';
import { useTrackerStore } from '../store/trackerStore';
import { Play, TrendingUp, Clock, ChevronLeft, ChevronRight, Eye, Star, History, Shuffle } from 'lucide-react';

const HERO_INTERVAL = 6000;
const HOME_PREFS_KEY = 'atsu-home-prefs-v1';

// ── Hero carousel ─────────────────────────────────────────────────────────────
function HeroSection({ items, onRandomClick }) {
    const [idx, setIdx]       = useState(0);
    const [fading, setFading] = useState(false);
    const timerRef            = useRef(null);

    // Use a ref so the auto-advance interval is created once and never restarts
    const idxRef = useRef(idx);
    useLayoutEffect(() => {
        idxRef.current = idx;
    }, [idx]);

    const goTo = (next) => {
        if (next === idxRef.current) return;
        setFading(true);
        setTimeout(() => { setIdx(next); setFading(false); }, 350);
    };
    // advance reads from ref — never stale
    const advance = (dir) => {
        const next = (idxRef.current + dir + items.length) % items.length;
        goTo(next);
    };

    useEffect(() => {
        // Single interval, never recreated
        timerRef.current = setInterval(() => advance(1), HERO_INTERVAL);
        return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items.length]); // only restart if item count changes

    const hero    = items[idx];
    const imgSrc  = getCover(hero) || getBanner(hero);
    const synopsis = hero.synopsis ?? hero.description ?? '';

    return (
        <section className="hero-section fade-in">
            <div className={`hero-bg${fading ? ' hero-bg--fading' : ''}`}
                style={{ backgroundImage: imgSrc ? `url(${imgSrc})` : undefined }} />
            <div className="hero-overlay" />

            <div className={`hero-content${fading ? ' hero-content--fading' : ''}`}>
                <div className="hero-badge"><TrendingUp size={14} /> Trending</div>
                <h1 className="hero-title">{hero.title}</h1>
                {synopsis && (
                    <p className="hero-synopsis">
                        {synopsis.slice(0, 180)}{synopsis.length > 180 ? '…' : ''}
                    </p>
                )}
                <div className="hero-actions">
                    <Link to={`/manga/${hero.id}`} className="btn btn-read hero-btn-primary">
                        <Play size={18} /> Read Now
                    </Link>
                    <Link to={`/manga/${hero.id}`} className="btn hero-btn-secondary">
                        Learn More
                    </Link>
                    {onRandomClick && (
                        <button className="btn hero-btn-random" onClick={onRandomClick} title="Random manga">
                            <Shuffle size={16} /> Random
                        </button>
                    )}
                </div>
            </div>

            {imgSrc && (
                <img
                    key={hero.id}
                    className={`hero-cover${fading ? ' hero-cover--fading' : ''}`}
                    src={imgSrc}
                    alt={hero.title}
                />
            )}

            {items.length > 1 && (
                <>
                    <button className="hero-arrow hero-arrow--left"  onClick={() => advance(-1)} aria-label="Previous"><ChevronLeft size={24} /></button>
                    <button className="hero-arrow hero-arrow--right" onClick={() => advance(1)}  aria-label="Next"><ChevronRight size={24} /></button>
                    <div className="hero-dots">
                        {items.map((_, i) => (
                            <button key={i} className={`hero-dot${i === idx ? ' hero-dot--active' : ''}`} onClick={() => goTo(i)} aria-label={`Slide ${i + 1}`} />
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}

// ── Recently Visited row ──────────────────────────────────────────────────────
function RecentlyVisitedRow({ history }) {
    if (!history.length) return null;
    return (
        <section className="home-section fade-in">
            <h2><History size={22} /> Recently Visited</h2>
            <div className="carousel">
                {history.map(manga => {
                    const coverUrl = manga.poster
                        ? (typeof manga.poster === 'string'
                            ? (manga.poster.startsWith('http') ? manga.poster : `/atsu-api/static/${manga.poster}`)
                            : `/atsu-api/static/${manga.poster.mediumImage || manga.poster.smallImage || manga.poster.image || ''}`)
                        : null;
                    return (
                        <Link to={`/manga/${manga.id}`} key={manga.id} className="manga-card">
                            {coverUrl
                                ? <img src={coverUrl} alt={manga.title} loading="lazy" onError={e => e.currentTarget.style.display = 'none'} />
                                : <div className="img-placeholder" />
                            }
                            <h3>{manga.title}</h3>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}

// ── Continue Reading row ──────────────────────────────────────────────────────
function ContinueReadingRow({ library, pageProgress, visitHistory }) {
    const historyById = Object.fromEntries((visitHistory ?? []).map(v => [v.id, v]));
    const inProgress = Object.entries(pageProgress ?? {})
        .filter(([, progress]) => progress?.lastChapterId)
        .map(([mangaId, progress]) => {
            const libEntry = library[mangaId];
            const historyEntry = historyById[mangaId];
            return {
                id: mangaId,
                title: libEntry?.title ?? historyEntry?.title ?? 'Unknown',
                poster: libEntry?.poster ?? historyEntry?.poster ?? null,
                lastChapterId: progress.lastChapterId,
                updatedAt: progress.updatedAt ?? 0,
            };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12);

    if (!inProgress.length) return null;

    return (
        <section className="home-section fade-in">
            <h2><Eye size={22} /> Continue Reading</h2>
            <div className="carousel">
                {inProgress.map(manga => {
                    const coverUrl = getCover(manga);
                    return (
                        <Link to={`/read/${manga.id}/${manga.lastChapterId}`} key={manga.id} className="manga-card manga-card--continue">
                            {coverUrl
                                ? <img src={coverUrl} alt={manga.title} loading="lazy" onError={e => e.currentTarget.style.display = 'none'} />
                                : <div className="img-placeholder" />
                            }
                            <div className="manga-card-overlay">
                                <span className="continue-label"><Play size={12} /> Resume</span>
                            </div>
                            <h3>{manga.title}</h3>
                        </Link>
                    );
                })}
            </div>
        </section>
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
            {manga.avgRating && (
                <span className="manga-card-rating"><Star size={10} fill="currentColor" /> {Number(manga.avgRating).toFixed(1)}</span>
            )}
            <h3>{manga.title}</h3>
        </Link>
    );
}

// ── Main Home page ────────────────────────────────────────────────────────────
export default function Home() {
    const [sections, setSections]     = useState([]);
    const [heroItems, setHeroItems]   = useState([]);
    const [allItems, setAllItems]     = useState([]);
    const [sectionsLoading, setSectionsLoading] = useState(true);
    const navigate                              = useNavigate();
    const [showRecent, setShowRecent]           = useState(() => {
        try {
            const p = JSON.parse(localStorage.getItem(HOME_PREFS_KEY) || '{}');
            return p.showRecent === true;
        } catch {
            return false;
        }
    });

    const library      = useTrackerStore(s => s.library);
    const pageProgress = useTrackerStore(s => s.pageProgress);
    const visitHistory = useTrackerStore(s => s.visitHistory);

    useEffect(() => {
        localStorage.setItem(HOME_PREFS_KEY, JSON.stringify({ showRecent: !!showRecent }));
    }, [showRecent]);

    useEffect(() => {
        let isMounted = true;
        getHomePage().then(data => {
            if (!isMounted) return;
            if (data?.sections) {
                const carousels = data.sections.filter(s => s.layout === 'carousel');
                setSections(carousels);
                const candidates = carousels[0]?.items?.slice(0, 8) ?? [];
                if (candidates.length) setHeroItems(candidates);
                const flat = carousels.flatMap(s => s.items ?? []);
                setAllItems(flat);
            }
            setSectionsLoading(false);
        }).catch(() => { if (isMounted) setSectionsLoading(false); });
        return () => { isMounted = false; };
    }, []);

    const handleRandom = () => {
        if (!allItems.length) return;
        const pick = allItems[Math.floor(Math.random() * allItems.length)];
        if (pick?.id) navigate(`/manga/${pick.id}`);
    };

    return (
        <div className="home-page">

            {/* ── Hero (shows once API responds) ── */}
            {heroItems.length > 0
                ? <HeroSection items={heroItems} onRandomClick={allItems.length ? handleRandom : null} />
                : <div className="hero-skeleton" />
            }

            {/* ── Continue Reading — from local store, always instant ── */}
            <ContinueReadingRow library={library} pageProgress={pageProgress} visitHistory={visitHistory} />

            <div className="home-toggle-row">
                <span>Recently Visited</span>
                <button
                    className={`home-toggle-btn${showRecent ? ' active' : ''}`}
                    onClick={() => setShowRecent(v => !v)}
                    aria-pressed={showRecent}
                    title="Toggle recently visited row"
                >
                    {showRecent ? 'On' : 'Off'}
                </button>
            </div>

            {/* ── Recently Visited — optional ── */}
            {showRecent && <RecentlyVisitedRow history={visitHistory.slice(0, 12)} />}

            {/* ── Discovery sections ── */}
            {sectionsLoading ? (
                <div className="home-sections-skeleton">
                    {[1, 2, 3].map(i => (
                        <section key={i} className="home-section">
                            <div className="skeleton-heading" />
                            <div className="carousel">
                                {Array.from({ length: 8 }).map((_, j) => (
                                    <div key={j} className="manga-card skeleton-card" />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            ) : sections.map(section => (
                <section key={section.key} className="home-section fade-in">
                    <h2>
                        {section.key?.includes('recent') || section.key?.includes('update')
                            ? <Clock size={22} />
                            : <TrendingUp size={22} />
                        }
                        {section.title}
                    </h2>
                    <div className="carousel">
                        {section.items.map(manga => <MangaCard key={manga.id} manga={manga} />)}
                    </div>
                </section>
            ))}
        </div>
    );
}
