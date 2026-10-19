import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Factory,
  Plus,
  RefreshCw,
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
import {
  batchAreaOnHand,
  batchInventoryMode,
  batchQuantityOnHand,
  batchStone,
  formatInventoryNumber,
  labelInventoryMode,
  parseInventoryResponse,
} from '../../lib/inventory';
import {
  compactProcessingObject,
  parseProcessingResponse,
  PROCESSING_OPERATIONS,
} from '../../lib/processing';

const inputClass = 'mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100 disabled:text-stone-500';
const SLAB_PAGE_SIZE = 50;

function Section({ step, title, description, children }) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex gap-3 border-b border-stone-100 px-5 py-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-stone-950 text-xs font-black text-white">{step}</span>
        <div><h2 className="text-sm font-black text-stone-950">{title}</h2><p className="mt-1 text-xs leading-5 text-stone-500">{description}</p></div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, required, hint, children }) {
  return <label className="block text-xs font-bold text-stone-700">{label}{required && <span className="text-rose-600"> *</span>}{children}{hint && <span className="mt-1 block text-[11px] font-normal leading-4 text-stone-500">{hint}</span>}</label>;
}

function optionalNumber(value) {
  if (String(value ?? '').trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function newOperation() {
  return { operation: '', machineLabel: '', plannedStart: '', plannedEnd: '', notes: '' };
}

export default function ProcessingJobFormPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [inventorySearch, setInventorySearch] = useState('');
  const [batches, setBatches] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [slabs, setSlabs] = useState([]);
  const [slabPage, setSlabPage] = useState(1);
  const [slabPages, setSlabPages] = useState(1);
  const [slabTotal, setSlabTotal] = useState(0);
  const [slabLoading, setSlabLoading] = useState(false);
  const [selectedSlabIds, setSelectedSlabIds] = useState([]);
  const [target, setTarget] = useState({ finish: '', thicknessMm: '', lengthMm: '', widthMm: '' });
  const [routing, setRouting] = useState([newOperation()]);
  const [expectedCompletionDate, setExpectedCompletionDate] = useState('');
  const [notes, setNotes] = useState('');
  const [existingJob, setExistingJob] = useState(null);
  const [editLoading, setEditLoading] = useState(Boolean(id));
  const [error, setError] = useState('');
  const [createdDraft, setCreatedDraft] = useState(null);
  const [submitting, setSubmitting] = useState('');

  const loadBatches = useCallback(async (search = '') => {
    setInventoryLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: '1', limit: '100', status: 'AVAILABLE' });
      if (search.trim()) params.set('search', search.trim());
      const response = await authFetch(`/api/admin/inventory/batches?${params.toString()}`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseInventoryResponse(response, 'Unable to load available inventory.');
      setBatches(Array.isArray(data.batches) ? data.batches : []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load available inventory.');
    } finally {
      setInventoryLoading(false);
    }
  }, [authFetch, logout, navigate]);

  useEffect(() => {
    if (!isEditing) loadBatches();
  }, [isEditing, loadBatches]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    async function loadExistingJob() {
      setEditLoading(true);
      setError('');
      try {
        const jobResponse = await authFetch(`/api/admin/processing/jobs/${id}`);
        if (jobResponse.status === 401) {
          logout();
          navigate('/admin/login', { replace: true });
          return;
        }
        const jobData = await parseProcessingResponse(jobResponse, 'Unable to load the processing plan.');
        const job = jobData.job;
        if (!['DRAFT', 'PLANNED'].includes(job.status)) {
          throw new Error('Only draft or planned jobs can be edited.');
        }
        const batchResponse = await authFetch(`/api/admin/inventory/batches/${job.input.batchId}`);
        if (batchResponse.status === 401) {
          logout();
          navigate('/admin/login', { replace: true });
          return;
        }
        const batchData = await parseInventoryResponse(batchResponse, 'Unable to load the source inventory.');
        if (!active) return;
        setExistingJob(job);
        setSelectedBatch(batchData.batch);
        setSelectedSlabIds((job.input?.slabIds || []).map(String));
        setTarget({
          finish: job.target?.finish || '',
          thicknessMm: job.target?.thicknessMm ?? '',
          lengthMm: job.target?.dimensions?.lengthMm ?? '',
          widthMm: job.target?.dimensions?.widthMm ?? '',
        });
        setRouting((job.routing || []).map((operation) => ({
          operation: operation.operation,
          machineLabel: operation.machineLabel || '',
          plannedStart: operation.plannedStart ? new Date(operation.plannedStart).toISOString().slice(0, 16) : '',
          plannedEnd: operation.plannedEnd ? new Date(operation.plannedEnd).toISOString().slice(0, 16) : '',
          notes: operation.notes || '',
        })));
        setExpectedCompletionDate(job.expectedCompletionDate ? new Date(job.expectedCompletionDate).toISOString().slice(0, 10) : '');
        setNotes(job.notes || '');
      } catch (requestError) {
        if (active) setError(requestError.message || 'Unable to load the processing plan.');
      } finally {
        if (active) setEditLoading(false);
      }
    }
    loadExistingJob();
    return () => { active = false; };
  }, [authFetch, id, logout, navigate]);

  const loadSlabs = useCallback(async () => {
    if (isEditing || !selectedBatch?._id || batchInventoryMode(selectedBatch) !== 'INDIVIDUAL_SLAB') return;
    setSlabLoading(true);
    try {
      const response = await authFetch(`/api/admin/inventory/batches/${selectedBatch._id}/slabs?page=${slabPage}&limit=${SLAB_PAGE_SIZE}&status=AVAILABLE`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseInventoryResponse(response, 'Unable to load available slabs.');
      setSlabs((data.slabs || []).filter((slab) => slab.status === 'AVAILABLE'));
      setSlabPages(Math.max(1, Number(data.pages) || 1));
      setSlabTotal(Number(data.total) || 0);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load available slabs.');
    } finally {
      setSlabLoading(false);
    }
  }, [authFetch, isEditing, logout, navigate, selectedBatch, slabPage]);

  useEffect(() => { loadSlabs(); }, [loadSlabs]);

  function chooseBatch(batch) {
    setSelectedBatch(batch);
    setSelectedSlabIds([]);
    setSlabPage(1);
    setSlabs([]);
    setError('');
  }

  function toggleSlab(slabId) {
    if (isEditing) return;
    setSelectedSlabIds((current) => current.includes(slabId)
      ? current.filter((id) => id !== slabId)
      : [...current, slabId]);
  }

  function updateOperation(index, field, value) {
    setRouting((current) => current.map((operation, operationIndex) => (
      operationIndex === index ? { ...operation, [field]: value } : operation
    )));
  }

  function moveOperation(index, direction) {
    setRouting((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  function validateForm() {
    if (!selectedBatch) return 'Select a real available inventory batch.';
    if (batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' && selectedSlabIds.length === 0) {
      return 'Select at least one available slab.';
    }
    const hasTarget = Object.values(target).some((value) => String(value).trim());
    if (!hasTarget) return 'Record at least one target outcome.';
    if (routing.length === 0 || routing.some((operation) => !operation.operation)) {
      return 'Every routing step must have an operation.';
    }
    for (const operation of routing) {
      if (operation.plannedStart && operation.plannedEnd && new Date(operation.plannedEnd) < new Date(operation.plannedStart)) {
        return 'An operation planned end cannot be before its planned start.';
      }
    }
    return '';
  }

  async function submitJob(planAfterCreate) {
    const message = validateForm();
    if (message) {
      setError(message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSubmitting(planAfterCreate ? 'planned' : 'draft');
    setError('');
    const dimensions = compactProcessingObject({
      lengthMm: optionalNumber(target.lengthMm),
      widthMm: optionalNumber(target.widthMm),
    });
    const createBody = {
      inventoryMode: batchInventoryMode(selectedBatch),
      input: compactProcessingObject({
        batchId: selectedBatch._id,
        slabIds: batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' ? selectedSlabIds : undefined,
      }),
      target: compactProcessingObject({
        finish: target.finish.trim() || undefined,
        thicknessMm: optionalNumber(target.thicknessMm),
        dimensions: Object.keys(dimensions).length ? dimensions : undefined,
      }),
      routing: routing.map((operation) => compactProcessingObject({
        operation: operation.operation,
        machineLabel: operation.machineLabel.trim() || undefined,
        plannedStart: operation.plannedStart || undefined,
        plannedEnd: operation.plannedEnd || undefined,
        notes: operation.notes.trim() || undefined,
      })),
      expectedCompletionDate: expectedCompletionDate || undefined,
      notes: notes.trim() || undefined,
    };
    const planningDefinitionLocked = isEditing && existingJob?.status === 'PLANNED';
    const updateBody = {
      ...(!planningDefinitionLocked ? {
        target: createBody.target,
        routing: createBody.routing,
      } : {}),
      expectedCompletionDate: createBody.expectedCompletionDate,
      notes: createBody.notes,
    };
    let persistedJob = null;

    try {
      const response = await authFetch(isEditing ? `/api/admin/processing/jobs/${id}` : '/api/admin/processing/jobs', {
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(isEditing ? updateBody : createBody),
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const created = await parseProcessingResponse(response, `Unable to ${isEditing ? 'update' : 'create'} processing job.`);
      let job = created.job;
      persistedJob = job;
      if (planAfterCreate && job.status === 'DRAFT') {
        const planResponse = await authFetch(`/api/admin/processing/jobs/${job._id}/plan`, {
          method: 'POST',
          body: JSON.stringify({}),
        });
        if (planResponse.status === 401) {
          logout();
          navigate('/admin/login', { replace: true });
          return;
        }
        const planned = await parseProcessingResponse(planResponse, 'The draft was created, but it could not be planned.');
        job = planned.job || job;
      }
      navigate(`/admin/processing/jobs/${job._id}`, { replace: true });
    } catch (requestError) {
      if (!isEditing && persistedJob) {
        setCreatedDraft(persistedJob);
        setError(`Draft ${persistedJob.jobNumber || ''} was created, but the requested planning action failed. Open the saved draft instead of creating it again. ${requestError.message || ''}`.trim());
      } else {
        setError(requestError.message || `Unable to ${isEditing ? 'update' : 'create'} processing job.`);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting('');
    }
  }

  const selectedSlabNumbers = useMemo(() => new Map(
    slabs.filter((slab) => selectedSlabIds.includes(slab._id)).map((slab) => [slab._id, slab.slabNumber]),
  ), [selectedSlabIds, slabs]);
  const planningDefinitionLocked = isEditing && existingJob?.status === 'PLANNED';

  if (editLoading && !existingJob) {
    return <AdminPage size="standard"><AdminLoadingState label="Loading processing plan" rows={4} /></AdminPage>;
  }

  return (
    <AdminPage size="standard" className="space-y-6">
      <Helmet><title>{isEditing ? `Edit ${existingJob?.jobNumber}` : 'New Processing Job'} | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <Link to={isEditing ? `/admin/processing/jobs/${id}` : '/admin/processing'} className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600 no-underline hover:text-stone-950"><ArrowLeft className="h-4 w-4" /> {isEditing ? existingJob?.jobNumber : 'Processing'}</Link>
      <AdminPageHeader
        eyebrow="Production planning"
        title={isEditing ? 'Edit processing plan' : 'Create processing job'}
        description={isEditing ? 'Update the target, ordered routing, schedule, and notes before production starts. Source genealogy cannot be replaced.' : 'Plan verified material and ordered operations. Creating or planning a job does not issue stock; that happens only when production starts.'}
      />

      {error && <AdminFeedback title="Processing plan could not be saved"><p>{error}</p>{createdDraft && <Link to={`/admin/processing/jobs/${createdDraft._id}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-rose-300 bg-white px-3 text-xs font-black text-rose-800 no-underline">Open saved draft</Link>}</AdminFeedback>}

      <Section step="1" title="Select real inventory" description="Only currently available inventory is offered. Batch-mode production uses the entire available balance.">
        {isEditing ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-mono text-xs font-black text-amber-900">{selectedBatch?.batchNumber}</p><p className="mt-1 text-sm font-black text-stone-950">{batchStone(selectedBatch).name}</p><p className="mt-2 text-xs leading-5 text-stone-600">Source inventory identity is fixed for genealogy. Cancel and recreate the job if the wrong material was selected.</p></div> : <>
        <form onSubmit={(event) => { event.preventDefault(); loadBatches(inventorySearch); }} className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1"><span className="sr-only">Search inventory</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} maxLength={120} placeholder="Search batch, stone or lot" className="w-full rounded-lg border border-stone-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /></label>
          <button type="submit" disabled={inventoryLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 text-xs font-black text-stone-700 disabled:opacity-50">{inventoryLoading && <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />} Search</button>
        </form>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{batches.map((batch) => { const selected = selectedBatch?._id === batch._id; return <button key={batch._id} type="button" onClick={() => chooseBatch(batch)} className={`rounded-xl border p-4 text-left transition ${selected ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-100' : 'border-stone-200 hover:border-stone-400'}`} aria-pressed={selected}><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-black text-amber-800">{batch.batchNumber}</p><p className="mt-1 text-sm font-black text-stone-950">{batchStone(batch).name}</p></div>{selected && <Check className="h-5 w-5 text-amber-700" />}</div><p className="mt-3 text-xs text-stone-600">{labelInventoryMode(batchInventoryMode(batch))} · {formatInventoryNumber(batchQuantityOnHand(batch), { maximumFractionDigits: 0 })} units · {batchAreaOnHand(batch) == null ? 'area not recorded' : `${formatInventoryNumber(batchAreaOnHand(batch))} sq.ft`}</p></button>; })}</div>
        {!inventoryLoading && batches.length === 0 && <p className="mt-5 rounded-lg bg-stone-50 p-5 text-center text-sm text-stone-500">No available inventory matches this search.</p>}
        </>}
      </Section>

      {selectedBatch && batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' && (
        <Section step="2" title="Choose individual slabs" description="Only selected available slabs enter this job. Selections are retained while moving between pages.">
          {isEditing ? <div className="rounded-lg bg-stone-50 p-4 text-sm text-stone-700"><p className="font-black">{existingJob?.input?.slabNumbers?.join(', ') || `${selectedSlabIds.length} selected slabs`}</p><p className="mt-2 text-xs leading-5 text-stone-500">Selected slab identity is fixed for this job.</p></div> : slabLoading ? <div className="py-10 text-center text-sm font-bold text-stone-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin motion-reduce:animate-none" />Loading slabs…</div> : <div className="grid gap-2 sm:grid-cols-2">{slabs.map((slab) => { const selected = selectedSlabIds.includes(String(slab._id)); return <label key={slab._id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${selected ? 'border-amber-400 bg-amber-50' : 'border-stone-200'}`}><input type="checkbox" checked={selected} onChange={() => toggleSlab(String(slab._id))} className="mt-1" /><span><span className="block font-mono text-xs font-black text-stone-900">{slab.slabNumber}</span><span className="mt-1 block text-[11px] text-stone-500">{formatInventoryNumber(slab.usableAreaSqFt ?? slab.grossAreaSqFt)} sq.ft available</span></span></label>; })}</div>}
          {!isEditing && (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-100 pt-4 text-xs text-stone-500"><span>{selectedSlabIds.length} selected · {slabTotal} total slab records</span><div className="flex gap-2"><button type="button" disabled={slabPage <= 1 || slabLoading} onClick={() => setSlabPage((page) => page - 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 disabled:opacity-40" aria-label="Previous slab page"><ChevronLeft className="h-4 w-4" /></button><span className="grid h-10 min-w-14 place-items-center">{slabPage}/{slabPages}</span><button type="button" disabled={slabPage >= slabPages || slabLoading} onClick={() => setSlabPage((page) => page + 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-stone-200 disabled:opacity-40" aria-label="Next slab page"><ChevronRight className="h-4 w-4" /></button></div></div>
          )}
        </Section>
      )}

      <Section step={selectedBatch && batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' ? '3' : '2'} title="Define target outcome" description={planningDefinitionLocked ? 'Target values are locked after planning. Cancel and recreate the job if the production definition is wrong.' : 'Record only intended, verified production targets. Blank fields remain unknown and will not overwrite inventory.'}>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Target finish"><input disabled={planningDefinitionLocked} value={target.finish} onChange={(event) => setTarget((current) => ({ ...current, finish: event.target.value }))} maxLength={120} placeholder="e.g. Honed" className={inputClass} /></Field><Field label="Target thickness (mm)"><input disabled={planningDefinitionLocked} type="number" min="0.01" step="0.01" value={target.thicknessMm} onChange={(event) => setTarget((current) => ({ ...current, thicknessMm: event.target.value }))} className={inputClass} /></Field><Field label="Target length (mm)" hint="Length and width must be supplied together."><input disabled={planningDefinitionLocked} type="number" min="0.01" step="0.01" value={target.lengthMm} onChange={(event) => setTarget((current) => ({ ...current, lengthMm: event.target.value }))} className={inputClass} /></Field><Field label="Target width (mm)"><input disabled={planningDefinitionLocked} type="number" min="0.01" step="0.01" value={target.widthMm} onChange={(event) => setTarget((current) => ({ ...current, widthMm: event.target.value }))} className={inputClass} /></Field></div>
      </Section>

      <Section step={selectedBatch && batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' ? '4' : '3'} title="Build processing route" description={planningDefinitionLocked ? 'The ordered route is locked after planning.' : 'Operations run in this exact order. Machine labels and timing are optional verified planning data.'}>
        <div className="space-y-3">{routing.map((operation, index) => <article key={index} className="rounded-xl border border-stone-200 bg-stone-50 p-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wide text-stone-600">Operation {index + 1}</p><div className="flex gap-1"><button type="button" onClick={() => moveOperation(index, -1)} disabled={planningDefinitionLocked || index === 0} className="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white disabled:opacity-30" aria-label={`Move operation ${index + 1} up`}><ArrowUp className="h-4 w-4" /></button><button type="button" onClick={() => moveOperation(index, 1)} disabled={planningDefinitionLocked || index === routing.length - 1} className="grid h-9 w-9 place-items-center rounded-lg border border-stone-200 bg-white disabled:opacity-30" aria-label={`Move operation ${index + 1} down`}><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => setRouting((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={planningDefinitionLocked || routing.length === 1} className="grid h-9 w-9 place-items-center rounded-lg border border-rose-200 bg-white text-rose-700 disabled:opacity-30" aria-label={`Remove operation ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div></div><div className="grid gap-3 sm:grid-cols-2"><Field label="Operation" required><select disabled={planningDefinitionLocked} required value={operation.operation} onChange={(event) => updateOperation(index, 'operation', event.target.value)} className={inputClass}><option value="">Select operation</option>{PROCESSING_OPERATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field label="Machine / workstation"><input disabled={planningDefinitionLocked} value={operation.machineLabel} onChange={(event) => updateOperation(index, 'machineLabel', event.target.value)} maxLength={120} className={inputClass} /></Field><Field label="Planned start"><input disabled={planningDefinitionLocked} type="datetime-local" value={operation.plannedStart} onChange={(event) => updateOperation(index, 'plannedStart', event.target.value)} className={inputClass} /></Field><Field label="Planned end"><input disabled={planningDefinitionLocked} type="datetime-local" value={operation.plannedEnd} onChange={(event) => updateOperation(index, 'plannedEnd', event.target.value)} className={inputClass} /></Field><div className="sm:col-span-2"><Field label="Operation notes"><textarea disabled={planningDefinitionLocked} rows={2} maxLength={1000} value={operation.notes} onChange={(event) => updateOperation(index, 'notes', event.target.value)} className={`${inputClass} resize-y`} /></Field></div></div></article>)}</div>
        {!planningDefinitionLocked && <button type="button" onClick={() => setRouting((current) => [...current, newOperation()])} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-700"><Plus className="h-4 w-4" /> Add operation</button>}
      </Section>

      <Section step={selectedBatch && batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' ? '5' : '4'} title="Schedule and notes" description="No duration is inferred. Add an expected completion only when operations have supplied one.">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Expected completion"><input type="date" value={expectedCompletionDate} onChange={(event) => setExpectedCompletionDate(event.target.value)} className={inputClass} /></Field><div className="sm:col-span-2"><Field label="Production notes"><textarea rows={4} maxLength={3000} value={notes} onChange={(event) => setNotes(event.target.value)} className={`${inputClass} resize-y`} /></Field></div></div>
      </Section>

      <Section step={selectedBatch && batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' ? '6' : '5'} title="Review and create" description="Review source and routing. Stock stays available until the separate Start production action is confirmed.">
        <dl className="grid gap-4 rounded-lg bg-stone-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-[10px] font-black uppercase text-stone-400">Source</dt><dd className="mt-1 font-black text-stone-900">{selectedBatch ? `${selectedBatch.batchNumber} · ${batchStone(selectedBatch).name}` : 'Not selected'}</dd></div><div><dt className="text-[10px] font-black uppercase text-stone-400">Material</dt><dd className="mt-1 font-black text-stone-900">{selectedBatch && batchInventoryMode(selectedBatch) === 'INDIVIDUAL_SLAB' ? `${selectedSlabIds.length} selected slabs` : selectedBatch ? 'Entire available batch balance' : 'Not selected'}</dd></div><div><dt className="text-[10px] font-black uppercase text-stone-400">Route</dt><dd className="mt-1 font-black text-stone-900">{routing.filter((item) => item.operation).map((item) => PROCESSING_OPERATIONS.find((known) => known.value === item.operation)?.label).join(' → ') || 'Not defined'}</dd></div><div><dt className="text-[10px] font-black uppercase text-stone-400">Target</dt><dd className="mt-1 font-black text-stone-900">{[target.finish, target.thicknessMm && `${target.thicknessMm} mm`].filter(Boolean).join(' · ') || 'Not defined'}</dd></div></dl>
        {selectedSlabNumbers.size > 0 && <p className="mt-3 text-xs text-stone-500">Visible selected slabs: {[...selectedSlabNumbers.values()].join(', ')}{selectedSlabIds.length > selectedSlabNumbers.size ? ' plus selections from other pages' : ''}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => submitJob(false)} disabled={Boolean(submitting) || Boolean(createdDraft)} className="min-h-11 rounded-lg border border-stone-300 bg-white px-5 text-xs font-black text-stone-700 disabled:opacity-50">{submitting === 'draft' ? 'Saving…' : isEditing ? 'Save changes' : 'Save as draft'}</button>{(!isEditing || existingJob?.status === 'DRAFT') && <button type="button" onClick={() => submitJob(true)} disabled={Boolean(submitting) || Boolean(createdDraft)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white disabled:opacity-50">{submitting === 'planned' ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Factory className="h-4 w-4" />} {isEditing ? 'Save and plan' : 'Create and plan'}</button>}</div>
      </Section>
    </AdminPage>
  );
}
