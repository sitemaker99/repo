import { useState, useEffect, useCallback } from 'react';
import { X, Camera, Sparkles, Link as LinkIcon, Globe, Lock, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import GifPicker from './GifPicker';
import MediaAdjuster from './MediaAdjuster';
import UserAvatar from './UserAvatar';
import UserBanner from './UserBanner';
import './EditProfileModal.css';

export default function EditProfileModal({ isOpen, onClose }) {
    const { user } = useAuth();
    
    const [displayName, setDisplayName] = useState('');
    const [pronouns, setPronouns] = useState('');
    const [bio, setBio] = useState('');
    const [customStatus, setCustomStatus] = useState('');
    
    const [avatarUrl, setAvatarUrl] = useState('');
    const [bannerUrl, setBannerUrl] = useState('');
    
    const [avatarConfig, setAvatarConfig] = useState(null);
    const [bannerConfig, setBannerConfig] = useState(null);
    
    const [privacy, setPrivacy] = useState('public');
    
    const [isSaving, setIsSaving] = useState(false);
    
    // Media picker states
    const [activeMediaTarget, setActiveMediaTarget] = useState(null); // 'avatar' | 'banner'
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [urlInputValue, setUrlInputValue] = useState('');
    
    // Adjuster state
    const [adjustImageSrc, setAdjustImageSrc] = useState(null);
    const [adjustType, setAdjustType] = useState(null);

    // Sync state from user when modal opens
    useEffect(() => {
        if (isOpen && user) {
            setDisplayName(user.displayName || '');
            setPronouns(user.pronouns || '');
            setBio(user.bio || '');
            setCustomStatus(user.customStatus || '');
            setAvatarUrl(user.photoURL || '');
            setBannerUrl(user.bannerURL || '');
            setAvatarConfig(user.avatarConfig || null);
            setBannerConfig(user.bannerConfig || null);
            setPrivacy(user.privacy || 'public');
            // Reset sub-modals
            setActiveMediaTarget(null);
            setShowUrlInput(false);
            setShowGifPicker(false);
            setAdjustImageSrc(null);
        }
    }, [isOpen, user]);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        try {
            await updateProfile(user, {
                displayName: displayName.trim() || user.displayName,
                photoURL: avatarUrl,
            });
            
            if (db) {
                await setDoc(doc(db, 'users', user.uid), {
                    displayName: displayName.trim() || user.displayName,
                    photoURL: avatarUrl,
                    bannerURL: bannerUrl,
                    avatarConfig,
                    bannerConfig,
                    pronouns: pronouns.trim(),
                    bio: bio.trim(),
                    customStatus: customStatus.trim(),
                    privacy
                }, { merge: true });
            }
            
            onClose();
            window.location.reload(); 
        } catch (error) {
            console.error('Error updating profile:', error);
        } finally {
            setIsSaving(false);
        }
    }, [user, displayName, avatarUrl, bannerUrl, avatarConfig, bannerConfig, pronouns, bio, customStatus, privacy, onClose]);

    // When user picks a media source 
    const openMediaPicker = (target) => {
        setActiveMediaTarget(target);
        setShowUrlInput(false);
        setShowGifPicker(false);
        setUrlInputValue('');
    };

    const handleUrlSubmit = () => {
        if (!urlInputValue.trim()) return;
        // Send to adjuster
        setAdjustImageSrc(urlInputValue.trim());
        setAdjustType(activeMediaTarget);
        setShowUrlInput(false);
        setActiveMediaTarget(null);
    };

    const handleGifSelect = (gifUrl) => {
        setAdjustImageSrc(gifUrl);
        setAdjustType(activeMediaTarget);
        setShowGifPicker(false);
        setActiveMediaTarget(null);
    };

    const handleAdjustSave = (config) => {
        if (adjustType === 'avatar') {
            setAvatarUrl(adjustImageSrc);
            setAvatarConfig(config);
        } else if (adjustType === 'banner') {
            setBannerUrl(adjustImageSrc);
            setBannerConfig(config);
        }
        setAdjustImageSrc(null);
        setAdjustType(null);
    };

    const handleRemoveMedia = (target) => {
        if (target === 'avatar') {
            setAvatarUrl('');
            setAvatarConfig(null);
        } else {
            setBannerUrl('');
            setBannerConfig(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="epm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="epm-modal">
                {/* Close button */}
                <button className="epm-close" onClick={onClose}><X size={20} /></button>

                {/* ─── BANNER AREA (the header IS the banner) ─── */}
                <div className="epm-banner-area">
                    <UserBanner src={bannerUrl} config={bannerConfig} className="epm-banner-img">
                        <div className="epm-banner-actions">
                            <button className="epm-media-btn" onClick={() => openMediaPicker('banner')}>
                                <Camera size={16} /> Change Cover
                            </button>
                            {bannerUrl && (
                                <button className="epm-media-btn epm-media-btn--danger" onClick={() => handleRemoveMedia('banner')}>
                                    <X size={14} /> Remove
                                </button>
                            )}
                        </div>
                    </UserBanner>

                    {/* Avatar overlapping the banner */}
                    <div className="epm-avatar-zone">
                        <div className="epm-avatar-ring" onClick={() => openMediaPicker('avatar')}>
                            <UserAvatar src={avatarUrl} config={avatarConfig} className="epm-avatar-img" />
                            <div className="epm-avatar-hover">
                                <Camera size={20} />
                            </div>
                        </div>
                        {avatarUrl && (
                            <button className="epm-avatar-remove" onClick={() => handleRemoveMedia('avatar')}>
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ─── FORM BODY ─── */}
                <div className="epm-body">
                    {/* Display Name Row */}
                    <div className="epm-field">
                        <label className="epm-label">Display Name</label>
                        <input 
                            type="text" 
                            value={displayName} 
                            onChange={(e) => setDisplayName(e.target.value)} 
                            className="epm-input"
                            placeholder="Your name"
                        />
                    </div>

                    {/* Pronouns + Status in a row */}
                    <div className="epm-row">
                        <div className="epm-field epm-field--half">
                            <label className="epm-label">Pronouns</label>
                            <input 
                                type="text" 
                                value={pronouns} 
                                onChange={(e) => setPronouns(e.target.value)} 
                                className="epm-input"
                                placeholder="e.g. he/him"
                            />
                        </div>
                        <div className="epm-field epm-field--half">
                            <label className="epm-label">Status</label>
                            <input 
                                type="text" 
                                value={customStatus} 
                                onChange={(e) => setCustomStatus(e.target.value)} 
                                className="epm-input"
                                placeholder="What's on your mind?"
                            />
                        </div>
                    </div>

                    {/* About Me */}
                    <div className="epm-field">
                        <label className="epm-label">About Me</label>
                        <textarea 
                            value={bio} 
                            onChange={(e) => setBio(e.target.value)} 
                            className="epm-input epm-textarea"
                            rows="3"
                            placeholder="Tell the world about yourself..."
                        />
                    </div>

                    {/* Privacy Toggle */}
                    <div className="epm-field">
                        <label className="epm-label">Profile Visibility</label>
                        <div className="epm-privacy">
                            <button 
                                className={`epm-privacy-btn ${privacy === 'public' ? 'active' : ''}`}
                                onClick={() => setPrivacy('public')}
                            >
                                <Globe size={16} /> Public
                            </button>
                            <button 
                                className={`epm-privacy-btn ${privacy === 'private' ? 'active' : ''}`}
                                onClick={() => setPrivacy('private')}
                            >
                                <Lock size={16} /> Private
                            </button>
                        </div>
                        <p className="epm-hint">
                            {privacy === 'public' 
                                ? 'Anyone can see your reading stats and library.' 
                                : 'Only friends can see your stats and library.'}
                        </p>
                    </div>
                </div>

                {/* ─── FOOTER ─── */}
                <div className="epm-footer">
                    <button className="epm-btn epm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button className="epm-btn epm-btn--save" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? (
                            <span className="epm-saving-dots">Saving<span>.</span><span>.</span><span>.</span></span>
                        ) : (
                            <><Check size={16} /> Save Changes</>
                        )}
                    </button>
                </div>
            </div>

            {/* ─── MEDIA PICKER POPOVER ─── */}
            {activeMediaTarget && !showUrlInput && !showGifPicker && (
                <div className="epm-picker-overlay" onClick={() => setActiveMediaTarget(null)}>
                    <div className="epm-picker" onClick={(e) => e.stopPropagation()}>
                        <h3 className="epm-picker-title">
                            Choose {activeMediaTarget === 'avatar' ? 'Avatar' : 'Banner'}
                        </h3>
                        <div className="epm-picker-options">
                            <button className="epm-picker-card" onClick={() => setShowUrlInput(true)}>
                                <div className="epm-picker-icon"><LinkIcon size={24} /></div>
                                <span>Image Link</span>
                                <small>Paste any image URL</small>
                            </button>
                            <button className="epm-picker-card epm-picker-card--gif" onClick={() => setShowGifPicker(true)}>
                                <div className="epm-picker-icon epm-picker-icon--gif">GIF</div>
                                <span>Search Giphy</span>
                                <small>Animated images</small>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── URL INPUT MODAL ─── */}
            {activeMediaTarget && showUrlInput && (
                <div className="epm-picker-overlay" onClick={() => { setShowUrlInput(false); setActiveMediaTarget(null); }}>
                    <div className="epm-url-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="epm-picker-title">Paste Image URL</h3>
                        <input 
                            type="text" 
                            className="epm-input" 
                            placeholder="https://example.com/image.png"
                            value={urlInputValue}
                            onChange={(e) => setUrlInputValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                            autoFocus
                        />
                        <div className="epm-url-actions">
                            <button className="epm-btn epm-btn--ghost" onClick={() => { setShowUrlInput(false); setActiveMediaTarget(null); }}>Cancel</button>
                            <button className="epm-btn epm-btn--save" onClick={handleUrlSubmit} disabled={!urlInputValue.trim()}>
                                <Check size={16} /> Use Image
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── GIPHY PICKER ─── */}
            {activeMediaTarget && showGifPicker && (
                <GifPicker 
                    onSelect={handleGifSelect} 
                    onClose={() => { setShowGifPicker(false); setActiveMediaTarget(null); }} 
                />
            )}

            {/* ─── MEDIA ADJUSTER ─── */}
            {adjustImageSrc && (
                <MediaAdjuster 
                    src={adjustImageSrc}
                    type={adjustType}
                    initialConfig={{ scale: 1, x: 0, y: 0 }}
                    onSave={handleAdjustSave}
                    onCancel={() => {
                        setAdjustImageSrc(null);
                        setAdjustType(null);
                    }}
                />
            )}
        </div>
    );
}
