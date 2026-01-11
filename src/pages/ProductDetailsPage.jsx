import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import ProductSuggestions from '../components/ProductSuggestions';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ChevronRight, ShieldCheck, Truck, Package, Info, MapPin, CheckCircle2, X } from 'lucide-react';
import PriceEstimatorModal from '../components/PriceEstimatorModal';
import CallbackForm from '../components/CallbackForm';
import SEO from '../components/SEO';


import { PREMIUM_STONES } from '../data/stones';

const ProductDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart } = useCart();
    const [product, setProduct] = useState(null);
    const [allProducts, setAllProducts] = useState(PREMIUM_STONES); // Use static data
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('specs');
    const [quantity, setQuantity] = useState(10);
    const [showStockCheck, setShowStockCheck] = useState(false);
    const [pincode, setPincode] = useState('');
    const [stockStatus, setStockStatus] = useState(null); // null, 'checking', 'available', 'unavailable'
    const containerRef = useRef(null);
    const [unit, setUnit] = useState('piece');
    const [mainImage, setMainImage] = useState('');
    const [isQuantityEditing, setIsQuantityEditing] = useState(false);
    const [actionStatus, setActionStatus] = useState(null); // null, 'sending', 'success'

    // Modal States
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);


    const quantityInputRef = useRef(null);

    const units = ['piece', 'sq.ft', 'sq.mtr', 'box'];

    useEffect(() => {
        // Find product from static data
        setLoading(true);
        const current = PREMIUM_STONES.find(p => p.id === id || String(p.id) === id);

        if (current) {
            setProduct(current);
            setMainImage(current.images[0]);
            setLoading(false);
        } else {
            // Fallback lookup or 404 handling
            setLoading(false);
        }
        window.scrollTo(0, 0);
    }, [id]);

    const handleAction = (type) => {
        setActionStatus('sending');
        setTimeout(() => {
            setActionStatus('success');
            setTimeout(() => setActionStatus(null), 3000);
        }, 1500);
    };

    const toggleQuantityEdit = () => {
        setIsQuantityEditing(!isQuantityEditing);
        if (!isQuantityEditing) {
            setTimeout(() => quantityInputRef.current?.focus(), 100);
        }
    };

    const handleAddToCart = () => {
        addToCart({
            id: product.id || product._id,
            name: product.name,
            price: product.pricePerSqFt,
            image: product.images[0],
            category: product.materialType,
            quantity: quantity
        });
        handleAction('cart');
    };

    const handleGetSample = () => {
        addToCart({
            id: `sample-${product.id || product._id}`,
            name: `${product.name} (Sample)`,
            price: 5.00,
            image: product.images[0],
            category: 'Sample',
            quantity: 1
        });
        handleAction('sample');
    };

    const runStockCheck = () => {
        if (!pincode) return;
        setStockStatus('checking');
        setTimeout(() => {
            const random = Math.random();
            setStockStatus(random > 0.2 ? 'available' : 'unavailable');
        }, 1500);
    };

    if (loading) return (
        <div className="min-h-screen flex justify-center items-center bg-stone-50">
            <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 border-4 border-stone-200 border-t-stone-900 rounded-full animate-spin"></div>
                <p className="text-stone-500 font-serif tracking-widest text-sm uppercase">Curating Excellence...</p>
            </div>
        </div>
    );

    if (!product) return (
        <div className="min-h-screen flex flex-col justify-center items-center bg-stone-50">
            <h2 className="text-3xl font-serif text-stone-900 mb-6 italic text-center px-4">This masterpiece remains <br /> hidden in our quarry.</h2>
            <button
                onClick={() => navigate('/collection')}
                className="bg-stone-900 text-white px-8 py-3 uppercase tracking-tighter hover:bg-stone-800 transition"
            >
                Return to Collection
            </button>
        </div>
    );

    return (
        <div className="bg-white min-h-screen pt-12 pb-12 font-sans text-slate-900 w-full overflow-x-hidden" ref={containerRef}>
            {/* Breadcrumb - Clean & Subtle */}
            <div className="container mx-auto px-4 md:px-6 mb-8">
                <nav className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                    <span className="hover:text-amber-600 cursor-pointer transition" onClick={() => navigate('/')}>Home</span>
                    <ChevronRight size={12} className="text-slate-300" />
                    <span className="hover:text-amber-600 cursor-pointer transition" onClick={() => navigate('/collection')}>Products</span>
                    <ChevronRight size={12} className="text-slate-300" />
                    <span className="text-slate-600">{product.name}</span>
                </nav>
            </div>

            <main className="container mx-auto px-4 md:px-6">
                <SEO
                    title={`${product.name} - Premium ${product.materialType} | Swamy Slabs`}
                    description={`Buy high-quality ${product.name}. ${product.description ? product.description.substring(0, 150) + "..." : "Premium natural stone from India."}`}
                    keywords={`${product.name}, ${product.materialType}, Indian Stone, ${product.name} Price, Buy ${product.name}`}
                />
                <div className="bg-white border border-slate-100 rounded-xl shadow-sm overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">

                        {/* Left: Industrial Gallery */}
                        <div className="p-6 md:p-8 bg-slate-50/50 border-r border-slate-100">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="relative aspect-square mb-6 bg-white rounded-lg border border-slate-200 overflow-hidden group shadow-inner"
                            >
                                <AnimatePresence mode="wait">
                                    <motion.img
                                        key={mainImage}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.3 }}
                                        src={mainImage}
                                        alt={product.name}
                                        className="w-full h-full object-contain p-4 transition-transform duration-700 group-hover:scale-110"
                                    />
                                </AnimatePresence>
                            </motion.div>

                            <div className="flex gap-4 overflow-x-auto pb-2 hide-scrollbar">
                                {product.images.map((img, idx) => (
                                    <motion.div
                                        key={idx}
                                        whileHover={{ y: -4 }}
                                        onClick={() => setMainImage(img)}
                                        className={`w-20 h-20 flex-shrink-0 rounded-md border-2 overflow-hidden bg-white cursor-pointer transition-colors ${mainImage === img ? 'border-amber-500' : 'border-slate-200'}`}
                                    >
                                        <img src={img} alt={`thumb-${idx}`} className="w-full h-full object-cover" />
                                    </motion.div>
                                ))}
                            </div>
                        </div>

                        {/* Right: B2B Info Panel */}
                        <div className="p-8 md:p-12 space-y-8">
                            <motion.div
                                initial="hidden"
                                animate="visible"
                                variants={{
                                    hidden: { opacity: 0 },
                                    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
                                }}
                            >
                                <motion.h1
                                    variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
                                    className="text-3xl md:text-4xl font-bold text-slate-800 mb-4 leading-tight font-serif"
                                >
                                    {product.name}
                                </motion.h1>

                                <motion.div
                                    variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
                                    className="flex flex-wrap items-baseline gap-2 mb-6 border-b border-slate-100 pb-6"
                                >
                                    <span className="text-2xl font-bold text-red-600">
                                        ₹{product.pricePerSqFt}.00 - ₹{(product.pricePerSqFt + 5)}.00
                                    </span>
                                    <span className="text-sm text-slate-400">/ Square Feet</span>
                                    <div className="ml-auto flex flex-col items-end">
                                        <span className="text-sm font-bold text-slate-700">1000 piece <span className="text-[10px] text-slate-400 uppercase tracking-tighter">(MOQ)</span></span>
                                    </div>
                                </motion.div>

                                {/* Quick Forms */}
                                <motion.div
                                    variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
                                    className="flex flex-wrap gap-4 items-center justify-center"
                                >
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setIsPriceModalOpen(true)}
                                        className="bg-black text-white px-8 py-3 rounded shadow-lg font-bold text-sm tracking-wide relative overflow-hidden w-full md:w-auto"
                                    >
                                        <AnimatePresence mode="wait">
                                            {actionStatus === 'sending' ? (
                                                <motion.div key="sending" initial={{ y: 20 }} animate={{ y: 0 }} exit={{ y: -20 }} className="flex items-center justify-center gap-2">
                                                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                    Please wait...
                                                </motion.div>
                                            ) : actionStatus === 'success' ? (
                                                <motion.div key="success" initial={{ y: 20 }} animate={{ y: 0 }} exit={{ y: -20 }} className="flex items-center justify-center gap-2 text-green-400">
                                                    <CheckCircle2 size={16} />
                                                    Price Requested
                                                </motion.div>
                                            ) : (
                                                <motion.span key="default" initial={{ y: 20 }} animate={{ y: 0 }} exit={{ y: -20 }}>
                                                    Get Best Price
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </motion.button>
                                </motion.div>


                            </motion.div>

                            {/* Spec Table 1 */}
                            <div className="space-y-0 rounded-lg overflow-hidden border border-slate-100">
                                {[
                                    { label: 'Business Type', value: 'Manufacturer, Supplier, Trader' },
                                    { label: 'Country of Origin', value: 'India' },
                                    { label: 'Feature', value: 'Crack Resistance, Good Looking, Optimum Strength, Stain Resistance, Washable, Water Proof' },
                                    { label: 'Size', value: `${product.dimensions || '2x2 feet,3x3 feet'}` },
                                ].map((row, i) => (
                                    <div key={i} className={`flex p-4 gap-4 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} border-b border-slate-100 last:border-0`}>
                                        <span className="w-1/3 text-slate-400 font-medium">{row.label}</span>
                                        <span className="w-2/3 text-slate-700 font-bold">{row.value}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Secondary Actions */}
                            <div className="flex flex-wrap gap-4 pt-4">
                                <motion.button
                                    whileHover={{ y: -2, backgroundColor: '#f8fafc' }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setIsCallModalOpen(true)}
                                    // disabled={actionStatus === 'sending'}
                                    className="w-full flex items-center justify-center gap-3 border-2 border-slate-900 bg-slate-900 text-white py-4 px-6 rounded-lg font-bold transition-all relative overflow-hidden shadow-lg hover:bg-slate-800 hover:border-slate-800"
                                >
                                    <AnimatePresence mode="wait">
                                        {actionStatus === 'sending' ? (
                                            <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            </motion.div>
                                        ) : actionStatus === 'success' ? (
                                            <motion.div key="success" initial={{ y: 20 }} animate={{ y: 0 }} className="flex items-center gap-2">
                                                <CheckCircle2 size={18} className="text-green-400" />
                                                <span className="text-green-400">Requested!</span>
                                            </motion.div>
                                        ) : (
                                            <motion.div key="default" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                                Request to Call
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Additional Details Section */}
                <div className="mt-12 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-8 py-4 border-b border-slate-100">
                        <h2 className="text-xl font-bold text-slate-800 font-serif italic">Product Details</h2>
                    </div>

                    <div className="p-8 space-y-12">
                        {/* 2-column Grid of specs */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-0">
                            {[
                                { label: 'Application', value: product.application.join(', ') },
                                { label: 'Form', value: 'Slab' },
                                { label: 'Color', value: product.materialType === 'Limestone' ? 'Yellow/Beige' : 'Natural' },
                                { label: 'Shape', value: 'Square/Rectangular' },
                                { label: 'Material', value: `Natural ${product.materialType}` },
                            ].map((spec, i) => (
                                <div key={i} className="flex border-b border-slate-100 py-6 last:border-0 md:last:border-b">
                                    <span className="w-1/3 text-slate-400 text-sm font-medium">{spec.label}</span>
                                    <span className="w-2/3 text-slate-800 font-bold text-sm">{spec.value}</span>
                                </div>
                            ))}
                        </div>

                        <div className="space-y-6">
                            <p className="text-slate-600 leading-relaxed text-sm italic font-medium">
                                {product.description || `This ${product.name} is a natural stone cut from the prestigious quarries of India, known for its warm tones and consistent texture. It is a popular choice for high-end construction and design projects, offering both durability and timeless aesthetic appeal.`}
                            </p>

                        </div>
                    </div>
                </div>

                {/* Suggestions Section */}
                <div className="mt-24">
                    <div className="flex items-center gap-4 mb-12">
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <h3 className="text-2xl font-serif italic text-slate-500">Related Collections</h3>
                        <div className="h-px bg-slate-200 flex-1"></div>
                    </div>
                    <ProductSuggestions currentProductId={product.id || product._id} products={allProducts} />
                </div>
            </main>

            {/* WhatsApp Floating Icon */}
            <a
                href="https://wa.me/919381260584?text=Hi,%20I%20am%20interested%20in%20your%20products."
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-8 right-8 z-[60] group"
            >
                <div className="bg-[#25D366] text-white p-4 rounded-full shadow-2xl cursor-pointer hover:bg-[#20bd5a] transition-all hover:scale-110 active:scale-95 relative flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="fill-white">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 bg-white text-stone-900 px-4 py-2 rounded-xl shadow-lg text-xs font-bold whitespace-nowrap group-hover:opacity-100 opacity-0 transition-opacity duration-300 pointer-events-none flex items-center gap-2">
                        Need Help? Chat on WhatsApp
                    </div>
                </div>
            </a>
            {/* Modals */}
            <PriceEstimatorModal
                isOpen={isPriceModalOpen}
                onClose={() => setIsPriceModalOpen(false)}
                product={product}
            />
            <CallbackForm
                isOpen={isCallModalOpen}
                onClose={() => setIsCallModalOpen(false)}
                product={product}
            />

        </div>
    );
};


export default ProductDetailsPage;
