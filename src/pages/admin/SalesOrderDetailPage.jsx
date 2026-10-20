import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Boxes,
  ExternalLink,
  Factory,
  History,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Unlink,
  UserRound,
} from 'lucide-react';
import {
  AdminFeedback,
  AdminLoadingState,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from '../../components/admin/AdminPrimitives';
import ProcessingJobPicker from '../../components/admin/ProcessingJobPicker';
import { useAdmin } from '../../context/AdminContext';
import {
  actionIsAllowed,
  commercialLineQuantity,
  commercialStoneName,
  customerSnapshotName,
  formatCommercialDate,
  formatCommercialMoney,
  formatCommercialNumber,
  labelCommercialUnit,
  labelSalesOrderStatus,
  parseCommercialResponse,
  salesOrderCustomer,
  SALES_ORDER_STATUS_STYLES,
} from '../../lib/commercial';
import { labelInventoryMode } from '../../lib/inventory';

const INPUT_CLASS = 'mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 disabled:bg-stone-100';
const AVAILABILITY_PAGE_SIZE = 20;
const SLAB_PAGE_SIZE = 20;
const PROCESSING_JOB_PAGE_SIZE = 10;
const DEFAULT_PAGE_META = Object.freeze({ page: 1, pages: 1, total: 0, limit: 20 });
const DEFAULT_PROCESSING_FILTERS = Object.freeze({ search: '', status: 'DRAFT' });
const LINKABLE_PROCESSING_STATUSES = new Set(['DRAFT', 'PLANNED']);

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${SALES_ORDER_STATUS_STYLES[status] || SALES_ORDER_STATUS_STYLES.CONFIRMED}`}>{labelSalesOrderStatus(status)}</span>;
}

function Section({ title, description, icon, children, action }) {
  return <AdminPanel title={title} description={description} icon={icon} action={action} bodyClassName="p-4 sm:p-5">{children}</AdminPanel>;
}

function InfoRow({ label, value, mono = false }) {
  return <div className="flex flex-col gap-1 border-b border-stone-100 py-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-5"><dt className="text-xs font-bold text-stone-500">{label}</dt><dd className={`text-sm font-bold text-stone-900 sm:max-w-[65%] sm:text-right ${mono ? 'font-mono' : ''}`}>{value || 'Not recorded'}</dd></div>;
}

function requestKey() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function orderTotal(order) {
  return order.financialSnapshot?.grandTotalMinor ?? order.financialSnapshot?.totals?.grandTotalMinor ?? order.grandTotalMinor;
}

function financialValue(order, key) {
  return order.financialSnapshot?.[key] ?? order.financialSnapshot?.totals?.[key] ?? order[key];
}

function normalizedAvailabilityRecords(data) {
  const records = data?.batches || data?.inventory || data?.records || (Array.isArray(data?.availability) ? data.availability : []);
  return Array.isArray(records) ? records : [];
}

function batchFromRecord(record) {
  return record?.batch || record?.inventoryBatch || record || {};
}

function availabilityFromRecord(record) {
  const batch = batchFromRecord(record);
  return record?.inventoryAvailability
    || record?.availability
    || record?.availabilitySnapshot
    || batch.inventoryAvailability
    || batch.availability
    || {};
}

function allocationDescription(line) {
  const requestedQuantity = commercialLineQuantity(line);
  if (line.unit === 'SQ_FT') {
    return `${formatCommercialNumber(line.reservedAreaSqFt || 0)} of ${formatCommercialNumber(line.areaSqFt ?? requestedQuantity)} sq.ft reserved`;
  }
  return `${formatCommercialNumber(line.reservedQuantity || 0)} of ${formatCommercialNumber(requestedQuantity)} ${labelCommercialUnit(line.unit)} reserved`;
}

function pageMeta(data, fallbackPage = 1, fallbackLimit = 20) {
  const page = Number(data?.page);
  const pages = Number(data?.pages);
  const total = Number(data?.total);
  const limit = Number(data?.limit);
  return {
    page: Number.isInteger(page) && page >= 1 ? page : Math.max(1, fallbackPage),
    pages: Number.isInteger(pages) && pages >= 1 ? pages : 1,
    total: Number.isFinite(total) && total >= 0 ? total : 0,
    limit: Number.isInteger(limit) && limit >= 1 ? limit : fallbackLimit,
  };
}

export default function SalesOrderDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [events, setEvents] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [processingJobs, setProcessingJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [availabilityLineId, setAvailabilityLineId] = useState('');
  const [availability, setAvailability] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityMeta, setAvailabilityMeta] = useState({ ...DEFAULT_PAGE_META });
  const [slabs, setSlabs] = useState([]);
  const [slabLoading, setSlabLoading] = useState(false);
  const [slabError, setSlabError] = useState('');
  const [slabMeta, setSlabMeta] = useState({ ...DEFAULT_PAGE_META });
  const [allocation, setAllocation] = useState({ batchId: '', quantity: '', areaSqFt: '', slabIds: [], requestKey: '' });
  const [processingLink, setProcessingLink] = useState({ lineItemId: '', processingJobId: '' });
  const [processingJobOptions, setProcessingJobOptions] = useState([]);
  const [processingJobDraftFilters, setProcessingJobDraftFilters] = useState({ ...DEFAULT_PROCESSING_FILTERS });
  const [processingJobFilters, setProcessingJobFilters] = useState({ ...DEFAULT_PROCESSING_FILTERS });
  const [processingJobMeta, setProcessingJobMeta] = useState({ ...DEFAULT_PAGE_META, limit: PROCESSING_JOB_PAGE_SIZE });
  const [processingJobLoading, setProcessingJobLoading] = useState(false);
  const [processingJobError, setProcessingJobError] = useState('');
  const availabilityRequestRef = useRef(0);
  const slabRequestRef = useRef(0);
  const processingJobRequestRef = useRef(0);

  const fetchOrder = useCallback(async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);
    setError('');
    try {
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}`);
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseCommercialResponse(response, 'Unable to load this sales order.');
      setOrder({ ...data.salesOrder, ...(data.allowedActions ? { allowedActions: data.allowedActions } : {}) });
      setEvents(Array.isArray(data.events) ? data.events : []);
      setReservations(Array.isArray(data.reservations) ? data.reservations : []);
      setProcessingJobs(Array.isArray(data.processingJobs) ? data.processingJobs : []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load this sales order.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, id, logout, navigate]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const selectedAvailability = useMemo(() => availability.find((record) => String(batchFromRecord(record)._id) === String(allocation.batchId)), [allocation.batchId, availability]);
  const selectedBatch = batchFromRecord(selectedAvailability);
  const processingPickerLineId = processingLink.lineItemId;
  const processingJobPage = processingJobMeta.page;
  const selectedProcessingLine = useMemo(
    () => order?.items?.find((line) => String(line._id) === String(processingPickerLineId)),
    [order, processingPickerLineId],
  );

  const loadProcessingJobOptions = useCallback(async () => {
    if (!processingPickerLineId) return;
    const currentRequest = ++processingJobRequestRef.current;
    setProcessingJobLoading(true);
    setProcessingJobError('');
    setProcessingLink((current) => ({ ...current, processingJobId: '' }));
    try {
      const params = new URLSearchParams({
        page: String(processingJobPage),
        limit: String(PROCESSING_JOB_PAGE_SIZE),
        status: processingJobFilters.status,
      });
      if (processingJobFilters.search) params.set('search', processingJobFilters.search);
      if (selectedProcessingLine?.stoneSnapshot?.slug) {
        params.set('stoneSlug', selectedProcessingLine.stoneSnapshot.slug);
      }
      const response = await authFetch(`/api/admin/processing/jobs?${params.toString()}`);
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseCommercialResponse(response, 'Unable to load linkable processing jobs.');
      if (processingJobRequestRef.current !== currentRequest) return;
      const options = Array.isArray(data.jobs) ? data.jobs : [];
      setProcessingJobOptions(options.filter((job) => LINKABLE_PROCESSING_STATUSES.has(job.status)));
      setProcessingJobMeta(pageMeta(data, processingJobPage, PROCESSING_JOB_PAGE_SIZE));
    } catch (requestError) {
      if (processingJobRequestRef.current !== currentRequest) return;
      setProcessingJobOptions([]);
      setProcessingJobError(requestError.message || 'Unable to load linkable processing jobs.');
    } finally {
      if (processingJobRequestRef.current === currentRequest) setProcessingJobLoading(false);
    }
  }, [authFetch, logout, navigate, processingJobFilters, processingJobPage, processingPickerLineId, selectedProcessingLine]);

  useEffect(() => {
    if (processingPickerLineId) loadProcessingJobOptions();
  }, [loadProcessingJobOptions, processingPickerLineId]);

  function resetSlabBrowser() {
    slabRequestRef.current += 1;
    setSlabs([]);
    setSlabLoading(false);
    setSlabError('');
    setSlabMeta({ ...DEFAULT_PAGE_META, limit: SLAB_PAGE_SIZE });
  }

  function closeAvailability() {
    availabilityRequestRef.current += 1;
    setAvailabilityLineId('');
    setAvailability([]);
    setAvailabilityLoading(false);
    setAvailabilityMeta({ ...DEFAULT_PAGE_META, limit: AVAILABILITY_PAGE_SIZE });
    setAllocation({ batchId: '', quantity: '', areaSqFt: '', slabIds: [], requestKey: requestKey() });
    resetSlabBrowser();
  }

  async function loadAvailability(lineItemId, { page = 1 } = {}) {
    const normalizedLineItemId = String(lineItemId);
    const requestedPage = Math.max(1, Number(page) || 1);
    const currentRequest = ++availabilityRequestRef.current;
    setAvailabilityLineId(normalizedLineItemId);
    setAvailability([]);
    setAvailabilityMeta((current) => ({ ...current, page: requestedPage }));
    setAllocation({ batchId: '', quantity: '', areaSqFt: '', slabIds: [], requestKey: requestKey() });
    resetSlabBrowser();
    setAvailabilityLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        lineItemId: normalizedLineItemId,
        page: String(requestedPage),
        limit: String(AVAILABILITY_PAGE_SIZE),
      });
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}/availability?${params.toString()}`);
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseCommercialResponse(response, 'Unable to load matching inventory.');
      if (availabilityRequestRef.current !== currentRequest) return;
      setAvailability(normalizedAvailabilityRecords(data));
      setAvailabilityMeta(pageMeta(data, requestedPage, AVAILABILITY_PAGE_SIZE));
    } catch (requestError) {
      if (availabilityRequestRef.current !== currentRequest) return;
      setError(requestError.message || 'Unable to load matching inventory.');
    } finally {
      if (availabilityRequestRef.current === currentRequest) setAvailabilityLoading(false);
    }
  }

  async function loadSlabs(batchId, { page = 1, lineItemId = availabilityLineId } = {}) {
    if (!batchId || !lineItemId) return false;
    const normalizedBatchId = String(batchId);
    const requestedPage = Math.max(1, Number(page) || 1);
    const currentRequest = ++slabRequestRef.current;
    setSlabLoading(true);
    setSlabError('');
    setSlabs([]);
    setSlabMeta((current) => ({ ...current, page: requestedPage }));
    try {
      const params = new URLSearchParams({
        lineItemId: String(lineItemId),
        page: String(requestedPage),
        limit: String(SLAB_PAGE_SIZE),
      });
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}/availability/${encodeURIComponent(normalizedBatchId)}/slabs?${params.toString()}`);
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return false; }
      const data = await parseCommercialResponse(response, 'Unable to load reservable slabs.');
      if (slabRequestRef.current !== currentRequest) return false;
      const nextSlabs = Array.isArray(data.slabs) ? data.slabs : [];
      const nextMeta = pageMeta(data, requestedPage, SLAB_PAGE_SIZE);
      if (nextSlabs.length === 0 && requestedPage > nextMeta.pages) {
        return loadSlabs(normalizedBatchId, { page: nextMeta.pages, lineItemId });
      }
      setSlabs(nextSlabs);
      setSlabMeta(nextMeta);
      if (data.batch) {
        setAvailability((current) => current.map((record) => (
          String(batchFromRecord(record)._id) === normalizedBatchId
            ? { ...record, batch: data.batch }
            : record
        )));
      }
      return true;
    } catch (requestError) {
      if (slabRequestRef.current !== currentRequest) return false;
      setSlabs([]);
      setSlabError(requestError.message || 'Unable to load reservable slabs.');
      return false;
    } finally {
      if (slabRequestRef.current === currentRequest) setSlabLoading(false);
    }
  }

  function selectBatch(record) {
    const batch = batchFromRecord(record);
    resetSlabBrowser();
    setAllocation({ batchId: String(batch._id), quantity: '', areaSqFt: '', slabIds: [], requestKey: requestKey() });
    if (batch.inventoryMode === 'INDIVIDUAL_SLAB') {
      loadSlabs(batch._id, { page: 1, lineItemId: availabilityLineId });
    }
  }

  function toggleSlab(slabId) {
    setAllocation((current) => ({ ...current, slabIds: current.slabIds.includes(String(slabId)) ? current.slabIds.filter((value) => value !== String(slabId)) : [...current.slabIds, String(slabId)] }));
  }

  async function reserveInventory() {
    if (!availabilityLineId || !allocation.batchId) { setError('Select a matching inventory batch.'); return; }
    setBusy('reserve');
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}/reservations`, {
        method: 'POST',
        body: JSON.stringify({
          lineItemId: availabilityLineId,
          batchId: allocation.batchId,
          slabIds: allocation.slabIds.length ? allocation.slabIds : undefined,
          quantity: allocation.quantity === '' ? undefined : Number(allocation.quantity),
          areaSqFt: allocation.areaSqFt === '' ? undefined : Number(allocation.areaSqFt),
          requestKey: allocation.requestKey,
        }),
      });
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseCommercialResponse(response, 'Unable to reserve inventory.');
      setSuccess(data.idempotent ? 'The existing reservation was returned; no duplicate allocation was created.' : `Reservation ${data.reservation?.reservationNumber || ''} created.`.trim());
      await fetchOrder({ showLoader: false });
      if (selectedBatch.inventoryMode === 'INDIVIDUAL_SLAB') {
        setAllocation((current) => ({ ...current, quantity: '', areaSqFt: '', slabIds: [], requestKey: requestKey() }));
        await loadSlabs(allocation.batchId, { page: slabMeta.page, lineItemId: availabilityLineId });
      } else {
        closeAvailability();
      }
    } catch (requestError) {
      setError(requestError.status === 409 ? `${requestError.message} Refresh the order before retrying a changed allocation.` : requestError.message);
    } finally {
      setBusy('');
    }
  }

  async function releaseReservation(reservation) {
    const reason = window.prompt(`Reason for releasing ${reservation.reservationNumber || 'this reservation'}:`)?.trim();
    if (!reason) return;
    setBusy(`release-${reservation._id}`);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}/reservations/${encodeURIComponent(reservation._id)}/release`, { method: 'POST', body: JSON.stringify({ reason }) });
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const data = await parseCommercialResponse(response, 'Unable to release this reservation.');
      setSuccess(data.idempotent ? 'This reservation was already released.' : 'Reservation released; physical on-hand stock was not changed.');
      await fetchOrder({ showLoader: false });
    } catch (requestError) {
      setError(requestError.message || 'Unable to release this reservation.');
    } finally {
      setBusy('');
    }
  }

  async function linkProcessing(event) {
    event?.preventDefault();
    if (!processingLink.lineItemId || !processingLink.processingJobId.trim()) return;
    setBusy('processing-link');
    setError('');
    try {
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}/processing-links`, { method: 'POST', body: JSON.stringify({ lineItemId: processingLink.lineItemId, processingJobId: processingLink.processingJobId.trim() }) });
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      await parseCommercialResponse(response, 'Unable to link this processing job.');
      setProcessingLink({ lineItemId: '', processingJobId: '' });
      setSuccess('Processing job linked. This linkage did not start production or issue stock.');
      await fetchOrder({ showLoader: false });
    } catch (requestError) {
      setError(requestError.message || 'Unable to link this processing job.');
    } finally {
      setBusy('');
    }
  }

  function openProcessingJobPicker(lineItemId) {
    processingJobRequestRef.current += 1;
    setProcessingLink({ lineItemId: String(lineItemId), processingJobId: '' });
    setProcessingJobOptions([]);
    setProcessingJobDraftFilters({ ...DEFAULT_PROCESSING_FILTERS });
    setProcessingJobFilters({ ...DEFAULT_PROCESSING_FILTERS });
    setProcessingJobMeta({ ...DEFAULT_PAGE_META, limit: PROCESSING_JOB_PAGE_SIZE });
    setProcessingJobError('');
  }

  function submitProcessingJobFilters(event) {
    event.preventDefault();
    setProcessingLink((current) => ({ ...current, processingJobId: '' }));
    setProcessingJobMeta((current) => ({ ...current, page: 1 }));
    setProcessingJobFilters({
      search: processingJobDraftFilters.search.trim(),
      status: processingJobDraftFilters.status,
    });
  }

  function changeProcessingJobPage(page) {
    setProcessingLink((current) => ({ ...current, processingJobId: '' }));
    setProcessingJobMeta((current) => ({ ...current, page }));
  }

  function closeProcessingJobPicker() {
    processingJobRequestRef.current += 1;
    setProcessingLink({ lineItemId: '', processingJobId: '' });
    setProcessingJobOptions([]);
    setProcessingJobError('');
    setProcessingJobLoading(false);
    setProcessingJobMeta({ ...DEFAULT_PAGE_META, limit: PROCESSING_JOB_PAGE_SIZE });
  }

  async function unlinkProcessing(jobId) {
    if (!window.confirm('Remove this order-to-processing link? This does not cancel the processing job.')) return;
    setBusy(`unlink-${jobId}`);
    setError('');
    try {
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}/processing-links/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      await parseCommercialResponse(response, 'Unable to unlink this processing job.');
      setSuccess('Processing link removed; production records were not changed.');
      await fetchOrder({ showLoader: false });
    } catch (requestError) {
      setError(requestError.message || 'Unable to unlink this processing job.');
    } finally {
      setBusy('');
    }
  }

  async function cancelOrder(event) {
    event.preventDefault();
    if (!cancelReason.trim() || !window.confirm('Cancel this sales order and transactionally release every eligible active reservation?')) return;
    setBusy('cancel');
    setError('');
    try {
      const response = await authFetch(`/api/admin/sales-orders/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: JSON.stringify({ reason: cancelReason.trim() }) });
      if (response.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      await parseCommercialResponse(response, 'Unable to cancel this sales order.');
      setCancelReason('');
      setSuccess('Sales order cancelled. Eligible reservations were released without changing physical on-hand stock.');
      await fetchOrder({ showLoader: false });
    } catch (requestError) {
      setError(requestError.message || 'Unable to cancel this sales order.');
    } finally {
      setBusy('');
    }
  }

  if (loading && !order) return <AdminPage size="standard"><AdminLoadingState label="Loading sales order" rows={6} /></AdminPage>;
  if (!order) return <AdminPage size="standard" className="space-y-4"><Link to="/admin/sales-orders" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600"><ArrowLeft className="h-4 w-4" /> Sales orders</Link><AdminFeedback title="Sales order unavailable" onRetry={() => fetchOrder()}>{error || 'Sales order not found.'}</AdminFeedback></AdminPage>;

  const customer = salesOrderCustomer(order);
  const customerId = order.customerId?._id || order.customerId;
  const quotationId = order.quotationId?._id || order.quotationId;
  const leadId = order.sourceLeadId?._id || order.sourceLeadId;
  const currency = order.currency || order.financialSnapshot?.currency;
  const links = Array.isArray(order.processingLinks) ? order.processingLinks : [];
  const canReserve = actionIsAllowed(order, 'reserve', order.status !== 'CANCELLED');
  const canLinkProcessing = actionIsAllowed(order, 'linkProcessing', order.status !== 'CANCELLED');
  const canCancel = actionIsAllowed(order, 'cancel', order.status !== 'CANCELLED');

  return (
    <AdminPage className="space-y-6">
      <Helmet><title>{order.salesOrderNumber} | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <Link to="/admin/sales-orders" className="inline-flex min-h-10 items-center gap-2 text-xs font-bold text-stone-600 no-underline"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Sales orders</Link>
      <AdminPageHeader eyebrow="Commercial commitment" title={order.salesOrderNumber} description={`Confirmed ${formatCommercialDate(order.confirmedAt, { includeTime: true })} from quotation ${order.quotationNumber}, revision ${order.quotationRevision}.`} actions={<><StatusBadge status={order.status} /><button type="button" onClick={() => fetchOrder()} disabled={loading || Boolean(busy)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-black text-stone-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Refresh</button></>} />
      {error && <AdminFeedback title="Action could not be completed">{error}</AdminFeedback>}
      {success && <AdminFeedback tone="success" title="Sales order updated">{success}</AdminFeedback>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={ShoppingCart} title="Order identity" description="Immutable linkage to the accepted quotation revision."><dl><InfoRow label="Sales order" value={order.salesOrderNumber} mono /><InfoRow label="Quotation" value={order.quotationNumber} mono /><InfoRow label="Quotation revision" value={`R${order.quotationRevision}`} /><InfoRow label="Confirmed" value={formatCommercialDate(order.confirmedAt, { includeTime: true })} /><InfoRow label="Requested delivery" value={formatCommercialDate(order.requestedDeliveryDate)} /><InfoRow label="Currency" value={currency} /></dl><div className="mt-4 flex flex-wrap gap-2">{quotationId && <Link to={`/admin/quotations/${quotationId}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-4 text-xs font-black text-stone-700 no-underline">Open quotation <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>}{leadId && <Link to={`/admin/crm/${leadId}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-4 text-xs font-black text-stone-700 no-underline">Open source lead <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>}</div></Section>
        <Section icon={UserRound} title="Customer snapshot" description="Accepted customer identity retained with this order."><dl><InfoRow label="Customer" value={customerSnapshotName(customer)} /><InfoRow label="Contact" value={customer.name} /><InfoRow label="Customer number" value={customer.customerNumber} mono /><InfoRow label="Email" value={customer.email} /><InfoRow label="Phone" value={customer.phone} /><InfoRow label="GSTIN" value={customer.gstin} mono /></dl>{customerId && <Link to={`/admin/customers/${customerId}`} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-4 text-xs font-black text-stone-700 no-underline">Open customer <ExternalLink className="h-4 w-4" aria-hidden="true" /></Link>}</Section>
      </div>

      <Section icon={PackageCheck} title="Order lines and allocation" description="Reservations reduce available-to-promise stock but do not reduce physical on-hand inventory.">
        <div className="space-y-4">{order.items?.map((line, index) => { const lineId = String(line._id); const processing = line.processingRequirements?.map((entry) => typeof entry === 'string' ? entry : entry.operation).filter(Boolean) || []; return <article key={lineId} className="rounded-xl border border-stone-200 bg-stone-50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-wide text-stone-400">Line {index + 1}</p><h3 className="mt-1 text-sm font-black text-stone-950">{commercialStoneName(line)}</h3><p className="mt-1 text-xs text-stone-500">{[line.finish, line.thicknessMm && `${formatCommercialNumber(line.thicknessMm)} mm`, `${formatCommercialNumber(commercialLineQuantity(line))} ${labelCommercialUnit(line.unit)}`].filter(Boolean).join(' · ')}</p></div><div className="lg:text-right"><p className="text-xs font-black text-stone-900">{allocationDescription(line)}</p><p className="mt-1 text-xs text-stone-500">{line.activeReservationCount || 0} active reservation{line.activeReservationCount === 1 ? '' : 's'}</p></div></div>{processing.length > 0 && <p className="mt-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900"><strong>Processing required:</strong> {processing.join(', ').replaceAll('_', ' ')}</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!canReserve || order.status === 'CANCELLED' || availabilityLoading} onClick={() => loadAvailability(lineId)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 text-xs font-black text-amber-900 disabled:opacity-50"><Search className="h-4 w-4" aria-hidden="true" /> Find matching inventory</button>{processing.length > 0 && canLinkProcessing && <button type="button" onClick={() => openProcessingJobPicker(lineId)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-4 text-xs font-black text-violet-900"><Factory className="h-4 w-4" aria-hidden="true" /> Link processing job</button>}</div></article>; })}</div>

        {canReserve && availabilityLineId && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-stone-950">Matching available-to-promise inventory</h3>
                <p className="mt-1 text-xs leading-5 text-stone-600">The server filters canonical stone identity. Select only verified stock for this line.</p>
              </div>
              <button type="button" onClick={closeAvailability} className="min-h-10 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold">Close</button>
            </div>

            {availabilityLoading ? (
              <p className="py-8 text-center text-sm font-bold text-stone-500">
                <RefreshCw className="mr-2 inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Loading inventory…
              </p>
            ) : availability.length === 0 ? (
              <p className="mt-4 rounded-lg bg-white p-5 text-center text-sm text-stone-500">No matching available-to-promise inventory was returned.</p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {availability.map((record) => {
                    const batch = batchFromRecord(record);
                    const snapshot = availabilityFromRecord(record);
                    const selected = String(batch._id) === String(allocation.batchId);
                    return (
                      <button
                        type="button"
                        key={batch._id}
                        onClick={() => selectBatch(record)}
                        aria-pressed={selected}
                        className={['rounded-xl border bg-white p-4 text-left', selected ? 'border-amber-500 ring-2 ring-amber-100' : 'border-stone-200'].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-mono text-xs font-black text-amber-800">{batch.batchNumber}</p>
                            <p className="mt-1 text-sm font-black text-stone-950">{batch.stoneRef?.name || commercialStoneName(batch)}</p>
                          </div>
                          {selected && <ShieldCheck className="h-5 w-5 text-amber-700" aria-hidden="true" />}
                        </div>
                        <p className="mt-3 text-xs text-stone-600">
                          {labelInventoryMode(batch.inventoryMode)}
                          {' · ATP '}
                          {snapshot.availableToPromise?.areaSqFt != null
                            ? <>{formatCommercialNumber(snapshot.availableToPromise.areaSqFt)} sq.ft</>
                            : <>{formatCommercialNumber(snapshot.availableToPromise?.quantity)} units</>}
                        </p>
                        <p className="mt-1 text-[11px] text-stone-500">
                          On hand remains
                          {' '}
                          {snapshot.onHand?.areaSqFt != null
                            ? <>{formatCommercialNumber(snapshot.onHand.areaSqFt)} sq.ft</>
                            : <>{formatCommercialNumber(snapshot.onHand?.quantity)} units</>}
                          ; reserved
                          {' '}
                          {snapshot.reserved?.areaSqFt
                            ? <>{formatCommercialNumber(snapshot.reserved.areaSqFt)} sq.ft</>
                            : <>{formatCommercialNumber(snapshot.reserved?.quantity || 0)} units</>}
                          .
                        </p>
                      </button>
                    );
                  })}
                </div>
                <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 pt-4" aria-label="Matching inventory batch pagination">
                  <p className="text-xs text-stone-600" aria-live="polite">
                    {availabilityMeta.total} matching batch{availabilityMeta.total === 1 ? '' : 'es'}
                    {' · '}
                    Page {availabilityMeta.page} of {availabilityMeta.pages}
                    {' · '}
                    Up to {availabilityMeta.limit} per page
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={availabilityLoading || availabilityMeta.page <= 1}
                      onClick={() => loadAvailability(availabilityLineId, { page: availabilityMeta.page - 1 })}
                      className="min-h-10 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={availabilityLoading || availabilityMeta.page >= availabilityMeta.pages}
                      onClick={() => loadAvailability(availabilityLineId, { page: availabilityMeta.page + 1 })}
                      className="min-h-10 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </nav>
              </>
            )}

            {selectedAvailability && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
                <h4 className="text-xs font-black uppercase tracking-wide text-stone-700">Reservation input</h4>
                {selectedBatch.inventoryMode === 'INDIVIDUAL_SLAB' ? (
                  <>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
                      <p>{allocation.slabIds.length} slab{allocation.slabIds.length === 1 ? '' : 's'} selected across pages</p>
                      <p aria-live="polite">{slabMeta.total} reservable · Page {slabMeta.page} of {slabMeta.pages}</p>
                    </div>
                    {slabError && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{slabError}</p>}
                    {slabLoading ? (
                      <p className="py-6 text-center text-sm font-bold text-stone-500">
                        <RefreshCw className="mr-2 inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                        Loading slabs…
                      </p>
                    ) : slabs.length === 0 ? (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">No reservable slabs were returned for this batch. Reserved, held, or processing slabs are intentionally excluded.</p>
                    ) : (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {slabs.map((slab) => {
                          const selected = allocation.slabIds.includes(String(slab._id));
                          return (
                            <label key={slab._id} className={['flex cursor-pointer items-start gap-3 rounded-lg border p-3', selected ? 'border-amber-400 bg-amber-50' : 'border-stone-200'].join(' ')}>
                              <input type="checkbox" checked={selected} onChange={() => toggleSlab(slab._id)} className="mt-1" />
                              <span>
                                <span className="block font-mono text-xs font-black text-stone-900">{slab.slabNumber}</span>
                                <span className="mt-1 block text-[11px] text-stone-500">{formatCommercialNumber(slab.usableAreaSqFt ?? slab.grossAreaSqFt)} sq.ft</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                    <nav className="mt-4 flex flex-wrap items-center justify-end gap-2" aria-label="Reservable slab pagination">
                      <button
                        type="button"
                        disabled={slabLoading || slabMeta.page <= 1}
                        onClick={() => loadSlabs(allocation.batchId, { page: slabMeta.page - 1 })}
                        className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs font-bold disabled:opacity-50"
                      >
                        Previous slabs
                      </button>
                      <button
                        type="button"
                        disabled={slabLoading || slabMeta.page >= slabMeta.pages}
                        onClick={() => loadSlabs(allocation.batchId, { page: slabMeta.page + 1 })}
                        className="min-h-10 rounded-lg border border-stone-300 px-3 text-xs font-bold disabled:opacity-50"
                      >
                        Next slabs
                      </button>
                    </nav>
                  </>
                ) : (
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <label className="text-xs font-bold text-stone-700">
                      Quantity
                      <input disabled={availabilityFromRecord(selectedAvailability).basis === 'AREA'} type="number" min="1" step="1" value={allocation.quantity} onChange={(event) => setAllocation((current) => ({ ...current, quantity: event.target.value }))} className={INPUT_CLASS} />
                    </label>
                    <label className="text-xs font-bold text-stone-700">
                      Area (sq.ft)
                      <input disabled={availabilityFromRecord(selectedAvailability).basis !== 'AREA'} type="number" min="0.0001" step="0.0001" value={allocation.areaSqFt} onChange={(event) => setAllocation((current) => ({ ...current, areaSqFt: event.target.value }))} className={INPUT_CLASS} />
                    </label>
                  </div>
                )}
                <button
                  type="button"
                  disabled={!canReserve || Boolean(busy) || slabLoading || (selectedBatch.inventoryMode === 'INDIVIDUAL_SLAB' ? !allocation.slabIds.length : availabilityFromRecord(selectedAvailability).basis === 'AREA' ? !allocation.areaSqFt : !allocation.quantity)}
                  onClick={reserveInventory}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-5 text-xs font-black text-white disabled:opacity-50"
                >
                  {busy === 'reserve' ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}
                  Reserve selected inventory
                </button>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section icon={Boxes} title="Reservation ledger" description="Reservation events allocate availability only; they are not physical inventory movements.">
        {reservations.length === 0 ? <p className="py-8 text-center text-sm text-stone-500">No inventory reservation has been recorded for this order.</p> : <div className="space-y-3">{reservations.map((reservation) => { const active = reservation.status === 'ACTIVE'; return <article key={reservation._id} className="rounded-xl border border-stone-200 bg-stone-50 p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs font-black text-amber-800">{reservation.reservationNumber}</p><p className="mt-1 text-sm font-black text-stone-950">{reservation.inventorySnapshot?.batchNumber || reservation.batch?.batchNumber || 'Inventory batch'}</p></div><span className={`inline-flex self-start rounded-full border px-2 py-1 text-[10px] font-black ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-stone-300 bg-stone-100 text-stone-600'}`}>{reservation.status}</span></div><div className="mt-3 flex flex-wrap gap-4 text-xs text-stone-600"><span>Quantity: <strong>{formatCommercialNumber(reservation.quantity)}</strong></span><span>Area: <strong>{formatCommercialNumber(reservation.areaSqFt)} sq.ft</strong></span><span>Reserved: <strong>{formatCommercialDate(reservation.reservedAt, { includeTime: true })}</strong></span></div>{reservation.releaseReason && <p className="mt-3 text-xs text-stone-600">Released: {reservation.releaseReason}</p>}{active && canReserve && order.status !== 'CANCELLED' && <button type="button" disabled={Boolean(busy)} onClick={() => releaseReservation(reservation)} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300 px-4 text-xs font-black text-rose-700 disabled:opacity-50"><Unlink className="h-4 w-4" aria-hidden="true" /> Release reservation</button>}</article>; })}</div>}
      </Section>

      <Section icon={Factory} title="Processing linkage" description="A link records order context only. It does not start production, reserve stock, or issue material.">
        {canLinkProcessing && processingLink.lineItemId && (
          <ProcessingJobPicker
            line={selectedProcessingLine}
            draft={processingJobDraftFilters}
            setDraft={setProcessingJobDraftFilters}
            search={submitProcessingJobFilters}
            loading={processingJobLoading}
            error={processingJobError}
            jobs={processingJobOptions}
            selected={processingLink.processingJobId}
            select={(processingJobId) => setProcessingLink((current) => ({ ...current, processingJobId }))}
            meta={processingJobMeta}
            previous={() => changeProcessingJobPage(Math.max(1, processingJobMeta.page - 1))}
            next={() => changeProcessingJobPage(Math.min(processingJobMeta.pages, processingJobMeta.page + 1))}
            close={closeProcessingJobPicker}
            submit={linkProcessing}
            busy={busy === 'processing-link'}
          />
        )}
        {links.length === 0 ? <p className="py-8 text-center text-sm text-stone-500">No processing job is linked to this order.</p> : <div className="space-y-3">{links.map((link) => { const linkedValue = link.processingJobId; const jobId = linkedValue?._id || linkedValue; const job = (typeof linkedValue === 'object' && linkedValue) || processingJobs.find((entry) => String(entry._id) === String(jobId)); return <div key={link._id || `${link.lineItemId}-${jobId}`} className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><Link to={`/admin/processing/jobs/${jobId}`} className="font-mono text-xs font-black text-amber-800">{job?.jobNumber || String(jobId)}</Link><p className="mt-1 text-xs text-stone-500">Linked {formatCommercialDate(link.linkedAt, { includeTime: true })}</p></div>{canLinkProcessing && order.status !== 'CANCELLED' && <button type="button" disabled={Boolean(busy)} onClick={() => unlinkProcessing(jobId)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-stone-300 px-4 text-xs font-black text-stone-700 disabled:opacity-50"><Unlink className="h-4 w-4" aria-hidden="true" /> Unlink</button>}</div>; })}</div>}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={ShieldCheck} title="Accepted financial snapshot" description="Immutable quotation amounts; this is not a payment or invoice record."><dl><InfoRow label="Subtotal" value={formatCommercialMoney(financialValue(order, 'subtotalMinor'), currency)} /><InfoRow label="Discount" value={formatCommercialMoney(financialValue(order, 'discountMinor') ?? 0, currency)} /><InfoRow label="Taxable" value={formatCommercialMoney(financialValue(order, 'taxableMinor'), currency)} /><InfoRow label="Tax" value={formatCommercialMoney(financialValue(order, 'taxMinor') ?? 0, currency)} /><InfoRow label="Grand total" value={formatCommercialMoney(orderTotal(order), currency)} /></dl></Section>
        {canCancel && <Section icon={Ban} title="Cancel sales order" description="Cancellation is backend-controlled and releases only eligible active reservations."><form onSubmit={cancelOrder}><label className="text-xs font-bold text-stone-700">Required reason<textarea required rows={4} maxLength={1000} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} className={`${INPUT_CLASS} resize-y py-2.5`} /></label><button type="submit" disabled={Boolean(busy) || !cancelReason.trim()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-300 px-5 text-xs font-black text-rose-700 disabled:opacity-50"><Ban className="h-4 w-4" aria-hidden="true" /> Cancel order and release reservations</button></form></Section>}
      </div>

      <Section icon={History} title="Immutable sales order timeline" description="Server-recorded order, reservation, processing-link, and cancellation events.">{events.length === 0 ? <p className="py-8 text-center text-sm text-stone-500">No sales order events were returned.</p> : <ol>{events.map((event, index) => <li key={event._id || `${event.type}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">{index < events.length - 1 && <span className="absolute bottom-0 left-3 top-7 w-px bg-stone-200" aria-hidden="true" />}<span className="relative mt-1 h-6 w-6 shrink-0 rounded-full bg-amber-100 ring-4 ring-white" aria-hidden="true" /><div className="min-w-0 flex-1 rounded-lg border border-stone-100 bg-stone-50 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-black uppercase tracking-wide text-stone-800">{String(event.type || 'EVENT').replaceAll('_', ' ')}</p><time className="text-[11px] text-stone-400">{formatCommercialDate(event.occurredAt || event.createdAt, { includeTime: true })}</time></div>{(event.note || event.reason) && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-700">{event.note || event.reason}</p>}<p className="mt-2 text-[11px] text-stone-400">Actor: {event.actor || 'Authenticated admin'}</p></div></li>)}</ol>}</Section>
    </AdminPage>
  );
}
