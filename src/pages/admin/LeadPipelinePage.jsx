import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, Filter, MapPin, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  formatCrmDate,
  labelLeadSource,
  LEAD_SOURCE_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_STYLES,
  normalizeCountMap,
  parseAdminJsonResponse,
} from '../../lib/crm';

const EMPTY_FILTERS = Object.freeze({ search: '', source: '', from: '', to: '' });

function leadContext(lead) {
  const material = lead.materialContext?.stoneName;
  const application = lead.project?.application || lead.materialContext?.application;
  const location = lead.project?.location;
  return material || application || location || 'General project enquiry';
}

function leadArea(lead) {
  const requiredArea = Number(lead.estimatorContext?.requiredAreaSqFt);
  if (Number.isFinite(requiredArea) && requiredArea > 0) return `${requiredArea.toLocaleString('en-IN')} sq ft planned`;
  return lead.project?.enteredArea || '';
}

function LeadCard({ lead }) {
  const name = lead.contact?.name || 'Unnamed contact';
  const company = lead.contact?.company;
  const area = leadArea(lead);

  return (
    <Link
      to={`/admin/crm/${lead._id}`}
      className="group block min-h-0 rounded-lg border border-stone-200 bg-white p-3.5 text-left no-underline shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-md bg-stone-100 px-2 py-1 font-mono text-[10px] font-bold text-stone-700">
          {lead.leadNumber || 'Lead'}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-600" aria-hidden="true" />
      </div>
      <h3 className="mt-3 truncate text-sm font-black text-stone-950">{name}</h3>
      {company && <p className="mt-0.5 truncate text-xs font-medium text-stone-500">{company}</p>}

      <div className="mt-3 border-t border-stone-100 pt-3">
        <p className="line-clamp-2 text-xs font-semibold leading-5 text-stone-700">{leadContext(lead)}</p>
        {area && <p className="mt-1 text-[11px] text-stone-500">{area}</p>}
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">{labelLeadSource(lead.source)}</p>
          <p className="mt-1 text-[11px] text-stone-500">{formatCrmDate(lead.createdAt)}</p>
        </div>
        {lead.project?.location && (
          <MapPin className="h-3.5 w-3.5 shrink-0 text-stone-400" aria-label="Project location recorded" />
        )}
      </div>
    </Link>
  );
}

function PipelineColumn({ stage, leads, total, loading }) {
  return (
    <section className="min-w-0 rounded-xl border border-stone-200 bg-stone-100/80" aria-labelledby={`stage-${stage.value}`}>
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-3.5 py-3">
        <h2 id={`stage-${stage.value}`} className="text-xs font-black uppercase tracking-[0.1em] text-stone-800">{stage.label}</h2>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black tabular-nums ${LEAD_STAGE_STYLES[stage.value]}`}>
          {total}
        </span>
      </div>
      <div className="max-h-[62vh] min-h-32 space-y-2.5 overflow-y-auto p-2.5">
        {loading ? (
          Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-lg border border-stone-200 bg-white" />
          ))
        ) : leads.length > 0 ? (
          leads.map((lead) => <LeadCard key={lead._id} lead={lead} />)
        ) : (
          <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-stone-300 bg-white/60 px-4 text-center">
            <p className="text-xs font-semibold text-stone-500">No matching leads</p>
          </div>
        )}
      </div>
      {!loading && total > leads.length && (
        <p className="border-t border-stone-200 px-3 py-2 text-center text-[10px] font-semibold text-stone-500">
          Showing newest {leads.length} of {total}
        </p>
      )}
    </section>
  );
}

export default function LeadPipelinePage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [columns, setColumns] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPipeline = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const commonParams = new URLSearchParams();
      if (filters.search) commonParams.set('search', filters.search);
      if (filters.source) commonParams.set('source', filters.source);
      if (filters.from) commonParams.set('from', filters.from);
      if (filters.to) commonParams.set('to', filters.to);

      const requests = LEAD_STAGES.map(({ value }) => {
        const params = new URLSearchParams(commonParams);
        params.set('stage', value);
        params.set('page', '1');
        params.set('limit', '20');
        return authFetch(`/api/admin/leads?${params.toString()}`);
      });
      requests.push(authFetch('/api/admin/leads/summary'));

      const responses = await Promise.all(requests);
      if (responses.some((response) => response.status === 401)) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }

      const payloads = await Promise.all(
        responses.map((response) => parseAdminJsonResponse(response, 'Unable to load CRM leads.')),
      );
      const nextColumns = Object.fromEntries(
        LEAD_STAGES.map(({ value }, index) => [value, {
          leads: Array.isArray(payloads[index]?.leads) ? payloads[index].leads : [],
          total: Number(payloads[index]?.total) || 0,
        }]),
      );
      setColumns(nextColumns);
      setSummary(payloads.at(-1)?.summary || null);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load CRM leads.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, filters, logout, navigate]);

  useEffect(() => {
    loadPipeline();
  }, [loadPipeline]);

  const filteredTotal = useMemo(
    () => LEAD_STAGES.reduce((sum, { value }) => sum + (columns[value]?.total || 0), 0),
    [columns],
  );
  const allStageCounts = useMemo(() => normalizeCountMap(summary?.byStage), [summary?.byStage]);
  const hasFilters = Object.values(filters).some(Boolean);

  const submitFilters = (event) => {
    event.preventDefault();
    setFilters({
      search: draftFilters.search.trim(),
      source: draftFilters.source,
      from: draftFilters.from,
      to: draftFilters.to,
    });
  };

  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
  };

  const updateDraft = (key) => (event) => {
    setDraftFilters((current) => ({ ...current, [key]: event.target.value }));
  };

  return (
    <div className="mx-auto w-full max-w-[1600px]">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Sales workspace</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">CRM Pipeline</h1>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Review the latest leads by controlled stage. Open a lead to record follow-up or advance it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-600">
            {hasFilters ? `${filteredTotal} matching` : `${Number(summary?.total) || filteredTotal} total`}
          </span>
          <button
            type="button"
            onClick={loadPipeline}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <form onSubmit={submitFilters} className="mb-5 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_13rem_10.5rem_10.5rem_auto] xl:items-end">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
              <Search className="h-3.5 w-3.5" /> Search
            </span>
            <input
              type="search"
              value={draftFilters.search}
              onChange={updateDraft('search')}
              maxLength={120}
              placeholder="Lead, contact, company, stone or location"
              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
              <Filter className="h-3.5 w-3.5" /> Source
            </span>
            <select
              value={draftFilters.source}
              onChange={updateDraft('source')}
              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15"
            >
              <option value="">All sources</option>
              {Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
              <CalendarDays className="h-3.5 w-3.5" /> From
            </span>
            <input
              type="date"
              value={draftFilters.from}
              onChange={updateDraft('from')}
              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500">
              <CalendarDays className="h-3.5 w-3.5" /> To
            </span>
            <input
              type="date"
              value={draftFilters.to}
              onChange={updateDraft('to')}
              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none transition focus:border-amber-600 focus:ring-2 focus:ring-amber-600/15"
            />
          </label>
          <div className="flex gap-2 md:col-span-2 xl:col-span-1">
            <button type="submit" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-bold text-white transition hover:bg-stone-800">
              <SlidersHorizontal className="h-4 w-4" /> Apply
            </button>
            <button type="button" onClick={resetFilters} className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 text-xs font-bold text-stone-600 transition hover:bg-stone-50">
              Reset
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadPipeline} className="shrink-0 rounded-lg bg-rose-800 px-4 py-2 text-xs font-bold text-white">Try again</button>
        </div>
      )}

      <div className="overflow-x-auto overscroll-x-contain rounded-xl" aria-label="Lead pipeline columns">
        <div className="grid min-w-[1160px] grid-cols-5 gap-3 pb-3">
          {LEAD_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.value}
              stage={stage}
              leads={columns[stage.value]?.leads || []}
              total={loading && !columns[stage.value] ? (allStageCounts[stage.value] || 0) : (columns[stage.value]?.total || 0)}
              loading={loading}
            />
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-stone-500 md:hidden">Swipe horizontally to review every pipeline stage.</p>
    </div>
  );
}
