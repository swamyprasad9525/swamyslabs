import React, { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { X, Calendar, Clock, Phone, Mail, User } from 'lucide-react';

const CallbackForm = ({ isOpen, onClose, product }) => {
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        scheduledTime: new Date()
    });
    const [status, setStatus] = useState('idle'); // idle, submitting, success, error
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setFormData({
                name: '',
                phone: '',
                scheduledTime: new Date()
            });
            setFormData({
                name: '',
                phone: '',
                scheduledTime: new Date()
            });
            setStatus('idle');
            setErrorMessage('');
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('submitting');

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/request-callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    productName: product?.name,
                    customerName: formData.name,
                    phoneNumber: formData.phone,
                    preferredTime: formData.scheduledTime
                })
            });

            const data = await response.json();

            if (response.ok) {
                setStatus('success');
                setTimeout(() => {
                    onClose();
                }, 3000);
            } else {
                throw new Error(data.error || 'Failed to send request');
            }
        } catch (error) {
            console.error(error);
            setStatus('error');
            setErrorMessage(error.message);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h3 className="text-xl font-bold text-gray-900">Request a Call</h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {status === 'success' ? (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Check className="w-8 h-8 text-green-600" />
                        </div>
                        <h4 className="text-xl font-bold text-gray-900 mb-2">Request Sent!</h4>
                        <p className="text-gray-500">We will call you shortly at your preferred time.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 mb-2">
                            Interested in: <span className="font-semibold text-gray-900">{product?.name}</span>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                    placeholder="Your Name"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number</label>
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="tel"
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                    placeholder="+91 98765 43210"
                                    value={formData.phone}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Preferred Time</label>
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                                    <Clock className="w-5 h-5 text-gray-400" />
                                </div>
                                <DatePicker
                                    selected={formData.scheduledTime}
                                    onChange={(date) => setFormData({ ...formData, scheduledTime: date })}
                                    showTimeSelect
                                    dateFormat="MMMM d, yyyy h:mm aa"
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all cursor-pointer"
                                    wrapperClassName="w-full"
                                />
                            </div>
                        </div>

                        {status === 'error' && (
                            <p className="text-red-500 text-sm text-center">{errorMessage || 'Something went wrong. Please try again.'}</p>
                        )}

                        <button
                            type="submit"
                            disabled={status === 'submitting'}
                            className="w-full py-3.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-black/10 flex items-center justify-center gap-2"
                        >
                            {status === 'submitting' ? 'Sending...' : 'Request Callback'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

// Simple Check icon for success state
const Check = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

export default CallbackForm;
