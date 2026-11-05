export const PAYMENT_STATUS_STYLES = Object.freeze({
  PENDING_VERIFICATION: 'bg-amber-50 text-amber-800 border-amber-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200',
  REVERSED: 'bg-stone-100 text-stone-700 border-stone-200',
});

export const PAYMENT_METHODS = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'NEFT', label: 'NEFT' },
  { value: 'RTGS', label: 'RTGS' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
];

export function labelPaymentStatus(status) {
  switch (status) {
    case 'PENDING_VERIFICATION': return 'Pending Verification';
    case 'CONFIRMED': return 'Confirmed';
    case 'REJECTED': return 'Rejected';
    case 'REVERSED': return 'Reversed';
    default: return status || 'Unknown';
  }
}

export function labelPaymentMethod(method) {
  switch (method) {
    case 'BANK_TRANSFER': return 'Bank Transfer';
    case 'NEFT': return 'NEFT';
    case 'RTGS': return 'RTGS';
    case 'UPI': return 'UPI';
    case 'CHEQUE': return 'Cheque';
    default: return method || 'Other';
  }
}

export async function parsePaymentResponse(response, fallbackMessage = 'Payment request failed') {
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

