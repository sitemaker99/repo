import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMangaDetails, getAnilistExtended, getRecommendations, getChapters, getCover, getBanner, getChapterPages } from '../api_routes/mangaAdapter';
import { useTrackerStore, LIBRARY_STATUSES } from '../store/trackerStore';
import { useDownloadStore } from '../store/downloadStore';
import { useNotificationStore } from '../store/notificationStore';
import { toast } from '../store/toastStore';
import { MangaDetailsSkeleton, RecsSkeleton } from '../components/Skeletons';
import VirtualList from '../components/VirtualList';
import CommentsSection from '../components/reader/CommentsSection';
import {
    BookmarkPlus, BookmarkMinus, CheckCircle, Eye, Star, Users,
    ChevronDown, CheckCheck, RotateCcw, Bell, Loader2, BookOpen,
    Search, ArrowUp, ArrowDown, Play, MessageCircle, Download, CloudOff, CloudFog
} from 'lucide-react';

function StatusDropdown({ current, onChange, onRemove }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const meta = LIBRARY_STATUSES.find(s => s.value === current);
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);
    return (
        <div className="status-dropdown" ref={ref}>
            <button className="btn status-dropdown__trigger" style={{ borderColor: meta?.color, color: meta?.color }} onClick={() => setOpen(v => !v)}>
                <span className="status-dot" style={{ background: meta?.color }} />
                {meta?.label ?? 'Bookmarked'}
                <ChevronDown size={14} />
            </button>
            {open && (
                <div className="status-dropdown__menu">
                    {LIBRARY_STATUSES.map(s => (
                        <button key={s.value} className={`status-dropdown__item${current === s.value ? ' active' : ''}`} onClick={() => { onChange(s.value); setOpen(false); }}>
                            <span className="status-dot" style={{ background: s.color }} />{s.label}
                        </button>
                    ))}
                    <div className="status-dropdown__divider" />
                    <button className="status-dropdown__item status-dropdown__item--remove" onClick={() => { onRemove(); setOpen(false); }}>
                        <BookmarkMinus size={14} /> Remove
                    </button>
                </div>
            )}
        </div>
    );
}

function RecommendationsSection({ recs, recsLoading }) {
    if (recsLoading) {
        return (
            <div className="recommendations-section">
                <h3><BookOpen size={18} /> You Might Also Like</h3>
                <RecsSkeleton count={6} />
            </div>
        );
    }
    if (!recs.length) return null;
    return (
        <div className="recommendations-section">
            <h3><BookOpen size={18} /> You Might Also Like</h3>
            <div className="recs-grid">
                {recs.slice(0, 12).map(rec => {
                    const cover = getCover(rec) || rec.cover || null;
                    return (
                        <Link key={rec.id} to={`/manga/${rec.id}`} className="rec-card">
                            <div className="rec-card__img">
                                {cover
                                    ? <img src={cover} alt={rec.title} loading="lazy"
                                        onError={e => {
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.nextElementSibling.style.display = 'flex';
                                        }} />
                                    : null
                                }
                                <div className="rec-card__placeholder" style={{ display: cover ? 'none' : 'flex' }}>
                                    <BookOpen size={24} />
                                </div>
                            </div>
                            <span className="rec-card__title">{rec.title}</span>
                            {rec.type && <span className="rec-card__type">{rec.type}</span>}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

// Chapter row height must match CSS .chapter-row padding for virtual list accuracy
const CHAPTER_ROW_H = 58;

function ChaptersSection({ chapters, chaptersLoading, mangaId, mangaTitle, mangaPoster, readChapters, newChapIds, onToggleRead, onMarkAllRead, onMarkAllUnread }) {
    const [search, setSearch]   = useState('');
    const [sortAsc, setSortAsc] = useState(false);
    const pageProgress          = useTrackerStore(s => s.pageProgress);
    
    const downloads = useDownloadStore(s => s.downloads);
    const downloadChapter = useDownloadStore(s => s.downloadChapter);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        let list = [...chapters].sort((a, b) =>
            sortAsc
                ? (Number(a.number) || 0) - (Number(b.number) || 0)
                : (Number(b.number) || 0) - (Number(a.number) || 0)
        );
        if (q) list = list.filter(ch =>
            String(ch.number ?? ch.index ?? '').includes(q) ||
            (ch.title ?? '').toLowerCase().includes(q)
        );
        return list;
    }, [chapters, search, sortAsc]);

    const useVirtual = filtered.length > 80;

    const handleDownload = async (chapter) => {
        try {
            toast.info(`Fetching pages for Ch. ${chapter.number}...`);
            const pages = await getChapterPages(mangaId, chapter.id);
            if (!pages || !pages.length) throw new Error("No pages found");
            const urls = pages.map(p => p.url || p.img);
            toast.success(`Starting download for Ch. ${chapter.number}`);
            downloadChapter(mangaId, mangaTitle, mangaPoster, chapter.id, chapter.title || `Chapter ${chapter.number}`, urls);
        } catch (e) {
            toast.error(`Failed to download Ch. ${chapter.number}`);
            console.error(e);
        }
    };

    const renderChapterRow = (chapter) => {
        const isRead    = readChapters.includes(chapter.id);
        const isNew     = newChapIds.includes(chapter.id);
        const savedPage = pageProgress[mangaId]?.[chapter.id]?.page;
        const chLabel   = chapter.title && chapter.title !== `Chapter ${chapter.number}` ? chapter.title : null;
        
        const dlState = downloads[mangaId]?.chapters[chapter.id]?.status;

        return (
            <div className={`chapter-row${isRead ? ' read' : ' unread'}${isNew ? ' chapter-row--new' : ''}`}>
                <div className="chapter-info">
                    {isNew && <span className="chapter-new-badge">NEW</span>}
                    <span className="chapter-number">Ch. {chapter.number ?? chapter.index}</span>
                    {chLabel && <span className="chapter-title">{chLabel}</span>}
                    {savedPage > 0 && !isRead && <span className="chapter-progress-hint">p.{savedPage + 1}</span>}
                </div>
                <div className="chapter-actions">
                    {dlState === 'complete' ? (
                        <button className="icon-btn icon-btn--dl-complete" title="Downloaded" disabled>
                            <CheckCircle size={16} />
                        </button>
                    ) : dlState === 'downloading' ? (
                        <button className="icon-btn icon-btn--dl-progress" title="Downloading..." disabled>
                            <Loader2 size={16} className="spin-anim" />
                        </button>
                    ) : (
                        <button onClick={() => handleDownload(chapter)} className="icon-btn" title="Download for offline reading">
                            <Download size={16} />
                        </button>
                    )}
                    <button onClick={() => onToggleRead(chapter.id, chapter.title)} className={`icon-btn${isRead ? ' icon-btn--read' : ''}`} title={isRead ? 'Mark as unread' : 'Mark as read'}>
                        <CheckCircle size={20} />
                    </button>
                    <Link to={`/read/${mangaId}/${chapter.id}`} className="btn-read-sm">
                        <Eye size={14} /> {savedPage > 0 && !isRead ? 'Resume' : 'Read'}
                    </Link>
                </div>
            </div>
        );
    };

    return (
        <div className="chapters-section">
            <div className="chapters-header">
                <h3>
                    Chapters{' '}
                    <span className="chapter-count">
                        ({chaptersLoading
                            ? <Loader2 size={14} className="spin-anim" />
                            : search ? `${filtered.length}/${chapters.length}` : chapters.length})
                    </span>
                </h3>
                <div className="chapters-bulk-actions">
                    <button className="btn-sm" onClick={onMarkAllRead}><CheckCheck size={15} /> Mark all read</button>
                    <button className="btn-sm btn-sm--ghost" onClick={onMarkAllUnread}><RotateCcw size={14} /> Unread all</button>
                </div>
            </div>

            <div className="chapters-toolbar">
                <div className="chapters-search-wrap">
                    <Search size={14} className="chapters-search-icon" />
                    <input
                        type="text"
                        className="chapters-search"
                        placeholder="Search by chapter number or title…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="chapters-search-clear" onClick={() => setSearch('')}>✕</button>
                    )}
                </div>
                <button
                    className={`chapters-sort-btn${sortAsc ? ' active' : ''}`}
                    onClick={() => setSortAsc(v => !v)}
                    title={sortAsc ? 'Oldest first' : 'Newest first'}
                >
                    {sortAsc ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                    {sortAsc ? 'Oldest first' : 'Newest first'}
                </button>
            </div>

            {filtered.length === 0 && search && (
                <div className="chapters-empty">
                    <Search size={24} />
                    <span>No chapters match "{search}"</span>
                </div>
            )}

            <div className="chapters-list">
                {useVirtual ? (
                    <VirtualList
                        items={filtered}
                        itemHeight={CHAPTER_ROW_H}
                        renderItem={(chapter) => renderChapterRow(chapter)}
                        getKey={(chapter) => chapter.id}
                        style={{ maxHeight: '520px' }}
                    />
                ) : (
                    filtered.map(chapter => (
                        <div key={chapter.id}>
                            {renderChapterRow(chapter)}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default function MangaDetails() {
    const { id } = useParams();

    // All state declared unconditionally at the top — no conditional hooks
    const [manga, setManga]                     = useState(null);
    const [loading, setLoading]                 = useState(true);
    const [allChapters, setAllChapters]         = useState(null);
    const [chaptersLoading, setChaptersLoading] = useState(false);
    const [recs, setRecs]                       = useState([]);
    const [recsLoading, setRecsLoading]         = useState(false);

    const library      = useTrackerStore(s => s.library);
    const readChapters = useTrackerStore(s => s.readChapters[id]) || [];
    const {
        addToLibrary, removeFromLibrary, updateLibraryStatus,
        markChapterRead, markChapterUnread, markAllChaptersRead, markAllChaptersUnread,
        syncKnownChapters, getNewChapterIds, dismissNotifications, getLastPosition, recordVisit,
        updateLibraryChapterCount,
    } = useTrackerStore();

    // Also clear bell notifications when user dismisses new-chapter banners
    const dismissMangaNotifs = useNotificationStore(s => s.dismissManga);

    useEffect(() => {
        let isMounted = true;
        async function load() {
            setLoading(true);
            setAllChapters(null);
            setRecs([]);
            setRecsLoading(true);

            const data = await getMangaDetails(id, true);
            if (!isMounted) return;

            setManga(data);
            setLoading(false);

            if (data) recordVisit(id, data);
            if (data?.chapters?.length) syncKnownChapters(id, data.chapters.map(c => c.id));

            if (data?.anilistId) {
                const extra = await getAnilistExtended(data.anilistId);
                if (extra && isMounted) setManga(prev => ({ ...prev, extendedDetails: extra }));
            }

            // Fetch recs separately so chapters don't wait for them
            getRecommendations(id)
                .then(recData => {
                    if (isMounted) {
                        setRecs(recData?.length ? recData : []);
                        setRecsLoading(false);
                    }
                })
                .catch(() => { if (isMounted) setRecsLoading(false); });
        }
        load();
        return () => { isMounted = false; };
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!manga) return;
        const base    = manga.chapters ?? [];
        const hasMore = manga.hasMoreChapters || (manga.totalChapterCount && manga.totalChapterCount > base.length);
        if (hasMore) {
            Promise.resolve().then(() => setChaptersLoading(true));
            getChapters(id).then(chs => {
                const resolved = chs.length > 0 ? chs : base;
                setAllChapters(resolved);
                setChaptersLoading(false);
                updateLibraryChapterCount(id, resolved.length);
            });
        } else {
            Promise.resolve().then(() => {
                setAllChapters(base);
                updateLibraryChapterCount(id, base.length);
            });
        }
    }, [manga, id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Show skeleton while loading
    if (loading) return <MangaDetailsSkeleton />;
    if (!manga)  return <div className="error-state">Manga not found.</div>;

    const chapters     = allChapters ?? manga.chapters ?? [];
    const inLibrary    = !!library[id];
    const libEntry     = library[id];
    const allIds       = chapters.map(c => c.id);
    const newChapIds   = inLibrary ? getNewChapterIds(id, allIds) : [];
    const lastPosition = getLastPosition(id);
    const readCount    = Math.min(readChapters.length, chapters.length);
    const progressPct  = chapters.length > 0 ? Math.round((readCount / chapters.length) * 100) : 0;
    const coverImg     = getCover(manga);
    const bannerImg    = getBanner(manga);

    const genres = Array.isArray(manga.genres)
        ? manga.genres.map(g => (typeof g === 'string' ? g : g?.name)).filter(Boolean) : [];
    const authors = typeof manga.authors === 'string' ? manga.authors
        : Array.isArray(manga.authors)
            ? manga.authors.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ') : '';

    const firstChapter  = chapters[chapters.length - 1];
    const latestChapter = chapters[0];

    const handleAddToLibrary  = () => { addToLibrary(id, manga, 'reading'); if (manga?.chapters?.length) syncKnownChapters(id, manga.chapters.map(c => c.id)); toast.success(`Added "${manga.title}" to library`); };
    const handleRemove        = () => { removeFromLibrary(id); toast.info(`Removed "${manga.title}" from library`); };
    const handleStatusChange  = (status) => { updateLibraryStatus(id, status); toast.success(`Status set to ${LIBRARY_STATUSES.find(s => s.value === status)?.label}`); };
    const handleToggleRead    = (chapterId, chapterTitle) => {
        if (readChapters.includes(chapterId)) { markChapterUnread(id, chapterId); toast.info(`Marked unread: ${chapterTitle}`); }
        else { markChapterRead(id, chapterId); toast.success(`Marked read: ${chapterTitle}`); }
    };
    const handleMarkAllRead   = () => { markAllChaptersRead(id, allIds); dismissNotifications(id, allIds); dismissMangaNotifs(id); toast.success(`All ${allIds.length} chapters marked as read`); };
    const handleMarkAllUnread = () => { markAllChaptersUnread(id); toast.info('All chapters marked as unread'); };

    return (
        <div className="manga-details fade-in">
            <div className="banner" style={{ backgroundImage: bannerImg ? `url(${bannerImg})` : undefined }}>
                <div className="banner-overlay" />
            </div>

            <div className="content-wrapper">
                <div className="header-info">
                    {coverImg
                        ? <img src={coverImg} alt={manga.title} className="cover-image" onError={e => e.currentTarget.style.display = 'none'} />
                        : <div className="cover-image img-placeholder" />
                    }
                    <div className="meta">
                        <h1>{manga.title}</h1>
                        {manga.englishTitle && manga.englishTitle !== manga.title && <p className="alt-title">{manga.englishTitle}</p>}
                        {genres.length > 0 && (
                            <div className="tags">{genres.map(g => <span key={g} className="tag">{g}</span>)}</div>
                        )}
                        <div className="stats">
                            {manga.avgRating && <span className="stat"><Star size={16} color="#FFD700" fill="#FFD700" /> {Number(manga.avgRating).toFixed(1)}</span>}
                            {manga.views     && <span className="stat"><Eye size={16} /> {manga.views.toLocaleString()}</span>}
                            {authors         && <span className="stat"><Users size={16} /> {authors}</span>}
                            {manga.year      && <span className="stat">{manga.year}</span>}
                            {manga.status    && <span className="stat">{manga.status}</span>}
                            {manga.type      && <span className="stat">{manga.type}</span>}
                        </div>
                        {manga.extendedDetails && (
                            <div className="anilist-meta">
                                <span>⭐ {manga.extendedDetails.averageScore}%</span>
                                <span>Status: {manga.extendedDetails.status}</span>
                            </div>
                        )}
                        <p className="synopsis">{manga.synopsis ?? manga.description}</p>
                        <div className="actions">
                            {inLibrary
                                ? <StatusDropdown current={libEntry.status} onChange={handleStatusChange} onRemove={handleRemove} />
                                : <button onClick={handleAddToLibrary} className="btn"><BookmarkPlus size={18} /> Add to Library</button>
                            }
                            {chapters.length > 0 && (
                                <>
                                    {lastPosition ? (
                                        <Link to={`/read/${id}/${lastPosition.chapterId}`} className="btn btn-read">
                                            <Eye size={18} /> Continue — Ch. {chapters.find(c => c.id === lastPosition.chapterId)?.number ?? '?'} p.{lastPosition.page + 1}
                                        </Link>
                                    ) : firstChapter && (
                                        <Link to={`/read/${id}/${firstChapter.id}`} className="btn btn-read">
                                            <Play size={18} /> Start Reading
                                        </Link>
                                    )}
                                    {latestChapter && (
                                        <Link to={`/read/${id}/${latestChapter.id}`} className="btn">
                                            Latest Ch. {latestChapter.number}
                                        </Link>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {inLibrary && (
                    <div className="progress-section">
                        <h3>Reading Progress</h3>
                        <div className="progress-bar-container">
                            <div className="progress-bar" style={{ width: `${progressPct}%` }} />
                        </div>
                        <p>{readCount} / {chapters.length} chapters read ({progressPct}%)</p>
                        {lastPosition && (() => {
                            const lastCh = chapters.find(c => c.id === lastPosition.chapterId);
                            return <p className="resume-info">Last read: <strong>{lastCh?.title || `Ch. ${lastCh?.number}`}</strong> · Page {lastPosition.page + 1}</p>;
                        })()}
                        {newChapIds.length > 0 && (
                            <div className="new-chapters-banner">
                                <Bell size={16} />
                                <span>{newChapIds.length} new chapter{newChapIds.length > 1 ? 's' : ''} since your last visit</span>
                                <button className="btn-text" onClick={() => { dismissNotifications(id, allIds); dismissMangaNotifs(id); }}>Dismiss</button>
                            </div>
                        )}
                    </div>
                )}

                <ChaptersSection
                    chapters={chapters}
                    chaptersLoading={chaptersLoading}
                    mangaId={id}
                    mangaTitle={manga.title}
                    mangaPoster={coverImg}
                    readChapters={readChapters}
                    newChapIds={newChapIds}
                    onToggleRead={handleToggleRead}
                    onMarkAllRead={handleMarkAllRead}
                    onMarkAllUnread={handleMarkAllUnread}
                />

                <RecommendationsSection recs={recs} recsLoading={recsLoading} />

                <div className="general-discussion-section" style={{ marginTop: '40px', backgroundColor: 'var(--bg-card)', padding: '20px', borderRadius: '12px' }}>
                    <h2 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageCircle size={24} color="var(--accent)" /> General Discussion
                    </h2>
                    <CommentsSection mangaId={id} chapterId="general" />
                </div>
            </div>
        </div>
    );
}
