import mongoose from 'mongoose';
import {
  DEFAULT_DISPATCH_PAGE_SIZE,
  DISPATCH_STATUSES,
  MAX_DISPATCH_PAGE_SIZE,
  MAX_DISPATCH_RESERVATIONS,
  TRANSPORT_MODES,
} from '../constants/dispatch.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATE_CODE = /^\d{2}$/;

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: `${label} is invalid.` };
  }
  return { value };
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function stringValue(value, label, maxLength, { required = false } = {}) {
  if (value == null || value === '') {
    return required ? { error: `${label} is required.` } : { value: undefined };
  }
  if (typeof value !== 'string') return { error: `${label} must be text.` };
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) {
    return { error: `${label} is invalid.` };
  }
  return { value: normalized || undefined };
}

function strictDate(value, label, { required = false } = {}) {
  if (value == null || value === '') {
    return required ? { error: `${label} is required.` } : { value: undefined };
  }
  if (typeof value === 'string' && ISO_DATE.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return { error: `${label} is invalid.` };
    }
    return { value: date };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { error: `${label} is invalid.` };
  return { value: date };
}

function stateCode(value, label, { required = false } = {}) {
  const parsed = stringValue(value, label, 2, { required });
  if (parsed.error || parsed.value === undefined) return parsed;
  return STATE_CODE.test(parsed.value)
    ? parsed
    : { error: `${label} must be a two-digit Indian state code.` };
}

function addressValue(value, label) {
  if (value == null) return { value: undefined };
  const object = objectValue(value, label);
  if (object.error) return object;
  const allowed = new Set(['line1', 'line2', 'city', 'state', 'stateCode', 'postalCode', 'country']);
  if (!onlyKeys(value, allowed)) return { error: `${label} contains an unsupported field.` };
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
    const parsed = stringValue(value[field], `${label} ${field}`, maxLength);
    if (parsed.error) return parsed;
    if (parsed.value !== undefined) normalized[field] = parsed.value;
  }
  const parsedStateCode = stateCode(value.stateCode, `${label} state code`);
  if (parsedStateCode.error) return parsedStateCode;
  if (parsedStateCode.value !== undefined) normalized.stateCode = parsedStateCode.value;
  return { value: normalized };
}

function transportValue(value) {
  if (value == null) return { value: undefined };
  const object = objectValue(value, 'Transport details');
  if (object.error) return object;
  const allowed = new Set([
    'mode',
    'transporterName',
    'vehicleNumber',
    'driverName',
    'driverPhone',
    'lrNumber',
    'ewayBillNumber',
    'notes',
  ]);
  if (!onlyKeys(value, allowed)) return { error: 'Transport contains an unsupported field.' };

  const mode = value.mode ? String(value.mode).trim().toUpperCase() : 'BY_LORRY';
  if (!TRANSPORT_MODES.includes(mode)) return { error: 'Transport mode is invalid.' };

  const transporterName = stringValue(value.transporterName, 'Transporter name', 180);
  if (transporterName.error) return transporterName;
  const vehicleNumber = stringValue(value.vehicleNumber, 'Vehicle number', 50);
  if (vehicleNumber.error) return vehicleNumber;
  const driverName = stringValue(value.driverName, 'Driver name', 120);
  if (driverName.error) return driverName;
  const driverPhone = stringValue(value.driverPhone, 'Driver phone', 30);
  if (driverPhone.error) return driverPhone;
  const lrNumber = stringValue(value.lrNumber, 'LR number', 100);
  if (lrNumber.error) return lrNumber;
  const ewayBillNumber = stringValue(value.ewayBillNumber, 'E-way bill number', 50);
  if (ewayBillNumber.error) return ewayBillNumber;
  const notes = stringValue(value.notes, 'Transport notes', 1000);
  if (notes.error) return notes;

  return {
    value: {
      mode,
      ...(transporterName.value ? { transporterName: transporterName.value } : {}),
      ...(vehicleNumber.value ? { vehicleNumber: vehicleNumber.value.toUpperCase() } : {}),
      ...(driverName.value ? { driverName: driverName.value } : {}),
      ...(driverPhone.value ? { driverPhone: driverPhone.value } : {}),
      ...(lrNumber.value ? { lrNumber: lrNumber.value } : {}),
      ...(ewayBillNumber.value ? { ewayBillNumber: ewayBillNumber.value } : {}),
      ...(notes.value ? { notes: notes.value } : {}),
    },
  };
}

function reservationIdsValue(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: 'At least one reservation is required for dispatch.' };
  }
  if (value.length > MAX_DISPATCH_RESERVATIONS) {
    return { error: `At most ${MAX_DISPATCH_RESERVATIONS} reservations can be dispatched at once.` };
  }
  const normalized = [];
  const seen = new Set();
  for (const id of value) {
    if (!mongoose.isValidObjectId(id)) return { error: 'A reservation ID is invalid.' };
    const str = String(id);
    if (seen.has(str)) return { error: 'Duplicate reservations are not allowed.' };
    seen.add(str);
    normalized.push(str);
  }
  return { value: normalized };
}

export function validateDispatchCreate(body) {
  const object = objectValue(body, 'Dispatch create request');
  if (object.error) return object;
  const allowed = new Set([
    'salesOrderId',
    'reservationIds',
    'dispatchDate',
    'transport',
    'destinationAddress',
    'notes',
    'requestKey',
  ]);
  if (!onlyKeys(body, allowed)) return { error: 'Dispatch create request contains an unsupported field.' };

  if (!mongoose.isValidObjectId(body.salesOrderId)) {
    return { error: 'A valid Sales Order ID is required.' };
  }

  const reservations = reservationIdsValue(body.reservationIds);
  if (reservations.error) return reservations;

  const dispatchDate = strictDate(body.dispatchDate, 'Dispatch date');
  if (dispatchDate.error) return dispatchDate;

  const transport = transportValue(body.transport);
  if (transport.error) return transport;

  const destinationAddress = addressValue(body.destinationAddress, 'Destination address');
  if (destinationAddress.error) return destinationAddress;

  const notes = stringValue(body.notes, 'Notes', 2000);
  if (notes.error) return notes;

  const requestKey = stringValue(body.requestKey, 'Request key', 120);
  if (requestKey.error) return requestKey;

  return {
    value: {
      salesOrderId: String(body.salesOrderId),
      reservationIds: reservations.value,
      dispatchDate: dispatchDate.value || new Date(),
      transport: transport.value || { mode: 'BY_LORRY' },
      ...(destinationAddress.value ? { destinationAddress: destinationAddress.value } : {}),
      ...(notes.value ? { notes: notes.value } : {}),
      ...(requestKey.value ? { requestKey: requestKey.value } : {}),
    },
  };
}

export function validateDispatchUpdate(body) {
  const object = objectValue(body, 'Dispatch update request');
  if (object.error) return object;
  const allowed = new Set([
    'dispatchDate',
    'transport',
    'destinationAddress',
    'notes',
    'reservationIds',
  ]);
  if (!onlyKeys(body, allowed) || !Object.keys(body).length) {
    return { error: 'Dispatch update request must contain at least one valid field.' };
  }

  const value = {};
  if (Object.hasOwn(body, 'dispatchDate')) {
    const parsed = strictDate(body.dispatchDate, 'Dispatch date');
    if (parsed.error) return parsed;
    value.dispatchDate = parsed.value;
  }
  if (Object.hasOwn(body, 'transport')) {
    const parsed = transportValue(body.transport);
    if (parsed.error) return parsed;
    value.transport = parsed.value;
  }
  if (Object.hasOwn(body, 'destinationAddress')) {
    const parsed = addressValue(body.destinationAddress, 'Destination address');
    if (parsed.error) return parsed;
    value.destinationAddress = parsed.value;
  }
  if (Object.hasOwn(body, 'notes')) {
    const parsed = stringValue(body.notes, 'Notes', 2000);
    if (parsed.error) return parsed;
    value.notes = parsed.value || '';
  }
  if (Object.hasOwn(body, 'reservationIds')) {
    const parsed = reservationIdsValue(body.reservationIds);
    if (parsed.error) return parsed;
    value.reservationIds = parsed.value;
  }

  return { value };
}

export function validateDispatchCancel(body) {
  const object = objectValue(body, 'Dispatch cancel request');
  if (object.error) return object;
  const allowed = new Set(['reason']);
  if (!onlyKeys(body, allowed)) return { error: 'Dispatch cancel request contains an unsupported field.' };

  const reason = stringValue(body.reason, 'Cancellation reason', 1000, { required: true });
  if (reason.error) return reason;
  return { value: { reason: reason.value } };
}

export function validateDispatchConfirm(body = {}) {
  const object = objectValue(body, 'Dispatch confirm request');
  if (object.error) return object;
  const allowed = new Set(['gatePassNumber', 'notes']);
  if (!onlyKeys(body, allowed)) return { error: 'Dispatch confirm request contains an unsupported field.' };

  const gatePassNumber = stringValue(body.gatePassNumber, 'Gate pass number', 80);
  if (gatePassNumber.error) return gatePassNumber;
  const notes = stringValue(body.notes, 'Notes', 1000);
  if (notes.error) return notes;

  return {
    value: {
      ...(gatePassNumber.value ? { gatePassNumber: gatePassNumber.value } : {}),
      ...(notes.value ? { notes: notes.value } : {}),
    },
  };
}

export function parseDispatchListQuery(query = {}) {
  const rawPage = String(query.page ?? '1');
  const rawLimit = String(query.limit ?? String(DEFAULT_DISPATCH_PAGE_SIZE));
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit)) {
    return { error: 'Page and limit must be positive integers.' };
  }
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (page < 1 || limit < 1 || limit > MAX_DISPATCH_PAGE_SIZE) {
    return { error: `Page must be at least 1 and limit must be between 1 and ${MAX_DISPATCH_PAGE_SIZE}.` };
  }

  const search = stringValue(query.search, 'Search', 120);
  if (search.error) return search;

  const status = String(query.status || '').trim().toUpperCase();
  if (status && !DISPATCH_STATUSES.includes(status)) {
    return { error: 'Dispatch status is invalid.' };
  }

  const salesOrderId = String(query.salesOrderId || '').trim();
  if (salesOrderId && !mongoose.isValidObjectId(salesOrderId)) {
    return { error: 'Sales Order ID is invalid.' };
  }

  const customerId = String(query.customerId || '').trim();
  if (customerId && !mongoose.isValidObjectId(customerId)) {
    return { error: 'Customer ID is invalid.' };
  }

  const from = strictDate(query.from, 'From date');
  if (from.error) return from;
  const to = strictDate(query.to, 'To date');
  if (to.error) return to;
  if (from.value && to.value && from.value > to.value) {
    return { error: 'From date cannot be after to date.' };
  }

  return {
    value: {
      page,
      limit,
      search: search.value || '',
      ...(status ? { status } : {}),
      ...(salesOrderId ? { salesOrderId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(from.value ? { from: from.value } : {}),
      ...(to.value ? { to: to.value } : {}),
    },
  };
}

