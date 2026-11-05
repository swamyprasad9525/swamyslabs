import mongoose from 'mongoose';
import {
  CommercialError,
  acceptQuotation,
  cancelQuotation,
  convertQuotationToSalesOrder,
  createQuotation,
  expireQuotation,
  getQuotation,
  getQuotationSummary,
  issueQuotation,
  listQuotationEvents,
  listQuotations,
  rejectQuotation,
  reviseQuotation,
  updateQuotation,
} from '../services/commercialService.js';
import {
  parseQuotationListQuery,
  validateCommercialAction,
  validateQuotationPayload,
} from '../utils/commercialValidation.js';

const AUTHENTICATED_ADMIN_ACTOR = 'authenticated-admin';

function adminJson(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(adminJson);
  if (typeof value?.toObject === 'function') return adminJson(value.toObject({ versionKey: false }));
  if (value instanceof Date || value.constructor !== Object) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== '__v')
    .map(([key, entry]) => [key, adminJson(entry)]));
}

function validationFailure(res, validation) {
  if (!validation.error) return false;
  res.status(400).json({ error: validation.error });
  return true;
}

function invalidQuotationId(res, value) {
  if (mongoose.isValidObjectId(value)) return false;
  res.status(400).json({ error: 'Invalid quotation ID.', code: 'INVALID_ID' });
  return true;
}

function handleCommercialError(res, error, fallbackMessage) {
  if (error instanceof CommercialError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error?.name === 'ValidationError' || error?.name === 'CastError' || error?.name === 'StrictModeError') {
    return res.status(400).json({ error: 'Invalid commercial data.' });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ error: 'A commercial record with that reference already exists.' });
  }
  console.error(`${fallbackMessage}:`, error?.name || 'Unexpected error');
  return res.status(500).json({ error: fallbackMessage });
}

function quotationAllowedActions(quotation) {
  return {
    edit: quotation.status === 'DRAFT',
    issue: quotation.status === 'DRAFT',
    accept: quotation.status === 'ISSUED',
    reject: quotation.status === 'ISSUED',
    expire: quotation.status === 'ISSUED',
    revise: ['ISSUED', 'REJECTED', 'EXPIRED'].includes(quotation.status),
    cancel: ['DRAFT', 'ISSUED', 'ACCEPTED'].includes(quotation.status),
    convert: quotation.status === 'ACCEPTED' && !quotation.convertedSalesOrderId,
  };
}

export async function quotationSummary(_req, res) {
  try {
    return res.json({ summary: adminJson(await getQuotationSummary({})) });
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load quotation summary.');
  }
}

export async function listQuotationRecords(req, res) {
  const validation = parseQuotationListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;
  try {
    return res.json(adminJson(await listQuotations(validation.value)));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load quotations.');
  }
}

export async function createQuotationRecord(req, res) {
  const validation = validateQuotationPayload(req.body);
  if (validationFailure(res, validation)) return undefined;
  try {
    const result = await createQuotation({ input: validation.value, actor: AUTHENTICATED_ADMIN_ACTOR });
    return res.status(201).json({ quotation: adminJson(result.quotation) });
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to create quotation.');
  }
}

export async function getQuotationRecord(req, res) {
  if (invalidQuotationId(res, req.params.id)) return undefined;
  try {
    const [quotation, events] = await Promise.all([
      getQuotation({ quotationId: req.params.id }),
      listQuotationEvents({ quotationId: req.params.id }),
    ]);
    return res.json(adminJson({ quotation, events, allowedActions: quotationAllowedActions(quotation) }));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load quotation.');
  }
}

export async function updateQuotationRecord(req, res) {
  if (invalidQuotationId(res, req.params.id)) return undefined;
  const validation = validateQuotationPayload(req.body);
  if (validationFailure(res, validation)) return undefined;
  try {
    const result = await updateQuotation({
      quotationId: req.params.id,
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json({ quotation: adminJson(result.quotation) });
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to update quotation.');
  }
}

function actionController(operation, fallbackMessage, {
  requireReason = false,
  revision = false,
  createdWhenNew = false,
} = {}) {
  return async (req, res) => {
    if (invalidQuotationId(res, req.params.id)) return undefined;
    const validation = validateCommercialAction(req.body, { requireReason });
    if (validationFailure(res, validation)) return undefined;
    try {
      const result = await operation({
        quotationId: req.params.id,
        actor: AUTHENTICATED_ADMIN_ACTOR,
        reason: validation.value.reason,
        note: validation.value.note || (revision ? validation.value.reason : undefined),
      });
      const status = createdWhenNew && result.duplicate === false ? 201 : 200;
      return res.status(status).json(adminJson({
        ...(result.quotation ? { quotation: result.quotation } : {}),
        ...(result.salesOrder ? { salesOrder: result.salesOrder } : {}),
        ...(result.duplicate !== undefined ? { duplicate: result.duplicate } : {}),
      }));
    } catch (error) {
      return handleCommercialError(res, error, fallbackMessage);
    }
  };
}

export const issueQuotationRecord = actionController(issueQuotation, 'Failed to issue quotation.');
export const acceptQuotationRecord = actionController(acceptQuotation, 'Failed to accept quotation.');
export const rejectQuotationRecord = actionController(rejectQuotation, 'Failed to reject quotation.', { requireReason: true });
export const expireQuotationRecord = actionController(expireQuotation, 'Failed to expire quotation.');
export const cancelQuotationRecord = actionController(cancelQuotation, 'Failed to cancel quotation.', { requireReason: true });
export const reviseQuotationRecord = actionController(reviseQuotation, 'Failed to revise quotation.', { revision: true });
export const convertQuotationRecord = actionController(
  convertQuotationToSalesOrder,
  'Failed to convert quotation.',
  { createdWhenNew: true },
);
