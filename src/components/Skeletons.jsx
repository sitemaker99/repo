/**
 * Skeleton loader components for MangaDetails, Library, and Reader.
 * All use a shimmer animation defined in index.css via .skeleton class.
 */

/** Generic shimmer block */
function Skel({ w = '100%', h = '1rem', radius = '6px', style = {} }) {
    return (
        <div
            className="skeleton"
            style={{ width: w, height: h, borderRadius: radius, ...style }}
        />
    );
}

/** Skeleton for the MangaDetails hero section */
export function MangaDetailsSkeleton() {
    return (
        <div className="manga-details fade-in">
            {/* Banner placeholder */}
            <div className="banner" style={{ background: 'var(--surface-2)' }}>
                <div className="banner-overlay" />
            </div>

            <div className="content-wrapper">
                <div className="header-info">
                    {/* Cover */}
                    <Skel w="180px" h="260px" radius="10px" style={{ flexShrink: 0 }} />

                    {/* Meta */}
                    <div className="meta" style={{ gap: '12px', display: 'flex', flexDirection: 'column' }}>
                        <Skel w="60%" h="2rem" />
                        <Skel w="40%" h="1rem" />
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {[80, 65, 95, 70].map((w, i) => (
                                <Skel key={i} w={`${w}px`} h="24px" radius="20px" />
                            ))}
                        </div>
                        <Skel w="90%" h="0.85rem" />
                        <Skel w="80%" h="0.85rem" />
                        <Skel w="70%" h="0.85rem" />
                        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                            <Skel w="140px" h="38px" radius="8px" />
                            <Skel w="120px" h="38px" radius="8px" />
                        </div>
                    </div>
                </div>

                {/* Chapters section skeleton */}
                <div className="chapters-section" style={{ marginTop: '2rem' }}>
                    <Skel w="120px" h="1.5rem" style={{ marginBottom: '16px' }} />
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="chapter-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                            <Skel w="80px" h="0.9rem" />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Skel w="32px" h="32px" radius="6px" />
                                <Skel w="60px" h="32px" radius="6px" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Skeleton for a library grid */
export function LibrarySkeleton({ count = 8 }) {
    return (
        <div className="library-grid">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="library-card">
                    <Skel w="100%" h="200px" radius="8px 8px 0 0" />
                    <div className="library-card-info" style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <Skel w="80%" h="0.9rem" />
                        <Skel w="50%" h="0.75rem" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/** Skeleton for recommendation cards */
export function RecsSkeleton({ count = 6 }) {
    return (
        <div className="recs-grid">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="rec-card" style={{ pointerEvents: 'none' }}>
                    <Skel w="100%" h="140px" radius="8px" />
                    <Skel w="75%" h="0.8rem" style={{ marginTop: '6px' }} />
                </div>
            ))}
        </div>
    );
}

/** Inline spinner for small loading states */
export function InlineSpinner({ size = 16 }) {
    return (
        <span
            className="spin-anim"
            style={{
                display: 'inline-block',
                width:  size,
                height: size,
                border: '2px solid var(--accent)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
            }}
        />
    );
}
