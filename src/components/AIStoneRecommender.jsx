import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowRight, ArrowLeft, RotateCcw, ChevronRight } from 'lucide-react';
import { PREMIUM_STONES } from '../data/stones';
import { useNavigate } from 'react-router-dom';

// ─── Rule-based scoring engine ────────────────────────────────────────────────
// Each stone gets points based on how well it matches the user's answers.
// No API key, no cost, 100% frontend logic.

const scoreStone = (stone, answers) => {
    let score = 0;
    const { location, climate, style, budget } = answers;

    // ── Location matching ──────────────────────────────────────────────────
    const appStr = (stone.application || []).join(' ').toLowerCase();
    const descStr = (stone.description || '').toLowerCase();

    if (location === 'indoor') {
        if (appStr.includes('interior') || appStr.includes('flooring') || appStr.includes('vanity') || appStr.includes('paneling')) score += 3;
        if (stone.finish.toLowerCase().includes('polish')) score += 2;
        if (stone.finish.toLowerCase().includes('honed')) score += 1;
        if (appStr.includes('outdoor') || appStr.includes('pool') || appStr.includes('driveway')) score -= 2;
    }
    if (location === 'outdoor_patio') {
        if (appStr.includes('patio') || appStr.includes('terrace') || appStr.includes('garden') || appStr.includes('outdoor')) score += 3;
        if (stone.finish.toLowerCase().includes('brushed') || stone.finish.toLowerCase().includes('tumbled')) score += 2;
        if (appStr.includes('pool') || appStr.includes('walkway') || appStr.includes('pathway')) score += 1;
    }
    if (location === 'pool') {
        if (appStr.includes('pool') || appStr.includes('coping')) score += 4;
        if (stone.finish.toLowerCase().includes('tumbled')) score += 2;
        if (stone.finish.toLowerCase().includes('brushed')) score += 1;
        if (stone.finish.toLowerCase().includes('polish')) score -= 1; // slippery
    }
    if (location === 'driveway') {
        if (appStr.includes('driveway') || appStr.includes('heavy') || appStr.includes('paving') || appStr.includes('parking')) score += 4;
        if (parseInt(stone.thickness) >= 30) score += 2;
        if (stone.finish.toLowerCase().includes('machine cut') || stone.finish.toLowerCase().includes('natural')) score += 1;
    }
    if (location === 'wall') {
        if (appStr.includes('wall') || appStr.includes('cladding') || appStr.includes('paneling') || appStr.includes('accent')) score += 3;
        if (parseInt(stone.thickness) <= 20) score += 2; // thinner is better for walls
    }

    // ── Climate matching ──────────────────────────────────────────────────
    if (climate === 'hot_dry') {
        if (stone.materialType === 'Limestone') score += 2;
        if (stone.materialType === 'Sandstone') score += 2;
        if (stone.finish.toLowerCase().includes('honed') || stone.finish.toLowerCase().includes('brushed')) score += 1;
    }
    if (climate === 'humid') {
        if (stone.finish.toLowerCase().includes('machine cut') || stone.finish.toLowerCase().includes('brushed') || stone.finish.toLowerCase().includes('tumbled')) score += 2; // non-slip
        if (stone.finish.toLowerCase().includes('polish')) score -= 1; // slippery when wet
    }
    if (climate === 'moderate') {
        score += 1; // most stones work fine
    }
    if (climate === 'cold') {
        if (parseInt(stone.thickness) >= 20) score += 2; // thicker = more frost resistant
        if (stone.finish.toLowerCase().includes('tumbled') || stone.finish.toLowerCase().includes('brushed')) score += 1;
    }

    // ── Style matching ────────────────────────────────────────────────────
    if (style === 'modern') {
        if (stone.finish.toLowerCase().includes('polish') || stone.finish.toLowerCase().includes('honed')) score += 3;
        if (stone.name.toLowerCase().includes('grey') || stone.name.toLowerCase().includes('black')) score += 2;
        if (stone.finish.toLowerCase().includes('machine cut')) score += 1;
    }
    if (style === 'classic') {
        if (stone.materialType === 'Limestone') score += 2;
        if (stone.finish.toLowerCase().includes('tumbled') || stone.finish.toLowerCase().includes('brushed')) score += 2;
        if (stone.name.toLowerCase().includes('yellow') || stone.name.toLowerCase().includes('beige')) score += 1;
    }
    if (style === 'rustic') {
        if (stone.finish.toLowerCase().includes('tumbled') || stone.finish.toLowerCase().includes('natural') || stone.finish.toLowerCase().includes('leather')) score += 3;
        if (stone.materialType === 'Natural Stone') score += 1;
    }
    if (style === 'luxury') {
        if (stone.finish.toLowerCase().includes('polish') || stone.finish.toLowerCase().includes('leather')) score += 3;
        if (stone.pricePerSqFt >= 85) score += 2;
        if (stone.featured) score += 1;
    }
    if (style === 'minimal') {
        if (stone.finish.toLowerCase().includes('honed') || stone.finish.toLowerCase().includes('machine cut')) score += 3;
        if (stone.name.toLowerCase().includes('grey') || stone.name.toLowerCase().includes('ash')) score += 2;
    }

    // ── Budget matching ───────────────────────────────────────────────────
    if (budget === 'economy') {
        if (stone.pricePerSqFt <= 50) score += 3;
        else if (stone.pricePerSqFt <= 70) score += 1;
        else score -= 1;
    }
    if (budget === 'mid') {
        if (stone.pricePerSqFt >= 51 && stone.pricePerSqFt <= 85) score += 3;
        else if (stone.pricePerSqFt <= 50 || stone.pricePerSqFt <= 95) score += 1;
    }
    if (budget === 'premium') {
        if (stone.pricePerSqFt >= 72) score += 3;
        if (stone.pricePerSqFt >= 85) score += 1;
    }

    return score;
};

const getRecommendations = (answers) => {
    const scored = PREMIUM_STONES.map(stone => ({
        ...stone,
        score: scoreStone(stone, answers)
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, 3);
};

// ─── Quiz Steps ───────────────────────────────────────────────────────────────
const steps = [
    {
        id: 'location',
        question: 'Where will the stone be used?',
        icon: '📍',
        options: [
            { value: 'indoor', label: 'Indoor Floor / Wall', icon: '🏠' },
            { value: 'outdoor_patio', label: 'Outdoor Patio / Garden', icon: '🌿' },
            { value: 'pool', label: 'Pool Deck / Coping', icon: '🏊' },
            { value: 'driveway', label: 'Driveway / Walkway', icon: '🚗' },
            { value: 'wall', label: 'Wall Cladding / Facade', icon: '🧱' },
        ]
    },
    {
        id: 'climate',
        question: 'What is your local climate like?',
        icon: '🌤️',
        options: [
            { value: 'hot_dry', label: 'Hot & Dry', icon: '☀️' },
            { value: 'humid', label: 'Humid / Coastal', icon: '🌊' },
            { value: 'moderate', label: 'Moderate / Mixed', icon: '🌤️' },
            { value: 'cold', label: 'Cold / Frost Prone', icon: '❄️' },
        ]
    },
    {
        id: 'style',
        question: 'What aesthetic are you going for?',
        icon: '🎨',
        options: [
            { value: 'modern', label: 'Modern / Contemporary', icon: '⬛' },
            { value: 'classic', label: 'Classic / Traditional', icon: '🏛️' },
            { value: 'rustic', label: 'Rustic / Natural', icon: '🪨' },
            { value: 'luxury', label: 'Luxury / Premium', icon: '✨' },
            { value: 'minimal', label: 'Minimalist / Clean', icon: '⬜' },
        ]
    },
    {
        id: 'budget',
        question: 'What is your budget range?',
        icon: '💰',
        options: [
            { value: 'economy', label: 'Economy (₹30–50/sq.ft)', icon: '🟢' },
            { value: 'mid', label: 'Mid-Range (₹51–85/sq.ft)', icon: '🟡' },
            { value: 'premium', label: 'Premium (₹85+/sq.ft)', icon: '🔴' },
        ]
    },
];

// ─── Component ────────────────────────────────────────────────────────────────
const AIStoneRecommender = () => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(0);
    const [answers, setAnswers] = useState({});
    const [recommendations, setRecommendations] = useState(null);
    const [isAnimating, setIsAnimating] = useState(false);

    const handleSelect = (stepId, value) => {
        const newAnswers = { ...answers, [stepId]: value };
        setAnswers(newAnswers);

        if (currentStep < steps.length - 1) {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentStep(prev => prev + 1);
                setIsAnimating(false);
            }, 200);
        } else {
            // Final step — compute results
            const results = getRecommendations(newAnswers);
            setRecommendations(results);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleReset = () => {
        setAnswers({});
        setCurrentStep(0);
        setRecommendations(null);
    };

    const step = steps[currentStep];
    const progress = ((currentStep) / steps.length) * 100;

    return (
        <div className="bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 px-6 md:px-10 py-7 text-white relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: 'url(/tandur-yellow-limestone-cobble-premium.webp)', backgroundSize: 'cover', backgroundPosition: 'center' }}
                />
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-1">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                        <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">AI Stone Finder</span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-serif font-bold">
                        Find Your Perfect Stone
                    </h3>
                    <p className="text-stone-400 text-sm mt-1">Answer 4 quick questions to get personalised recommendations</p>
                </div>
            </div>

            <AnimatePresence mode="wait">
                {!recommendations ? (
                    <motion.div
                        key="quiz"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="p-6 md:p-10"
                    >
                        {/* Progress Bar */}
                        <div className="mb-8">
                            <div className="flex justify-between text-xs text-stone-400 font-medium mb-2">
                                <span>Step {currentStep + 1} of {steps.length}</span>
                                <span>{Math.round(((currentStep) / steps.length) * 100)}% complete</span>
                            </div>
                            <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-stone-900 rounded-full"
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                />
                            </div>
                        </div>

                        {/* Question */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentStep}
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -30 }}
                                transition={{ duration: 0.25 }}
                            >
                                <p className="text-2xl font-serif font-bold text-stone-900 mb-8 flex items-center gap-3">
                                    <span>{step.icon}</span> {step.question}
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {step.options.map((opt) => (
                                        <motion.button
                                            key={opt.value}
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => handleSelect(step.id, opt.value)}
                                            className={`flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all duration-200 group
                                                ${answers[step.id] === opt.value
                                                    ? 'border-stone-900 bg-stone-900 text-white'
                                                    : 'border-stone-200 hover:border-stone-400 bg-white text-stone-700 hover:bg-stone-50'
                                                }`}
                                        >
                                            <span className="text-2xl flex-shrink-0">{opt.icon}</span>
                                            <span className="font-semibold text-sm">{opt.label}</span>
                                            <ArrowRight className={`ml-auto w-4 h-4 flex-shrink-0 transition-opacity ${answers[step.id] === opt.value ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`} />
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        {/* Navigation */}
                        {currentStep > 0 && (
                            <button
                                onClick={handleBack}
                                className="mt-8 flex items-center gap-2 text-stone-400 hover:text-stone-700 transition text-sm font-medium"
                            >
                                <ArrowLeft className="w-4 h-4" /> Back
                            </button>
                        )}
                    </motion.div>
                ) : (
                    // ─── Results ──────────────────────────────────────────────────────
                    <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-6 md:p-10"
                    >
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <p className="text-xs uppercase tracking-widest text-amber-600 font-bold mb-1">Your Personalised Picks</p>
                                <h4 className="text-2xl font-serif font-bold text-stone-900">We recommend these 3 stones</h4>
                            </div>
                            <button
                                onClick={handleReset}
                                className="flex items-center gap-2 text-stone-400 hover:text-stone-700 transition text-xs font-bold uppercase tracking-wider border border-stone-200 px-3 py-2 rounded-lg hover:border-stone-400"
                            >
                                <RotateCcw className="w-3.5 h-3.5" /> Retake
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {recommendations.map((stone, idx) => (
                                <motion.div
                                    key={stone.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className="group rounded-xl overflow-hidden border border-stone-200 hover:border-stone-400 transition-all hover:shadow-xl cursor-pointer"
                                    onClick={() => navigate(`/collection/${stone.id}`)}
                                >
                                    {/* Rank Badge */}
                                    <div className="relative">
                                        {idx === 0 && (
                                            <div className="absolute top-3 left-3 z-10 bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1">
                                                <Sparkles className="w-2.5 h-2.5" /> Best Match
                                            </div>
                                        )}
                                        <div className="aspect-[4/3] overflow-hidden bg-stone-100">
                                            <img
                                                src={stone.images[0]}
                                                alt={stone.name}
                                                loading="lazy"
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                            />
                                        </div>
                                    </div>

                                    <div className="p-4">
                                        <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold mb-1">{stone.materialType} · {stone.finish}</p>
                                        <h5 className="font-serif font-bold text-stone-900 text-base leading-tight mb-3 group-hover:text-stone-600 transition">{stone.name}</h5>
                                        <div className="flex items-center justify-between">
                                            <span className="text-lg font-bold text-stone-900">₹{stone.pricePerSqFt}<span className="text-xs font-normal text-stone-400">/sq.ft</span></span>
                                            <span className="text-xs font-bold text-stone-500 flex items-center gap-1 group-hover:text-stone-900 transition">
                                                View Details <ChevronRight className="w-3 h-3" />
                                            </span>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>

                        {/* CTA */}
                        <div className="mt-8 p-5 bg-stone-50 rounded-xl border border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <p className="font-bold text-stone-900 text-sm">Not sure? Talk to our stone experts.</p>
                                <p className="text-stone-500 text-xs mt-0.5">We'll help you make the right choice for your project.</p>
                            </div>
                            <a
                                href="https://wa.me/919381260584?text=Hi%2C%20I%20used%20the%20AI%20Stone%20Finder%20and%20need%20help%20choosing%20the%20right%20stone%20for%20my%20project."
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 bg-[#25D366] text-white px-5 py-2.5 rounded-lg font-bold text-sm hover:bg-[#20bd5a] transition flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                                Ask on WhatsApp
                            </a>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AIStoneRecommender;
