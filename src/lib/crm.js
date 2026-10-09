export const LEAD_STAGES = Object.freeze([
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'READY_FOR_QUOTATION', label: 'Ready for quotation' },
  { value: 'LOST', label: 'Lost' },
]);

export const LEAD_STAGE_LABELS = Object.freeze(
  Object.fromEntries(LEAD_STAGES.map(({ value, label }) => [value, label])),
);

export const LEAD_SOURCE_LABELS = Object.freeze({
  PROJECT_PLANNER: 'Project planner',
  STONE_ENQUIRY: 'Stone enquiry',
  PROJECT_SELECTION: 'Project selection',
  CONTACT: 'Contact form',
  CALLBACK: 'Callback request',
  CATALOG_REQUEST: 'Catalog request',
  OTHER: 'Other',
});

export const LEAD_STAGE_STYLES = Object.freeze({
  NEW: 'border-sky-200 bg-sky-50 text-sky-800',
  CONTACTED: 'border-violet-200 bg-violet-50 text-violet-800',
  QUALIFIED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  READY_FOR_QUOTATION: 'border-amber-200 bg-amber-50 text-amber-900',
  LOST: 'border-stone-300 bg-stone-100 text-stone-600',
});

export function labelLeadStage(value) {
  return LEAD_STAGE_LABELS[value] || String(value || 'Unknown').replaceAll('_', ' ').toLowerCase();
}

export function labelLeadSource(value) {
  return LEAD_SOURCE_LABELS[value] || String(value || 'Unknown').replaceAll('_', ' ').toLowerCase();
}

export function formatCrmDate(value, { includeTime = false } = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function normalizeCountMap(value) {
  if (Array.isArray(value)) {
    return value.reduce((result, item) => {
      const key = item?._id ?? item?.stage ?? item?.source;
      if (key) result[key] = Number(item?.count) || 0;
      return result;
    }, {});
  }

  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, count]) => [key, Number(count) || 0]),
  );
}

export async function parseAdminJsonResponse(response, fallbackMessage = 'The request could not be completed.') {
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;

  const error = new Error(data.error || data.message || fallbackMessage);
  error.status = response.status;
  throw error;
}
