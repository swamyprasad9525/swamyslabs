import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, Phone, Mail, Check} from 'lucide-react';
import Cookies from 'js-cookie';

const LeadCapturePopup = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState(1); // 1: Input, 2: Success
    const [formData, setFormData] = useState({ email: '', phone: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        // Trigger immediately on mount (refresh)
        // Ignoring previous 'dismissed' or 'captured' cookies as per user request to show "whenever we refresh"

        const timer = setTimeout(() => {
            setIsOpen(true);
        }, 1000); // Small delay for better UX on load

        return () => clearTimeout(timer);
    }, []);

    const handleClose = () => {
        setIsOpen(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/request-callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumber: formData.phone,
                    email: formData.email,
                    productName: 'Lead Capture Popup',
                    sourcePage: window.location.href // Track exact page
                }),
            });

            if (response.ok) {
                setStep(2);
                // Stop-on-Success: Disable for 30 days
                Cookies.set('lead_captured', 'true', { expires: 30 });
            } else {
                const data = await response.json();
                setError(data.error || 'Something went wrong');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="fixed inset-0 m-auto w-[90%] max-w-md h-fit z-[101] overflow-hidden rounded-2xl bg-white shadow-2xl"
                    >
                        {/* Stone Texture Background (10% Opacity) */}
                        <div className="absolute inset-0 opacity-10 bg-[url('https://images.unsplash.com/photo-1541625602330-2277a4c46182?auto=format&fit=crop&q=80')] bg-cover bg-center pointer-events-none" />

                        <button
                            onClick={handleClose}
                            className="absolute top-4 right-4 text-stone-400 hover:text-stone-900 z-20 transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="relative z-10 p-8 md:p-10 text-center">
                            {step === 1 ? (
                                <>
                                    <h3 className="text-2xl font-serif font-bold text-stone-900 mb-2">
                                        Unlock Exclusive Pricing
                                    </h3>
                                    <p className="text-stone-500 text-sm mb-8 leading-relaxed">
                                        Join our architect network. Get the latest catalog and trade-only price list delivered to your inbox.
                                    </p>

                                    <form onSubmit={handleSubmit} className="space-y-5 text-left">
                                        {/* Phone Input */}
                                        <div className="relative group">
                                            <Phone className="absolute left-3 top-3.5 text-stone-400 w-4 h-4" />
                                            <input
                                                type="tel"
                                                required
                                                placeholder="Phone Number"
                                                value={formData.phone}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                className="w-full bg-stone-50 border border-stone-200 rounded-lg py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-stone-500 focus:bg-white transition-all placeholder:text-stone-400"
                                            />
                                        </div>

                                        {/* Email Input */}
                                        <div className="relative group">
                                            <Mail className="absolute left-3 top-3.5 text-stone-400 w-4 h-4" />
                                            <input
                                                type="email"
                                                required
                                                placeholder="Email Address"
                                                value={formData.email}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full bg-stone-50 border border-stone-200 rounded-lg py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-stone-500 focus:bg-white transition-all placeholder:text-stone-400"
                                            />
                                        </div>

                                        {error && <p className="text-red-500 text-xs text-center">{error}</p>}

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full bg-stone-900 text-white py-3.5 rounded-lg text-sm font-bold tracking-widest uppercase hover:bg-stone-800 transition-all flex items-center justify-center gap-2 group"
                                        >
                                            {loading ? 'Processing...' : (
                                                <>
                                                    Get Access <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                                                </>
                                            )}
                                        </button>

                                        <p className="text-[10px] text-stone-400 text-center mt-4">
                                            We respect your privacy. No spam, ever.
                                        </p>
                                    </form>
                                </>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="py-8"
                                >
                                    <div className="w-16 h-16 bg-stone-100 text-stone-900 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <Check size={32} />
                                    </div>
                                    <h3 className="text-2xl font-serif font-bold text-stone-900 mb-2">
                                        You're In!
                                    </h3>
                                    <p className="text-stone-500 text-sm mb-8">
                                        Thank you for connecting. As promised, here is your catalog.
                                    </p>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default LeadCapturePopup;
