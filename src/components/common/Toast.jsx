import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext({
    showToast: () => { }
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'success', duration = 4000) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            
            {/* Toast Container */}
            <div className="fixed bottom-6 left-4 md:left-6 z-[9999] flex flex-col gap-3 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
                <AnimatePresence>
                    {toasts.map((toast) => (
                        <motion.div
                            key={toast.id}
                            layout
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            className="pointer-events-auto flex items-center justify-between p-4 rounded-xl border border-stone-200/50 bg-white/80 backdrop-blur-md shadow-2xl"
                        >
                            <div className="flex items-center gap-3">
                                {toast.type === 'success' && (
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-50 text-green-600">
                                        <CheckCircle size={18} />
                                    </div>
                                )}
                                {toast.type === 'error' && (
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-50 text-red-600">
                                        <AlertCircle size={18} />
                                    </div>
                                )}
                                {toast.type === 'info' && (
                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-50 text-amber-600">
                                        <Info size={18} />
                                    </div>
                                )}
                                <span className="text-sm font-medium text-stone-800">{toast.message}</span>
                            </div>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="p-1 text-stone-400 hover:text-stone-900 rounded-full transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};
