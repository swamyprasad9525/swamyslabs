import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  Banknote,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  RefreshCw,
  Search,
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
  formatBillingMoney,
} from '../../lib/billing';
import {
  labelPaymentMethod,
  labelPaymentStatus,
  parsePaymentResponse,
  PAYMENT_METHODS,
  PAYMENT_STATUS_STYLES,
} from '../../lib/payment';

export default function PaymentListPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();

  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: 20 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [page, setPage] = useState(1);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (search.trim()) params.set('search', search.trim());
      if (status) params.set('status', status);
      if (method) params.set('method', method);

      const response = await authFetch(`/api/admin/payments?${params.toString()}`);
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const data = await parsePaymentResponse(response, 'Failed to load payments.');
      setPayments(data.payments || []);
      setSummary(data.summary || null);
      setMeta({
        page: data.page || 1,
        pages: data.pages || 1,
        total: data.total || 0,
        limit: data.limit || 20,
      });
    } catch (err) {
      setError(err.message || 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, logout, method, navigate, page, search, status]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchPayments();
  };

  return (
    <AdminPage size="wide" className="space-y-6 pb-12">
      <Helmet>
        <title>Payments | Swamy Slabs Admin</title>
      </Helmet>

      <AdminPageHeader
        eyebrow="Commercial Finance"
        title="Payment Records"
        description="Verify, confirm, and audit customer payments across issued invoices with idempotent transaction tracking."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchPayments}
              disabled={loading}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3.5 text-xs font-bold text-stone-700 shadow-sm hover:bg-stone-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to="/admin/payments/new"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-xs font-bold text-stone-950 shadow-sm hover:bg-amber-400 no-underline"
            >
              <Plus className="h-4 w-4" />
              Record Payment
            </Link>
          </div>
        }
      />

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AdminMetricCard
            label="Confirmed Receipts"
            value={formatBillingMoney(summary.confirmedTotalMinor || 0)}
            detail={`${summary.confirmedCount || 0} verified transactions`}
            icon={CheckCircle2}
            tone="emerald"
          />
          <AdminMetricCard
            label="Pending Verification"
            value={formatBillingMoney(summary.pendingTotalMinor || 0)}
            detail={`${summary.pendingCount || 0} unverified entries`}
            icon={Clock}
            tone="amber"
          />
          <AdminMetricCard
            label="Total Payments Logged"
            value={summary.totalPaymentsCount || meta.total}
            detail="Across all statuses"
            icon={Banknote}
            tone="stone"
          />
        </div>
      )}

      {error && (
        <AdminFeedback tone="error" title="Error Loading Payments" onRetry={fetchPayments}>
          {error}
        </AdminFeedback>
      )}

      <AdminPanel
        title="Payments Ledger"
        description="Search by payment reference, invoice number, or customer name."
        bodyClassName="p-0"
      >
        <div className="border-b border-stone-200 bg-stone-50/50 p-4">
          <form onSubmit={handleFilterSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search reference, invoice #, customer..."
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
                <option value="PENDING_VERIFICATION">Pending Verification</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="REJECTED">Rejected</option>
                <option value="REVERSED">Reversed</option>
              </select>

              <select
                value={method}
                onChange={(e) => {
                  setMethod(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 outline-none focus:border-amber-500"
              >
                <option value="">All Methods</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
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
          <AdminLoadingState label="Loading payments ledger..." rows={5} />
        ) : payments.length === 0 ? (
          <AdminEmptyState
            icon={Banknote}
            title="No payment records found"
            description={
              search || status || method
                ? 'Try adjusting your search filters.'
                : 'Record your first customer payment against an issued invoice.'
            }
            action={
              <Link
                to="/admin/payments/new"
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-500 px-4 text-xs font-bold text-stone-950 no-underline shadow-sm hover:bg-amber-400"
              >
                <Plus className="h-4 w-4" />
                Record Payment
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-stone-200 bg-stone-50 font-bold uppercase tracking-wider text-stone-600">
                <tr>
                  <th className="px-4 py-3">Payment #</th>
                  <th className="px-4 py-3">Invoice #</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Ref / UTR</th>
                  <th className="px-4 py-3">Received Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-amber-50/40 transition">
                    <td className="px-4 py-3 font-mono font-bold text-stone-950">
                      <Link
                        to={`/admin/payments/${p._id}`}
                        className="text-stone-950 hover:text-amber-600 underline underline-offset-2"
                      >
                        {p.paymentNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {p.invoiceNumber ? (
                        <Link
                          to={`/admin/invoices/${p.invoiceId}`}
                          className="text-amber-700 hover:underline"
                        >
                          {p.invoiceNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-stone-900">
                      {p.customerSnapshot?.name || 'Customer'}
                    </td>
                    <td className="px-4 py-3 font-bold text-stone-950">
                      {formatBillingMoney(p.amountMinor)}
                    </td>
                    <td className="px-4 py-3">{labelPaymentMethod(p.method)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-stone-500">
                      {p.referenceNumber || '—'}
                    </td>
                    <td className="px-4 py-3">{formatBillingDate(p.receivedAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          PAYMENT_STATUS_STYLES[p.status] || PAYMENT_STATUS_STYLES.PENDING_VERIFICATION
                        }`}
                      >
                        {labelPaymentStatus(p.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/admin/payments/${p._id}`}
                        className="inline-flex items-center rounded border border-stone-200 bg-white px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-50 no-underline shadow-sm"
                      >
                        View
                      </Link>
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

