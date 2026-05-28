import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMangaDetails, getChapterPages } from '../api_routes/mangaAdapter';
import { useTrackerStore } from '../store/trackerStore';
import { usePagePreloader } from '../hooks/usePagePreloader';
import ChapterEndUI from '../components/reader/ChapterEndUI';
import {
    ArrowLeft, ImageOff, Loader2, ChevronDown, List, Settings, X,
    Maximize2, Palette, Sun, AlignJustify, Columns, SkipForward, Crop,
    EyeOff, Keyboard, RotateCcw, ChevronLeft, ChevronRight, Contrast,
    ZoomIn, BookOpen, Layers, Sliders, Info, ChevronsLeft, ChevronsRight,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Default settings
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
    readingDirection: 'ltr',
    pageView:         'single',
    fitMode:          'width',
    pageGap:          8,
    pageMaxWidth:     800,
    pageTransition:   'none',
    theme:            'black',
    customBg:         '#0d0d0d',
    customText:       '#eeeeee',
    brightness:       100,
    contrast:         100,
    saturation:       100,
    autoNextChapter:  true,
    cropMargins:      false,
    hideUI:           false,
    clickToFlip:      true,
    scrollAmount:     3,
    shortcuts: {
        nextPage:     'ArrowRight',
        prevPage:     'ArrowLeft',
        nextChapter:  'Period',
        prevChapter:  'Comma',
        toggleUI:     'KeyH',
        openSettings: 'KeyS',
        goBack:       'Escape',
        zoomIn:       'Equal',
        zoomOut:      'Minus',
    },
    zoom: 100,
};

const STORAGE_KEY = 'manga-reader-settings-v2';

function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) : {};
        return {
            ...DEFAULT_SETTINGS,
            ...saved,
            shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(saved.shortcuts ?? {}) },
        };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}
function saveSettings(s) {
    // Don't persist zoom — it's a runtime-only value
    const { zoom: _zoom, ...toSave } = s;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch { /**/ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme map
// ─────────────────────────────────────────────────────────────────────────────
const THEME_MAP = {
    black: { bg: '#000000', color: '#ffffff', label: 'Black' },
    dark:  { bg: '#111318', color: '#eeeeee', label: 'Dark'  },
    gray:  { bg: '#2e2e2e', color: '#eeeeee', label: 'Gray'  },
    white: { bg: '#ffffff', color: '#111111', label: 'White' },
    sepia: { bg: '#f4ead5', color: '#3b2f1e', label: 'Sepia' },
};

function resolveTheme(settings) {
    if (settings.theme === 'custom') return { bg: settings.customBg, color: settings.customText };
    return THEME_MAP[settings.theme] ?? THEME_MAP.black;
}

// ─────────────────────────────────────────────────────────────────────────────
// Key label helper
// ─────────────────────────────────────────────────────────────────────────────
function keyLabel(code) {
    if (!code) return '—';
    const map = {
        ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓',
        Space: 'Space', Escape: 'Esc', Enter: 'Enter', Backspace: '⌫',
        Period: '.', Comma: ',', Slash: '/', Backslash: '\\',
        Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']',
        Semicolon: ';', Quote: "'",
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('F') && code.length <= 3) return code;
    return code;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chapter Jumper
// ─────────────────────────────────────────────────────────────────────────────
function ChapterJumper({ chapters, currentId, mangaId, navigate }) {
    const [open, setOpen]     = useState(false);
    const [search, setSearch] = useState('');
    const ref                 = useRef(null);
    const searchRef           = useRef(null);
    const listRef             = useRef(null);

    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => {
        if (!open) { const t = setTimeout(() => setSearch(''), 0); return () => clearTimeout(t); }
        const t1 = setTimeout(() => searchRef.current?.focus(), 50);
        const t2 = setTimeout(() => {
            listRef.current?.querySelector('.cj-item--active')
                ?.scrollIntoView({ block: 'center', behavior: 'instant' });
        }, 60);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [open]);

    const current  = chapters.find(c => c.id === currentId);
    const filtered = search.trim()
        ? chapters.filter(ch =>
            String(ch.number).includes(search) ||
            (ch.title ?? '').toLowerCase().includes(search.toLowerCase()))
        : chapters;

    return (
        <div className="cj-wrap" ref={ref}>
            <button className="cj-trigger" onClick={() => setOpen(v => !v)} title="Jump to chapter">
                <List size={15} />
                <span>{current ? `Ch. ${current.number}` : '—'}</span>
                <ChevronDown size={13} className={`cj-chevron${open ? ' cj-chevron--open' : ''}`} />
            </button>
            {open && (
                <div className="cj-panel">
                    <div className="cj-search-wrap">
                        <input ref={searchRef} className="cj-search" type="text"
                            placeholder="Search chapter…" value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && filtered.length === 1) { setOpen(false); navigate(`/read/${mangaId}/${filtered[0].id}`); }
                                if (e.key === 'Escape') setOpen(false);
                            }} />
                        <span className="cj-count">{filtered.length}/{chapters.length}</span>
                    </div>
                    <div className="cj-list" ref={listRef}>
                        {filtered.length === 0 && <div className="cj-empty">No chapters match</div>}
                        {filtered.map(ch => {
                            const isActive = ch.id === currentId;
                            const hasTitle = ch.title && ch.title !== `Chapter ${ch.number}`;
                            return (
                                <button key={ch.id}
                                    className={`cj-item${isActive ? ' cj-item--active' : ''}`}
                                    onClick={() => { setOpen(false); navigate(`/read/${mangaId}/${ch.id}`); }}>
                                    <span className="cj-num">Ch. {ch.number}</span>
                                    {hasTitle && <span className="cj-title">{ch.title}</span>}
                                    {ch.pageCount && <span className="cj-pages">{ch.pageCount}p</span>}
                                    {isActive && <span className="cj-current-dot" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings panel sub-components
// ─────────────────────────────────────────────────────────────────────────────
function ToggleRow({ icon, label, desc, settingKey, settings, onSet }) {
    return (
        <div className="rs-row">
            <div className="rs-row-left">
                {icon && <span className="rs-row-icon">{icon}</span>}
                <div>
                    <span className="rs-label">{label}</span>
                    {desc && <div className="rs-desc">{desc}</div>}
                </div>
            </div>
            <button
                className={`rs-toggle${settings[settingKey] ? ' active' : ''}`}
                onClick={() => onSet(settingKey, !settings[settingKey])}
                aria-pressed={settings[settingKey]}>
                <span className="rs-toggle-thumb" />
            </button>
        </div>
    );
}

function SegmentRow({ icon, label, desc, settingKey, options, settings, onSet }) {
    return (
        <div className="rs-row rs-row--col">
            <div className="rs-row-left">
                {icon && <span className="rs-row-icon">{icon}</span>}
                <div>
                    <span className="rs-label">{label}</span>
                    {desc && <div className="rs-desc">{desc}</div>}
                </div>
            </div>
            <div className="rs-segments">
                {options.map(o => (
                    <button key={o.value}
                        className={`rs-seg${settings[settingKey] === o.value ? ' active' : ''}`}
                        onClick={() => onSet(settingKey, o.value)}>
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function SliderRow({ icon, label, settingKey, min, max, step, unit, settings, onSet }) {
    const val = settings[settingKey];
    return (
        <div className="rs-row rs-row--col">
            <div className="rs-label-row">
                <div className="rs-row-left">
                    {icon && <span className="rs-row-icon">{icon}</span>}
                    <span className="rs-label">{label}</span>
                </div>
                <span className="rs-value">{val}{unit}</span>
            </div>
            <input type="range" className="rs-slider"
                min={min} max={max} step={step} value={val}
                style={{ '--val': val, '--min': min, '--max': max }}
                onChange={e => onSet(settingKey, Number(e.target.value))} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shortcut recorder row
// ─────────────────────────────────────────────────────────────────────────────
function ShortcutRow({ label, actionKey, shortcuts, onChange }) {
    const [recording, setRecording] = useState(false);
    const btnRef = useRef(null);

    useEffect(() => {
        if (!recording) return;
        const handler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.code === 'Escape') { setRecording(false); return; }
            // Prevent setting a shortcut already used by another action
            onChange(actionKey, e.code);
            setRecording(false);
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [recording, actionKey, onChange]);

    return (
        <div className="rs-shortcut-row">
            <span className="rs-shortcut-label">{label}</span>
            <button
                ref={btnRef}
                className={`rs-shortcut-key${recording ? ' recording' : ''}`}
                onClick={() => setRecording(v => !v)}
                title={recording ? 'Press any key (Esc to cancel)' : 'Click to remap'}>
                {recording ? <span className="rs-shortcut-pulse">Press key…</span> : keyLabel(shortcuts[actionKey])}
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Panel  (tabbed)
// ─────────────────────────────────────────────────────────────────────────────
const SETTINGS_TABS = [
    { id: 'layout',     label: 'Layout',  icon: <Layers size={14} /> },
    { id: 'appearance', label: 'Look',    icon: <Palette size={14} /> },
    { id: 'behaviour',  label: 'Feel',    icon: <Sliders size={14} /> },
    { id: 'shortcuts',  label: 'Keys',    icon: <Keyboard size={14} /> },
];

const SHORTCUT_ACTIONS = [
    { key: 'nextPage',     label: 'Next Page'      },
    { key: 'prevPage',     label: 'Prev Page'       },
    { key: 'nextChapter',  label: 'Next Chapter'    },
    { key: 'prevChapter',  label: 'Prev Chapter'    },
    { key: 'toggleUI',     label: 'Toggle UI'       },
    { key: 'openSettings', label: 'Open Settings'   },
    { key: 'goBack',       label: 'Back to Manga'   },
    { key: 'zoomIn',       label: 'Zoom In'         },
    { key: 'zoomOut',      label: 'Zoom Out'        },
];

function SettingsPanel({ settings, onChange, onClose }) {
    const [tab, setTab] = useState('layout');
    const ref = useRef(null);

    useEffect(() => {
        const h = (e) => {
            if (ref.current && !ref.current.contains(e.target)) onClose();
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [onClose]);

    const set = (key, val) => onChange({ ...settings, [key]: val });
    const setShortcut = (actionKey, code) => onChange({
        ...settings,
        shortcuts: { ...settings.shortcuts, [actionKey]: code },
    });

    return (
        <div className="rs-panel rs-panel--wide" ref={ref} role="dialog" aria-label="Reader Settings">
            <div className="rs-header">
                <span className="rs-title">Reader Settings</span>
                <button className="rs-close" onClick={onClose} aria-label="Close"><X size={14} /></button>
            </div>

            {/* Tab bar */}
            <div className="rs-tabs">
                {SETTINGS_TABS.map(t => (
                    <button key={t.id}
                        className={`rs-tab${tab === t.id ? ' active' : ''}`}
                        onClick={() => setTab(t.id)}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            <div className="rs-body">

                {/* ── LAYOUT ── */}
                {tab === 'layout' && <>
                    <SegmentRow
                        icon={<AlignJustify size={14} />} label="Reading Direction"
                        desc="Direction pages flow when flipping"
                        settingKey="readingDirection"
                        options={[
                            { value: 'ltr',      label: '→ L→R' },
                            { value: 'rtl',      label: '← R→L' },
                            { value: 'vertical', label: '↓ Scroll' },
                        ]}
                        settings={settings} onSet={set} />

                    <SegmentRow
                        icon={<Columns size={14} />} label="Page View"
                        desc="Show one or two pages at once"
                        settingKey="pageView"
                        options={[
                            { value: 'single', label: 'Single' },
                            { value: 'double', label: 'Double' },
                        ]}
                        settings={settings} onSet={set} />

                    <SegmentRow
                        icon={<Maximize2 size={14} />} label="Fit Mode"
                        desc="How each page is sized to the screen"
                        settingKey="fitMode"
                        options={[
                            { value: 'width',    label: 'Width'    },
                            { value: 'height',   label: 'Height'   },
                            { value: 'contain',  label: 'Fit'      },
                            { value: 'original', label: 'Original' },
                        ]}
                        settings={settings} onSet={set} />

                    <SegmentRow
                        icon={<Layers size={14} />} label="Page Transition"
                        desc="Animation when changing pages"
                        settingKey="pageTransition"
                        options={[
                            { value: 'none',  label: 'None'  },
                            { value: 'slide', label: 'Slide' },
                            { value: 'fade',  label: 'Fade'  },
                        ]}
                        settings={settings} onSet={set} />

                    <SliderRow
                        icon={<ZoomIn size={14} />} label="Zoom"
                        settingKey="zoom" min={50} max={200} step={5} unit="%"
                        settings={settings} onSet={set} />

                    <SliderRow
                        icon={<Layers size={14} />} label="Page Max Width"
                        settingKey="pageMaxWidth" min={400} max={1600} step={50} unit="px"
                        settings={settings} onSet={set} />

                    <SliderRow
                        icon={<Layers size={14} />} label="Page Gap"
                        settingKey="pageGap" min={0} max={40} step={2} unit="px"
                        settings={settings} onSet={set} />
                </>}

                {/* ── APPEARANCE ── */}
                {tab === 'appearance' && <>
                    <div className="rs-row rs-row--col">
                        <div className="rs-row-left">
                            <span className="rs-row-icon"><Palette size={14} /></span>
                            <span className="rs-label">Background Theme</span>
                        </div>
                        <div className="rs-themes">
                            {Object.entries(THEME_MAP).map(([val, t]) => (
                                <button key={val}
                                    className={`rs-theme-btn${settings.theme === val ? ' active' : ''}`}
                                    style={{ background: t.bg, border: `2.5px solid ${settings.theme === val ? 'var(--accent)' : 'transparent'}` }}
                                    onClick={() => set('theme', val)}
                                    title={t.label} aria-label={t.label}>
                                    {settings.theme === val && <span className="rs-theme-check">✓</span>}
                                </button>
                            ))}
                            {/* Custom */}
                            <button
                                className={`rs-theme-btn rs-theme-btn--custom${settings.theme === 'custom' ? ' active' : ''}`}
                                onClick={() => set('theme', 'custom')}
                                title="Custom" aria-label="Custom color"
                                style={{ background: settings.customBg, border: `2.5px solid ${settings.theme === 'custom' ? 'var(--accent)' : 'transparent'}` }}>
                                <Palette size={12} style={{ color: settings.customText }} />
                            </button>
                        </div>
                        <div className="rs-theme-labels">
                            {Object.entries(THEME_MAP).map(([val, t]) => (
                                <span key={val} className={`rs-theme-label${settings.theme === val ? ' active' : ''}`}>{t.label}</span>
                            ))}
                            <span className={`rs-theme-label${settings.theme === 'custom' ? ' active' : ''}`}>Custom</span>
                        </div>
                    </div>

                    {settings.theme === 'custom' && (
                        <div className="rs-custom-colors">
                            <label className="rs-color-row">
                                <span className="rs-label">Background</span>
                                <span className="rs-color-swatch-wrap">
                                    <input type="color" className="rs-color-input"
                                        value={settings.customBg}
                                        onChange={e => set('customBg', e.target.value)} />
                                    <span className="rs-color-hex">{settings.customBg}</span>
                                </span>
                            </label>
                            <label className="rs-color-row">
                                <span className="rs-label">Text / UI</span>
                                <span className="rs-color-swatch-wrap">
                                    <input type="color" className="rs-color-input"
                                        value={settings.customText}
                                        onChange={e => set('customText', e.target.value)} />
                                    <span className="rs-color-hex">{settings.customText}</span>
                                </span>
                            </label>
                        </div>
                    )}

                    <div className="rs-divider" />

                    <SliderRow icon={<Sun size={14} />}      label="Brightness" settingKey="brightness" min={30} max={150} step={5} unit="%" settings={settings} onSet={set} />
                    <SliderRow icon={<Contrast size={14} />} label="Contrast"   settingKey="contrast"   min={50} max={200} step={5} unit="%" settings={settings} onSet={set} />
                    <SliderRow icon={<Palette size={14} />}  label="Saturation" settingKey="saturation" min={0}  max={200} step={5} unit="%" settings={settings} onSet={set} />
                </>}

                {/* ── BEHAVIOUR ── */}
                {tab === 'behaviour' && <>
                    <ToggleRow icon={<SkipForward size={14} />} label="Auto-next Chapter"
                        desc="Automatically load next chapter at end"
                        settingKey="autoNextChapter" settings={settings} onSet={set} />
                    <ToggleRow icon={<Crop size={14} />} label="Crop White Margins"
                        desc="Trims excess whitespace around pages"
                        settingKey="cropMargins" settings={settings} onSet={set} />
                    <ToggleRow icon={<EyeOff size={14} />} label="Immersive Mode"
                        desc="Hide header/footer; hover/tap to reveal"
                        settingKey="hideUI" settings={settings} onSet={set} />
                    <ToggleRow icon={<BookOpen size={14} />} label="Click to Flip"
                        desc="Click left/right third of screen to navigate"
                        settingKey="clickToFlip" settings={settings} onSet={set} />

                    <div className="rs-divider" />

                    <SliderRow icon={<ChevronDown size={14} />} label="Scroll Speed"
                        settingKey="scrollAmount" min={1} max={10} step={1} unit="×"
                        settings={settings} onSet={set} />
                </>}

                {/* ── SHORTCUTS ── */}
                {tab === 'shortcuts' && <>
                    <div className="rs-shortcut-info">
                        <Info size={13} /> Click a key badge then press your desired key. Esc cancels.
                    </div>
                    <div className="rs-shortcut-list">
                        {SHORTCUT_ACTIONS.map(a => (
                            <ShortcutRow key={a.key} label={a.label}
                                actionKey={a.key}
                                shortcuts={settings.shortcuts}
                                onChange={setShortcut} />
                        ))}
                    </div>
                    <button className="rs-reset rs-reset--shortcuts"
                        onClick={() => onChange({ ...settings, shortcuts: { ...DEFAULT_SETTINGS.shortcuts } })}>
                        <RotateCcw size={12} /> Reset shortcuts to defaults
                    </button>
                </>}
            </div>

            {/* Footer */}
            <div className="rs-footer">
                <button className="rs-reset" onClick={() => onChange({ ...DEFAULT_SETTINGS })}>
                    <RotateCcw size={12} /> Reset all to defaults
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress bar
// ─────────────────────────────────────────────────────────────────────────────
function ReadingProgress({ current, total }) {
    const pct = total > 0 ? Math.round((current / Math.max(total - 1, 1)) * 100) : 0;
    return (
        <div className="rdr-progress-bar" style={{ '--pct': `${pct}%` }} title={`${pct}% read`} />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Click zones overlay
// ─────────────────────────────────────────────────────────────────────────────
function ClickZones({ onNext, onPrev, enabled }) {
    if (!enabled) return null;
    return (
        <div className="rdr-click-zones" aria-hidden="true">
            <div className="rdr-click-zone rdr-click-zone--left"  onClick={onPrev} />
            <div className="rdr-click-zone rdr-click-zone--mid"   />
            <div className="rdr-click-zone rdr-click-zone--right" onClick={onNext} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast notification (replaces jarring alert())
// ─────────────────────────────────────────────────────────────────────────────
function ReaderToast({ message, onDismiss }) {
    useEffect(() => {
        const t = setTimeout(onDismiss, 2800);
        return () => clearTimeout(t);
    }, [onDismiss]);
    return (
        <div className="rdr-toast" onClick={onDismiss}>
            {message}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Reader
// ─────────────────────────────────────────────────────────────────────────────
export default function Reader() {
    const { mangaId, chapterId } = useParams();
    const navigate = useNavigate();

    const [manga, setManga]               = useState(null);
    const [pages, setPages]               = useState([]);
    const [loading, setLoading]           = useState(true);
    const [pagesLoading, setPagesLoading] = useState(false);
    const [currentPage, setCurrentPage]   = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settings, setSettings]         = useState(loadSettings);
    const [headerVisible, setHeaderVisible] = useState(true);
    const [lastActivity, setLastActivity]   = useState(Date.now());
    const [readerToast, setReaderToast]     = useState(null);

    const { savePageProgress, getSavedPage, markChapterRead, markAuthenticChapterRead, addReadingTime, recordVisit } = useTrackerStore();
    const containerRef = useRef(null);
    const pageRefs     = useRef([]);
    const observerRef  = useRef(null);
    const viewedPages  = useRef(new Set());
    const [initialRestoreDone, setInitialRestoreDone] = useState(false);

    usePagePreloader(pages, currentPage);

    // Persist settings (excluding runtime zoom)
    useEffect(() => { saveSettings(settings); }, [settings]);

    // ── Global Activity Tracker ───────────────────────────────────────────────
    const hideUIRef = useRef(settings.hideUI);
    useEffect(() => { hideUIRef.current = settings.hideUI; }, [settings.hideUI]);

    useEffect(() => {
        const updateActivity = () => {
            setLastActivity(Date.now());
            if (hideUIRef.current) setHeaderVisible(true);
        };

        window.addEventListener('mousemove', updateActivity);
        window.addEventListener('touchstart', updateActivity, { passive: true });
        window.addEventListener('keydown', updateActivity);
        window.addEventListener('scroll', updateActivity, { passive: true });

        const timer = setInterval(() => {
            if (hideUIRef.current) {
                setLastActivity(prev => {
                    if (Date.now() - prev > 2500) setHeaderVisible(false);
                    return prev;
                });
            }
        }, 500);

        return () => {
            window.removeEventListener('mousemove', updateActivity);
            window.removeEventListener('touchstart', updateActivity);
            window.removeEventListener('keydown', updateActivity);
            window.removeEventListener('scroll', updateActivity);
            clearInterval(timer);
        };
    }, []); // intentionally empty

    // ── Reading Time Tracker ──────────────────────────────────────────────────
    useEffect(() => {
        if (!mangaId) return;
        let lastTick = Date.now();
        const IDLE_TIMEOUT = 60000;

        const tick = setInterval(() => {
            const now = Date.now();
            if (document.visibilityState === 'visible' && (now - lastActivity < IDLE_TIMEOUT)) {
                addReadingTime(mangaId, now - lastTick);
            }
            lastTick = now;
        }, 5000);

        return () => clearInterval(tick);
    }, [mangaId, lastActivity, addReadingTime]);

    // ── 1. Load manga ─────────────────────────────────────────────────────────
    useEffect(() => {
        let alive = true;
        setLoading(true);
        getMangaDetails(mangaId, true).then(data => {
            if (alive) { setManga(data); setLoading(false); }
        });
        return () => { alive = false; };
    }, [mangaId]);

    // ── 2. Fetch pages ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!chapterId || !mangaId) return;
        let alive = true;
        setPagesLoading(true); setPages([]);
        setCurrentPage(0);
        viewedPages.current.clear();
        setInitialRestoreDone(false);
        const knownPageCount = manga?.chapters?.find(c => c.id === chapterId)?.pageCount ?? null;
        getChapterPages(mangaId, chapterId, knownPageCount)
            .then(urls => { if (alive) { setPages(Array.isArray(urls) ? urls : []); setPagesLoading(false); } })
            .catch(() => { if (alive) setPagesLoading(false); });
        return () => { alive = false; };
    }, [mangaId, chapterId, manga]);

    // ── 3. Restore saved page ─────────────────────────────────────────────────
    useEffect(() => {
        if (pagesLoading || pages.length === 0) return;
        const saved = getSavedPage(mangaId, chapterId);
        
        const timer = setTimeout(() => {
            if (saved > 0 && saved < pages.length) {
                setCurrentPage(saved);
                pageRefs.current[saved]?.scrollIntoView({ behavior: 'instant', block: 'start' });
            } else {
                setCurrentPage(0);
                if (containerRef.current) containerRef.current.scrollTop = 0;
            }
            setInitialRestoreDone(true);
        }, 150);

        return () => clearTimeout(timer);
    }, [pages, pagesLoading, chapterId, mangaId]); // eslint-disable-line

    // ── 4. IntersectionObserver ───────────────────────────────────────────────
    useEffect(() => {
        if (pages.length === 0 || !initialRestoreDone) return;
        observerRef.current?.disconnect();
        observerRef.current = new IntersectionObserver(
            (entries) => {
                let best = null;
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const idx = Number(entry.target.dataset.pageIndex);
                        if (!isNaN(idx)) viewedPages.current.add(idx);
                        if (!best || entry.intersectionRatio > best.intersectionRatio) best = entry;
                    }
                });
                if (best) {
                    const idx = Number(best.target.dataset.pageIndex);
                    if (!isNaN(idx)) setCurrentPage(idx);
                }
            },
            { root: containerRef.current, threshold: [0.1, 0.5, 1.0] }
        );
        pageRefs.current.forEach(el => { if (el) observerRef.current.observe(el); });
        return () => observerRef.current?.disconnect();
    }, [pages, initialRestoreDone]);

    // ── 5. Save progress ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!chapterId || pages.length === 0) return;
        savePageProgress(mangaId, chapterId, currentPage);
        if (manga) {
            recordVisit(mangaId, manga);
        }
        if (currentPage >= pages.length - 1) {
            markChapterRead(mangaId, chapterId);
            if (viewedPages.current.size >= pages.length * 0.9) {
                markAuthenticChapterRead(mangaId, chapterId);
            }
        }
    }, [currentPage, chapterId, mangaId, pages.length, savePageProgress, markChapterRead, markAuthenticChapterRead, manga, recordVisit]);

    const currentChapter = manga?.chapters?.find(c => c.id === chapterId) ?? null;
    const chapterIndex   = manga?.chapters?.findIndex(c => c.id === chapterId) ?? -1;
    const pageCount      = pages.length;

    const lastImagePageIdx = settings.pageView === 'double'
        ? Math.max(0, Math.floor((pageCount - 1) / 2) * 2)
        : Math.max(0, pageCount - 1);

    // ── Navigation: chapters sorted newest-first (index 0 = newest)
    // "Next chapter" = chronologically forward = lower array index
    // "Prev chapter" = chronologically backward = higher array index
    const goNext = useCallback(() => {
        const maxPage = settings.readingDirection === 'vertical' ? lastImagePageIdx : pageCount;
        if (currentPage < maxPage) {
            let next = currentPage + (settings.pageView === 'double' ? 2 : 1);
            if (next > maxPage) next = maxPage;
            setCurrentPage(next);
            if (next <= lastImagePageIdx) {
                pageRefs.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else if (settings.autoNextChapter && chapterIndex > 0) {
            // chapterIndex - 1 is the chronologically next chapter (newer → lower index)
            navigate(`/read/${mangaId}/${manga.chapters[chapterIndex - 1].id}`);
        }
    }, [currentPage, pageCount, lastImagePageIdx, chapterIndex, manga, mangaId, navigate, settings.autoNextChapter, settings.readingDirection, settings.pageView]);

    const goPrev = useCallback(() => {
        if (currentPage > 0) {
            let prev = currentPage - (settings.pageView === 'double' ? 2 : 1);
            if (currentPage >= pageCount) {
                prev = lastImagePageIdx;
            } else if (prev < 0) {
                prev = 0;
            }
            setCurrentPage(prev);
            if (prev <= lastImagePageIdx) {
                pageRefs.current[prev]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else if (chapterIndex >= 0 && chapterIndex < (manga?.chapters?.length ?? 0) - 1) {
            // chapterIndex + 1 is the chronologically previous chapter (older → higher index)
            navigate(`/read/${mangaId}/${manga.chapters[chapterIndex + 1].id}`);
        }
    }, [currentPage, chapterIndex, manga, mangaId, navigate, settings.pageView, pageCount, lastImagePageIdx]);

    // FIX: goNextChapter and goPrevChapter were swapped in naming.
    // Chapters are newest-first. "Next chapter" (chronologically forward) = chapterIndex - 1.
    // "Prev chapter" (chronologically backward) = chapterIndex + 1.
    const goNextChapter = useCallback(() => {
        if (chapterIndex > 0 && manga?.chapters)
            navigate(`/read/${mangaId}/${manga.chapters[chapterIndex - 1].id}`);
    }, [chapterIndex, manga, mangaId, navigate]);

    const goPrevChapter = useCallback(() => {
        if (chapterIndex >= 0 && manga?.chapters && chapterIndex < manga.chapters.length - 1)
            navigate(`/read/${mangaId}/${manga.chapters[chapterIndex + 1].id}`);
    }, [chapterIndex, manga, mangaId, navigate]);

    // ── 6. Keyboard shortcuts ─────────────────────────────────────────────────
    useEffect(() => {
        const sc = settings.shortcuts;
        const handler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const code = e.code;
            if (code === sc.nextPage)     { e.preventDefault(); settings.readingDirection === 'rtl' ? goPrev() : goNext(); }
            else if (code === sc.prevPage)     { e.preventDefault(); settings.readingDirection === 'rtl' ? goNext() : goPrev(); }
            else if (code === sc.nextChapter)  { e.preventDefault(); goNextChapter(); }
            else if (code === sc.prevChapter)  { e.preventDefault(); goPrevChapter(); }
            else if (code === sc.toggleUI)     { e.preventDefault(); setSettings(s => ({ ...s, hideUI: !s.hideUI })); }
            else if (code === sc.openSettings) { e.preventDefault(); setSettingsOpen(v => !v); }
            else if (code === sc.goBack)       {
                if (settingsOpen) setSettingsOpen(false);
                else navigate(`/manga/${mangaId}`);
            }
            else if (code === sc.zoomIn)  { e.preventDefault(); setSettings(s => ({ ...s, zoom: Math.min(200, s.zoom + 10) })); }
            else if (code === sc.zoomOut) { e.preventDefault(); setSettings(s => ({ ...s, zoom: Math.max(50,  s.zoom - 10) })); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [goNext, goPrev, goNextChapter, goPrevChapter, navigate, mangaId, settingsOpen, settings.shortcuts, settings.readingDirection]);

    // ── 7. Swipe ──────────────────────────────────────────────────────────────
    const touchStartX = useRef(null);
    const touchStartY = useRef(null);
    useEffect(() => {
        const onTouchStart = (e) => {
            touchStartX.current = e.touches[0].clientX;
            touchStartY.current = e.touches[0].clientY;
        };
        const onTouchEnd = (e) => {
            if (touchStartX.current === null) return;
            const dx = touchStartX.current - e.changedTouches[0].clientX;
            const dy = touchStartY.current - e.changedTouches[0].clientY;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
                if (settings.readingDirection === 'rtl') {
                    dx > 0 ? goPrev() : goNext();
                } else {
                    dx > 0 ? goNext() : goPrev();
                }
            }
            touchStartX.current = null;
        };
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchend',   onTouchEnd,   { passive: true });
        return () => {
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchend',   onTouchEnd);
        };
    }, [goNext, goPrev, settings.readingDirection]);

    // ── Early returns ─────────────────────────────────────────────────────────
    if (loading) return (
        <div className="reader-loading-screen">
            <div className="reader-loading-inner">
                <div className="reader-loading-spinner">
                    <Loader2 size={32} className="spin-anim" />
                </div>
                <div className="reader-loading-text">
                    <span className="reader-loading-title">Loading Chapter</span>
                    <span className="reader-loading-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
            </div>
        </div>
    );
    if (!manga)          return <div className="error-state"><ImageOff size={32} /><p>Manga not found.</p></div>;
    if (!currentChapter) return <div className="error-state"><ImageOff size={32} /><p>Chapter not found.</p></div>;

    // ── Computed ──────────────────────────────────────────────────────────────
    const theme        = resolveTheme(settings);
    const wrapMaxWidth = settings.pageView === 'double'
        ? `${settings.pageMaxWidth * 2}px`
        : `${settings.pageMaxWidth}px`;
    const containerDir = settings.readingDirection === 'rtl' ? 'rtl' : 'ltr';

    const imgFilter = [
        `brightness(${settings.brightness}%)`,
        `contrast(${settings.contrast}%)`,
        `saturate(${settings.saturation}%)`,
    ].join(' ');

    const imgStyle = {
        filter: imgFilter,
        transform: settings.zoom !== 100 ? `scale(${settings.zoom / 100})` : undefined,
        transformOrigin: 'top center',
        ...(settings.fitMode === 'width'    && { width: '100%', height: 'auto' }),
        ...(settings.fitMode === 'height'   && { width: 'auto', height: '100vh', maxHeight: '100vh' }),
        ...(settings.fitMode === 'contain'  && { maxWidth: '100%', maxHeight: '100vh', width: 'auto', height: 'auto' }),
        ...(settings.fitMode === 'original' && { width: 'auto', height: 'auto', maxWidth: 'none' }),
        ...(settings.cropMargins            && { objectFit: 'cover' }),
    };

    const displayPages = settings.pageView === 'double'
        ? pages.reduce((acc, url, i) => {
            if (i % 2 === 0) acc.push([url, pages[i + 1] ?? null]);
            return acc;
          }, [])
        : pages.map(url => [url]);

    const uiHidden = settings.hideUI && !headerVisible;

    // FIX: isFirstPage now correctly reflects whether we're at the very beginning
    // (page 0 of the oldest chapter, which is the last in the array).
    const isFirstPage = currentPage === 0 && chapterIndex >= (manga?.chapters?.length ?? 1) - 1;
    // FIX: isLastPage should only disable the button when autoNextChapter is OFF
    // AND there's no next chapter to go to either.
    const isLastPage  = currentPage >= pageCount - 1
        && !settings.autoNextChapter
        && chapterIndex <= 0;

    const hasPrevChapter = chapterIndex < (manga?.chapters?.length ?? 1) - 1;
    const hasNextChapter = chapterIndex > 0;

    return (
        <div
            className={`reader-page${settings.hideUI ? ' reader-immersive' : ''}`}
            style={{ background: theme.bg, color: theme.color }}
        >
            {/* ── Thin progress bar ── */}
            <ReadingProgress current={currentPage} total={pageCount} />

            {/* ── Toast ── */}
            {readerToast && (
                <ReaderToast message={readerToast} onDismiss={() => setReaderToast(null)} />
            )}

            {/* ── Header ── */}
            <header className={`reader-header${uiHidden ? ' reader-header--hidden' : ''}`}
                style={{ background: `${theme.bg}ee` }}>
                <button onClick={() => navigate(`/manga/${mangaId}`)} className="btn-icon rdr-back" title="Back to manga">
                    <ArrowLeft size={16} /> <span className="rdr-back-text">Back</span>
                </button>

                <div className="reader-title">
                    <span className="reader-title__manga">{manga.title}</span>
                    <span className="reader-title__chapter">
                        {currentChapter.title && currentChapter.title !== `Chapter ${currentChapter.number}`
                            ? currentChapter.title
                            : `Chapter ${currentChapter.number ?? currentChapter.index}`}
                    </span>
                </div>

                <div className="reader-controls">
                    {/* Prev chapter */}
                    <button className="rdr-ctrl-btn" onClick={goPrevChapter}
                        disabled={!hasPrevChapter}
                        title={hasPrevChapter ? `Ch. ${manga.chapters[chapterIndex + 1]?.number}` : 'No previous chapter'}>
                        <ChevronsLeft size={16} />
                    </button>

                    <ChapterJumper
                        chapters={manga.chapters ?? []}
                        currentId={chapterId}
                        mangaId={mangaId}
                        navigate={navigate} />

                    {/* Next chapter */}
                    <button className="rdr-ctrl-btn" onClick={goNextChapter}
                        disabled={!hasNextChapter}
                        title={hasNextChapter ? `Ch. ${manga.chapters[chapterIndex - 1]?.number}` : 'No next chapter'}>
                        <ChevronsRight size={16} />
                    </button>

                    {/* Page counter */}
                    <div className="page-counter" title={`Page ${currentPage + 1} of ${pageCount}`}>
                        {pagesLoading
                            ? <Loader2 size={13} className="spin-anim" />
                            : <>{currentPage >= pageCount ? pageCount : currentPage + 1}<span className="page-counter__sep">/</span>{pageCount || '?'}</>}
                    </div>

                    {/* Settings */}
                    <div className="rs-wrap">
                        <button
                            className={`cj-trigger rs-btn${settingsOpen ? ' rs-btn--active' : ''}`}
                            onClick={() => setSettingsOpen(v => !v)}
                            title={`Reader settings (${keyLabel(settings.shortcuts.openSettings)})`}
                            aria-label="Open reader settings">
                            <Settings size={15} />
                            <span className="rdr-settings-text">Settings</span>
                        </button>
                        {settingsOpen && (
                            <>
                                <div className="rs-backdrop" onClick={() => setSettingsOpen(false)} />
                                <SettingsPanel
                                    settings={settings}
                                    onChange={setSettings}
                                    onClose={() => setSettingsOpen(false)} />
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Pages ── */}
            <div
                className={`reader-container${settings.readingDirection === 'vertical' ? ' reader-container--vertical' : ' reader-container--paged'}`}
                ref={containerRef}
                dir={containerDir}
                style={{ paddingBottom: settings.readingDirection === 'vertical' ? `${settings.pageGap}px` : undefined }}
            >
                {pagesLoading && (
                    <div className="rdr-pages-loading">
                        <Loader2 className="spin-anim" size={36} />
                        <p>Loading pages…</p>
                    </div>
                )}
                {!pagesLoading && pageCount === 0 && (
                    <div className="error-state">
                        <ImageOff size={32} />
                        <p>No pages found for this chapter.</p>
                    </div>
                )}

                {displayPages.map((pair, groupIdx) => {
                    const realIdx = settings.pageView === 'double' ? groupIdx * 2 : groupIdx;
                    const isActive = realIdx === currentPage;
                    return (
                        <div
                            key={groupIdx}
                            data-page-index={realIdx}
                            className={`reader-page-wrap transition-${settings.pageTransition}${isActive ? ' active' : ''}${settings.pageView === 'double' ? ' double' : ''}`}
                            ref={el => pageRefs.current[realIdx] = el}
                            style={{
                                maxWidth: wrapMaxWidth,
                                marginBottom: `${settings.pageGap}px`,
                            }}>
                            {pair.map((url, pIdx) => url ? (
                                <div key={pIdx} className="reader-img-slot">
                                    <img
                                        src={url}
                                        alt={`Page ${realIdx + pIdx + 1}`}
                                        loading={Math.abs(currentPage - realIdx) <= 2 ? 'eager' : 'lazy'}
                                        style={imgStyle}
                                        draggable={false}
                                        onError={e => {
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.nextElementSibling.style.display = 'flex';
                                        }} />
                                    <div className="img-error" style={{ display: 'none' }}>
                                        <ImageOff size={28} />
                                        <span>Page {realIdx + pIdx + 1} failed to load</span>
                                        <button className="rdr-retry-btn" onClick={(e) => {
                                            const errorDiv = e.currentTarget.parentElement;
                                            const img = errorDiv.previousElementSibling;
                                            try {
                                                const urlObj = new URL(img.src);
                                                urlObj.searchParams.set('retry', Date.now());
                                                img.src = urlObj.toString();
                                            } catch {
                                                img.src = img.src + (img.src.includes('?') ? '&' : '?') + 'retry=' + Date.now();
                                            }
                                            img.style.display = 'block';
                                            errorDiv.style.display = 'none';
                                        }}>
                                            <RotateCcw size={14} /> Retry
                                        </button>
                                    </div>
                                </div>
                            ) : null)}
                        </div>
                    );
                })}
                
                {/* ── Chapter End UI ── */}
                {settings.readingDirection === 'vertical' && !pagesLoading && pages.length > 0 && (
                    <div className="rdr-chapter-end-wrap">
                        <ChapterEndUI
                            manga={manga} mangaId={mangaId} chapterId={chapterId}
                            onLoginRequired={() => setReaderToast('Please log in to react to chapters')}
                        />
                    </div>
                )}
                
                {settings.readingDirection !== 'vertical' && !pagesLoading && pages.length > 0 && (
                    <div
                        className={`reader-page-wrap transition-${settings.pageTransition}${currentPage >= pageCount ? ' active' : ''}`}
                        style={{ maxWidth: wrapMaxWidth }}
                    >
                        <div className="rdr-chapter-end-scroll">
                            <ChapterEndUI
                                manga={manga} mangaId={mangaId} chapterId={chapterId}
                                onLoginRequired={() => setReaderToast('Please log in to react to chapters')}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Click zones ── */}
            {settings.clickToFlip && !settingsOpen && (
                <ClickZones
                    enabled={settings.readingDirection !== 'vertical'}
                    onNext={settings.readingDirection === 'rtl' ? goPrev : goNext}
                    onPrev={settings.readingDirection === 'rtl' ? goNext : goPrev} />
            )}

            {/* ── Footer ── */}
            <footer className={`reader-footer${uiHidden ? ' reader-footer--hidden' : ''}`}
                style={{ background: `${theme.bg}ee` }}>
                <button className="rdr-nav-btn" onClick={goPrev} disabled={isFirstPage}>
                    <ChevronLeft size={16} />
                    <span>{currentPage === 0 ? (hasPrevChapter ? 'Prev Ch.' : 'Start') : 'Prev'}</span>
                </button>

                {/* Mini page strip */}
                <div className="rdr-page-strip" title={`Page ${currentPage + 1} of ${pageCount}`}>
                    <span className="rdr-page-label">{currentPage + 1} / {pageCount || '?'}</span>
                    <div className="rdr-strip-track">
                        {pageCount > 0 && Array.from({ length: Math.min(pageCount, 40) }).map((_, i) => {
                            const pi = Math.round((i / Math.min(pageCount - 1, 39)) * (pageCount - 1));
                            return (
                                <button key={i}
                                    className={`rdr-strip-dot${pi === currentPage ? ' active' : pi < currentPage ? ' read' : ''}`}
                                    onClick={() => {
                                        setCurrentPage(pi);
                                        pageRefs.current[pi]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }}
                                    title={`Page ${pi + 1}`} />
                            );
                        })}
                    </div>
                </div>

                <button className="rdr-nav-btn" onClick={goNext} disabled={isLastPage}>
                    <span>{currentPage >= pageCount - 1
                        ? (hasNextChapter && settings.autoNextChapter ? 'Next Ch.' : 'End')
                        : 'Next'}</span>
                    <ChevronRight size={16} />
                </button>
            </footer>
        </div>
    );
}
