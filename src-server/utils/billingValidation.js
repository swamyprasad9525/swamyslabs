import mongoose from 'mongoose';
import {
  INVOICE_DOCUMENT_STATUSES,
  INVOICE_PAYMENT_STATUSES,
} from '../constants/billing.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATE_CODE = /^\d{2}$/;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: label + ' is invalid.' };
  }
  return { value };
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function stringValue(value, label, maxLength, { required = false } = {}) {
  if (value == null || value === '') {
    return required ? { error: label + ' is required.' } : { value: undefined };
  }
  if (typeof value !== 'string') return { error: label + ' must be text.' };
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) {
    return { error: label + ' is invalid.' };
  }
  return { value: normalized || undefined };
}

function strictDate(value, label, { required = false } = {}) {
  if (value == null || value === '') {
    return required ? { error: label + ' is required.' } : { value: undefined };
  }
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return { error: label + ' is invalid.' };
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: label + ' is invalid.' };
  }
  return { value: date };
}

function stateCode(value, label, { required = false } = {}) {
  const parsed = stringValue(value, label, 2, { required });
  if (parsed.error || parsed.value === undefined) return parsed;
  return STATE_CODE.test(parsed.value)
    ? parsed
    : { error: label + ' must be a two-digit Indian state code.' };
}

function addressValue(value, label) {
  if (value == null) return { value: undefined };
  const object = objectValue(value, label);
  if (object.error) return object;
  const allowed = new Set(['line1', 'line2', 'city', 'state', 'stateCode', 'postalCode', 'country']);
  if (!onlyKeys(value, allowed)) return { error: label + ' contains an unsupported field.' };
  const limits = {
    line1: 240,
    line2: 240,
    city: 120,
    state: 120,
    postalCode: 20,
    country: 120,
  };
  const normalized = {};
  for (const [field, maxLength] of Object.entries(limits)) {
    const parsed = stringValue(value[field], label + ' ' + field, maxLength);
    if (parsed.error) return parsed;
    if (parsed.value !== undefined) normalized[field] = parsed.value;
  }
  const parsedStateCode = stateCode(value.stateCode, label + ' state code');
  if (parsedStateCode.error) return parsedStateCode;
  if (parsedStateCode.value !== undefined) normalized.stateCode = parsedStateCode.value;
  return { value: normalized };
}

function requestKey(value, { required = false } = {}) {
  const parsed = stringValue(value, 'Request key', 120, { required });
  if (parsed.error || parsed.value === undefined) return parsed;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(parsed.value)) {
    return { error: 'Request key must be 8-120 safe characters.' };
  }
  return parsed;
}

function invoiceDraftFields(body, { create = false } = {}) {
  const object = objectValue(body, 'Invoice request');
  if (object.error) return object;
  const allowed = new Set([
    'salesOrderId',
    'requestKey',
    'dueDate',
    'placeOfSupplyStateCode',
    'billingAddress',
    'shippingAddress',
    'notes',
    'terms',
  ]);
  if (!onlyKeys(body, allowed)) return { error: 'Invoice request contains an unsupported field.' };

  const value = {};
  if (create) {
    if (!mongoose.isValidObjectId(body.salesOrderId)) return { error: 'A valid Sales Order ID is required.' };
    value.salesOrderId = body.salesOrderId;
    const parsedKey = requestKey(body.requestKey, { required: true });
    if (parsedKey.error) return parsedKey;
    value.requestKey = parsedKey.value;
  } else {
    if (!Object.keys(body).length) return { error: 'At least one draft field is required.' };
    if (Object.hasOwn(body, 'salesOrderId') || Object.hasOwn(body, 'requestKey')) {
      return { error: 'Invoice source and request key cannot be changed.' };
    }
  }

  for (const field of ['dueDate']) {
    if (!Object.hasOwn(body, field)) continue;
    const parsed = strictDate(body[field], 'Due date');
    if (parsed.error) return parsed;
    value[field] = parsed.value;
  }
  if (Object.hasOwn(body, 'placeOfSupplyStateCode')) {
    const parsed = stateCode(body.placeOfSupplyStateCode, 'Place-of-supply state code');
    if (parsed.error) return parsed;
    value.placeOfSupplyStateCode = parsed.value;
  }
  for (const field of ['billingAddress', 'shippingAddress']) {
    if (!Object.hasOwn(body, field)) continue;
    const parsed = addressValue(body[field], field === 'billingAddress' ? 'Billing address' : 'Shipping address');
    if (parsed.error) return parsed;
    value[field] = parsed.value;
  }
  for (const [field, label] of [['notes', 'Notes'], ['terms', 'Terms']]) {
    if (!Object.hasOwn(body, field)) continue;
    const parsed = stringValue(body[field], label, 3000);
    if (parsed.error) return parsed;
    value[field] = parsed.value || '';
  }
  return { value };
}

export function validateInvoiceDraftCreate(body) {
  return invoiceDraftFields(body, { create: true });
}

export function validateInvoiceDraftUpdate(body) {
  return invoiceDraftFields(body);
}

export function validateInvoiceIssue(body) {
  const object = objectValue(body, 'Invoice issue request');
  if (object.error) return object;
  const allowed = new Set(['issueDate', 'requestKey']);
  if (!onlyKeys(body, allowed)) return { error: 'Invoice issue request contains an unsupported field.' };
  const parsedDate = strictDate(body.issueDate, 'Issue date', { required: true });
  if (parsedDate.error) return parsedDate;
  const parsedKey = requestKey(body.requestKey, { required: true });
  if (parsedKey.error) return parsedKey;
  return { value: { issueDate: parsedDate.value, requestKey: parsedKey.value } };
}

export function parseBillingInvoiceListQuery(query = {}) {
  const rawPage = String(query.page ?? '1');
  const rawLimit = String(query.limit ?? '20');
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit)) {
    return { error: 'Page and limit must be positive integers.' };
  }
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (page < 1 || limit < 1 || limit > 100) {
    return { error: 'Page must be at least 1 and limit must be between 1 and 100.' };
  }
  const search = stringValue(query.search, 'Search', 120);
  if (search.error) return search;
  const recordType = String(query.recordType || 'all').trim().toLowerCase();
  if (!['all', 'v2', 'legacy'].includes(recordType)) return { error: 'Invoice record type is invalid.' };
  const documentStatus = String(query.documentStatus || '').trim().toUpperCase();
  if (documentStatus && !INVOICE_DOCUMENT_STATUSES.includes(documentStatus)) {
    return { error: 'Invoice document status is invalid.' };
  }
  const paymentStatus = String(query.paymentStatus || '').trim().toUpperCase();
  if (paymentStatus && !INVOICE_PAYMENT_STATUSES.includes(paymentStatus)) {
    return { error: 'Invoice payment status is invalid.' };
  }
  const salesOrderId = String(query.salesOrderId || '').trim();
  if (salesOrderId && !mongoose.isValidObjectId(salesOrderId)) return { error: 'Sales Order ID is invalid.' };
  const from = strictDate(query.from, 'From date');
  if (from.error) return from;
  const to = strictDate(query.to, 'To date');
  if (to.error) return to;
  if (from.value && to.value && from.value > to.value) return { error: 'From date cannot be after to date.' };
  return {
    value: {
      page,
      limit,
      search: search.value || '',
      recordType,
      documentStatus,
      paymentStatus,
      salesOrderId,
      from: from.value,
      to: to.value,
    },
  };
}

export function parseEligibleSalesOrderQuery(query = {}) {
  const parsed = parseBillingInvoiceListQuery({
    page: query.page,
    limit: query.limit,
    search: query.search,
  });
  if (parsed.error) return parsed;
  return {
    value: {
      page: parsed.value.page,
      limit: parsed.value.limit,
      search: parsed.value.search,
    },
  };
}

export function validateSellerTaxProfileUpdate(body) {
  const object = objectValue(body, 'Seller tax profile');
  if (object.error) return object;
  const allowed = new Set([
    'legalName',
    'registeredAddress',
    'gstin',
    'registrationState',
    'stateCode',
    'email',
    'phone',
    'invoiceSeries',
    'taxRules',
    'verification',
  ]);
  if (!onlyKeys(body, allowed) || !Object.keys(body).length) {
    return { error: 'Seller tax profile contains an unsupported field.' };
  }

  const value = {};
  const fields = [
    ['legalName', 'Registered business name', 180],
    ['registeredAddress', 'Registered address', 1000],
    ['registrationState', 'Registration state', 120],
    ['phone', 'Phone', 30],
  ];
  for (const [field, label, maxLength] of fields) {
    if (!Object.hasOwn(body, field)) continue;
    const parsed = stringValue(body[field], label, maxLength);
    if (parsed.error) return parsed;
    value[field] = parsed.value || '';
  }
  if (Object.hasOwn(body, 'gstin')) {
    const parsed = stringValue(body.gstin, 'GSTIN', 15);
    if (parsed.error) return parsed;
    const gstin = (parsed.value || '').toUpperCase();
    if (gstin && !GSTIN.test(gstin)) return { error: 'GSTIN format is invalid.' };
    value.gstin = gstin;
  }
  if (Object.hasOwn(body, 'stateCode')) {
    const parsed = stateCode(body.stateCode, 'Registration state code');
    if (parsed.error) return parsed;
    value.stateCode = parsed.value || '';
  }
  if (Object.hasOwn(body, 'email')) {
    const parsed = stringValue(body.email, 'Email', 254);
    if (parsed.error) return parsed;
    const email = (parsed.value || '').toLowerCase();
    if (email && !EMAIL.test(email)) return { error: 'Email format is invalid.' };
    value.email = email;
  }
  if (Object.hasOwn(body, 'invoiceSeries')) {
    const parsed = stringValue(body.invoiceSeries, 'Invoice series', 24);
    if (parsed.error) return parsed;
    const series = (parsed.value || '').toUpperCase();
    if (series && !/^[A-Z0-9][A-Z0-9/-]{0,23}$/.test(series)) {
      return { error: 'Invoice series contains unsupported characters.' };
    }
    value.invoiceSeries = series;
  }
  if (Object.hasOwn(body, 'taxRules')) {
    if (!Array.isArray(body.taxRules) || body.taxRules.length > 200) {
      return { error: 'Tax rules must be an array with at most 200 entries.' };
    }
    const seen = new Set();
    value.taxRules = [];
    for (const rule of body.taxRules) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return { error: 'A tax rule is invalid.' };
      const ruleAllowed = new Set(['stoneId', 'stoneSlug', 'hsnCode', 'taxRateBasisPoints']);
      if (!onlyKeys(rule, ruleAllowed)) return { error: 'A tax rule contains an unsupported field.' };
      const stoneId = stringValue(rule.stoneId, 'Tax rule stone ID', 80, { required: true });
      const stoneSlug = stringValue(rule.stoneSlug, 'Tax rule stone slug', 180, { required: true });
      const hsnCode = stringValue(rule.hsnCode, 'HSN code', 30, { required: true });
      if (stoneId.error || stoneSlug.error || hsnCode.error) return stoneId.error ? stoneId : stoneSlug.error ? stoneSlug : hsnCode;
      const taxRateBasisPoints = Number(rule.taxRateBasisPoints);
      if (!Number.isInteger(taxRateBasisPoints) || taxRateBasisPoints < 0 || taxRateBasisPoints > 10000) {
        return { error: 'Tax rate basis points must be an integer between 0 and 10000.' };
      }
      if (!/^\d{4,8}$/.test(hsnCode.value)) return { error: 'HSN code must contain 4-8 digits.' };
      const key = stoneId.value + '|' + stoneSlug.value.toLowerCase();
      if (seen.has(key)) return { error: 'Tax rules cannot contain duplicate stones.' };
      seen.add(key);
      value.taxRules.push({
        stoneId: stoneId.value,
        stoneSlug: stoneSlug.value.toLowerCase(),
        hsnCode: hsnCode.value,
        taxRateBasisPoints,
      });
    }
  }
  if (Object.hasOwn(body, 'verification')) {
    const verification = objectValue(body.verification, 'Verification');
    if (verification.error) return verification;
    const verificationAllowed = new Set(['identityVerified', 'taxRulesVerified', 'verificationNote']);
    if (!onlyKeys(body.verification, verificationAllowed)) return { error: 'Verification contains an unsupported field.' };
    const note = stringValue(body.verification.verificationNote, 'Verification note', 1000);
    if (note.error) return note;
    if (typeof body.verification.identityVerified !== 'boolean'
      || typeof body.verification.taxRulesVerified !== 'boolean') {
      return { error: 'Both identity and tax-rule verification flags are required.' };
    }
    if ((body.verification.identityVerified || body.verification.taxRulesVerified) && !note.value) {
      return { error: 'A verification note is required when configuration is marked verified.' };
    }
    value.verification = {
      identityVerified: body.verification.identityVerified,
      taxRulesVerified: body.verification.taxRulesVerified,
      verificationNote: note.value || '',
    };
  }
  return { value };
}

export const billingValidationPatterns = Object.freeze({ GSTIN, STATE_CODE });
