import React from 'react';

export default function UserAvatar({ src, config, className = '', style = {}, alt = "Avatar" }) {
    const x = config?.x || 0;
    const y = config?.y || 0;
    const scale = config?.scale || 1;

    return (
        <div 
            className={`user-avatar-wrapper ${className}`} 
            style={{ 
                ...style,
                overflow: 'hidden', 
                position: 'relative',
                display: 'inline-block'
            }}
        >
            <img 
                src={src || '/brand/default-avatar.png'} 
                alt={alt}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: `scale(${scale}) translate(${x}%, ${y}%)`,
                    transformOrigin: 'center center',
                    display: 'block',
                    pointerEvents: 'none'
                }} 
            />
        </div>
    );
}
