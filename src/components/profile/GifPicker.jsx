import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import './GifPicker.css';

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY;

export default function GifPicker({ onSelect, onClose }) {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState([
        { name: 'Trending', query: '' },
        { name: 'Favorites', query: 'anime' },
        { name: 'hugs', query: 'anime hugs' },
        { name: 'ok', query: 'anime ok' },
        { name: 'please', query: 'anime please' },
        { name: 'thank you', query: 'anime thank you' }
    ]);

    const fetchGifs = async (searchQuery = '') => {
        setLoading(true);
        try {
            const endpoint = searchQuery 
                ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(searchQuery)}&limit=20`
                : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20`;
            
            const res = await fetch(endpoint);
            const data = await res.json();
            if (data.data) {
                setGifs(data.data);
            }
        } catch (error) {
            console.error('Error fetching GIFs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchGifs();
    }, []);

    const handleSearch = (e) => {
        e.preventDefault();
        fetchGifs(query);
    };

    const handleCategoryClick = (categoryQuery) => {
        setQuery(categoryQuery);
        fetchGifs(categoryQuery);
    };

    return (
        <div className="gif-picker-overlay">
            <div className="gif-picker-modal">
                <div className="gif-picker-header">
                    <div className="gif-picker-tabs">
                        <button className="active">GIFs</button>
                        <button>Stickers</button>
                        <button>Emoji</button>
                    </div>
                    <button className="icon-btn" onClick={onClose}><X size={20} /></button>
                </div>
                
                <div className="gif-search-container">
                    <form onSubmit={handleSearch} className="gif-search-bar">
                        <Search size={18} className="search-icon" />
                        <input 
                            type="text" 
                            placeholder="Search Giphy..." 
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </form>
                </div>

                <div className="gif-content">
                    {!query && gifs.length === 0 && (
                        <div className="gif-categories">
                            {categories.map((cat, idx) => (
                                <div 
                                    key={idx} 
                                    className="gif-category-card"
                                    onClick={() => handleCategoryClick(cat.query)}
                                >
                                    <span>{cat.name}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="gif-grid">
                        {loading ? (
                            <div className="gif-loading">Loading...</div>
                        ) : (
                            gifs.map(gif => (
                                <img 
                                    key={gif.id}
                                    src={gif.images.fixed_height_small.url} 
                                    alt={gif.title}
                                    onClick={() => onSelect(gif.images.original.url)}
                                    className="gif-item"
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
