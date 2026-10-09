import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Layers3, Minus, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import EnquiryForm from './EnquiryForm';

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function CartDrawer() {
    const {
        cartItems,
        isCartOpen,
        setIsCartOpen,
        removeFromCart,
        updateQuantity,
    } = useCart();
    const [isEnquiryOpen, setIsEnquiryOpen] = useState(false);
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const restoreFocusRef = useRef(null);
    const reduceMotion = useReducedMotion();

    useEffect(() => {
        if (!isCartOpen) return undefined;
        restoreFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsCartOpen(false);
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...dialogRef.current.querySelectorAll(focusableSelector)];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
            restoreFocusRef.current?.focus?.();
        };
    }, [isCartOpen, setIsCartOpen]);

    const enquiryProduct = useMemo(() => {
        const summary = cartItems.map(item => `${item.name} — quantity ${item.quantity}`).join('\n');
        return {
            name: `Project Selection (${cartItems.length} materials)`,
            materialType: cartItems.map(item => item.materialFamily).filter(Boolean).join(', '),
            quantity: cartItems.reduce((total, item) => total + item.quantity, 0).toString(),
            message: summary ? `Selected materials:\n${summary}` : '',
            canonicalPath: '/stones',
            crmSource: 'PROJECT_SELECTION',
            materialSelections: cartItems.map(item => ({
                stoneId: item.stoneId || item.id,
                stoneSlug: item.slug || '',
                stoneName: item.name,
                materialFamily: item.materialFamily || item.category || '',
                finish: item.finish || '',
                thickness: item.thickness || '',
                quantity: item.quantity,
            })),
        };
    }, [cartItems]);

    const openEnquiry = () => {
        setIsCartOpen(false);
        setIsEnquiryOpen(true);
    };

    return (
        <>
            <AnimatePresence>
                {isCartOpen && (
                    <>
                        <motion.button
                            type="button"
                            aria-label="Close Project Selection"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsCartOpen(false)}
                            className="fixed inset-0 z-[80] h-full w-full cursor-default bg-stone-950/65 backdrop-blur-sm"
                        />
                        <motion.aside
                            ref={dialogRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="project-selection-title"
                            initial={reduceMotion ? false : { x: '100%' }}
                            animate={{ x: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
                            transition={{ duration: .35, ease: [0.22, 1, 0.36, 1] }}
                            className="fixed inset-y-0 right-0 z-[90] flex w-full max-w-lg flex-col bg-[var(--color-surface)] shadow-2xl"
                        >
                            <header className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-6 sm:px-8">
                                <div>
                                    <p className="type-eyebrow text-[var(--color-brand)]">Selected materials</p>
                                    <h2 id="project-selection-title" className="mt-2 font-serif text-3xl text-stone-950">Project Selection</h2>
                                    <p className="mt-2 text-sm text-stone-500">{cartItems.length} {cartItems.length === 1 ? 'stone' : 'stones'} shortlisted</p>
                                </div>
                                <button ref={closeButtonRef} type="button" onClick={() => setIsCartOpen(false)} className="grid h-11 w-11 place-items-center rounded-full border border-stone-300 text-stone-700 hover:bg-stone-100" aria-label="Close Project Selection">
                                    <X size={20} />
                                </button>
                            </header>

                            <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-6 sm:px-8">
                                {cartItems.length === 0 ? (
                                    <div className="flex min-h-[55vh] flex-col items-center justify-center text-center">
                                        <span className="grid h-20 w-20 place-items-center rounded-full bg-stone-100 text-stone-500"><Layers3 size={30} /></span>
                                        <h3 className="mt-6 font-serif text-2xl text-stone-950">No materials selected yet.</h3>
                                        <p className="mt-3 max-w-xs text-sm leading-6 text-stone-600">Explore the stone gallery and add materials you would like to discuss for your project.</p>
                                        <Link to="/stones" onClick={() => setIsCartOpen(false)} className="action-link mt-7 border-stone-950 bg-stone-950 text-white hover:bg-stone-800">Explore Stones</Link>
                                    </div>
                                ) : (
                                    <ul className="divide-y divide-[var(--color-border)]">
                                        {cartItems.map(item => (
                                            <li key={item.id} className="grid grid-cols-[88px_1fr] gap-4 py-6 first:pt-0">
                                                <div className="aspect-square overflow-hidden bg-stone-200">
                                                    {item.image && <img src={item.image} alt="" width="176" height="176" className="h-full w-full object-cover" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="type-eyebrow text-stone-500">{item.materialFamily || 'Natural stone'}</p>
                                                            <h3 className="mt-1 font-serif text-lg leading-snug text-stone-950">{item.name}</h3>
                                                        </div>
                                                        <button type="button" onClick={() => removeFromCart(item.id)} className="grid h-11 w-11 shrink-0 place-items-center text-stone-400 hover:text-[var(--color-danger)]" aria-label={`Remove ${item.name}`}>
                                                            <Trash2 size={17} />
                                                        </button>
                                                    </div>
                                                    {(item.finish || item.thickness) && <p className="mt-2 text-xs text-stone-500">{[item.finish, item.thickness].filter(Boolean).join(' · ')}</p>}
                                                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                                                        <div className="flex h-11 items-center border border-stone-300" aria-label={`Quantity for ${item.name}`}>
                                                            <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="grid h-full w-11 place-items-center hover:bg-stone-100" aria-label={`Decrease ${item.name} quantity`}><Minus size={14} /></button>
                                                            <span className="min-w-10 text-center text-sm font-semibold" aria-live="polite">{item.quantity}</span>
                                                            <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="grid h-full w-11 place-items-center hover:bg-stone-100" aria-label={`Increase ${item.name} quantity`}><Plus size={14} /></button>
                                                        </div>
                                                        {item.slug && (
                                                            <div className="flex flex-wrap justify-end gap-x-4">
                                                                <Link to={`/project-planner?stone=${encodeURIComponent(item.slug)}`} onClick={() => setIsCartOpen(false)} className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-[var(--color-brand)] hover:text-stone-950">Plan This Stone <ArrowUpRight size={15} /></Link>
                                                                <Link to={`/stones/${item.slug}`} onClick={() => setIsCartOpen(false)} className="inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[.12em] text-stone-700 hover:text-[var(--color-brand)]">View Stone <ArrowUpRight size={15} /></Link>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {cartItems.length > 0 && (
                                <footer className="border-t border-[var(--color-border)] bg-stone-100/70 px-5 py-6 sm:px-8">
                                    <p className="text-sm leading-6 text-stone-600">Final finish, dimensions, availability and commercial terms are confirmed during quotation.</p>
                                    <button type="button" onClick={openEnquiry} className="action-link mt-5 w-full border-[var(--color-brand)] bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]">Request Quote</button>
                                </footer>
                            )}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            <EnquiryForm isOpen={isEnquiryOpen} onClose={() => setIsEnquiryOpen(false)} product={enquiryProduct} />
        </>
    );
}
