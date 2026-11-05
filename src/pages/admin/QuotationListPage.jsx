import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileCheck2,
  Plus,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AdminEmptyState,
  AdminFeedback,
  AdminMetricCard,
  AdminPage,
  AdminPageHeader,
} from '../../components/admin/AdminPrimitives';
import { useAdmin } from '../../context/AdminContext';
import {
  customerSnapshotName,
  formatCommercialDate,
  formatCommercialMoney,
  labelQuotationStatus,
  parseCommercialResponse,
  quotationCustomer,
  quotationTotals,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_STYLES,
} from '../../lib/commercial';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = Object.freeze({ search: '', status: '', from: '', to: '' });

function count(summary, ...keys) {
  for (const key of keys) {
    const value = summary?.[key] ?? summary?.byStatus?.[key];
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${QUOTATION_STATUS_STYLES[status] || QUOTATION_STATUS_STYLES.DRAFT}`}>
      {labelQuotationStatus(status)}
    </span>
  );
}

function QuotationSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading quotations">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-stone-200 bg-white motion-reduce:animate-none" />)}
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-stone-200 bg-white motion-reduce:animate-none" />
    </div>
  );
}

export default function QuotationListPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [quotations, setQuotations] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadQuotations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const [summaryResponse, listResponse] = await Promise.all([
        authFetch('/api/admin/quotations/summary'),
        authFetch(`/api/admin/quotations?${params.toString()}`),
      ]);
      if (summaryResponse.status === 401 || listResponse.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const [summaryData, listData] = await Promise.all([
        parseCommercialResponse(summaryResponse, 'Unable to load quotation summary.'),
        parseCommercialResponse(listResponse, 'Unable to load quotations.'),
      ]);
      const pagination = listData.pagination || listData;
      setSummary(summaryData.summary || summaryData.metrics || {});
      setQuotations(Array.isArray(listData.quotations) ? listData.quotations : []);
      setTotal(Number(pagination.total) || 0);
      setPages(Math.max(1, Number(pagination.pages) || 1));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load quotations.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, logout, navigate, page]);

  useEffect(() => { loadQuotations(); }, [loadQuotations]);

  function applyFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters({ ...draftFilters, search: draftFilters.search.trim() });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <AdminPage className="space-y-6">
      <Helmet><title>Quotations | Swamy Slabs Admin</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <AdminPageHeader
        eyebrow="Commercial offers"
        title="Quotations"
        description="Prepare controlled commercial offers from verified customers, leads, and canonical stone records. Issued does not imply email delivery."
        actions={(
          <>
            <button type="button" onClick={loadQuotations} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Refresh
            </button>
            <Link to="/admin/quotations/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white no-underline hover:bg-stone-800">
              <Plus className="h-4 w-4" aria-hidden="true" /> New quotation
            </Link>
          </>
        )}
      />

      {error && !summary ? <AdminFeedback title="Quotations unavailable" onRetry={loadQuotations}>{error}</AdminFeedback> : loading && !summary ? <QuotationSkeleton /> : (
        <>
          {error && <AdminFeedback title="Quotation refresh failed" onRetry={loadQuotations}>Showing the last loaded records. {error}</AdminFeedback>}
          <section aria-label="Quotation summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard label="Draft" value={count(summary, 'DRAFT', 'draftQuotations')} icon={FileCheck2} tone="stone" />
            <AdminMetricCard label="Awaiting response" value={count(summary, 'ISSUED', 'issuedQuotations', 'awaitingResponse')} detail="Issued documents; delivery is not inferred." icon={Send} tone="blue" />
            <AdminMetricCard label="Accepted" value={count(summary, 'ACCEPTED', 'acceptedQuotations')} icon={CheckCircle2} tone="emerald" />
            <AdminMetricCard label="Expired" value={count(summary, 'EXPIRED', 'expiredQuotations')} icon={Clock3} tone="amber" />
          </section>

          <form onSubmit={applyFilters} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-stone-500" aria-hidden="true" /><h2 className="text-sm font-black text-stone-900">Find quotations</h2></div>
              {activeFilters > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">{activeFilters} active</span>}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_12rem_10.5rem_10.5rem_auto] xl:items-end">
              <label className="text-xs font-bold text-stone-600">Search
                <span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" /><input maxLength={120} value={draftFilters.search} onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Quotation, customer, lead or stone" className="min-h-11 w-full rounded-lg border border-stone-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /></span>
              </label>
              <label className="text-xs font-bold text-stone-600">Status
                <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"><option value="">All statuses</option>{QUOTATION_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
              </label>
              <label className="text-xs font-bold text-stone-600">Issued from<input type="date" value={draftFilters.from} onChange={(event) => setDraftFilters((current) => ({ ...current, from: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 px-3 text-sm" /></label>
              <label className="text-xs font-bold text-stone-600">Issued to<input type="date" value={draftFilters.to} onChange={(event) => setDraftFilters((current) => ({ ...current, to: event.target.value }))} className="mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 px-3 text-sm" /></label>
              <div className="flex gap-2"><button type="submit" className="min-h-11 flex-1 rounded-lg bg-stone-950 px-4 text-xs font-black text-white">Apply</button>{activeFilters > 0 && <button type="button" onClick={clearFilters} className="min-h-11 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-600">Clear</button>}</div>
            </div>
          </form>

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm" aria-busy={loading}>
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><div><h2 className="text-sm font-black text-stone-950">Quotation records</h2><p className="mt-0.5 text-xs text-stone-500">{total.toLocaleString('en-IN')} matching record{total === 1 ? '' : 's'}</p></div>{loading && <RefreshCw className="h-4 w-4 animate-spin text-amber-700 motion-reduce:animate-none" aria-label="Refreshing" />}</div>
            {!loading && quotations.length === 0 ? (
              <AdminEmptyState icon={FileCheck2} title={activeFilters ? 'No matching quotations' : 'No quotations yet'} description={activeFilters ? 'Change or clear the filters to search again.' : 'Create a draft only after a real customer and verified commercial inputs are available.'} className="py-16" />
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[1080px] border-collapse text-left">
                    <thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">Quotation</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Issue / validity</th><th className="px-4 py-3">Revision</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Updated</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-stone-100">{quotations.map((quotation) => { const customer = quotationCustomer(quotation); const totals = quotationTotals(quotation); const currency = quotation.currency || quotation.financialSnapshot?.currency; return <tr key={quotation._id} className="hover:bg-stone-50"><td className="px-5 py-4"><p className="font-mono text-xs font-black text-amber-800">{quotation.quotationNumber || 'Draft'}</p><p className="mt-1 text-xs text-stone-500">{quotation.lineItems?.length || 0} line item{quotation.lineItems?.length === 1 ? '' : 's'}</p></td><td className="px-4 py-4"><p className="max-w-[15rem] truncate text-sm font-bold text-stone-900">{customerSnapshotName(customer)}</p>{customer.customerNumber && <p className="mt-1 font-mono text-xs text-stone-500">{customer.customerNumber}</p>}</td><td className="px-4 py-4 text-xs text-stone-600"><p>{formatCommercialDate(quotation.issueDate)}</p><p className="mt-1 text-stone-400">Valid {formatCommercialDate(quotation.validUntil)}</p></td><td className="px-4 py-4 text-xs font-bold text-stone-700">R{quotation.revision ?? 1}</td><td className="px-4 py-4"><StatusBadge status={quotation.status} /></td><td className="px-4 py-4 text-right text-sm font-black tabular-nums text-stone-900">{formatCommercialMoney(totals.grandTotalMinor, currency)}</td><td className="px-4 py-4 text-xs text-stone-500">{formatCommercialDate(quotation.updatedAt)}</td><td className="px-5 py-4 text-right"><Link to={`/admin/quotations/${quotation._id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-black text-stone-800 no-underline hover:bg-stone-100">Open <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></td></tr>; })}</tbody>
                  </table>
                </div>
                <div className="divide-y divide-stone-100 xl:hidden">{quotations.map((quotation) => { const customer = quotationCustomer(quotation); const totals = quotationTotals(quotation); const currency = quotation.currency || quotation.financialSnapshot?.currency; return <article key={quotation._id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-black text-amber-800">{quotation.quotationNumber || 'Draft quotation'}</p><h3 className="mt-1 truncate text-sm font-black text-stone-950">{customerSnapshotName(customer)}</h3><p className="mt-1 text-xs text-stone-500">Revision {quotation.revision ?? 1}</p></div><StatusBadge status={quotation.status} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="font-bold text-stone-400">VALID UNTIL</dt><dd className="mt-1 font-semibold text-stone-700">{formatCommercialDate(quotation.validUntil)}</dd></div><div><dt className="font-bold text-stone-400">TOTAL</dt><dd className="mt-1 font-black text-stone-900">{formatCommercialMoney(totals.grandTotalMinor, currency)}</dd></div></dl><Link to={`/admin/quotations/${quotation._id}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 text-xs font-black text-stone-800 no-underline">View quotation <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link></article>; })}</div>
              </>
            )}
          </section>

          <nav aria-label="Quotation pagination" className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-500 shadow-sm"><span>Page {page} of {pages}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Previous</button><button type="button" disabled={page >= pages || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40">Next <ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div></nav>
        </>
      )}
    </AdminPage>
  );
}
