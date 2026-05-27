import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useNotificationStore } from '../store/notificationStore';
import { Bell, BookOpen, X, CheckCheck, Trash2, ChevronRight } from 'lucide-react';

function resolveCover(poster) {
    if (!poster) return null;
    if (typeof poster === 'string') {
        if (poster.startsWith('http') || poster.startsWith('/')) return poster;
        return `/atsu-api/static/${poster}`;
    }
    const img = poster.mediumImage || poster.smallImage || poster.image || '';
    if (img.startsWith('http') || img.startsWith('/')) return img;
    return `/atsu-api/static/${img}`;
}

function timeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
}

export default function NotificationPanel({ onClose }) {
    const ref = useRef(null);

    const alerts      = useNotificationStore(s => s.alerts);
    const markRead    = useNotificationStore(s => s.markRead);
    const markAllRead = useNotificationStore(s => s.markAllRead);
    const dismiss     = useNotificationStore(s => s.dismiss);
    const dismissAll  = useNotificationStore(s => s.dismissAll);
    const lastChecked = useNotificationStore(s => s.lastChecked);

    // Close on outside click
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [onClose]);

    const unread = alerts.filter(a => !a.read);
    const hasAny = alerts.length > 0;

    return (
        <div className="notif-panel" ref={ref} role="dialog" aria-label="Notifications">
            {/* ── Header ── */}
            <div className="notif-panel__header">
                <div className="notif-panel__title">
                    <Bell size={16} />
                    Notifications
                    {unread.length > 0 && (
                        <span className="notif-panel__count">{unread.length}</span>
                    )}
                </div>
                <div className="notif-panel__actions">
                    {unread.length > 0 && (
                        <button
                            className="notif-panel__action-btn"
                            onClick={markAllRead}
                            title="Mark all as read"
                        >
                            <CheckCheck size={14} />
                        </button>
                    )}
                    {hasAny && (
                        <button
                            className="notif-panel__action-btn notif-panel__action-btn--danger"
                            onClick={dismissAll}
                            title="Clear all notifications"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                    <button className="notif-panel__close" onClick={onClose}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* ── Last checked ── */}
            {lastChecked && (
                <div className="notif-panel__last-checked">
                    Last checked {timeAgo(lastChecked)}
                </div>
            )}

            {/* ── Content ── */}
            {!hasAny ? (
                <div className="notif-panel__empty">
                    <Bell size={32} />
                    <p>No new chapters yet</p>
                    <span>Your bookmarked manga will appear here when new chapters drop.</span>
                </div>
            ) : (
                <div className="notif-panel__list" aria-live="polite" aria-label="Chapter notifications">
                    {alerts.map(alert => {
                        const coverUrl = resolveCover(alert.mangaPoster);
                        return (
                        <div
                            key={alert.id}
                            className={`notif-item${alert.read ? ' notif-item--read' : ''}`}
                        >
                            {/* Cover */}
                            <Link
                                to={`/read/${alert.mangaId}/${alert.chapterId}`}
                                className="notif-item__cover"
                                onClick={() => { markRead(alert.id); onClose(); }}
                            >
                                {coverUrl
                                    ? <img src={coverUrl} alt={alert.mangaTitle} />
                                    : <div className="notif-item__cover-placeholder">
                                        <BookOpen size={16} />
                                      </div>
                                }
                            </Link>

                            {/* Info */}
                            <Link
                                to={`/read/${alert.mangaId}/${alert.chapterId}`}
                                className="notif-item__info"
                                onClick={() => { markRead(alert.id); onClose(); }}
                            >
                                <span className="notif-item__title">{alert.mangaTitle}</span>
                                <span className="notif-item__chapter">
                                    Ch. {alert.chapterNum}
                                    {alert.chapterTitle ? ` — ${alert.chapterTitle}` : ''}
                                </span>
                                <span className="notif-item__time">{timeAgo(alert.detectedAt)}</span>
                            </Link>

                            {/* Unread dot + dismiss */}
                            <div className="notif-item__right">
                                {!alert.read && <span className="notif-item__dot" />}
                                <button
                                    className="notif-item__dismiss"
                                    onClick={() => dismiss(alert.id)}
                                    title="Dismiss"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </div>
                    );
                    })}
                </div>
            )}

            {/* ── Footer ── */}
            <div className="notif-panel__footer">
                <Link to="/library" className="notif-panel__view-all" onClick={onClose}>
                    View Library <ChevronRight size={14} />
                </Link>
            </div>
        </div>
    );
}
