import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

const ChiseledInput = ({ label, type = "text", placeholder, id, textarea = false, value, onChange }) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
        <div className="relative group mb-8">
            <label htmlFor={id} className="block text-stone-400 text-xs font-bold uppercase tracking-widest mb-2 ml-1">
                {label}
            </label>
            <div className="relative">
                {textarea ? (
                    <textarea
                        id={id}
                        rows="4"
                        placeholder={placeholder}
                        value={value}
                        onChange={onChange}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        className="w-full bg-[#1c1917] text-stone-200 placeholder-stone-700 text-sm font-medium p-4 rounded-sm outline-none border-none shadow-[inset_2px_2px_5px_rgba(0,0,0,0.8),inset_-1px_-1px_2px_rgba(255,255,255,0.05)] transition-all duration-300 resize-none"
                    />
                ) : (
                    <input
                        type={type}
                        id={id}
                        placeholder={placeholder}
                        value={value}
                        onChange={onChange}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        className="w-full bg-[#1c1917] text-stone-200 placeholder-stone-700 text-sm font-medium p-4 rounded-sm outline-none border-none shadow-[inset_2px_2px_5px_rgba(0,0,0,0.8),inset_-1px_-1px_2px_rgba(255,255,255,0.05)] transition-all duration-300"
                    />
                )}

                {/* Molten Copper Glow Effect */}
                <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: isFocused ? "100%" : "0%" }}
                    transition={{ duration: 0.5, ease: "circOut" }}
                    className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-amber-600 via-amber-400 to-amber-600 shadow-[0_0_10px_rgba(217,119,6,0.6)]"
                />
            </div>
        </div>
    );
};



const SubmitButton = ({ onClick, status, disabled }) => {
    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            className="w-full relative overflow-hidden group bg-amber-700 hover:bg-amber-600 text-white font-bold uppercase tracking-[0.2em] py-5 px-8 shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: disabled ? 1 : 1.02 }}
            animate={status === 'sending' ? { x: [0, -5, 5, -5, 5, 0] } : {}}
            transition={{ duration: 0.4 }}
        >
            <span className={`relative z-10 flex items-center justify-center gap-2 ${status === 'sent' ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}>
                {status === 'sending' ? 'Carving Message...' : 'Send Inquiry'}
            </span>

            {/* Sent State */}
            <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: status === 'sent' ? 1 : 0, scale: status === 'sent' ? 1 : 0.5 }}
                className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
            >
                <span className="flex items-center gap-2 text-white"><Check /> Message Sent</span>
            </motion.div>

            {/* Texture Overlay */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30 mix-blend-overlay"></div>
        </motion.button>
    );
};

const ChiseledForm = () => {
    const [formData, setFormData] = useState({
        name: '',
        phoneNumber: '', // Using phoneNumber instead of email for primary consistent with backend logic, or we can use email
        email: '',
        details: ''
    });
    const [status, setStatus] = useState('idle'); // idle, sending, sent, error

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async () => {
        if (!formData.name || !formData.phoneNumber) {
            alert('Name and Phone Number are required.');
            return;
        }

        setStatus('sending');

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/request-callback`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    customerName: formData.name,
                    phoneNumber: formData.phoneNumber,
                    email: formData.email,
                    productName: "General Inquiry - Contact Form", // Default value to satisfy backend "productName" requirement
                    preferredTime: new Date().toISOString(),
                    // We append details to sourcePage or handle it if backend supported it, 
                    // otherwise just sending basic info for now as per backend schema.
                    // Ideally backend should accept 'message' field. 
                    // But for now, let's stick to valid payload.
                    sourcePage: `Contact Page - Message: ${formData.details}`
                }),
            });

            if (response.ok) {
                setStatus('sent');
                // Reset form after delay
                setTimeout(() => {
                    setStatus('idle');
                    setFormData({
                        name: '',
                        phoneNumber: '',
                        email: '',
                        details: ''
                    });
                }, 3000);
            } else {
                setStatus('error');
                alert('Failed to send message. Please try again.');
                setStatus('idle');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            setStatus('error');
            alert('Something went wrong. Please check your connection.');
            setStatus('idle');
        }
    };

    return (
        <div className="bg-[#12100e] p-8 md:p-12 border border-stone-800 shadow-2xl relative overflow-hidden backdrop-blur-sm bg-opacity-90">
            {/* Background Texture */}
            <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{ backgroundImage: `radial-gradient(circle at 50% 0%, #292524 0%, transparent 70%)` }}>
            </div>

            <ChiseledInput
                id="name"
                label="Your Name"
                placeholder="e.g. Swamy Prasad"
                value={formData.name}
                onChange={handleInputChange}
            />

            <ChiseledInput
                id="phoneNumber"
                label="Phone Number"
                type="tel"
                placeholder="+91 99999 99999"
                value={formData.phoneNumber}
                onChange={handleInputChange}
            />

            <ChiseledInput
                id="email"
                label="Email Address"
                type="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={handleInputChange}
            />



            <ChiseledInput
                id="details"
                label="Project Details"
                textarea
                placeholder="Tell us about the scale and vision of your project..."
                value={formData.details}
                onChange={handleInputChange}
            />

            <SubmitButton onClick={handleSubmit} status={status} disabled={status === 'sending' || status === 'sent'} />
        </div>
    );
};

export default ChiseledForm;
