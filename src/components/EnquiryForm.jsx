import { useEffect, useRef, useState } from 'react';
import { Check, FileText, Upload, X } from 'lucide-react';
import { apiRequest, createSubmissionId } from '../lib/api';

const EMPTY_FORM = {
    customerName: '',
    company: '',
    email: '',
    phoneNumber: '',
    projectLocation: '',
    quantity: '',
    message: '',
    file: null,
};

const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function EnquiryForm({ isOpen, onClose, product }) {
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [reference, setReference] = useState('');
    const submissionIdRef = useRef('');
    const dialogRef = useRef(null);
    const closeButtonRef = useRef(null);
    const restoreFocusRef = useRef(null);

    const materialType = product?.materialFamily || product?.materialType || '';
    const selectedFinish = product?.selectedFinish || product?.finish || '';
    const thickness = product?.thickness || '';
    const canonicalPath = product?.canonicalPath || (product?.slug ? `/stones/${product.slug}` : '/stones');
    const contextSummary = typeof product?.contextSummary === 'string'
        ? product.contextSummary.trim().slice(0, 2200)
        : '';
    const noteLimit = 3000;

    useEffect(() => {
        if (!isOpen) return undefined;
        restoreFocusRef.current = document.activeElement;
        setFormData(previous => ({
            ...previous,
            quantity: product?.quantity ? String(product.quantity) : previous.quantity,
            message: product?.message || previous.message,
        }));
        setStatus('idle');
        setErrorMessage('');
        setReference('');
        if (!submissionIdRef.current) submissionIdRef.current = createSubmissionId();

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeButtonRef.current?.focus();

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                onClose();
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
    }, [isOpen, onClose, product]);

    const updateField = (field) => (event) => setFormData(previous => ({ ...previous, [field]: event.target.value }));

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
            setStatus('error');
            setErrorMessage('Choose a JPG, PNG, WebP, or PDF file up to 5 MB.');
            event.target.value = '';
            return;
        }
        setStatus('idle');
        setErrorMessage('');
        setFormData(previous => ({ ...previous, file }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setStatus('submitting');
        setErrorMessage('');

        const data = new FormData();
        data.append('submissionId', submissionIdRef.current || createSubmissionId());
        data.append('source', product?.crmSource || 'STONE_ENQUIRY');
        data.append('productName', product?.name || 'Project enquiry');
        data.append('productId', product?.stoneId || product?.id || '');
        data.append('productSlug', product?.slug || '');
        data.append('productUrl', canonicalPath);
        data.append('customerName', formData.customerName);
        data.append('company', formData.company);
        data.append('email', formData.email);
        data.append('phoneNumber', formData.phoneNumber);
        data.append('projectLocation', formData.projectLocation);
        data.append('materialType', materialType);
        data.append('selectedFinish', selectedFinish);
        data.append('thickness', thickness);
        data.append('quantity', formData.quantity);
        data.append('message', formData.message.trim());
        const leadContext = product?.leadContext || {};
        [
            'application',
            'enteredArea',
            'projectAreaSqFt',
            'planningAllowancePercent',
            'requiredAreaSqFt',
            'estimatedSlabs',
            'indicativeMaterialEstimate',
        ].forEach((field) => {
            const value = leadContext[field];
            if (value !== null && value !== undefined && value !== '') data.append(field, String(value));
        });
        if (Array.isArray(product?.materialSelections) && product.materialSelections.length) {
            data.append('materialSelections', JSON.stringify(product.materialSelections));
        }
        if (formData.file) data.append('file', formData.file);

        try {
            const result = await apiRequest('/api/leads', { method: 'POST', body: data });
            setReference(result.reference || '');
            setStatus('success');
            setFormData(EMPTY_FORM);
            submissionIdRef.current = '';
        } catch (error) {
            console.error('Enquiry submission failed');
            setStatus('error');
            setErrorMessage(error instanceof Error ? error.message : 'Failed to send enquiry');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto p-4 sm:p-6">
            <button type="button" aria-label="Close enquiry" onClick={onClose} className="fixed inset-0 h-full w-full cursor-default bg-stone-950/70 backdrop-blur-sm" />
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="enquiry-title" className="relative my-auto w-full max-w-2xl overflow-hidden bg-[var(--color-surface)] shadow-2xl">
                <header className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-5 sm:px-8 sm:py-6">
                    <div>
                        <p className="type-eyebrow text-[var(--color-brand)]">Project enquiry</p>
                        <h2 id="enquiry-title" className="mt-2 font-serif text-3xl text-stone-950">Request a quotation</h2>
                    </div>
                    <button ref={closeButtonRef} type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-full border border-stone-300 hover:bg-stone-100" aria-label="Close quotation form"><X size={20} /></button>
                </header>

                {status === 'success' ? (
                    <div className="px-6 py-16 text-center sm:px-10">
                        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={28} /></span>
                        <h3 className="mt-6 font-serif text-3xl text-stone-950">Enquiry received.</h3>
                        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-stone-600">Your selected material and project information are saved for review.</p>
                        {reference && <p className="mx-auto mt-5 w-fit border border-stone-300 bg-stone-100 px-5 py-3 text-sm font-bold tracking-[.08em] text-stone-900">Reference: {reference}</p>}
                        <p className="mx-auto mt-3 max-w-md text-xs leading-6 text-stone-500">Keep this reference when discussing the request with the Swamy Slabs team.</p>
                        <button type="button" onClick={onClose} className="action-link mt-7 border-stone-950 bg-stone-950 text-white">Close</button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="max-h-[calc(100vh-8rem)] space-y-6 overflow-y-auto px-5 py-6 sm:px-8">
                        <section aria-labelledby="selected-material-title" className="border border-[var(--color-border)] bg-stone-100/70 p-4">
                            <p id="selected-material-title" className="type-eyebrow text-stone-500">Selected material</p>
                            <p className="mt-2 font-serif text-xl text-stone-950">{product?.name || 'Project enquiry'}</p>
                            {[materialType, selectedFinish, thickness].filter(Boolean).length > 0 && <p className="mt-2 text-sm text-stone-600">{[materialType, selectedFinish, thickness].filter(Boolean).join(' · ')}</p>}
                            {contextSummary && (
                                <details className="group mt-4 border-t border-stone-300 pt-4">
                                    <summary className="min-h-11 cursor-pointer py-3 text-[10px] font-bold uppercase tracking-[.14em] text-stone-600">Planner context included · Review details</summary>
                                    <p className="mt-2 whitespace-pre-line text-xs leading-6 text-stone-600">{contextSummary}</p>
                                </details>
                            )}
                        </section>

                        <div className="grid gap-5 sm:grid-cols-2">
                            <label className="grid gap-2 text-sm font-semibold text-stone-800 sm:col-span-2">Name <span className="sr-only">required</span>
                                <input required maxLength="120" autoComplete="name" value={formData.customerName} onChange={updateField('customerName')} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold text-stone-800">Email <span className="sr-only">required</span>
                                <input required type="email" maxLength="254" autoComplete="email" value={formData.email} onChange={updateField('email')} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold text-stone-800">Phone / WhatsApp <span className="sr-only">required</span>
                                <input required type="tel" maxLength="30" autoComplete="tel" value={formData.phoneNumber} onChange={updateField('phoneNumber')} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold text-stone-800">Company <span className="font-normal text-stone-500">(optional)</span>
                                <input maxLength="160" autoComplete="organization" value={formData.company} onChange={updateField('company')} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold text-stone-800">Project location <span className="font-normal text-stone-500">(optional)</span>
                                <input maxLength="200" value={formData.projectLocation} onChange={updateField('projectLocation')} className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold text-stone-800 sm:col-span-2">Required area or quantity
                                <input required maxLength="100" value={formData.quantity} onChange={updateField('quantity')} placeholder="For example: 2000 sq.ft or project quantity to be discussed" className="h-12 border border-stone-300 bg-white px-4 font-normal outline-none" />
                            </label>
                            <label className="grid gap-2 text-sm font-semibold text-stone-800 sm:col-span-2">Project notes <span className="font-normal text-stone-500">(optional)</span>
                                <textarea maxLength={noteLimit} rows="4" value={formData.message} onChange={updateField('message')} placeholder="Site conditions, layout requirements or other useful project context" className="border border-stone-300 bg-white p-4 font-normal outline-none" />
                            </label>
                        </div>

                        <label className="relative flex min-h-28 cursor-pointer items-center gap-4 border border-dashed border-stone-400 bg-stone-100/60 p-4">
                            <input type="file" onChange={handleFileChange} accept="image/jpeg,image/png,image/webp,application/pdf" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-stone-600">{formData.file ? <FileText size={21} /> : <Upload size={21} />}</span>
                            <span><span className="block text-sm font-semibold text-stone-900">{formData.file?.name || 'Attach drawing, PDF or site image'}</span><span className="mt-1 block text-xs leading-5 text-stone-500">JPG, PNG, WebP or PDF · Maximum 5 MB</span></span>
                        </label>

                        {status === 'error' && <p role="alert" className="text-sm text-[var(--color-danger)]">{errorMessage || 'The enquiry could not be sent. Please review the form and try again.'}</p>}

                        <button type="submit" disabled={status === 'submitting'} className="action-link w-full border-[var(--color-brand)] bg-[var(--color-brand)] text-white disabled:cursor-wait disabled:opacity-60">
                            {status === 'submitting' ? 'Sending enquiry…' : 'Send quotation request'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
