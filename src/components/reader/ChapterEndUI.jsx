import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Home, ChevronRight, SkipForward, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { getCover, getTitle } from '../../api_routes/mangaAdapter';
import CommentsSection from './CommentsSection';
import './ChapterEndUI.css';

const REACTIONS = [
    { id: 'upvote',    emoji: '👍', label: 'Good'      },
    { id: 'funny',     emoji: '😂', label: 'Funny'     },
    { id: 'love',      emoji: '❤️', label: 'Love'      },
    { id: 'surprised', emoji: '😲', label: 'Shocked'   },
    { id: 'angry',     emoji: '😠', label: 'Angry'     },
    { id: 'sad',       emoji: '😢', label: 'Sad'       },
];

export default function ChapterEndUI({ manga, mangaId, chapterId, onLoginRequired }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [counts, setCounts]             = useState({});
    const [totalReactions, setTotalReactions] = useState(0);
    const [userReaction, setUserReaction] = useState(null);
    const [reactionLoading, setReactionLoading] = useState(false);

    const chapterIndex = manga?.chapters?.findIndex(c => c.id === chapterId);
    const chapter      = chapterIndex >= 0 ? manga.chapters[chapterIndex] : null;

    // Chapters are sorted newest-first. Next chapter (chronologically) = chapterIndex - 1
    const nextChapter = (chapterIndex > 0) ? manga.chapters[chapterIndex - 1] : null;
    const prevChapter = (chapterIndex >= 0 && chapterIndex < manga?.chapters?.length - 1)
        ? manga.chapters[chapterIndex + 1] : null;

    // ── Live reaction counts ──────────────────────────────────────────────────
    useEffect(() => {
        if (!mangaId || !chapterId) return;
        const reactionDocRef = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`);
        const unsub = onSnapshot(reactionDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCounts(data.counts || {});
                setTotalReactions(data.total || 0);
            } else {
                // Doc doesn't exist yet — reset to zero
                setCounts({});
                setTotalReactions(0);
            }
        }, (error) => {
            console.error('Error listening to reactions:', error);
        });
        return () => unsub();
    }, [mangaId, chapterId]);

    // ── Load user's reaction ──────────────────────────────────────────────────
    useEffect(() => {
        if (!user || !mangaId || !chapterId) {
            setUserReaction(null);
            return;
        }
        const userReactionRef = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`, 'user_reactions', user.uid);
        getDoc(userReactionRef)
            .then((snap) => {
                setUserReaction(snap.exists() ? snap.data().type : null);
            })
            .catch(err => console.error('Error fetching user reaction:', err));
    }, [user, mangaId, chapterId]);

    // ── Handle reaction ───────────────────────────────────────────────────────
    const handleReaction = async (reactionId) => {
        if (!user) {
            // Use toast instead of jarring alert()
            if (typeof onLoginRequired === 'function') onLoginRequired();
            return;
        }
        if (reactionLoading) return;

        const reactionDocRef  = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`);
        const userReactionRef = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`, 'user_reactions', user.uid);
        const previousReaction = userReaction;
        const isToggleOff = reactionId === previousReaction;

        // Optimistic update
        setUserReaction(isToggleOff ? null : reactionId);
        setReactionLoading(true);

        try {
            await runTransaction(db, async (transaction) => {
                const reactionDoc = await transaction.get(reactionDocRef);

                let currentCounts = {};
                let currentTotal  = 0;

                if (reactionDoc.exists()) {
                    currentCounts = reactionDoc.data().counts || {};
                    currentTotal  = reactionDoc.data().total  || 0;
                }

                // Remove previous reaction
                if (previousReaction) {
                    currentCounts[previousReaction] = Math.max(0, (currentCounts[previousReaction] || 1) - 1);
                    currentTotal = Math.max(0, currentTotal - 1);
                }

                // Add new reaction (unless toggling off)
                if (!isToggleOff) {
                    currentCounts[reactionId] = (currentCounts[reactionId] || 0) + 1;
                    currentTotal += 1;
                    transaction.set(userReactionRef, { type: reactionId });
                } else {
                    transaction.delete(userReactionRef);
                }

                transaction.set(reactionDocRef, { counts: currentCounts, total: currentTotal }, { merge: true });
            });
        } catch (error) {
            console.error('Transaction failed:', error);
            // Revert optimistic update on failure
            setUserReaction(previousReaction);
        } finally {
            setReactionLoading(false);
        }
    };

    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000)    return (num / 1000).toFixed(1) + 'K';
        return num;
    };

    if (!manga) return null;

    const topReaction = REACTIONS.reduce((top, r) =>
        (counts[r.id] || 0) > (counts[top?.id] || 0) ? r : top, null);

    return (
        <div className="chapter-end-container">

            {/* ── Divider ── */}
            <div className="chapter-end-divider">
                <span className="chapter-end-divider-line" />
                <span className="chapter-end-divider-label">End of Chapter {chapter?.number}</span>
                <span className="chapter-end-divider-line" />
            </div>

            {/* ── Caught-up / Next Chapter card ── */}
            <div className="caught-up-card">
                <div className="caught-up-cover-wrap">
                    <img
                        src={getCover(manga) || '/brand/default-cover.jpg'}
                        alt={getTitle(manga) || manga.title}
                        className="caught-up-cover"
                    />
                    <div className="caught-up-cover-overlay" />
                </div>

                <div className="caught-up-info">
                    <div className="caught-up-badge-row">
                        {nextChapter ? (
                            <span className="caught-up-badge caught-up-badge--next">
                                Next Chapter Available
                            </span>
                        ) : (
                            <span className="caught-up-badge caught-up-badge--done">
                                🎉 All Caught Up!
                            </span>
                        )}
                    </div>

                    <h2 className="caught-up-title">{getTitle(manga) || manga.title}</h2>
                    <span className="caught-up-chapter">
                        <BookOpen size={13} />
                        {nextChapter
                            ? `Just finished Ch. ${chapter?.number} · Up next: Ch. ${nextChapter.number}`
                            : `Finished Ch. ${chapter?.number} · No new chapters yet`}
                    </span>

                    <div className="caught-up-actions">
                        {nextChapter ? (
                            <>
                                <button
                                    className="caught-up-btn caught-up-btn--primary"
                                    onClick={() => navigate(`/read/${mangaId}/${nextChapter.id}`)}>
                                    <SkipForward size={16} />
                                    Continue to Ch. {nextChapter.number}
                                    <ChevronRight size={15} />
                                </button>
                                {prevChapter && (
                                    <button
                                        className="caught-up-btn caught-up-btn--ghost"
                                        onClick={() => navigate(`/read/${mangaId}/${prevChapter.id}`)}>
                                        ← Ch. {prevChapter.number}
                                    </button>
                                )}
                            </>
                        ) : (
                            <div className="caught-up-fin-actions">
                                <button
                                    className="caught-up-btn caught-up-btn--primary"
                                    onClick={() => navigate('/library')}>
                                    <Bookmark size={15} /> My Library
                                </button>
                                <button
                                    className="caught-up-btn caught-up-btn--ghost"
                                    onClick={() => navigate('/')}>
                                    <Home size={15} /> Discover More
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Reactions ── */}
            <div className="reactions-card">
                <div className="reactions-header">
                    <div>
                        <h3 className="reactions-title">How was this chapter?</h3>
                        {totalReactions > 0 && (
                            <span className="reactions-total">
                                {formatNumber(totalReactions)} reader{totalReactions !== 1 ? 's' : ''} reacted
                                {topReaction && counts[topReaction.id] > 0 && (
                                    <> · most felt {topReaction.emoji}</>
                                )}
                            </span>
                        )}
                    </div>
                    {!user && (
                        <span className="reactions-login-hint">Log in to react</span>
                    )}
                </div>

                <div className="reactions-grid">
                    {REACTIONS.map((r) => {
                        const count   = counts[r.id] || 0;
                        const isActive = userReaction === r.id;
                        const pct     = totalReactions > 0 ? (count / totalReactions) * 100 : 0;
                        return (
                            <button
                                key={r.id}
                                className={`reaction-btn${isActive ? ' active' : ''}${!user ? ' reaction-btn--disabled' : ''}`}
                                onClick={() => handleReaction(r.id)}
                                disabled={reactionLoading}
                                title={user ? (isActive ? `Remove ${r.label} reaction` : `React with ${r.label}`) : 'Log in to react'}
                            >
                                <div className="reaction-fill" style={{ width: `${pct}%` }} />
                                <span className="reaction-emoji">{r.emoji}</span>
                                <span className="reaction-label">{r.label}</span>
                                <span className="reaction-count">{count > 0 ? formatNumber(count) : ''}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Comments ── */}
            <CommentsSection mangaId={mangaId} chapterId={chapterId} />
        </div>
    );
}
