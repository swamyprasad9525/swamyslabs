export const QUOTATION_STATUSES = Object.freeze([
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'SUPERSEDED', label: 'Superseded' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'CANCELLED', label: 'Cancelled' },
]);

export const SALES_ORDER_STATUSES = Object.freeze([
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'PARTIALLY_ALLOCATED', label: 'Partially allocated' },
  { value: 'ALLOCATED', label: 'Allocated' },
  { value: 'IN_PRODUCTION', label: 'In production' },
  { value: 'READY', label: 'Ready' },
  { value: 'CANCELLED', label: 'Cancelled' },
]);

export const COMMERCIAL_UNITS = Object.freeze([
  { value: 'SQ_FT', label: 'sq.ft' },
  { value: 'PIECE', label: 'piece' },
  { value: 'SLAB', label: 'slab' },
]);

export const QUOTATION_STATUS_STYLES = Object.freeze({
  DRAFT: 'border-stone-300 bg-stone-100 text-stone-700',
  ISSUED: 'border-sky-200 bg-sky-50 text-sky-800',
  ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-800',
  EXPIRED: 'border-amber-200 bg-amber-50 text-amber-900',
  SUPERSEDED: 'border-violet-200 bg-violet-50 text-violet-800',
  CONVERTED: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  CANCELLED: 'border-slate-300 bg-slate-100 text-slate-600',
});

export const SALES_ORDER_STATUS_STYLES = Object.freeze({
  CONFIRMED: 'border-sky-200 bg-sky-50 text-sky-800',
  PARTIALLY_ALLOCATED: 'border-amber-200 bg-amber-50 text-amber-900',
  ALLOCATED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  IN_PRODUCTION: 'border-violet-200 bg-violet-50 text-violet-800',
  READY: 'border-teal-200 bg-teal-50 text-teal-800',
  CANCELLED: 'border-rose-200 bg-rose-50 text-rose-800',
});

const QUOTATION_LABELS = Object.freeze(Object.fromEntries(QUOTATION_STATUSES.map(({ value, label }) => [value, label])));
const SALES_ORDER_LABELS = Object.freeze(Object.fromEntries(SALES_ORDER_STATUSES.map(({ value, label }) => [value, label])));
const UNIT_LABELS = Object.freeze(Object.fromEntries(COMMERCIAL_UNITS.map(({ value, label }) => [value, label])));

function fallbackLabel(value, fallback) {
  return value ? String(value).replaceAll('_', ' ').toLowerCase() : fallback;
}

export function labelQuotationStatus(value) {
  return QUOTATION_LABELS[value] || fallbackLabel(value, 'Unknown');
}

export function labelSalesOrderStatus(value) {
  return SALES_ORDER_LABELS[value] || fallbackLabel(value, 'Unknown');
}

export function labelCommercialUnit(value) {
  return UNIT_LABELS[value] || fallbackLabel(value, 'unit');
}

export function formatCommercialDate(value, { includeTime = false } = {}) {
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

export function formatCommercialNumber(value, maximumFractionDigits = 3) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Not recorded';
  return number.toLocaleString('en-IN', { maximumFractionDigits });
}

export function formatCommercialMoney(minorValue, currency) {
  if (minorValue === null || minorValue === undefined || minorValue === '') return 'Not recorded';
  const minor = Number(minorValue);
  if (!Number.isSafeInteger(minor)) return 'Not recorded';
  const code = String(currency || '').trim().toUpperCase();
  const amount = minor / 100;
  if (!code) return `${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (currency not recorded)`;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function customerSnapshotName(value) {
  const customer = value || {};
  return customer.company || customer.name || customer.customerNumber || 'Customer not recorded';
}

export function quotationCustomer(quotation) {
  return quotation?.customerSnapshot || quotation?.customer || quotation?.customerId || {};
}

export function salesOrderCustomer(order) {
  return order?.customerSnapshot || order?.customer || order?.customerId || {};
}

export function commercialStoneName(item) {
  return item?.stoneSnapshot?.name || item?.stoneName || item?.stone?.name || 'Stone not recorded';
}

export function commercialLineQuantity(item) {
  return item?.quantity ?? (Number.isSafeInteger(item?.quantityMilli) ? item.quantityMilli / 1000 : undefined);
}

export function commercialLineRateMinor(item) {
  return item?.unitRateMinor ?? item?.rateMinor;
}

export function quotationTotals(quotation) {
  return quotation?.financialSnapshot?.totals || quotation?.totals || quotation || {};
}

export function normalizedAllowedActions(record) {
  const value = record?.allowedActions;
  if (Array.isArray(value)) return new Set(value.map((action) => String(action).toLowerCase()));
  if (value && typeof value === 'object') {
    return new Set(Object.entries(value).filter(([, allowed]) => Boolean(allowed)).map(([action]) => action.toLowerCase()));
  }
  return null;
}

export function actionIsAllowed(record, action, fallback = false) {
  const actions = normalizedAllowedActions(record);
  return actions ? actions.has(String(action).toLowerCase()) : fallback;
}

export async function parseCommercialResponse(response, fallbackMessage = 'The commercial request could not be completed.') {
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  const error = new Error(data.error || data.message || fallbackMessage);
  error.status = response.status;
  error.code = data.code;
  error.details = data.details;
  throw error;
}

export function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function minorInputValue(value) {
  if (!Number.isSafeInteger(Number(value))) return '';
  return (Number(value) / 100).toFixed(2);
}

export function milliInputValue(value) {
  if (!Number.isSafeInteger(Number(value))) return '';
  return String(Number(value) / 1000);
}

export function basisPointsInputValue(value) {
  if (!Number.isSafeInteger(Number(value))) return '';
  return String(Number(value) / 100);
}
