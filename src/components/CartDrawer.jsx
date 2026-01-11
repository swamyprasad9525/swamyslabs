import React, { useState } from 'react';
import CallbackForm from './CallbackForm';
import { Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { cn } from '../lib/utils';
import { X, Plus, Minus, ShoppingBag, ArrowRight, ShieldCheck } from 'lucide-react';

const CartDrawer = () => {
    const {
        cartItems,
        isCartOpen,
        setIsCartOpen,
        removeFromCart,
        updateQuantity,
        cartTotal
    } = useCart();
    const [isCallModalOpen, setIsCallModalOpen] = useState(false);

    const parsePrice = (price) => {
        if (typeof price === 'number') return price;
        return parseFloat(price.replace(/[^0-9.]/g, '')) || 0;
    };

    return (
        <>
            <AnimatePresence>
                {isCartOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsCartOpen(false)}
                            className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[60]"
                        />

                        {/* Square Popup Modal */}
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                                className="bg-white w-full max-w-lg max-h-[85vh] aspect-[4/5] md:aspect-square rounded-[3rem] shadow-2xl flex flex-col overflow-hidden relative"
                            >
                                {/* Luxury Header */}
                                <div className="pt-10 px-10 pb-4 flex justify-between items-start shrink-0">
                                    <div className="space-y-2">
                                        <h2 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">Your Selection</h2>
                                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400">
                                            {cartItems.reduce((acc, item) => acc + item.quantity, 0)} Items Curated
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setIsCartOpen(false)}
                                        className="p-2 -mr-2 -mt-2 hover:bg-stone-50 rounded-full transition-all text-stone-400 hover:text-stone-900"
                                    >
                                        <X size={24} strokeWidth={1.5} />
                                    </button>
                                </div>

                                {/* Cart Items Stage */}
                                <div className="flex-1 overflow-y-auto px-10 py-2 custom-scrollbar">
                                    {cartItems.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-center space-y-8 -mt-8">
                                            <div className="w-32 h-32 bg-stone-50/50 rounded-full flex items-center justify-center border border-stone-100 italic font-serif text-4xl text-stone-300">
                                                Void
                                            </div>
                                            <div className="space-y-3">
                                                <p className="text-xl font-serif italic text-stone-900">The collection awaits your discovery.</p>
                                                <button
                                                    onClick={() => setIsCartOpen(false)}
                                                    className="text-stone-900 text-xs font-black uppercase tracking-[0.2em] border-b-2 border-stone-900 pb-1 hover:text-stone-600 hover:border-stone-600 transition-all mt-4"
                                                >
                                                    Return to Gallery
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 pt-4">
                                            {cartItems.map((item) => (
                                                <motion.div
                                                    layout
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    key={item.id}
                                                    className="flex gap-6 group items-center"
                                                >
                                                    {/* Luxury Product Frame */}
                                                    <div className="w-20 h-20 bg-stone-100 rounded-xl overflow-hidden flex-shrink-0 border border-stone-200 relative">
                                                        {item.image ? (
                                                            <img
                                                                src={item.image}
                                                                alt={item.name}
                                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-stone-300 text-[8px] uppercase font-bold">No Image</div>
                                                        )}
                                                    </div>

                                                    {/* Refined Details */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <h3 className="font-serif text-lg text-stone-900 leading-none truncate pr-4">{item.name}</h3>
                                                            <div className="font-serif text-stone-900 font-bold whitespace-nowrap">
                                                                ₹{(parsePrice(item.price) * item.quantity).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </div>
                                                        </div>
                                                        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-stone-400 mb-3">{item.category}</p>

                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center bg-stone-50 rounded-full border border-stone-100 h-8">
                                                                <button
                                                                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                                    className="w-8 h-full flex items-center justify-center hover:bg-stone-100 rounded-l-full transition-colors text-stone-400 hover:text-stone-900"
                                                                >
                                                                    <Minus size={12} />
                                                                </button>
                                                                <span className="w-8 text-center text-xs font-bold font-serif">{item.quantity}</span>
                                                                <button
                                                                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                                    className="w-8 h-full flex items-center justify-center hover:bg-stone-100 rounded-r-full transition-colors text-stone-400 hover:text-stone-900"
                                                                >
                                                                    <Plus size={12} />
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={() => removeFromCart(item.id)}
                                                                className="text-stone-300 hover:text-red-500 transition-colors px-2"
                                                            >
                                                                <span className="sr-only">Remove</span>
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Checkout Footer Case */}
                                {cartItems.length > 0 && (
                                    <div className="p-8 pb-10 bg-white border-t border-stone-100 shrink-0">
                                        <div className="flex justify-between items-end mb-6">
                                            <div className="space-y-1">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Total Selection</p>
                                                <p className="text-3xl font-serif font-bold text-stone-900">₹{cartTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                setIsCartOpen(false);
                                                setIsCallModalOpen(true);
                                            }}
                                            className="group w-full bg-stone-900 text-white h-14 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-black transition-all shadow-xl hover:shadow-2xl active:scale-[0.99] flex justify-center items-center gap-4"
                                        >
                                            <Phone size={16} className="transition-transform group-hover:scale-110" />
                                            Request to Call
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>

            <CallbackForm
                isOpen={isCallModalOpen}
                onClose={() => setIsCallModalOpen(false)}
                product={{ name: `Cart Selection (${cartItems.length} items)` }}
            />
        </>
    );
};

export default CartDrawer;
