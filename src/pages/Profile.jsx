import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useParams, Navigate, Link } from 'react-router-dom';
import { Settings, Image as ImageIcon, Link as LinkIcon, Upload, Trophy, Medal, Flame, BookOpen, Crown, Star, Lock, UserPlus } from 'lucide-react';
import DownloadsTab from '../components/profile/DownloadsTab';
import EditProfileModal from '../components/profile/EditProfileModal';
import UserAvatar from '../components/profile/UserAvatar';
import UserBanner from '../components/profile/UserBanner';
import { useTrackerStore } from '../store/trackerStore';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import './Profile.css';

export default function Profile() {
    const { userId } = useParams();
    const { user, isAuthenticated } = useAuth();
    
    const [activeTab, setActiveTab] = useState('Overview');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [friendRequested, setFriendRequested] = useState(false);

    const isSelf = isAuthenticated && user?.uid === userId;

    const readChapters = useTrackerStore(s => s.readChapters);
    const authenticReadChapters = useTrackerStore(s => s.authenticReadChapters);
    const readingStats = useTrackerStore(s => s.readingStats);
    const library = useTrackerStore(s => s.library);
    const getReadingStreak = useTrackerStore(s => s.getReadingStreak);

    // If it's the current user, we use their live local data
    // If it's another user, we use their fetched profileData
    const totalChaptersRead = isSelf ? Object.values(readChapters).reduce((acc, curr) => acc + curr.length, 0) : (profileData?.totalChaptersRead || 0);
    const authenticChaptersRead = isSelf ? Object.values(authenticReadChapters || {}).reduce((acc, curr) => acc + curr.length, 0) : (profileData?.authenticChaptersRead || 0);
    const libraryCount = isSelf ? Object.keys(library).length : (profileData?.libraryCount || 0);
    const currentStreak = isSelf ? getReadingStreak() : (profileData?.currentStreak || 0);

    const totalHours = isSelf ? ((readingStats?.totalTimeMs || 0) / (1000 * 60 * 60)) : (profileData?.totalHours || 0);
    const totalHoursStr = totalHours > 0 && totalHours < 0.1 ? "<0.1" : totalHours.toFixed(1);
    
    let mostReadMangaTitle = profileData?.mostReadMangaTitle || 'None yet';
    if (isSelf) {
        let mostReadMangaId = null;
        let mostReadMangaMs = 0;
        if (readingStats?.timeByManga) {
            for (const [id, ms] of Object.entries(readingStats.timeByManga)) {
                if (ms > mostReadMangaMs) {
                    mostReadMangaMs = ms;
                    mostReadMangaId = id;
                }
            }
        }
        mostReadMangaTitle = mostReadMangaId ? library[mostReadMangaId]?.title || 'Unknown Manga' : 'None yet';
    }

    const ACHIEVEMENTS = [
        { id: 'first_blood', name: 'First Blood', desc: 'Authentically read your first chapter', icon: <Star size={24} color="#ffd700" />, unlocked: authenticChaptersRead >= 1 },
        { id: 'avid_reader', name: 'Avid Reader', desc: 'Authentically read 100 chapters', icon: <BookOpen size={24} color="#60c8f5" />, unlocked: authenticChaptersRead >= 100 },
        { id: 'streak_master', name: 'Streak Master', desc: 'Maintain a 7-day reading streak', icon: <Flame size={24} color="#f2994a" />, unlocked: currentStreak >= 7 },
        { id: 'collector', name: 'Collector', desc: 'Add 10 manga to your library', icon: <Crown size={24} color="#a07cf8" />, unlocked: libraryCount >= 10 },
        { id: 'otaku', name: 'True Otaku', desc: 'Authentically read 1000 chapters', icon: <Trophy size={24} color="#e35e8f" />, unlocked: authenticChaptersRead >= 1000 },
    ];
    
    const unlockedBadgesCount = ACHIEVEMENTS.filter(a => a.unlocked).length;

    useEffect(() => {
        if (!userId || !db) return;

        const fetchUser = async () => {
            setLoading(true);
            if (isSelf) {
                setProfileData(user);
                // Sync latest local stats to firestore
                setDoc(doc(db, 'users', user.uid), {
                    totalChaptersRead,
                    authenticChaptersRead,
                    libraryCount,
                    currentStreak,
                    totalHours,
                    mostReadMangaTitle,
                    badgesCount: unlockedBadgesCount
                }, { merge: true }).catch(e => console.error("Failed to sync stats", e));
            } else {
                try {
                    const docSnap = await getDoc(doc(db, 'users', userId));
                    if (docSnap.exists()) {
                        setProfileData(docSnap.data());
                    } else {
                        setProfileData(null);
                    }
                } catch (e) {
                    console.error("Failed to fetch profile", e);
                }
            }
            setLoading(false);
        };
        fetchUser();
    }, [userId, user, isSelf, totalChaptersRead, authenticChaptersRead, libraryCount, currentStreak, totalHours, mostReadMangaTitle, unlockedBadgesCount]);

    if (loading) {
        return <div className="page-container"><p style={{ textAlign: 'center', marginTop: 100 }}>Loading profile...</p></div>;
    }

    if (!profileData && !isSelf) {
        return (
            <div className="page-container" style={{ textAlign: 'center', paddingTop: 100 }}>
                <h1 style={{ fontSize: 48, opacity: 0.3 }}>404</h1>
                <p style={{ color: 'var(--text-secondary)' }}>User not found.</p>
                <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Go Home</Link>
            </div>
        );
    }
    
    const displayUser = isSelf ? user : profileData;
    const isPrivate = displayUser?.privacy === 'private' && !isSelf;

    const tabs = isPrivate ? [] : ['Overview', 'Achievements', ...(isSelf ? ['Downloads', 'Settings'] : [])];

    return (
        <div className="profile-page">
            <div className="profile-header-banner">
                <UserBanner src={displayUser?.bannerURL} config={displayUser?.bannerConfig} className="profile-banner-img">
                    {!isPrivate && (
                        <div className="profile-banner-stats">
                            <div className="stat-item">
                                <span className="stat-value" style={{ color: 'var(--accent)' }}>{libraryCount}</span>
                                <span className="stat-label">MANGA</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value" style={{ color: 'var(--accent)' }}>{totalChaptersRead}</span>
                                <span className="stat-label">CHAPTERS</span>
                            </div>
                            <div className="stat-item">
                                <span className="stat-value" style={{ color: 'var(--accent)' }}>{unlockedBadgesCount}</span>
                                <span className="stat-label">BADGES</span>
                            </div>
                        </div>
                    )}

                    {isSelf && (
                        <button className="btn btn-secondary edit-profile-btn" onClick={() => setIsEditModalOpen(true)}>
                            <Settings size={16} /> Edit Profile
                        </button>
                    )}
                </UserBanner>
            </div>
            
            <div className="profile-container">
                <div className="profile-user-info">
                    <div className="profile-avatar-wrapper" onClick={() => isSelf && setIsEditModalOpen(true)} style={{ cursor: isSelf ? 'pointer' : 'default' }}>
                        <UserAvatar 
                            src={displayUser?.photoURL} 
                            config={displayUser?.avatarConfig}
                            alt={displayUser?.displayName || 'User'} 
                            className="profile-avatar"
                        />
                        {isSelf && (
                            <div className="profile-avatar-overlay">
                                <Upload size={20} />
                            </div>
                        )}
                    </div>
                    <div className="profile-details">
                        <h1 className="profile-name">{displayUser?.displayName || 'Reader'}</h1>
                        {displayUser?.customStatus && (
                            <div className="profile-status">
                                <span className="profile-status-icon">✨</span> <i>{displayUser.customStatus}</i>
                            </div>
                        )}
                        {displayUser?.bio && (
                            <p className="profile-bio">{displayUser.bio}</p>
                        )}
                        {!displayUser?.bio && isSelf && (
                            <p className="profile-bio profile-bio--placeholder" onClick={() => setIsEditModalOpen(true)}>+ Add a bio...</p>
                        )}
                    </div>
                </div>

                {isPrivate ? (
                    <div className="private-profile-lock" style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', marginTop: '24px' }}>
                        <Lock size={48} color="var(--text-secondary)" style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                        <h3 style={{ marginBottom: '8px' }}>This Profile is Private</h3>
                        <p className="text-secondary" style={{ marginBottom: '24px' }}>You must be friends with {displayUser?.displayName} to view their reading stats and library.</p>
                        <button 
                            className="btn btn-primary" 
                            style={{ margin: '0 auto' }}
                            disabled={friendRequested}
                            onClick={() => setFriendRequested(true)}
                        >
                            {friendRequested ? 'Friend Request Sent' : <><UserPlus size={18} style={{marginRight: '8px'}} /> Add Friend</>}
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="profile-tabs">
                            {tabs.map(tab => (
                                <button 
                                    key={tab}
                                    className={`profile-tab ${activeTab === tab ? 'active' : ''}`}
                                    onClick={() => setActiveTab(tab)}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>

                        <div className="profile-tab-content">
                            {activeTab === 'Overview' && (
                                <div className="profile-overview-tab">
                                    <div className="profile-section" style={{ marginTop: '24px' }}>
                                        <h3>Reading Stats</h3>
                                        <p className="text-secondary">Authentic reading history.</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                                            <div className="stat-card" style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Time Read</div>
                                                <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent)' }}>{totalHoursStr}h</div>
                                            </div>
                                            <div className="stat-card" style={{ backgroundColor: 'var(--bg-card)', padding: '16px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Most Read Manga</div>
                                                <div style={{ fontSize: '18px', fontWeight: 'bold' }} className="text-truncate">{mostReadMangaTitle}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {activeTab === 'Achievements' && (
                                <div className="profile-achievements-tab">
                                    <div className="profile-section">
                                        <h3>Achievements</h3>
                                        
                                        <div className="achievements-grid" style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                            gap: '16px',
                                            marginTop: '24px'
                                        }}>
                                            {ACHIEVEMENTS.map(ach => (
                                                <div key={ach.id} className="achievement-card" style={{
                                                    backgroundColor: 'var(--bg-card)',
                                                    borderRadius: '8px',
                                                    padding: '16px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '16px',
                                                    opacity: ach.unlocked ? 1 : 0.4,
                                                    filter: ach.unlocked ? 'none' : 'grayscale(100%)',
                                                    border: ach.unlocked ? '1px solid var(--border-color)' : '1px dashed var(--border-color)'
                                                }}>
                                                    <div className="achievement-icon-wrapper" style={{
                                                        width: '48px',
                                                        height: '48px',
                                                        borderRadius: '50%',
                                                        backgroundColor: 'rgba(255,255,255,0.05)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0
                                                    }}>
                                                        {ach.icon}
                                                    </div>
                                                    <div className="achievement-info">
                                                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>{ach.name}</div>
                                                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{ach.desc}</div>
                                                        {!ach.unlocked && <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--accent)', fontWeight: 'bold' }}>LOCKED</div>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'Settings' && isSelf && (
                                <div className="profile-settings-tab">
                                    <div className="profile-section">
                                        <h3>Public Profile Link</h3>
                                        <p className="text-secondary">Allow anyone with your link to view your reading list and stats.</p>
                                        <div className="public-link-box" style={{ marginTop: '12px', padding: '16px', backgroundColor: 'var(--bg-card)', borderRadius: '8px' }}>
                                            <span>Your public link: </span>
                                            <Link to={`/u/${user?.uid}`} className="accent-text">https://atsu-project.web.app/u/{user?.uid}</Link>
                                        </div>
                                    </div>
                                    
                                    <div className="profile-section" style={{ marginTop: '24px' }}>
                                        <h3>Data & Backup</h3>
                                        <p className="text-secondary">Export your library, reading progress, and settings to a JSON file.</p>
                                        <div className="flex-between" style={{ marginTop: '16px' }}>
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button className="btn btn-primary" onClick={() => {
                                                    const data = {
                                                        library: JSON.parse(localStorage.getItem('atsu-tracker-storage') || '{}'),
                                                        settings: JSON.parse(localStorage.getItem('manga-reader-settings-v2') || '{}')
                                                    };
                                                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                                                    const url = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `atsumaru-backup-${new Date().toISOString().slice(0,10)}.json`;
                                                    a.click();
                                                }}>
                                                    <Upload size={16} style={{ transform: 'rotate(180deg)' }} /> Export Backup
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'Downloads' && isSelf && (
                                <DownloadsTab />
                            )}
                        </div>
                    </>
                )}
            </div>
            
            {isSelf && <EditProfileModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} />}
        </div>
    );
}
