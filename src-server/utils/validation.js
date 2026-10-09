import {
  LEAD_SOURCES,
  LEAD_STAGES,
  MANUAL_ACTIVITY_TYPES,
} from '../constants/crm.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+?[0-9]{10,15}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PUBLIC_FORBIDDEN_FIELDS = [
  'stage',
  'stageHistory',
  'activities',
  'activity',
  'lostReason',
  'customer',
  'customerNumber',
  'leadNumber',
  'notification',
  'convertedAt',
  'internalNotes',
  'owner',
  'customerId',
  'sourceLead',
  '_id',
  'createdAt',
  'updatedAt',
];

export function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function validateDateRange(from, to) {
  if ((from && (!DATE_PATTERN.test(from) || Number.isNaN(Date.parse(from))))
    || (to && (!DATE_PATTERN.test(to) || Number.isNaN(Date.parse(to))))) {
    return 'Date filters must use YYYY-MM-DD.';
  }
  if (from && to && from > to) return 'The start date must not be after the end date.';
  return null;
}

function parseOptionalNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === '' || value === null || value === undefined) return { value: undefined };
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return { error: true };
  return { value: number };
}

function validateSubmissionId(value) {
  if (value == null || value === '') return { value: '' };
  const submissionId = cleanString(value, 80);
  if (!UUID_PATTERN.test(submissionId)) return { error: 'Submission ID must be a valid UUID.' };
  return { value: submissionId };
}

function containsForbiddenPublicFields(body) {
  return PUBLIC_FORBIDDEN_FIELDS.some((field) => Object.hasOwn(body, field));
}

export function normalizeSourcePath(value) {
  const raw = cleanString(value, 1000);
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://swamy-slabs.local');
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return `${parsed.pathname}${parsed.search}`.slice(0, 500);
  } catch {
    return '';
  }
}

export function normalizePhone(value) {
  const raw = cleanString(value, 30);
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${hasPlus ? '+' : ''}${digits}`;
}

export function validateAdminLogin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 256) return { error: 'Invalid credentials.' };
  return { value: { password } };
}

export function validateCallback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };

  const value = {
    productName: cleanString(body.productName, 150),
    customerName: cleanString(body.customerName || body.name, 120),
    phoneNumber: normalizePhone(body.phoneNumber || body.phone),
    preferredTime: cleanString(body.preferredTime, 80),
    email: cleanString(body.email, 254).toLowerCase(),
    sourcePage: cleanString(body.sourcePage || body.source, 500),
    message: cleanString(body.message, 3000),
    company: cleanString(body.company, 160),
    project: cleanString(body.project, 200),
  };

  const isLeadCapture = (!value.productName && !value.preferredTime) || value.productName === 'Lead Capture Popup';
  if (!value.phoneNumber || !PHONE_PATTERN.test(value.phoneNumber)) return { error: 'A valid phone number is required.' };
  if (!isLeadCapture && (!value.customerName || !value.productName || !value.preferredTime)) {
    return { error: 'Name, product, phone number, and preferred time are required.' };
  }
  if (value.email && !EMAIL_PATTERN.test(value.email)) return { error: 'A valid email address is required.' };
  return { value, isLeadCapture };
}

export function validateEnquiry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  const value = {
    customerName: cleanString(body.customerName, 120),
    email: cleanString(body.email, 254).toLowerCase(),
    phoneNumber: normalizePhone(body.phoneNumber),
    productName: cleanString(body.productName, 150),
    productId: cleanString(body.productId, 80),
    productSlug: cleanString(body.productSlug, 180),
    productUrl: cleanString(body.productUrl, 500),
    materialType: cleanString(body.materialType, 100),
    selectedFinish: cleanString(body.selectedFinish, 120),
    thickness: cleanString(body.thickness, 50),
    quantity: cleanString(body.quantity, 100),
    company: cleanString(body.company, 160),
    projectLocation: cleanString(body.projectLocation, 200),
    message: cleanString(body.message, 3000),
  };

  if (!value.customerName) return { error: 'Customer name is required.' };
  if (!EMAIL_PATTERN.test(value.email)) return { error: 'A valid email address is required.' };
  if (!PHONE_PATTERN.test(value.phoneNumber)) return { error: 'A valid phone number is required.' };
  if (!value.productName || !value.quantity) return { error: 'Product and quantity are required.' };
  return { value };
}

export function validatePublicEnquiry(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  if (containsForbiddenPublicFields(body)) return { error: 'Unsupported public submission field.' };

  const base = validateEnquiry(body);
  if (base.error) return base;
  const submission = validateSubmissionId(body.submissionId);
  if (submission.error) return submission;

  const source = cleanString(body.source, 40) || 'STONE_ENQUIRY';
  const allowedSources = ['PROJECT_PLANNER', 'STONE_ENQUIRY', 'PROJECT_SELECTION'];
  if (!allowedSources.includes(source)) return { error: 'Invalid enquiry source.' };

  let materialSelections;
  if (body.materialSelections) {
    try {
      const parsed = typeof body.materialSelections === 'string'
        ? JSON.parse(body.materialSelections)
        : body.materialSelections;
      if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 25) {
        return { error: 'Material selections must contain between 1 and 25 items.' };
      }
      materialSelections = parsed.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const stoneName = cleanString(item.stoneName || item.name, 150);
        const quantity = Number(item.quantity);
        if (!stoneName || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return null;
        return {
          stoneId: cleanString(item.stoneId || item.id, 80),
          stoneSlug: cleanString(item.stoneSlug || item.slug, 180),
          stoneName,
          materialFamily: cleanString(item.materialFamily, 100),
          finish: cleanString(item.finish, 120),
          thickness: cleanString(item.thickness, 50),
          quantity,
        };
      });
      if (materialSelections.some((item) => item === null)) return { error: 'A material selection is invalid.' };
    } catch {
      return { error: 'Material selections must be valid JSON.' };
    }
  }
  if (source === 'PROJECT_SELECTION' && !materialSelections?.length) {
    return { error: 'Project Selection enquiries require selected materials.' };
  }

  const numericFields = {
    projectAreaSqFt: parseOptionalNumber(body.projectAreaSqFt, { max: 10_000_000 }),
    planningAllowancePercent: parseOptionalNumber(body.planningAllowancePercent, { max: 100 }),
    requiredAreaSqFt: parseOptionalNumber(body.requiredAreaSqFt, { max: 20_000_000 }),
    estimatedSlabs: parseOptionalNumber(body.estimatedSlabs, { max: 1_000_000 }),
    indicativeMaterialEstimate: parseOptionalNumber(body.indicativeMaterialEstimate, { max: 1_000_000_000_000 }),
  };
  if (Object.values(numericFields).some((field) => field.error)) {
    return { error: 'Estimator context contains an invalid number.' };
  }

  const value = base.value;
  return {
    value: {
      submissionId: submission.value,
      source,
      contact: {
        name: value.customerName,
        company: value.company,
        email: value.email,
        phone: value.phoneNumber,
      },
      project: {
        location: value.projectLocation,
        message: value.message,
        enteredArea: cleanString(body.enteredArea, 160),
        sourcePage: normalizeSourcePath(value.productUrl),
      },
      materialContext: {
        stoneId: value.productId,
        stoneSlug: value.productSlug,
        stoneName: value.productName,
        materialFamily: value.materialType,
        finish: value.selectedFinish,
        thickness: value.thickness,
        application: cleanString(body.application, 160),
        quantity: value.quantity,
      },
      materialSelections,
      estimatorContext: Object.fromEntries(
        Object.entries(numericFields)
          .filter(([, field]) => field.value !== undefined)
          .map(([key, field]) => [key, field.value]),
      ),
    },
  };
}

export function validatePublicCallback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  if (containsForbiddenPublicFields(body)) return { error: 'Unsupported public submission field.' };
  const submission = validateSubmissionId(body.submissionId);
  if (submission.error) return submission;

  const requestedSource = cleanString(body.source, 40);
  const productName = cleanString(body.productName, 150);
  const inferredSource = productName === 'Lead Capture Popup'
    ? 'CATALOG_REQUEST'
    : productName === 'General Inquiry - Contact Form'
      ? 'CONTACT'
      : 'CALLBACK';
  const source = requestedSource || inferredSource;
  if (!['CONTACT', 'CALLBACK', 'CATALOG_REQUEST'].includes(source)) {
    return { error: 'Invalid callback source.' };
  }

  const value = {
    productName,
    customerName: cleanString(body.customerName || body.name, 120),
    phoneNumber: normalizePhone(body.phoneNumber || body.phone),
    preferredTime: cleanString(body.preferredTime, 100),
    email: cleanString(body.email, 254).toLowerCase(),
    sourcePage: normalizeSourcePath(body.sourcePage || body.sourcePath),
    message: cleanString(body.message, 3000),
    company: cleanString(body.company, 160),
    project: cleanString(body.project, 200),
  };
  if (!PHONE_PATTERN.test(value.phoneNumber)) return { error: 'A valid phone number is required.' };
  if (value.email && !EMAIL_PATTERN.test(value.email)) return { error: 'A valid email address is required.' };
  if (source === 'CONTACT' && (!value.customerName || !value.email)) {
    return { error: 'Name, email, and phone number are required.' };
  }
  if (source === 'CALLBACK' && (!value.customerName || !value.productName || !value.preferredTime)) {
    return { error: 'Name, product, phone number, and preferred time are required.' };
  }

  return {
    value: {
      submissionId: submission.value,
      source,
      contact: {
        name: value.customerName,
        company: value.company,
        email: value.email,
        phone: value.phoneNumber,
      },
      project: {
        message: value.message || value.project,
        sourcePage: value.sourcePage,
        preferredContactTime: value.preferredTime,
      },
      materialContext: {
        stoneName: value.productName,
      },
    },
  };
}

function parsePagination(query, defaultLimit = 20) {
  const rawPage = query.page ?? '1';
  const rawLimit = query.limit ?? String(defaultLimit);
  if (!/^\d+$/.test(String(rawPage)) || !/^\d+$/.test(String(rawLimit))) {
    return { error: 'Page and limit must be positive integers.' };
  }
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (page < 1 || limit < 1 || limit > 100) {
    return { error: 'Page must be at least 1 and limit must be between 1 and 100.' };
  }
  return { value: { page, limit } };
}

export function parseLeadListQuery(query) {
  const pagination = parsePagination(query);
  if (pagination.error) return pagination;
  const search = cleanString(query.search, 120);
  const stage = cleanString(query.stage, 40);
  const source = cleanString(query.source, 40);
  const from = cleanString(query.from, 10);
  const to = cleanString(query.to, 10);
  if (stage && !LEAD_STAGES.includes(stage)) return { error: 'Invalid lead stage.' };
  if (source && !LEAD_SOURCES.includes(source)) return { error: 'Invalid lead source.' };
  const dateError = validateDateRange(from, to);
  if (dateError) return { error: dateError };
  return { value: { ...pagination.value, search, stage, source, from, to } };
}

export function parseCustomerListQuery(query) {
  const pagination = parsePagination(query);
  if (pagination.error) return pagination;
  return { value: { ...pagination.value, search: cleanString(query.search, 120) } };
}

export function validateLeadStageUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  const allowedKeys = new Set(['stage', 'reason']);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return { error: 'Unsupported lead update field.' };
  const stage = cleanString(body.stage, 40);
  const reason = cleanString(body.reason, 1000);
  if (!LEAD_STAGES.includes(stage)) return { error: 'A valid lead stage is required.' };
  if (stage === 'LOST' && !reason) return { error: 'A reason is required when marking a lead as lost.' };
  return { value: { stage, reason } };
}

export function validateLeadActivity(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  const allowedKeys = new Set(['type', 'note']);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return { error: 'Unsupported activity field.' };
  const type = cleanString(body.type, 40);
  const note = cleanString(body.note, 3000);
  if (!MANUAL_ACTIVITY_TYPES.includes(type)) return { error: 'A valid activity type is required.' };
  if (!note) return { error: 'Activity notes are required.' };
  return { value: { type, note } };
}

function validateAddress(value, label) {
  if (value == null) return { value: undefined };
  if (typeof value !== 'object' || Array.isArray(value)) return { error: `${label} is invalid.` };
  const allowed = new Set(['line1', 'line2', 'city', 'state', 'postalCode', 'country']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return { error: `${label} contains an unsupported field.` };
  return {
    value: {
      line1: cleanString(value.line1, 240),
      line2: cleanString(value.line2, 240),
      city: cleanString(value.city, 120),
      state: cleanString(value.state, 120),
      postalCode: cleanString(value.postalCode, 20),
      country: cleanString(value.country, 120),
    },
  };
}

export function validateCustomerUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  const allowed = new Set(['name', 'company', 'email', 'phone', 'gstin', 'billingAddress', 'deliveryAddress', 'notes']);
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
    return { error: 'Unsupported customer update field.' };
  }

  const value = {};
  if (Object.hasOwn(body, 'name')) {
    value.name = cleanString(body.name, 120);
    if (!value.name) return { error: 'Customer name is required.' };
  }
  if (Object.hasOwn(body, 'company')) value.company = cleanString(body.company, 160);
  if (Object.hasOwn(body, 'email')) {
    value.email = cleanString(body.email, 254).toLowerCase();
    if (value.email && !EMAIL_PATTERN.test(value.email)) return { error: 'A valid email address is required.' };
  }
  if (Object.hasOwn(body, 'phone')) {
    value.phone = normalizePhone(body.phone);
    if (!PHONE_PATTERN.test(value.phone)) return { error: 'A valid phone number is required.' };
  }
  if (Object.hasOwn(body, 'gstin')) value.gstin = cleanString(body.gstin, 30).toUpperCase();
  if (Object.hasOwn(body, 'notes')) value.notes = cleanString(body.notes, 3000);
  for (const field of ['billingAddress', 'deliveryAddress']) {
    if (!Object.hasOwn(body, field)) continue;
    const address = validateAddress(body[field], field === 'billingAddress' ? 'Billing address' : 'Delivery address');
    if (address.error) return address;
    value[field] = address.value;
  }
  return { value };
}

export function parseInvoiceListQuery(query) {
  const rawPage = query.page ?? '1';
  const rawLimit = query.limit ?? '20';
  if (!/^\d+$/.test(String(rawPage)) || !/^\d+$/.test(String(rawLimit))) return { error: 'Page and limit must be positive integers.' };

  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (page < 1 || limit < 1 || limit > 100) return { error: 'Page must be at least 1 and limit must be between 1 and 100.' };

  const search = cleanString(query.search, 120);
  const from = cleanString(query.from, 10);
  const to = cleanString(query.to, 10);
  const dateError = validateDateRange(from, to);
  if (dateError) return { error: dateError };
  return { value: { page, limit, search, from, to } };
}

export function validateInvoiceInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request.' };
  if (!body.buyer?.name || typeof body.buyer.name !== 'string' || body.buyer.name.trim().length > 160) return { error: 'A valid buyer name is required.' };
  if (!body.consignee?.name || typeof body.consignee.name !== 'string' || body.consignee.name.trim().length > 160) return { error: 'A valid consignee name is required.' };
  if (!Array.isArray(body.lineItems) || body.lineItems.length < 1 || body.lineItems.length > 100) return { error: 'Between 1 and 100 line items are required.' };
  if (body.invoiceDate && Number.isNaN(Date.parse(body.invoiceDate))) return { error: 'Invoice date is invalid.' };
  if (body.notes != null && (typeof body.notes !== 'string' || body.notes.length > 3000)) return { error: 'Notes must be 3000 characters or fewer.' };

  const boundedFields = [
    [body.invoiceNumber, 80, 'Invoice number'],
    [body.poNumber, 120, 'PO number'],
    [body.placeOfSupply, 120, 'Place of supply'],
    [body.buyer?.address, 1000, 'Buyer address'],
    [body.buyer?.state, 100, 'Buyer state'],
    [body.buyer?.stateCode, 10, 'Buyer state code'],
    [body.buyer?.gstin, 30, 'Buyer GSTIN'],
    [body.consignee?.address, 1000, 'Consignee address'],
    [body.consignee?.state, 100, 'Consignee state'],
    [body.consignee?.stateCode, 10, 'Consignee state code'],
    [body.consignee?.gstin, 30, 'Consignee GSTIN'],
  ];
  for (const [field, maxLength, label] of boundedFields) {
    if (field != null && (typeof field !== 'string' || field.length > maxLength)) return { error: `${label} is invalid.` };
  }

  const taxRate = Number(body.taxRate ?? 18);
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return { error: 'Tax rate must be between 0 and 100.' };

  for (const item of body.lineItems) {
    const qty = Number(item?.qty);
    const rate = Number(item?.rate);
    if (!item || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 500) return { error: 'Each line item requires a valid description.' };
    if (item.hsnCode != null && (typeof item.hsnCode !== 'string' || item.hsnCode.length > 30)) return { error: 'Line-item HSN code is invalid.' };
    if (item.unit != null && (typeof item.unit !== 'string' || item.unit.length > 30)) return { error: 'Line-item unit is invalid.' };
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(rate) || rate < 0) return { error: 'Line-item quantity must be greater than zero and rate cannot be negative.' };
  }

  return { value: body };
}
