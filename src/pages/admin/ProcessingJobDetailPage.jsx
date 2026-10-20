import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CircleStop,
  ClipboardCheck,
  Clock3,
  Factory,
  Gauge,
  History,
  Layers3,
  Link2,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Ruler,
  Save,
  ShieldCheck,
  SquareStack,
} from 'lucide-react';
import {
  AdminFeedback,
  AdminLoadingState,
  AdminPage,
} from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import {
  formatInventoryLocation,
  labelInventoryMode,
  labelMovementType,
} from '../../lib/inventory';
import {
  currentProcessingOperation,
  formatProcessingDate,
  formatProcessingNumber,
  labelOperationStatus,
  labelProcessingEvent,
  labelProcessingOperation,
  labelProcessingStatus,
  labelQcResult,
  parseProcessingResponse,
  processingProgress,
  PROCESSING_STATUS_STYLES,
} from '../../lib/processing';

const inputClass = 'mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100';

function Section({ icon: _Icon, title, description, children, action }) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-5 py-4">
        <div className="flex min-w-0 gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-700"><_Icon className="h-4 w-4" /></span><div><h2 className="text-sm font-black text-stone-950">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-stone-500">{description}</p>}</div></div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InfoRow({ label, value, mono = false }) {
  return <div className="grid gap-1 border-b border-stone-100 py-3 last:border-0 sm:grid-cols-[10rem_1fr]"><dt className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</dt><dd className={`text-sm font-semibold text-stone-900 ${mono ? 'font-mono' : ''}`}>{value ?? 'Not recorded'}</dd></div>;
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${PROCESSING_STATUS_STYLES[status] || PROCESSING_STATUS_STYLES.DRAFT}`}>{labelProcessingStatus(status)}</span>;
}

function Field({ label, required, children, hint }) {
  return <label className="block text-xs font-bold text-stone-700">{label}{required && <span className="text-rose-600"> *</span>}{children}{hint && <span className="mt-1 block text-[11px] font-normal text-stone-500">{hint}</span>}</label>;
}

function dimensionsLabel(dimensions) {
  if (!dimensions?.lengthMm || !dimensions?.widthMm) return 'Not recorded';
  return `${formatProcessingNumber(dimensions.lengthMm)} × ${formatProcessingNumber(dimensions.widthMm)}${dimensions.thicknessMm ? ` × ${formatProcessingNumber(dimensions.thicknessMm)}` : ''} mm`;
}

function optionalNumber(value) {
  if (String(value ?? '').trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function qcFormState(job) {
  const qualityCheck = job?.qualityCheck || {};
  const output = qualityCheck.verifiedOutput || job?.output || {};
  const slabOutputs = Object.fromEntries((output.slabOutputs || []).map((slab) => [
    String(slab.slabId?._id || slab.slabId),
    {
      usableAreaSqFt: slab.usableAreaSqFt ?? '',
      lengthMm: slab.dimensions?.lengthMm ?? '',
      widthMm: slab.dimensions?.widthMm ?? '',
    },
  ]));

  return {
    result: qualityCheck.result || 'HOLD',
    notes: qualityCheck.notes || '',
    observations: qualityCheck.observations || '',
    quantity: output.quantity ?? '',
    areaSqFt: output.areaSqFt ?? '',
    finish: output.finish || '',
    thicknessMm: output.thicknessMm ?? '',
    lengthMm: output.dimensions?.lengthMm ?? '',
    widthMm: output.dimensions?.widthMm ?? '',
    slabOutputs,
  };
}

function EventDetails({ details }) {
  if (!details) return null;
  const values = [];
  if (details.fromStatus && details.toStatus) {
    values.push(`Status: ${labelProcessingStatus(details.fromStatus)} → ${labelProcessingStatus(details.toStatus)}`);
  } else if (details.toStatus) {
    values.push(`Status set to ${labelProcessingStatus(details.toStatus)}`);
  } else if (details.fromStatus) {
    values.push(`Previous status: ${labelProcessingStatus(details.fromStatus)}`);
  }
  if (details.operation) {
    values.push(`${details.sequence ? `Step ${details.sequence}: ` : ''}${labelProcessingOperation(details.operation)}`);
  }
  if (details.qcResult) values.push(`QC: ${labelQcResult(details.qcResult)}`);
  if (details.quantity != null) values.push(`Quantity: ${formatProcessingNumber(details.quantity, 0)}`);
  if (details.areaSqFt != null) values.push(`Area: ${formatProcessingNumber(details.areaSqFt)} sq.ft`);
  if (details.progressPercent != null) values.push(`Progress: ${formatProcessingNumber(details.progressPercent, 0)}%`);
  if (details.verifiedOutput?.finish) values.push(`Verified finish: ${details.verifiedOutput.finish}`);
  if (details.verifiedOutput?.thicknessMm != null) {
    values.push(`Verified thickness: ${formatProcessingNumber(details.verifiedOutput.thicknessMm)} mm`);
  }
  if (details.verifiedOutput?.slabOutputs?.length) {
    values.push(`Verified slabs: ${formatProcessingNumber(details.verifiedOutput.slabOutputs.length, 0)}`);
  }
  if (!values.length && !details.observations) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {values.map((value) => <span key={value} className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[11px] font-semibold text-stone-600">{value}</span>)}
      {details.observations && (
        <p className='w-full whitespace-pre-wrap rounded-md border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-600'>
          <span className='font-bold text-stone-800'>Observations:</span> {details.observations}
        </p>
      )}
    </div>
  );
}

function signedMovementValue(value, suffix = '') {
  if (value == null) return 'Not recorded';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not recorded';
  return `${number > 0 ? '+' : ''}${formatProcessingNumber(number)}${suffix}`;
}

function DetailSkeleton() {
  return <AdminPage><AdminLoadingState label="Loading processing job" rows={5} /></AdminPage>;
}

export default function ProcessingJobDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventPage, setEventPage] = useState(1);
  const [eventPages, setEventPages] = useState(1);
  const [movements, setMovements] = useState([]);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPages, setMovementPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [operationAction, setOperationAction] = useState({ machineLabel: '', notes: '' });
  const [productionNote, setProductionNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [qc, setQc] = useState(() => qcFormState(null));

  const loadJob = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [jobResponse, eventResponse, movementResponse] = await Promise.all([
        authFetch(`/api/admin/processing/jobs/${id}`),
        authFetch(`/api/admin/processing/jobs/${id}/events?page=${eventPage}&limit=50`),
        authFetch(`/api/admin/processing/jobs/${id}/movements?page=${movementPage}&limit=20`),
      ]);
      if (jobResponse.status === 401 || eventResponse.status === 401 || movementResponse.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const [jobData, eventData, movementData] = await Promise.all([
        parseProcessingResponse(jobResponse, 'Unable to load processing job.'),
        parseProcessingResponse(eventResponse, 'Unable to load processing history.'),
        parseProcessingResponse(movementResponse, 'Unable to load inventory genealogy.'),
      ]);
      setJob(jobData.job);
      setQc(qcFormState(jobData.job));
      setEvents(Array.isArray(eventData.events) ? eventData.events : []);
      setEventPages(Math.max(1, Number(eventData.pages) || 1));
      setMovements(Array.isArray(movementData.movements) ? movementData.movements : []);
      setMovementPages(Math.max(1, Number(movementData.pages) || 1));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load processing job.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, eventPage, id, logout, movementPage, navigate]);

  useEffect(() => { loadJob(); }, [loadJob]);

  const performAction = useCallback(async (key, path, body = {}, confirmation = '') => {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(key);
    setError('');
    try {
      const response = await authFetch(`/api/admin/processing/jobs/${id}${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      await parseProcessingResponse(response, 'The production action could not be completed.');
      if (key === 'note') setProductionNote('');
      if (key.startsWith('operation-')) setOperationAction({ machineLabel: '', notes: '' });
      setEventPage(1);
      setMovementPage(1);
      await loadJob();
    } catch (requestError) {
      setError(requestError.message || 'The production action could not be completed.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy('');
    }
  }, [authFetch, id, loadJob, logout, navigate]);

  const current = currentProcessingOperation(job);
  const progress = processingProgress(job);
  const slabSnapshots = useMemo(() => job?.input?.slabSnapshots || [], [job]);
  const verifiedOutput = useMemo(
    () => job?.output || job?.qualityCheck?.verifiedOutput,
    [job],
  );
  const verifiedSlabOutputs = useMemo(() => verifiedOutput?.slabOutputs || [], [verifiedOutput]);
  const slabSnapshotById = useMemo(() => new Map(
    slabSnapshots.map((slab) => [String(slab.slabId?._id || slab.slabId), slab]),
  ), [slabSnapshots]);

  function toggleReturnedSlab(slab) {
    setQc((currentQc) => {
      const next = { ...currentQc.slabOutputs };
      if (next[slab.slabId]) delete next[slab.slabId];
      else next[slab.slabId] = { usableAreaSqFt: '', lengthMm: '', widthMm: '' };
      return { ...currentQc, slabOutputs: next };
    });
  }

  function updateSlabOutput(slabId, field, value) {
    setQc((currentQc) => ({
      ...currentQc,
      slabOutputs: {
        ...currentQc.slabOutputs,
        [slabId]: { ...currentQc.slabOutputs[slabId], [field]: value },
      },
    }));
  }

  async function submitQc(event) {
    event.preventDefault();
    const payload = {
      result: qc.result,
      notes: qc.notes.trim() || undefined,
      observations: qc.observations.trim() || undefined,
    };
    if (qc.result === 'PASS') {
      const commonDimensions = { lengthMm: optionalNumber(qc.lengthMm), widthMm: optionalNumber(qc.widthMm) };
      const slabOutputs = Object.entries(qc.slabOutputs).map(([slabId, output]) => {
        const dimensions = { lengthMm: optionalNumber(output.lengthMm), widthMm: optionalNumber(output.widthMm) };
        return {
          slabId,
          usableAreaSqFt: optionalNumber(output.usableAreaSqFt),
          ...(dimensions.lengthMm || dimensions.widthMm ? { dimensions } : {}),
        };
      });
      const quantity = job.inventoryMode === 'INDIVIDUAL_SLAB' ? slabOutputs.length : optionalNumber(qc.quantity);
      const areaSqFt = job.inventoryMode === 'INDIVIDUAL_SLAB'
        ? slabOutputs.reduce((sum, output) => sum + Number(output.usableAreaSqFt || 0), 0)
        : optionalNumber(qc.areaSqFt);
      payload.verifiedOutput = {
        quantity,
        areaSqFt,
        finish: qc.finish.trim() || undefined,
        thicknessMm: optionalNumber(qc.thicknessMm),
        ...(commonDimensions.lengthMm || commonDimensions.widthMm ? { dimensions: commonDimensions } : {}),
        ...(job.inventoryMode === 'INDIVIDUAL_SLAB' ? { slabOutputs } : {}),
      };
    }
    await performAction('qc', '/qc', payload);
  }

  if (loading && !job) return <DetailSkeleton />;
  if (error && !job) return <AdminPage size="standard"><AdminFeedback title="Processing job unavailable" onRetry={loadJob}><p>{error}</p><Link to="/admin/processing" className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-rose-300 bg-white px-4 text-xs font-bold text-rose-800 no-underline">Back to processing</Link></AdminFeedback></AdminPage>;
  if (!job) return null;

  return (
    <AdminPage className="space-y-6">
      <Helmet><title>{job.jobNumber} | Processing Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><Link to="/admin/processing" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600 no-underline"><ArrowLeft className="h-4 w-4" /> Processing</Link><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="font-mono text-2xl font-black text-stone-950 sm:text-3xl">{job.jobNumber}</h1><StatusBadge status={job.status} /></div><p className="mt-1 text-sm text-stone-600">{job.stoneSnapshot?.name || 'Stone not recorded'} · {labelInventoryMode(job.inventoryMode)}</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={loadJob} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} /> Refresh</button>{['DRAFT', 'PLANNED'].includes(job.status) && <Link to={`/admin/processing/jobs/${job._id}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-700 no-underline"><Pencil className="h-4 w-4" /> Edit plan</Link>}</div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></div>}

      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-label="Production progress">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Processing progress</p><p className="mt-1 text-2xl font-black text-stone-950">{progress}%</p><p className="mt-1 text-xs text-stone-500">QC is a separate gate and is not included in operation progress.</p></div><div className="w-full max-w-2xl"><div className="h-3 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="Processing operations completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-amber-600" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-right text-xs font-bold text-stone-600">{current ? `Current: ${labelProcessingOperation(current.operation)}` : job.status === 'COMPLETED' ? 'Production complete' : 'No active operation'}</p></div></div>
      </section>

      {job.sourceSalesOrder?.salesOrderId && (
        <Section icon={Link2} title="Sales Order commitment" description="This job is linked to a specific Sales Order line for traceability. Linkage alone does not issue or consume reserved stock.">
          <dl>
            <InfoRow label="Sales Order" value={<Link to={`/admin/sales-orders/${job.sourceSalesOrder.salesOrderId}`} className="font-mono text-amber-800">{job.sourceSalesOrder.salesOrderNumber || String(job.sourceSalesOrder.salesOrderId)}</Link>} mono />
            <InfoRow label="Sales Order line" value={String(job.sourceSalesOrder.salesOrderLineItemId || 'Not recorded')} mono />
          </dl>
        </Section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={ShieldCheck} title="Job identity" description="Immutable production and source traceability."><dl><InfoRow label="Job number" value={job.jobNumber} mono /><InfoRow label="Stone" value={job.stoneSnapshot?.name} /><InfoRow label="Catalog slug" value={job.stoneSnapshot?.slug} /><InfoRow label="Inventory mode" value={labelInventoryMode(job.inventoryMode)} /><InfoRow label="Created" value={formatProcessingDate(job.createdAt, { includeTime: true })} /></dl></Section>
        <Section icon={Layers3} title="Material input" description={job.startedAt ? 'Verified snapshot captured when material was issued.' : 'Planning snapshot; availability is revalidated when production starts.'}><dl><InfoRow label="Source batch" value={<Link to={`/admin/inventory/batches/${job.input?.batchId}`} className="text-amber-800">{job.input?.batchNumber}</Link>} /><InfoRow label="Selected slabs" value={job.input?.slabNumbers?.length ? job.input.slabNumbers.join(', ') : job.inventoryMode === 'BATCH' ? 'Entire available batch balance' : 'Not recorded'} /><InfoRow label="Input quantity" value={formatProcessingNumber(job.input?.quantity, 0)} /><InfoRow label="Input area" value={job.input?.areaSqFt == null ? 'Not recorded' : `${formatProcessingNumber(job.input.areaSqFt)} sq.ft`} /><InfoRow label="Input finish" value={job.input?.finish || 'Not recorded'} /><InfoRow label="Input thickness" value={job.input?.thicknessMm ? `${formatProcessingNumber(job.input.thicknessMm)} mm` : 'Not recorded'} /><InfoRow label="Issued" value={formatProcessingDate(job.input?.issuedAt, { includeTime: true })} /></dl></Section>
        <Section icon={Ruler} title="Target outcome" description="Only explicitly planned target values."><dl><InfoRow label="Finish" value={job.target?.finish || 'Not recorded'} /><InfoRow label="Thickness" value={job.target?.thicknessMm ? `${formatProcessingNumber(job.target.thicknessMm)} mm` : 'Not recorded'} /><InfoRow label="Dimensions" value={dimensionsLabel(job.target?.dimensions)} /></dl></Section>
        <Section icon={Clock3} title="Schedule" description="No duration is inferred from operation type."><dl><InfoRow label="Started" value={formatProcessingDate(job.startedAt, { includeTime: true })} /><InfoRow label="Expected completion" value={formatProcessingDate(job.expectedCompletionDate)} /><InfoRow label="Completed" value={formatProcessingDate(job.completedAt, { includeTime: true })} /><InfoRow label="Last updated" value={formatProcessingDate(job.updatedAt, { includeTime: true })} /></dl></Section>
      </div>

      <Section icon={Factory} title="Ordered processing route" description="The backend enforces this sequence; future steps cannot be completed early.">
        <ol className="space-y-3">{job.routing?.map((operation, index) => { const active = current?.operationId === operation._id || current?._id === operation._id; return <li key={operation._id} className={`rounded-xl border p-4 ${active ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-stone-50'}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="flex gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${operation.status === 'COMPLETED' ? 'bg-emerald-600 text-white' : active ? 'bg-amber-500 text-stone-950' : 'bg-stone-200 text-stone-700'}`}>{operation.sequence || index + 1}</span><div><h3 className="text-sm font-black text-stone-950">{labelProcessingOperation(operation.operation)}</h3><p className="mt-1 text-xs font-bold text-stone-500">{labelOperationStatus(operation.status)}{operation.machineLabel ? ` · ${operation.machineLabel}` : ''}</p></div></div><div className="text-xs text-stone-500 sm:text-right"><p>Started: {formatProcessingDate(operation.actualStart, { includeTime: true })}</p><p className="mt-1">Completed: {formatProcessingDate(operation.actualEnd, { includeTime: true })}</p></div></div>{operation.notes && <p className="mt-3 whitespace-pre-wrap border-t border-stone-200 pt-3 text-xs leading-5 text-stone-600">{operation.notes}</p>}</li>; })}</ol>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={ClipboardCheck} title="Quality control" description="Operations finishing does not return material. QC PASS is required first."><dl><InfoRow label="Result" value={labelQcResult(job.qualityCheck?.result)} /><InfoRow label="Checked" value={formatProcessingDate(job.qualityCheck?.checkedAt, { includeTime: true })} /><InfoRow label="Notes" value={job.qualityCheck?.notes || 'Not recorded'} /><InfoRow label="Observations" value={job.qualityCheck?.observations || 'Not recorded'} /></dl></Section>
        <Section icon={Gauge} title="Verified output and yield" description="Calculated only from recorded input and verified returned material.">
          <dl>
            <InfoRow label="Output quantity" value={formatProcessingNumber(verifiedOutput?.quantity, 0)} />
            <InfoRow label="Output area" value={verifiedOutput?.areaSqFt == null ? 'Not recorded' : `${formatProcessingNumber(verifiedOutput.areaSqFt)} sq.ft`} />
            <InfoRow label="Verified finish" value={verifiedOutput?.finish || 'Not recorded'} />
            <InfoRow label="Verified thickness" value={verifiedOutput?.thicknessMm == null ? 'Not recorded' : `${formatProcessingNumber(verifiedOutput.thicknessMm)} mm`} />
            <InfoRow label="Verified dimensions" value={dimensionsLabel(verifiedOutput?.dimensions)} />
            <InfoRow label="Waste quantity" value={formatProcessingNumber(job.waste?.quantity, 0)} />
            <InfoRow label="Waste area" value={job.waste?.areaSqFt == null ? 'Not recorded' : `${formatProcessingNumber(job.waste.areaSqFt)} sq.ft`} />
            <InfoRow label="Yield" value={job.yieldPercent == null ? 'Not recorded' : `${formatProcessingNumber(job.yieldPercent)}% by ${(job.yieldBasis || '').toLowerCase()}`} />
          </dl>
        </Section>
      </div>

      {job.input?.slabSnapshots?.length > 0 && <Section icon={SquareStack} title="Selected slab genealogy" description="Source slab measurements and location captured for this job."><div className="grid gap-3 md:grid-cols-2">{job.input.slabSnapshots.map((slab) => <article key={slab.slabId} className="rounded-lg border border-stone-200 bg-stone-50 p-4"><p className="font-mono text-xs font-black text-stone-900">{slab.slabNumber}</p><p className="mt-2 text-xs text-stone-600">{dimensionsLabel(slab.dimensions)}</p><p className="mt-1 text-xs text-stone-600">{formatProcessingNumber(slab.inventoryAreaSqFt)} sq.ft input</p><p className="mt-1 text-xs text-stone-500">{formatInventoryLocation(slab.location)}</p></article>)}</div></Section>}

      {verifiedSlabOutputs.length > 0 && (
        <Section icon={SquareStack} title="Verified slab output genealogy" description="Only slabs explicitly accepted by QC are shown as returned output.">
          <div className="grid gap-3 md:grid-cols-2">
            {verifiedSlabOutputs.map((output) => {
              const slabId = String(output.slabId?._id || output.slabId);
              const source = slabSnapshotById.get(slabId);
              return (
                <article key={slabId} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                  <p className="font-mono text-xs font-black text-stone-900">{output.slabNumber || source?.slabNumber || slabId}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">QC-verified return</p>
                  <dl className="mt-3 space-y-1 text-xs text-stone-600">
                    <div className="flex justify-between gap-3"><dt>Usable area</dt><dd className="font-bold text-stone-900">{formatProcessingNumber(output.usableAreaSqFt)} sq.ft</dd></div>
                    <div className="flex justify-between gap-3"><dt>Output dimensions</dt><dd className="text-right font-bold text-stone-900">{dimensionsLabel(output.dimensions)}</dd></div>
                    {source && <div className="flex justify-between gap-3"><dt>Source area</dt><dd className="font-bold text-stone-900">{formatProcessingNumber(source.inventoryAreaSqFt)} sq.ft</dd></div>}
                  </dl>
                </article>
              );
            })}
          </div>
        </Section>
      )}

      <Section icon={Link2} title="Inventory genealogy ledger" description="Stock issue and return records linked to this processing job by the inventory ledger.">
        {movements.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-500">No processing inventory movement has been recorded. Draft and planned jobs do not issue stock.</p>
        ) : (
          <ol className="space-y-3">
            {movements.map((movement) => {
              const batchId = movement.batch?._id || movement.batch;
              const batchNumber = movement.batch?.batchNumber;
              const slabNumber = movement.slab?.slabNumber;
              return (
                <li key={movement._id} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-stone-800">{labelMovementType(movement.type)}</p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                        {batchId && <Link to={`/admin/inventory/batches/${batchId}`} className="font-mono font-bold text-amber-800">{batchNumber || String(batchId)}</Link>}
                        {slabNumber && <span className="font-mono">Slab {slabNumber}</span>}
                      </div>
                    </div>
                    <time className="text-xs text-stone-500">{formatProcessingDate(movement.occurredAt || movement.createdAt, { includeTime: true })}</time>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-600">
                    <span>Quantity: <strong className="text-stone-900">{signedMovementValue(movement.quantityDelta)}</strong></span>
                    <span>Area: <strong className="text-stone-900">{signedMovementValue(movement.areaDeltaSqFt, ' sq.ft')}</strong></span>
                  </div>
                  {movement.reason && <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-stone-600">{movement.reason}</p>}
                </li>
              );
            })}
          </ol>
        )}
        {movementPages > 1 && (
          <nav aria-label="Inventory genealogy pagination" className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4 text-xs text-stone-500">
            <span>Page {movementPage} of {movementPages}</span>
            <div className="flex gap-2">
              <button type="button" disabled={movementPage <= 1 || loading} onClick={() => setMovementPage((page) => page - 1)} className="min-h-10 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40">Previous</button>
              <button type="button" disabled={movementPage >= movementPages || loading} onClick={() => setMovementPage((page) => page + 1)} className="min-h-10 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40">Next</button>
            </div>
          </nav>
        )}
      </Section>

      {job.notes && <Section icon={CircleStop} title="Production notes"><p className="whitespace-pre-wrap text-sm leading-6 text-stone-700">{job.notes}</p></Section>}

      {!['COMPLETED', 'CANCELLED'].includes(job.status) && (
        <Section icon={Play} title="Valid actions" description="Only transitions valid for the current server state are shown.">
          <div className="space-y-5">
            {job.status === 'DRAFT' && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('plan', '/plan')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white disabled:opacity-50">{busy === 'plan' ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />} Mark job planned</button>}
            {job.status === 'PLANNED' && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('start', '/start', {}, 'Start production and issue this material out of available inventory? This cannot be casually cancelled afterward.')} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-500 px-5 text-xs font-black text-stone-950 disabled:opacity-50">{busy === 'start' ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Play className="h-4 w-4" />} Start production</button>}
            {job.status === 'IN_PROGRESS' && current && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="text-sm font-black text-stone-950">Current operation: {labelProcessingOperation(current.operation)}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Machine / workstation"><input maxLength={160} value={operationAction.machineLabel} onChange={(event) => setOperationAction((value) => ({ ...value, machineLabel: event.target.value }))} className={inputClass} /></Field><Field label="Operation note"><textarea rows={2} maxLength={2000} value={operationAction.notes} onChange={(event) => setOperationAction((value) => ({ ...value, notes: event.target.value }))} className={`${inputClass} resize-y`} /></Field></div><button type="button" disabled={Boolean(busy)} onClick={() => performAction(current.status === 'PENDING' ? 'operation-start' : 'operation-complete', `/operations/${current.operationId || current._id}/${current.status === 'PENDING' ? 'start' : 'complete'}`, { machineLabel: operationAction.machineLabel.trim() || undefined, notes: operationAction.notes.trim() || undefined })} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white disabled:opacity-50">{busy.startsWith('operation') ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : current.status === 'PENDING' ? <Play className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{current.status === 'PENDING' ? 'Start current operation' : 'Complete current operation'}</button></div>}
            {job.status === 'QC_PENDING' && <form onSubmit={submitQc} className="rounded-xl border border-violet-200 bg-violet-50 p-4"><h3 className="text-sm font-black text-stone-950">{job.qualityCheck ? 'Revise quality decision' : 'Record quality decision'}</h3>{job.qualityCheck && <p className="mt-1 text-xs leading-5 text-violet-900">This form is populated from the latest saved QC decision. Saving a revision updates the active decision and records another immutable timeline event.</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="QC result" required><select required value={qc.result} onChange={(event) => setQc((value) => ({ ...value, result: event.target.value }))} className={inputClass}><option value="PASS">Pass — eligible for return</option><option value="HOLD">Hold — remains unavailable</option><option value="FAIL">Fail — remains unavailable</option></select></Field><Field label="QC notes"><textarea rows={2} maxLength={3000} value={qc.notes} onChange={(event) => setQc((value) => ({ ...value, notes: event.target.value }))} className={`${inputClass} resize-y`} /></Field><div className="sm:col-span-2"><Field label="QC observations"><textarea rows={2} maxLength={3000} value={qc.observations} onChange={(event) => setQc((value) => ({ ...value, observations: event.target.value }))} className={`${inputClass} resize-y`} /></Field></div></div>{qc.result === 'PASS' && <div className="mt-4 border-t border-violet-200 pt-4"><p className="mb-3 text-xs leading-5 text-violet-900">Enter actual verified return values. Values are not copied from the target automatically.</p>{job.inventoryMode === 'BATCH' ? <div className="grid gap-3 sm:grid-cols-2"><Field label="Verified output quantity" required><input required type="number" min="0" step="1" value={qc.quantity} onChange={(event) => setQc((value) => ({ ...value, quantity: event.target.value }))} className={inputClass} /></Field><Field label="Verified output area (sq.ft)" required={job.input?.areaSqFt != null}><input required={job.input?.areaSqFt != null} type="number" min="0" step="0.0001" value={qc.areaSqFt} onChange={(event) => setQc((value) => ({ ...value, areaSqFt: event.target.value }))} className={inputClass} /></Field></div> : <div className="space-y-2"><p className="text-xs font-black text-stone-700">Select slabs physically returning to ready stock and verify each usable area.</p>{slabSnapshots.map((slab) => { const selected = Boolean(qc.slabOutputs[slab.slabId]); const output = qc.slabOutputs[slab.slabId] || {}; return <article key={slab.slabId} className={`rounded-lg border p-3 ${selected ? 'border-violet-400 bg-white' : 'border-violet-200 bg-violet-50'}`}><label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={selected} onChange={() => toggleReturnedSlab(slab)} /><span className="font-mono text-xs font-black">{slab.slabNumber}</span></label>{selected && <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Usable area" required><input required type="number" min="0.0001" step="0.0001" value={output.usableAreaSqFt} onChange={(event) => updateSlabOutput(slab.slabId, 'usableAreaSqFt', event.target.value)} className={inputClass} /></Field><Field label="Length (mm)"><input type="number" min="0.01" step="0.01" value={output.lengthMm} onChange={(event) => updateSlabOutput(slab.slabId, 'lengthMm', event.target.value)} className={inputClass} /></Field><Field label="Width (mm)"><input type="number" min="0.01" step="0.01" value={output.widthMm} onChange={(event) => updateSlabOutput(slab.slabId, 'widthMm', event.target.value)} className={inputClass} /></Field></div>}</article>; })}</div>}<div className={`mt-4 grid gap-3 sm:grid-cols-2 ${job.inventoryMode === 'BATCH' ? 'lg:grid-cols-4' : ''}`}><Field label="Verified finish"><input maxLength={120} value={qc.finish} onChange={(event) => setQc((value) => ({ ...value, finish: event.target.value }))} className={inputClass} /></Field><Field label="Verified thickness"><input type="number" min="0.01" step="0.01" value={qc.thicknessMm} onChange={(event) => setQc((value) => ({ ...value, thicknessMm: event.target.value }))} className={inputClass} /></Field>{job.inventoryMode === 'BATCH' && <><Field label="Verified length"><input type="number" min="0.01" step="0.01" value={qc.lengthMm} onChange={(event) => setQc((value) => ({ ...value, lengthMm: event.target.value }))} className={inputClass} /></Field><Field label="Verified width"><input type="number" min="0.01" step="0.01" value={qc.widthMm} onChange={(event) => setQc((value) => ({ ...value, widthMm: event.target.value }))} className={inputClass} /></Field></>}</div></div>}<div className="mt-4 flex flex-col gap-2 sm:flex-row"><button type="submit" disabled={Boolean(busy)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-900 px-5 text-xs font-black text-white disabled:opacity-50">{busy === 'qc' ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <ClipboardCheck className="h-4 w-4" />} {job.qualityCheck ? 'Save QC revision' : 'Record QC'}</button>{job.qualityCheck?.result === 'PASS' && <button type="button" disabled={Boolean(busy)} onClick={() => performAction('complete', '/complete', {}, 'Complete this job and return only the QC-verified output to available inventory?')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-5 text-xs font-black text-white disabled:opacity-50">{busy === 'complete' ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RotateCcw className="h-4 w-4" />} Complete and return inventory</button>}</div></form>}
            {['DRAFT', 'PLANNED'].includes(job.status) && <form onSubmit={(event) => { event.preventDefault(); performAction('cancel', '/cancel', { reason: cancelReason.trim() }); }} className="border-t border-stone-200 pt-5"><h3 className="text-sm font-black text-stone-900">Cancel pre-production job</h3><p className="mt-1 text-xs text-stone-500">Cancellation is unavailable after inventory has been issued.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><label className="flex-1"><span className="sr-only">Cancellation reason</span><input required maxLength={1000} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Required cancellation reason" className="w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm" /></label><button type="submit" disabled={Boolean(busy) || !cancelReason.trim()} className="min-h-11 rounded-lg border border-rose-300 px-4 text-xs font-black text-rose-700 disabled:opacity-50">Cancel job</button></div></form>}
          </div>
        </Section>
      )}

      <Section icon={History} title="Add operational note" description="Adds an immutable timeline entry without changing job, QC, or inventory state.">
        <form onSubmit={(event) => { event.preventDefault(); performAction('note', '/notes', { note: productionNote.trim() }); }} className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1"><span className="sr-only">Operational timeline note</span><textarea required rows={2} maxLength={3000} value={productionNote} onChange={(event) => setProductionNote(event.target.value)} placeholder="Record a verified production observation or handover note" className={`${inputClass} mt-0 resize-y`} /></label>
          <button type="submit" disabled={Boolean(busy) || !productionNote.trim()} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg border border-stone-300 bg-white px-5 text-xs font-black text-stone-800 disabled:opacity-50">{busy === 'note' ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />} Add note</button>
        </form>
      </Section>

      <Section icon={History} title="Immutable processing timeline" description="Server-recorded production transitions and quality decisions.">
        {events.length === 0 ? <p className="py-10 text-center text-sm text-stone-500">No processing events recorded.</p> : <ol className="space-y-0">{events.map((event, index) => <li key={event._id} className="relative flex gap-3 pb-5 last:pb-0">{index < events.length - 1 && <span className="absolute bottom-0 left-3 top-7 w-px bg-stone-200" />}<span className="relative mt-1 h-6 w-6 shrink-0 rounded-full bg-amber-100 ring-4 ring-white" /><div className="min-w-0 flex-1 rounded-lg border border-stone-100 bg-stone-50 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-black uppercase tracking-wide text-stone-800">{labelProcessingEvent(event.type)}</p><time className="text-[11px] text-stone-400">{formatProcessingDate(event.occurredAt || event.createdAt, { includeTime: true })}</time></div>{event.note && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{event.note}</p>}<EventDetails details={event.details} /><p className="mt-2 text-[11px] text-stone-400">Actor: {event.actor || 'Authenticated admin'}</p></div></li>)}</ol>}
        {eventPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4 text-xs text-stone-500"><span>Page {eventPage} of {eventPages}</span><div className="flex gap-2"><button type="button" disabled={eventPage <= 1} onClick={() => setEventPage((page) => page - 1)} className="min-h-10 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40">Previous</button><button type="button" disabled={eventPage >= eventPages} onClick={() => setEventPage((page) => page + 1)} className="min-h-10 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40">Next</button></div></div>}
      </Section>

      <Section icon={Link2} title="Inventory linkage" description="Processing history and the inventory ledger reference the same source identity."><div className="flex flex-wrap gap-2"><Link to={`/admin/inventory/batches/${job.input?.batchId}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-4 text-xs font-black text-stone-700 no-underline">Open source batch</Link></div></Section>
    </AdminPage>
  );
}
