import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  Info,
  MapPin,
  RefreshCw,
  Ruler,
  Save,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import { getAllStones } from '../../lib/catalog';
import {
  batchAreaOnHand,
  batchAreaReceived,
  batchCost,
  batchInventoryMode,
  batchQuantityOnHand,
  batchQuantityReceived,
  batchSelling,
  batchStone,
  compactObject,
  formatInventoryLocation,
  formatInventoryNumber,
  INVENTORY_MODES,
  INVENTORY_STATUSES,
  labelInventoryMode,
  optionalNumber,
  parseInventoryResponse,
} from '../../lib/inventory';

const EMPTY_FORM = Object.freeze({
  stoneSlug: '',
  receivedDate: '',
  inventoryMode: '',
  externalLotNumber: '',
  finish: '',
  thicknessMm: '',
  lengthMm: '',
  widthMm: '',
  receivedCount: '',
  receivedSqFt: '',
  quarry: '',
  origin: '',
  supplier: '',
  warehouse: '',
  zone: '',
  rack: '',
  grade: '',
  shade: '',
  costPerSqFt: '',
  costCurrency: '',
  pricePerSqFt: '',
  sellingCurrency: '',
  notes: '',
  status: '',
});

function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function batchToForm(batch) {
  const stone = batchStone(batch);
  const cost = batchCost(batch);
  const selling = batchSelling(batch);
  return {
    ...EMPTY_FORM,
    stoneSlug: stone.slug || '',
    receivedDate: dateInputValue(batch.receivedDate),
    inventoryMode: batchInventoryMode(batch),
    externalLotNumber: batch.externalLotNumber || '',
    finish: batch.finish || '',
    thicknessMm: batch.thicknessMm ?? '',
    lengthMm: batch.nominalDimensions?.lengthMm ?? '',
    widthMm: batch.nominalDimensions?.widthMm ?? '',
    receivedCount: batchQuantityReceived(batch) ?? '',
    receivedSqFt: batchAreaReceived(batch) ?? '',
    quarry: batch.source?.quarry || '',
    origin: batch.source?.origin || '',
    supplier: batch.source?.supplier || '',
    warehouse: batch.location?.warehouse || '',
    zone: batch.location?.zone || '',
    rack: batch.location?.rack || '',
    grade: batch.grade || '',
    shade: batch.shade || '',
    costPerSqFt: cost.amount ?? '',
    costCurrency: cost.currency || '',
    pricePerSqFt: selling.amount ?? '',
    sellingCurrency: selling.currency || '',
    notes: batch.notes || '',
    status: batch.status || '',
  };
}

function Field({ id, label, hint, required = false, children }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-black text-stone-700">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      {hint && <p className="mt-1 text-[11px] leading-4 text-stone-500">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function FormSection({ icon, title, description, children }) {
  const Icon = icon;
  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-stone-100 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-700"><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <div><h2 className="text-sm font-black text-stone-950">{title}</h2>{description && <p className="mt-0.5 text-xs leading-5 text-stone-500">{description}</p>}</div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function commercialPayload(rateValue, currencyValue, fieldName) {
  const rate = optionalNumber(rateValue);
  const currency = String(currencyValue || '').trim().toUpperCase();
  if (rate === undefined && !currency) return undefined;
  return { [fieldName]: rate, currency };
}

export default function InventoryBatchFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const catalog = useMemo(
    () => getAllStones().slice().sort((left, right) => left.name.localeCompare(right.name)),
    [],
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadBatch = useCallback(async () => {
    if (!editing) return;
    setLoading(true);
    setError('');
    try {
      const response = await authFetch(`/api/admin/inventory/batches/${encodeURIComponent(id)}`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseInventoryResponse(response, 'Unable to load this inventory batch.');
      setBatch(data.batch);
      setForm(batchToForm(data.batch));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load this inventory batch.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, editing, id, logout, navigate]);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  const selectedStone = useMemo(
    () => catalog.find((stone) => stone.slug === form.stoneSlug),
    [catalog, form.stoneSlug],
  );
  const finishSuggestions = selectedStone?.finishes || [];
  const inputClass = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

  function updateField(field) {
    return (event) => {
      const value = field.toLowerCase().includes('currency') ? event.target.value.toUpperCase() : event.target.value;
      setForm((current) => ({ ...current, [field]: value }));
      setError('');
    };
  }

  function buildPayload() {
    const source = compactObject({ quarry: form.quarry.trim(), origin: form.origin.trim(), supplier: form.supplier.trim() });
    const nominalDimensions = compactObject({ lengthMm: optionalNumber(form.lengthMm), widthMm: optionalNumber(form.widthMm) });
    const cost = commercialPayload(form.costPerSqFt, form.costCurrency, 'costPerSqFt');
    const selling = commercialPayload(form.pricePerSqFt, form.sellingCurrency, 'pricePerSqFt');
    const metadata = compactObject({
      receivedDate: form.receivedDate,
      externalLotNumber: form.externalLotNumber.trim(),
      source: Object.keys(source).length ? source : undefined,
      finish: form.finish.trim(),
      thicknessMm: optionalNumber(form.thicknessMm),
      nominalDimensions: Object.keys(nominalDimensions).length ? nominalDimensions : undefined,
      cost,
      selling,
      grade: form.grade.trim(),
      shade: form.shade.trim(),
      notes: form.notes.trim(),
    });

    if (editing) {
      if (form.status && form.status !== batch?.status) metadata.status = form.status;
      return metadata;
    }

    return compactObject({
      stoneSlug: form.stoneSlug,
      inventoryMode: form.inventoryMode,
      ...metadata,
      receivedCount: form.inventoryMode === 'BATCH' ? optionalNumber(form.receivedCount) : undefined,
      receivedSqFt: form.inventoryMode === 'BATCH' ? optionalNumber(form.receivedSqFt) : undefined,
      location: form.inventoryMode === 'BATCH'
        ? compactObject({ warehouse: form.warehouse.trim(), zone: form.zone.trim(), rack: form.rack.trim() })
        : undefined,
    });
  }

  function validateClient() {
    if (!editing && (!form.stoneSlug || !form.receivedDate || !form.inventoryMode)) return 'Stone, received date, and inventory mode are required.';
    if (!editing && form.inventoryMode === 'BATCH' && !(Number(form.receivedCount) > 0) && !(Number(form.receivedSqFt) > 0)) return 'Enter a positive received quantity or received area for batch-quantity inventory.';
    if (!editing && form.inventoryMode === 'BATCH' && !form.warehouse.trim()) return 'Warehouse is required for batch-quantity inventory.';
    if ((form.lengthMm && !form.widthMm) || (!form.lengthMm && form.widthMm)) return 'Enter both nominal length and width, or leave both blank.';
    if ((form.costPerSqFt && !form.costCurrency) || (!form.costPerSqFt && form.costCurrency)) return 'Cost rate and its three-letter currency code must be entered together.';
    if ((form.pricePerSqFt && !form.sellingCurrency) || (!form.pricePerSqFt && form.sellingCurrency)) return 'Selling rate and its three-letter currency code must be entered together.';
    return '';
  }

  async function submitForm(event) {
    event.preventDefault();
    const clientError = validateClient();
    if (clientError) {
      setError(clientError);
      return;
    }
    if (
      editing
      && form.status === 'ARCHIVED'
      && batch?.status !== 'ARCHIVED'
      && !window.confirm('Archive this empty batch? Archived inventory becomes read-only and its history is retained.')
    ) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await authFetch(
        editing ? `/api/admin/inventory/batches/${encodeURIComponent(id)}` : '/api/admin/inventory/batches',
        { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(buildPayload()) },
      );
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseInventoryResponse(response, editing ? 'Unable to update this batch.' : 'Unable to create this batch.');
      navigate(`/admin/inventory/batches/${data.batch?._id || id}`, { replace: true });
    } catch (requestError) {
      setError(requestError.message || 'Unable to save this inventory batch.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-5xl rounded-xl border border-stone-200 bg-white px-6 py-20 text-center" role="status"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-amber-700" /><p className="mt-3 text-sm font-bold text-stone-600">Loading batch…</p></div>;
  }

  if (editing && !batch) {
    return (
      <div className="mx-auto max-w-3xl space-y-4"><Link to="/admin/inventory" className="inline-flex items-center gap-2 text-sm font-bold text-stone-600"><ArrowLeft className="h-4 w-4" /> Inventory</Link><div className="rounded-xl border border-rose-200 bg-white p-6"><div role="alert" className="rounded-lg bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error || 'Batch not found.'}</div><button type="button" onClick={loadBatch} className="mt-4 rounded-lg bg-stone-950 px-4 py-2 text-xs font-bold text-white">Retry</button></div></div>
    );
  }

  if (editing && batch.status === 'ARCHIVED') {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Helmet><title>{batch.batchNumber} Archived | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
        <Link to={`/admin/inventory/batches/${id}`} className="inline-flex items-center gap-2 text-sm font-bold text-stone-600"><ArrowLeft className="h-4 w-4" /> Batch detail</Link>
        <div className="rounded-xl border border-stone-300 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-black text-stone-950">Archived batch is read-only</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">{batch.batchNumber} retains its metadata and movement history, but archived inventory cannot be edited or receive stock actions.</p>
        </div>
      </div>
    );
  }

  const hasPositiveInventory = Number(batchQuantityOnHand(batch) || 0) > 0
    || Number(batchAreaOnHand(batch) || 0) > 0;
  const permittedStatusOptions = INVENTORY_STATUSES.filter(({ value }) => (
    hasPositiveInventory ? ['AVAILABLE', 'HOLD'].includes(value) : value === 'ARCHIVED'
  ));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Helmet><title>{editing ? `Edit ${batch?.batchNumber}` : 'New Inventory Batch'} | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div>
        <Link to={editing ? `/admin/inventory/batches/${id}` : '/admin/inventory'} className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-950"><ArrowLeft className="h-3.5 w-3.5" /> {editing ? 'Batch detail' : 'Inventory'}</Link>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">{editing ? `Edit ${batch.batchNumber}` : 'Record inventory batch'}</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">{editing ? 'Update verified metadata only. Stock and location changes remain ledgered actions.' : 'Create a physical inventory batch from verified information. Blank optional fields remain unknown.'}</p>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

      <form onSubmit={submitForm} className="space-y-6">
        <FormSection icon={Boxes} title="Identity and receipt" description={editing ? 'Batch identity and tracking mode are immutable.' : 'Select the canonical catalog stone without importing catalog assumptions.'}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="batch-stone" label="Canonical stone" required={!editing} hint="Selection stores a stable catalog reference and server-generated snapshot.">
              <select id="batch-stone" required={!editing} disabled={editing} value={form.stoneSlug} onChange={updateField('stoneSlug')} className={inputClass}><option value="">Select a stone</option>{catalog.map((stone) => <option key={stone.slug} value={stone.slug}>{stone.name}</option>)}</select>
            </Field>
            <Field id="received-date" label="Received date" required={!editing}><input id="received-date" type="date" required={!editing} value={form.receivedDate} onChange={updateField('receivedDate')} className={inputClass} /></Field>
            <Field id="inventory-mode" label="Inventory mode" required={!editing} hint={form.inventoryMode === 'INDIVIDUAL_SLAB' ? 'Availability and location are maintained per slab.' : 'Quantity and area are maintained at batch level.'}>
              <select id="inventory-mode" required={!editing} disabled={editing} value={form.inventoryMode} onChange={updateField('inventoryMode')} className={inputClass}><option value="">Select tracking mode</option>{INVENTORY_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select>
            </Field>
            <Field id="external-lot" label="External supplier / quarry lot" hint="Separate from the immutable system batch number."><input id="external-lot" maxLength={120} value={form.externalLotNumber} onChange={updateField('externalLotNumber')} className={inputClass} /></Field>
          </div>
          {selectedStone && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900"><span className="font-black">Catalog context:</span> {selectedStone.name}{selectedStone.materialFamily ? ` - ${selectedStone.materialFamily}` : ''}. Finish, thickness, dimensions, and prices below are intentionally not prefilled.</div>}
          {editing && <div className="mt-4 grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs sm:grid-cols-3"><div><p className="font-bold text-stone-400">Batch</p><p className="mt-1 font-mono font-black text-stone-800">{batch.batchNumber}</p></div><div><p className="font-bold text-stone-400">Mode</p><p className="mt-1 font-black text-stone-800">{labelInventoryMode(batchInventoryMode(batch))}</p></div><div><p className="font-bold text-stone-400">Location</p><p className="mt-1 font-black text-stone-800">{batchInventoryMode(batch) === 'INDIVIDUAL_SLAB' ? 'Tracked per slab' : formatInventoryLocation(batch.location)}</p></div></div>}
        </FormSection>

        {!editing && form.inventoryMode === 'BATCH' && (
          <FormSection icon={CheckCircle2} title="Opening receipt" description="The system creates the initial immutable RECEIPT movement from these verified values.">
            <div className="grid gap-4 sm:grid-cols-2"><Field id="received-count" label="Received quantity" hint="Whole units/slabs. At least quantity or area must be positive."><input id="received-count" type="number" min="0" step="1" value={form.receivedCount} onChange={updateField('receivedCount')} className={inputClass} /></Field><Field id="received-area" label="Received area (sq.ft)" hint="Enter only a separately verified area."><input id="received-area" type="number" min="0" step="0.0001" value={form.receivedSqFt} onChange={updateField('receivedSqFt')} className={inputClass} /></Field></div>
          </FormSection>
        )}

        {!editing && form.inventoryMode === 'INDIVIDUAL_SLAB' && (
          <FormSection icon={CheckCircle2} title="Empty slab-tracked batch" description="This creates a DRAFT batch shell without aggregate opening stock.">
            <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900"><Info className="mr-1 inline h-3.5 w-3.5" /> Add each verified slab from the batch detail page. Every slab creates its own RECEIPT movement and increments availability exactly once.</p>
          </FormSection>
        )}

        {editing && (
          <FormSection icon={CheckCircle2} title="Read-only availability" description="Use Adjust Stock on the detail page; current balances cannot be overwritten here.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-stone-50 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">Received count</p><p className="mt-1 font-black text-stone-900">{formatInventoryNumber(batchQuantityReceived(batch), { maximumFractionDigits: 0 })}</p></div><div className="rounded-lg bg-stone-50 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">Current count</p><p className="mt-1 font-black text-stone-900">{formatInventoryNumber(batchQuantityOnHand(batch), { maximumFractionDigits: 0 })}</p></div><div className="rounded-lg bg-stone-50 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">Received area</p><p className="mt-1 font-black text-stone-900">{batchAreaReceived(batch) == null ? 'Not recorded' : `${formatInventoryNumber(batchAreaReceived(batch))} sq.ft`}</p></div><div className="rounded-lg bg-stone-50 p-3"><p className="text-[10px] font-bold uppercase text-stone-400">Current area</p><p className="mt-1 font-black text-stone-900">{batchAreaOnHand(batch) == null ? 'Not recorded' : `${formatInventoryNumber(batchAreaOnHand(batch))} sq.ft`}</p></div></div>
          </FormSection>
        )}

        <FormSection icon={Ruler} title="Material specification" description="Record only measurements and classifications verified for this batch.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="batch-finish" label="Finish"><input id="batch-finish" list="batch-finish-options" maxLength={120} value={form.finish} onChange={updateField('finish')} className={inputClass} /><datalist id="batch-finish-options">{finishSuggestions.map((finish) => <option key={finish} value={finish} />)}</datalist></Field>
            <Field id="batch-thickness" label="Thickness (mm)"><input id="batch-thickness" type="number" min="0.01" step="0.01" value={form.thicknessMm} onChange={updateField('thicknessMm')} className={inputClass} /></Field>
            <Field id="batch-grade" label="Grade"><input id="batch-grade" maxLength={100} value={form.grade} onChange={updateField('grade')} className={inputClass} /></Field>
            <Field id="batch-length" label="Nominal length (mm)" hint="Length and width must be supplied together."><input id="batch-length" type="number" min="0.01" step="0.01" value={form.lengthMm} onChange={updateField('lengthMm')} className={inputClass} /></Field>
            <Field id="batch-width" label="Nominal width (mm)"><input id="batch-width" type="number" min="0.01" step="0.01" value={form.widthMm} onChange={updateField('widthMm')} className={inputClass} /></Field>
            <Field id="batch-shade" label="Shade"><input id="batch-shade" maxLength={100} value={form.shade} onChange={updateField('shade')} className={inputClass} /></Field>
          </div>
        </FormSection>

        <FormSection icon={Info} title="Source" description="Optional supplier and origin metadata remains protected within admin inventory.">
          <div className="grid gap-4 sm:grid-cols-3"><Field id="source-supplier" label="Supplier"><input id="source-supplier" maxLength={160} value={form.supplier} onChange={updateField('supplier')} className={inputClass} /></Field><Field id="source-quarry" label="Quarry"><input id="source-quarry" maxLength={160} value={form.quarry} onChange={updateField('quarry')} className={inputClass} /></Field><Field id="source-origin" label="Origin"><input id="source-origin" maxLength={160} value={form.origin} onChange={updateField('origin')} className={inputClass} /></Field></div>
        </FormSection>

        {!editing && form.inventoryMode === 'BATCH' && (
          <FormSection icon={MapPin} title="Physical location" description="Batch-mode stock has one whole-batch location in Phase 5.">
            <div className="grid gap-4 sm:grid-cols-3"><Field id="batch-warehouse" label="Warehouse / yard" required><input id="batch-warehouse" required maxLength={120} value={form.warehouse} onChange={updateField('warehouse')} className={inputClass} /></Field><Field id="batch-zone" label="Zone"><input id="batch-zone" maxLength={80} value={form.zone} onChange={updateField('zone')} className={inputClass} /></Field><Field id="batch-rack" label="Rack"><input id="batch-rack" maxLength={80} value={form.rack} onChange={updateField('rack')} className={inputClass} /></Field></div>
          </FormSection>
        )}

        <FormSection icon={CircleDollarSign} title="Commercial rates" description="Optional admin-only verified rates. Currency is mandatory whenever a rate is entered.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field id="cost-rate" label="Cost per sq.ft"><input id="cost-rate" type="number" min="0" step="0.0001" value={form.costPerSqFt} onChange={updateField('costPerSqFt')} className={inputClass} /></Field><Field id="cost-currency" label="Cost currency"><input id="cost-currency" maxLength={3} minLength={3} placeholder="3-letter code" value={form.costCurrency} onChange={updateField('costCurrency')} className={`${inputClass} uppercase`} /></Field><Field id="selling-rate" label="Selling price per sq.ft"><input id="selling-rate" type="number" min="0" step="0.0001" value={form.pricePerSqFt} onChange={updateField('pricePerSqFt')} className={inputClass} /></Field><Field id="selling-currency" label="Selling currency"><input id="selling-currency" maxLength={3} minLength={3} placeholder="3-letter code" value={form.sellingCurrency} onChange={updateField('sellingCurrency')} className={`${inputClass} uppercase`} /></Field></div>
        </FormSection>

        <FormSection icon={Save} title="Status and notes" description="Notes and cost information remain protected admin data.">
          <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
            {editing && <Field id="batch-status" label="Batch status" hint="Depleted remains derived from stock; archiving does not delete history."><select id="batch-status" value={form.status} onChange={updateField('status')} className={inputClass}>{!permittedStatusOptions.some(({ value }) => value === form.status) && <option value={form.status}>{INVENTORY_STATUSES.find(({ value }) => value === form.status)?.label || form.status}</option>}{permittedStatusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></Field>}
            <Field id="batch-notes" label="Internal notes"><textarea id="batch-notes" rows={5} maxLength={3000} value={form.notes} onChange={updateField('notes')} className={`${inputClass} resize-y`} /></Field>
          </div>
        </FormSection>

        <div className="sticky bottom-3 flex flex-col gap-3 rounded-xl border border-stone-300 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-stone-500">No catalog pricing, dimensions, stock, or commercial values are inferred.</p><div className="flex gap-2"><Link to={editing ? `/admin/inventory/batches/${id}` : '/admin/inventory'} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-stone-300 px-4 text-xs font-bold text-stone-700 sm:flex-none">Cancel</Link><button type="submit" disabled={saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white hover:bg-stone-800 disabled:opacity-60 sm:flex-none">{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{saving ? 'Saving…' : editing ? 'Save metadata' : 'Create batch'}</button></div></div>
      </form>
    </div>
  );
}
