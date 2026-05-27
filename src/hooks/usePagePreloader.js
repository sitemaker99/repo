import { useEffect, useRef } from 'react';

const PRELOAD_AHEAD  = 3; // pages ahead to preload
const PRELOAD_BEHIND = 1; // pages behind to keep warm

/**
 * usePagePreloader
 *
 * Eagerly preloads pages ±N from the current page so that
 * flipping never shows a blank image waiting to load.
 *
 * Uses a simple browser Image() object cache keyed by URL.
 * Images that fall outside the window are evicted from the cache.
 */
export function usePagePreloader(pages, currentPage) {
    // Map<url, HTMLImageElement>
    const cache = useRef(new Map());

    useEffect(() => {
        if (!pages || pages.length === 0) return;

        const start = Math.max(0, currentPage - PRELOAD_BEHIND);
        const end   = Math.min(pages.length - 1, currentPage + PRELOAD_AHEAD);

        const desired = new Set();
        for (let i = start; i <= end; i++) {
            const url = pages[i];
            if (url) desired.add(url);
        }

        // Evict URLs no longer needed
        for (const [url] of cache.current) {
            if (!desired.has(url)) {
                cache.current.delete(url);
            }
        }

        // Preload new URLs
        for (const url of desired) {
            if (!cache.current.has(url)) {
                const img = new Image();
                img.src = url;
                cache.current.set(url, img);
            }
        }
    }, [pages, currentPage]);

    // Cleanup on unmount — capture ref value inside effect so the cleanup
    // closure always holds the correct reference (satisfies react-hooks/exhaustive-deps)
    useEffect(() => {
        const cacheRef = cache.current;
        return () => { cacheRef.clear(); };
    }, []);
}
