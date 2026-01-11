import React, { useState, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from 'framer-motion';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { PREMIUM_STONES } from '../data/stones';

const LuxuryStoneCard = ({ product, index, navigate, addToCart }) => {
    const cardRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e) => {
        if (cardRef.current) {
            const rect = cardRef.current.getBoundingClientRect();
            setCursorPosition({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        }
    };

    // Stagger animation based on index
    const isFeatured = product.featured;

    return (
        <motion.div
            layout
            ref={cardRef}
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.8, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            onMouseMove={handleMouseMove}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => navigate(`/collection/${product.id}`)}
            className={cn(
                "group relative bg-white/5 backdrop-blur-sm overflow-hidden md:cursor-none w-full", // Custom cursor area
                isFeatured ? "md:col-span-2 md:row-span-2 aspect-[4/3] md:aspect-auto" : "md:col-span-1 aspect-[3/4]"
            )}
        >
            {/* Image Layer with Zoom/Pan Effect */}
            <div className="absolute inset-0 overflow-hidden bg-stone-200">
                <motion.img
                    src={product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    animate={{
                        scale: isHovered ? 1.15 : 1,
                        x: isHovered ? (cursorPosition.x / 50) : 0, // Subtle pan
                        y: isHovered ? (cursorPosition.y / 50) : 0
                    }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                />

                {/* Secondary Image Reveal (Application Shot) */}
                {product.images[1] && (
                    <motion.div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 mixture-blend-overlay"
                        style={{ backgroundImage: `url(${product.images[1]})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    />
                )}
            </div>

            {/* Spotlight / Glow Effect */}
            <div
                className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                    background: `radial-gradient(600px circle at ${cursorPosition.x}px ${cursorPosition.y}px, rgba(255,255,255,0.15), transparent 40%)`
                }}
            />

            {/* Glassmorphism Badge - Top Left */}
            <div className="absolute top-6 left-6 z-20">
                <div className="backdrop-blur-md bg-white/10 border border-white/20 text-white px-4 py-2 rounded-sm shadow-xl flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
                    <span className="text-xs font-mono tracking-widest uppercase">{product.materialType} • {product.finish}</span>
                </div>
            </div>

            {/* AR Button Stub - Top Right */}
            <button className="absolute top-6 right-6 z-20 w-10 h-10 backdrop-blur-md bg-black/20 hover:bg-black/40 border border-white/10 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0" title="View in AR">
                <span className="text-xs font-bold">SS</span>
            </button>

            {/* Info Overlay - Bottom */}
            <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-10 translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                <div className="flex justify-between items-end">
                    <div>
                        <h3 className="text-white font-serif text-2xl md:text-3xl leading-none mb-2 drop-shadow-md">{product.name}</h3>
                        <p className="text-stone-300 font-mono text-xs tracking-widest uppercase opacity-80 group-hover:opacity-100 transition-opacity drop-shadow-sm">
                            {product.thickness} • {product.dimensions.split('x')[0]}cm Width
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-white font-mono text-xl drop-shadow-md">₹{product.pricePerSqFt}</p>
                        <p className="text-stone-400 text-[10px] uppercase tracking-widest drop-shadow-sm">Per Sq.Ft</p>
                    </div>
                </div>

                {/* Hidden Description Reveal */}
                <div className="h-0 group-hover:h-auto overflow-hidden transition-all duration-500 delay-100">
                    <p className="text-stone-200 text-sm font-light mt-4 line-clamp-2 leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity duration-700 drop-shadow-md">
                        {product.description}
                    </p>
                    <button
                        onClick={(e) => { e.stopPropagation(); addToCart(product); }}
                        className="mt-4 w-full bg-white text-black font-semibold uppercase tracking-widest text-xs py-3 hover:bg-stone-200 transition-colors shadow-lg"
                    >
                        Add to Cart
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

// Main Component
const ProductListing = ({ products = [], showViewMore = true, enableSorting = false, showHeader = true }) => {
    // Force use of PREMIUM_STONES if standard products are passed (for demo purposes as per prompt)
    const displayData = products.length > 5 ? products : PREMIUM_STONES;

    const [activeCategory, setActiveCategory] = useState('All');
    const navigate = useNavigate();
    const { addToCart } = useCart();

    const categories = ['All', ...new Set(displayData.map(p => p.materialType))];

    const filteredProducts = displayData.filter(p => {
        const matchCat = activeCategory === 'All' || p.materialType === activeCategory;
        return matchCat;
    });

    return (
        <div id="collections" className="space-y-12 py-4">
            {/* Header Section */}
            {showHeader && (
                <div className="text-center space-y-8 max-w-4xl mx-auto px-4">
                    <motion.span
                        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
                        className="inline-block text-stone-500 uppercase tracking-[0.3em] text-xs font-bold border-b border-stone-300 pb-2"
                    >
                        The Quarry Gallery
                    </motion.span>
                    <h2 className="text-5xl md:text-7xl font-serif text-stone-900 leading-tight">
                        Centuries of Geology, <br /><span className="italic text-stone-400">Hand-Selected for Your Vision</span>
                    </h2>
                </div>
            )}

            {/* Menu Island (Floating Filter) */}
            <div className="sticky top-24 z-40 flex justify-center px-4">
                <div className="bg-white/80 backdrop-blur-md shadow-2xl border border-white/20 rounded-full p-2 flex gap-1 overflow-x-auto max-w-full hide-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={cn(
                                "px-6 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all duration-300 whitespace-nowrap",
                                activeCategory === cat
                                    ? "bg-stone-900 text-white shadow-lg"
                                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Asymmetric Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 px-4">
                <AnimatePresence mode="popLayout">
                    {filteredProducts.map((product, idx) => (
                        <LuxuryStoneCard
                            key={product.id || idx}
                            product={product}
                            index={idx}
                            navigate={navigate}
                            addToCart={(item) => addToCart({
                                id: item.id,
                                name: item.name,
                                price: item.pricePerSqFt,
                                image: item.images[0],
                                category: item.materialType
                            })}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* View More (Only if not full list) */}
            {showViewMore && filteredProducts.length < 5 && (
                <div className="flex justify-center pt-12">
                    <button
                        onClick={() => navigate('/collection')}
                        className="group relative overflow-hidden bg-stone-900 text-white px-10 py-4 text-sm font-bold uppercase tracking-widest hover:bg-stone-800 transition-all"
                    >
                        <span className="relative z-10">Explore All Stones</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProductListing;
