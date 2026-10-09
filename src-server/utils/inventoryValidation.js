import {
  ADJUSTMENT_DIRECTIONS,
  AREA_SQ_MM_PER_SQ_FT,
  INVENTORY_MODES,
  INVENTORY_STATUSES,
} from '../constants/inventory.js';
import { resolveCatalogStoneReference } from './catalogBridge.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const BATCH_CREATE_FIELDS = new Set([
  'stoneSlug',
  'stoneId',
  'inventoryMode',
  'receivedDate',
  'externalLotNumber',
  'source',
  'finish',
  'thicknessMm',
  'nominalDimensions',
  'receivedCount',
  'receivedSqFt',
  'cost',
  'selling',
  'location',
  'grade',
  'shade',
  'notes',
  'status',
]);

const BATCH_UPDATE_FIELDS = new Set([
  'receivedDate',
  'externalLotNumber',
  'source',
  'finish',
  'thicknessMm',
  'nominalDimensions',
  'cost',
  'selling',
  'grade',
  'shade',
  'notes',
  'status',
]);

const SLAB_CREATE_FIELDS = new Set([
  'dimensions',
  'usableAreaSqFt',
  'location',
  'grade',
  'shade',
  'defects',
  'notes',
]);

const SLAB_UPDATE_FIELDS = new Set(['grade', 'shade', 'defects', 'notes']);

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

function optionalNumber(value, label, {
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

function enumValue(value, label, values, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  if (typeof value !== 'string') fail(`${label} is invalid.`);
  const normalized = value.trim().toUpperCase();
  if (!values.includes(normalized)) fail(`${label} is invalid.`);
  return normalized;
}

function dateValue(value, label, { required = false } = {}) {
  const date = optionalText(value, label, 10, { required });
  if (date === undefined) return undefined;
  if (!DATE_PATTERN.test(date)) fail(`${label} must use YYYY-MM-DD.`);

  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    fail(`${label} must be a valid date.`);
  }
  return date;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function locationValue(value, label = 'Location', { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(`${label} is required.`);
    return undefined;
  }
  requireRecord(value, label);
  rejectUnsupportedFields(value, new Set(['warehouse', 'zone', 'rack']), label.toLowerCase());
  const location = compact({
    warehouse: optionalText(value.warehouse, `${label} warehouse`, 160, { required: true }),
    zone: optionalText(value.zone, `${label} zone`, 100),
    rack: optionalText(value.rack, `${label} rack`, 100),
  });
  return location;
}

function sourceValue(value) {
  if (value === undefined || value === null) return undefined;
  requireRecord(value, 'Source');
  rejectUnsupportedFields(value, new Set(['quarry', 'origin', 'supplier']), 'source');
  const source = compact({
    quarry: optionalText(value.quarry, 'Quarry', 180),
    origin: optionalText(value.origin, 'Origin', 180),
    supplier: optionalText(value.supplier, 'Supplier', 180),
  });
  return Object.keys(source).length ? source : undefined;
}

function dimensionsValue(value, {
  label = 'Dimensions',
  requireLengthAndWidth = false,
  requirePairWhenPresent = false,
  includeThickness = false,
} = {}) {
  if (value === undefined || value === null) {
    if (requireLengthAndWidth) fail(`${label} are required.`);
    return undefined;
  }
  requireRecord(value, label);
  const allowed = includeThickness
    ? new Set(['lengthMm', 'widthMm', 'thicknessMm'])
    : new Set(['lengthMm', 'widthMm']);
  rejectUnsupportedFields(value, allowed, label.toLowerCase());
  const dimensions = compact({
    lengthMm: optionalNumber(value.lengthMm, `${label} length`, {
      required: requireLengthAndWidth,
      positive: true,
      max: 100000,
    }),
    widthMm: optionalNumber(value.widthMm, `${label} width`, {
      required: requireLengthAndWidth,
      positive: true,
      max: 100000,
    }),
    ...(includeThickness ? {
      thicknessMm: optionalNumber(value.thicknessMm, `${label} thickness`, {
        positive: true,
        max: 10000,
      }),
    } : {}),
  });
  if (requirePairWhenPresent && (dimensions.lengthMm === undefined) !== (dimensions.widthMm === undefined)) {
    fail(`${label} length and width must be provided together.`);
  }
  if (!Object.keys(dimensions).length) return undefined;
  return dimensions;
}

function commercialValue(value, label, rateField) {
  if (value === undefined || value === null) return undefined;
  requireRecord(value, label);
  rejectUnsupportedFields(value, new Set([rateField, 'currency']), label.toLowerCase());
  const rate = optionalNumber(value[rateField], `${label} per sq.ft`, { min: 0, max: 1_000_000_000 });
  const rawCurrency = optionalText(value.currency, `${label} currency`, 3);
  if ((rate === undefined) !== (rawCurrency === undefined)) {
    fail(`${label} rate and currency must be provided together.`);
  }
  if (rate === undefined) return undefined;
  const currency = rawCurrency.toUpperCase();
  if (!CURRENCY_PATTERN.test(currency)) fail(`${label} currency must be a three-letter code.`);
  return { [rateField]: rate, currency };
}

function paginationValue(query, allowedFields, defaultLimit) {
  requireRecord(query, 'Query');
  rejectUnsupportedFields(query, allowedFields, 'query');
  const page = optionalNumber(query.page, 'Page', { integer: true, min: 1, max: 1_000_000 }) ?? 1;
  const limit = optionalNumber(query.limit, 'Limit', { integer: true, min: 1, max: 100 }) ?? defaultLimit;
  return { page, limit };
}

export function parseInventoryListQuery(query = {}) {
  return runValidation(() => {
    const allowed = new Set(['page', 'limit', 'search', 'stone', 'stoneSlug', 'finish', 'status', 'warehouse']);
    const pagination = paginationValue(query, allowed, 20);
    const search = optionalText(query.search, 'Search', 120);
    const requestedStone = optionalText(query.stoneSlug ?? query.stone, 'Stone', 180);
    if (query.stone && query.stoneSlug && String(query.stone).trim() !== String(query.stoneSlug).trim()) {
      fail('Stone filters conflict.');
    }
    const stone = requestedStone ? resolveCatalogStoneReference({ stoneSlug: requestedStone }) : null;
    if (requestedStone && !stone) fail('Stone filter is invalid.');

    return compact({
      ...pagination,
      search,
      stoneSlug: stone?.slug,
      finish: optionalText(query.finish, 'Finish', 120),
      status: enumValue(query.status, 'Status', INVENTORY_STATUSES),
      warehouse: optionalText(query.warehouse, 'Warehouse', 120),
    });
  });
}

export function parseInventoryChildListQuery(query = {}) {
  return runValidation(() => paginationValue(query, new Set(['page', 'limit']), 50));
}

export function validateInventoryBatchCreate(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, BATCH_CREATE_FIELDS, 'batch');

    const stoneSlug = optionalText(body.stoneSlug, 'Stone', 180, { required: true });
    const stoneId = optionalText(body.stoneId, 'Stone ID', 80);
    const stoneRef = resolveCatalogStoneReference({ stoneSlug, stoneId });
    if (!stoneRef) fail('Stone reference is invalid.');

    const inventoryMode = enumValue(body.inventoryMode, 'Inventory mode', INVENTORY_MODES, { required: true });
    const receivedCount = optionalNumber(body.receivedCount, 'Received count', {
      integer: true,
      min: 0,
      max: 10_000_000,
    });
    const receivedSqFt = optionalNumber(body.receivedSqFt, 'Received area', { min: 0, max: 1_000_000_000 });
    if (inventoryMode === 'BATCH' && !(receivedCount > 0) && !(receivedSqFt > 0)) {
      fail('A positive received count or received area is required.');
    }
    if (inventoryMode === 'INDIVIDUAL_SLAB'
      && (Object.hasOwn(body, 'receivedCount') || Object.hasOwn(body, 'receivedSqFt'))) {
      fail('Individual-slab batches must omit received count and area; stock is received through slab records.');
    }

    const location = locationValue(body.location);
    if (inventoryMode === 'BATCH' && !location) fail('Location is required for batch inventory.');
    if (inventoryMode === 'INDIVIDUAL_SLAB' && location) {
      fail('Individual-slab locations must be recorded on each slab.');
    }
    if (inventoryMode === 'INDIVIDUAL_SLAB' && Object.hasOwn(body, 'status')) {
      fail('Individual-slab batch status is derived by the server and must be omitted.');
    }

    return compact({
      stoneRef,
      inventoryMode,
      receivedDate: dateValue(body.receivedDate, 'Received date', { required: true }),
      externalLotNumber: optionalText(body.externalLotNumber, 'External lot number', 160),
      source: sourceValue(body.source),
      finish: optionalText(body.finish, 'Finish', 120),
      thicknessMm: optionalNumber(body.thicknessMm, 'Thickness', { positive: true, max: 10000 }),
      nominalDimensions: dimensionsValue(body.nominalDimensions, {
        label: 'Nominal dimensions',
        requirePairWhenPresent: true,
      }),
      receivedCount: inventoryMode === 'BATCH' ? receivedCount : undefined,
      receivedSqFt: inventoryMode === 'BATCH' ? receivedSqFt : undefined,
      cost: commercialValue(body.cost, 'Cost', 'costPerSqFt'),
      selling: commercialValue(body.selling, 'Selling price', 'pricePerSqFt'),
      location,
      grade: optionalText(body.grade, 'Grade', 100),
      shade: optionalText(body.shade, 'Shade', 100),
      notes: optionalText(body.notes, 'Notes', 3000),
      status: inventoryMode === 'BATCH'
        ? enumValue(body.status, 'Status', ['AVAILABLE', 'HOLD'])
        : undefined,
    });
  });
}

export function validateInventoryBatchUpdate(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, BATCH_UPDATE_FIELDS, 'batch update');
    const updates = compact({
      receivedDate: dateValue(body.receivedDate, 'Received date'),
      externalLotNumber: optionalText(body.externalLotNumber, 'External lot number', 160),
      source: sourceValue(body.source),
      finish: optionalText(body.finish, 'Finish', 120),
      thicknessMm: optionalNumber(body.thicknessMm, 'Thickness', { positive: true, max: 10000 }),
      nominalDimensions: dimensionsValue(body.nominalDimensions, {
        label: 'Nominal dimensions',
        requirePairWhenPresent: true,
      }),
      cost: commercialValue(body.cost, 'Cost', 'costPerSqFt'),
      selling: commercialValue(body.selling, 'Selling price', 'pricePerSqFt'),
      grade: optionalText(body.grade, 'Grade', 100),
      shade: optionalText(body.shade, 'Shade', 100),
      notes: optionalText(body.notes, 'Notes', 3000),
      status: enumValue(body.status, 'Status', ['AVAILABLE', 'HOLD', 'ARCHIVED']),
    });
    if (!Object.keys(updates).length) fail('At least one permitted batch field is required.');
    return updates;
  });
}

export function validateInventoryAdjustment(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, new Set(['direction', 'quantity', 'areaSqFt', 'reason', 'slabId']), 'adjustment');
    const direction = enumValue(body.direction, 'Adjustment direction', ADJUSTMENT_DIRECTIONS, { required: true });
    const slabId = optionalText(body.slabId, 'Slab ID', 24);
    if (slabId && !OBJECT_ID_PATTERN.test(slabId)) fail('Slab ID is invalid.');
    const quantity = optionalNumber(body.quantity, 'Adjustment quantity', {
      integer: true,
      positive: true,
      max: 10_000_000,
    });
    const areaSqFt = optionalNumber(body.areaSqFt, 'Adjustment area', { positive: true, max: 1_000_000_000 });

    if (slabId && (quantity !== undefined || areaSqFt !== undefined)) {
      fail('Individual-slab adjustments use the complete slab and must not include quantity or area.');
    }
    if (!slabId && quantity === undefined && areaSqFt === undefined) {
      fail('Adjustment quantity or area is required.');
    }

    return compact({
      direction,
      slabId,
      quantity,
      areaSqFt,
      reason: optionalText(body.reason, 'Adjustment reason', 1000, { required: true }),
    });
  });
}

export function validateInventoryTransfer(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, new Set(['toLocation', 'reason', 'slabId']), 'transfer');
    const slabId = optionalText(body.slabId, 'Slab ID', 24);
    if (slabId && !OBJECT_ID_PATTERN.test(slabId)) fail('Slab ID is invalid.');
    return compact({
      slabId,
      toLocation: locationValue(body.toLocation, 'Destination location', { required: true }),
      reason: optionalText(body.reason, 'Transfer reason', 1000, { required: true }),
    });
  });
}

export function validateInventorySlabCreate(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, SLAB_CREATE_FIELDS, 'slab');
    const dimensions = dimensionsValue(body.dimensions, {
      label: 'Slab dimensions',
      requireLengthAndWidth: true,
      includeThickness: true,
    });
    const usableAreaSqFt = optionalNumber(body.usableAreaSqFt, 'Usable area', { min: 0, max: 1_000_000 });
    const grossAreaSqFt = (dimensions.lengthMm * dimensions.widthMm) / AREA_SQ_MM_PER_SQ_FT;
    if (usableAreaSqFt !== undefined && usableAreaSqFt > grossAreaSqFt) {
      fail('Usable area cannot exceed the slab gross area.');
    }
    return compact({
      dimensions,
      usableAreaSqFt,
      location: locationValue(body.location, 'Slab location', { required: true }),
      grade: optionalText(body.grade, 'Grade', 100),
      shade: optionalText(body.shade, 'Shade', 100),
      defects: optionalText(body.defects, 'Defects', 1000),
      notes: optionalText(body.notes, 'Notes', 3000),
    });
  });
}

export function validateInventorySlabUpdate(body) {
  return runValidation(() => {
    requireRecord(body);
    rejectUnsupportedFields(body, SLAB_UPDATE_FIELDS, 'slab update');
    const updates = compact({
      grade: optionalText(body.grade, 'Grade', 100),
      shade: optionalText(body.shade, 'Shade', 100),
      defects: optionalText(body.defects, 'Defects', 1000),
      notes: optionalText(body.notes, 'Notes', 3000),
    });
    if (!Object.keys(updates).length) fail('At least one permitted slab field is required.');
    return updates;
  });
}
