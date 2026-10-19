import { INVENTORY_MODES } from '../constants/inventory.js';
import {
  PROCESSING_JOB_STATUSES,
  PROCESSING_OPERATION_TYPES,
  PROCESSING_QC_RESULTS,
} from '../constants/processing.js';
import { resolveCatalogStoneReference } from './catalogBridge.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const MAX_ROUTE_OPERATIONS = 25;
const MAX_SLABS_PER_JOB = 500;

const JOB_CREATE_FIELDS = new Set([
  'inventoryMode',
  'input',
  'target',
  'routing',
  'expectedCompletionDate',
  'notes',
]);

const JOB_UPDATE_FIELDS = new Set([
  'target',
  'routing',
  'expectedCompletionDate',
  'notes',
]);

class InputValidationError extends Error {}

function fail(message) {
  throw new InputValidationError(message);
}

function runValidation(callback) {
  try {
    return { value: callback() };
  } catch (error) {
    if (error instanceof InputValidationError) return { error: error.message };
    throw error;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label = 'Request body') {
  if (!isRecord(value)) fail(`${label} must be a JSON object.`);
  return value;
}

function rejectUnsupportedFields(value, allowed, label) {
  const field = Object.keys(value).find((key) => !allowed.has(key));
  if (field) fail(`Unsupported ${label} field: ${field}.`);
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function optionalText(value, label, maxLength, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') fail(`${label} must be text.`);
  const text = value.trim();
  if (!text) {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  if (text.length > maxLength) fail(`${label} must not exceed ${maxLength} characters.`);
  return text;
}

function numberValue(value, label, {
  required = false,
  integer = false,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  positive = false,
} = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  if (typeof value === 'boolean' || (typeof value !== 'number' && typeof value !== 'string')) {
    fail(`${label} must be a number.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) fail(`${label} must be a finite number.`);
  if (integer && !Number.isInteger(number)) fail(`${label} must be a whole number.`);
  if (positive ? number <= 0 : number < min) {
    fail(positive ? `${label} must be greater than zero.` : `${label} must be at least ${min}.`);
  }
  if (number > max) fail(`${label} must not exceed ${max}.`);
  return number;
}

function enumValue(value, label, allowed, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') fail(`${label} is invalid.`);
  const normalized = value.trim().toUpperCase();
  if (!allowed.includes(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function objectIdValue(value, label, { required = false } = {}) {
  const id = optionalText(value, label, 24, { required });
  if (id !== undefined && !OBJECT_ID_PATTERN.test(id)) fail(`${label} is invalid.`);
  return id;
}

function validDateOnly(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function dateValue(value, label, { required = false } = {}) {
  const text = optionalText(value, label, 40, { required });
  if (text === undefined) return undefined;

  if (validDateOnly(text)) return text;
  if (ISO_DATE_TIME_PATTERN.test(text)
    && validDateOnly(text.slice(0, 10))
    && !Number.isNaN(Date.parse(text))) return text;
  const localDateTime = text.match(LOCAL_DATE_TIME_PATTERN);
  if (localDateTime
    && validDateOnly(text.slice(0, 10))
    && Number(localDateTime[1]) <= 23
    && Number(localDateTime[2]) <= 59
    && Number(localDateTime[3] || 0) <= 59) {
    return `${text}Z`;
  }
  fail(`${label} must be a valid ISO date or date-time.`);
}

function dateTimestamp(value) {
  return DATE_PATTERN.test(value)
    ? Date.parse(`${value}T00:00:00.000Z`)
    : Date.parse(value);
}

function dimensionsValue(value, label, { includeThickness = false } = {}) {
  if (value === undefined || value === null) return undefined;
  requireRecord(value, label);
  const allowed = includeThickness
    ? new Set(['lengthMm', 'widthMm', 'thicknessMm'])
    : new Set(['lengthMm', 'widthMm']);
  rejectUnsupportedFields(value, allowed, label.toLowerCase());

  const lengthMm = numberValue(value.lengthMm, `${label} length`, { positive: true, max: 100000 });
  const widthMm = numberValue(value.widthMm, `${label} width`, { positive: true, max: 100000 });
  if ((lengthMm === undefined) !== (widthMm === undefined)) {
    fail(`${label} length and width must be provided together.`);
  }

  const dimensions = compact({
    lengthMm,
    widthMm,
    ...(includeThickness ? {
      thicknessMm: numberValue(value.thicknessMm, `${label} thickness`, {
        positive: true,
        max: 10000,
      }),
    } : {}),
  });
  if (!Object.keys(dimensions).length) fail(`${label} must contain a measurement.`);
  return dimensions;
}

function targetValue(value) {
  requireRecord(value, 'Target');
  rejectUnsupportedFields(value, new Set(['finish', 'thicknessMm', 'dimensions']), 'target');
  const target = compact({
    finish: optionalText(value.finish, 'Target finish', 120),
    thicknessMm: numberValue(value.thicknessMm, 'Target thickness', { positive: true, max: 10000 }),
    dimensions: dimensionsValue(value.dimensions, 'Target dimensions'),
  });
  if (!Object.keys(target).length) fail('Target must contain at least one processing outcome.');
  return target;
}

function routingValue(value) {
  if (!Array.isArray(value)) fail('Routing must be an array.');
  if (value.length < 1 || value.length > MAX_ROUTE_OPERATIONS) {
    fail(`Routing must contain between 1 and ${MAX_ROUTE_OPERATIONS} operations.`);
  }

  return value.map((item, index) => {
    requireRecord(item, `Routing operation ${index + 1}`);
    rejectUnsupportedFields(
      item,
      new Set(['operation', 'machineLabel', 'plannedStart', 'plannedEnd', 'notes']),
      `routing operation ${index + 1}`,
    );
    const plannedStart = dateValue(item.plannedStart, `Operation ${index + 1} planned start`);
    const plannedEnd = dateValue(item.plannedEnd, `Operation ${index + 1} planned end`);
    if (plannedStart && plannedEnd && dateTimestamp(plannedStart) > dateTimestamp(plannedEnd)) {
      fail(`Operation ${index + 1} planned end must not be before its planned start.`);
    }
    return compact({
      operation: enumValue(item.operation, `Operation ${index + 1}`, PROCESSING_OPERATION_TYPES, { required: true }),
      sequence: index + 1,
      machineLabel: optionalText(item.machineLabel, `Operation ${index + 1} machine label`, 160),
      plannedStart,
      plannedEnd,
      notes: optionalText(item.notes, `Operation ${index + 1} notes`, 2000),
    });
  });
}

function inputValue(value, inventoryMode) {
  requireRecord(value, 'Input');
  rejectUnsupportedFields(value, new Set(['batchId', 'slabIds']), 'input');
  const batchId = objectIdValue(value.batchId, 'Batch ID', { required: true });

  if (inventoryMode === 'BATCH') {
    if (Object.hasOwn(value, 'slabIds')) fail('Batch-mode jobs must not include slab IDs.');
    return { batchId };
  }

  if (!Array.isArray(value.slabIds)) fail('Individual-slab jobs require slab IDs.');
  if (value.slabIds.length < 1 || value.slabIds.length > MAX_SLABS_PER_JOB) {
    fail(`Slab IDs must contain between 1 and ${MAX_SLABS_PER_JOB} items.`);
  }
  const slabIds = value.slabIds.map((id, index) => objectIdValue(id, `Slab ID ${index + 1}`, { required: true }));
  if (new Set(slabIds).size !== slabIds.length) fail('Slab IDs must be unique.');
  return { batchId, slabIds };
}

function paginationValue(query, allowedFields, defaultLimit) {
  requireRecord(query, 'Query');
  rejectUnsupportedFields(query, allowedFields, 'query');
  const page = numberValue(query.page, 'Page', { integer: true, min: 1, max: 1_000_000 }) ?? 1;
  const limit = numberValue(query.limit, 'Limit', { integer: true, min: 1, max: 100 }) ?? defaultLimit;
  return { page, limit };
}

function verifiedOutputValue(value) {
  requireRecord(value, 'Verified output');
  rejectUnsupportedFields(
    value,
    new Set(['quantity', 'areaSqFt', 'finish', 'thicknessMm', 'dimensions', 'slabOutputs']),
    'verified output',
  );

  let slabOutputs;
  if (value.slabOutputs !== undefined) {
    if (!Array.isArray(value.slabOutputs)) fail('Slab outputs must be an array.');
    if (value.slabOutputs.length < 1 || value.slabOutputs.length > MAX_SLABS_PER_JOB) {
      fail(`Slab outputs must contain between 1 and ${MAX_SLABS_PER_JOB} items.`);
    }
    slabOutputs = value.slabOutputs.map((item, index) => {
      requireRecord(item, `Slab output ${index + 1}`);
      rejectUnsupportedFields(
        item,
        new Set(['slabId', 'usableAreaSqFt', 'dimensions']),
        `slab output ${index + 1}`,
      );
      return compact({
        slabId: objectIdValue(item.slabId, `Slab output ${index + 1} ID`, { required: true }),
        usableAreaSqFt: numberValue(item.usableAreaSqFt, `Slab output ${index + 1} usable area`, {
          required: true,
          positive: true,
          max: 1_000_000,
        }),
        dimensions: dimensionsValue(item.dimensions, `Slab output ${index + 1} dimensions`, {
          includeThickness: true,
        }),
      });
    });
    const returnedIds = slabOutputs.map((item) => item.slabId);
    if (new Set(returnedIds).size !== returnedIds.length) fail('Slab output IDs must be unique.');
  }

  return compact({
    quantity: numberValue(value.quantity, 'Verified output quantity', {
      required: true,
      integer: true,
      min: 0,
      max: 10_000_000,
    }),
    areaSqFt: numberValue(value.areaSqFt, 'Verified output area', {
      min: 0,
      max: 1_000_000_000,
    }),
    finish: optionalText(value.finish, 'Verified output finish', 120),
    thicknessMm: numberValue(value.thicknessMm, 'Verified output thickness', {
      positive: true,
      max: 10000,
    }),
    dimensions: dimensionsValue(value.dimensions, 'Verified output dimensions'),
    slabOutputs,
  });
}

export function parseProcessingListQuery(query = {}) {
  return runValidation(() => {
    const allowed = new Set(['page', 'limit', 'search', 'status', 'operation', 'stone', 'stoneSlug']);
    const pagination = paginationValue(query, allowed, 20);
    const requestedStone = optionalText(query.stoneSlug ?? query.stone, 'Stone', 180);
    if (query.stone && query.stoneSlug
      && String(query.stone).trim().toLowerCase() !== String(query.stoneSlug).trim().toLowerCase()) {
      fail('Stone filters conflict.');
    }
    const stone = requestedStone ? resolveCatalogStoneReference({ stoneSlug: requestedStone }) : null;
    if (requestedStone && !stone) fail('Stone filter is invalid.');

    return compact({
      ...pagination,
      search: optionalText(query.search, 'Search', 120),
      status: enumValue(query.status, 'Status', PROCESSING_JOB_STATUSES),
      operation: enumValue(query.operation, 'Operation', PROCESSING_OPERATION_TYPES),
      stoneSlug: stone?.slug,
    });
  });
}

export function parseProcessingEventListQuery(query = {}) {
  return runValidation(() => paginationValue(query, new Set(['page', 'limit']), 50));
}

export function validateProcessingJobCreate(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, JOB_CREATE_FIELDS, 'processing job');
    const inventoryMode = enumValue(body.inventoryMode, 'Inventory mode', INVENTORY_MODES, { required: true });
    return compact({
      inventoryMode,
      input: inputValue(body.input, inventoryMode),
      target: targetValue(body.target),
      routing: routingValue(body.routing),
      expectedCompletionDate: dateValue(body.expectedCompletionDate, 'Expected completion date'),
      notes: optionalText(body.notes, 'Production notes', 3000),
    });
  });
}

export function validateProcessingJobUpdate(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, JOB_UPDATE_FIELDS, 'processing job update');
    const updates = compact({
      target: Object.hasOwn(body, 'target') ? targetValue(body.target) : undefined,
      routing: Object.hasOwn(body, 'routing') ? routingValue(body.routing) : undefined,
      expectedCompletionDate: Object.hasOwn(body, 'expectedCompletionDate')
        ? dateValue(body.expectedCompletionDate, 'Expected completion date')
        : undefined,
      notes: Object.hasOwn(body, 'notes') ? optionalText(body.notes, 'Production notes', 3000) : undefined,
    });
    if (!Object.keys(updates).length) fail('At least one permitted processing job field is required.');
    return updates;
  });
}

export function validateProcessingEmptyAction(body) {
  return runValidation(() => {
    if (body === undefined) return {};
    requireRecord(body);
    if (Object.keys(body).length) fail('This action does not accept request fields.');
    return {};
  });
}

export function validateProcessingOperationAction(body) {
  return runValidation(() => {
    if (body === undefined) return {};
    requireRecord(body);
    rejectUnsupportedFields(body, new Set(['machineLabel', 'notes']), 'operation action');
    return compact({
      machineLabel: optionalText(body.machineLabel, 'Machine label', 160),
      notes: optionalText(body.notes, 'Operation notes', 2000),
    });
  });
}

export function validateProcessingQualityCheck(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, new Set(['result', 'verifiedOutput', 'notes', 'observations']), 'quality check');
    const result = enumValue(body.result, 'Quality-check result', PROCESSING_QC_RESULTS, { required: true });
    if (result === 'PASS' && body.verifiedOutput === undefined) {
      fail('Verified output is required for a passing quality check.');
    }
    return compact({
      result,
      verifiedOutput: body.verifiedOutput === undefined
        ? undefined
        : verifiedOutputValue(body.verifiedOutput),
      notes: optionalText(body.notes, 'Quality-check notes', 3000),
      observations: optionalText(body.observations, 'Quality-check observations', 3000),
    });
  });
}

export function validateProcessingCancellation(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, new Set(['reason']), 'cancellation');
    return {
      reason: optionalText(body.reason, 'Cancellation reason', 1000, { required: true }),
    };
  });
}

export function validateProcessingNote(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, new Set(['note']), 'processing note');
    return {
      note: optionalText(body.note, 'Processing note', 3000, { required: true }),
    };
  });
}
