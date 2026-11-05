import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Factory,
  PackageCheck,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AdminEmptyState,
  AdminFeedback,
  AdminLoadingState,
  AdminMetricCard,
  AdminPage,
  AdminPageHeader,
} from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import {
  customerSnapshotName,
  formatCommercialDate,
  formatCommercialMoney,
  labelSalesOrderStatus,
  parseCommercialResponse,
  salesOrderCustomer,
  SALES_ORDER_STATUSES,
  SALES_ORDER_STATUS_STYLES,
} from '../../lib/commercial';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = Object.freeze({ search: '', status: '' });

function count(summary, ...keys) {
  for (const key of keys) {
    const value = summary?.[key] ?? summary?.byStatus?.[key];
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${SALES_ORDER_STATUS_STYLES[status] || SALES_ORDER_STATUS_STYLES.CONFIRMED}`}>{labelSalesOrderStatus(status)}</span>;
}

function orderTotal(order) {
  return order.financialSnapshot?.grandTotalMinor ?? order.financialSnapshot?.totals?.grandTotalMinor ?? order.grandTotalMinor;
}

function allocationLabel(order) {
  const summary = order.fulfillmentSummary || order.allocationSummary || {};
  const reserved = summary.allocatedLineCount ?? summary.reservedLineItems ?? summary.allocatedLines ?? order.reservedLineItems;
  const total = summary.totalLineCount ?? summary.totalLineItems ?? order.items?.length;
  if (Number.isFinite(Number(reserved)) && Number.isFinite(Number(total))) return `${reserved} of ${total} lines`;
  return order.status === 'ALLOCATED' ? 'Fully allocated' : order.status === 'PARTIALLY_ALLOCATED' ? 'Partially allocated' : 'Awaiting allocation';
}

export default function SalesOrderListPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filters.search) params.set('search', filters.search);
      if (filters.status) params.set('status', filters.status);
      const [summaryResponse, listResponse] = await Promise.all([
        authFetch('/api/admin/sales-orders/summary'),
        authFetch(`/api/admin/sales-orders?${params.toString()}`),
      ]);
      if (summaryResponse.status === 401 || listResponse.status === 401) { logout(); navigate('/admin/login', { replace: true }); return; }
      const [summaryData, listData] = await Promise.all([
        parseCommercialResponse(summaryResponse, 'Unable to load sales order summary.'),
        parseCommercialResponse(listResponse, 'Unable to load sales orders.'),
      ]);
      const pagination = listData.pagination || listData;
      setSummary(summaryData.summary || summaryData.metrics || {});
      setOrders(Array.isArray(listData.salesOrders) ? listData.salesOrders : []);
      setTotal(Number(pagination.total) || 0);
      setPages(Math.max(1, Number(pagination.pages) || 1));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load sales orders.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, logout, navigate, page]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters({ search: draftFilters.search.trim(), status: draftFilters.status });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <AdminPage className="space-y-6">
      <Helmet><title>Sales Orders | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <AdminPageHeader eyebrow="Commercial commitments" title="Sales Orders" description="Track accepted quotation snapshots, real inventory allocation, and verified processing links. Sales orders are created only from accepted quotations." actions={<button type="button" onClick={loadOrders} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Refresh</button>} />
      {loading && !summary ? <AdminLoadingState label="Loading sales orders" rows={6} /> : error && !summary ? <AdminFeedback title="Sales orders unavailable" onRetry={loadOrders}>{error}</AdminFeedback> : (
        <>
          {error && <AdminFeedback title="Sales order refresh failed" onRetry={loadOrders}>Showing the last loaded records. {error}</AdminFeedback>}
          <section aria-label="Sales order summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard label="Confirmed" value={count(summary, 'CONFIRMED', 'confirmedOrders')} icon={ClipboardList} tone="blue" />
            <AdminMetricCard label="Awaiting allocation" value={count(summary, 'awaitingAllocation', 'ordersAwaitingAllocation')} icon={PackageCheck} tone="amber" />
            <AdminMetricCard label="Allocated" value={count(summary, 'ALLOCATED', 'allocatedOrders')} icon={CheckCircle2} tone="emerald" />
            <AdminMetricCard label="In production" value={count(summary, 'IN_PRODUCTION', 'inProductionOrders')} icon={Factory} tone="violet" />
          </section>

          <form onSubmit={applyFilters} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-stone-500" aria-hidden="true" /><h2 className="text-sm font-black text-stone-900">Find sales orders</h2></div>{activeFilters > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">{activeFilters} active</span>}</div><div className="grid gap-3 md:grid-cols-[minmax(15rem,1fr)_14rem_auto] md:items-end"><label className="text-xs font-bold text-stone-600">Search<span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" /><input maxLength={120} value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Order, quotation, customer or stone" className="min-h-11 w-full rounded-lg border border-stone-300 py-2.5 pl-9 pr-3 text-sm" /></span></label><label className="text-xs font-bold text-stone-600">Status<select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm"><option value="">All statuses</option>{SALES_ORDER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label><div className="flex gap-2"><button type="submit" className="min-h-11 flex-1 rounded-lg bg-stone-950 px-4 text-xs font-black text-white">Apply</button>{activeFilters > 0 && <button type="button" onClick={clearFilters} className="min-h-11 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-600">Clear</button>}</div></div></form>

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm" aria-busy={loading}><div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><div><h2 className="text-sm font-black text-stone-950">Sales order records</h2><p className="mt-0.5 text-xs text-stone-500">{total.toLocaleString('en-IN')} matching record{total === 1 ? '' : 's'}</p></div>{loading && <RefreshCw className="h-4 w-4 animate-spin text-amber-700 motion-reduce:animate-none" aria-label="Refreshing" />}</div>
            {!loading && orders.length === 0 ? <AdminEmptyState icon={ClipboardList} title={activeFilters ? 'No matching sales orders' : 'No sales orders yet'} description={activeFilters ? 'Change or clear the filters to search again.' : 'An accepted quotation creates the first sales order.'} className="py-16" /> : <><div className="hidden overflow-x-auto xl:block"><table className="w-full min-w-[1100px] border-collapse text-left"><thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">Order</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Quotation</th><th className="px-4 py-3">Allocation</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Commercial snapshot</th><th className="px-4 py-3">Updated</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-stone-100">{orders.map((order) => { const customer = salesOrderCustomer(order); const quote = order.quotationId || order.quotation; const currency = order.financialSnapshot?.currency || order.currency; return <tr key={order._id} className="hover:bg-stone-50"><td className="px-5 py-4"><p className="font-mono text-xs font-black text-amber-800">{order.salesOrderNumber}</p><p className="mt-1 text-xs text-stone-500">{order.items?.length || 0} line item{order.items?.length === 1 ? '' : 's'}</p></td><td className="px-4 py-4 text-sm font-bold text-stone-900">{customerSnapshotName(customer)}</td><td className="px-4 py-4"><p className="font-mono text-xs font-bold text-stone-700">{typeof quote === 'object' ? quote.quotationNumber : order.quotationNumber || 'Not recorded'}</p><p className="mt-1 text-xs text-stone-400">Revision {order.quotationRevision ?? '—'}</p></td><td className="px-4 py-4 text-xs font-bold text-stone-700">{allocationLabel(order)}</td><td className="px-4 py-4"><StatusBadge status={order.status} /></td><td className="px-4 py-4 text-right text-sm font-black text-stone-900">{formatCommercialMoney(orderTotal(order), currency)}</td><td className="px-4 py-4 text-xs text-stone-500">{formatCommercialDate(order.updatedAt)}</td><td className="px-5 py-4 text-right"><Link to={`/admin/sales-orders/${order._id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-black text-stone-800 no-underline">Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></td></tr>; })}</tbody></table></div><div className="divide-y divide-stone-100 xl:hidden">{orders.map((order) => { const customer = salesOrderCustomer(order); const currency = order.financialSnapshot?.currency || order.currency; return <article key={order._id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-black text-amber-800">{order.salesOrderNumber}</p><h3 className="mt-1 truncate text-sm font-black text-stone-950">{customerSnapshotName(customer)}</h3></div><StatusBadge status={order.status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="font-bold text-stone-400">ALLOCATION</dt><dd className="mt-1 font-semibold text-stone-700">{allocationLabel(order)}</dd></div><div><dt className="font-bold text-stone-400">SNAPSHOT</dt><dd className="mt-1 font-black text-stone-900">{formatCommercialMoney(orderTotal(order), currency)}</dd></div></dl><Link to={`/admin/sales-orders/${order._id}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 text-xs font-black text-stone-800 no-underline">View sales order <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></article>; })}</div></>}
          </section>
          <nav aria-label="Sales order pagination" className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-500 shadow-sm"><span>Page {page} of {pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Previous</button><button type="button" disabled={page >= pages || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40">Next <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div></nav>
        </>
      )}
    </AdminPage>
  );
}
