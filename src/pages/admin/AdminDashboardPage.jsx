import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Sparkles,
  UserRoundCheck,
  UsersRound,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  formatCrmDate,
  labelLeadSource,
  labelLeadStage,
  LEAD_SOURCE_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_STYLES,
  normalizeCountMap,
  parseAdminJsonResponse,
} from '../../lib/crm';

const METRIC_CARDS = [
  { key: 'NEW', label: 'New leads', icon: Sparkles, tone: 'bg-sky-50 text-sky-700 border-sky-100' },
  { key: 'CONTACTED', label: 'Contacted', icon: Clock3, tone: 'bg-violet-50 text-violet-700 border-violet-100' },
  { key: 'QUALIFIED', label: 'Qualified', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { key: 'READY_FOR_QUOTATION', label: 'Ready for quotation', icon: BriefcaseBusiness, tone: 'bg-amber-50 text-amber-800 border-amber-100' },
];

function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading CRM dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-xl border border-stone-200 bg-white" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,.6fr)]">
        <div className="h-80 animate-pulse rounded-xl border border-stone-200 bg-white" />
        <div className="h-80 animate-pulse rounded-xl border border-stone-200 bg-white" />
      </div>
      <span className="sr-only">Loading dashboard data</span>
    </div>
  );
}

function MetricCard({ label, count, icon, tone }) {
  const MetricIcon = icon;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{label}</p>
          <p className="mt-3 text-3xl font-black tabular-nums text-stone-950">{count}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-lg border ${tone}`} aria-hidden="true">
          <MetricIcon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function RecentLeadRow({ lead }) {
  const contactName = lead.contact?.name || 'Unnamed contact';
  const company = lead.contact?.company;

  return (
    <Link
      to={`/admin/crm/${lead._id}`}
      className="grid min-h-0 grid-cols-[minmax(0,1.2fr)_minmax(8rem,.7fr)_minmax(9rem,.7fr)_auto] items-center gap-4 border-t border-stone-100 px-5 py-3.5 text-left no-underline transition hover:bg-stone-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-stone-900">{contactName}</span>
        <span className="mt-0.5 block truncate text-xs text-stone-500">
          {company ? `${company} · ` : ''}{lead.leadNumber || 'Lead'}
        </span>
      </span>
      <span className="truncate text-xs font-semibold text-stone-600">{labelLeadSource(lead.source)}</span>
      <span className={`w-fit rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${LEAD_STAGE_STYLES[lead.stage] || LEAD_STAGE_STYLES.LOST}`}>
        {labelLeadStage(lead.stage)}
      </span>
      <span className="whitespace-nowrap text-xs text-stone-500">{formatCrmDate(lead.updatedAt || lead.createdAt)}</span>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { authFetch, logout } = useAdmin();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/admin/crm/dashboard');
      if (response.status === 401) {
        logout();
        navigate('/admin/login', { replace: true });
        return;
      }
      setDashboard(await parseAdminJsonResponse(response, 'Unable to load the CRM dashboard.'));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load the CRM dashboard.');
    } finally {
      setLoading(false);
    }
  }, [authFetch, logout, navigate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stageCounts = useMemo(() => normalizeCountMap(dashboard?.byStage), [dashboard?.byStage]);
  const sourceCounts = useMemo(() => normalizeCountMap(dashboard?.bySource), [dashboard?.bySource]);
  const maxStageCount = Math.max(1, ...LEAD_STAGES.map(({ value }) => stageCounts[value] || 0));
  const recentLeads = Array.isArray(dashboard?.recentLeads) ? dashboard.recentLeads : [];

  return (
    <div className="mx-auto w-full max-w-[1480px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Operations overview</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">CRM Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-stone-600">
            Live enquiry, pipeline, and customer counts from the current CRM records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            to="/admin/crm"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-stone-950 px-4 text-xs font-bold text-white no-underline transition hover:bg-stone-800"
          >
            Open pipeline
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {error && !dashboard ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800" role="alert">
          <p className="font-bold">Dashboard unavailable</p>
          <p className="mt-1">{error}</p>
          <button type="button" onClick={loadDashboard} className="mt-4 rounded-lg bg-rose-800 px-4 py-2 text-xs font-bold text-white">
            Try again
          </button>
        </div>
      ) : loading && !dashboard ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
              The latest refresh failed. Showing the last loaded values. {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {METRIC_CARDS.map((metric) => (
              <MetricCard
                key={metric.key}
                {...metric}
                count={stageCounts[metric.key] || 0}
              />
            ))}
            <MetricCard
              label="Customers"
              count={Number(dashboard?.metrics?.customers) || 0}
              icon={UsersRound}
              tone="border-stone-200 bg-stone-100 text-stone-700"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.55fr)]">
            <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm" aria-labelledby="recent-leads-heading">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <h2 id="recent-leads-heading" className="text-base font-black text-stone-900">Recent leads</h2>
                  <p className="mt-0.5 text-xs text-stone-500">Most recently updated enquiries and follow-up records.</p>
                </div>
                <UserRoundCheck className="h-5 w-5 text-stone-400" aria-hidden="true" />
              </div>

              {recentLeads.length === 0 ? (
                <div className="border-t border-stone-100 px-5 py-12 text-center">
                  <p className="text-sm font-bold text-stone-700">No leads yet</p>
                  <p className="mt-1 text-xs text-stone-500">New public enquiries will appear here after they are stored.</p>
                </div>
              ) : (
                <>
                  <div className="hidden md:block">
                    {recentLeads.map((lead) => <RecentLeadRow key={lead._id} lead={lead} />)}
                  </div>
                  <div className="divide-y divide-stone-100 border-t border-stone-100 md:hidden">
                    {recentLeads.map((lead) => (
                      <Link key={lead._id} to={`/admin/crm/${lead._id}`} className="block px-5 py-4 no-underline hover:bg-stone-50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-stone-900">{lead.contact?.name || 'Unnamed contact'}</p>
                            <p className="mt-0.5 truncate text-xs text-stone-500">{lead.contact?.company || lead.leadNumber || 'Lead'}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${LEAD_STAGE_STYLES[lead.stage] || LEAD_STAGE_STYLES.LOST}`}>
                            {labelLeadStage(lead.stage)}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-stone-500">
                          <span>{labelLeadSource(lead.source)}</span>
                          <span>{formatCrmDate(lead.updatedAt || lead.createdAt)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="pipeline-counts-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 id="pipeline-counts-heading" className="text-base font-black text-stone-900">Pipeline counts</h2>
                  <p className="mt-0.5 text-xs text-stone-500">All active and closed CRM stages.</p>
                </div>
                <span className="rounded-full bg-stone-950 px-2.5 py-1 text-xs font-black text-white">
                  {Number(dashboard?.metrics?.totalLeads) || 0}
                </span>
              </div>
              <div className="mt-6 space-y-4">
                {LEAD_STAGES.map(({ value, label }) => {
                  const count = stageCounts[value] || 0;
                  const percentage = Math.round((count / maxStageCount) * 100);
                  return (
                    <div key={value}>
                      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-stone-700">{label}</span>
                        <span className="font-black tabular-nums text-stone-950">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-amber-600 transition-[width]"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" aria-labelledby="lead-sources-heading">
            <div>
              <h2 id="lead-sources-heading" className="text-base font-black text-stone-900">Leads by source</h2>
              <p className="mt-0.5 text-xs text-stone-500">Origin of all enquiries currently held in the CRM.</p>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(LEAD_SOURCE_LABELS).map(([source, label]) => (
                <div key={source} className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3.5 py-3">
                  <span className="text-xs font-semibold text-stone-600">{label}</span>
                  <span className="text-sm font-black tabular-nums text-stone-950">{sourceCounts[source] || 0}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
