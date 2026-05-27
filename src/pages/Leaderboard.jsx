import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Medal, Star, Flame } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import UserAvatar from '../components/profile/UserAvatar';
import './Leaderboard.css';

export default function Leaderboard() {
    const [leaders, setLeaders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const fetchLeaders = async () => {
            try {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, orderBy('totalChaptersRead', 'desc'), limit(50));
                const snap = await getDocs(q);
                if (!mounted) return;
                
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setLeaders(data);
            } catch (err) {
                console.error("Failed to fetch leaderboard", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        fetchLeaders();
        return () => { mounted = false; };
    }, []);

    const getRankIcon = (index) => {
        if (index === 0) return <Trophy size={24} color="#FFD700" />; // Gold
        if (index === 1) return <Medal size={24} color="#C0C0C0" />; // Silver
        if (index === 2) return <Medal size={24} color="#CD7F32" />; // Bronze
        return <span className="rank-number">#{index + 1}</span>;
    };

    return (
        <div className="page-container leaderboard-page fade-in">
            <div className="leaderboard-header">
                <h1><Trophy size={36} color="var(--accent)" /> Global Leaderboard</h1>
                <p>Top readers ranked by total chapters read</p>
            </div>
            
            <div className="leaderboard-list">
                {loading ? (
                    <div className="loading-state">Loading rankings...</div>
                ) : leaders.length === 0 ? (
                    <div className="empty-state">No reading data available yet.</div>
                ) : (
                    leaders.map((user, index) => (
                        <Link to={`/u/${user.id}`} key={user.id} className={`leaderboard-card rank-${index + 1}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div className="rank-indicator">
                                {getRankIcon(index)}
                            </div>
                            <div className="leader-avatar">
                                <UserAvatar 
                                    src={user.photoURL} 
                                    config={user.avatarConfig}
                                    alt="Avatar" 
                                    style={{width: 32, height: 32, borderRadius: '50%'}} 
                                />
                            </div>
                            <div className="leader-info">
                                <h3 className="leader-name">{user.displayName || 'Anonymous Reader'}</h3>
                                {index === 0 && <span className="leader-badge"><Flame size={14} /> Top Reader</span>}
                            </div>
                            <div className="leader-score">
                                <span className="score-value">{user.totalChaptersRead || 0}</span>
                                <span className="score-label">Chapters</span>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
