export const DISPATCH_STATUSES = Object.freeze([
  'DRAFT',
  'READY_TO_DISPATCH',
  'DISPATCHED',
  'CANCELLED',
]);

export const DISPATCH_EVENT_TYPES = Object.freeze([
  'DISPATCH_CREATED',
  'DISPATCH_UPDATED',
  'DISPATCH_MARKED_READY',
  'DISPATCH_CONFIRMED',
  'DISPATCH_CANCELLED',
]);

export const DISPATCH_TRANSITIONS = Object.freeze({
  DRAFT: Object.freeze(['READY_TO_DISPATCH', 'CANCELLED']),
  READY_TO_DISPATCH: Object.freeze(['DISPATCHED', 'CANCELLED']),
  DISPATCHED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
});

export const DISPATCH_REFERENCE_PREFIX = 'DSP';
export const DEFAULT_DISPATCH_PAGE_SIZE = 20;
export const MAX_DISPATCH_PAGE_SIZE = 100;
export const MAX_DISPATCH_RESERVATIONS = 100;

export function isDispatchTransitionAllowed(currentStatus, nextStatus) {
  return Boolean(DISPATCH_TRANSITIONS[currentStatus]?.includes(nextStatus));
}
