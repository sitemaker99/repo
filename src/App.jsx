import { BrowserRouter, Routes, Route, NavLink, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import Home        from './pages/Home';
import MangaDetails from './pages/MangaDetails';
import Reader      from './pages/Reader';
import SearchPage  from './pages/Search';
import Library     from './pages/Library';
import Browse      from './pages/Browse';
import AuthPage    from './pages/Auth';
import UserAvatar  from './components/profile/UserAvatar';
import Profile     from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import ErrorBoundary      from './ErrorBoundary';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import ToastContainer     from './components/ToastContainer';
import ScrollToTop        from './components/ScrollToTop';
import NotificationPanel  from './components/NotificationPanel';
import { BookOpen, Search, Bell, LayoutGrid, Flame, SlidersHorizontal, Check, Trophy } from 'lucide-react';
import ProtectedRoute from './components/ProtectedRoute';
import { useNotificationStore } from './store/notificationStore';
import { useTrackerStore }      from './store/trackerStore';
import { useChapterPoller }     from './hooks/useChapterPoller';
import { useServiceWorker }     from './hooks/useServiceWorker';
import { useAuth } from './context/AuthContext';
import { db } from './lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

const UI_PREFS_KEY = 'atsu-ui-prefs-v1';
const ACCENTS = {
    crimson: { accent: '#d63a3a', dim: 'rgba(214,58,58,0.15)', glow: 'rgba(214,58,58,0.4)', hover: '#e85555' },
    cyan:    { accent: '#18b7d5', dim: 'rgba(24,183,213,0.15)', glow: 'rgba(24,183,213,0.4)', hover: '#34c8e3' },
    gold:    { accent: '#d4a92b', dim: 'rgba(212,169,43,0.16)', glow: 'rgba(212,169,43,0.36)', hover: '#e5bb3f' },
    sakura:  { accent: '#e35e8f', dim: 'rgba(227,94,143,0.16)', glow: 'rgba(227,94,143,0.38)', hover: '#ed79a5' },
};

function loadUiPrefs() {
    try {
        const parsed = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || '{}');
        return {
            accent: parsed.accent && ACCENTS[parsed.accent] ? parsed.accent : 'crimson',
            density: parsed.density === 'compact' ? 'compact' : 'cozy',
            motion: parsed.motion === 'reduced' ? 'reduced' : 'normal',
        };
    } catch {
        return { accent: 'crimson', density: 'cozy', motion: 'normal' };
    }
}

function applyUiPrefs(prefs) {
    const root = document.documentElement;
    const accent = ACCENTS[prefs.accent] || ACCENTS.crimson;
    root.style.setProperty('--accent', accent.accent);
    root.style.setProperty('--accent-dim', accent.dim);
    root.style.setProperty('--accent-glow', accent.glow);
    root.style.setProperty('--accent-hov', accent.hover);
    root.setAttribute('data-density', prefs.density);
    root.setAttribute('data-motion', prefs.motion);
}

// ── App boot — refresh bookmark TTLs once on load ─────────────────────────────
function AppInit() {
    const refreshBookmarks = useTrackerStore(s => s.refreshBookmarks);
    useEffect(() => {
        refreshBookmarks();
        applyUiPrefs(loadUiPrefs());
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useChapterPoller(15 * 60 * 1000);
    useServiceWorker();
    return null;
}

// ── Notification bell ─────────────────────────────────────────────────────────
function NotificationBell() {
    const [open, setOpen]   = useState(false);
    const unreadCount = useNotificationStore(s => s.getUnreadCount());
    return (
        <div className="notif-bell-wrapper">
            <button
                className={`nav-link icon-btn notif-bell${open ? ' active' : ''}`}
                onClick={() => setOpen(v => !v)}
                aria-label="Notifications"
            >
                <Bell size={18} />
                {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            {open && <NotificationPanel onClose={() => setOpen(false)} />}
        </div>
    );
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────
function UICustomizer() {
    const [open, setOpen] = useState(false);
    const [prefs, setPrefs] = useState(() => loadUiPrefs());
    const panelRef = useRef(null);

    useEffect(() => {
        applyUiPrefs(prefs);
        localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
    }, [prefs]);

    useEffect(() => {
        const onClickOutside = (e) => {
            if (!panelRef.current) return;
            if (!panelRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, []);

    return (
        <div className="ui-customizer" ref={panelRef}>
            <button
                className={`nav-link icon-btn ui-customizer__trigger${open ? ' active' : ''}`}
                onClick={() => setOpen(v => !v)}
                aria-label="Customize UI"
            >
                <SlidersHorizontal size={18} />
            </button>
            {open && (
                <div className="ui-customizer__panel">
                    <div className="ui-customizer__section">
                        <span className="ui-customizer__label">Accent</span>
                        <div className="ui-customizer__chips">
                            {Object.keys(ACCENTS).map((name) => (
                                <button
                                    key={name}
                                    className={`ui-chip${prefs.accent === name ? ' active' : ''}`}
                                    onClick={() => setPrefs((p) => ({ ...p, accent: name }))}
                                >
                                    {prefs.accent === name && <Check size={12} />}
                                    {name}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="ui-customizer__section">
                        <span className="ui-customizer__label">Density</span>
                        <div className="ui-customizer__chips">
                            <button className={`ui-chip${prefs.density === 'cozy' ? ' active' : ''}`} onClick={() => setPrefs((p) => ({ ...p, density: 'cozy' }))}>cozy</button>
                            <button className={`ui-chip${prefs.density === 'compact' ? ' active' : ''}`} onClick={() => setPrefs((p) => ({ ...p, density: 'compact' }))}>compact</button>
                        </div>
                    </div>
                    <div className="ui-customizer__section">
                        <span className="ui-customizer__label">Motion</span>
                        <div className="ui-customizer__chips">
                            <button className={`ui-chip${prefs.motion === 'normal' ? ' active' : ''}`} onClick={() => setPrefs((p) => ({ ...p, motion: 'normal' }))}>normal</button>
                            <button className={`ui-chip${prefs.motion === 'reduced' ? ' active' : ''}`} onClick={() => setPrefs((p) => ({ ...p, motion: 'reduced' }))}>reduced</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MobileNav() {
    const { isAuthenticated } = useAuth();
    const tabs = [
        { path: '/',        icon: <Flame size={22} />,      label: 'Home' },
        { path: '/browse',  icon: <LayoutGrid size={22} />, label: 'Browse' },
        { path: '/search',  icon: <Search size={22} />,     label: 'Search' },
        { path: isAuthenticated ? '/library' : '/auth', icon: <BookOpen size={22} />, label: isAuthenticated ? 'Library' : 'Login', accent: true },
    ];
    return (
        <nav className="mobile-bottom-nav">
            {tabs.map(tab => (
                <NavLink
                    key={tab.path} to={tab.path} end={tab.path === '/'}
                    className={({ isActive }) => `mobile-tab${tab.accent ? ' mobile-tab--library' : ''}${isActive ? ' active' : ''}`}
                >
                    {tab.icon}<span>{tab.label}</span>
                </NavLink>
            ))}
        </nav>
    );
}

function WrappedRoute({ element, resetKey }) {
    return <RouteErrorBoundary resetKey={resetKey}>{element}</RouteErrorBoundary>;
}

function App() {
    const { user, isAuthenticated, logout } = useAuth();

    useEffect(() => {
        const hash = window.location.hash;
        if (hash && hash.includes('access_token')) {
            const params = new URLSearchParams(hash.substring(1));
            const token = params.get('access_token');
            if (token) {
                localStorage.setItem('anilist_token', token);
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
                // We don't reload immediately because we want to sync to Firebase if user is logged in.
            }
        }
        
        // If we have a local token and a logged-in user, ensure it's in Firebase
        const localToken = localStorage.getItem('anilist_token');
        if (localToken && user && db) {
            setDoc(doc(db, 'users', user.uid), { anilistToken: localToken }, { merge: true }).catch(e => console.error("Failed to sync anilist token to firebase", e));
        }
    }, [user]);

    return (
        <ErrorBoundary>
            <BrowserRouter>
                <ScrollToTop />
                <AppInit />
                <div className="app-container">
                    <header className="site-header">
                        <div className="header-content">
                            <NavLink to="/" className="logo">
                                <div className="logo-icon-wrapper">
                                    <img
                                        src="/brand/logo-512.jpg"
                                        alt="Atsumaru logo"
                                        className="logo-icon-img"
                                    />
                                </div>
                                <span className="logo-text">Atsu<span className="logo-accent">maru</span></span>
                            </NavLink>

                            <nav className="site-nav desktop-nav">
                                <NavLink to="/"      end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Flame size={16} /> Home</NavLink>
                                <NavLink to="/browse"    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><LayoutGrid size={16} /> Browse</NavLink>
                                <NavLink to="/search"    className={({ isActive }) => `nav-link icon-btn ${isActive ? 'active' : ''}`}><Search size={18} /></NavLink>
                                <NavLink to="/leaderboard" className={({ isActive }) => `nav-link icon-btn ${isActive ? 'active' : ''}`} title="Leaderboard"><Trophy size={18} /></NavLink>
                                <UICustomizer />
                                <NotificationBell />
                                <NavLink to={isAuthenticated ? '/library' : '/auth'} className={({ isActive }) => `nav-link nav-link--library ${isActive ? 'active' : ''}`}>
                                    <BookOpen size={16} /> {isAuthenticated ? 'Library' : 'Login'}
                                </NavLink>
                                {isAuthenticated && (
                                    <NavLink to={`/u/${user.uid}`} className="nav-link auth-user-pill" title="Profile">
                                        <UserAvatar 
                                            src={user?.photoURL} 
                                            config={user?.avatarConfig}
                                            alt="" 
                                            className="nav-user-avatar" 
                                            style={{width: 20, height: 20, borderRadius: '50%'}} 
                                        />
                                        {user?.displayName || 'Profile'}
                                    </NavLink>
                                )}
                            </nav>
                        </div>
                    </header>

                    <main>
                        <Routes>
                            <Route path="/"                         element={<WrappedRoute element={<Home />}       resetKey="home" />} />
                            <Route path="/search"                   element={<WrappedRoute element={<SearchPage />} resetKey="search" />} />
                            <Route path="/library"                  element={<WrappedRoute element={<ProtectedRoute><Library /></ProtectedRoute>}    resetKey="library" />} />
                            <Route path="/browse"                   element={<WrappedRoute element={<Browse />}     resetKey="browse" />} />
                            <Route path="/auth"                     element={<WrappedRoute element={<AuthPage />}   resetKey="auth" />} />
                            <Route path="/u/:userId"                element={<WrappedRoute element={<Profile />}    resetKey="profile" />} />
                            <Route path="/leaderboard"              element={<WrappedRoute element={<Leaderboard />} resetKey="leaderboard" />} />
                            <Route path="/manga/:id"                element={<MangaDetailsRoute />} />
                            <Route path="/read/:mangaId/:chapterId" element={<ReaderRoute />} />
                            <Route path="*"                         element={<NotFound />} />
                        </Routes>
                    </main>

                    <MobileNav />
                    <ToastContainer />
                </div>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

function MangaDetailsRoute() {
    const { id } = useParams();
    return <RouteErrorBoundary resetKey={id}><MangaDetails /></RouteErrorBoundary>;
}

function ReaderRoute() {
    const { mangaId, chapterId } = useParams();
    return <RouteErrorBoundary resetKey={`${mangaId}-${chapterId}`}><Reader /></RouteErrorBoundary>;
}

function NotFound() {
    return (
        <div className="page-container" style={{ textAlign: 'center', paddingTop: 100 }}>
            <h1 style={{ fontSize: 72, opacity: 0.3 }}>404</h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>Page not found.</p>
            <NavLink to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Go Home</NavLink>
        </div>
    );
}

export default App;
