import React from 'react';
import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';

const BlueprintMap = () => {
    return (
        <div className="relative w-full h-[500px] bg-[#0c0a09] overflow-hidden border-t border-b border-stone-800">
            {/* Grid Pattern (Blueprint look) */}
            <div className="absolute inset-0 opacity-20"
                style={{
                    backgroundImage: 'linear-gradient(#f59e0b 1px, transparent 1px), linear-gradient(90deg, #f59e0b 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}>
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a09] via-transparent to-[#0c0a09]"></div>

            {/* Unrolling/Reveal Animation */}
            <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                whileInView={{ scaleY: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, ease: "circOut" }}
                className="w-full h-full flex items-center justify-center origin-top"
            >
                {/* Stylized Map Content (Abstract representation) */}
                <div className="relative w-full max-w-4xl h-3/4 border border-stone-700/50 flex items-center justify-center bg-[#1c1917]/50 backdrop-blur-sm">
                    <span className="text-[10rem] text-stone-800 font-black opacity-20 select-none absolute">INDIA</span>

                    {/* The Factory Pin */}
                    <div className="relative z-10 flex flex-col items-center group cursor-pointer">
                        <motion.div
                            initial={{ y: -50, opacity: 0 }}
                            whileInView={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.5, type: 'spring' }}
                            className="bg-amber-600 p-3 rounded-full shadow-[0_0_20px_rgba(217,119,6,0.6)] text-white"
                        >
                            <MapPin size={32} fill="currentColor" />
                        </motion.div>

                        {/* Pulse Effect */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full">
                            <div className="w-full h-full bg-amber-500/30 rounded-full animate-ping"></div>
                        </div>

                        <div className="mt-4 text-center">
                            <p className="text-amber-500 font-bold uppercase tracking-widest text-xl">Betamcherla</p>
                            <p className="text-stone-500 text-xs">Primary Processing Unit</p>
                        </div>
                    </div>

                    {/* Decorative Lines */}
                    <div className="absolute top-10 left-10 w-20 h-[1px] bg-stone-600"></div>
                    <div className="absolute top-10 left-10 w-[1px] h-20 bg-stone-600"></div>
                    <div className="absolute bottom-10 right-10 w-20 h-[1px] bg-stone-600"></div>
                    <div className="absolute bottom-10 right-10 w-[1px] h-20 bg-stone-600"></div>
                </div>
            </motion.div>
        </div>
    );
};

export default BlueprintMap;
