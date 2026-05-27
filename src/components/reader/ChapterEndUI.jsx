import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { getCover, getTitle } from '../../api_routes/mangaAdapter';
import CommentsSection from './CommentsSection';
import './ChapterEndUI.css';

const REACTIONS = [
    { id: 'upvote', emoji: '👍', label: 'Upvote' },
    { id: 'funny', emoji: '😂', label: 'Funny' },
    { id: 'love', emoji: '❤️', label: 'Love' },
    { id: 'surprised', emoji: '😲', label: 'Surprised' },
    { id: 'angry', emoji: '😠', label: 'Angry' },
    { id: 'sad', emoji: '😢', label: 'Sad' }
];

export default function ChapterEndUI({ manga, mangaId, chapterId }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [counts, setCounts] = useState({});
    const [totalReactions, setTotalReactions] = useState(0);
    const [userReaction, setUserReaction] = useState(null);

    const chapterIndex = manga?.chapters?.findIndex(c => c.id === chapterId);
    const chapter = chapterIndex >= 0 ? manga.chapters[chapterIndex] : null;
    
    // Chapters are sorted newest-first (descending index). 
    // Therefore, the chronologically "next" chapter is actually at index - 1.
    const nextChapter = (chapterIndex > 0) ? manga.chapters[chapterIndex - 1] : null;
    useEffect(() => {
        if (!mangaId || !chapterId) return;

        const reactionDocRef = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`);
        
        // Listen to global counts
        const unsub = onSnapshot(reactionDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setCounts(data.counts || {});
                setTotalReactions(data.total || 0);
            }
        }, (error) => {
            console.error("Error listening to reactions:", error);
        });

        return () => unsub();
    }, [mangaId, chapterId]);

    useEffect(() => {
        if (!user || !mangaId || !chapterId) return;

        const userReactionRef = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`, 'user_reactions', user.uid);
        getDoc(userReactionRef).then((snap) => {
            if (snap.exists()) {
                setUserReaction(snap.data().type);
            }
        }).catch(err => console.error("Error fetching user reaction:", err));
    }, [user, mangaId, chapterId]);

    const handleReaction = async (reactionId) => {
        if (!user) {
            alert('Please log in to react.');
            return;
        }

        const reactionDocRef = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`);
        const userReactionRef = doc(db, 'chapter_reactions', `${mangaId}_${chapterId}`, 'user_reactions', user.uid);

        const previousReaction = userReaction;
        
        // Optimistic UI update
        setUserReaction(reactionId === previousReaction ? null : reactionId);
        
        try {
            await runTransaction(db, async (transaction) => {
                const reactionDoc = await transaction.get(reactionDocRef);
                
                let currentCounts = {};
                let currentTotal = 0;

                if (reactionDoc.exists()) {
                    currentCounts = reactionDoc.data().counts || {};
                    currentTotal = reactionDoc.data().total || 0;
                }

                // Remove previous reaction if exists
                if (previousReaction) {
                    currentCounts[previousReaction] = Math.max(0, (currentCounts[previousReaction] || 1) - 1);
                    currentTotal = Math.max(0, currentTotal - 1);
                }

                // If clicking a different reaction, add it
                if (reactionId !== previousReaction) {
                    currentCounts[reactionId] = (currentCounts[reactionId] || 0) + 1;
                    currentTotal += 1;
                    transaction.set(userReactionRef, { type: reactionId });
                } else {
                    transaction.delete(userReactionRef);
                }

                transaction.set(reactionDocRef, { counts: currentCounts, total: currentTotal }, { merge: true });
            });
        } catch (error) {
            console.error("Transaction failed: ", error);
            setUserReaction(previousReaction); // Revert on failure
        }
    };

    const formatNumber = (num) => {
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num;
    };

    if (!manga) return null;

    return (
        <div className="chapter-end-container">
            <div className="caught-up-card">
                <img src={getCover(manga) || '/brand/default-cover.jpg'} alt="Cover" className="caught-up-cover" />
                <div className="caught-up-info">
                    {nextChapter ? (
                        <span className="caught-up-badge" style={{ background: 'var(--accent)', color: '#000' }}>Next Chapter Available!</span>
                    ) : (
                        <span className="caught-up-badge">You're all caught up!</span>
                    )}
                    <h2 className="caught-up-title">{getTitle(manga) || manga.title}</h2>
                    <span className="caught-up-chapter">Chapter {chapter?.number || 'Unknown'}</span>
                    <div className="caught-up-actions">
                        {nextChapter ? (
                            <button className="btn btn-primary" onClick={() => navigate(`/read/${mangaId}/${nextChapter.id}`)}>
                                Next: Chapter {nextChapter.number}
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-primary" onClick={() => navigate('/bookmarks')}>
                                    <Bookmark size={18} /> Back to Bookmarks
                                </button>
                                <button className="btn btn-secondary" onClick={() => navigate('/')}>
                                    <Home size={18} /> Back to Home
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="reactions-card">
                <h3>What did you think of this chapter?</h3>
                <span className="reactions-total">{formatNumber(totalReactions)} reactions</span>
                <div className="reactions-grid">
                    {REACTIONS.map((r) => (
                        <button 
                            key={r.id} 
                            className={`reaction-btn ${userReaction === r.id ? 'active' : ''}`}
                            onClick={() => handleReaction(r.id)}
                        >
                            <span className="reaction-emoji">{r.emoji}</span>
                            <span className="reaction-count">{formatNumber(counts[r.id] || 0)}</span>
                            <span className="reaction-label">{r.label}</span>
                        </button>
                    ))}
                </div>
            </div>
            
            <CommentsSection mangaId={mangaId} chapterId={chapterId} />
        </div>
    );
}
