import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Factory,
  FileCheck2,
  FileText,
  History,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  SquareStack,
  UserRoundCheck,
  UsersRound,
  Warehouse,
} from 'lucide-react';
import {
  AdminEmptyState,
  AdminFeedback,
  AdminLoadingState,
  AdminMetricCard,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
  AdminTextLink,
} from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import {
  formatCrmDate,
  labelLeadSource,
  labelLeadStage,
  LEAD_STAGE_STYLES,
  normalizeCountMap,
  parseAdminJsonResponse,
} from '../../lib/crm';
import {
  batchAreaOnHand,
  batchInventoryMode,
  batchQuantityOnHand,
  batchStone,
  formatInventoryCurrency,
  formatInventoryDate,
  formatInventoryNumber,
  INVENTORY_STATUS_STYLES,
  labelInventoryStatus,
  parseInventoryResponse,
} from '../../lib/inventory';
import {
  currentProcessingOperation,
  formatProcessingDate,
  labelProcessingOperation,
  labelProcessingStatus,
  parseProcessingResponse,
  PROCESSING_STATUS_STYLES,
} from '../../lib/processing';
import {
  customerSnapshotName,
  formatCommercialDate,
  labelQuotationStatus,
  labelSalesOrderStatus,
  parseCommercialResponse,
  quotationCustomer,
  salesOrderCustomer,
  QUOTATION_STATUS_STYLES,
  SALES_ORDER_STATUS_STYLES,
} from '../../lib/commercial';

const COMMERCIAL_METRICS = [
  { key: 'NEW', label: 'New leads', icon: Sparkles, tone: 'blue' },
  { key: 'CONTACTED', label: 'Contacted', icon: Clock3, tone: 'violet' },
  { key: 'QUALIFIED', label: 'Qualified', icon: CheckCircle2, tone: 'emerald' },
  { key: 'READY_FOR_QUOTATION', label: 'Ready for quotation', icon: BriefcaseBusiness, tone: 'amber' },
];

function integer(value) {
  return (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function MetricsSkeleton({ count = 5 }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" role="status" aria-label="Loading dashboard metrics">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="h-28 animate-pulse rounded-xl border border-stone-200 bg-white motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function LeadRow({ lead, compact = false }) {
  return (
    <Link
      to={`/admin/crm/${lead._id}`}
      className="group flex min-h-16 items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left no-underline last:border-b-0 hover:bg-stone-50 sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-bold text-stone-900">{lead.contact?.name || 'Unnamed contact'}</span>
          {!compact && (
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${LEAD_STAGE_STYLES[lead.stage] || LEAD_STAGE_STYLES.LOST}`}>
              {labelLeadStage(lead.stage)}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-stone-500">
          {lead.leadNumber || 'Lead'}{lead.contact?.company ? ` · ${lead.contact.company}` : ''}
        </span>
        <span className="mt-1 block truncate text-xs text-stone-500">
          {labelLeadSource(lead.source)}{lead.materialContext?.stoneName ? ` · ${lead.materialContext.stoneName}` : ''}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-stone-500">
        <time className="hidden sm:inline">{formatCrmDate(lead.updatedAt || lead.createdAt)}</time>
        <ArrowRight className="h-4 w-4 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-600" aria-hidden="true" />
      </span>
    </Link>
  );
}

function InventoryRow({ batch }) {
  const stone = batchStone(batch);
  const quantity = batchQuantityOnHand(batch);
  const area = batchAreaOnHand(batch);
  const unit = batchInventoryMode(batch) === 'INDIVIDUAL_SLAB' ? 'slabs' : 'units';

  return (
    <Link
      to={`/admin/inventory/batches/${batch._id}`}
      className="group grid gap-3 border-b border-stone-100 px-4 py-3 text-left no-underline last:border-b-0 hover:bg-stone-50 sm:grid-cols-[minmax(0,1.2fr)_minmax(8rem,.7fr)_auto] sm:items-center sm:px-5"
    >
      <span className="min-w-0">
        <span className="block font-mono text-xs font-bold text-amber-800">{batch.batchNumber || 'Batch'}</span>
        <span className="mt-0.5 block truncate text-sm font-bold text-stone-900">{stone.name || 'Stone not recorded'}</span>
        <span className="mt-0.5 block truncate text-xs text-stone-500">{batch.finish || 'Finish not recorded'}</span>
      </span>
      <span className="text-xs text-stone-600">
        <span className="block font-bold text-stone-800">{formatInventoryNumber(quantity, { maximumFractionDigits: 0 })} {unit}</span>
        <span className="mt-0.5 block">{area == null ? 'Area not recorded' : `${formatInventoryNumber(area)} sq.ft`}</span>
      </span>
      <span className="flex items-center justify-between gap-3 sm:block sm:text-right">
        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${INVENTORY_STATUS_STYLES[batch.status] || INVENTORY_STATUS_STYLES.DRAFT}`}>
          {labelInventoryStatus(batch.status)}
        </span>
        <span className="text-xs text-stone-500 sm:mt-1.5 sm:block">{formatInventoryDate(batch.updatedAt)}</span>
      </span>
    </Link>
  );
}

function ProcessingJobRow({ job }) {
  const currentOperation = currentProcessingOperation(job);
  const stoneName = job.stoneSnapshot?.name || 'Stone not recorded';
  const batchNumber = job.input?.batchNumber || 'Batch not recorded';
  const operationLabel = currentOperation
    ? labelProcessingOperation(currentOperation.operation)
    : job.status === 'COMPLETED'
      ? 'Production complete'
      : 'No active operation';

  return (
    <Link
      to={`/admin/processing/jobs/${job._id}`}
      className='group grid gap-3 border-b border-stone-100 px-4 py-3 text-left no-underline last:border-b-0 hover:bg-stone-50 sm:grid-cols-[minmax(0,1.1fr)_minmax(9rem,.7fr)_auto] sm:items-center sm:px-5'
    >
      <span className='min-w-0'>
        <span className='block font-mono text-xs font-bold text-amber-800'>{job.jobNumber || 'Processing job'}</span>
        <span className='mt-0.5 block truncate text-sm font-bold text-stone-900'>{stoneName}</span>
        <span className='mt-0.5 block truncate font-mono text-xs text-stone-500'>{batchNumber}</span>
      </span>
      <span className='min-w-0 text-xs text-stone-600'>
        <span className='block truncate font-bold text-stone-800'>{operationLabel}</span>
        <span className='mt-0.5 block'>Due {formatProcessingDate(job.expectedCompletionDate)}</span>
      </span>
      <span className='flex items-center justify-between gap-3 sm:block sm:text-right'>
        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${PROCESSING_STATUS_STYLES[job.status] || PROCESSING_STATUS_STYLES.DRAFT}`}>
          {labelProcessingStatus(job.status)}
        </span>
        <span className='text-xs text-stone-500 sm:mt-1.5 sm:block'>{formatProcessingDate(job.updatedAt)}</span>
      </span>
    </Link>
  );
}

function QuotationRow({ quotation }) {
  return (
    <Link to={`/admin/quotations/${quotation._id}`} className="group flex min-h-16 items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left no-underline last:border-b-0 hover:bg-stone-50 sm:px-5">
      <span className="min-w-0"><span className="block font-mono text-xs font-bold text-amber-800">{quotation.quotationNumber || 'Draft quotation'}</span><span className="mt-0.5 block truncate text-sm font-bold text-stone-900">{customerSnapshotName(quotationCustomer(quotation))}</span><span className="mt-1 block text-xs text-stone-500">Revision {quotation.revision ?? 1} · {formatCommercialDate(quotation.updatedAt)}</span></span>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${QUOTATION_STATUS_STYLES[quotation.status] || QUOTATION_STATUS_STYLES.DRAFT}`}>{labelQuotationStatus(quotation.status)}</span>
    </Link>
  );
}

function SalesOrderRow({ order }) {
  return (
    <Link to={`/admin/sales-orders/${order._id}`} className="group flex min-h-16 items-center justify-between gap-3 border-b border-stone-100 px-4 py-3 text-left no-underline last:border-b-0 hover:bg-stone-50 sm:px-5">
      <span className="min-w-0"><span className="block font-mono text-xs font-bold text-amber-800">{order.salesOrderNumber}</span><span className="mt-0.5 block truncate text-sm font-bold text-stone-900">{customerSnapshotName(salesOrderCustomer(order))}</span><span className="mt-1 block text-xs text-stone-500">{order.quotationNumber || 'Quotation'} · {formatCommercialDate(order.updatedAt)}</span></span>
      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${SALES_ORDER_STATUS_STYLES[order.status] || SALES_ORDER_STATUS_STYLES.CONFIRMED}`}>{labelSalesOrderStatus(order.status)}</span>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [crmDashboard, setCrmDashboard] = useState(null);
  const [newLeads, setNewLeads] = useState([]);
  const [crmLoading, setCrmLoading] = useState(true);
  const [crmError, setCrmError] = useState('');
  const [inventorySummary, setInventorySummary] = useState(null);
  const [recentBatches, setRecentBatches] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');
  const [processingSummary, setProcessingSummary] = useState(null);
  const [recentProcessingJobs, setRecentProcessingJobs] = useState([]);
  const [processingLoading, setProcessingLoading] = useState(true);
  const [processingError, setProcessingError] = useState('');
  const [salesSummary, setSalesSummary] = useState(null);
  const [recentQuotations, setRecentQuotations] = useState([]);
  const [recentSalesOrders, setRecentSalesOrders] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState('');

  const expireSession = useCallback(() => {
    logout();
    navigate('/admin/login', { replace: true });
  }, [logout, navigate]);

  const loadCrm = useCallback(async () => {
    setCrmLoading(true);
    setCrmError('');
    try {
      const [dashboardResponse, newLeadsResponse] = await Promise.all([
        authFetch('/api/admin/crm/dashboard'),
        authFetch('/api/admin/leads?stage=NEW&page=1&limit=5'),
      ]);
      if (dashboardResponse.status === 401 || newLeadsResponse.status === 401) {
        expireSession();
        return;
      }
      const [dashboardData, newLeadData] = await Promise.all([
        parseAdminJsonResponse(dashboardResponse, 'Unable to load commercial dashboard data.'),
        parseAdminJsonResponse(newLeadsResponse, 'Unable to load new leads.'),
      ]);
      setCrmDashboard(dashboardData);
      setNewLeads(Array.isArray(newLeadData.leads) ? newLeadData.leads : []);
    } catch (requestError) {
      setCrmError(requestError.message || 'Unable to load commercial dashboard data.');
    } finally {
      setCrmLoading(false);
    }
  }, [authFetch, expireSession]);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError('');
    try {
      const [summaryResponse, batchesResponse] = await Promise.all([
        authFetch('/api/admin/inventory/summary'),
        authFetch('/api/admin/inventory/batches?page=1&limit=5'),
      ]);
      if (summaryResponse.status === 401 || batchesResponse.status === 401) {
        expireSession();
        return;
      }
      const [summaryData, batchData] = await Promise.all([
        parseInventoryResponse(summaryResponse, 'Unable to load inventory summary.'),
        parseInventoryResponse(batchesResponse, 'Unable to load recent inventory.'),
      ]);
      setInventorySummary(summaryData.summary || summaryData.metrics || {});
      setRecentBatches(Array.isArray(batchData.batches) ? batchData.batches : []);
    } catch (requestError) {
      setInventoryError(requestError.message || 'Unable to load inventory dashboard data.');
    } finally {
      setInventoryLoading(false);
    }
  }, [authFetch, expireSession]);

  const loadProcessing = useCallback(async () => {
    setProcessingLoading(true);
    setProcessingError('');
    try {
      const [summaryResponse, jobsResponse] = await Promise.all([
        authFetch('/api/admin/processing/summary'),
        authFetch('/api/admin/processing/jobs?page=1&limit=5'),
      ]);
      if (summaryResponse.status === 401 || jobsResponse.status === 401) {
        expireSession();
        return;
      }
      const [summaryData, jobsData] = await Promise.all([
        parseProcessingResponse(summaryResponse, 'Unable to load production summary.'),
        parseProcessingResponse(jobsResponse, 'Unable to load recent processing jobs.'),
      ]);
      setProcessingSummary(summaryData.summary || {});
      setRecentProcessingJobs(Array.isArray(jobsData.jobs) ? jobsData.jobs : []);
    } catch (requestError) {
      setProcessingError(requestError.message || 'Unable to load production dashboard data.');
    } finally {
      setProcessingLoading(false);
    }
  }, [authFetch, expireSession]);

  const loadSales = useCallback(async () => {
    setSalesLoading(true);
    setSalesError('');
    try {
      const [quotationSummaryResponse, quotationListResponse, orderSummaryResponse, orderListResponse] = await Promise.all([
        authFetch('/api/admin/quotations/summary'),
        authFetch('/api/admin/quotations?page=1&limit=5'),
        authFetch('/api/admin/sales-orders/summary'),
        authFetch('/api/admin/sales-orders?page=1&limit=5'),
      ]);
      const responses = [quotationSummaryResponse, quotationListResponse, orderSummaryResponse, orderListResponse];
      if (responses.some((response) => response.status === 401)) { expireSession(); return; }
      const [quotationSummaryData, quotationListData, orderSummaryData, orderListData] = await Promise.all([
        parseCommercialResponse(quotationSummaryResponse, 'Unable to load quotation summary.'),
        parseCommercialResponse(quotationListResponse, 'Unable to load recent quotations.'),
        parseCommercialResponse(orderSummaryResponse, 'Unable to load sales order summary.'),
        parseCommercialResponse(orderListResponse, 'Unable to load recent sales orders.'),
      ]);
      setSalesSummary({ quotations: quotationSummaryData.summary || {}, orders: orderSummaryData.summary || {} });
      setRecentQuotations(Array.isArray(quotationListData.quotations) ? quotationListData.quotations : []);
      setRecentSalesOrders(Array.isArray(orderListData.salesOrders) ? orderListData.salesOrders : []);
    } catch (requestError) {
      setSalesError(requestError.message || 'Unable to load sales commitment data.');
    } finally {
      setSalesLoading(false);
    }
  }, [authFetch, expireSession]);

  useEffect(() => {
    loadCrm();
    loadInventory();
    loadProcessing();
    loadSales();
  }, [loadCrm, loadInventory, loadProcessing, loadSales]);

  const stageCounts = useMemo(() => normalizeCountMap(crmDashboard?.byStage), [crmDashboard?.byStage]);
  const recentLeads = Array.isArray(crmDashboard?.recentLeads) ? crmDashboard.recentLeads : [];
  const quotationCounts = useMemo(() => normalizeCountMap(salesSummary?.quotations?.byStatus || salesSummary?.quotations), [salesSummary?.quotations]);
  const salesOrderCounts = useMemo(() => normalizeCountMap(salesSummary?.orders?.byStatus || salesSummary?.orders), [salesSummary?.orders]);
  const costValues = Array.isArray(inventorySummary?.inventoryCostValues)
    ? inventorySummary.inventoryCostValues.filter((item) => item?.currency && Number.isFinite(Number(item.amount)))
    : [];
  const refreshing = crmLoading || inventoryLoading || processingLoading || salesLoading;

  return (
    <AdminPage className="space-y-8">
      <AdminPageHeader
        eyebrow="Operations workspace"
        title="Business Dashboard"
        description="Current commercial, inventory, and production records from the connected admin APIs. No order, revenue, or dispatch data is inferred."
        actions={(
          <>
            <button
              type="button"
              onClick={() => { loadCrm(); loadInventory(); loadProcessing(); loadSales(); }}
              disabled={refreshing}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
              Refresh data
            </button>
            <Link to="/admin/crm" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-bold text-white no-underline hover:bg-stone-800">
              Open CRM <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </>
        )}
      />

      <section className="space-y-4" aria-labelledby="commercial-overview-heading" aria-busy={crmLoading}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="commercial-overview-heading" className="text-lg font-bold text-stone-950">Commercial</h2>
            <p className="mt-0.5 text-xs leading-5 text-stone-500">Live lead stages, customer records, and invoice count.</p>
          </div>
          <AdminTextLink to="/admin/crm">View pipeline</AdminTextLink>
        </div>

        {crmError && (
          <AdminFeedback title={crmDashboard ? 'Commercial refresh failed' : 'Commercial data unavailable'} onRetry={loadCrm}>
            {crmDashboard ? `Showing the last loaded records. ${crmError}` : crmError}
          </AdminFeedback>
        )}

        {crmLoading && !crmDashboard ? (
          <MetricsSkeleton count={6} />
        ) : crmDashboard ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {COMMERCIAL_METRICS.map(({ key, ...metric }) => (
              <AdminMetricCard key={key} {...metric} value={integer(stageCounts[key])} to="/admin/crm" />
            ))}
            <AdminMetricCard label="Customers" value={integer(crmDashboard.metrics?.customers)} icon={UsersRound} tone="stone" to="/admin/customers" />
            <AdminMetricCard label="Invoice records" value={integer(crmDashboard.metrics?.invoices)} detail="Persisted invoices" icon={FileText} tone="stone" to="/admin/invoices" />
          </div>
        ) : null}

        {crmDashboard && (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
            <AdminPanel
              title="Recent leads"
              description="The most recently updated CRM records."
              icon={History}
              action={<AdminTextLink to="/admin/crm">All leads</AdminTextLink>}
            >
              {recentLeads.length ? recentLeads.map((lead) => <LeadRow key={lead._id} lead={lead} />) : (
                <AdminEmptyState icon={UserRoundCheck} title="No leads yet" description="Persisted public enquiries will appear here." />
              )}
            </AdminPanel>

            <AdminPanel
              title="New leads awaiting first action"
              description="Records currently in the New stage. This is not an overdue calculation."
              icon={UserRoundCheck}
              action={<AdminTextLink to="/admin/crm">Open CRM</AdminTextLink>}
            >
              {newLeads.length ? newLeads.map((lead) => <LeadRow key={lead._id} lead={lead} compact />) : (
                <AdminEmptyState icon={CheckCircle2} title="No leads in New stage" description="There are no new-stage records awaiting review." />
              )}
            </AdminPanel>
          </div>
        )}
      </section>

      <section className="space-y-4" aria-labelledby="sales-commitments-heading" aria-busy={salesLoading}>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="sales-commitments-heading" className="text-lg font-bold text-stone-950">Sales commitments</h2><p className="mt-0.5 text-xs leading-5 text-stone-500">Persisted quotation and sales-order states. No revenue, payment, or delivery result is inferred.</p></div><div className="flex gap-3"><AdminTextLink to="/admin/quotations">Quotations</AdminTextLink><AdminTextLink to="/admin/sales-orders">Sales orders</AdminTextLink></div></div>
        {salesError && <AdminFeedback title={salesSummary ? 'Sales commitments refresh failed' : 'Sales commitments unavailable'} onRetry={loadSales}>{salesSummary ? `Showing the last loaded records. ${salesError}` : salesError}</AdminFeedback>}
        {salesLoading && !salesSummary ? <><MetricsSkeleton count={6} /><div className="grid gap-5 xl:grid-cols-2"><AdminPanel title="Recent quotations" icon={FileCheck2}><AdminLoadingState label="Loading quotations" compact /></AdminPanel><AdminPanel title="Recent sales orders" icon={ShoppingCart}><AdminLoadingState label="Loading sales orders" compact /></AdminPanel></div></> : salesSummary ? <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <AdminMetricCard label="Draft quotations" value={integer(quotationCounts.DRAFT ?? salesSummary.quotations?.draftQuotations)} icon={FileCheck2} tone="stone" to="/admin/quotations" />
            <AdminMetricCard label="Awaiting response" value={integer(quotationCounts.ISSUED ?? salesSummary.quotations?.awaitingResponse)} detail="Issued; delivery is not inferred." icon={Clock3} tone="blue" to="/admin/quotations" />
            <AdminMetricCard label="Accepted quotations" value={integer(quotationCounts.ACCEPTED ?? salesSummary.quotations?.acceptedQuotations)} icon={CheckCircle2} tone="emerald" to="/admin/quotations" />
            <AdminMetricCard label="Confirmed orders" value={integer(salesOrderCounts.CONFIRMED ?? salesSummary.orders?.confirmedOrders)} icon={ClipboardList} tone="blue" to="/admin/sales-orders" />
            <AdminMetricCard label="Awaiting allocation" value={integer(salesSummary.orders?.awaitingAllocation ?? salesSummary.orders?.ordersAwaitingAllocation)} icon={PackageOpen} tone="amber" to="/admin/sales-orders" />
            <AdminMetricCard label="Allocated orders" value={integer(salesOrderCounts.ALLOCATED ?? salesSummary.orders?.allocatedOrders)} icon={PackageCheck} tone="emerald" to="/admin/sales-orders" />
          </div>
          <div className="grid gap-5 xl:grid-cols-2"><AdminPanel title="Recent quotations" description="Latest persisted commercial offers." icon={FileCheck2} action={<AdminTextLink to="/admin/quotations">All quotations</AdminTextLink>}>{recentQuotations.length ? recentQuotations.map((quotation) => <QuotationRow key={quotation._id} quotation={quotation} />) : <AdminEmptyState icon={FileCheck2} title="No quotations yet" description="Saved quotation drafts will appear here." />}</AdminPanel><AdminPanel title="Recent sales orders" description="Accepted commercial commitments and allocation states." icon={ShoppingCart} action={<AdminTextLink to="/admin/sales-orders">All sales orders</AdminTextLink>}>{recentSalesOrders.length ? recentSalesOrders.map((order) => <SalesOrderRow key={order._id} order={order} />) : <AdminEmptyState icon={ShoppingCart} title="No sales orders yet" description="Orders appear only after accepted quotation conversion." />}</AdminPanel></div>
        </> : null}
      </section>

      <section className="space-y-4" aria-labelledby="inventory-overview-heading" aria-busy={inventoryLoading}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="inventory-overview-heading" className="text-lg font-bold text-stone-950">Inventory</h2>
            <p className="mt-0.5 text-xs leading-5 text-stone-500">Persisted batch and slab availability. Missing area or cost is never inferred.</p>
          </div>
          <AdminTextLink to="/admin/inventory">Open inventory</AdminTextLink>
        </div>

        {inventoryError && (
          <AdminFeedback title={inventorySummary ? 'Inventory refresh failed' : 'Inventory data unavailable'} onRetry={loadInventory}>
            {inventorySummary ? `Showing the last loaded records. ${inventoryError}` : inventoryError}
          </AdminFeedback>
        )}

        {inventoryLoading && !inventorySummary ? (
          <>
            <MetricsSkeleton count={5} />
            <AdminPanel title="Recently changed inventory" icon={Boxes}>
              <AdminLoadingState label="Loading recent inventory" compact />
            </AdminPanel>
          </>
        ) : inventorySummary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <AdminMetricCard label="Active batches" value={integer(inventorySummary.activeBatches)} icon={Boxes} tone="blue" to="/admin/inventory" />
              <AdminMetricCard
                label="Available inventory"
                value={inventorySummary.totalAvailableSqFt == null ? `${integer(inventorySummary.availableBatches)} batches` : `${formatInventoryNumber(inventorySummary.totalAvailableSqFt)} sq.ft`}
                detail={inventorySummary.totalAvailableSqFt == null
                  ? 'No available area is recorded.'
                  : `${integer(inventorySummary.availableBatches)} available batches; ${integer(inventorySummary.availableAreaTrackedBatches)} with recorded area.`}
                icon={PackageCheck}
                tone="emerald"
                to="/admin/inventory"
              />
              <AdminMetricCard label="Individual slabs" value={integer(inventorySummary.individualSlabs)} icon={SquareStack} tone="violet" to="/admin/inventory" />
              <AdminMetricCard label="Depleted / zero stock" value={integer(inventorySummary.depletedOrZeroStockBatches)} icon={Warehouse} tone="rose" to="/admin/inventory" />
              {costValues.map((item) => (
                <AdminMetricCard
                  key={item.currency}
                  label={`Inventory value (${item.currency})`}
                  value={formatInventoryCurrency(item.amount, item.currency)}
                  detail={`${integer(item.batches)} valued batch${Number(item.batches) === 1 ? '' : 'es'}; currencies are not combined.`}
                  icon={CircleDollarSign}
                  tone="amber"
                  to="/admin/inventory"
                />
              ))}
            </div>

            <AdminPanel
              title="Recently changed inventory"
              description="Batches ordered by their latest persisted update."
              icon={Boxes}
              action={<AdminTextLink to="/admin/inventory">All batches</AdminTextLink>}
            >
              {recentBatches.length ? recentBatches.map((batch) => <InventoryRow key={batch._id} batch={batch} />) : (
                <AdminEmptyState icon={Boxes} title="No inventory batches yet" description="Verified inventory will appear here after a batch is recorded." />
              )}
            </AdminPanel>
          </>
        ) : null}
      </section>

      <section className="space-y-4" aria-labelledby="processing-overview-heading" aria-busy={processingLoading}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="processing-overview-heading" className="text-lg font-bold text-stone-950">Processing</h2>
            <p className="mt-0.5 text-xs leading-5 text-stone-500">Persisted production jobs, quality gates, schedules, and material currently outside available stock.</p>
          </div>
          <AdminTextLink to="/admin/processing">Open processing</AdminTextLink>
        </div>

        {processingError && (
          <AdminFeedback title={processingSummary ? 'Processing refresh failed' : 'Processing data unavailable'} onRetry={loadProcessing}>
            {processingSummary ? `Showing the last loaded records. ${processingError}` : processingError}
          </AdminFeedback>
        )}

        {processingLoading && !processingSummary ? (
          <>
            <MetricsSkeleton count={6} />
            <AdminPanel title="Recently changed processing jobs" icon={Factory}>
              <AdminLoadingState label="Loading recent processing jobs" compact />
            </AdminPanel>
          </>
        ) : processingSummary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <AdminMetricCard label="Planned" value={integer(processingSummary.plannedJobs)} icon={CalendarClock} tone="blue" to="/admin/processing" />
              <AdminMetricCard label="In production" value={integer(processingSummary.inProgressJobs)} icon={Factory} tone="amber" to="/admin/processing" />
              <AdminMetricCard label="QC pending" value={integer(processingSummary.qcPendingJobs)} icon={ClipboardCheck} tone="violet" to="/admin/processing" />
              <AdminMetricCard label="Overdue" value={integer(processingSummary.overdueJobs)} detail="Only jobs with a recorded due date." icon={AlertCircle} tone="rose" to="/admin/processing" />
              <AdminMetricCard
                label="Material in processing"
                value={`${integer(processingSummary.materialInProcessing?.jobs)} jobs`}
                detail={processingSummary.materialInProcessing?.areaSqFt == null
                  ? 'No active input area is recorded.'
                  : `${formatInventoryNumber(processingSummary.materialInProcessing.areaSqFt)} sq.ft recorded across ${integer(processingSummary.materialInProcessing.areaTrackedJobs)} area-tracked jobs.`}
                icon={PackageOpen}
                tone="stone"
                to="/admin/processing"
              />
              <AdminMetricCard label="Completed recently" value={integer(processingSummary.completedRecently)} detail="Completed during the backend-defined 30-day window." icon={CheckCircle2} tone="emerald" to="/admin/processing" />
            </div>

            <AdminPanel
              title="Recently changed processing jobs"
              description="Jobs ordered by their latest persisted update. No production state is inferred."
              icon={Factory}
              action={<AdminTextLink to="/admin/processing">All processing jobs</AdminTextLink>}
            >
              {recentProcessingJobs.length ? recentProcessingJobs.map((job) => <ProcessingJobRow key={job._id} job={job} />) : (
                <AdminEmptyState icon={Factory} title="No processing jobs yet" description="Verified jobs will appear here after a processing plan is recorded." />
              )}
            </AdminPanel>
          </>
        ) : null}
      </section>
    </AdminPage>
  );
}
