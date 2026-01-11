import React from 'react';
import { motion } from 'framer-motion';
import StoneHero from '../components/contact/StoneHero';
import ChiseledForm from '../components/contact/ChiseledForm';
import ContactTablets from '../components/contact/ContactTablets';
import BlueprintMap from '../components/contact/BlueprintMap';
import SEO from '../components/SEO';

const ContactPage = () => {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05,
            },
        },
    };

    const letter = {
        hidden: { opacity: 0, y: 50 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
    };

    return (
        <div className="min-h-screen bg-[#0c0a09] text-stone-200 font-sans selection:bg-amber-900 selection:text-white pt-5 overflow-x-hidden">
            <SEO
                title="Contact Us - Swamy Slabs | Indian Stone Exporter"
                description="Contact Swamy Slabs for premium Indian Limestone and Granite. Based in Tandur, Telangana. We export globally."
                keywords="Contact Swamy Slabs, Stone Exporter Contact, Tandur Stone Supplier, Granite Supplier India"
            />
            {/* 2. THE CORE EXPERIENCE: FORM & TABLETS */}
            <section className="relative px-4 md:px-12 w-full overflow-hidden">

                {/* 3D STONE BACKGROUND FOR THIS SECTION */}
                <div className="absolute inset-0 z-0">
                    <StoneHero />
                    {/* Dark overlay to ensure text readability */}
                    <div className="absolute inset-0 bg-[#0c0a09]/80 pointer-events-none"></div>
                </div>

                <div className="container mx-auto max-w-7xl relative z-10">
                    <div className="flex flex-col lg:flex-row gap-16 items-start">

                        {/* Left: Tablets Info */}
                        <div className="w-full lg:w-5/12 order-2 lg:order-1">
                            <div className="lg:sticky lg:top-32">
                                <h3 className="text-2xl font-serif text-white mb-8 border-b border-stone-700 pb-4 inline-block">Direct Lines</h3>
                                {/* Vertical Layout for Tablets to match screenshot expectation properly arranged */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6">
                                    <ContactTablets />
                                </div>
                            </div>
                        </div>

                        {/* Right/Center: The Chiseled Form */}
                        <div className="w-full lg:w-7/12 order-1 lg:order-2">
                            <motion.div
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                            >
                                <h3 className="text-3xl md:text-4xl font-serif text-white mb-2">Send us a Message</h3>
                                <p className="text-stone-500 mb-10">We usually respond within 24 hours.</p>
                                <ChiseledForm />
                            </motion.div>
                        </div>

                    </div>
                </div>
            </section>

            {/* 3. BLUEPRINT MAP */}
            <section className="w-full">
                <BlueprintMap />
            </section>

        </div>
    );
};

export default ContactPage;
