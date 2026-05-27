import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, doc, runTransaction, addDoc, serverTimestamp } from 'firebase/firestore';
import { ThumbsUp, ThumbsDown, ChevronDown, ChevronUp } from 'lucide-react';
import UserAvatar from '../profile/UserAvatar';

export default function CommentItem({ comment, mangaId, chapterId, isReply = false }) {
    const { user } = useAuth();
    const [replies, setReplies] = useState([]);
    const [showReplies, setShowReplies] = useState(false);
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [userVote, setUserVote] = useState(null); // 'up' or 'down'

    // Fetch replies if this is a top-level comment and it has replies (or just fetch them anyway to get the count)
    useEffect(() => {
        if (isReply) return; // Only 1 level of nesting to keep it simple

        const commentsRef = collection(db, 'chapter_comments', `${mangaId}_${chapterId}`, 'comments');
        const q = query(commentsRef, where("parentId", "==", comment.id), orderBy("createdAt", "asc"));

        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReplies(data);
        }, (error) => {
            console.error("Error fetching replies:", error);
        });

        return () => unsub();
    }, [comment.id, mangaId, chapterId, isReply]);

    // Fetch user vote
    useEffect(() => {
        if (!user) return;
        const voteRef = doc(db, 'chapter_comments', `${mangaId}_${chapterId}`, 'comments', comment.id, 'votes', user.uid);
        // Using onSnapshot to keep it simple, or we could just getDoc. 
        const unsub = onSnapshot(voteRef, (snap) => {
            if (snap.exists()) setUserVote(snap.data().type);
            else setUserVote(null);
        }, (error) => {
            console.error("Error fetching vote:", error);
        });
        return () => unsub();
    }, [user, comment.id, mangaId, chapterId]);

    const handleVote = async (type) => {
        if (!user) return alert("Please log in to vote.");
        
        const commentRef = doc(db, 'chapter_comments', `${mangaId}_${chapterId}`, 'comments', comment.id);
        const voteRef = doc(commentRef, 'votes', user.uid);

        try {
            await runTransaction(db, async (transaction) => {
                const commentDoc = await transaction.get(commentRef);
                const voteDoc = await transaction.get(voteRef);
                
                let upvotes = commentDoc.data().upvotes || 0;
                let downvotes = commentDoc.data().downvotes || 0;

                const currentVote = voteDoc.exists() ? voteDoc.data().type : null;

                if (currentVote) {
                    if (currentVote === 'up') upvotes = Math.max(0, upvotes - 1);
                    if (currentVote === 'down') downvotes = Math.max(0, downvotes - 1);
                }

                if (currentVote !== type) {
                    if (type === 'up') upvotes++;
                    if (type === 'down') downvotes++;
                    transaction.set(voteRef, { type });
                } else {
                    transaction.delete(voteRef); // Toggle off
                }

                transaction.update(commentRef, { upvotes, downvotes });
            });
        } catch (e) {
            console.error("Vote failed:", e);
        }
    };

    const submitReply = async () => {
        if (!user || !replyText.trim()) return;
        
        try {
            const commentsRef = collection(db, 'chapter_comments', `${mangaId}_${chapterId}`, 'comments');
            await addDoc(commentsRef, {
                userId: user.uid,
                userDisplayName: user.displayName || 'Reader',
                userAvatar: user.photoURL || null,
                userAvatarConfig: user.avatarConfig || null,
                text: replyText.trim(),
                createdAt: serverTimestamp(),
                parentId: comment.id,
                upvotes: 0,
                downvotes: 0
            });
            setReplyText('');
            setIsReplying(false);
            setShowReplies(true); // Auto-show replies after posting
        } catch (e) {
            console.error("Reply failed:", e);
        }
    };

    const parseText = (text) => {
        if (!text) return null;
        
        // Very basic markdown parser using regex and dangerouslySetInnerHTML to avoid complex React node trees
        // In production, we'd use a real markdown parser like marked or react-markdown to prevent XSS.
        // But we will strictly replace these tags:
        let parsed = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/~~(.*?)~~/g, '<del>$1</del>')
            .replace(/\|\|(.*?)\|\|/g, '<span class="spoiler-text">$1</span>')
            .replace(/\n/g, '<br/>');

        return <div dangerouslySetInnerHTML={{ __html: parsed }} />;
    };

    const timeAgo = (timestamp) => {
        if (!timestamp) return 'Just now';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const seconds = Math.floor((new Date() - date) / 1000);
        
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + "y ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + "mo ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "m ago";
        return Math.floor(seconds) + "s ago";
    };

    return (
        <div className={`comment-item ${isReply ? 'is-reply' : ''}`}>
            <Link to={`/u/${comment.userId}`} style={{ display: 'flex', textDecoration: 'none' }}>
                <UserAvatar 
                    src={comment.userAvatar} 
                    config={comment.userAvatarConfig} 
                    alt="Avatar" 
                    className="comment-avatar" 
                />
            </Link>
            <div className="comment-content-wrap">
                <div className="comment-header">
                    <Link to={`/u/${comment.userId}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <span className="comment-author">{comment.userDisplayName}</span>
                    </Link>
                    <span className="comment-time">{timeAgo(comment.createdAt)}</span>
                </div>
                <div className="comment-body">
                    {parseText(comment.text)}
                </div>
                <div className="comment-actions">
                    <button className={`vote-btn ${userVote === 'up' ? 'active' : ''}`} onClick={() => handleVote('up')}>
                        <ThumbsUp size={14} /> {comment.upvotes || 0}
                    </button>
                    <button className={`vote-btn ${userVote === 'down' ? 'active' : ''}`} onClick={() => handleVote('down')}>
                        <ThumbsDown size={14} /> {comment.downvotes || 0}
                    </button>
                    {!isReply && (
                        <button className="reply-btn" onClick={() => setIsReplying(!isReplying)}>
                            Reply
                        </button>
                    )}
                </div>

                {isReplying && (
                    <div className="reply-input-container">
                        <textarea 
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Write a reply..."
                            autoFocus
                        />
                        <div className="reply-input-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => setIsReplying(false)}>Cancel</button>
                            <button className="btn btn-primary btn-sm" onClick={submitReply} disabled={!replyText.trim()}>Reply</button>
                        </div>
                    </div>
                )}

                {replies.length > 0 && !isReply && (
                    <div className="comment-replies">
                        <button className="toggle-replies-btn" onClick={() => setShowReplies(!showReplies)}>
                            {showReplies ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {showReplies ? 'Hide replies' : `View ${replies.length} replies`}
                        </button>
                        
                        {showReplies && (
                            <div className="replies-list">
                                {replies.map(reply => (
                                    <CommentItem 
                                        key={reply.id} 
                                        comment={reply} 
                                        mangaId={mangaId} 
                                        chapterId={chapterId} 
                                        isReply={true} 
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
