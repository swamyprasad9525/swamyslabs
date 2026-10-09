import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  RefreshCw,
  Ruler,
  Save,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useAdmin } from '../../context/AdminContext';
import {
  formatCrmDate,
  labelLeadSource,
  labelLeadStage,
  parseAdminJsonResponse,
} from '../../lib/crm';

const STAGE_TRANSITIONS = Object.freeze({
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['READY_FOR_QUOTATION', 'LOST'],
  READY_FOR_QUOTATION: ['LOST'],
  LOST: [],
});

const ACTIVITY_TYPES = [
  { value: 'NOTE', label: 'Note' },
  { value: 'CALL', label: 'Call' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'MEETING', label: 'Meeting' },
];

const STAGE_STYLES = {
  NEW: 'border-sky-200 bg-sky-50 text-sky-700',
  CONTACTED: 'border-violet-200 bg-violet-50 text-violet-700',
  QUALIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  READY_FOR_QUOTATION: 'border-amber-200 bg-amber-50 text-amber-800',
  LOST: 'border-rose-200 bg-rose-50 text-rose-700',
};

const ACTIVITY_STYLES = {
  SYSTEM: 'bg-stone-200 text-stone-700',
  NOTE: 'bg-sky-100 text-sky-700',
  CALL: 'bg-emerald-100 text-emerald-700',
  EMAIL: 'bg-violet-100 text-violet-700',
  WHATSAPP: 'bg-green-100 text-green-700',
  MEETING: 'bg-amber-100 text-amber-800',
  STAGE_CHANGE: 'bg-orange-100 text-orange-700',
};

function valueOrFallback(value, fallback = 'Not provided') {
  if (value === null || value === undefined || value === '') return fallback;
  return value;
}

function formatFileSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size < 0) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not provided';
  return number.toLocaleString('en-IN', options);
}

function formatMetric(value, suffix, options = {}) {
  if (value === null || value === undefined || value === '') return 'Not provided';
  return `${formatNumber(value, options)}${suffix}`;
}

function InfoRow({ label, value, children }) {
  return (
    <div className="grid gap-1 border-b border-stone-100 py-3 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-stone-800">
        {children ?? valueOrFallback(value)}
      </dd>
    </div>
  );
}

function Section({ icon, title, description, children, className = '' }) {
  const Icon = icon;
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white shadow-sm ${className}`}>
      <div className="flex items-start gap-3 border-b border-stone-100 px-5 py-4 sm:px-6">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-base font-black text-stone-950">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-5 text-stone-500">{description}</p>}
        </div>
      </div>
      <div className="px-5 py-2 sm:px-6">{children}</div>
    </section>
  );
}

function Feedback({ type = 'error', children }) {
  const success = type === 'success';
  return (
    <div
      role={success ? 'status' : 'alert'}
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{children}</span>
    </div>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const { authFetch, logout } = useAdmin();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [nextStage, setNextStage] = useState('');
  const [stageReason, setStageReason] = useState('');
  const [activityType, setActivityType] = useState('NOTE');
  const [activityNote, setActivityNote] = useState('');

  const fetchLead = useCallback(async ({ showLoader = true } = {}) => {
    if (showLoader) setLoading(true);
    setLoadError('');
    try {
      const response = await authFetch(`/api/admin/leads/${encodeURIComponent(id)}`);
      if (response.status === 401) {
        logout();
        return null;
      }
      const data = await parseAdminJsonResponse(response, 'Unable to load this lead.');
      setLead(data.lead);
      return data.lead;
    } catch (error) {
      setLoadError(error.message || 'Unable to load this lead.');
      return null;
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [authFetch, id, logout]);

  useEffect(() => {
    fetchLead();
  }, [fetchLead]);

  const allowedTransitions = useMemo(
    () => (lead ? STAGE_TRANSITIONS[lead.stage] || [] : []),
    [lead],
  );

  useEffect(() => {
    setNextStage(allowedTransitions[0] || '');
    setStageReason('');
  }, [allowedTransitions]);

  const activities = useMemo(
    () => [...(lead?.activities || [])].sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    ),
    [lead],
  );

  const customerId = typeof lead?.customer === 'object' ? lead.customer?._id : lead?.customer;
  const canConvert = ['QUALIFIED', 'READY_FOR_QUOTATION'].includes(lead?.stage);
  const hasConversionIdentity = Boolean(lead?.contact?.name && lead?.contact?.phone);

  async function submitStageChange(event) {
    event.preventDefault();
    if (!nextStage) return;
    if (nextStage === 'LOST' && !stageReason.trim()) {
      setActionError('A reason is required when marking a lead as lost.');
      return;
    }
    setBusyAction('stage');
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await authFetch(`/api/admin/leads/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          stage: nextStage,
          reason: stageReason.trim(),
        }),
      });
      if (response.status === 401) {
        logout();
        return;
      }
      await parseAdminJsonResponse(response, 'Unable to change the lead stage.');
      await fetchLead({ showLoader: false });
      setSuccessMessage(`Lead moved to ${labelLeadStage(nextStage)}.`);
    } catch (error) {
      setActionError(error.message || 'Unable to change the lead stage.');
    } finally {
      setBusyAction('');
    }
  }

  async function submitActivity(event) {
    event.preventDefault();
    if (!activityNote.trim()) {
      setActionError('Activity notes are required.');
      return;
    }
    setBusyAction('activity');
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await authFetch(`/api/admin/leads/${encodeURIComponent(id)}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: activityType, note: activityNote.trim() }),
      });
      if (response.status === 401) {
        logout();
        return;
      }
      await parseAdminJsonResponse(response, 'Unable to record this activity.');
      setActivityNote('');
      await fetchLead({ showLoader: false });
      setSuccessMessage(`${ACTIVITY_TYPES.find((item) => item.value === activityType)?.label || 'Activity'} recorded.`);
    } catch (error) {
      setActionError(error.message || 'Unable to record this activity.');
    } finally {
      setBusyAction('');
    }
  }

  async function convertToCustomer() {
    if (!window.confirm('Create a customer from this qualified lead? This will not create a quotation, order, or invoice.')) return;
    setBusyAction('convert');
    setActionError('');
    setSuccessMessage('');
    try {
      const response = await authFetch(`/api/admin/leads/${encodeURIComponent(id)}/convert-to-customer`, {
        method: 'POST',
      });
      if (response.status === 401) {
        logout();
        return;
      }
      const data = await parseAdminJsonResponse(response, 'Unable to convert this lead.');
      await fetchLead({ showLoader: false });
      setSuccessMessage(
        data.converted
          ? `Customer ${data.customer?.customerNumber || ''} created successfully.`.trim()
          : 'This lead was already linked to a customer. No duplicate was created.',
      );
    } catch (error) {
      setActionError(error.message || 'Unable to convert this lead.');
    } finally {
      setBusyAction('');
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl" aria-busy="true">
        <div className="rounded-2xl border border-stone-200 bg-white px-6 py-20 text-center shadow-sm">
          <RefreshCw className="mx-auto h-7 w-7 animate-spin text-amber-600" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-stone-600">Loading lead details…</p>
        </div>
      </div>
    );
  }

  if (loadError || !lead) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link to="/admin/crm" className="inline-flex items-center gap-2 text-sm font-bold text-stone-600 hover:text-stone-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to CRM
        </Link>
        <div className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <Feedback>{loadError || 'Lead not found.'}</Feedback>
          <button
            type="button"
            onClick={() => fetchLead()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-stone-800"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const phoneHref = String(lead.contact?.phone || '').replace(/[^\d+]/g, '');
  const whatsAppNumber = String(lead.contact?.phone || '').replace(/\D/g, '');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/admin/crm" className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-500 hover:text-stone-950">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> CRM pipeline
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">{lead.leadNumber}</h1>
            <span className={`rounded-full border px-3 py-1 text-xs font-black ${STAGE_STYLES[lead.stage] || 'border-stone-200 bg-stone-50 text-stone-700'}`}>
              {labelLeadStage(lead.stage)}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            {labelLeadSource(lead.source)} · Created {formatCrmDate(lead.createdAt, { includeTime: true })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => fetchLead()}
          disabled={loading || Boolean(busyAction)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 shadow-sm hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </div>

      {actionError && <Feedback>{actionError}</Feedback>}
      {successMessage && <Feedback type="success">{successMessage}</Feedback>}

      {lead.stage === 'READY_FOR_QUOTATION' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-black">Ready for Quotation</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            Sales has marked this requirement ready for future commercial quotation preparation. No quotation has been created by this status.
          </p>
        </div>
      )}

      {lead.stage === 'LOST' && lead.lostReason && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
          <span className="font-black">Lost reason: </span>{lead.lostReason}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Section icon={UserRound} title="Contact" description="Customer-provided contact and business details.">
              <dl>
                <InfoRow label="Name" value={lead.contact?.name} />
                <InfoRow label="Company" value={lead.contact?.company} />
                <InfoRow label="Email">
                  {lead.contact?.email ? (
                    <a className="text-amber-700 hover:text-amber-900 hover:underline" href={`mailto:${lead.contact.email}`}>
                      {lead.contact.email}
                    </a>
                  ) : 'Not provided'}
                </InfoRow>
                <InfoRow label="Phone">
                  {lead.contact?.phone ? (
                    <a className="text-amber-700 hover:text-amber-900 hover:underline" href={`tel:${phoneHref}`}>
                      {lead.contact.phone}
                    </a>
                  ) : 'Not provided'}
                </InfoRow>
                <InfoRow label="Location" value={lead.project?.location} />
              </dl>
              {(lead.contact?.email || lead.contact?.phone) && (
                <div className="flex flex-wrap gap-2 border-t border-stone-100 py-4">
                  {lead.contact?.email && (
                    <a href={`mailto:${lead.contact.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
                      <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email
                    </a>
                  )}
                  {lead.contact?.phone && (
                    <a href={`tel:${phoneHref}`} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" /> Call
                    </a>
                  )}
                  {whatsAppNumber && (
                    <a href={`https://wa.me/${whatsAppNumber}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50">
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
              <p className="pb-4 text-[11px] leading-4 text-stone-400">
                Opening a contact shortcut does not log an activity. Record communication explicitly below.
              </p>
            </Section>

            <Section icon={ClipboardList} title="Project requirement" description="The requirement captured with the original enquiry.">
              <dl>
                <InfoRow label="Application" value={lead.project?.application || lead.materialContext?.application} />
                <InfoRow label="Entered area" value={lead.project?.enteredArea} />
                <InfoRow label="Preferred time" value={lead.project?.preferredContactTime} />
                <InfoRow label="Source page" value={lead.project?.sourcePage} />
                <InfoRow label="Message">
                  <span className="whitespace-pre-wrap leading-6">{valueOrFallback(lead.project?.message)}</span>
                </InfoRow>
              </dl>
            </Section>
          </div>

          <Section icon={Ruler} title="Material context" description="Stone and finish selections supplied with the request.">
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <InfoRow label="Stone" value={lead.materialContext?.stoneName} />
              <InfoRow label="Family" value={lead.materialContext?.materialFamily} />
              <InfoRow label="Finish" value={lead.materialContext?.finish} />
              <InfoRow label="Thickness" value={lead.materialContext?.thickness} />
              <InfoRow label="Application" value={lead.materialContext?.application} />
              <InfoRow label="Quantity" value={lead.materialContext?.quantity} />
            </dl>
            {lead.materialSelections?.length > 0 && (
              <div className="border-t border-stone-100 py-4">
                <h3 className="text-xs font-black uppercase tracking-wide text-stone-500">Selected materials</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {lead.materialSelections.map((material, index) => (
                    <div key={`${material.stoneId || material.stoneSlug || material.stoneName}-${index}`} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                      <p className="font-black text-stone-900">{material.stoneName}</p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">
                        {[material.materialFamily, material.finish, material.thickness].filter(Boolean).join(' · ') || 'No additional specification'}
                      </p>
                      {material.quantity != null && <p className="mt-1 text-xs font-bold text-stone-500">Quantity: {material.quantity}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section
            icon={MapPin}
            title="Planner snapshot"
            description="Planning values captured at submission time. These are indicative and are not contractual quantities or prices."
          >
            {Object.values(lead.estimatorContext || {}).some((value) => value !== undefined && value !== null) ? (
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <InfoRow label="Project area" value={formatMetric(lead.estimatorContext?.projectAreaSqFt, ' sq.ft', { maximumFractionDigits: 2 })} />
                <InfoRow label="Allowance" value={formatMetric(lead.estimatorContext?.planningAllowancePercent, '%', { maximumFractionDigits: 2 })} />
                <InfoRow label="Required area" value={formatMetric(lead.estimatorContext?.requiredAreaSqFt, ' sq.ft', { maximumFractionDigits: 2 })} />
                <InfoRow label="Estimated slabs" value={formatNumber(lead.estimatorContext?.estimatedSlabs, { maximumFractionDigits: 0 })} />
                <InfoRow label="Material estimate">
                  {lead.estimatorContext?.indicativeMaterialEstimate != null
                    ? `₹${formatNumber(lead.estimatorContext.indicativeMaterialEstimate, { maximumFractionDigits: 2 })}`
                    : 'Not provided'}
                </InfoRow>
              </dl>
            ) : (
              <p className="py-5 text-sm text-stone-500">No planner snapshot was included with this lead.</p>
            )}
          </Section>

          <Section icon={CalendarClock} title="Activity timeline" description="System events and manually recorded sales activity.">
            {activities.length ? (
              <ol className="py-3">
                {activities.map((activity, index) => (
                  <li key={activity._id || `${activity.createdAt}-${index}`} className="relative flex gap-3 pb-5 last:pb-2">
                    {index < activities.length - 1 && <span className="absolute bottom-0 left-[0.6875rem] top-7 w-px bg-stone-200" aria-hidden="true" />}
                    <span className={`relative mt-1.5 h-6 w-6 shrink-0 rounded-full ring-4 ring-white ${ACTIVITY_STYLES[activity.type] || 'bg-stone-200 text-stone-700'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1 rounded-xl border border-stone-100 bg-stone-50 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-wide text-stone-700">
                          {String(activity.type || 'ACTIVITY').replaceAll('_', ' ')}
                        </span>
                        <time className="text-[11px] font-semibold text-stone-400">
                          {formatCrmDate(activity.createdAt, { includeTime: true })}
                        </time>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{activity.note}</p>
                      <p className="mt-2 text-[11px] text-stone-400">Actor: {valueOrFallback(activity.actor, 'Unknown')}</p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-5 text-sm text-stone-500">No activities have been recorded.</p>
            )}
          </Section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Section icon={Save} title="Lead actions" description="Only valid next stages are available.">
            {allowedTransitions.length ? (
              <form onSubmit={submitStageChange} className="space-y-3 py-4">
                <div>
                  <label htmlFor="lead-stage" className="mb-1.5 block text-xs font-bold text-stone-600">Next stage</label>
                  <select
                    id="lead-stage"
                    value={nextStage}
                    onChange={(event) => {
                      setNextStage(event.target.value);
                      if (event.target.value !== 'LOST') setStageReason('');
                    }}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  >
                    {allowedTransitions.map((stage) => <option key={stage} value={stage}>{labelLeadStage(stage)}</option>)}
                  </select>
                </div>
                {nextStage === 'LOST' && (
                  <div>
                    <label htmlFor="lost-reason" className="mb-1.5 block text-xs font-bold text-stone-600">Reason for loss <span className="text-rose-600">*</span></label>
                    <textarea
                      id="lost-reason"
                      required
                      maxLength={1000}
                      rows={3}
                      value={stageReason}
                      onChange={(event) => setStageReason(event.target.value)}
                      className="w-full resize-y rounded-xl border border-stone-300 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                      placeholder="Record the factual reason"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={Boolean(busyAction) || !nextStage}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-black text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === 'stage' && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Update stage
                </button>
              </form>
            ) : (
              <p className="py-5 text-sm leading-6 text-stone-500">This lead has no configured next stage.</p>
            )}

            <form onSubmit={submitActivity} className="space-y-3 border-t border-stone-100 py-4">
              <div>
                <label htmlFor="activity-type" className="mb-1.5 block text-xs font-bold text-stone-600">Activity type</label>
                <select
                  id="activity-type"
                  value={activityType}
                  onChange={(event) => setActivityType(event.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                >
                  {ACTIVITY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="activity-note" className="mb-1.5 block text-xs font-bold text-stone-600">Notes <span className="text-rose-600">*</span></label>
                <textarea
                  id="activity-note"
                  required
                  maxLength={3000}
                  rows={4}
                  value={activityNote}
                  onChange={(event) => setActivityNote(event.target.value)}
                  className="w-full resize-y rounded-xl border border-stone-300 px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  placeholder="Record what happened; opening a contact link is not recorded automatically."
                />
              </div>
              <button
                type="submit"
                disabled={Boolean(busyAction) || !activityNote.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-black text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === 'activity' && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Record activity
              </button>
            </form>
          </Section>

          <Section icon={UsersRound} title="Customer" description="Conversion preserves this lead and creates only a customer record.">
            <div className="py-4">
              {customerId ? (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-stone-600">
                    Linked to <span className="font-black text-stone-900">{lead.customer?.customerNumber || 'an existing customer'}</span>.
                  </p>
                  <Link to={`/admin/customers/${customerId}`} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-stone-950 hover:bg-amber-300">
                    View customer <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              ) : canConvert ? (
                <div className="space-y-3">
                  {!hasConversionIdentity && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                      A customer name and phone number are required before conversion.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={convertToCustomer}
                    disabled={Boolean(busyAction) || !hasConversionIdentity}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-stone-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyAction === 'convert' && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    Convert to customer
                  </button>
                  <p className="text-[11px] leading-5 text-stone-400">This does not create a quotation, order, invoice, or inventory reservation.</p>
                </div>
              ) : (
                <p className="text-sm leading-6 text-stone-500">Move the lead to Qualified before customer conversion becomes available.</p>
              )}
            </div>
          </Section>

          <Section icon={FileText} title="Attachment" description="Safe metadata retained with the CRM record.">
            <div className="py-4">
              {lead.attachment?.filename ? (
                <dl>
                  <InfoRow label="Filename" value={lead.attachment.filename} />
                  <InfoRow label="Type" value={lead.attachment.mimeType} />
                  <InfoRow label="Size" value={formatFileSize(lead.attachment.size)} />
                </dl>
              ) : (
                <p className="text-sm text-stone-500">No attachment metadata is associated with this lead.</p>
              )}
              <p className="mt-3 rounded-xl bg-stone-50 p-3 text-[11px] leading-5 text-stone-500">
                The CRM stores metadata only. The original file is not stored here and cannot be downloaded from this page.
              </p>
            </div>
          </Section>

          <Section icon={Building2} title="Notification" description="Email is secondary to the durable CRM record.">
            <dl>
              <InfoRow label="Email status" value={lead.notification?.emailStatus} />
              <InfoRow label="Attempted" value={lead.notification?.attemptedAt ? formatCrmDate(lead.notification.attemptedAt, { includeTime: true }) : undefined} />
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}
