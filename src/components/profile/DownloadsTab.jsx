import React, { useState, useMemo } from 'react';
import {
  Download,
  Trash2,
  ChevronDown,
  HardDrive,
  Settings,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useDownloadStore } from '../../store/downloadStore';
import './DownloadsTab.css';

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STORAGE_QUOTA = 500 * 1024 * 1024; // 500 MB

export default function DownloadsTab() {
  const downloads = useDownloadStore((s) => s.downloads);
  const removeChapter = useDownloadStore((s) => s.removeChapter);
  const removeManga = useDownloadStore((s) => s.removeManga);
  const clearAllDownloads = useDownloadStore((s) => s.clearAllDownloads);
  const getTotalSize = useDownloadStore((s) => s.getTotalSize);
  const getTotalChapters = useDownloadStore((s) => s.getTotalChapters);

  const [expandedMangas, setExpandedMangas] = useState({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [autoDownload, setAutoDownload] = useState(() => {
    try {
      return localStorage.getItem('atsu-auto-download') === 'true';
    } catch {
      return false;
    }
  });
  const [downloadQuality, setDownloadQuality] = useState(() => {
    try {
      return localStorage.getItem('atsu-download-quality') || 'high';
    } catch {
      return 'high';
    }
  });

  const totalSize = getTotalSize();
  const totalChapters = getTotalChapters();
  const mangaIds = useMemo(() => Object.keys(downloads), [downloads]);
  const storagePercent = Math.min((totalSize / STORAGE_QUOTA) * 100, 100);

  const toggleExpand = (mangaId) => {
    setExpandedMangas((prev) => ({ ...prev, [mangaId]: !prev[mangaId] }));
  };

  const handleAutoDownloadChange = (checked) => {
    setAutoDownload(checked);
    try {
      localStorage.setItem('atsu-auto-download', String(checked));
    } catch {
      // ignore
    }
  };

  const handleQualityChange = (value) => {
    setDownloadQuality(value);
    try {
      localStorage.setItem('atsu-download-quality', value);
    } catch {
      // ignore
    }
  };

  const handleClearAll = () => {
    clearAllDownloads();
    setConfirmClear(false);
    setExpandedMangas({});
  };

  const getMangaSize = (manga) => {
    let size = 0;
    for (const chapter of Object.values(manga.chapters)) {
      size += chapter.sizeBytes || 0;
    }
    return size;
  };

  const getMangaChapterCount = (manga) => {
    return Object.keys(manga.chapters).length;
  };

  const isEmpty = mangaIds.length === 0;

  return (
    <div className="dl-tab">
      {/* Header */}
      <div className="dl-header">
        <div className="dl-header-top">
          <div className="dl-header-title">
            <HardDrive size={20} />
            Downloads
          </div>
          <div className="dl-header-stats">
            <span className="dl-header-stat">
              <strong>{formatBytes(totalSize)}</strong> used
            </span>
            <span className="dl-header-stat">
              <strong>{totalChapters}</strong> chapter{totalChapters !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="dl-storage-bar-wrap">
          <div className="dl-storage-bar-labels">
            <span>{formatBytes(totalSize)} of {formatBytes(STORAGE_QUOTA)}</span>
            <span>{storagePercent.toFixed(1)}%</span>
          </div>
          <div className="dl-storage-bar">
            <div
              className={`dl-storage-bar-fill${storagePercent > 80 ? ' dl-storage-bar-fill--warn' : ''}`}
              style={{ width: `${storagePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Manga List or Empty State */}
      {isEmpty ? (
        <div className="dl-empty">
          <div className="dl-empty-icon">
            <Download size={28} />
          </div>
          <p className="dl-empty-title">No downloads yet</p>
          <p className="dl-empty-msg">
            Download chapters for offline reading. They&apos;ll show up here so you can read without an internet connection.
          </p>
        </div>
      ) : (
        mangaIds.map((mangaId) => {
          const manga = downloads[mangaId];
          if (!manga) return null;
          const isExpanded = expandedMangas[mangaId] || false;
          const chapterEntries = Object.entries(manga.chapters);
          const mangaSize = getMangaSize(manga);
          const mangaChapCount = getMangaChapterCount(manga);

          return (
            <div className="dl-manga-card" key={mangaId}>
              <div className="dl-manga-header" onClick={() => toggleExpand(mangaId)}>
                <img
                  className="dl-manga-poster"
                  src={manga.poster || ''}
                  alt=""
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div className="dl-manga-info">
                  <div className="dl-manga-title">{manga.title}</div>
                  <div className="dl-manga-meta">
                    {mangaChapCount} chapter{mangaChapCount !== 1 ? 's' : ''} &middot; {formatBytes(mangaSize)}
                  </div>
                </div>
                <ChevronDown
                  size={18}
                  className={`dl-manga-chevron${isExpanded ? ' open' : ''}`}
                />
              </div>

              {isExpanded && (
                <div className="dl-chapters">
                  {chapterEntries.map(([chapterId, chapter]) => (
                    <div className="dl-chapter-row" key={chapterId}>
                      <div className={`dl-chapter-status dl-chapter-status--${chapter.status}`} />
                      <div className="dl-chapter-info">
                        <div className="dl-chapter-title">{chapter.title}</div>
                        <div className="dl-chapter-detail">
                          {formatBytes(chapter.sizeBytes)} &middot; {formatDate(chapter.downloadedAt)}
                        </div>
                      </div>
                      <button
                        className="dl-chapter-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeChapter(mangaId, chapterId);
                        }}
                        title="Delete chapter"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="dl-delete-all-manga"
                    onClick={() => removeManga(mangaId)}
                  >
                    <Trash2 size={13} />
                    Delete All Chapters
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Settings Section */}
      <div className="dl-settings">
        <div className="dl-settings-title">
          <Settings size={16} />
          Download Settings
        </div>

        <div className="dl-setting-row">
          <div className="dl-setting-label">
            <Wifi />
            Auto-download new chapters
          </div>
          <label className="dl-toggle">
            <input
              type="checkbox"
              checked={autoDownload}
              onChange={(e) => handleAutoDownloadChange(e.target.checked)}
            />
            <span className="dl-toggle-track" />
          </label>
        </div>

        <div className="dl-setting-row">
          <div className="dl-setting-label">
            <WifiOff />
            Download quality
          </div>
          <select
            className="dl-quality-select"
            value={downloadQuality}
            onChange={(e) => handleQualityChange(e.target.value)}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {!isEmpty && (
          <button className="dl-clear-all" onClick={() => setConfirmClear(true)}>
            <Trash2 size={15} />
            Clear All Downloads
          </button>
        )}
      </div>

      {/* Confirm Dialog */}
      {confirmClear && (
        <div className="dl-confirm-overlay" onClick={() => setConfirmClear(false)}>
          <div className="dl-confirm-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="dl-confirm-title">Clear all downloads?</h3>
            <p className="dl-confirm-msg">
              This will permanently delete all {totalChapters} downloaded chapter{totalChapters !== 1 ? 's' : ''} ({formatBytes(totalSize)}) from your device. This action cannot be undone.
            </p>
            <div className="dl-confirm-actions">
              <button
                className="dl-confirm-btn dl-confirm-btn--cancel"
                onClick={() => setConfirmClear(false)}
              >
                Cancel
              </button>
              <button
                className="dl-confirm-btn dl-confirm-btn--danger"
                onClick={handleClearAll}
              >
                Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
