export const INVENTORY_MODES = Object.freeze([
  'BATCH',
  'INDIVIDUAL_SLAB',
]);

export const INVENTORY_STATUSES = Object.freeze([
  'DRAFT',
  'AVAILABLE',
  'HOLD',
  'DEPLETED',
  'ARCHIVED',
]);

export const MOVEMENT_TYPES = Object.freeze([
  'RECEIPT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER',
]);

export const ADJUSTMENT_DIRECTIONS = Object.freeze(['IN', 'OUT']);
export const AREA_BASES = Object.freeze(['VERIFIED', 'CALCULATED']);

export const AREA_SQ_MM_PER_SQ_FT = 92903.04;
export const DEFAULT_INVENTORY_PAGE_SIZE = 20;
export const MAX_INVENTORY_PAGE_SIZE = 100;

export const INVENTORY_REFERENCE_PREFIXES = Object.freeze({
  BATCH: 'BAT',
  SLAB: 'SLB',
});

export const FUTURE_MOVEMENT_LINK_FIELDS = Object.freeze([
  'relatedProcessingJobId',
  'relatedQuotationId',
  'relatedSalesOrderId',
  'relatedDispatchId',
]);

