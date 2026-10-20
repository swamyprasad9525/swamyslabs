import { Link2, RefreshCw, Search } from 'lucide-react';
import { commercialStoneName } from '../../lib/commercial';
import { labelProcessingStatus, PROCESSING_STATUS_STYLES } from '../../lib/processing';

const INPUT = 'mt-1.5 min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200';

export default function ProcessingJobPicker({ line, draft, setDraft, search, loading, error, jobs, selected, select, meta, previous, next, close, submit, busy }) {
  if (!line) return null;

  const requirements = (line.processingRequirements || [])
    .map((entry) => (typeof entry === 'string' ? entry : entry.operation))
    .filter(Boolean);

  return (
    <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-violet-950">Select a processing job</h3>
          <p className="mt-1 text-xs text-violet-800">
            {commercialStoneName(line)}
            {requirements.length > 0 && <> · {requirements.join(', ').replaceAll('_', ' ')}</>}
          </p>
        </div>
        <button type="button" onClick={close} className="min-h-10 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold text-violet-900">
          Close
        </button>
      </div>

      <form onSubmit={search} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <label className="text-xs font-bold text-violet-900">
          Search jobs
          <input
            type="search"
            value={draft.search}
            maxLength={120}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
            className={INPUT}
            placeholder="Job number, stone, or batch"
          />
        </label>
        <label className="text-xs font-bold text-violet-900">
          Status
          <select
            value={draft.status}
            onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
            className={INPUT}
          >
            <option value="DRAFT">Draft</option>
            <option value="PLANNED">Planned</option>
          </select>
        </label>
        <button type="submit" disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-4 text-xs font-black text-violet-900 disabled:opacity-50">
          <Search className="h-4 w-4" aria-hidden="true" />
          Apply
        </button>
      </form>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm font-bold text-violet-800" role="status">
          <RefreshCw className="mr-2 inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading processing jobs…
        </p>
      ) : jobs.length === 0 ? (
        <p className="mt-4 rounded-lg border border-violet-200 bg-white p-5 text-center text-sm text-violet-800">
          No {draft.status === 'PLANNED' ? 'planned' : 'draft'} processing jobs match the applied filters.
        </p>
      ) : (
        <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Linkable processing jobs">
          {jobs.map((job) => {
            const jobId = String(job._id);
            const isSelected = selected === jobId;
            const stone = job.stoneSnapshot || job.stoneRef || {};
            return (
              <label
                key={jobId}
                className={['flex cursor-pointer flex-col gap-3 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between', isSelected ? 'border-violet-500 ring-2 ring-violet-100' : 'border-violet-200'].join(' ')}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <input type="radio" name="processing-job" value={jobId} checked={isSelected} onChange={() => select(jobId)} className="mt-1" />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-black text-violet-900">{job.jobNumber || jobId}</span>
                    <span className="mt-1 block truncate text-sm font-bold text-stone-900">{stone.name || 'Stone not recorded'}</span>
                  </span>
                </span>
                <span className={['inline-flex self-start rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide', PROCESSING_STATUS_STYLES[job.status] || PROCESSING_STATUS_STYLES.DRAFT].join(' ')}>
                  {labelProcessingStatus(job.status)}
                </span>
              </label>
            );
          })}
        </div>
      )}

      <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-violet-200 pt-4" aria-label="Processing job pagination">
        <p className="text-xs text-violet-800" aria-live="polite">
          {meta.total} eligible job{meta.total === 1 ? '' : 's'} · Page {meta.page} of {meta.pages}
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={loading || meta.page <= 1} onClick={previous} className="min-h-10 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold text-violet-900 disabled:opacity-50">
            Previous
          </button>
          <button type="button" disabled={loading || meta.page >= meta.pages} onClick={next} className="min-h-10 rounded-lg border border-violet-300 bg-white px-3 text-xs font-bold text-violet-900 disabled:opacity-50">
            Next
          </button>
        </div>
      </nav>

      <div className="mt-4 flex flex-col gap-3 border-t border-violet-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[11px] leading-5 text-violet-800">
          Only Draft and Planned jobs are offered. The server remains the final authority for stone, routing, inventory, and existing-link compatibility.
        </p>
        <button type="button" onClick={submit} disabled={busy || loading || !selected} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-900 px-5 text-xs font-black text-white disabled:opacity-50">
          {busy ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
          Link selected job
        </button>
      </div>
    </div>
  );
}
