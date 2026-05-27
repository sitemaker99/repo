import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTrackerStore, LIBRARY_STATUSES } from '../store/trackerStore';
import { useNotificationStore } from '../store/notificationStore';
import { getCover } from '../api_routes/mangaAdapter';
import { BookOpen, BookMarked, Trash2, Bell, Eye, Search, ArrowUpDown } from 'lucide-react';

const ALL_FILTER = { value: 'all', label: 'All' };
const FILTERS = [ALL_FILTER, ...LIBRARY_STATUSES];

const SORT_OPTIONS = [
    { value: 'lastRead',  label: 'Last Read'   },
    { value: 'addedAt',   label: 'Date Added'  },
    { value: 'title',     label: 'Title (A–Z)' },
    { value: 'unread',    label: 'Most Unread' },
];

export default function Library() {
    const library      = useTrackerStore(s => s.library);
    const readChapters = useTrackerStore(s => s.readChapters);
    const pageProgress = useTrackerStore(s => s.pageProgress);
    const { removeFromLibrary, updateLibraryStatus, getLastPosition } = useTrackerStore();

    // Use notificationStore as the source of truth for "new chapter" badges —
    // this is what the poller writes to, so it's always accurate.
    const alerts = useNotificationStore(s => s.alerts);

    const navigate = useNavigate();
    const [activeFilter, setActiveFilter] = useState('all');
    const [sortBy, setSortBy]             = useState('lastRead');
    const [searchQuery, setSearchQuery]   = useState('');

    const libraryItems = Object.values(library);

    // Map mangaId → count of unread alerts
    const newCountByManga = useMemo(() => {
        const map = {};
        alerts.filter(a => !a.read).forEach(a => {
            map[a.mangaId] = (map[a.mangaId] || 0) + 1;
        });
        return map;
    }, [alerts]);

    const totalNotifs = Object.values(newCountByManga).reduce((s, n) => s + n, 0);

    const filtered = useMemo(() => {
        let items = activeFilter === 'all'
            ? libraryItems
            : libraryItems.filter(m => m.status === activeFilter);

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            items = items.filter(m => m.title?.toLowerCase().includes(q));
        }

        return [...items].sort((a, b) => {
            switch (sortBy) {
                case 'lastRead': {
                    const aTime = pageProgress[a.id]?.updatedAt ?? a.addedAt ?? 0;
                    const bTime = pageProgress[b.id]?.updatedAt ?? b.addedAt ?? 0;
                    return bTime - aTime;
                }
                case 'addedAt':
                    return (b.addedAt ?? 0) - (a.addedAt ?? 0);
                case 'title':
                    return (a.title ?? '').localeCompare(b.title ?? '');
                case 'unread': {
                    const aUnread = Math.max(0, (a.totalChapters ?? 0) - (readChapters[a.id]?.length ?? 0));
                    const bUnread = Math.max(0, (b.totalChapters ?? 0) - (readChapters[b.id]?.length ?? 0));
                    return bUnread - aUnread;
                }
                default: return 0;
            }
        });
    }, [libraryItems, activeFilter, searchQuery, sortBy, pageProgress, readChapters]);

    return (
        <div className="library-page fade-in">
            <div className="library-header">
                <div>
                    <h1><BookMarked size={32} /> My Library</h1>
                    <p className="library-subtitle">
                        {libraryItems.length} title{libraryItems.length !== 1 ? 's' : ''}
                        {totalNotifs > 0 && (
                            <span className="library-notif-count">
                                <Bell size={13} /> {totalNotifs} new chapter{totalNotifs !== 1 ? 's' : ''}
                            </span>
                        )}
                    </p>
                </div>
            </div>

            {/* Search + Sort bar */}
            <div className="library-controls">
                <div className="library-search-wrap">
                    <Search size={15} className="library-search-icon" />
                    <input
                        className="library-search"
                        type="text"
                        placeholder="Search your library…"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="library-sort-wrap">
                    <ArrowUpDown size={14} className="library-sort-icon" />
                    <select
                        className="library-sort"
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                    >
                        {SORT_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Status filter tabs */}
            <div className="filter-tabs">
                {FILTERS.map(f => {
                    const count = f.value === 'all'
                        ? libraryItems.length
                        : libraryItems.filter(m => m.status === f.value).length;
                    const meta = LIBRARY_STATUSES.find(s => s.value === f.value);
                    return (
                        <button
                            key={f.value}
                            className={`filter-tab ${activeFilter === f.value ? 'active' : ''}`}
                            style={activeFilter === f.value && meta ? { '--tab-color': meta.color } : {}}
                            onClick={() => setActiveFilter(f.value)}
                        >
                            {f.value !== 'all' && (
                                <span className="filter-tab__dot" style={{ background: meta?.color }} />
                            )}
                            {f.label}
                            <span className="filter-count">{count}</span>
                        </button>
                    );
                })}
            </div>

            {filtered.length === 0 ? (
                <div className="empty-state library-empty">
                    <BookOpen size={64} className="empty-icon" />
                    <h2>{searchQuery ? 'No results found' : 'No titles here yet'}</h2>
                    <p>{searchQuery ? `Nothing matched "${searchQuery}".` : 'Start adding manga to your library from any title page.'}</p>
                    {!searchQuery && <Link to="/" className="btn btn-read">Discover Manga</Link>}
                </div>
            ) : (
                <div className="library-grid">
                    {filtered.map((manga) => {
                        const rawRead  = (readChapters[manga.id] || []).length;
                        const total    = manga.totalChapters || 0;
                        const read     = total > 0 ? Math.min(rawRead, total) : rawRead;
                        const unread   = total > 0 ? Math.max(0, total - read) : 0;
                        const lastPos  = getLastPosition(manga.id);
                        const coverUrl = getCover(manga);
                        const meta     = LIBRARY_STATUSES.find(s => s.value === manga.status);
                        const newCount = newCountByManga[manga.id] || 0;
                        const hasNew   = newCount > 0;

                        return (
                            <div key={manga.id} className={`library-card${hasNew ? ' library-card--new' : ''}`}>
                                <div
                                    className="library-card-cover"
                                    onClick={() => navigate(`/manga/${manga.id}`)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {coverUrl
                                        ? <img src={coverUrl} alt={manga.title} loading="lazy"
                                            onError={e => { e.currentTarget.style.display = 'none'; }} />
                                        : <div className="img-placeholder" />
                                    }
                                    {hasNew && <div className="lib-new-badge">{newCount} new</div>}
                                    {!hasNew && unread > 0 && <div className="lib-unread-badge">{unread}</div>}
                                    <div className="library-card-overlay">
                                        {lastPos && (
                                            <Link
                                                to={`/read/${manga.id}/${lastPos.chapterId}`}
                                                className="btn btn-read continue-btn"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <Eye size={14} /> Continue
                                            </Link>
                                        )}
                                    </div>
                                </div>

                                <div className="library-card-info">
                                    <h3>{manga.title}</h3>
                                    <div className="library-card-meta">
                                        <span
                                            className="lib-status-badge"
                                            style={{ color: meta?.color, background: `${meta?.color}22` }}
                                        >
                                            <span className="status-dot" style={{ background: meta?.color }} />
                                            {meta?.label ?? manga.status ?? 'Reading'}
                                        </span>
                                        {read > 0 && (
                                            <span className="chapters-read">{read}{total > 0 ? `/${total}` : ''} ch.</span>
                                        )}
                                    </div>
                                    <div className="library-card-actions">
                                        <select
                                            className="status-select"
                                            value={manga.status || 'reading'}
                                            onChange={e => updateLibraryStatus(manga.id, e.target.value)}
                                        >
                                            {LIBRARY_STATUSES.map(s => (
                                                <option key={s.value} value={s.value}>{s.label}</option>
                                            ))}
                                        </select>
                                        <button className="icon-btn danger-btn" onClick={() => removeFromLibrary(manga.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
