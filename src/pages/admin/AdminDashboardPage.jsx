import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  History,
  PackageCheck,
  RefreshCw,
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

  useEffect(() => {
    loadCrm();
    loadInventory();
  }, [loadCrm, loadInventory]);

  const stageCounts = useMemo(() => normalizeCountMap(crmDashboard?.byStage), [crmDashboard?.byStage]);
  const recentLeads = Array.isArray(crmDashboard?.recentLeads) ? crmDashboard.recentLeads : [];
  const costValues = Array.isArray(inventorySummary?.inventoryCostValues)
    ? inventorySummary.inventoryCostValues.filter((item) => item?.currency && Number.isFinite(Number(item.amount)))
    : [];
  const refreshing = crmLoading || inventoryLoading;

  return (
    <AdminPage className="space-y-8">
      <AdminPageHeader
        eyebrow="Operations workspace"
        title="Business Dashboard"
        description="Current commercial and inventory records from the connected admin APIs. No order, revenue, dispatch, or production data is inferred."
        actions={(
          <>
            <button
              type="button"
              onClick={() => { loadCrm(); loadInventory(); }}
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
            {COMMERCIAL_METRICS.map((metric) => (
              <AdminMetricCard key={metric.key} {...metric} value={integer(stageCounts[metric.key])} to="/admin/crm" />
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
    </AdminPage>
  );
}
