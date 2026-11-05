import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  FileCheck2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import {
  AdminFeedback,
  AdminLoadingState,
  AdminPage,
  AdminPageHeader,
} from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import { getAllStones } from '../../lib/catalog';
import {
  basisPointsInputValue,
  COMMERCIAL_UNITS,
  customerSnapshotName,
  dateInputValue,
  formatCommercialMoney,
  minorInputValue,
  milliInputValue,
  parseCommercialResponse,
  quotationCustomer,
} from '../../lib/commercial';
import { calculateQuotationTotals } from '../../lib/commercialMath';
import { PROCESSING_OPERATIONS } from '../../lib/processing';

const INPUT_CLASS = 'mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

function key() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function emptyLine() {
  return {
    _key: key(),
    stoneSlug: '',
    finish: '',
    thicknessMm: '',
    lengthMm: '',
    widthMm: '',
    quantity: '',
    unit: 'SQ_FT',
    areaSqFt: '',
    unitRate: '',
    discountPercent: '',
    taxRatePercent: '',
    processingRequirements: [],
    notes: '',
  };
}

function storedLineToForm(item) {
  const unit = item.unit || 'SQ_FT';
  return {
    ...emptyLine(),
    stoneSlug: item.stoneSnapshot?.slug || item.stoneSlug || item.stone?.slug || '',
    finish: item.finish || '',
    thicknessMm: item.thicknessMm ?? '',
    lengthMm: item.dimensions?.lengthMm ?? '',
    widthMm: item.dimensions?.widthMm ?? '',
    quantity: item.quantity ?? milliInputValue(item.quantityMilli),
    unit,
    areaSqFt: unit === 'SQ_FT' ? '' : item.areaSqFt ?? '',
    unitRate: item.unitRate ?? minorInputValue(item.unitRateMinor),
    discountPercent: item.discountPercent ?? basisPointsInputValue(item.discountBasisPoints),
    taxRatePercent: item.taxRatePercent ?? basisPointsInputValue(item.taxRateBasisPoints),
    processingRequirements: Array.isArray(item.processingRequirements)
      ? item.processingRequirements.map((entry) => typeof entry === 'string' ? entry : entry.operation).filter(Boolean)
      : [],
    notes: item.notes || '',
  };
}

function Field({ label, required, hint, children }) {
  return <label className="block text-xs font-bold text-stone-700">{label}{required && <span className="text-rose-600"> *</span>}{children}{hint && <span className="mt-1 block text-[11px] font-normal leading-4 text-stone-500">{hint}</span>}</label>;
}

function Section({ step, title, description, children }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-stone-100 px-4 py-4 sm:px-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-950 text-xs font-black text-amber-400">{step}</span><div><h2 className="text-sm font-black text-stone-950">{title}</h2>{description && <p className="mt-0.5 text-xs leading-5 text-stone-500">{description}</p>}</div></div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function cleanOptional(value) {
  const text = String(value ?? '').trim();
  return text || undefined;
}

export default function QuotationFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [searchParams] = useSearchParams();
  const leadIdFromRoute = searchParams.get('leadId') || '';
  const customerIdFromRoute = searchParams.get('customerId') || '';
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const stones = useMemo(() => getAllStones().slice().sort((left, right) => left.name.localeCompare(right.name)), []);
  const [customers, setCustomers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState(customerIdFromRoute);
  const [sourceLeadId, setSourceLeadId] = useState(leadIdFromRoute);
  const [contextLead, setContextLead] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [issueDate, setIssueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [currency, setCurrency] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [lineItems, setLineItems] = useState([emptyLine()]);
  const [loading, setLoading] = useState(editing || Boolean(leadIdFromRoute || customerIdFromRoute));
  const [choicesLoading, setChoicesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleUnauthorized = useCallback(() => {
    logout();
    navigate('/admin/login', { replace: true });
  }, [logout, navigate]);

  const loadCustomers = useCallback(async (search = '') => {
    const params = new URLSearchParams({ page: '1', limit: '50' });
    if (search.trim()) params.set('search', search.trim());
    const response = await authFetch(`/api/admin/customers?${params.toString()}`);
    if (response.status === 401) { handleUnauthorized(); return []; }
    const data = await parseCommercialResponse(response, 'Unable to load customers.');
    const records = Array.isArray(data.customers) ? data.customers : [];
    setCustomers(records);
    return records;
  }, [authFetch, handleUnauthorized]);

  useEffect(() => {
    let active = true;
    (async () => {
      setChoicesLoading(true);
      try {
        const [customerRecords, readyResponse] = await Promise.all([
          loadCustomers(),
          authFetch('/api/admin/leads?stage=READY_FOR_QUOTATION&page=1&limit=50'),
        ]);
        if (readyResponse.status === 401) { handleUnauthorized(); return; }
        const ready = await parseCommercialResponse(readyResponse, 'Unable to load eligible leads.');
        if (!active) return;
        const leadRecords = ready.leads || [];
        setLeads([...new Map(leadRecords.map((lead) => [String(lead._id), lead])).values()]);
        if (customerIdFromRoute && !customerRecords.some((customer) => String(customer._id) === customerIdFromRoute)) {
          const response = await authFetch(`/api/admin/customers/${encodeURIComponent(customerIdFromRoute)}`);
          if (response.ok) {
            const data = await response.json();
            if (active && data.customer) setCustomers((current) => [data.customer, ...current]);
          }
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'Unable to load quotation context.');
      } finally {
        if (active) setChoicesLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authFetch, customerIdFromRoute, handleUnauthorized, loadCustomers]);

  useEffect(() => {
    if (!leadIdFromRoute || editing) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const response = await authFetch(`/api/admin/leads/${encodeURIComponent(leadIdFromRoute)}`);
        if (response.status === 401) { handleUnauthorized(); return; }
        const data = await parseCommercialResponse(response, 'Unable to load the source lead.');
        if (!active) return;
        const lead = data.lead;
        if (lead?.stage !== 'READY_FOR_QUOTATION') {
          setSourceLeadId('');
          setContextLead(null);
          setError('Only a lead in Ready for quotation can be used as quotation context.');
          return;
        }
        setContextLead(lead);
        const linkedCustomer = typeof lead?.customer === 'object' ? lead.customer : null;
        const linkedCustomerId = linkedCustomer?._id || lead?.customer;
        if (linkedCustomerId) {
          setCustomerId(String(linkedCustomerId));
          if (linkedCustomer) setCustomers((current) => current.some((customer) => String(customer._id) === String(linkedCustomerId)) ? current : [linkedCustomer, ...current]);
        } else {
          setError('This lead must be linked to a real customer before a quotation can be created. Convert the eligible lead from CRM first.');
        }
        const selections = Array.isArray(lead?.materialSelections) && lead.materialSelections.length
          ? lead.materialSelections
          : lead?.materialContext?.stoneSlug ? [lead.materialContext] : [];
        if (selections.length) {
          setLineItems(selections.map((selection) => ({
            ...emptyLine(),
            stoneSlug: selection.stoneSlug || '',
            finish: selection.finish || '',
            thicknessMm: String(selection.thickness || '').replace(/[^0-9.]/g, ''),
            quantity: Number(selection.quantity) > 0
              ? String(Number(selection.quantity))
              : Number(lead.estimatorContext?.requiredAreaSqFt) > 0
                ? String(Number(lead.estimatorContext.requiredAreaSqFt))
                : '',
            areaSqFt: '',
          })));
        }
      } catch (requestError) {
        if (active) setError(requestError.message || 'Unable to load the source lead.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authFetch, editing, handleUnauthorized, leadIdFromRoute]);

  useEffect(() => {
    if (!editing) {
      if (!leadIdFromRoute) setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await authFetch(`/api/admin/quotations/${encodeURIComponent(id)}`);
        if (response.status === 401) { handleUnauthorized(); return; }
        const data = await parseCommercialResponse(response, 'Unable to load this quotation.');
        if (!active) return;
        const record = data.quotation;
        setQuotation(record);
        const customer = quotationCustomer(record);
        setCustomerId(String(record.customerId?._id || record.customerId || customer._id || ''));
        setSourceLeadId(String(record.sourceLeadId?._id || record.sourceLeadId || ''));
        setIssueDate(dateInputValue(record.issueDate));
        setValidUntil(dateInputValue(record.validUntil));
        setCurrency(record.currency || record.financialSnapshot?.currency || '');
        setPaymentTerms(record.paymentTerms || '');
        setDeliveryTerms(record.deliveryTerms || '');
        setNotes(record.notes || '');
        setInternalNotes(record.internalNotes || '');
        setLineItems(record.lineItems?.length ? record.lineItems.map(storedLineToForm) : [emptyLine()]);
        if (customer?._id) setCustomers((current) => current.some((item) => String(item._id) === String(customer._id)) ? current : [customer, ...current]);
      } catch (requestError) {
        if (active) setError(requestError.message || 'Unable to load this quotation.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authFetch, editing, handleUnauthorized, id, leadIdFromRoute]);

  const preview = useMemo(() => {
    try {
      return calculateQuotationTotals(lineItems.map((item) => ({
        quantity: item.quantity,
        unitRate: item.unitRate,
        discountPercent: item.discountPercent || 0,
        taxRatePercent: item.taxRatePercent || 0,
      })));
    } catch {
      return null;
    }
  }, [lineItems]);

  const selectedCustomer = customers.find((customer) => String(customer._id) === String(customerId));

  function updateLine(index, field, value) {
    setLineItems((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line));
  }

  function updateLineUnit(index, unit) {
    setLineItems((current) => current.map((line, lineIndex) => (
      lineIndex === index ? { ...line, unit, areaSqFt: unit === 'SQ_FT' ? '' : line.areaSqFt } : line
    )));
  }

  function toggleOperation(index, operation) {
    setLineItems((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      const selected = line.processingRequirements.includes(operation);
      return { ...line, processingRequirements: selected ? line.processingRequirements.filter((value) => value !== operation) : [...line.processingRequirements, operation] };
    }));
  }

  function validate() {
    if (!customerId) return 'Select a real customer.';
    if (!currency.trim()) return 'Currency is required.';
    if (!lineItems.length) return 'At least one line item is required.';
    for (const [index, item] of lineItems.entries()) {
      if (!item.stoneSlug) return `Line ${index + 1}: select a canonical stone.`;
      if (!item.quantity || !item.unitRate) return `Line ${index + 1}: billable quantity and unit rate are required.`;
      if (['PIECE', 'SLAB'].includes(item.unit) && (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1)) {
        return `Line ${index + 1}: ${item.unit === 'SLAB' ? 'slab' : 'piece'} quantity must be a positive whole number.`;
      }
      if ((item.lengthMm && !item.widthMm) || (!item.lengthMm && item.widthMm)) return `Line ${index + 1}: enter both length and width, or leave both blank.`;
    }
    if (!preview) return 'Review numeric precision in the commercial line items.';
    return '';
  }

  async function submit(event) {
    event.preventDefault();
    const message = validate();
    if (message) { setError(message); return; }
    setSaving(true);
    setError('');
    const payload = {
      customerId,
      sourceLeadId: sourceLeadId || undefined,
      issueDate: issueDate || undefined,
      validUntil: validUntil || undefined,
      currency: currency.trim().toUpperCase(),
      lineItems: lineItems.map((item) => {
        const stone = stones.find((entry) => entry.slug === item.stoneSlug);
        return ({
        stoneId: stone?.id,
        stoneSlug: item.stoneSlug,
        finish: cleanOptional(item.finish),
        thicknessMm: cleanOptional(item.thicknessMm),
        dimensions: item.lengthMm && item.widthMm ? { lengthMm: item.lengthMm, widthMm: item.widthMm } : undefined,
        quantity: item.quantity,
        unit: item.unit,
        areaSqFt: item.unit === 'SQ_FT' ? undefined : cleanOptional(item.areaSqFt),
        unitRate: item.unitRate,
        discountPercent: item.discountPercent || '0',
        taxRatePercent: item.taxRatePercent || '0',
        processingRequirements: item.processingRequirements.map((operation) => ({ operation })),
        notes: cleanOptional(item.notes),
      }); }),
      paymentTerms: cleanOptional(paymentTerms),
      deliveryTerms: cleanOptional(deliveryTerms),
      notes: cleanOptional(notes),
      internalNotes: cleanOptional(internalNotes),
    };
    try {
      const response = await authFetch(editing ? `/api/admin/quotations/${encodeURIComponent(id)}` : '/api/admin/quotations', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      const data = await parseCommercialResponse(response, `Unable to ${editing ? 'update' : 'create'} this quotation.`);
      const saved = data.quotation;
      navigate(`/admin/quotations/${saved?._id || id}`, { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Unable to save this quotation.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AdminPage size="standard"><AdminLoadingState label="Loading quotation" rows={6} /></AdminPage>;
  if (editing && quotation && quotation.status !== 'DRAFT') {
    return <AdminPage size="standard" className="space-y-4"><Link to={`/admin/quotations/${id}`} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600"><ArrowLeft className="h-4 w-4" /> Quotation</Link><AdminFeedback title="This revision is read-only">Only draft quotations can be edited. Create a controlled revision from the quotation detail page.</AdminFeedback></AdminPage>;
  }

  return (
    <AdminPage size="standard" className="space-y-6">
      <Helmet><title>{editing ? `Edit ${quotation?.quotationNumber || 'Quotation'}` : 'New Quotation'} | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <Link to={editing ? `/admin/quotations/${id}` : '/admin/quotations'} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600 no-underline hover:text-stone-950"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> {editing ? quotation?.quotationNumber : 'Quotations'}</Link>
      <AdminPageHeader eyebrow="Commercial preparation" title={editing ? 'Edit quotation draft' : 'Create quotation draft'} description="Use verified customer and catalog records. Prices, taxes, discounts, validity, and commercial terms are never inferred." />
      {error && <AdminFeedback title="Quotation could not be saved">{error}</AdminFeedback>}

      <form onSubmit={submit} className="space-y-6">
        <Section step="1" title="Customer and source lead" description="A quotation belongs to a real customer. Lead requirements are context only until reviewed into commercial lines.">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1"><span className="sr-only">Search customers</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" /><input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} maxLength={120} placeholder="Search customer name, company, phone or number" className="min-h-11 w-full rounded-lg border border-stone-300 py-2.5 pl-9 pr-3 text-sm" /></label>
            <button type="button" onClick={() => loadCustomers(customerSearch).catch((requestError) => setError(requestError.message))} disabled={choicesLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 text-xs font-black text-stone-700">Search</button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" required><select required value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={INPUT_CLASS}><option value="">Select customer</option>{customers.map((customer) => <option key={customer._id} value={customer._id}>{customer.customerNumber} · {customerSnapshotName(customer)}</option>)}</select></Field>
            <Field label="Source lead" hint="Optional traceability to the originating requirement."><select value={sourceLeadId} onChange={(event) => { const value = event.target.value; setSourceLeadId(value); const lead = leads.find((item) => String(item._id) === value); setContextLead(lead || null); const linked = lead && (lead.customer?._id || lead.customer); if (linked) setCustomerId(String(linked)); }} className={INPUT_CLASS}><option value="">No source lead</option>{leads.map((lead) => <option key={lead._id} value={lead._id}>{lead.leadNumber} · {lead.contact?.company || lead.contact?.name || 'Unnamed lead'}</option>)}</select></Field>
          </div>
          {selectedCustomer && <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs leading-5 text-emerald-900"><p className="font-black">{selectedCustomer.customerNumber} · {customerSnapshotName(selectedCustomer)}</p><p>{[selectedCustomer.name, selectedCustomer.email, selectedCustomer.phone].filter(Boolean).join(' · ')}</p></div>}
          {contextLead && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900"><p className="font-black">Lead-provided context — review before use</p><p>{[contextLead.materialContext?.stoneName, contextLead.materialContext?.finish, contextLead.materialContext?.thickness, contextLead.project?.application, contextLead.estimatorContext?.requiredAreaSqFt && `${contextLead.estimatorContext.requiredAreaSqFt} sq.ft`].filter(Boolean).join(' · ') || 'No structured material context recorded.'}</p></div>}
        </Section>

        <Section step="2" title="Quotation identity" description="Issue and validity dates remain blank unless deliberately recorded. Currency is required for every commercial amount.">
          <div className="grid gap-4 sm:grid-cols-3"><Field label="Issue date"><input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={INPUT_CLASS} /></Field><Field label="Valid until"><input type="date" value={validUntil} min={issueDate || undefined} onChange={(event) => setValidUntil(event.target.value)} className={INPUT_CLASS} /></Field><Field label="Currency" required hint="Three-letter ISO code."><input required minLength={3} maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="INR" className={`${INPUT_CLASS} uppercase`} /></Field></div>
        </Section>

        <Section step="3" title="Commercial line items" description="Choose canonical stones and enter deliberate billable quantities and rates. The server recalculates every stored amount.">
          <div className="space-y-4">{lineItems.map((item, index) => {
            const computed = preview?.lineItems?.[index];
            const wholeQuantity = ['PIECE', 'SLAB'].includes(item.unit);
            return <fieldset key={item._key} className="relative rounded-xl border border-stone-200 bg-stone-50 p-4"><legend className="px-1 text-xs font-black uppercase tracking-wide text-stone-700">Line item {index + 1}</legend>{lineItems.length > 1 && <button type="button" onClick={() => setLineItems((current) => current.filter((_, lineIndex) => lineIndex !== index))} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-lg border border-rose-200 bg-white text-rose-700" aria-label={`Remove line item ${index + 1}`}><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}<div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Canonical stone" required><select required value={item.stoneSlug} onChange={(event) => updateLine(index, 'stoneSlug', event.target.value)} className={INPUT_CLASS}><option value="">Select stone</option>{stones.map((stone) => <option key={stone.slug} value={stone.slug}>{stone.name}</option>)}</select></Field><Field label="Finish"><input maxLength={120} value={item.finish} onChange={(event) => updateLine(index, 'finish', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Thickness (mm)"><input type="number" min="0.01" step="0.01" value={item.thicknessMm} onChange={(event) => updateLine(index, 'thicknessMm', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Unit" required><select required value={item.unit} onChange={(event) => updateLineUnit(index, event.target.value)} className={INPUT_CLASS}>{COMMERCIAL_UNITS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}</select></Field><Field label="Billable quantity" required><input required type="number" min={wholeQuantity ? '1' : '0.001'} step={wholeQuantity ? '1' : '0.001'} value={item.quantity} onChange={(event) => updateLine(index, 'quantity', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Area (sq.ft)" hint={item.unit === 'SQ_FT' ? 'Derived from billable quantity.' : 'Record separately when physically relevant.'}><input type="number" min="0" step="0.001" disabled={item.unit === 'SQ_FT'} value={item.unit === 'SQ_FT' ? item.quantity : item.areaSqFt} onChange={(event) => updateLine(index, 'areaSqFt', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Unit rate" required><input required type="number" min="0" step="0.01" value={item.unitRate} onChange={(event) => updateLine(index, 'unitRate', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Line discount (%)"><input type="number" min="0" max="100" step="0.01" value={item.discountPercent} onChange={(event) => updateLine(index, 'discountPercent', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Tax rate (%)" hint="Blank means zero; no tax rate is assumed."><input type="number" min="0" max="100" step="0.01" value={item.taxRatePercent} onChange={(event) => updateLine(index, 'taxRatePercent', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Length (mm)" hint="Length and width must be supplied together."><input type="number" min="0.01" step="0.01" value={item.lengthMm} onChange={(event) => updateLine(index, 'lengthMm', event.target.value)} className={INPUT_CLASS} /></Field><Field label="Width (mm)"><input type="number" min="0.01" step="0.01" value={item.widthMm} onChange={(event) => updateLine(index, 'widthMm', event.target.value)} className={INPUT_CLASS} /></Field><div className="sm:col-span-2 xl:col-span-4"><Field label="Line notes"><textarea rows={2} maxLength={1000} value={item.notes} onChange={(event) => updateLine(index, 'notes', event.target.value)} className={`${INPUT_CLASS} resize-y py-2.5`} /></Field></div></div><fieldset className="mt-4"><legend className="text-[10px] font-black uppercase tracking-wide text-stone-500">Verified processing requirements</legend><div className="mt-2 flex flex-wrap gap-2">{PROCESSING_OPERATIONS.map((operation) => { const checked = item.processingRequirements.includes(operation.value); return <label key={operation.value} className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-bold ${checked ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-stone-200 bg-white text-stone-600'}`}><input type="checkbox" checked={checked} onChange={() => toggleOperation(index, operation.value)} /><span>{operation.label}</span></label>; })}</div></fieldset>{computed && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-stone-950 px-4 py-3 text-xs text-stone-300"><span>Deterministic preview; server recalculates on save.</span><strong className="text-sm text-amber-400">{formatCommercialMoney(computed.lineTotalMinor, currency)}</strong></div>}</fieldset>;
          })}</div>
          <button type="button" disabled={lineItems.length >= 50} onClick={() => setLineItems((current) => [...current, emptyLine()])} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-700 disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true" /> Add line item</button>
        </Section>

        <Section step="4" title="Terms and notes" description="Customer-facing text is printed. Internal notes remain protected and are never included in the quotation document.">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Payment terms"><textarea rows={4} maxLength={3000} value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} className={`${INPUT_CLASS} resize-y py-2.5`} /></Field><Field label="Delivery terms"><textarea rows={4} maxLength={3000} value={deliveryTerms} onChange={(event) => setDeliveryTerms(event.target.value)} className={`${INPUT_CLASS} resize-y py-2.5`} /></Field><Field label="Customer-facing notes"><textarea rows={4} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${INPUT_CLASS} resize-y py-2.5`} /></Field><Field label="Internal notes"><textarea rows={4} maxLength={3000} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} className={`${INPUT_CLASS} resize-y py-2.5`} /></Field></div>
        </Section>

        <Section step="5" title="Review and save draft" description="Saving does not issue or send this quotation. Lifecycle actions are performed separately from the saved detail page.">
          {preview ? <dl className="ml-auto grid max-w-md gap-2 rounded-xl bg-stone-950 p-4 text-sm text-stone-300"><div className="flex justify-between gap-4"><dt>Subtotal</dt><dd className="font-bold text-white">{formatCommercialMoney(preview.totals.subtotalMinor, currency)}</dd></div><div className="flex justify-between gap-4"><dt>Discount</dt><dd className="font-bold text-white">{formatCommercialMoney(preview.totals.discountMinor, currency)}</dd></div><div className="flex justify-between gap-4"><dt>Tax</dt><dd className="font-bold text-white">{formatCommercialMoney(preview.totals.taxMinor, currency)}</dd></div><div className="mt-1 flex justify-between gap-4 border-t border-stone-700 pt-3 text-base"><dt className="font-black text-white">Grand total</dt><dd className="font-black text-amber-400">{formatCommercialMoney(preview.totals.grandTotalMinor, currency)}</dd></div></dl> : <p className="rounded-lg bg-stone-50 p-4 text-sm text-stone-600">Complete valid quantity and rate inputs to review deterministic totals.</p>}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Link to={editing ? `/admin/quotations/${id}` : '/admin/quotations'} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-stone-300 px-5 text-xs font-black text-stone-700 no-underline">Cancel</Link><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white disabled:opacity-50">{saving ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : editing ? <Save className="h-4 w-4" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}{saving ? 'Saving…' : editing ? 'Save draft changes' : 'Create quotation draft'}</button></div>
        </Section>
      </form>
    </AdminPage>
  );
}
