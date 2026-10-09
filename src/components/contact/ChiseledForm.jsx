import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useToast } from '../common/Toast';
import { apiRequest, createSubmissionId } from '../../lib/api';

const ChiseledInput = ({ label, type = "text", placeholder, id, textarea = false, value, onChange, required = false, maxLength }) => {
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
                        required={required}
                        maxLength={maxLength}
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
                        required={required}
                        maxLength={maxLength}
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



const SubmitButton = ({ status, disabled }) => {
    return (
        <motion.button
            type="submit"
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
    const { showToast } = useToast();
    const [formData, setFormData] = useState({
        name: '',
        phoneNumber: '', // Using phoneNumber instead of email for primary consistent with backend logic, or we can use email
        email: '',
        details: ''
    });
    const [status, setStatus] = useState('idle'); // idle, sending, sent, error
    const [reference, setReference] = useState('');
    const submissionIdRef = useRef(createSubmissionId());

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!formData.name || !formData.phoneNumber || !formData.email) {
            showToast('Name, email, and phone number are required.', 'error');
            return;
        }

        setStatus('sending');

        try {
            const result = await apiRequest('/api/request-callback', {
                method: 'POST',
                body: JSON.stringify({
                    submissionId: submissionIdRef.current,
                    source: 'CONTACT',
                    customerName: formData.name,
                    phoneNumber: formData.phoneNumber,
                    email: formData.email,
                    productName: "General Inquiry - Contact Form", // Default value to satisfy backend "productName" requirement
                    preferredTime: new Date().toISOString(),
                    sourcePage: `${window.location.pathname}${window.location.search}`,
                    message: formData.details
                }),
            });
            setReference(result.reference || '');
            setStatus('sent');
            showToast('Inquiry saved successfully.', 'success');
            setFormData({ name: '', phoneNumber: '', email: '', details: '' });
            submissionIdRef.current = createSubmissionId();
        } catch (error) {
            console.error('Error sending message:', error);
            setStatus('error');
            showToast(error instanceof Error ? error.message : 'Something went wrong. Please check your connection.', 'error');
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-[#12100e] p-8 md:p-12 border border-stone-800 shadow-2xl relative overflow-hidden backdrop-blur-sm bg-opacity-90">
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
                required
                maxLength={120}
            />

            <ChiseledInput
                id="phoneNumber"
                label="Phone Number"
                type="tel"
                placeholder="Enter Phone Number"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                required
                maxLength={30}
            />

            <ChiseledInput
                id="email"
                label="Email Address"
                type="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={handleInputChange}
                required
                maxLength={254}
            />



            <ChiseledInput
                id="details"
                label="Project Details"
                textarea
                placeholder="Tell us about the scale and vision of your project..."
                value={formData.details}
                onChange={handleInputChange}
                maxLength={3000}
            />

            {reference && <p className="mb-5 border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-center text-sm text-emerald-200" role="status">Request saved. Reference: <strong>{reference}</strong></p>}
            {status === 'error' && <p className="mb-5 text-center text-sm text-red-300" role="alert">The request could not be saved. Please try again.</p>}
            <SubmitButton status={status} disabled={status === 'sending' || status === 'sent'} />
        </form>
    );
};

export default ChiseledForm;
