import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';

const PriceEstimatorModal = ({ isOpen, onClose, product }) => {
    const [area, setArea] = useState('');
    const [isBulk, setIsBulk] = useState(false);
    const [totalPrice, setTotalPrice] = useState(0);
    const [discountApplied, setDiscountApplied] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setArea('');
            setIsBulk(false);
            setTotalPrice(0);
            setDiscountApplied(false);
        }
    }, [isOpen]);

    useEffect(() => {
        calculatePrice();
    }, [area, isBulk]);

    const calculatePrice = () => {
        const areaNum = parseFloat(area);
        if (!product || isNaN(areaNum) || areaNum <= 0) {
            setTotalPrice(0);
            setDiscountApplied(false);
            return;
        }

        let price = product.pricePerSqFt * areaNum;
        let discount = false;

        // Bulk discount logic: > 5000 Sq.Ft and toggle enabled
        if (isBulk && areaNum > 5000) {
            price = price * 0.95; // 5% discount
            discount = true;
        }

        setTotalPrice(price);
        setDiscountApplied(discount);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h3 className="text-xl font-bold text-gray-900">Get Best Price</h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Product Info */}
                    <div className="bg-gray-50 p-4 rounded-xl">
                        <p className="text-sm text-gray-500 mb-1">Estimate for</p>
                        <p className="font-semibold text-gray-900">{product?.name}</p>
                        <p className="text-sm text-gray-600">₹{product?.pricePerSqFt} / Sq.Ft</p>
                    </div>

                    {/* Area Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Required Area (Sq.Ft)
                        </label>
                        <input
                            type="number"
                            value={area}
                            onChange={(e) => setArea(e.target.value)}
                            placeholder="Enter area (e.g. 1500)"
                            className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all"
                        />
                    </div>

                    {/* Bulk Discount Toggle */}
                    <div className="flex items-center justify-between bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div>
                            <span className="block text-sm font-medium text-gray-900">Bulk Discount</span>
                            <span className="text-xs text-gray-500">Enable for orders {'>'} 5000 Sq.Ft</span>
                        </div>
                        <button
                            onClick={() => setIsBulk(!isBulk)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 ${isBulk ? 'bg-black' : 'bg-gray-200'
                                }`}
                        >
                            <span
                                className={`${isBulk ? 'translate-x-6' : 'translate-x-1'
                                    } inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                            />
                        </button>
                    </div>

                    {/* Total Price */}
                    <div className="border-t border-gray-100 pt-4">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-gray-600">Estimated Total</span>
                            <div className="text-right">
                                {discountApplied && (
                                    <span className="block text-xs text-green-600 font-medium mb-1">
                                        5% Bulk Discount Applied
                                    </span>
                                )}
                                <span className="text-3xl font-bold text-gray-900">
                                    ₹{totalPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
                    >
                        Close
                    </button>
                    <button
                        className="flex-1 px-4 py-3 bg-black text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-lg shadow-black/10"
                        onClick={() => {
                            // Logic to share or proceed (placeholder for now)
                            alert(`Estimate: ₹${totalPrice.toLocaleString()}`);
                            onClose();
                        }}
                    >
                        Proceed
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PriceEstimatorModal;
