import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin } from 'lucide-react';

const Tablet = ({ icon: Icon, title, lines, delay }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay, duration: 0.6 }}
            whileHover={{ y: -10, rotateX: 5, rotateY: 5 }}
            className="group relative bg-[#1c1917] border border-stone-800 p-8 h-full flex flex-col items-center justify-center text-center shadow-xl transform-gpu transition-all duration-500"
            style={{ perspective: '1000px' }}
        >
            {/* Top Sheen */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

            <div className="bg-stone-800/50 p-4 rounded-full mb-6 text-amber-500 group-hover:scale-110 transition-transform duration-300">
                <Icon size={28} />
            </div>

            <h3 className="text-lg font-bold text-stone-200 uppercase tracking-widest mb-4">{title}</h3>

            <div className="space-y-1">
                {lines.map((line, i) => (
                    <p key={i} className="text-stone-400 text-sm font-medium leading-relaxed">
                        {line}
                    </p>
                ))}
            </div>
        </motion.div>
    );
};

const ContactTablets = () => {
    return (
        <div className="grid grid-cols-1 gap-6 w-full relative z-10">
            <Tablet
                icon={Mail}
                title="Email Us"
                lines={["kolliswami784@gmail.com", "swamyslabsindustries@gmail.com"]}
                delay={0}
            />
            <Tablet
                icon={Phone}
                title="Call Us"
                lines={["+91 93812 60584", "Mon - Sat, 9am - 7pm"]}
                delay={0.1}
            />
            <Tablet
                icon={MapPin}
                title="Visit Us"
                lines={["Kurnool Road, 31, Bugganapalli", "Betamcherla, AP, 518599"]}
                delay={0.2}
            />
        </div>
    );
};

export default ContactTablets;
