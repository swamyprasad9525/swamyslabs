import { useRef } from "react";
import {
    motion,
    useScroll,
    useSpring,
    useTransform,
    useMotionValue,
    useVelocity,
    useAnimationFrame
} from "framer-motion";

// Utility to wrap value within a range
const wrap = (min, max, v) => {
    const rangeSize = max - min;
    return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

function ParallaxText({ children, baseVelocity = 100 }) {
    const baseX = useMotionValue(0);
    const { scrollY } = useScroll();
    const scrollVelocity = useVelocity(scrollY);
    const smoothVelocity = useSpring(scrollVelocity, {
        damping: 50,
        stiffness: 400
    });
    const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], {
        clamp: false
    });

    /**
     * We want the text to wrap infinitely.
     * If we repeat the text 4 times, we wrap from 0% to -25%.
     * This assumes the 4 copies are enough to cover the viewport width + scroll buffer.
     */
    const x = useTransform(baseX, (v) => `${wrap(0, -25, v)}%`);

    const directionFactor = useRef(1);
    useAnimationFrame((t, delta) => {
        let moveBy = directionFactor.current * baseVelocity * (delta / 1000);

        /**
         * Change direction based on scroll velocity
         */
        if (velocityFactor.get() < 0) {
            directionFactor.current = -1;
        } else if (velocityFactor.get() > 0) {
            directionFactor.current = 1;
        }

        moveBy += directionFactor.current * moveBy * velocityFactor.get();

        baseX.set(baseX.get() + moveBy);
    });

    return (
        <div className="overflow-hidden whitespace-nowrap flex flex-nowrap m-0 leading-[0.8] tracking-tighter w-full">
            <motion.div
                className="flex whitespace-nowrap flex-nowrap uppercase text-7xl md:text-8xl font-serif font-bold items-center"
                style={{ x }}
            >
                {Array.from({ length: 4 }).map((_, i) => (
                    <span
                        key={i}
                        className="block mr-12 text-transparent hover:text-stone-900 transition-colors duration-500"
                        style={{ WebkitTextStroke: "1px #d1d5db" }}
                    >
                        {children}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

export default function ParallaxSection() {
    return (
        <section className="py-24 bg-[#F5F5F5] overflow-hidden space-y-12 select-none">
            <ParallaxText baseVelocity={-2}>Curating the world's finest marble • </ParallaxText>
            <ParallaxText baseVelocity={2}>Timeless Elegance • Set in Stone • </ParallaxText>
        </section>
    );
}
