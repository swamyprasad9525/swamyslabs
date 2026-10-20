import mongoose from 'mongoose';
import {
  COMMERCIAL_CURRENCIES,
  COMMERCIAL_UNITS,
  DEFAULT_COMMERCIAL_PAGE_SIZE,
  MAX_COMMERCIAL_LINE_ITEMS,
  MAX_COMMERCIAL_PAGE_SIZE,
  QUOTATION_STATUSES,
  SALES_ORDER_STATUSES,
} from '../constants/commercial.js';
import { PROCESSING_OPERATION_TYPES } from '../constants/processing.js';
import { calculateCommercialLine } from '../../src/lib/commercialMath.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanString(value, maxLength) {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result.length <= maxLength ? result : null;
}

function allowedKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.has(key));
}

function parseDate(value, label, { dateOnly = false } = {}) {
  if (value == null || value === '') return { value: undefined };
  if (typeof value !== 'string' && !(value instanceof Date)) return { error: `${label} is invalid.` };
  if (dateOnly && typeof value === 'string' && !DATE_ONLY_PATTERN.test(value)) return { error: `${label} is invalid.` };
  const date = dateOnly && typeof value === 'string'
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return { error: `${label} is invalid.` };
  if (dateOnly && typeof value === 'string' && date.toISOString().slice(0, 10) !== value) {
    return { error: `${label} is invalid.` };
  }
  return { value: date };
}

function decimalString(value, label) {
  if (value == null || value === '' || typeof value === 'boolean') return { error: `${label} is required.` };
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { error: `${label} must be a non-negative decimal number.` };
  return { value: normalized };
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return { error: `${label} must be greater than zero.` };
  return { value: number };
}

function validateDimensions(value) {
  if (value == null) return { value: undefined };
  if (!allowedKeys(value, new Set(['lengthMm', 'widthMm']))) return { error: 'Dimensions are invalid.' };
  const length = positiveNumber(value.lengthMm, 'Dimension length');
  const width = positiveNumber(value.widthMm, 'Dimension width');
  if (length.error || width.error) return { error: 'Dimensions require positive length and width in millimetres.' };
  return { value: { lengthMm: length.value, widthMm: width.value } };
}

function validateProcessingRequirements(value) {
  if (value == null) return { value: undefined };
  if (!Array.isArray(value) || value.length > 20) return { error: 'Processing requirements must contain no more than 20 items.' };
  const seen = new Set();
  const result = [];
  for (const item of value) {
    if (!allowedKeys(item, new Set(['operation', 'notes']))) return { error: 'A processing requirement is invalid.' };
    const operation = cleanString(item.operation, 80);
    const notes = cleanString(item.notes, 1000);
    if (!operation || !PROCESSING_OPERATION_TYPES.includes(operation) || notes === null || seen.has(operation)) {
      return { error: 'Processing requirements must use unique supported operations.' };
    }
    seen.add(operation);
    result.push({ operation, ...(notes ? { notes } : {}) });
  }
  return { value: result.length ? result : undefined };
}

function validateLineItem(item) {
  const keys = new Set([
    'stoneId', 'stoneSlug', 'description', 'finish', 'thicknessMm', 'dimensions',
    'quantity', 'areaSqFt', 'unit', 'unitRate', 'discountPercent', 'taxRatePercent',
    'processingRequirements', 'notes',
  ]);
  if (!allowedKeys(item, keys)) return { error: 'A quotation line item contains unsupported fields.' };

  const stoneId = cleanString(item.stoneId, 80);
  const stoneSlug = cleanString(item.stoneSlug, 180);
  const description = cleanString(item.description, 500);
  const finish = cleanString(item.finish, 120);
  const notes = cleanString(item.notes, 1000);
  if (!stoneId || stoneSlug === null || description === null || finish === null || notes === null) {
    return { error: 'A quotation line item contains invalid text.' };
  }
  const unit = cleanString(item.unit, 30);
  if (!COMMERCIAL_UNITS.includes(unit)) return { error: 'A quotation line item has an invalid unit.' };

  const quantity = decimalString(item.quantity, 'Line quantity');
  const areaSqFt = item.areaSqFt == null || item.areaSqFt === ''
    ? { value: undefined }
    : decimalString(item.areaSqFt, 'Line area');
  const unitRate = decimalString(item.unitRate, 'Unit rate');
  const discountPercent = decimalString(item.discountPercent ?? 0, 'Line discount');
  const taxRatePercent = decimalString(item.taxRatePercent ?? 0, 'Tax rate');
  if (quantity.error || areaSqFt.error || unitRate.error || discountPercent.error || taxRatePercent.error) {
    return quantity.error ? quantity : areaSqFt.error ? areaSqFt : unitRate.error ? unitRate : discountPercent.error ? discountPercent : taxRatePercent;
  }
  try {
    calculateCommercialLine({
      quantity: quantity.value,
      unitRate: unitRate.value,
      discountPercent: discountPercent.value,
      taxRatePercent: taxRatePercent.value,
    });
  } catch (error) {
    return { error: error.message };
  }
  if (areaSqFt.value !== undefined) {
    try {
      calculateCommercialLine({ quantity: areaSqFt.value, unitRate: 0 });
    } catch (error) {
      return { error: error.message.replace('Line quantity', 'Line area') };
    }
  }
  if (unit === 'SQ_FT' && areaSqFt.value !== undefined && Number(areaSqFt.value) !== Number(quantity.value)) {
    return { error: 'Square-foot line area must equal its quantity.' };
  }
  if (['PIECE', 'SLAB'].includes(unit) && !Number.isInteger(Number(quantity.value))) {
    return { error: `${unit === 'SLAB' ? 'Slab' : 'Piece'} quantity must be a whole number.` };
  }

  let thicknessMm;
  if (item.thicknessMm != null && item.thicknessMm !== '') {
    const thickness = positiveNumber(item.thicknessMm, 'Thickness');
    if (thickness.error) return thickness;
    thicknessMm = thickness.value;
  }
  const dimensions = validateDimensions(item.dimensions);
  if (dimensions.error) return dimensions;
  const processingRequirements = validateProcessingRequirements(item.processingRequirements);
  if (processingRequirements.error) return processingRequirements;

  return {
    value: {
      stoneId,
      ...(stoneSlug ? { stoneSlug: stoneSlug.toLowerCase() } : {}),
      ...(description ? { description } : {}),
      ...(finish ? { finish } : {}),
      ...(thicknessMm ? { thicknessMm } : {}),
      ...(dimensions.value ? { dimensions: dimensions.value } : {}),
      quantity: quantity.value,
      ...((areaSqFt.value !== undefined || unit === 'SQ_FT') ? { areaSqFt: areaSqFt.value ?? quantity.value } : {}),
      unit,
      unitRate: unitRate.value,
      discountPercent: discountPercent.value,
      taxRatePercent: taxRatePercent.value,
      ...(processingRequirements.value ? { processingRequirements: processingRequirements.value } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

export function validateQuotationPayload(body) {
  const keys = new Set([
    'customerId', 'sourceLeadId', 'issueDate', 'validUntil', 'currency', 'lineItems',
    'paymentTerms', 'deliveryTerms', 'notes', 'internalNotes',
  ]);
  if (!allowedKeys(body, keys)) return { error: 'Quotation input contains unsupported fields.' };
  if (!mongoose.isValidObjectId(body.customerId)) return { error: 'A valid customer ID is required.' };
  if (body.sourceLeadId != null && body.sourceLeadId !== '' && !mongoose.isValidObjectId(body.sourceLeadId)) {
    return { error: 'Source lead ID is invalid.' };
  }
  const currency = cleanString(body.currency, 3)?.toUpperCase();
  if (!COMMERCIAL_CURRENCIES.includes(currency)) return { error: 'A supported currency is required.' };
  if (!Array.isArray(body.lineItems) || body.lineItems.length < 1 || body.lineItems.length > MAX_COMMERCIAL_LINE_ITEMS) {
    return { error: `Between 1 and ${MAX_COMMERCIAL_LINE_ITEMS} line items are required.` };
  }
  const lineItems = [];
  for (const item of body.lineItems) {
    const validated = validateLineItem(item);
    if (validated.error) return validated;
    lineItems.push(validated.value);
  }

  const issueDate = parseDate(body.issueDate, 'Issue date', { dateOnly: true });
  const validUntil = parseDate(body.validUntil, 'Valid-until date', { dateOnly: true });
  if (issueDate.error || validUntil.error) return issueDate.error ? issueDate : validUntil;
  if (issueDate.value && validUntil.value && validUntil.value < issueDate.value) {
    return { error: 'Valid-until date cannot be before the issue date.' };
  }

  const text = {};
  for (const field of ['paymentTerms', 'deliveryTerms', 'notes', 'internalNotes']) {
    const value = cleanString(body[field], 3000);
    if (value === null) return { error: `${field} must be 3000 characters or fewer.` };
    if (value) text[field] = value;
  }

  return {
    value: {
      customerId: String(body.customerId),
      ...(body.sourceLeadId ? { sourceLeadId: String(body.sourceLeadId) } : {}),
      ...(issueDate.value ? { issueDate: issueDate.value } : {}),
      ...(validUntil.value ? { validUntil: validUntil.value } : {}),
      currency,
      lineItems,
      ...text,
    },
  };
}

function parseListQuery(query, statuses) {
  const rawPage = String(query.page ?? '1');
  const rawLimit = String(query.limit ?? DEFAULT_COMMERCIAL_PAGE_SIZE);
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit)) return { error: 'Page and limit must be positive integers.' };
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (page < 1 || limit < 1 || limit > MAX_COMMERCIAL_PAGE_SIZE) {
    return { error: `Page must be at least 1 and limit must be between 1 and ${MAX_COMMERCIAL_PAGE_SIZE}.` };
  }
  const search = cleanString(query.search, 120);
  const status = cleanString(query.status, 40);
  if (search === null) return { error: 'Search is too long.' };
  if (status && !statuses.includes(status)) return { error: 'Status filter is invalid.' };
  const customerId = cleanString(query.customerId, 30);
  const sourceLeadId = cleanString(query.sourceLeadId, 30);
  if (customerId && !mongoose.isValidObjectId(customerId)) return { error: 'Customer filter is invalid.' };
  if (sourceLeadId && !mongoose.isValidObjectId(sourceLeadId)) return { error: 'Lead filter is invalid.' };
  const from = parseDate(query.from, 'From date', { dateOnly: true });
  const to = parseDate(query.to, 'To date', { dateOnly: true });
  if (from.error || to.error) return from.error ? from : to;
  if (from.value && to.value && from.value > to.value) return { error: 'From date cannot be after to date.' };
  return {
    value: {
      page,
      limit,
      search: search || '',
      status: status || '',
      customerId: customerId || '',
      sourceLeadId: sourceLeadId || '',
      ...(from.value ? { from: from.value } : {}),
      ...(to.value ? { to: to.value } : {}),
    },
  };
}

export const parseQuotationListQuery = (query) => parseListQuery(query, QUOTATION_STATUSES);
export const parseSalesOrderListQuery = (query) => parseListQuery(query, SALES_ORDER_STATUSES);

export function validateCommercialAction(body, { requireReason = false } = {}) {
  if (!allowedKeys(body ?? {}, new Set(['reason', 'note']))) return { error: 'Action contains unsupported fields.' };
  const reason = cleanString(body?.reason, 1000);
  const note = cleanString(body?.note, 3000);
  if (reason === null || note === null) return { error: 'Action notes are too long.' };
  if (requireReason && !reason) return { error: 'A reason is required.' };
  return { value: { ...(reason ? { reason } : {}), ...(note ? { note } : {}) } };
}

export function validateSalesOrderUpdate(body) {
  if (!allowedKeys(body, new Set(['requestedDeliveryDate']))) return { error: 'Sales order update contains unsupported fields.' };
  const requestedDeliveryDate = parseDate(body.requestedDeliveryDate, 'Requested delivery date', { dateOnly: true });
  if (requestedDeliveryDate.error) return requestedDeliveryDate;
  return { value: { requestedDeliveryDate: requestedDeliveryDate.value ?? null } };
}

export function validateProcessingLink(body) {
  if (!allowedKeys(body, new Set(['lineItemId', 'processingJobId']))) return { error: 'Processing link contains unsupported fields.' };
  if (!mongoose.isValidObjectId(body.lineItemId)) return { error: 'A valid sales order line ID is required.' };
  if (!mongoose.isValidObjectId(body.processingJobId)) return { error: 'A valid processing job ID is required.' };
  return { value: { lineItemId: String(body.lineItemId), processingJobId: String(body.processingJobId) } };
}

function parsePositiveInteger(value, label, { defaultValue, maximum } = {}) {
  const raw = value == null || value === '' ? defaultValue : value;
  if (raw == null || !/^\d+$/.test(String(raw))) return { error: `${label} must be a positive integer.` };
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 1 || (maximum != null && number > maximum)) {
    return { error: maximum == null
      ? `${label} must be a positive integer.`
      : `${label} must be between 1 and ${maximum}.` };
  }
  return { value: number };
}

function optionalPositiveDecimal(value, label, { integer = false } = {}) {
  if (value == null || value === '') return { value: undefined };
  if (typeof value === 'boolean') return { error: `${label} must be greater than zero.` };
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return { error: `${label} must be greater than zero.` };
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0 || (integer && !Number.isInteger(number))) {
    return { error: integer ? `${label} must be a positive whole number.` : `${label} must be greater than zero.` };
  }
  return { value: number };
}

export function validateSalesOrderAvailabilityQuery(query) {
  if (!allowedKeys(query, new Set(['lineItemId', 'page', 'limit']))) {
    return { error: 'Availability query contains unsupported fields.' };
  }
  if (!mongoose.isValidObjectId(query.lineItemId)) return { error: 'A valid sales order line ID is required.' };
  const page = parsePositiveInteger(query.page, 'Page', { defaultValue: 1 });
  const limit = parsePositiveInteger(query.limit, 'Limit', {
    defaultValue: DEFAULT_COMMERCIAL_PAGE_SIZE,
    maximum: MAX_COMMERCIAL_PAGE_SIZE,
  });
  if (page.error || limit.error) return page.error ? page : limit;
  return {
    value: {
      lineItemId: String(query.lineItemId),
      page: page.value,
      limit: limit.value,
    },
  };
}

export function validateSalesOrderSlabAvailabilityQuery(query) {
  return validateSalesOrderAvailabilityQuery(query);
}

export function validateInventoryReservationPayload(body) {
  const keys = new Set(['lineItemId', 'batchId', 'slabIds', 'quantity', 'areaSqFt', 'requestKey']);
  if (!allowedKeys(body, keys)) return { error: 'Reservation input contains unsupported fields.' };
  if (!mongoose.isValidObjectId(body.lineItemId)) return { error: 'A valid sales order line ID is required.' };
  if (!mongoose.isValidObjectId(body.batchId)) return { error: 'A valid inventory batch ID is required.' };

  const requestKey = cleanString(body.requestKey, 120);
  if (!requestKey || requestKey.length < 8) {
    return { error: 'Reservation request key must contain between 8 and 120 characters.' };
  }

  const slabIds = body.slabIds == null ? [] : body.slabIds;
  if (!Array.isArray(slabIds) || slabIds.length > 100) {
    return { error: 'Reservation slab IDs must be an array containing no more than 100 items.' };
  }
  if (slabIds.some((id) => !mongoose.isValidObjectId(id))) {
    return { error: 'Every reservation slab ID must be valid.' };
  }
  const normalizedSlabIds = slabIds.map(String);
  if (new Set(normalizedSlabIds).size !== normalizedSlabIds.length) {
    return { error: 'Reservation slab IDs must be unique.' };
  }

  const quantity = optionalPositiveDecimal(body.quantity, 'Reservation quantity', { integer: true });
  const areaSqFt = optionalPositiveDecimal(body.areaSqFt, 'Reservation area');
  if (quantity.error || areaSqFt.error) return quantity.error ? quantity : areaSqFt;
  const suppliedBases = [normalizedSlabIds.length > 0, quantity.value !== undefined, areaSqFt.value !== undefined]
    .filter(Boolean).length;
  if (suppliedBases !== 1) {
    return { error: 'Provide exactly one reservation basis: slab IDs, quantity, or area.' };
  }

  return {
    value: {
      lineItemId: String(body.lineItemId),
      batchId: String(body.batchId),
      slabIds: normalizedSlabIds,
      quantity: quantity.value,
      areaSqFt: areaSqFt.value,
      requestKey,
    },
  };
}

export function validateInventoryReservationRelease(body) {
  if (!allowedKeys(body, new Set(['reason']))) return { error: 'Reservation release contains unsupported fields.' };
  const reason = cleanString(body?.reason, 1000);
  if (!reason) return { error: 'A release reason is required.' };
  return { value: { reason } };
}
