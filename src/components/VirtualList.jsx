import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * VirtualList
 *
 * A lightweight virtual scroller. Renders only the rows visible in the
 * viewport plus a small overscan buffer, so 1000+ items stay performant.
 *
 * Props:
 *   items       — array of data
 *   itemHeight  — fixed row height in px (required for correct spacer math)
 *   renderItem  — (item, index) => ReactNode
 *   overscan    — number of extra rows above/below viewport (default: 5)
 *   className   — class for the outer container div
 *   style       — extra style for the outer container div
 */
export default function VirtualList({
    items,
    itemHeight,
    renderItem,
    getKey,
    overscan = 5,
    className = '',
    style = {},
}) {
    const containerRef = useRef(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [height, setHeight]       = useState(600);

    // Observe container height
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setHeight(entry.contentRect.height);
        });
        ro.observe(el);
        setHeight(el.clientHeight);
        return () => ro.disconnect();
    }, []);

    const onScroll = useCallback((e) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    const totalHeight = items.length * itemHeight;

    const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIdx   = Math.min(
        items.length - 1,
        Math.ceil((scrollTop + height) / itemHeight) + overscan
    );

    const offsetTop = startIdx * itemHeight;
    const visible   = items.slice(startIdx, endIdx + 1);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{ overflowY: 'auto', position: 'relative', ...style }}
            onScroll={onScroll}
        >
            {/* Total height spacer */}
            <div style={{ height: totalHeight, position: 'relative' }}>
                {/* Rendered slice */}
                <div style={{ position: 'absolute', top: offsetTop, left: 0, right: 0 }}>
                    {visible.map((item, i) => {
                            const absIdx = startIdx + i;
                            const key = getKey ? getKey(item, absIdx) : (item?.id ?? absIdx);
                            return (
                        <div key={key} style={{ height: itemHeight, boxSizing: 'border-box' }}>
                            {renderItem(item, absIdx)}
                        </div>
                            );
                        })}
                </div>
            </div>
        </div>
    );
}
