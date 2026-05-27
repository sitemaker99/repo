import React from 'react';

export default function UserBanner({ src, config, className = '', style = {}, children }) {
    const x = config?.x || 0;
    const y = config?.y || 0;
    const scale = config?.scale || 1;

    return (
        <div 
            className={`user-banner-wrapper ${className}`} 
            style={{ 
                ...style,
                overflow: 'hidden', 
                position: 'relative',
                background: src ? 'transparent' : '#5865F2' // fallback color
            }}
        >
            {src && (
                <img 
                    src={src} 
                    alt="Banner"
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: `scale(${scale}) translate(${x}%, ${y}%)`,
                        transformOrigin: 'center center',
                        pointerEvents: 'none'
                    }} 
                />
            )}
            <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
                {children}
            </div>
        </div>
    );
}
