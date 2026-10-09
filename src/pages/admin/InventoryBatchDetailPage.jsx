import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Edit3,
  History,
  Info,
  MapPin,
  PackagePlus,
  RefreshCw,
  Ruler,
  Save,
  SquareStack,
  Truck,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
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
  formatInventoryCurrency,
  formatInventoryDate,
  formatInventoryLocation,
  formatInventoryNumber,
  INVENTORY_STATUS_STYLES,
  labelInventoryMode,
  labelInventoryStatus,
  labelMovementType,
  optionalNumber,
  parseInventoryResponse,
  slabDimensions,
} from '../../lib/inventory';

const CHILD_PAGE_SIZE = 25;
const EMPTY_ADJUSTMENT = Object.freeze({ direction: '', quantity: '', areaSqFt: '', reason: '', slabId: '' });
const EMPTY_TRANSFER = Object.freeze({ slabId: '', warehouse: '', zone: '', rack: '', reason: '', confirmed: false });
const EMPTY_SLAB = Object.freeze({ lengthMm: '', widthMm: '', thicknessMm: '', usableAreaSqFt: '', warehouse: '', zone: '', rack: '', grade: '', shade: '', defects: '', notes: '' });

function InfoRow({ label, value, children }) {
  return (
    <div className="grid gap-1 border-b border-stone-100 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-[11px] font-black uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-semibold text-stone-800">{children ?? (value === null || value === undefined || value === '' ? 'Not recorded' : value)}</dd>
    </div>
  );
}

function Section({ icon, title, description, action, children, className = '' }) {
  const Icon = icon;
  return (
    <section className={`rounded-xl border border-stone-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-700"><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <div><h2 className="text-sm font-black text-stone-950">{title}</h2>{description && <p className="mt-0.5 text-xs leading-5 text-stone-500">{description}</p>}</div>
        </div>
        {action}
      </div>
      <div className="px-5 py-2">{children}</div>
    </section>
  );
}

function Pagination({ page, pages, total, label, onPage }) {
  if (pages <= 1) return total > 0 ? <p className="border-t border-stone-100 px-5 py-3 text-xs text-stone-500">{total.toLocaleString('en-IN')} {label}</p> : null;
  return (
    <div className="flex flex-col gap-2 border-t border-stone-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-semibold text-stone-500">Page {page} of {pages} · {total.toLocaleString('en-IN')} {label}</p>
      <div className="flex gap-2"><button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-700 disabled:opacity-40"><ArrowLeft className="h-3 w-3" /> Previous</button><button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-700 disabled:opacity-40">Next <ArrowRight className="h-3 w-3" /></button></div>
    </div>
  );
}

function ActionField({ id, label, required = false, children }) {
  return <div><label htmlFor={id} className="mb-1.5 block text-xs font-black text-stone-600">{label} {required && <span className="text-rose-600">*</span>}</label>{children}</div>;
}

function signedValue(value, unit = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not recorded';
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${formatInventoryNumber(number)}${unit}`;
}

function locationFields(form, update, prefix) {
  const inputClass = 'w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200';
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <ActionField id={`${prefix}-warehouse`} label="Warehouse / yard" required><input id={`${prefix}-warehouse`} required maxLength={120} value={form.warehouse} onChange={update('warehouse')} className={inputClass} /></ActionField>
      <ActionField id={`${prefix}-zone`} label="Zone"><input id={`${prefix}-zone`} maxLength={80} value={form.zone} onChange={update('zone')} className={inputClass} /></ActionField>
      <ActionField id={`${prefix}-rack`} label="Rack"><input id={`${prefix}-rack`} maxLength={80} value={form.rack} onChange={update('rack')} className={inputClass} /></ActionField>
    </div>
  );
}

export default function InventoryBatchDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [batch, setBatch] = useState(null);
  const [movements, setMovements] = useState([]);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPages, setMovementPages] = useState(1);
  const [movementTotal, setMovementTotal] = useState(0);
  const [slabs, setSlabs] = useState([]);
  const [slabPage, setSlabPage] = useState(1);
  const [slabPages, setSlabPages] = useState(1);
  const [slabTotal, setSlabTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [movementLoading, setMovementLoading] = useState(true);
  const [slabLoading, setSlabLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState('');
  const [adjustment, setAdjustment] = useState(EMPTY_ADJUSTMENT);
  const [transfer, setTransfer] = useState(EMPTY_TRANSFER);
  const [showAddSlab, setShowAddSlab] = useState(false);
  const [newSlab, setNewSlab] = useState(EMPTY_SLAB);
  const [editingSlab, setEditingSlab] = useState(null);

  const adminRequest = useCallback(async (path, options, fallback) => {
    const response = await authFetch(path, options);
    if (response.status === 401) {
      logout();
      navigate('/admin/login', { replace: true });
      return null;
    }
    return parseInventoryResponse(response, fallback);
  }, [authFetch, logout, navigate]);

  const loadBatch = useCallback(async ({ background = false } = {}) => {
    if (!background) setLoading(true);
    setError('');
    try {
      const data = await adminRequest(`/api/admin/inventory/batches/${encodeURIComponent(id)}`, undefined, 'Unable to load this inventory batch.');
      if (data) setBatch(data.batch);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load this inventory batch.');
    } finally {
      if (!background) setLoading(false);
    }
  }, [adminRequest, id]);

  const loadMovements = useCallback(async () => {
    setMovementLoading(true);
    try {
      const data = await adminRequest(`/api/admin/inventory/batches/${encodeURIComponent(id)}/movements?page=${movementPage}&limit=${CHILD_PAGE_SIZE}`, undefined, 'Unable to load inventory history.');
      if (data) {
        setMovements(Array.isArray(data.movements) ? data.movements : []);
        setMovementTotal(Number(data.total) || 0);
        setMovementPages(Math.max(1, Number(data.pages) || 1));
      }
    } catch (requestError) {
      setActionError(requestError.message || 'Unable to load inventory history.');
    } finally {
      setMovementLoading(false);
    }
  }, [adminRequest, id, movementPage]);

  const loadSlabs = useCallback(async () => {
    if (batchInventoryMode(batch) !== 'INDIVIDUAL_SLAB') return;
    setSlabLoading(true);
    try {
      const data = await adminRequest(`/api/admin/inventory/batches/${encodeURIComponent(id)}/slabs?page=${slabPage}&limit=${CHILD_PAGE_SIZE}`, undefined, 'Unable to load slabs.');
      if (data) {
        setSlabs(Array.isArray(data.slabs) ? data.slabs : []);
        setSlabTotal(Number(data.total) || 0);
        setSlabPages(Math.max(1, Number(data.pages) || 1));
      }
    } catch (requestError) {
      setActionError(requestError.message || 'Unable to load slabs.');
    } finally {
      setSlabLoading(false);
    }
  }, [adminRequest, batch, id, slabPage]);

  useEffect(() => { loadBatch(); }, [loadBatch]);
  useEffect(() => { loadMovements(); }, [loadMovements]);
  useEffect(() => { loadSlabs(); }, [loadSlabs]);

  const mode = batchInventoryMode(batch);
  const archived = batch?.status === 'ARCHIVED';
  const inputClass = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100';
  const adjustmentSlabs = useMemo(() => {
    if (adjustment.direction === 'IN') return slabs.filter((slab) => slab.status === 'DEPLETED');
    if (adjustment.direction === 'OUT') return slabs.filter((slab) => ['AVAILABLE', 'HOLD'].includes(slab.status));
    return [];
  }, [adjustment.direction, slabs]);
  const transferableSlabs = useMemo(
    () => slabs.filter((slab) => ['AVAILABLE', 'HOLD'].includes(slab.status)),
    [slabs],
  );

  async function refreshAfterAction() {
    await loadBatch({ background: true });
    if (movementPage === 1) await loadMovements();
    else setMovementPage(1);
    if (mode === 'INDIVIDUAL_SLAB') {
      if (slabPage === 1) await loadSlabs();
      else setSlabPage(1);
    }
  }

  function updateAdjustment(field) {
    return (event) => setAdjustment((current) => ({ ...current, [field]: event.target.value }));
  }

  function updateTransfer(field) {
    return (event) => setTransfer((current) => ({ ...current, [field]: field === 'confirmed' ? event.target.checked : event.target.value }));
  }

  function updateNewSlab(field) {
    return (event) => setNewSlab((current) => ({ ...current, [field]: event.target.value }));
  }

  async function submitAdjustment(event) {
    event.preventDefault();
    setActionError('');
    setSuccess('');
    if (!adjustment.direction || !adjustment.reason.trim()) {
      setActionError('Adjustment direction and reason are required.');
      return;
    }
    if (mode === 'BATCH' && optionalNumber(adjustment.quantity) === undefined && optionalNumber(adjustment.areaSqFt) === undefined) {
      setActionError('Enter a positive quantity or area adjustment.');
      return;
    }
    if (mode === 'INDIVIDUAL_SLAB' && !adjustment.slabId) {
      setActionError('Select one slab for this whole-slab adjustment.');
      return;
    }
    setBusy('adjustment');
    try {
      const payload = mode === 'INDIVIDUAL_SLAB'
        ? { direction: adjustment.direction, slabId: adjustment.slabId, reason: adjustment.reason.trim() }
        : compactObject({ direction: adjustment.direction, quantity: optionalNumber(adjustment.quantity), areaSqFt: optionalNumber(adjustment.areaSqFt), reason: adjustment.reason.trim() });
      const data = await adminRequest(`/api/admin/inventory/batches/${encodeURIComponent(id)}/adjustments`, { method: 'POST', body: JSON.stringify(payload) }, 'Unable to adjust inventory.');
      if (!data) return;
      setAdjustment(EMPTY_ADJUSTMENT);
      await refreshAfterAction();
      setSuccess('Inventory adjustment recorded in the movement ledger.');
    } catch (requestError) {
      setActionError(requestError.message || 'Unable to adjust inventory.');
    } finally {
      setBusy('');
    }
  }

  async function submitTransfer(event) {
    event.preventDefault();
    setActionError('');
    setSuccess('');
    if (!transfer.warehouse.trim() || !transfer.reason.trim()) {
      setActionError('Destination warehouse and transfer reason are required.');
      return;
    }
    if (mode === 'BATCH' && !transfer.confirmed) {
      setActionError('Confirm that this operation moves the whole batch.');
      return;
    }
    if (mode === 'INDIVIDUAL_SLAB' && !transfer.slabId) {
      setActionError('Select one slab to transfer.');
      return;
    }
    setBusy('transfer');
    try {
      const payload = compactObject({
        slabId: mode === 'INDIVIDUAL_SLAB' ? transfer.slabId : undefined,
        toLocation: compactObject({ warehouse: transfer.warehouse.trim(), zone: transfer.zone.trim(), rack: transfer.rack.trim() }),
        reason: transfer.reason.trim(),
      });
      const data = await adminRequest(`/api/admin/inventory/batches/${encodeURIComponent(id)}/transfers`, { method: 'POST', body: JSON.stringify(payload) }, 'Unable to transfer inventory.');
      if (!data) return;
      setTransfer(EMPTY_TRANSFER);
      await refreshAfterAction();
      setSuccess(mode === 'BATCH' ? 'Whole-batch transfer recorded.' : 'Slab transfer recorded.');
    } catch (requestError) {
      setActionError(requestError.message || 'Unable to transfer inventory.');
    } finally {
      setBusy('');
    }
  }

  const grossAreaPreview = useMemo(() => {
    const length = Number(newSlab.lengthMm);
    const width = Number(newSlab.widthMm);
    if (!(length > 0) || !(width > 0)) return null;
    return (length * width) / 92903.04;
  }, [newSlab.lengthMm, newSlab.widthMm]);

  async function submitSlab(event) {
    event.preventDefault();
    setActionError('');
    setSuccess('');
    if (!(Number(newSlab.lengthMm) > 0) || !(Number(newSlab.widthMm) > 0) || !newSlab.warehouse.trim()) {
      setActionError('Slab length, width, and warehouse are required.');
      return;
    }
    if (newSlab.usableAreaSqFt && grossAreaPreview != null && Number(newSlab.usableAreaSqFt) > grossAreaPreview) {
      setActionError('Usable slab area cannot exceed the calculated gross area.');
      return;
    }
    setBusy('slab-create');
    try {
      const payload = compactObject({
        dimensions: compactObject({ lengthMm: optionalNumber(newSlab.lengthMm), widthMm: optionalNumber(newSlab.widthMm), thicknessMm: optionalNumber(newSlab.thicknessMm) }),
        usableAreaSqFt: optionalNumber(newSlab.usableAreaSqFt),
        location: compactObject({ warehouse: newSlab.warehouse.trim(), zone: newSlab.zone.trim(), rack: newSlab.rack.trim() }),
        grade: newSlab.grade.trim(), shade: newSlab.shade.trim(), defects: newSlab.defects.trim(), notes: newSlab.notes.trim(),
      });
      const data = await adminRequest(`/api/admin/inventory/batches/${encodeURIComponent(id)}/slabs`, { method: 'POST', body: JSON.stringify(payload) }, 'Unable to add this slab.');
      if (!data) return;
      setNewSlab(EMPTY_SLAB);
      setShowAddSlab(false);
      await refreshAfterAction();
      setSuccess(`Slab ${data.slab?.slabNumber || ''} received and recorded.`.trim());
    } catch (requestError) {
      setActionError(requestError.message || 'Unable to add this slab.');
    } finally {
      setBusy('');
    }
  }

  function beginSlabEdit(slab) {
    setEditingSlab({ _id: slab._id, slabNumber: slab.slabNumber, status: slab.status, grade: slab.grade || '', shade: slab.shade || '', defects: slab.defects || '', notes: slab.notes || '' });
    setActionError('');
    setSuccess('');
  }

  async function submitSlabEdit(event) {
    event.preventDefault();
    setBusy('slab-edit');
    setActionError('');
    try {
      const payload = compactObject({
        grade: editingSlab.grade.trim(), shade: editingSlab.shade.trim(), defects: editingSlab.defects.trim(), notes: editingSlab.notes.trim(),
      });
      const data = await adminRequest(`/api/admin/inventory/slabs/${encodeURIComponent(editingSlab._id)}`, { method: 'PATCH', body: JSON.stringify(payload) }, 'Unable to update this slab.');
      if (!data) return;
      setEditingSlab(null);
      await loadSlabs();
      setSuccess('Slab metadata updated. Dimensions and location remain action-controlled.');
    } catch (requestError) {
      setActionError(requestError.message || 'Unable to update this slab.');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-6xl rounded-xl border border-stone-200 bg-white px-6 py-20 text-center" role="status"><RefreshCw className="mx-auto h-7 w-7 animate-spin text-amber-700" /><p className="mt-3 text-sm font-bold text-stone-600">Loading inventory batch…</p></div>;
  }

  if (!batch) {
    return <div className="mx-auto max-w-3xl space-y-4"><Link to="/admin/inventory" className="inline-flex items-center gap-2 text-sm font-bold text-stone-600"><ArrowLeft className="h-4 w-4" /> Inventory</Link><div className="rounded-xl border border-rose-200 bg-white p-6"><div role="alert" className="rounded-lg bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error || 'Inventory batch not found.'}</div><button type="button" onClick={() => loadBatch()} className="mt-4 rounded-lg bg-stone-950 px-4 py-2 text-xs font-bold text-white">Retry</button></div></div>;
  }

  const stone = batchStone(batch);
  const quantityOnHand = batchQuantityOnHand(batch);
  const areaOnHand = batchAreaOnHand(batch);
  const cost = batchCost(batch);
  const selling = batchSelling(batch);
  const hasCostValue = Number.isFinite(Number(areaOnHand)) && Number.isFinite(Number(cost.amount)) && cost.currency;
  const inventoryCostValue = hasCostValue ? Number(areaOnHand) * Number(cost.amount) : null;

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <Helmet><title>{batch.batchNumber} | Inventory Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><Link to="/admin/inventory" className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-950"><ArrowLeft className="h-3.5 w-3.5" /> Inventory</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="font-mono text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">{batch.batchNumber}</h1><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${INVENTORY_STATUS_STYLES[batch.status] || INVENTORY_STATUS_STYLES.DRAFT}`}>{labelInventoryStatus(batch.status)}</span></div><p className="mt-1 text-sm font-semibold text-stone-600">{stone.name || 'Stone not recorded'} · {labelInventoryMode(mode)}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { loadBatch({ background: true }); loadMovements(); loadSlabs(); }} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-60"><RefreshCw className="h-4 w-4" /> Refresh</button>{!archived && <Link to={`/admin/inventory/batches/${id}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white"><Edit3 className="h-4 w-4" /> Edit metadata</Link>}</div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}
      {actionError && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{actionError}</span></div>}
      {success && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><span>{success}</span></div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Section icon={Boxes} title="Identity" description="Stable batch and catalog provenance."><dl><InfoRow label="Batch number" value={batch.batchNumber} /><InfoRow label="Stone" value={stone.name} /><InfoRow label="Catalog slug" value={stone.slug} /><InfoRow label="Material family" value={stone.materialFamily} /><InfoRow label="Mode" value={labelInventoryMode(mode)} /><InfoRow label="Received" value={formatInventoryDate(batch.receivedDate)} /><InfoRow label="External lot" value={batch.externalLotNumber} /></dl></Section>
            <Section icon={Ruler} title="Material specification" description="Verified batch characteristics."><dl><InfoRow label="Finish" value={batch.finish} /><InfoRow label="Thickness" value={batch.thicknessMm == null ? undefined : `${formatInventoryNumber(batch.thicknessMm)} mm`} /><InfoRow label="Dimensions" value={batch.nominalDimensions?.lengthMm && batch.nominalDimensions?.widthMm ? `${formatInventoryNumber(batch.nominalDimensions.lengthMm)} × ${formatInventoryNumber(batch.nominalDimensions.widthMm)} mm` : undefined} /><InfoRow label="Grade" value={batch.grade} /><InfoRow label="Shade" value={batch.shade} /><InfoRow label="Supplier" value={batch.source?.supplier} /><InfoRow label="Quarry" value={batch.source?.quarry} /><InfoRow label="Origin" value={batch.source?.origin} /></dl></Section>
          </div>

          <Section icon={SquareStack} title="On-hand balance" description="Physical balances maintained by receipts and append-only inventory movements; status separately controls availability.">
            <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg bg-stone-50 p-4"><p className="text-[10px] font-black uppercase text-stone-400">Received count</p><p className="mt-2 text-xl font-black text-stone-950">{formatInventoryNumber(batchQuantityReceived(batch), { maximumFractionDigits: 0 })}</p></div><div className="rounded-lg bg-stone-50 p-4"><p className="text-[10px] font-black uppercase text-stone-400">On-hand count</p><p className="mt-2 text-xl font-black text-stone-950">{formatInventoryNumber(quantityOnHand, { maximumFractionDigits: 0 })}</p></div><div className="rounded-lg bg-stone-50 p-4"><p className="text-[10px] font-black uppercase text-stone-400">Received area</p><p className="mt-2 text-xl font-black text-stone-950">{batchAreaReceived(batch) == null ? 'Not recorded' : `${formatInventoryNumber(batchAreaReceived(batch))} sq.ft`}</p></div><div className="rounded-lg bg-stone-50 p-4"><p className="text-[10px] font-black uppercase text-stone-400">On-hand area</p><p className="mt-2 text-xl font-black text-stone-950">{areaOnHand == null ? 'Not recorded' : `${formatInventoryNumber(areaOnHand)} sq.ft`}</p></div></div>
            <p className="border-t border-stone-100 py-3 text-xs text-stone-500">Area basis: {batch.area?.basis ? String(batch.area.basis).toLowerCase() : 'not recorded'}.</p>
          </Section>

          {mode === 'INDIVIDUAL_SLAB' && (
            <Section
              icon={SquareStack}
              title="Individual slabs"
              description="Each slab has its own immutable reference, verified dimensions, status, and physical location."
              action={!archived && <button type="button" onClick={() => setShowAddSlab((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-stone-950 px-3 text-xs font-black text-white"><PackagePlus className="h-3.5 w-3.5" /> {showAddSlab ? 'Close form' : 'Add slab'}</button>}
            >
              {showAddSlab && (
                <form onSubmit={submitSlab} className="my-4 space-y-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div><h3 className="text-sm font-black text-stone-950">Receive verified slab</h3><p className="mt-1 text-xs leading-5 text-stone-500">Gross area is calculated from millimetre dimensions; usable area remains an optional verified value.</p></div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><ActionField id="slab-length" label="Length (mm)" required><input id="slab-length" required type="number" min="0.01" step="0.01" value={newSlab.lengthMm} onChange={updateNewSlab('lengthMm')} className={inputClass} /></ActionField><ActionField id="slab-width" label="Width (mm)" required><input id="slab-width" required type="number" min="0.01" step="0.01" value={newSlab.widthMm} onChange={updateNewSlab('widthMm')} className={inputClass} /></ActionField><ActionField id="slab-thickness" label="Thickness (mm)"><input id="slab-thickness" type="number" min="0.01" step="0.01" value={newSlab.thicknessMm} onChange={updateNewSlab('thicknessMm')} className={inputClass} /></ActionField><ActionField id="slab-usable" label="Usable area (sq.ft)"><input id="slab-usable" type="number" min="0" step="0.0001" value={newSlab.usableAreaSqFt} onChange={updateNewSlab('usableAreaSqFt')} className={inputClass} /></ActionField></div>
                  {grossAreaPreview != null && <p className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-stone-600">Calculated gross area preview: {formatInventoryNumber(grossAreaPreview, { maximumFractionDigits: 4 })} sq.ft. The server recalculates this value.</p>}
                  {locationFields(newSlab, updateNewSlab, 'slab-location')}
                  <div className="grid gap-3 sm:grid-cols-2"><ActionField id="slab-grade" label="Grade"><input id="slab-grade" maxLength={80} value={newSlab.grade} onChange={updateNewSlab('grade')} className={inputClass} /></ActionField><ActionField id="slab-shade" label="Shade"><input id="slab-shade" maxLength={100} value={newSlab.shade} onChange={updateNewSlab('shade')} className={inputClass} /></ActionField><ActionField id="slab-defects" label="Defects / observations"><textarea id="slab-defects" rows={3} maxLength={1000} value={newSlab.defects} onChange={updateNewSlab('defects')} className={`${inputClass} resize-y`} /></ActionField><ActionField id="slab-notes" label="Internal notes"><textarea id="slab-notes" rows={3} maxLength={3000} value={newSlab.notes} onChange={updateNewSlab('notes')} className={`${inputClass} resize-y`} /></ActionField></div>
                  <div className="flex justify-end"><button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white disabled:opacity-60">{busy === 'slab-create' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />} Receive slab</button></div>
                </form>
              )}

              {editingSlab && (
                <form onSubmit={submitSlabEdit} className="my-4 space-y-4 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
                  <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-black text-stone-950">Edit {editingSlab.slabNumber}</h3><p className="mt-1 text-xs text-stone-500">Dimensions, location, and availability status remain action-controlled.</p></div><button type="button" onClick={() => setEditingSlab(null)} className="text-xs font-bold text-stone-500">Cancel</button></div>
                  <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">Current status: <strong>{labelInventoryStatus(editingSlab.status)}</strong>. Use an IN/OUT adjustment to change physical availability.</div>
                  <div className="grid gap-3 sm:grid-cols-2"><ActionField id="edit-slab-grade" label="Grade"><input id="edit-slab-grade" maxLength={80} value={editingSlab.grade} onChange={(event) => setEditingSlab((current) => ({ ...current, grade: event.target.value }))} className={inputClass} /></ActionField><ActionField id="edit-slab-shade" label="Shade"><input id="edit-slab-shade" maxLength={100} value={editingSlab.shade} onChange={(event) => setEditingSlab((current) => ({ ...current, shade: event.target.value }))} className={inputClass} /></ActionField><ActionField id="edit-slab-defects" label="Defects"><textarea id="edit-slab-defects" rows={3} maxLength={1000} value={editingSlab.defects} onChange={(event) => setEditingSlab((current) => ({ ...current, defects: event.target.value }))} className={`${inputClass} resize-y`} /></ActionField><div className="sm:col-span-2"><ActionField id="edit-slab-notes" label="Notes"><textarea id="edit-slab-notes" rows={3} maxLength={3000} value={editingSlab.notes} onChange={(event) => setEditingSlab((current) => ({ ...current, notes: event.target.value }))} className={`${inputClass} resize-y`} /></ActionField></div></div>
                  <div className="flex justify-end"><button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white disabled:opacity-60">{busy === 'slab-edit' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save slab metadata</button></div>
                </form>
              )}

              {slabLoading ? <div className="py-12 text-center text-sm font-bold text-stone-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading slabs…</div> : slabs.length === 0 ? <div className="py-12 text-center"><SquareStack className="mx-auto h-7 w-7 text-stone-300" /><p className="mt-3 text-sm font-bold text-stone-700">No slabs recorded</p><p className="mt-1 text-xs text-stone-500">This batch remains empty until verified slabs are received.</p></div> : <div className="-mx-5 overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">Slab</th><th className="px-4 py-3">Dimensions</th><th className="px-4 py-3">Area</th><th className="px-4 py-3">Grade / shade</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Status</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-stone-100">{slabs.map((slab) => { const dimensions = slabDimensions(slab); return <tr key={slab._id}><td className="px-5 py-4 font-mono text-xs font-black text-stone-900">{slab.slabNumber}</td><td className="px-4 py-4 text-xs text-stone-600">{formatInventoryNumber(dimensions.lengthMm)} × {formatInventoryNumber(dimensions.widthMm)}{dimensions.thicknessMm ? ` × ${formatInventoryNumber(dimensions.thicknessMm)}` : ''} mm</td><td className="px-4 py-4 text-xs text-stone-600"><p>Gross: {formatInventoryNumber(slab.grossAreaSqFt)} sq.ft</p><p className="mt-1">Usable: {slab.usableAreaSqFt == null ? 'Not recorded' : `${formatInventoryNumber(slab.usableAreaSqFt)} sq.ft`}</p></td><td className="px-4 py-4 text-xs text-stone-600">{[slab.grade, slab.shade].filter(Boolean).join(' / ') || 'Not recorded'}</td><td className="px-4 py-4 text-xs text-stone-600">{formatInventoryLocation(slab.location)}</td><td className="px-4 py-4"><span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${INVENTORY_STATUS_STYLES[slab.status] || INVENTORY_STATUS_STYLES.DRAFT}`}>{labelInventoryStatus(slab.status)}</span></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => beginSlabEdit(slab)} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">Edit</button></td></tr>; })}</tbody></table></div>}
              <Pagination page={slabPage} pages={slabPages} total={slabTotal} label="slabs" onPage={setSlabPage} />
              {slabPages > 1 && <p className="border-t border-amber-100 bg-amber-50 px-5 py-2 text-[11px] text-amber-900">Adjustment and transfer selectors show slabs from the currently loaded page only.</p>}
            </Section>
          )}

          <Section icon={History} title="Inventory movement ledger" description="Append-only receipts, adjustments, and transfers. This is not an accounting ledger.">
                {movementLoading ? <div className="py-12 text-center text-sm font-bold text-stone-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading history…</div> : movements.length === 0 ? <div className="py-12 text-center"><History className="mx-auto h-7 w-7 text-stone-300" /><p className="mt-3 text-sm font-bold text-stone-700">No movements recorded</p></div> : <ol className="py-3">{movements.map((movement, index) => <li key={movement._id || `${movement.occurredAt}-${index}`} className="relative flex gap-3 pb-5 last:pb-2">{index < movements.length - 1 && <span className="absolute bottom-0 left-3 top-7 w-px bg-stone-200" />}<span className="relative mt-1 h-6 w-6 shrink-0 rounded-full bg-amber-100 ring-4 ring-white" /><div className="min-w-0 flex-1 rounded-lg border border-stone-100 bg-stone-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wide text-stone-800">{labelMovementType(movement.type)}</p>{movement.slab?.slabNumber && <p className="mt-1 font-mono text-[11px] text-stone-500">{movement.slab.slabNumber}</p>}</div><time className="text-[11px] font-semibold text-stone-400">{formatInventoryDate(movement.occurredAt || movement.createdAt, { includeTime: true })}</time></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-600"><span>Quantity: <strong>{signedValue(movement.quantityDelta)}</strong></span><span>Area: <strong>{signedValue(movement.areaDeltaSqFt, ' sq.ft')}</strong></span>{movement.balanceAfter && <span>Balance: <strong>{formatInventoryNumber(movement.balanceAfter.quantity, { maximumFractionDigits: 0 })} / {movement.balanceAfter.areaSqFt == null ? 'area not recorded' : `${formatInventoryNumber(movement.balanceAfter.areaSqFt)} sq.ft`}</strong></span>}</div>{(movement.fromLocation || movement.toLocation) && <p className="mt-2 text-xs text-stone-600">{formatInventoryLocation(movement.fromLocation)} <ArrowRight className="mx-1 inline h-3 w-3" /> {formatInventoryLocation(movement.toLocation)}</p>}<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{movement.reason}</p><p className="mt-2 text-[11px] text-stone-400">Actor: {movement.actor || 'Authenticated admin'}</p></div></li>)}</ol>}
            <Pagination page={movementPage} pages={movementPages} total={movementTotal} label="movements" onPage={setMovementPage} />
          </Section>

          {batch.notes && <Section icon={ClipboardList} title="Internal notes"><p className="whitespace-pre-wrap py-4 text-sm leading-6 text-stone-700">{batch.notes}</p></Section>}
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Section icon={MapPin} title="Location" description={mode === 'BATCH' ? 'Whole-batch location.' : 'Locations are tracked on each slab.'}><div className="py-4"><p className="text-sm font-black text-stone-900">{mode === 'BATCH' ? formatInventoryLocation(batch.location) : 'Tracked per individual slab'}</p><p className="mt-2 text-[11px] leading-5 text-stone-500">Location changes require a transfer movement and cannot be edited as metadata.</p></div></Section>

          <Section icon={CircleDollarSign} title="Commercial" description="Protected admin-only verified rates."><dl><InfoRow label="Cost / sq.ft" value={formatInventoryCurrency(cost.amount, cost.currency)} /><InfoRow label="Selling / sq.ft" value={formatInventoryCurrency(selling.amount, selling.currency)} /><InfoRow label="Inventory cost value" value={inventoryCostValue == null ? 'Not available' : formatInventoryCurrency(inventoryCostValue, cost.currency)} /></dl><p className="border-t border-stone-100 py-3 text-[11px] leading-5 text-stone-500">Cost value is available area × verified cost rate. It is not revenue, profit, or a sales value.</p></Section>

          {archived ? (
            <div className="rounded-xl border border-stone-300 bg-stone-100 p-4 text-sm leading-6 text-stone-600"><Info className="mr-1 inline h-4 w-4" /> Archived inventory is read-only for stock actions. Its history remains available.</div>
          ) : (
            <>
              <Section icon={ArrowDownToLine} title="Adjust stock" description={mode === 'BATCH' ? 'Record quantity and/or area with a reason.' : 'Move one complete slab in or out with a reason.'}>
                <form onSubmit={submitAdjustment} className="space-y-3 py-4">
                  <ActionField id="adjust-direction" label="Direction" required><select id="adjust-direction" required value={adjustment.direction} onChange={(event) => setAdjustment((current) => ({ ...current, direction: event.target.value, slabId: '' }))} className={inputClass}><option value="">Select direction</option><option value="IN">IN - increase</option><option value="OUT">OUT - decrease</option></select></ActionField>
                  {mode === 'BATCH' ? <div className="grid grid-cols-2 gap-3"><ActionField id="adjust-quantity" label="Quantity"><input id="adjust-quantity" type="number" min="1" step="1" value={adjustment.quantity} onChange={updateAdjustment('quantity')} className={inputClass} /></ActionField><ActionField id="adjust-area" label="Area (sq.ft)"><input id="adjust-area" type="number" min="0.0001" step="0.0001" value={adjustment.areaSqFt} onChange={updateAdjustment('areaSqFt')} className={inputClass} /></ActionField></div> : <ActionField id="adjust-slab" label="Slab" required><select id="adjust-slab" required disabled={!adjustment.direction} value={adjustment.slabId} onChange={updateAdjustment('slabId')} className={inputClass}><option value="">{adjustment.direction ? 'Select one slab' : 'Select direction first'}</option>{adjustmentSlabs.map((slab) => <option key={slab._id} value={slab._id}>{slab.slabNumber} - {labelInventoryStatus(slab.status)}</option>)}</select>{adjustment.direction && adjustmentSlabs.length === 0 && <p className="mt-1 text-[11px] text-amber-700">No eligible slabs on this loaded page.</p>}</ActionField>}
                  <ActionField id="adjust-reason" label="Reason" required><textarea id="adjust-reason" required rows={3} maxLength={1000} value={adjustment.reason} onChange={updateAdjustment('reason')} className={`${inputClass} resize-y`} /></ActionField>
                  <button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white disabled:opacity-60">{busy === 'adjustment' ? <RefreshCw className="h-4 w-4 animate-spin" /> : adjustment.direction === 'IN' ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />} Record adjustment</button>
                </form>
              </Section>

              <Section icon={Truck} title="Transfer" description={mode === 'BATCH' ? 'Phase 5 supports whole-batch moves only.' : 'Transfer one selected slab per audited operation.'}>
                <form onSubmit={submitTransfer} className="space-y-3 py-4">
                  {mode === 'INDIVIDUAL_SLAB' && <ActionField id="transfer-slab" label="Slab" required><select id="transfer-slab" required value={transfer.slabId} onChange={updateTransfer('slabId')} className={inputClass}><option value="">Select one slab</option>{transferableSlabs.map((slab) => <option key={slab._id} value={slab._id}>{slab.slabNumber} - {formatInventoryLocation(slab.location)}</option>)}</select>{transferableSlabs.length === 0 && <p className="mt-1 text-[11px] text-amber-700">No transferable slabs on this loaded page.</p>}</ActionField>}
                  {locationFields(transfer, updateTransfer, 'transfer-location')}
                  <ActionField id="transfer-reason" label="Reason" required><textarea id="transfer-reason" required rows={3} maxLength={1000} value={transfer.reason} onChange={updateTransfer('reason')} className={`${inputClass} resize-y`} /></ActionField>
                  {mode === 'BATCH' && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><input type="checkbox" checked={transfer.confirmed} onChange={updateTransfer('confirmed')} className="mt-1" /><span>I confirm this moves the entire batch. Partial multi-location batch balances are not supported in Phase 5.</span></label>}
                  <button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-800 hover:bg-stone-50 disabled:opacity-60">{busy === 'transfer' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Record transfer</button>
                </form>
              </Section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
