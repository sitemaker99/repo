import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Check, X, Move } from 'lucide-react';
import './MediaAdjuster.css';

export default function MediaAdjuster({ src, type = 'avatar', initialConfig, onSave, onCancel }) {
    const [scale, setScale] = useState(initialConfig?.scale || 1);
    const [x, setX] = useState(initialConfig?.x || 0);
    const [y, setY] = useState(initialConfig?.y || 0);
    
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    
    const containerRef = useRef(null);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e) => {
        if (!isDragging || !containerRef.current) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        
        const { width, height } = containerRef.current.getBoundingClientRect();
        const percentX = (dx / width) * 100;
        const percentY = (dy / height) * 100;

        setX(prev => prev + percentX);
        setY(prev => prev + percentY);
        setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    const handleWheel = (e) => {
        e.preventDefault();
        const delta = e.deltaY * -0.001;
        setScale(prev => Math.min(Math.max(1, prev + delta), 4));
    };

    return (
        <div className="media-adjuster-overlay">
            <div className="media-adjuster-modal">
                <div className="media-adjuster-header">
                    <h3>Adjust {type === 'avatar' ? 'Avatar' : 'Banner'}</h3>
                    <button className="icon-btn" onClick={onCancel}><X size={20} /></button>
                </div>
                
                <div className="media-preview-wrapper">
                    <div 
                        className={`media-preview-container ${type}`}
                        ref={containerRef}
                        onMouseDown={handleMouseDown}
                        onWheel={handleWheel}
                        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                    >
                        <div className="media-preview-overlay">
                            <Move className="drag-hint" size={32} />
                        </div>
                        <img 
                            src={src} 
                            alt="Adjust Preview" 
                            draggable="false"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                transform: `scale(${scale}) translate(${x}%, ${y}%)`,
                                transformOrigin: 'center center',
                                pointerEvents: 'none'
                            }}
                        />
                    </div>
                </div>
                
                <div className="media-controls">
                    <ZoomOut size={20} className="text-secondary" />
                    <input 
                        type="range" 
                        min="1" 
                        max="4" 
                        step="0.01" 
                        value={scale} 
                        onChange={(e) => setScale(parseFloat(e.target.value))} 
                        className="scale-slider"
                    />
                    <ZoomIn size={20} className="text-secondary" />
                </div>
                
                <div className="media-actions">
                    <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => onSave({ x, y, scale })}>
                        <Check size={16} /> Apply
                    </button>
                </div>
            </div>
        </div>
    );
}
