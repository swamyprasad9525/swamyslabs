export const PROCESSING_JOB_STATUSES = Object.freeze([
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'QC_PENDING', label: 'QC pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]);

export const PROCESSING_STATUS_LABELS = Object.freeze(
  Object.fromEntries(PROCESSING_JOB_STATUSES.map(({ value, label }) => [value, label])),
);

export const PROCESSING_STATUS_STYLES = Object.freeze({
  DRAFT: 'border-stone-300 bg-stone-100 text-stone-700',
  PLANNED: 'border-sky-200 bg-sky-50 text-sky-800',
  IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-900',
  QC_PENDING: 'border-violet-200 bg-violet-50 text-violet-800',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-800',
});

export const PROCESSING_OPERATIONS = Object.freeze([
  { value: 'CUTTING', label: 'Cutting' },
  { value: 'SHAPING', label: 'Shaping' },
  { value: 'CALIBRATION', label: 'Calibration' },
  { value: 'HONING', label: 'Honing' },
  { value: 'POLISHING', label: 'Polishing' },
  { value: 'TUMBLING', label: 'Tumbling' },
  { value: 'EDGE_FINISH', label: 'Edge finishing' },
]);

export const PROCESSING_OPERATION_LABELS = Object.freeze(
  Object.fromEntries(PROCESSING_OPERATIONS.map(({ value, label }) => [value, label])),
);

export const OPERATION_STATUS_LABELS = Object.freeze({
  PENDING: 'Pending',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
});

export const QC_RESULT_LABELS = Object.freeze({
  PASS: 'Pass',
  HOLD: 'Hold',
  FAIL: 'Fail',
});

export const PROCESSING_EVENT_LABELS = Object.freeze({
  JOB_CREATED: 'Job created',
  JOB_PLANNED: 'Job planned',
  JOB_STARTED: 'Material issued to production',
  OPERATION_STARTED: 'Operation started',
  OPERATION_COMPLETED: 'Operation completed',
  QC_RECORDED: 'Quality check recorded',
  JOB_COMPLETED: 'Material returned to inventory',
  JOB_CANCELLED: 'Job cancelled',
  NOTE: 'Note added',
});

export function labelProcessingStatus(value) {
  return PROCESSING_STATUS_LABELS[value]
    || String(value || 'Unknown').replaceAll('_', ' ').toLowerCase();
}

export function labelProcessingOperation(value) {
  return PROCESSING_OPERATION_LABELS[value]
    || String(value || 'Unknown operation').replaceAll('_', ' ').toLowerCase();
}

export function labelOperationStatus(value) {
  return OPERATION_STATUS_LABELS[value]
    || String(value || 'Unknown').replaceAll('_', ' ').toLowerCase();
}

export function labelQcResult(value) {
  return QC_RESULT_LABELS[value]
    || String(value || 'Not recorded').replaceAll('_', ' ').toLowerCase();
}

export function labelProcessingEvent(value) {
  return PROCESSING_EVENT_LABELS[value]
    || String(value || 'Production event').replaceAll('_', ' ').toLowerCase();
}

export function processingProgress(job) {
  const routing = Array.isArray(job?.routing) ? job.routing : [];
  if (!routing.length) return 0;
  const completed = routing.filter((operation) => operation.status === 'COMPLETED').length;
  return Math.round((completed / routing.length) * 100);
}

export function currentProcessingOperation(job) {
  const routing = Array.isArray(job?.routing) ? job.routing : [];
  if (job?.currentOperation?.operation) {
    const currentId = String(job.currentOperation.operationId || job.currentOperation._id || '');
    const routeOperation = routing.find((operation) => (
      String(operation._id || '') === currentId
      || (operation.sequence === job.currentOperation.sequence
        && operation.operation === job.currentOperation.operation)
    ));
    return routeOperation
      ? { ...routeOperation, ...job.currentOperation, status: routeOperation.status }
      : job.currentOperation;
  }
  return routing.find((operation) => operation.status !== 'COMPLETED') || null;
}

export function formatProcessingDate(value, { includeTime = false } = {}) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatProcessingNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not recorded';
  return number.toLocaleString('en-IN', { maximumFractionDigits });
}

export async function parseProcessingResponse(
  response,
  fallbackMessage = 'The processing request could not be completed.',
) {
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  const error = new Error(data.error || data.message || fallbackMessage);
  error.status = response.status;
  throw error;
}

export function compactProcessingObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => entry !== '' && entry !== null && entry !== undefined),
  );
}
