import mongoose from 'mongoose';
import {
  DEFAULT_PAYMENT_PAGE_SIZE,
  MAX_PAYMENT_PAGE_SIZE,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '../constants/payment.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function allowedKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.has(key));
}

function cleanString(value, maxLength) {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
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

function parseDateOnly(value, label) {
  if (value == null || value === '') return { value: undefined };
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return { error: `${label} is invalid.` };
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { error: `${label} is invalid.` };
  }
  return { value: date };
}

function optionalObjectId(value, label) {
  if (value == null || value === '') return { value: undefined };
  if (!mongoose.isValidObjectId(value)) return { error: `${label} is invalid.` };
  return { value: String(value) };
}

export function validatePaymentCreate(body) {
  const input = body ?? {};
  const keys = new Set([
    'invoiceId',
    'customerId',
    'amountMinor',
    'currency',
    'method',
    'referenceNumber',
    'receivedAt',
    'notes',
    'requestKey',
  ]);
  if (!allowedKeys(input, keys)) return { error: 'Payment input contains unsupported fields.' };
  if (!mongoose.isValidObjectId(input.invoiceId)) return { error: 'A valid invoice ID is required.' };
  if (!mongoose.isValidObjectId(input.customerId)) return { error: 'A valid customer ID is required.' };
  if (typeof input.amountMinor !== 'number'
    || !Number.isSafeInteger(input.amountMinor)
    || input.amountMinor <= 0) {
    return { error: 'Payment amount must be a positive safe integer in minor units.' };
  }

  const requestKey = cleanString(input.requestKey, 120);
  if (!requestKey || requestKey.length < 8) {
    return { error: 'Payment request key must contain between 8 and 120 characters.' };
  }
  const currency = cleanString(input.currency ?? 'INR', 3);
  if (currency?.toUpperCase() !== 'INR') return { error: 'Payment currency must be INR.' };
  const method = cleanString(input.method, 40);
  if (!method || !PAYMENT_METHODS.includes(method)) return { error: 'Payment method is invalid.' };
  const referenceNumber = cleanString(input.referenceNumber, 160);
  const notes = cleanString(input.notes, 1000);
  if (referenceNumber === null || notes === null) return { error: 'Payment text is too long or invalid.' };

  let receivedAt;
  if (input.receivedAt != null && input.receivedAt !== '') {
    if (typeof input.receivedAt !== 'string') return { error: 'Payment received date is invalid.' };
    receivedAt = new Date(input.receivedAt);
    if (Number.isNaN(receivedAt.getTime())) return { error: 'Payment received date is invalid.' };
  }

  return {
    value: {
      invoiceId: String(input.invoiceId),
      customerId: String(input.customerId),
      amountMinor: input.amountMinor,
      currency: 'INR',
      method,
      requestKey,
      ...(referenceNumber ? { referenceNumber } : {}),
      ...(receivedAt ? { receivedAt } : {}),
      ...(notes ? { notes } : {}),
    },
  };
}

export function validatePaymentConfirm(body) {
  const input = body ?? {};
  if (!allowedKeys(input, new Set(['note']))) return { error: 'Payment confirmation contains unsupported fields.' };
  const note = cleanString(input.note, 1000);
  if (note === null) return { error: 'Payment confirmation note is invalid.' };
  return { value: { ...(note ? { note } : {}) } };
}

export function validatePaymentReasonAction(body, action = 'Payment action') {
  const input = body ?? {};
  if (!allowedKeys(input, new Set(['reason']))) return { error: `${action} contains unsupported fields.` };
  const reason = cleanString(input.reason, 1000);
  if (!reason) return { error: `${action} reason is required.` };
  return { value: { reason } };
}

export function parsePaymentListQuery(query) {
  const input = query ?? {};
  const keys = new Set([
    'page',
    'limit',
    'search',
    'status',
    'method',
    'invoiceId',
    'customerId',
    'from',
    'to',
  ]);
  if (!allowedKeys(input, keys)) return { error: 'Payment list query contains unsupported fields.' };

  const page = parsePositiveInteger(input.page, 'Page', { defaultValue: 1 });
  const limit = parsePositiveInteger(input.limit, 'Limit', {
    defaultValue: DEFAULT_PAYMENT_PAGE_SIZE,
    maximum: MAX_PAYMENT_PAGE_SIZE,
  });
  if (page.error || limit.error) return page.error ? page : limit;

  const search = cleanString(input.search, 160);
  if (search === null) return { error: 'Payment search is invalid.' };
  const status = cleanString(input.status, 40);
  if (status === null || (status && !PAYMENT_STATUSES.includes(status))) return { error: 'Payment status is invalid.' };
  const method = cleanString(input.method, 40);
  if (method === null || (method && !PAYMENT_METHODS.includes(method))) return { error: 'Payment method is invalid.' };
  const invoiceId = optionalObjectId(input.invoiceId, 'Invoice ID');
  const customerId = optionalObjectId(input.customerId, 'Customer ID');
  if (invoiceId.error || customerId.error) return invoiceId.error ? invoiceId : customerId;

  const from = parseDateOnly(input.from, 'From date');
  const to = parseDateOnly(input.to, 'To date');
  if (from.error || to.error) return from.error ? from : to;
  if (from.value && to.value && from.value > to.value) return { error: 'From date cannot be after to date.' };

  return {
    value: {
      page: page.value,
      limit: limit.value,
      ...(search ? { search } : {}),
      ...(status ? { status } : {}),
      ...(method ? { method } : {}),
      ...(invoiceId.value ? { invoiceId: invoiceId.value } : {}),
      ...(customerId.value ? { customerId: customerId.value } : {}),
      ...(from.value ? { from: from.value } : {}),
      ...(to.value ? { to: to.value } : {}),
    },
  };
}
