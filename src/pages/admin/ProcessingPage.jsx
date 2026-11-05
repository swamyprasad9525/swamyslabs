import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  PackageOpen,
  Plus,
  RefreshCw,
  Search,
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
import { getAllStones } from '../../lib/catalog';
import {
  currentProcessingOperation,
  formatProcessingDate,
  formatProcessingNumber,
  labelProcessingOperation,
  labelProcessingStatus,
  parseProcessingResponse,
  processingProgress,
  PROCESSING_JOB_STATUSES,
  PROCESSING_OPERATIONS,
  PROCESSING_STATUS_STYLES,
} from '../../lib/processing';

const PAGE_SIZE = 20;
const EMPTY_FILTERS = Object.freeze({ search: '', status: '', operation: '', stone: '' });

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${PROCESSING_STATUS_STYLES[status] || PROCESSING_STATUS_STYLES.DRAFT}`}>
      {labelProcessingStatus(status)}
    </span>
  );
}

function jobStone(job) {
  return job?.stoneSnapshot || job?.stoneRef || {};
}

function jobBatchNumber(job) {
  return job?.input?.batchNumber || job?.source?.batchNumber || job?.batch?.batchNumber || 'Batch not recorded';
}

function ProcessingSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading processing jobs">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-stone-200 bg-white motion-reduce:animate-none" />)}
      </div>
      <div className="h-96 animate-pulse rounded-xl border border-stone-200 bg-white motion-reduce:animate-none" />
      <span className="sr-only">Loading processing data</span>
    </div>
  );
}

function Progress({ job }) {
  const progress = processingProgress(job);
  return (
    <div className="min-w-[7rem]">
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-stone-500">
        <span>Operations</span><span>{progress}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-stone-100"
        role="progressbar"
        aria-label="Processing operations completed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-full rounded-full bg-amber-600" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export default function ProcessingPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const stones = useMemo(
    () => getAllStones().slice().sort((left, right) => left.name.localeCompare(right.name)),
    [],
  );
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProcessing = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      const [summaryResponse, jobsResponse] = await Promise.all([
        authFetch('/api/admin/processing/summary'),
        authFetch(`/api/admin/processing/jobs?${params.toString()}`),
      ]);
      if (summaryResponse.status === 401 || jobsResponse.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      const [summaryData, jobsData] = await Promise.all([
        parseProcessingResponse(summaryResponse, 'Unable to load production summary.'),
        parseProcessingResponse(jobsResponse, 'Unable to load processing jobs.'),
      ]);
      setSummary(summaryData.summary || {});
      setJobs(Array.isArray(jobsData.jobs) ? jobsData.jobs : []);
      setTotal(Number(jobsData.total) || 0);
      setPages(Math.max(1, Number(jobsData.pages) || 1));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load processing jobs.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, logout, navigate, page]);

  useEffect(() => {
    loadProcessing();
  }, [loadProcessing]);

  function submitFilters(event) {
    event.preventDefault();
    setPage(1);
    setFilters({
      search: draftFilters.search.trim(),
      status: draftFilters.status,
      operation: draftFilters.operation,
      stone: draftFilters.stone,
    });
  }

  function clearFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const updateDraft = (field) => (event) => {
    setDraftFilters((current) => ({ ...current, [field]: event.target.value }));
  };
  const activeFilters = Object.values(filters).filter(Boolean).length;

  return (
    <AdminPage className="space-y-6">
      <Helmet>
        <title>Processing | Swamy Slabs Admin</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <AdminPageHeader
        eyebrow="Production control"
        title="Processing & Production"
        description="Track material issued from inventory, ordered operations, quality control, and verified stock return."
        actions={(
          <>
          <button type="button" onClick={loadProcessing} disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" /> Refresh
          </button>
          <Link to="/admin/processing/jobs/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-black text-white no-underline hover:bg-stone-800">
            <Plus className="h-4 w-4" aria-hidden="true" /> New processing job
          </Link>
          </>
        )}
      />

      {error && !summary ? (
        <AdminFeedback title="Processing unavailable" onRetry={loadProcessing}>{error}</AdminFeedback>
      ) : loading && !summary ? (
        <ProcessingSkeleton />
      ) : (
        <>
          {error && <AdminFeedback title="Processing refresh failed" onRetry={loadProcessing}>Showing the last loaded data. {error}</AdminFeedback>}

          <section aria-label="Production summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <AdminMetricCard label="Planned" value={formatProcessingNumber(summary?.plannedJobs ?? 0, 0)} icon={CalendarClock} tone="blue" />
            <AdminMetricCard label="In production" value={formatProcessingNumber(summary?.inProgressJobs ?? 0, 0)} icon={Factory} tone="amber" />
            <AdminMetricCard label="QC pending" value={formatProcessingNumber(summary?.qcPendingJobs ?? 0, 0)} icon={ClipboardCheck} tone="violet" />
            <AdminMetricCard label="Completed recently" value={formatProcessingNumber(summary?.completedRecently ?? 0, 0)} detail="Completed in the backend-defined 30-day window." icon={CheckCircle2} tone="emerald" />
            <AdminMetricCard label="Overdue" value={formatProcessingNumber(summary?.overdueJobs ?? 0, 0)} detail="Only jobs with a recorded expected date." icon={AlertCircle} tone="rose" />
            <AdminMetricCard
              label="Material in processing"
              value={`${formatProcessingNumber(summary?.materialInProcessing?.jobs ?? 0, 0)} jobs`}
              detail={summary?.materialInProcessing
                ? summary.materialInProcessing.areaSqFt == null
                  ? 'No active input area is recorded.'
                  : `${formatProcessingNumber(summary.materialInProcessing.areaSqFt)} sq.ft recorded across ${formatProcessingNumber(summary.materialInProcessing.areaTrackedJobs, 0)} area-tracked jobs.`
                : 'No active production material is recorded.'}
              icon={PackageOpen}
              tone="stone"
            />
          </section>

          <form onSubmit={submitFilters} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-stone-500" /><h2 className="text-sm font-black text-stone-900">Find production jobs</h2></div>
              {activeFilters > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black text-amber-900">{activeFilters} active</span>}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1.3fr)_minmax(10rem,.8fr)_minmax(11rem,.9fr)_minmax(12rem,1fr)_auto]">
              <label className="text-xs font-bold text-stone-600">Search
                <span className="relative mt-1.5 block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><input maxLength={120} value={draftFilters.search} onChange={updateDraft('search')} placeholder="Job, batch or stone" className="w-full rounded-lg border border-stone-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200" /></span>
              </label>
              <label className="text-xs font-bold text-stone-600">Status
                <select value={draftFilters.status} onChange={updateDraft('status')} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"><option value="">All statuses</option>{PROCESSING_JOB_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
              </label>
              <label className="text-xs font-bold text-stone-600">Current operation
                <select value={draftFilters.operation} onChange={updateDraft('operation')} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"><option value="">All operations</option>{PROCESSING_OPERATIONS.map((operation) => <option key={operation.value} value={operation.value}>{operation.label}</option>)}</select>
              </label>
              <label className="text-xs font-bold text-stone-600">Stone
                <select value={draftFilters.stone} onChange={updateDraft('stone')} className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"><option value="">All stones</option>{stones.map((stone) => <option key={stone.slug} value={stone.slug}>{stone.name}</option>)}</select>
              </label>
              <div className="flex items-end gap-2"><button type="submit" className="min-h-11 flex-1 rounded-lg bg-stone-950 px-4 text-xs font-black text-white hover:bg-stone-800">Apply</button>{activeFilters > 0 && <button type="button" onClick={clearFilters} className="min-h-11 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-600">Clear</button>}</div>
            </div>
          </form>

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm" aria-busy={loading}>
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4"><div><h2 className="text-sm font-black text-stone-950">Processing jobs</h2><p className="mt-0.5 text-xs text-stone-500">{total.toLocaleString('en-IN')} matching record{total === 1 ? '' : 's'}</p></div>{loading && <RefreshCw className="h-4 w-4 animate-spin text-amber-700 motion-reduce:animate-none" aria-label="Refreshing" />}</div>
            {!loading && jobs.length === 0 ? (
              <AdminEmptyState
                icon={Factory}
                title={activeFilters ? 'No matching jobs' : 'No processing jobs yet'}
                description={activeFilters ? 'Change or clear the filters to search again.' : 'Create a job only when real inventory and a verified processing route are known.'}
                className="py-16"
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto xl:block">
                  <table className="w-full min-w-[1100px] border-collapse text-left">
                    <thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">Job / stone</th><th className="px-4 py-3">Batch</th><th className="px-4 py-3">Current operation</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Started / expected</th><th className="px-4 py-3">Updated</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
                    <tbody className="divide-y divide-stone-100">{jobs.map((job) => { const current = currentProcessingOperation(job); return <tr key={job._id} className="hover:bg-stone-50"><td className="px-5 py-4"><p className="font-mono text-xs font-black text-amber-800">{job.jobNumber}</p><p className="mt-1 max-w-[16rem] text-sm font-bold text-stone-900">{jobStone(job).name || 'Stone not recorded'}</p></td><td className="px-4 py-4 font-mono text-xs font-bold text-stone-700">{jobBatchNumber(job)}</td><td className="px-4 py-4 text-xs font-semibold text-stone-700">{current ? labelProcessingOperation(current.operation) : job.status === 'COMPLETED' ? 'Complete' : 'Not started'}</td><td className="px-4 py-4"><Progress job={job} /></td><td className="px-4 py-4"><StatusBadge status={job.status} /></td><td className="px-4 py-4 text-xs text-stone-600"><p>{formatProcessingDate(job.startedAt)}</p><p className="mt-1 text-stone-400">Due {formatProcessingDate(job.expectedCompletionDate)}</p></td><td className="px-4 py-4 text-xs text-stone-500">{formatProcessingDate(job.updatedAt)}</td><td className="px-5 py-4 text-right"><Link to={`/admin/processing/jobs/${job._id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-stone-200 px-3 text-xs font-black text-stone-800 no-underline hover:bg-stone-100">Open <ArrowRight className="h-3.5 w-3.5" /></Link></td></tr>; })}</tbody>
                  </table>
                </div>
                <div className="divide-y divide-stone-100 xl:hidden">{jobs.map((job) => { const current = currentProcessingOperation(job); return <article key={job._id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-mono text-xs font-black text-amber-800">{job.jobNumber}</p><h3 className="mt-1 text-sm font-black text-stone-950">{jobStone(job).name || 'Stone not recorded'}</h3><p className="mt-1 font-mono text-xs text-stone-500">{jobBatchNumber(job)}</p></div><StatusBadge status={job.status} /></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-stone-600"><div><p className="font-bold text-stone-400">CURRENT</p><p className="mt-1 font-semibold">{current ? labelProcessingOperation(current.operation) : 'Not active'}</p></div><div><p className="font-bold text-stone-400">EXPECTED</p><p className="mt-1 font-semibold">{formatProcessingDate(job.expectedCompletionDate)}</p></div></div><div className="mt-4"><Progress job={job} /></div><Link to={`/admin/processing/jobs/${job._id}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 text-xs font-black text-stone-800 no-underline">View job <ArrowRight className="h-4 w-4" /></Link></article>; })}</div>
              </>
            )}
          </section>

          <nav aria-label="Processing job pagination" className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-500 shadow-sm">
            <span>Page {page} of {pages}</span>
            <div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Previous</button><button type="button" disabled={page >= pages || loading} onClick={() => setPage((current) => current + 1)} className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-stone-200 px-3 font-bold disabled:opacity-40">Next <ArrowRight className="h-4 w-4" /></button></div>
          </nav>
        </>
      )}
    </AdminPage>
  );
}
