import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  Boxes,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';
import {
  AdminEmptyState,
  AdminFeedback,
  AdminLoadingState,
  AdminMetricCard,
  AdminPage,
  AdminPageHeader,
  AdminPanel,
} from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import {
  formatBillingDate,
  formatBillingNumber,
} from '../../lib/billing';
import {
  DISPATCH_STATUS_STYLES,
  labelDispatchStatus,
  labelTransportMode,
  parseDispatchResponse,
} from '../../lib/dispatch';

export default function DispatchListPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [dispatches, setDispatches] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const fetchDispatches = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);

      const response = await authFetch(`/api/admin/dispatches?${params.toString()}`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parseDispatchResponse(response, 'Failed to load dispatches.');
      setDispatches(data.dispatches || []);
      setSummary(data.summary || null);
      setMeta({
        page: data.page || 1,
        pages: data.pages || 1,
        total: data.total || 0,
        limit: data.limit || 20,
      });
    } catch (err) {
      setError(err.message || 'Failed to load dispatches.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, logout, navigate, page, search, status]);

  useEffect(() => {
    fetchDispatches();
  }, [fetchDispatches]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchDispatches();
  };

  return (
    <AdminPage size="wide" className="space-y-6 pb-12">
      <Helmet>
        <title>Dispatch & Gate Pass | Swamy Slabs Admin</title>
      </Helmet>

      <AdminPageHeader
        eyebrow="Logistics & Yard Operations"
        title="Physical Dispatch & Gate Passes"
        description="Fulfill sales orders, verify lorry gate passes, and track inventory stock depletion upon physical yard exit."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchDispatches}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-xs font-bold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/admin/dispatch/new"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-xs font-bold text-stone-950 shadow-sm hover:bg-amber-400 no-underline"
            >
              <Plus className="h-4 w-4" />
              Prepare Dispatch
            </Link>
          </div>
        }
      />

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AdminMetricCard
            label="Dispatched Orders"
            value={summary.dispatchedCount || 0}
            detail={`${formatBillingNumber(summary.totalDispatchedAreaSqFt || 0)} sq.ft moved`}
            icon={CheckCircle2}
            tone="emerald"
          />
          <AdminMetricCard
            label="Ready to Dispatch"
            value={summary.readyCount || 0}
            detail="Staged in yard, awaiting vehicle departure"
            icon={Truck}
            tone="amber"
          />
          <AdminMetricCard
            label="Draft Dispatch Orders"
            value={summary.draftCount || 0}
            detail="Reservations assigned to transit batches"
            icon={Boxes}
            tone="stone"
          />
        </div>
      )}

      {error && (
        <AdminFeedback tone="error" title="Error Loading Dispatches" onRetry={fetchDispatches}>
          {error}
        </AdminFeedback>
      )}

      <AdminPanel
        title="Dispatch Registry"
        description="Search by Gate Pass number, Sales Order, vehicle number, or customer name."
        bodyClassName="p-0"
      >
        <div className="border-b border-stone-200 bg-stone-50/50 p-4">
          <form onSubmit={handleFilterSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search Gate Pass #, vehicle #, Sales Order #, customer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-xs text-stone-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 outline-none focus:border-amber-500"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="READY_TO_DISPATCH">Ready to Dispatch</option>
                <option value="DISPATCHED">Dispatched</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-stone-800"
              >
                <Filter className="h-3.5 w-3.5" />
                Filter
              </button>
            </div>
          </form>
        </div>

        {loading ? (
          <AdminLoadingState label="Loading dispatch registry..." rows={5} />
        ) : dispatches.length === 0 ? (
          <AdminEmptyState
            icon={Truck}
            title="No dispatch records found"
            description={
              search || status
                ? 'Try adjusting your search filters.'
                : 'Create a new dispatch to release reserved stone inventory from the yard.'
            }
            action={
              <Link
                to="/admin/dispatch/new"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-xs font-bold text-stone-950 no-underline shadow-sm hover:bg-amber-400"
              >
                <Plus className="h-4 w-4" />
                Prepare Dispatch
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 font-bold uppercase tracking-wider text-stone-600">
                <tr>
                  <th className="px-4 py-3">Gate Pass / Ref</th>
                  <th className="px-4 py-3">Sales Order #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mode & Vehicle</th>
                  <th className="px-4 py-3">Slabs</th>
                  <th className="px-4 py-3">Total Area</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Dispatched Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                {dispatches.map((d) => (
                  <tr key={d._id} className="hover:bg-amber-50/40 transition">
                    <td className="px-4 py-3 font-mono font-bold text-stone-950">
                      <Link
                        to={`/admin/dispatch/${d._id}`}
                        className="text-stone-950 hover:text-amber-600 underline underline-offset-2"
                      >
                        {d.gatePassNumber || d.dispatchNumber || d._id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {d.salesOrderNumber ? (
                        <Link
                          to={`/admin/sales-orders/${d.salesOrderId}`}
                          className="text-amber-700 hover:underline"
                        >
                          {d.salesOrderNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-stone-900">
                      {d.customerSnapshot?.name || 'Customer'}
                    </td>
                    <td className="px-4 py-3">
                      <div>{labelTransportMode(d.transport?.mode)}</div>
                      {d.transport?.vehicleNumber && (
                        <span className="font-mono text-[11px] text-stone-500">
                          {d.transport.vehicleNumber}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-stone-900">
                      {d.totalSlabsCount || (d.items || []).reduce((s, i) => s + (i.slabsCount || 0), 0)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {formatBillingNumber(d.totalAreaSqFt || 0)} sq.ft
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          DISPATCH_STATUS_STYLES[d.status] || DISPATCH_STATUS_STYLES.DRAFT
                        }`}
                      >
                        {labelDispatchStatus(d.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.status === 'DISPATCHED'
                        ? formatBillingDate(d.dispatchedAt)
                        : formatBillingDate(d.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link
                        to={`/admin/dispatch/${d._id}`}
                        className="inline-flex items-center rounded border border-stone-200 bg-white px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-50 no-underline shadow-sm"
                      >
                        View
                      </Link>
                      {d.status === 'DISPATCHED' && (
                        <Link
                          to={`/admin/dispatch/${d._id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-stone-900 bg-stone-900 px-2.5 py-1 text-xs font-bold text-amber-400 hover:bg-stone-800 no-underline shadow-sm"
                        >
                          <Printer className="h-3 w-3" />
                          Gate Pass
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {meta.pages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-200 px-4 py-3">
            <span className="text-xs text-stone-500">
              Page {meta.page} of {meta.pages} ({meta.total} records)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-stone-300 px-3 py-1 text-xs font-bold text-stone-700 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={meta.page >= meta.pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-stone-300 px-3 py-1 text-xs font-bold text-stone-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </AdminPanel>
    </AdminPage>
  );
}

