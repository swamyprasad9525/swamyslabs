export const QUOTATION_STATUSES = Object.freeze([
  'DRAFT',
  'ISSUED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'SUPERSEDED',
  'CONVERTED',
  'CANCELLED',
]);

export const QUOTATION_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['ISSUED', 'CANCELLED']),
  ISSUED: Object.freeze(['ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED']),
  ACCEPTED: Object.freeze(['CONVERTED', 'CANCELLED']),
  REJECTED: Object.freeze(['SUPERSEDED']),
  EXPIRED: Object.freeze(['SUPERSEDED']),
  SUPERSEDED: Object.freeze([]),
  CONVERTED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

export const QUOTATION_EVENT_TYPES = Object.freeze([
  'QUOTATION_CREATED',
  'QUOTATION_UPDATED',
  'QUOTATION_ISSUED',
  'QUOTATION_ACCEPTED',
  'QUOTATION_REJECTED',
  'QUOTATION_EXPIRED',
  'QUOTATION_SUPERSEDED',
  'QUOTATION_CANCELLED',
  'QUOTATION_CONVERTED',
  'NOTE',
]);

export const SALES_ORDER_STATUSES = Object.freeze([
  'CONFIRMED',
  'PARTIALLY_ALLOCATED',
  'ALLOCATED',
  'IN_PRODUCTION',
  'READY',
  'CANCELLED',
]);

export const SALES_ORDER_EVENT_TYPES = Object.freeze([
  'SALES_ORDER_CREATED',
  'SALES_ORDER_UPDATED',
  'ALLOCATION_UPDATED',
  'RESERVATION_CREATED',
  'RESERVATION_RELEASED',
  'PROCESSING_JOB_LINKED',
  'PROCESSING_JOB_UNLINKED',
  'DISPATCH_CONFIRMED',
  'STATUS_CHANGED',
  'SALES_ORDER_CANCELLED',
  'NOTE',
]);

export const RESERVATION_STATUSES = Object.freeze([
  'ACTIVE',
  'RELEASED',
  'CONSUMED',
]);

export const RESERVATION_EVENT_TYPES = Object.freeze([
  'RESERVED',
  'RELEASED',
  'CONSUMED',
]);

export const SALES_ORDER_FULFILLMENT_STATUSES = Object.freeze([
  'UNFULFILLED',
  'PARTIALLY_DISPATCHED',
  'FULLY_DISPATCHED',
]);

export const COMMERCIAL_UNITS = Object.freeze([
  'SQ_FT',
  'PIECE',
  'SLAB',
]);

export const COMMERCIAL_CURRENCIES = Object.freeze(['INR']);
export const COMMERCIAL_TAX_TYPES = Object.freeze(['NONE', 'UNSPECIFIED', 'IGST', 'CGST_SGST']);

export const QUOTATION_REFERENCE_PREFIX = 'QT';
export const SALES_ORDER_REFERENCE_PREFIX = 'SO';
export const RESERVATION_REFERENCE_PREFIX = 'RSV';
export const DEFAULT_COMMERCIAL_PAGE_SIZE = 20;
export const MAX_COMMERCIAL_PAGE_SIZE = 100;
export const MAX_COMMERCIAL_LINE_ITEMS = 50;

export function isQuotationTransitionAllowed(currentStatus, nextStatus) {
  return Boolean(QUOTATION_TRANSITIONS[currentStatus]?.includes(nextStatus));
}
