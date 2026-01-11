import React from 'react';
import { motion } from 'framer-motion';

const AboutSection = () => {
    // Organization Schema for SEO
    const schemaData = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Swamy Slabs",
        "url": "https://swamyslabs.com",
        "logo": "https://swamyslabs.com/logo.png",
        "description": "Premium Indian Limestone Supplier and Manufacturer.",
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Industrial Area",
            "addressLocality": "Tandur",
            "addressRegion": "Telangana",
            "postalCode": "501141",
            "addressCountry": "IN"
        },
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": "+91-1234567890",
            "contactType": "sales"
        }
    };

    return (
        <section id="about" className="py-16 bg-stone-100 relative overflow-hidden">
            {/* SEO Schema Injection */}
            <script type="application/ld+json">
                {JSON.stringify(schemaData)}
            </script>

            <div className="container mx-auto px-6 md:px-12">
                <div className="flex flex-col lg:flex-row gap-16 items-center">

                    {/* Visual SEO Side */}
                    <div className="w-full lg:w-1/2 relative">
                        <motion.div
                            initial={{ opacity: 0, x: -50 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8 }}
                            className="relative aspect-[4/5] rounded-none overflow-hidden"
                        >
                            {/* High-quality stone yard image placeholder */}
                            <img
                                src="about.jpg"
                                alt="Tandur Yellow Limestone Cobble for Driveway Paving close up texture"
                                className="object-cover w-full h-full grayscale hover:grayscale-0 transition-all duration-700 ease-in-out"
                            />

                            {/* Decorative Frame */}
                            <div className="absolute top-4 left-4 w-full h-full border-2 border-stone-800 -z-10 translate-x-4 translate-y-4" />
                        </motion.div>
                    </div>

                    {/* Narrative Side */}
                    <div className="w-full lg:w-1/2 space-y-8">

                        {/* The Hook (H1 for SEO) */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.6 }}
                        >
                            <span className="block text-amber-600 font-bold tracking-widest uppercase text-xl mb-2">About Us</span>
                            <h1 className="text-4xl md:text-5xl font-serif font-light text-stone-900 leading-tight">
                                Architectural Excellence,<br />
                                <span className="italic font-medium">by Swamy Slabs.</span>
                            </h1>
                        </motion.div>

                        {/* Core Narrative Pillars */}
                        <div className="space-y-6 text-stone-600 leading-relaxed font-sans">
                            {/* The Mission */}
                            <div>
                                <h2 className="text-lg font-bold text-stone-900 mb-2 uppercase tracking-wide">Our Story</h2>
                                <p>
                                    Swamy Slabs has been the bridge between premium raw materials and modern architectural design. We don't just supply stone; we transform it. In our specialized facility, we apply expert techniques—<strong>shaping, polishing, tumbling, and calibrating</strong>—to ensure every piece meets the highest standards of beauty and durability.
                                </p>
                            </div>

                            {/* Technical Excellence */}
                            <div>
                                <h2 className="text-lg font-bold text-stone-900 mb-2 uppercase tracking-wide">What We Do</h2>
                                <p>
                                    <strong> Precision Processing</strong> We believe that a great project starts with a perfect cut. Our team specializes in refining stone surfaces to suit your vision, whether you require a sleek Honed finish, a high-gloss Polished shine, or a rugged Tumbled texture. We prioritize Calibration, ensuring every slab is processed to a precise thickness for a seamless installation.
                                </p>
                            </div>

                            {/* Global Logistics */}
                            <div>
                                <h2 className="text-lg font-bold text-stone-900 mb-2 uppercase tracking-wide">Our Promise</h2>
                                <p>
                                  <strong>Quality from Workshop to Site</strong> From classic Tandur Yellow and Kadappa Black patterns to custom-shaped Pool Coping, we provide the exact specifications your project demands.
                                </p>
                            </div>
                        </div>

                        {/* Trust Signals */}
                        <div className="pt-6 border-t border-stone-300 grid grid-cols-2 lg:grid-cols-3 gap-6 text-xs uppercase font-bold tracking-widest text-stone-500">
                            <span>✓ Ethical Sourcing</span>
                            <span>✓ Global Shipping</span>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default AboutSection;
