import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import InvoicePrint from '../../components/admin/InvoicePrint';
import { PREMIUM_STONES } from '../../data/stones';
import { INDIAN_GST_STATES, getStateCodeByName } from '../../data/gstStates';
import { 
  FileText, Plus, Trash2, Eye, Save, X, Sparkles, CheckCircle, 
  Truck, Building, MapPin, Calculator
} from 'lucide-react';
import { motion } from 'framer-motion';

// ── Client-side helpers ───────────────────────────────────────────────────────

function getFY(date) {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  return `${fyStart}-${String(fyStart + 1).slice(-2)}`;
}

function deriveTaxType(buyerStateCode, sellerStateCode = '37') {
  return String(buyerStateCode) === String(sellerStateCode) ? 'CGST_SGST' : 'IGST';
}

const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
function belowHundred(n) { return n < 20 ? ones[n] : tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''); }
function belowThousand(n) { return n < 100 ? belowHundred(n) : ones[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + belowHundred(n % 100) : ''); }
function intToWords(n) {
  if (n === 0) return 'ZERO';
  let r = '';
  if (n >= 1e7) { r += intToWords(Math.floor(n / 1e7)) + ' CRORE '; n %= 1e7; }
  if (n >= 100000) { r += intToWords(Math.floor(n / 1e5)) + ' LAKH '; n %= 1e5; }
  if (n >= 1000) { r += belowThousand(Math.floor(n / 1e3)) + ' THOUSAND '; n %= 1e3; }
  if (n > 0) { r += belowThousand(n); }
  return r.trim();
}
function amountInWords(amount) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let w = intToWords(rupees) + ' RUPEES';
  if (paise > 0) w += ' AND ' + intToWords(paise) + ' PAISE';
  return w + ' ONLY';
}

// ── Default state ─────────────────────────────────────────────────────────────

const today = new Date().toISOString().split('T')[0];

const defaultItem = () => ({
  productName: '',
  description: '',
  hsnCode: '68029900',
  qty: '',
  unit: 'Sqm',
  rate: '',
  amount: 0,
});

const defaultForm = {
  // Transaction Details
  docType: 'Tax Invoice',
  invoiceNumber: '',
  customInvoice: false,
  invoiceDate: today,
  transactionType: 'Regular',
  copyType: 'ORIGINAL FOR RECIPIENT',
  poNumber: '',
  placeOfSupply: 'BETAMCHERLA',

  // Bill From & Dispatch From
  seller: {
    name: 'SWAMY SLABS INDUSTRIES',
    gstin: '37FEIPK5873Q1ZF',
    state: 'ANDHRA PRADESH',
    stateCode: '37',
    address: 'BETAMCHERLA - 518599. Kurnool Dist. A.P.',
    email: 'swamyslabsindustries@gmail.com',
    phone: '9490238301',
    tagline: 'Mfrs. Of : Rough & Black Polished Slabs',
  },
  dispatchFrom: {
    address1: '31 KURNOOL ROAD',
    address2: 'BUGGANAPALLIBETAMCHE',
    place: 'Kurnool',
    pincode: '518599',
    state: 'ANDHRA PRADESH',
  },

  // Bill To & Ship To
  buyer: {
    name: '',
    gstin: '',
    address: '',
    state: 'ANDHRA PRADESH',
    stateCode: '37',
  },
  sameAsbuyer: true,
  consignee: {
    name: '',
    gstin: '',
    address: '',
    place: '',
    pincode: '',
    state: 'ANDHRA PRADESH',
    stateCode: '37',
  },

  // Item details
  lineItems: [defaultItem()],
  packing: {
    totalCrates: '1',
    piecesPerCrate: '100',
  },
  taxRate: 18,

  // PART-B
  partB: {
    mode: 'Road',
    vehicleType: 'Regular',
    vehicleNumber: '',
    docNoDate: today,
  },

  notes: '',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvoiceFormPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [form, setForm] = useState(defaultForm);
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // ── Computations ──────────────────────────────────────────────────────────
  const computedItems = form.lineItems.map(it => {
    const amt = Math.round(Number(it.qty || 0) * Number(it.rate || 0) * 100) / 100;
    return { ...it, amount: amt };
  });

  const taxableValue = computedItems.reduce((s, i) => s + i.amount, 0);
  const taxType = deriveTaxType(form.buyer.stateCode);
  const taxAmount = Math.round(taxableValue * (Number(form.taxRate) / 100) * 100) / 100;
  const grandTotal = Math.round((taxableValue + taxAmount) * 100) / 100;
  const fy = getFY(form.invoiceDate);

  const previewInvoice = {
    invoiceNumber: form.customInvoice && form.invoiceNumber ? form.invoiceNumber : `(auto — ${fy})`,
    invoiceDate: form.invoiceDate,
    copyType: form.copyType,
    poNumber: form.poNumber,
    transportMode: `By ${form.partB.mode}`,
    vehicleNumber: form.partB.vehicleNumber,
    placeOfSupply: form.placeOfSupply || 'BETAMCHERLA',
    seller: form.seller,
    buyer: form.buyer,
    consignee: form.sameAsbuyer ? { ...form.buyer } : form.consignee,
    lineItems: computedItems,
    packing: form.packing,
    taxableValue,
    taxType,
    taxRate: form.taxRate,
    taxAmount,
    grandTotal,
    amountInWords: grandTotal > 0 ? amountInWords(grandTotal) : '',
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const setField = (key, val) => setForm(f => ({ ...f, [key]: val }));
  
  const setBuyerState = (stateName) => {
    const code = getStateCodeByName(stateName);
    setForm(f => ({
      ...f,
      buyer: { ...f.buyer, state: stateName, stateCode: code },
      consignee: f.sameAsbuyer ? { ...f.consignee, state: stateName, stateCode: code } : f.consignee,
    }));
  };

  const setConsigneeState = (stateName) => {
    const code = getStateCodeByName(stateName);
    setForm(f => ({
      ...f,
      consignee: { ...f.consignee, state: stateName, stateCode: code },
    }));
  };

  const setBuyer = (key, val) => setForm(f => ({ ...f, buyer: { ...f.buyer, [key]: val } }));
  const setConsignee = (key, val) => setForm(f => ({ ...f, consignee: { ...f.consignee, [key]: val } }));
  const setDispatch = (key, val) => setForm(f => ({ ...f, dispatchFrom: { ...f.dispatchFrom, [key]: val } }));
  const setPartB = (key, val) => setForm(f => ({ ...f, partB: { ...f.partB, [key]: val } }));
  const setPacking = (key, val) => setForm(f => ({ ...f, packing: { ...f.packing, [key]: val } }));

  const setItem = (idx, key, val) => setForm(f => {
    const items = [...f.lineItems];
    items[idx] = { ...items[idx], [key]: val };
    return { ...f, lineItems: items };
  });

  const addItem = () => setForm(f => ({ ...f, lineItems: [...f.lineItems, defaultItem()] }));
  const removeItem = (idx) => setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }));

  const prefillItem = (idx, stone) => {
    setItem(idx, 'productName', stone.name);
    setItem(idx, 'description', stone.name);
    setItem(idx, 'rate', stone.pricePerSqFt);
    setItem(idx, 'hsnCode', '68029900');
    setItem(idx, 'unit', 'Sqft');
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validateForm = () => {
    if (!form.invoiceDate) return 'Invoice Date is required.';
    if (!form.buyer.name) return 'Bill To Buyer Name is required.';
    if (!form.sameAsbuyer && !form.consignee.name) return 'Ship To Consignee Name is required.';
    if (form.lineItems.length === 0) return 'At least one line item is required.';
    for (let i = 0; i < form.lineItems.length; i++) {
      const it = form.lineItems[i];
      if (!it.description.trim() && !it.productName.trim()) return `Line Item #${i + 1} Description is required.`;
      if (!it.qty || Number(it.qty) <= 0) return `Line Item #${i + 1} Qty must be greater than 0.`;
      if (!it.rate || Number(it.rate) <= 0) return `Line Item #${i + 1} Rate must be greater than 0.`;
    }
    return null;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    if (e) e.preventDefault();

    const valError = validateForm();
    if (valError) {
      setError(valError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        transportMode: `By ${form.partB.mode}`,
        vehicleNumber: form.partB.vehicleNumber,
        placeOfSupply: form.placeOfSupply || 'BETAMCHERLA',
        consignee: form.sameAsbuyer ? { ...form.buyer } : form.consignee,
        invoiceNumber: form.customInvoice && form.invoiceNumber.trim() ? form.invoiceNumber.trim() : '',
      };
      delete payload.customInvoice;
      delete payload.sameAsbuyer;

      const res = await authFetch('/api/invoices', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      navigate(`/admin/invoices/${data.invoice._id}`);
    } catch (err) {
      setError(err.message || 'Failed to save invoice');
    } finally {
      setSubmitting(false);
    }
  }, [form, authFetch, logout, navigate]);

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Render Preview ────────────────────────────────────────────────────────
  if (showPreview) {
    return (
      <div className="min-h-screen bg-stone-900 font-sans">
        <div className="no-print bg-stone-950 px-6 py-4 flex items-center justify-between border-b border-stone-800 sticky top-0 z-50 shadow-xl">
          <button
            onClick={() => setShowPreview(false)}
            className="bg-stone-800 text-stone-200 hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
          >
            ← Return to Editor
          </button>
          <span className="text-amber-400 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-amber-400" />
            <span>GST Invoice A4 Paper Preview</span>
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="bg-stone-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-stone-700 shadow flex items-center gap-1.5 cursor-pointer"
            >
              🖨 Print Invoice
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-amber-400 text-stone-950 px-5 py-2 rounded-xl text-xs font-black hover:bg-amber-300 shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-stone-950" />
              <span>{submitting ? 'Saving…' : 'Save Invoice'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-6 py-3 text-xs font-bold text-center">
            ⚠️ {error}
          </div>
        )}

        <div className="p-8 max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-10 border border-stone-800">
            <InvoicePrint invoice={previewInvoice} />
          </div>
        </div>
      </div>
    );
  }

  // ── Styling Tokens ────────────────────────────────────────────────────────
  const cardClass = "bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden transition-all duration-200 hover:shadow-md";
  const boxHeaderClass = "bg-stone-950 text-white text-xs font-black px-5 py-3 uppercase tracking-wider flex justify-between items-center border-b border-stone-800";
  const boxBodyClass = "p-5 text-xs space-y-4";
  const labelClass = "text-[11px] font-bold text-stone-600 flex items-center gap-1 uppercase tracking-wider mb-1.5";
  const inputClass = "w-full px-3.5 py-2 border border-stone-300 rounded-xl text-xs focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none bg-white text-stone-900 transition-all font-medium";
  const redDot = <span className="text-rose-500 font-bold ml-0.5">●</span>;
  const greenDot = <span className="text-emerald-500 font-bold ml-0.5">●</span>;

  return (
    <div className="min-h-screen bg-stone-100 font-sans pb-28">
      <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">

        {/* Form Title Banner */}
        <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />
          
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight uppercase flex items-center justify-center gap-2 m-0">
            <FileText className="w-6 h-6 text-amber-500" />
            <span>OFFICIAL GST E-WAYBILL ENTRY FORM</span>
          </h1>

          <div className="text-[11px] text-stone-500 font-bold mt-2 flex flex-wrap items-center justify-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Mandatory for E-Way Bill</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Mandatory for GSTR-1 Filing</span>
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── 1. TRANSACTION DETAILS ────────────────────────────────────────── */}
          <div className={cardClass}>
            <div className={boxHeaderClass}>
              <span className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-amber-400" />
                <span>1. Transaction & Document Details</span>
              </span>
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest bg-stone-900 px-2.5 py-1 rounded-md">
                Section A
              </span>
            </div>

            <div className={boxBodyClass}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Document Type */}
                <div>
                  <label className={labelClass}>Document Type {redDot}</label>
                  <select className={inputClass} value={form.docType} onChange={e => setField('docType', e.target.value)}>
                    <option>Tax Invoice</option>
                    <option>Bill of Supply</option>
                    <option>Delivery Challan</option>
                  </select>
                </div>

                {/* Document No */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className={labelClass.replace('mb-1.5', '')}>Document No</label>
                    <label className="text-[10px] font-bold text-amber-600 flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={form.customInvoice} onChange={e => setField('customInvoice', e.target.checked)} className="accent-amber-500 rounded" />
                      Custom No
                    </label>
                  </div>
                  {form.customInvoice ? (
                    <input className={inputClass} value={form.invoiceNumber} onChange={e => setField('invoiceNumber', e.target.value)} placeholder={`e.g. 16/${fy}`} />
                  ) : (
                    <input className={`${inputClass} bg-stone-100 text-stone-500 font-bold cursor-not-allowed`} value={`Auto — ${fy}`} readOnly />
                  )}
                </div>

                {/* Document Date */}
                <div>
                  <label className={labelClass}>Document Date {redDot}</label>
                  <input type="date" className={inputClass} value={form.invoiceDate} onChange={e => setField('invoiceDate', e.target.value)} required />
                </div>

                {/* Transaction Type */}
                <div>
                  <label className={labelClass}>Transaction Type {redDot}</label>
                  <select className={inputClass} value={form.transactionType} onChange={e => setField('transactionType', e.target.value)}>
                    <option>Regular</option>
                    <option>Bill to - Ship to</option>
                    <option>Bill from - Dispatch from</option>
                    <option>Combination of 2 & 3</option>
                  </select>
                </div>

              </div>
            </div>
          </div>

          {/* ── 2. BILL FROM & DISPATCH FROM ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Bill From */}
            <div className={cardClass}>
              <div className={boxHeaderClass}>
                <span className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-amber-400" />
                  <span>2. Bill From (Supplier)</span>
                </span>
              </div>
              <div className={boxBodyClass}>
                <div>
                  <label className={labelClass}>Company Name</label>
                  <input className={`${inputClass} bg-stone-100 font-bold text-stone-900`} value={form.seller.name} readOnly />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>GSTIN {redDot}</label>
                    <input className={`${inputClass} bg-stone-100 font-bold text-stone-900`} value={form.seller.gstin} readOnly />
                  </div>
                  <div>
                    <label className={labelClass}>State & Code {redDot}</label>
                    <input className={`${inputClass} bg-stone-100 font-bold text-stone-900`} value={`${form.seller.state} (${form.seller.stateCode})`} readOnly />
                  </div>
                </div>
              </div>
            </div>

            {/* Dispatch From */}
            <div className={cardClass}>
              <div className={boxHeaderClass}>
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <span>3. Dispatch From</span>
                </span>
              </div>
              <div className={boxBodyClass}>
                <div>
                  <label className={labelClass}>Dispatch Address</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input className={inputClass} value={form.dispatchFrom.address1} onChange={e => setDispatch('address1', e.target.value)} placeholder="Address line 1" />
                    <input className={inputClass} value={form.dispatchFrom.address2} onChange={e => setDispatch('address2', e.target.value)} placeholder="Address line 2" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Dispatch Place</label>
                    <input className={inputClass} value={form.dispatchFrom.place} onChange={e => setDispatch('place', e.target.value)} placeholder="Kurnool" />
                  </div>
                  <div>
                    <label className={labelClass}>Pincode {redDot}</label>
                    <input className={inputClass} value={form.dispatchFrom.pincode} onChange={e => setDispatch('pincode', e.target.value)} placeholder="518599" />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ── 3. BILL TO & SHIP TO ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Bill To */}
            <div className={cardClass}>
              <div className={boxHeaderClass}>
                <span className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-amber-400" />
                  <span>4. Bill To (Buyer)</span>
                </span>
              </div>
              <div className={boxBodyClass}>
                <div>
                  <label className={labelClass}>Company / Buyer Name {redDot}</label>
                  <input className={inputClass} value={form.buyer.name} onChange={e => setBuyer('name', e.target.value)} placeholder="e.g. GLOBAL IMPEX PRIVATE LIMITED" required />
                </div>
                <div>
                  <label className={labelClass}>GSTIN {redDot}</label>
                  <input className={inputClass} value={form.buyer.gstin} onChange={e => setBuyer('gstin', e.target.value)} placeholder="e.g. 23AADCG1954B1Z6" />
                </div>
                
                {/* State dropdown */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>State {redDot}</label>
                    <select
                      className={inputClass}
                      value={form.buyer.state}
                      onChange={e => setBuyerState(e.target.value)}
                    >
                      {INDIAN_GST_STATES.map(s => (
                        <option key={s.code} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>State Code {redDot}</label>
                    <input className={`${inputClass} bg-stone-100 font-bold`} value={form.buyer.stateCode} readOnly />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Address</label>
                  <input className={inputClass} value={form.buyer.address} onChange={e => setBuyer('address', e.target.value)} placeholder="Full postal address" />
                </div>
              </div>
            </div>

            {/* Ship To */}
            <div className={cardClass}>
              <div className={boxHeaderClass}>
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <span>5. Ship To (Consignee)</span>
                </span>
                <label className="text-[10px] font-bold normal-case flex items-center gap-1.5 cursor-pointer bg-stone-800 px-2.5 py-1 rounded-lg border border-stone-700 hover:bg-stone-700 transition">
                  <input type="checkbox" checked={form.sameAsbuyer} onChange={e => setField('sameAsbuyer', e.target.checked)} className="accent-amber-400 rounded" />
                  <span>Same as Bill To</span>
                </label>
              </div>
              
              <div className={boxBodyClass}>
                {!form.sameAsbuyer ? (
                  <>
                    <div>
                      <label className={labelClass}>Consignee Name</label>
                      <input className={inputClass} value={form.consignee.name} onChange={e => setConsignee('name', e.target.value)} placeholder="e.g. ICBC, MANALI" />
                    </div>
                    <div>
                      <label className={labelClass}>Address</label>
                      <input className={inputClass} value={form.consignee.address} onChange={e => setConsignee('address', e.target.value)} placeholder="Consignee Address" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={labelClass}>Place</label>
                        <input className={inputClass} value={form.consignee.place} onChange={e => setConsignee('place', e.target.value)} placeholder="Place" />
                      </div>
                      <div>
                        <label className={labelClass}>State</label>
                        <select className={inputClass} value={form.consignee.state} onChange={e => setConsigneeState(e.target.value)}>
                          {INDIAN_GST_STATES.map(s => (
                            <option key={s.code} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Code</label>
                        <input className={`${inputClass} bg-stone-100 font-bold`} value={form.consignee.stateCode} readOnly />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-10 space-y-2">
                    <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
                    <div className="text-xs font-bold text-stone-700">Consignee mirrors Buyer details</div>
                    <p className="text-[11px] text-stone-400 max-w-xs mx-auto">
                      All shipping address fields will be automatically copied from the Buyer profile above.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── 4. ITEM DETAILS ──────────────────────────────────────────────── */}
          <div className={cardClass}>
            <div className={boxHeaderClass}>
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>6. Line Items & Products</span>
              </span>
            </div>

            <div className="p-5 space-y-5">
              <div className="overflow-x-auto rounded-xl border border-stone-200">
                <table className="w-full text-xs text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="bg-stone-900 text-white font-bold border-b border-stone-800">
                      <th className="p-3 min-w-[220px]">Product Name / Description</th>
                      <th className="p-3 w-28">HSN {redDot}</th>
                      <th className="p-3 w-24">Quantity</th>
                      <th className="p-3 w-24">Unit</th>
                      <th className="p-3 w-32 text-right">Taxable Rate (₹) {redDot}</th>
                      <th className="p-3 w-36 text-right">Amount (₹)</th>
                      <th className="p-3 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {form.lineItems.map((item, idx) => {
                      const amt = Math.round(Number(item.qty || 0) * Number(item.rate || 0) * 100) / 100;
                      return (
                        <tr key={idx} className="hover:bg-stone-50/80 transition">
                          <td className="p-2.5">
                            <input className={`${inputClass} mb-1.5`} value={item.description} onChange={e => setItem(idx, 'description', e.target.value)} placeholder="Description of Goods" required />
                            <select className="w-full text-[10px] p-1.5 border border-stone-300 rounded-lg bg-amber-50/50 text-stone-800 font-semibold cursor-pointer" value="" onChange={e => {
                              if (!e.target.value) return;
                              const s = PREMIUM_STONES.find(st => st.id === e.target.value);
                              if (s) prefillItem(idx, s);
                            }}>
                              <option value="">⚡ Quick-fill stone from catalogue...</option>
                              {PREMIUM_STONES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          </td>
                          <td className="p-2.5 align-top">
                            <input className={inputClass} value={item.hsnCode} onChange={e => setItem(idx, 'hsnCode', e.target.value)} placeholder="68029900" />
                          </td>
                          <td className="p-2.5 align-top">
                            <input type="number" step="0.01" className={inputClass} value={item.qty} onChange={e => setItem(idx, 'qty', e.target.value)} placeholder="Qty" required />
                          </td>
                          <td className="p-2.5 align-top">
                            <input className={inputClass} value={item.unit} onChange={e => setItem(idx, 'unit', e.target.value)} />
                          </td>
                          <td className="p-2.5 align-top">
                            <input type="number" step="0.01" className={inputClass} value={item.rate} onChange={e => setItem(idx, 'rate', e.target.value)} placeholder="Rate" required />
                          </td>
                          <td className="p-2.5 align-top text-right font-black text-stone-900 text-sm pt-4 font-mono">
                            ₹{fmt(amt)}
                          </td>
                          <td className="p-2.5 align-top text-center pt-3">
                            {form.lineItems.length > 1 && (
                              <button type="button" onClick={() => removeItem(idx)} className="text-stone-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition cursor-pointer" title="Delete row">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-between items-center gap-4">
                <button type="button" onClick={addItem} className="bg-stone-900 hover:bg-stone-800 text-amber-400 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95">
                  <Plus className="w-4 h-4" />
                  <span>Add Line Item</span>
                </button>

                {/* Packing Info */}
                <div className="flex items-center gap-4 text-xs bg-stone-100 px-4 py-2.5 rounded-xl border border-stone-200">
                  <span className="font-bold text-stone-700">Total Crates:</span>
                  <input type="number" className={`${inputClass} w-20 text-center`} value={form.packing.totalCrates} onChange={e => setPacking('totalCrates', e.target.value)} placeholder="1" />
                  <span className="font-bold text-stone-700">Pcs / Crate:</span>
                  <input type="number" className={`${inputClass} w-24 text-center`} value={form.packing.piecesPerCrate} onChange={e => setPacking('piecesPerCrate', e.target.value)} placeholder="100" />
                </div>
              </div>

              {/* Live Totals Card */}
              <div className="bg-stone-950 text-white p-5 rounded-2xl shadow-xl border border-stone-800">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Total Taxable Value</div>
                    <div className="text-base font-black text-white mt-1 font-mono">₹{fmt(taxableValue)}</div>
                  </div>

                  <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                      {taxType === 'IGST' ? `IGST (${form.taxRate}%)` : `CGST+SGST (${form.taxRate}%)`}
                    </div>
                    <div className="text-base font-black text-white mt-1 font-mono">₹{fmt(taxAmount)}</div>
                  </div>

                  <div className="bg-stone-900 p-3 rounded-xl border border-stone-800">
                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">GST Rate %</div>
                    <input type="number" className="w-20 mx-auto text-center mt-1 bg-stone-950 text-amber-400 font-black rounded-lg border border-stone-700 text-xs py-1 outline-none focus:border-amber-400" value={form.taxRate} onChange={e => setField('taxRate', Number(e.target.value))} />
                  </div>

                  <div className="bg-amber-400/10 p-3 rounded-xl border border-amber-400/30">
                    <div className="text-[10px] text-amber-400 font-black uppercase tracking-wider">Total Invoice Amount</div>
                    <div className="text-lg font-black text-amber-400 mt-0.5 font-mono">₹{fmt(grandTotal)}</div>
                  </div>
                </div>

                {grandTotal > 0 && (
                  <div className="mt-4 text-[11px] text-stone-300 font-bold uppercase text-center border-t border-stone-800 pt-3 flex items-center justify-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{amountInWords(grandTotal)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 5. PART-B TRANSPORT DETAILS ──────────────────────────────────── */}
          <div className={cardClass}>
            <div className={boxHeaderClass}>
              <span className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>7. PART-B (Dispatch & Transport Details)</span>
              </span>
            </div>
            <div className={boxBodyClass}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Mode */}
                <div className="flex items-center gap-3">
                  <span className={labelClass}>Mode</span>
                  {['Road', 'Rail', 'Air', 'Ship'].map(m => (
                    <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-stone-800">
                      <input type="radio" name="mode" value={m} checked={form.partB.mode === m} onChange={e => setPartB('mode', e.target.value)} className="accent-amber-500" />
                      <span>{m}</span>
                    </label>
                  ))}
                </div>

                {/* Vehicle Type */}
                <div className="flex items-center gap-3">
                  <span className={labelClass}>Vehicle Type</span>
                  {['Regular', 'Over Dimensional Cargo'].map(vt => (
                    <label key={vt} className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-stone-800">
                      <input type="radio" name="vehicleType" value={vt} checked={form.partB.vehicleType === vt} onChange={e => setPartB('vehicleType', e.target.value)} className="accent-amber-500" />
                      <span>{vt}</span>
                    </label>
                  ))}
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-stone-100">
                <div>
                  <label className={labelClass}>Vehicle No.</label>
                  <input className={inputClass} value={form.partB.vehicleNumber} onChange={e => setPartB('vehicleNumber', e.target.value)} placeholder="e.g. AP39WC1114" />
                </div>
                <div>
                  <label className={labelClass}>Transporter Doc Date</label>
                  <input type="date" className={inputClass} value={form.partB.docNoDate} onChange={e => setPartB('docNoDate', e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-600 p-4 rounded-2xl text-xs font-bold text-center">
              ⚠️ {error}
            </div>
          )}

          {/* ── BOTTOM ACTION BAR ────────────────────────────────────────────── */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-stone-950/90 backdrop-blur-xl p-3 px-6 rounded-2xl shadow-2xl border border-stone-800 z-40 flex items-center gap-4 md:left-[calc(50%+8rem)]">
            <button
              type="button"
              onClick={() => {
                const valErr = validateForm();
                if (valErr) { setError(valErr); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                else { setError(''); setShowPreview(true); }
              }}
              className="bg-stone-800 hover:bg-stone-700 text-stone-200 px-5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-amber-400" />
              <span>Preview A4</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-stone-950 px-7 py-2.5 rounded-xl font-black text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-4 h-4 text-stone-950" />
              <span>{submitting ? 'Saving…' : 'Submit Invoice'}</span>
            </button>

            <Link
              to="/admin/invoices"
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 px-4 py-2.5 rounded-xl font-bold text-xs no-underline inline-block text-center transition active:scale-95"
            >
              Exit
            </Link>
          </div>

        </form>
      </div>
    </div>
  );
}
