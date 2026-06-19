import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import ProductSuggestions from '../components/ProductSuggestions';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { ChevronRight, ShieldCheck, Truck, Package, Info, MapPin, CheckCircle2, X } from 'lucide-react';
import PriceEstimatorModal from '../components/PriceEstimatorModal';
import CallbackForm from '../components/CallbackForm';
import EnquiryForm from '../components/EnquiryForm';
import SEO from '../components/SEO';
import { useToast } from '../components/common/Toast';


import { PREMIUM_STONES } from '../data/stones';

const ProductDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart } = useCart();
    const { showToast } = useToast();
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
    const [isEnquiryModalOpen, setIsEnquiryModalOpen] = useState(false);
    const [prefilledEnquiry, setPrefilledEnquiry] = useState(null);


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
        showToast(`${quantity} ${unit}(s) of ${product.name} added to Selection!`, 'success');
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
        showToast(`Sample of ${product.name} added to Selection!`, 'success');
        handleAction('sample');
    };

    const handleProceedFromEstimator = (area, totalPrice) => {
        setIsPriceModalOpen(false);
        setPrefilledEnquiry({
            ...product,
            quantity: `${area} Sq.Ft`,
            message: `Hi Swamy Slabs, I calculated an estimate of ₹${totalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })} for ${area} Sq.Ft using the Price Estimator. I would like a formal quote for this project.`
        });
        setIsEnquiryModalOpen(true);
        showToast(`Estimate calculated! Opening detailed enquiry.`, 'info');
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
        <div className="bg-white min-h-screen pt-4 md:pt-12 pb-12 font-sans text-slate-900 w-full overflow-x-hidden" ref={containerRef}>
            {/* Breadcrumb - Clean & Subtle */}
            <div className="container mx-auto px-4 md:px-6 mb-8">
                <nav className="flex items-center gap-1.5 text-xs text-slate-400 font-medium overflow-x-auto hide-scrollbar whitespace-nowrap">
                    <span className="hover:text-amber-600 cursor-pointer transition" onClick={() => navigate('/')}>Home</span>
                    <ChevronRight size={12} className="text-slate-300" />
                    <span className="hover:text-amber-600 cursor-pointer transition" onClick={() => navigate('/collection')}>Products</span>
                    <ChevronRight size={12} className="text-slate-300" />
                    <span className="text-slate-600">{product.name}</span>
                </nav>
            </div>

            <main className="container mx-auto px-4 md:px-6">
                <SEO
                    title={`${product.name} - ${product.materialType} Stone | Swamy Slabs`}
                    description={`Buy high-quality ${product.name} (${product.finish}) at ₹${product.pricePerSqFt}/sq.ft. ${product.description ? product.description.substring(0, 130) + '...' : 'Premium natural stone from India.'} Available in ${product.dimensions}.`}
                    keywords={`${product.name}, ${product.materialType}, Indian Stone, ${product.finish} finish, ${product.name} Price, Buy ${product.name}, Natural Stone India`}
                    canonicalUrl={`https://swamyslabs.vercel.app/collection/${product.id}`}
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

                                {/* Quantity and Unit Selector */}
                                <div className="flex gap-4 items-end mb-6 w-full">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Quantity</label>
                                        <div className="relative flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 hover:bg-slate-100 transition-colors h-12">
                                            {isQuantityEditing ? (
                                                <input
                                                    ref={quantityInputRef}
                                                    type="number"
                                                    value={quantity}
                                                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                                    onBlur={toggleQuantityEdit}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') toggleQuantityEdit(); }}
                                                    className="w-full h-full px-4 bg-white outline-none font-bold text-sm"
                                                    min="1"
                                                />
                                            ) : (
                                                <span 
                                                    onClick={toggleQuantityEdit}
                                                    className="w-full h-full flex items-center px-4 font-bold text-sm cursor-pointer"
                                                >
                                                    {quantity}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-1/3">
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Unit</label>
                                        <select
                                            value={unit}
                                            onChange={(e) => setUnit(e.target.value)}
                                            className="w-full h-12 px-3 border border-slate-200 rounded-lg bg-slate-50 outline-none text-sm font-bold cursor-pointer hover:bg-slate-100 transition-colors"
                                        >
                                            {units.map((u) => (
                                                <option key={u} value={u}>{u}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Quick Forms / Action Panel */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                    {/* Get Best Price */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setIsPriceModalOpen(true)}
                                        className="bg-black text-white h-12 rounded-lg font-bold text-xs tracking-wider uppercase flex items-center justify-center shadow-md hover:bg-slate-800 transition-all"
                                    >
                                        Get Best Price
                                    </motion.button>

                                    {/* Add to Selection */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleAddToCart}
                                        className="border-2 border-stone-900 text-stone-900 bg-white h-12 rounded-lg font-bold text-xs tracking-wider uppercase flex items-center justify-center hover:bg-stone-50 transition-all"
                                    >
                                        Add to Cart
                                    </motion.button>

                                    {/* Request Sample */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleGetSample}
                                        className="border border-dashed border-stone-400 text-stone-600 bg-stone-50/50 h-12 rounded-lg font-bold text-xs tracking-wider uppercase flex items-center justify-center hover:bg-stone-100/50 transition-all"
                                    >
                                        Request Sample
                                    </motion.button>

                                    {/* Request to Call */}
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setIsCallModalOpen(true)}
                                        className="bg-stone-900 text-white h-12 rounded-lg font-bold text-xs tracking-wider uppercase flex items-center justify-center shadow-md hover:bg-stone-800 transition-all gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                                        Request Call
                                    </motion.button>
                                </div>


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
                                { label: 'Application', value: (product.application || []).join(', ') || 'General Use' },
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

            {/* Modals */}
            <PriceEstimatorModal
                isOpen={isPriceModalOpen}
                onClose={() => setIsPriceModalOpen(false)}
                product={product}
                onProceed={handleProceedFromEstimator}
            />
            <CallbackForm
                isOpen={isCallModalOpen}
                onClose={() => setIsCallModalOpen(false)}
                product={product}
            />
            <EnquiryForm
                isOpen={isEnquiryModalOpen}
                onClose={() => {
                    setIsEnquiryModalOpen(false);
                    setPrefilledEnquiry(null);
                }}
                product={prefilledEnquiry || product}
            />

        </div>
    );
};


export default ProductDetailsPage;
