export const INVOICE_RECORD_VERSION = 2;

export const INVOICE_DOCUMENT_STATUSES = Object.freeze([
  'DRAFT',
  'ISSUED',
  'VOID',
]);

export const INVOICE_PAYMENT_STATUSES = Object.freeze([
  'UNPAID',
  'PARTIALLY_PAID',
  'PAID',
]);

export const INVOICE_EVENT_TYPES = Object.freeze([
  'INVOICE_DRAFT_CREATED',
  'INVOICE_DRAFT_UPDATED',
  'INVOICE_ISSUED',
  'PAYMENT_BALANCE_UPDATED',
]);

export const COMMERCIAL_TAX_TYPES = Object.freeze([
  'NONE',
  'CGST_SGST',
  'IGST',
]);

export const BILLING_CURRENCIES = Object.freeze(['INR']);

