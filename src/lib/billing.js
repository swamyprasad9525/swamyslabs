export const INVOICE_DOCUMENT_STATUS_STYLES = Object.freeze({
  DRAFT: 'bg-stone-100 text-stone-700 border-stone-200',
  ISSUED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  VOID: 'bg-rose-50 text-rose-800 border-rose-200',
});

export const INVOICE_PAYMENT_STATUS_STYLES = Object.freeze({
  UNPAID: 'bg-amber-50 text-amber-800 border-amber-200',
  PARTIALLY_PAID: 'bg-sky-50 text-sky-800 border-sky-200',
  PAID: 'bg-emerald-50 text-emerald-800 border-emerald-200',
});

export function labelInvoiceDocumentStatus(status) {
  switch (status) {
    case 'DRAFT': return 'Draft';
    case 'ISSUED': return 'Issued';
    case 'VOID': return 'Void';
    default: return status || 'Unknown';
  }
}

export function labelInvoicePaymentStatus(status) {
  switch (status) {
    case 'UNPAID': return 'Unpaid';
    case 'PARTIALLY_PAID': return 'Partially Paid';
    case 'PAID': return 'Paid';
    default: return status || 'Unpaid';
  }
}

export function formatBillingMoney(minorAmount, currency = 'INR') {
  if (minorAmount == null) return '—';
  const amount = Number(minorAmount) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatBillingDate(date) {
  if (!date) return 'Not recorded';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Invalid date';
  return parsed.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatBillingNumber(value, fractionDigits = 2) {
  if (value == null) return '0';
  return Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
}

export async function parseBillingResponse(response, fallbackMessage = 'Billing request failed') {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
  if (!response.ok) {
    throw new Error(body?.error || fallbackMessage);
  }
  return body;
}

