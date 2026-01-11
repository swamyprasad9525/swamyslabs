import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, Package, Check } from 'lucide-react';

const EnquiryForm = ({ isOpen, onClose, product }) => {
    const [formData, setFormData] = useState({
        materialType: product?.materialType || '',
        thickness: product?.thickness || '',
        quantity: '',
        message: '',
        file: null
    });
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (isOpen && product) {
            setFormData(prev => ({
                ...prev,
                materialType: product.materialType || '',
                thickness: product.thickness || ''
            }));
        }
    }, [isOpen, product]);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFormData(prev => ({ ...prev, file: e.target.files[0] }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus('submitting');

        const data = new FormData();
        data.append('productName', product?.name);
        data.append('materialType', formData.materialType);
        data.append('thickness', formData.thickness);
        data.append('quantity', formData.quantity);
        data.append('message', formData.message);
        if (formData.file) {
            data.append('file', formData.file);
        }

        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/api/send-enquiry`, {
                method: 'POST',
                body: data,
            });

            const result = await response.json();

            if (response.ok) {
                setStatus('success');
                setTimeout(() => {
                    onClose();
                    setStatus('idle');
                    setFormData({
                        materialType: '',
                        thickness: '',
                        quantity: '',
                        message: '',
                        file: null
                    });
                }, 3000);
            } else {
                throw new Error(result.error || 'Failed to send enquiry');
            }
        } catch (error) {
            console.error(error);
            setStatus('error');
            setErrorMessage(error.message);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h3 className="text-xl font-bold text-gray-900">Detailed Enquiry</h3>
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
                        <h4 className="text-xl font-bold text-gray-900 mb-2">Enquiry Sent!</h4>
                        <p className="text-gray-500">We have received your details and blueprints. Our team will get back to you with a quote.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <h4 className="font-semibold text-gray-900 mb-2">Product Details</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm"
                                        value={formData.materialType}
                                        onChange={e => setFormData({ ...formData, materialType: e.target.value })}
                                        placeholder="e.g. Limestone"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Thickness</label>
                                    <input
                                        type="text"
                                        className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm"
                                        value={formData.thickness}
                                        onChange={e => setFormData({ ...formData, thickness: e.target.value })}
                                        placeholder="e.g. 20mm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Quantity Required</label>
                            <div className="relative">
                                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input
                                    type="text"
                                    required
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                                    placeholder="e.g. 2000 Sq.Ft"
                                    value={formData.quantity}
                                    onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Blueprints / Site Images</label>
                            <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:bg-gray-50 transition-colors cursor-pointer group relative">
                                <input
                                    type="file"
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    onChange={handleFileChange}
                                    accept="image/*,.pdf"
                                />
                                <div className="flex flex-col items-center">
                                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                        <Upload className="w-6 h-6 text-gray-500" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-900">
                                        {formData.file ? formData.file.name : 'Click to upload or drag and drop'}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">SVG, PNG, JPG or PDF</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional Notes</label>
                            <textarea
                                className="w-full p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all min-h-[100px]"
                                placeholder="Any specific requirements..."
                                value={formData.message}
                                onChange={e => setFormData({ ...formData, message: e.target.value })}
                            />
                        </div>

                        {status === 'error' && (
                            <p className="text-red-500 text-sm text-center">{errorMessage || 'Failed to send enquiry. Please check your connection.'}</p>
                        )}

                        <button
                            type="submit"
                            disabled={status === 'submitting'}
                            className="w-full py-3.5 bg-black text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
                        >
                            {status === 'submitting' ? 'Uploading...' : 'Send Detailed Enquiry'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default EnquiryForm;
