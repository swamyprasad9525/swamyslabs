export const LEAD_STAGES = Object.freeze([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'READY_FOR_QUOTATION',
  'LOST',
]);

export const LEAD_SOURCES = Object.freeze([
  'PROJECT_PLANNER',
  'STONE_ENQUIRY',
  'PROJECT_SELECTION',
  'CONTACT',
  'CALLBACK',
  'CATALOG_REQUEST',
  'OTHER',
]);

export const ACTIVITY_TYPES = Object.freeze([
  'SYSTEM',
  'NOTE',
  'CALL',
  'EMAIL',
  'WHATSAPP',
  'MEETING',
  'STAGE_CHANGE',
]);

export const MANUAL_ACTIVITY_TYPES = Object.freeze([
  'NOTE',
  'CALL',
  'EMAIL',
  'WHATSAPP',
  'MEETING',
]);

export const STAGE_TRANSITIONS = Object.freeze({
  NEW: Object.freeze(['CONTACTED', 'LOST']),
  CONTACTED: Object.freeze(['QUALIFIED', 'LOST']),
  QUALIFIED: Object.freeze(['READY_FOR_QUOTATION', 'LOST']),
  READY_FOR_QUOTATION: Object.freeze(['LOST']),
  LOST: Object.freeze([]),
});

export const TEMPORARY_ADMIN_ACTOR = 'authenticated-admin';
export const SYSTEM_ACTOR = 'system';

export function isAllowedStageTransition(from, to) {
  return Boolean(STAGE_TRANSITIONS[from]?.includes(to));
}
