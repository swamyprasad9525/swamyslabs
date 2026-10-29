export const PAYMENT_METHODS = Object.freeze([
  'BANK_TRANSFER',
  'NEFT',
  'RTGS',
  'UPI',
  'CHEQUE',
]);

export const PAYMENT_STATUSES = Object.freeze([
  'PENDING_VERIFICATION',
  'CONFIRMED',
  'REJECTED',
  'REVERSED',
]);

export const PAYMENT_EVENT_TYPES = Object.freeze([
  'PAYMENT_CREATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
  'PAYMENT_REVERSED',
]);

export const INVOICE_PAYMENT_STATUSES = Object.freeze([
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
]);

export const DEFAULT_PAYMENT_PAGE_SIZE = 20;
export const MAX_PAYMENT_PAGE_SIZE = 100;
