import React, { useRef, useState, useEffect } from 'react';
import { motion, useScroll, useTransform, useSpring, useMotionValue, useMotionTemplate } from 'framer-motion';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

// Magnetic Button Component
const MagneticButton = ({ children, className, onClick }) => {
    const ref = useRef(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseX = useSpring(x, { stiffness: 150, damping: 15, mass: 0.1 });
    const mouseY = useSpring(y, { stiffness: 150, damping: 15, mass: 0.1 });

    const handleMouseMove = (e) => {
        const { clientX, clientY } = e;
        const { left, top, width, height } = ref.current.getBoundingClientRect();
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const distance = Math.sqrt(Math.pow(clientX - centerX, 2) + Math.pow(clientY - centerY, 2));

        if (distance < 100) {
            x.set((clientX - centerX) * 0.35);
            y.set((clientY - centerY) * 0.35);
        } else {
            x.set(0);
            y.set(0);
        }
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.button
            ref={ref}
            onClick={onClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ x: mouseX, y: mouseY }}
            className={cn("relative transition-colors duration-500 group", className)}
        >
            {children}
        </motion.button>
    );
};

const HeroSection = () => {
    const containerRef = useRef(null);
    const navigate = useNavigate();

    // Mouse Motion Values
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    // Parallax Transforms (Different speeds for depth)
    const smoothX = useSpring(mouseX, { stiffness: 60, damping: 20 });
    const smoothY = useSpring(mouseY, { stiffness: 60, damping: 20 });

    const layer1X = useTransform(smoothX, [-0.5, 0.5], ["-2%", "2%"]);
    const layer1Y = useTransform(smoothY, [-0.5, 0.5], ["-2%", "2%"]);

    const layer2X = useTransform(smoothX, [-0.5, 0.5], ["-5%", "5%"]);
    const layer2Y = useTransform(smoothY, [-0.5, 0.5], ["-5%", "5%"]);

    // Flashlight Effect
    const lightX = useTransform(mouseX, [-0.5, 0.5], ["0%", "100%"]);
    const lightY = useTransform(mouseY, [-0.5, 0.5], ["0%", "100%"]);

    const handleMouseMove = (e) => {
        const { left, top, width, height } = containerRef.current.getBoundingClientRect();
        // Normalize mouse from -0.5 to 0.5
        const xPct = (e.clientX - left) / width - 0.5;
        const yPct = (e.clientY - top) / height - 0.5;
        mouseX.set(xPct);
        mouseY.set(yPct);
    };

    // Split Screen Reveal State
    const [isRevealed, setIsRevealed] = useState(false);

    useEffect(() => {
        // Trigger reveal after small delay
        const timer = setTimeout(() => setIsRevealed(true), 500);
        return () => clearTimeout(timer);
    }, []);

    const headline = "Nature's Art, Carved for Your Home";
    const words = headline.split(" ");

    return (
        <section
            ref={containerRef}
            onMouseMove={handleMouseMove}
            className="relative h-screen w-full overflow-hidden bg-stone-950 flex items-center justify-center isolate"
        >
            {/* Curtain Reveal Layers (The "Doors") */}
            <motion.div
                initial={{ x: "0%" }}
                animate={{ x: isRevealed ? "-100%" : "0%" }}
                transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }} // Heavy stone weight feel
                className="absolute top-0 left-0 w-1/2 h-full bg-stone-900 z-50 border-r border-stone-800 flex items-center justify-end pr-10"
            >
                {/* Texture on the curtain */}
                <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1629196914375-f7e48f477b6d?q=80&w=1500&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay"></div>
            </motion.div>

            <motion.div
                initial={{ x: "0%" }}
                animate={{ x: isRevealed ? "100%" : "0%" }}
                transition={{ duration: 2.5, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-0 right-0 w-1/2 h-full bg-stone-900 z-50 border-l border-stone-800"
            >
                <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1629196914375-f7e48f477b6d?q=80&w=1500&auto=format&fit=crop')] bg-cover bg-center mix-blend-overlay"></div>
            </motion.div>


            {/* Parallax Background Layers */}
            {/* Layer 0: Deep Base - Granite Dark */}
            <motion.div className="absolute inset-0 scale-110" style={{ x: layer1X, y: layer1Y }}>
                <img
                    src="https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2500&auto=format&fit=crop"
                    alt="Dark Marble Background"
                    className="w-full h-full object-cover opacity-60"
                />
            </motion.div>

            {/* Layer 1: Texture Overlay - Grain Zoom on Hover */}
            <motion.div
                className="absolute inset-0 scale-105 mix-blend-soft-light"
                style={{ x: layer2X, y: layer2Y }}
                whileHover={{ scale: 1.15, transition: { duration: 1.5, ease: "easeOut" } }}
            >
                <img
                    src="https://images.unsplash.com/photo-1600607686527-6fb886090705?q=80&w=2500&auto=format&fit=crop"
                    alt="Texture Overlay"
                    className="w-full h-full object-cover opacity-40 grayscale contrast-125"
                />
            </motion.div>

            {/* Flashlight / Dynamic Gradient Overlay */}
            <motion.div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                    background: useMotionTemplate`radial-gradient(circle 600px at ${useTransform(mouseX, v => (v + 0.5) * 100)}% ${useTransform(mouseY, v => (v + 0.5) * 100)}%, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.6) 50%, rgba(0,0,0,0.9) 100%)`
                }}
            />

            {/* Dynamic Lighting Tint (Time of day feel - Warm to Cool) */}
            <div className="absolute inset-0 bg-gradient-to-tr from-stone-900/60 via-transparent to-stone-800/40 mix-blend-color-burn z-10 pointer-events-none"></div>


            {/* Content Container */}
            <div className="relative z-30 text-center px-6 max-w-5xl mx-auto">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: isRevealed ? 1 : 0 }}
                    transition={{ delay: 1.5, duration: 1 }}
                >
                    <h5 className="text-stone-300 font-mono tracking-[0.4em] uppercase text-xs or md:text-sm mb-6">
                        • PREMIUM STONE COLLECTION
                    </h5>

                    {/* Animated Typography */}
                    <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif text-white font-bold leading-[0.9] tracking-tight text-balance mix-blend-overlay">
                        {words.map((word, i) => (
                            <span key={i} className="inline-block mx-2 whitespace-nowrap overflow-hidden">
                                <motion.span
                                    initial={{ y: 120, filter: "blur(10px)", opacity: 0 }}
                                    animate={{ y: isRevealed ? 0 : 120, filter: isRevealed ? "blur(0px)" : "blur(10px)", opacity: isRevealed ? 1 : 0 }}
                                    transition={{
                                        duration: 1.2,
                                        delay: 1.8 + (i * 0.15),
                                        ease: [0.22, 1, 0.36, 1]
                                    }}
                                    className="inline-block bg-clip-text text-transparent bg-gradient-to-b from-stone-100 to-stone-500"
                                >
                                    {word}
                                </motion.span>
                            </span>
                        ))}
                    </h1>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: isRevealed ? 1 : 0, y: 0 }}
                        transition={{ delay: 2.8, duration: 1 }}
                        className="mt-12 flex justify-center"
                    >
                        <MagneticButton
                            onClick={() => navigate('/collection')}
                            className="bg-white text-stone-950 px-10 py-5 rounded-full font-bold uppercase tracking-widest hover:bg-stone-200 shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center gap-3 active:scale-95"
                        >
                            <span>Explore The Collection</span>
                            <span className="text-lg">➔</span>
                        </MagneticButton>
                    </motion.div>
                </motion.div>
            </div>

            {/* Glassmorphism Sidebar Navigation */}
            <motion.div
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: isRevealed ? 0 : 100, opacity: isRevealed ? 1 : 0 }}
                transition={{ delay: 2.5, duration: 1 }}
                className="hidden lg:flex absolute right-8 top-1/2 -translate-y-1/2 flex-col gap-6 z-40"
            >
                {['Limestone', 'Sandstone', 'Natural Stone', 'Napa Slabs'].map((item, i) => (
                    <button
                        key={item}
                        className="group relative flex items-center justify-end gap-4"
                    >
                        <span className="text-white text-xs font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                            {item}
                        </span>
                        <div className="w-12 h-12 rounded-full border border-white/20 bg-white/5 backdrop-blur-md flex items-center justify-center text-white/50 group-hover:bg-white group-hover:text-stone-900 transition-all duration-300 shadow-lg">
                            <span className="text-[10px] font-mono">{`0${i + 1}`}</span>
                        </div>
                    </button>
                ))}
            </motion.div>

            {/* Scroll Indicator */}
            <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/50 z-30"
            >
                <div className="w-[1px] h-16 bg-gradient-to-b from-white/0 via-white/50 to-white/0"></div>
            </motion.div>

        </section>
    );
};

export default HeroSection;
