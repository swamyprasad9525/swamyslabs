import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Ruler, Maximize2, Calculator, Package, Truck, Percent, Info } from 'lucide-react';
import { PREMIUM_STONES } from '../data/stones';

const SmartSurfacePlanner = () => {
    // State for inputs
    const [length, setLength] = useState(10);
    const [width, setWidth] = useState(10);
    const [unit, setUnit] = useState('ft');
    const [includeWastage, setIncludeWastage] = useState(false);
    const [selectedMaterialId, setSelectedMaterialId] = useState(PREMIUM_STONES[0].id);

    // Derived values
    const selectedMaterial = PREMIUM_STONES.find(s => s.id === selectedMaterialId) || PREMIUM_STONES[0];

    // Calculation Logic
    const calculateMetrics = () => {
        let l = parseFloat(length) || 0;
        let w = parseFloat(width) || 0;

        // Convert to feet for standard calculation
        if (unit === 'in') {
            l /= 12;
            w /= 12;
        } else if (unit === 'm') {
            l *= 3.28084;
            w *= 3.28084;
        }

        const baseArea = l * w;
        const wastageArea = includeWastage ? baseArea * 1.1 : baseArea;
        const finalArea = wastageArea;

        // Pricing
        const basePrice = finalArea * selectedMaterial.pricePerSqFt;
        const isBulk = finalArea > 1000;
        const discount = isBulk ? basePrice * 0.05 : 0;
        const finalPrice = basePrice - discount;
        const gst = finalPrice * 0.18;
        const grandTotal = finalPrice + gst;

        // BOM Estimates
        // Assuming avg slab is ~18 sqft (approx 6x3)
        const avgSlabSize = 18;
        const slabsNeeded = Math.ceil(finalArea / avgSlabSize);

        // Weight: Approx 5.5kg per sqft for 20-30mm stone
        const weightKg = Math.round(finalArea * 5.5);

        return {
            baseArea,
            finalArea,
            basePrice,
            discount,
            isBulk,
            finalPrice,
            gst,
            grandTotal,
            slabsNeeded,
            weightKg
        };
    };

    const metrics = calculateMetrics();

    // Visual Scaling Logic
    // Constrain the visual box within a max container of 300x300px
    const maxVisual = 280;
    const aspectRatio = (parseFloat(width) || 1) / (parseFloat(length) || 1);

    let visualWidth = maxVisual;
    let visualHeight = maxVisual * aspectRatio;

    if (visualHeight > maxVisual) {
        visualHeight = maxVisual;
        visualWidth = maxVisual / aspectRatio;
    }

    return (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-stone-100 flex flex-col md:flex-row h-full">

            {/* LEFT: Interactive Blueprint & Configuration */}
            <div className="p-8 md:w-3/5 space-y-8 relative">
                <div className="absolute inset-0 bg-[#f4f4f5] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] -z-10 opacity-50" />

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-xl font-serif font-bold text-stone-900 flex items-center gap-2">
                            <Ruler className="w-5 h-5 text-amber-600" />
                            Smart Surface Planner
                        </h3>
                        <p className="text-xs text-stone-500 mt-1 uppercase tracking-widest">Interactive Blueprint</p>
                    </div>
                </div>

                {/* 2D Visualizer */}
                <div className="h-[320px] bg-white border border-stone-200 rounded-xl shadow-inner relative flex justify-center items-center overflow-hidden">
                    {/* Measurement Labels */}
                    <div className="absolute top-4 font-mono text-xs text-stone-400 bg-stone-100 px-2 py-1 rounded">
                        Blueprint Preview
                    </div>

                    <motion.div
                        layout
                        initial={false}
                        animate={{
                            // Correct mapping: Width input -> Horizontal, Length input -> Vertical or vice versa. 
                            // Let's assume standard plan view: Length (Y), Width (X)
                            width: visualWidth,
                            height: visualHeight
                        }}
                        transition={{ type: "spring", stiffness: 120, damping: 20 }}
                        className="relative shadow-2xl border-2 border-stone-900 bg-stone-200 overflow-hidden"
                        style={{
                            maxWidth: '90%',
                            maxHeight: '90%'
                        }}
                    >
                        {/* Texture Overlay */}
                        <div
                            className="absolute inset-0 opacity-80 mix-blend-multiply"
                            style={{
                                backgroundImage: `url(${selectedMaterial.images[0]})`,
                                backgroundSize: '100px 100px', // Repeat pattern
                                filter: 'contrast(1.1) brightness(1.05)'
                            }}
                        />

                        {/* Center Dimensions Label */}
                        <div className="absolute inset-0 flex  justify-center items-center">
                            <span className="bg-black/70 text-white text-xs font-mono px-2 py-1 rounded backdrop-blur-sm">
                                {length} x {width} {unit}
                            </span>
                        </div>
                    </motion.div>
                </div>

                {/* Inputs */}
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Length ({unit})</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={length}
                                onChange={(e) => setLength(e.target.value)}
                                className="w-full p-3 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 outline-none font-mono text-lg"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Width ({unit})</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={width}
                                onChange={(e) => setWidth(e.target.value)}
                                className="w-full p-3 bg-white border border-stone-200 rounded-lg focus:ring-2 focus:ring-stone-900 outline-none font-mono text-lg"
                            />
                        </div>
                    </div>
                </div>

                {/* Material Selector (Mini) */}
                <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">Select Material Surface</label>
                    <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                        {PREMIUM_STONES.map(stone => (
                            <button
                                key={stone.id}
                                onClick={() => setSelectedMaterialId(stone.id)}
                                className={`flex-shrink-0 w-12 h-12 rounded-lg border-2 overflow-hidden transition-all ${selectedMaterialId === stone.id ? 'border-stone-900 scale-110 shadow-md' : 'border-stone-200 opacity-70 grayscale hover:grayscale-0'}`}
                            >
                                <img src={stone.images[0]} alt={stone.name} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                    <p className="text-sm font-medium text-stone-800">{selectedMaterial.name}</p>
                </div>

                {/* Wastage Toggle */}
                <div
                    onClick={() => setIncludeWastage(!includeWastage)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${includeWastage ? 'bg-amber-50 border-amber-200' : 'bg-white border-dashed border-stone-300'}`}
                >
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${includeWastage ? 'bg-amber-500 border-amber-500 text-white' : 'border-stone-400'}`}>
                        {includeWastage && <CheckIcon />}
                    </div>
                    <div className="flex-1">
                        <span className="text-sm font-bold text-stone-800">Include 10% Cutting Wastage</span>
                        <p className="text-xs text-stone-500">Recommended for irregular shapes</p>
                    </div>
                    <span className="text-xs font-mono font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded">+10%</span>
                </div>
            </div>

            {/* RIGHT: Bill of Materials (BOM) */}
            <div className="bg-stone-900 text-stone-300 p-8 md:w-2/5 flex flex-col justify-between relative overflow-hidden">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                    <Calculator size={120} />
                </div>

                <div>
                    <h4 className="text-white font-serif text-xl mb-6 flex items-center gap-2">
                        <Package className="text-stone-500" size={20} /> Bill of Materials
                    </h4>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-stone-800 pb-3">
                            <span className="text-sm">Total Area</span>
                            <span className="text-white font-mono text-lg">{metrics.finalArea.toFixed(2)} sq.ft</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-stone-800 pb-3">
                            <span className="text-sm flex items-center gap-2"><Package size={14} /> Est. Slabs</span>
                            <span className="text-white font-mono text-lg">{metrics.slabsNeeded} pcs</span>
                        </div>
                        <div className="flex justify-between items-center border-b border-stone-800 pb-3">
                            <div className="tooltip-container relative group">
                                <span className="text-sm flex items-center gap-2 cursor-help"><Truck size={14} /> Est. Weight</span>
                                <div className="absolute bottom-full left-0 mb-2 w-48 bg-black text-xs p-2 rounded hidden group-hover:block z-50">
                                    Based on avg density for {selectedMaterial.materialType}
                                </div>
                            </div>
                            <span className="text-white font-mono text-lg">{metrics.weightKg} kg</span>
                        </div>

                        {metrics.isBulk && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-green-900/30 border border-green-800 p-3 rounded-lg flex items-center gap-3"
                            >
                                <Percent className="text-green-500" size={20} />
                                <div>
                                    <span className="text-green-400 font-bold block text-sm">Bulk Savings Applied!</span>
                                    <span className="text-green-600 text-xs">You saved ₹{metrics.discount.toFixed(0)}</span>
                                </div>
                            </motion.div>
                        )}
                    </div>
                </div>

                <div className="mt-8 pt-8 border-t border-stone-800">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-sm text-stone-500">Estimated Cost (Excl. GST)</span>
                        <span className="text-stone-400 font-mono">₹{metrics.finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex justify-between items-end mb-4">
                        <span className="text-sm text-stone-500">GST (18%)</span>
                        <span className="text-stone-400 font-mono">₹{metrics.gst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    </div>

                    <div className="bg-white text-black p-4 rounded-xl flex justify-between items-center shadow-lg transform hover:scale-105 transition-transform cursor-pointer">
                        <div>
                            <span className="block text-xs uppercase tracking-widest text-stone-500">Grand Total</span>
                            <span className="text-2xl font-bold font-serif">₹{metrics.grandTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="h-8 w-8 bg-black rounded-full flex items-center justify-center text-white">
                            <span className="text-lg">→</span>
                        </div>
                    </div>
                    <p className="text-[10px] text-stone-600 mt-4 text-center">
                        *Final quote may vary based on exact slab selection and location.
                    </p>
                </div>
            </div>
        </div>
    );
};

const CheckIcon = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
        <path d="M1 7l3 3 7-7" />
    </svg>
);

export default SmartSurfacePlanner;
