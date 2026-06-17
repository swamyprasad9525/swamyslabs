import { useState, useEffect } from 'react';
import ProductListing from '../components/ProductListing';
import { motion } from 'framer-motion';
import MoltenStoneBackground from '../components/MoltenStoneBackground';
import SEO from '../components/SEO';

const CollectionPage = () => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Simulating fetch or using static data directly for the new "invoice" view
        // The ProductListing component will automatically fallback to PREMIUM_STONES 
        // when the passed 'products' array is empty.
        const timer = setTimeout(() => {
            setLoading(false);
        }, 800);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="min-h-screen bg-stone-900">
            <SEO
                title="Stone Collection - Premium Indian Limestone, Sandstone & Granite | Swamy Slabs"
                description="Explore our premium collection of natural stones: Tandur Yellow Limestone, Kadappa Black, Napa Slabs, Sandstone, and Granite. Wholesale pricing, bulk supply from Betamcherla, AP."
                keywords="Stone Collection, Indian Limestone, Tandur Stone, Kadappa Black, Granite Slabs, Natural Stone Catalogue, Napa Slabs, Betamcherla Stone, Wholesale Stone"
                canonicalUrl="https://swamyslabs.vercel.app/collection"
            />
            {/* Fixed Background Animation - Stays put while content scrolls */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <MoltenStoneBackground />
            </div>

            {/* Scrollable Content Wrapper */}
            <div className="relative z-10">

                {/* Hero Text Section (Transparent) */}
                <section className="relative h-[60vh] md:h-[80vh] w-full flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-center px-4 animate-fade-in-up pointer-events-auto">
                        <span className="text-amber-500/80 uppercase tracking-[0.2em] text-xs md:text-sm font-medium mb-3 block">
                            The Quarry Gallery
                        </span>
                        <h1 className="text-2xl sm:text-3xl md:text-5xl font-serif font-light text-stone-100 mb-6 tracking-wide leading-tight max-w-4xl mx-auto">
                            Centuries of Geology<span className="text-amber-600">,</span> <br className="hidden md:block" />
                            Hand-Selected for Your Vision
                        </h1>
                    </div>
                </section>

                {/* Overlapping Collection Container */}
                <div className="relative z-20 -mt-24 md:-mt-32 pb-12">
                    <div className="container mx-auto px-4">
                        {/* Decorative top border/curve */}
                        <div className="relative bg-stone-50 rounded-t-[2.5rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] pt-12 pb-8 min-h-screen">
                            {loading ? (
                                <div className="flex justify-center items-center h-64">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stone-900"></div>
                                </div>
                            ) : (
                                <ProductListing products={products} showViewMore={false} enableSorting={true} showHeader={false} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CollectionPage;
