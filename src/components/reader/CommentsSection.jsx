import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Bold, Italic, Strikethrough, EyeOff, MessageSquare } from 'lucide-react';
import CommentItem from './CommentItem';
import './CommentsSection.css';

export default function CommentsSection({ mangaId, chapterId }) {
    const { user } = useAuth();
    const [comments, setComments] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!mangaId || !chapterId) return;

        const commentsRef = collection(db, 'chapter_comments', `${mangaId}_${chapterId}`, 'comments');
        const q = query(commentsRef, where("parentId", "==", "root"));

        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Sort by createdAt descending in memory to prevent composite index requirement
            data.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return timeB - timeA;
            });
            
            setComments(data);
        }, (error) => {
            console.error("Error fetching comments:", error);
        });

        return () => unsub();
    }, [mangaId, chapterId]);

    const handleFormat = (prefix, suffix) => {
        if (!inputRef.current) return;
        const start = inputRef.current.selectionStart;
        const end = inputRef.current.selectionEnd;
        const selected = inputText.substring(start, end);
        const before = inputText.substring(0, start);
        const after = inputText.substring(end);
        
        setInputText(`${before}${prefix}${selected}${suffix}${after}`);
        
        setTimeout(() => {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(start + prefix.length, end + prefix.length);
        }, 0);
    };

    const submitComment = async () => {
        if (!user || !inputText.trim()) return;
        setIsSubmitting(true);
        
        try {
            const commentsRef = collection(db, 'chapter_comments', `${mangaId}_${chapterId}`, 'comments');
            await addDoc(commentsRef, {
                userId: user.uid,
                userDisplayName: user.displayName || 'Reader',
                userAvatar: user.photoURL || null,
                userAvatarConfig: user.avatarConfig || null,
                text: inputText.trim(),
                createdAt: serverTimestamp(),
                parentId: 'root',
                upvotes: 0,
                downvotes: 0,
                replyCount: 0
            });
            setInputText('');
        } catch (e) {
            console.error("Error posting comment:", e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="comments-section">
            <div className="comments-header">
                <h3>{comments.length} Comments</h3>
                <div className="comments-sort">
                    <button className="active">Newest</button>
                    <button>Best</button>
                    <button>Oldest</button>
                </div>
            </div>

            <div className="comment-rules-banner">
                <div className="rules-text">By commenting, you agree to follow our comment rules.</div>
                <button className="btn btn-primary btn-sm">Read Rules</button>
            </div>

            <div className="comment-input-container">
                <textarea
                    ref={inputRef}
                    className="comment-textarea"
                    placeholder={user ? "Join the discussion..." : "Log in to join the discussion..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    disabled={!user || isSubmitting}
                />
                <div className="comment-input-footer">
                    <div className="formatting-tools">
                        <button onClick={() => handleFormat('**', '**')} title="Bold" disabled={!user}><Bold size={16} /></button>
                        <button onClick={() => handleFormat('*', '*')} title="Italic" disabled={!user}><Italic size={16} /></button>
                        <button onClick={() => handleFormat('~~', '~~')} title="Strikethrough" disabled={!user}><Strikethrough size={16} /></button>
                        <button onClick={() => handleFormat('||', '||')} title="Spoiler" disabled={!user}><EyeOff size={16} /></button>
                    </div>
                    <button 
                        className="btn btn-primary submit-comment-btn" 
                        onClick={submitComment}
                        disabled={!user || !inputText.trim() || isSubmitting}
                    >
                        {user ? (isSubmitting ? 'Posting...' : 'Comment') : (
                            <>
                                <MessageSquare size={16} /> Log In to Comment
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="comments-list">
                {comments.map(comment => (
                    <CommentItem 
                        key={comment.id} 
                        comment={comment} 
                        mangaId={mangaId} 
                        chapterId={chapterId} 
                    />
                ))}
            </div>
        </div>
    );
}
