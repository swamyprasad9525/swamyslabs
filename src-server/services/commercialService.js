import mongoose from 'mongoose';
import {
  QUOTATION_REFERENCE_PREFIX,
  SALES_ORDER_REFERENCE_PREFIX,
  isQuotationTransitionAllowed,
} from '../constants/commercial.js';
import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';
import InventoryReservation from '../models/InventoryReservation.js';
import Lead from '../models/Lead.js';
import ProcessingJob from '../models/ProcessingJob.js';
import Quotation from '../models/Quotation.js';
import QuotationEvent from '../models/QuotationEvent.js';
import SalesOrder from '../models/SalesOrder.js';
import SalesOrderEvent from '../models/SalesOrderEvent.js';
import { resolveCatalogStoneReference } from '../utils/catalogBridge.js';
import { escapeRegex } from '../utils/security.js';
import { calculateQuotationTotals } from '../../src/lib/commercialMath.js';
import { releaseSalesOrderReservations } from './reservationService.js';

const INDIA_OFFSET_MS = 330 * 60 * 1000;
const AREA_PRECISION = 4;

const DEFAULT_MODELS = Object.freeze({
  CounterModel: Counter,
  CustomerModel: Customer,
  InventoryReservationModel: InventoryReservation,
  LeadModel: Lead,
  ProcessingJobModel: ProcessingJob,
  QuotationModel: Quotation,
  QuotationEventModel: QuotationEvent,
  SalesOrderModel: SalesOrder,
  SalesOrderEventModel: SalesOrderEvent,
});

export class CommercialError extends Error {
  constructor(message, status = 400, code = 'COMMERCIAL_ERROR') {
    super(message);
    this.name = 'CommercialError';
    this.status = status;
    this.code = code;
  }
}

function resolveModels(overrides = {}) {
  return { ...DEFAULT_MODELS, ...overrides };
}

function requireActor(actor) {
  const value = String(actor || '').trim();
  if (!value) throw new CommercialError('An authenticated actor is required.', 401, 'ACTOR_REQUIRED');
  if (value.length > 120) throw new CommercialError('Actor identifier is too long.');
  return value;
}

function requireObjectId(value, field) {
  if (!mongoose.isValidObjectId(value)) throw new CommercialError(`${field} is invalid.`, 400, 'INVALID_ID');
  return value;
}

function plain(value) {
  if (value == null) return value;
  return typeof value.toObject === 'function' ? value.toObject({ versionKey: false }) : value;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value || {})
    .filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

function roundArea(value) {
  return Number(Number(value || 0).toFixed(AREA_PRECISION));
}

function idsEqual(left, right) {
  return String(left || '') === String(right || '');
}

function transactionUnsupported(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 20 || error?.codeName === 'IllegalOperation'
    || message.includes('transaction numbers are only allowed')
    || message.includes('does not support transactions');
}

function asCommercialError(error) {
  if (error instanceof CommercialError) return error;
  if (error?.name === 'VersionError') {
    return new CommercialError('Commercial record changed concurrently. Try again.', 409, 'COMMERCIAL_CONFLICT');
  }
  return error;
}

function requireActiveTransactionSession(session) {
  if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) {
    throw new CommercialError(
      'MongoDB transaction support is required for commercial operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }
  return session;
}

async function runRequiredTransaction({ models, connection, session, work }) {
  if (session) {
    try {
      return await work(requireActiveTransactionSession(session));
    } catch (error) {
      throw asCommercialError(error);
    }
  }
  const database = connection || models.QuotationModel?.db || models.SalesOrderModel?.db;
  if (typeof database?.startSession !== 'function') {
    throw new CommercialError('MongoDB transaction support is required for commercial operations.', 503, 'TRANSACTION_REQUIRED');
  }
  let ownedSession;
  try {
    ownedSession = await database.startSession();
  } catch {
    throw new CommercialError('Commercial transaction service is unavailable.', 503, 'TRANSACTION_UNAVAILABLE');
  }
  if (typeof ownedSession?.withTransaction !== 'function') {
    if (typeof ownedSession?.endSession === 'function') await ownedSession.endSession();
    throw new CommercialError('MongoDB transaction support is required for commercial operations.', 503, 'TRANSACTION_REQUIRED');
  }
  let result;
  try {
    await ownedSession.withTransaction(async () => { result = await work(ownedSession); });
    return result;
  } catch (error) {
    if (transactionUnsupported(error)) {
      throw new CommercialError('MongoDB transaction support is required for commercial operations.', 503, 'TRANSACTION_REQUIRED');
    }
    throw asCommercialError(error);
  } finally {
    await ownedSession.endSession();
  }
}

async function findById(Model, id, session = null) {
  let query = Model.findById(id);
  if (session && typeof query?.session === 'function') query = query.session(session);
  return query;
}

async function findOne(Model, filter, session = null) {
  let query = Model.findOne(filter);
  if (session && typeof query?.session === 'function') query = query.session(session);
  return query;
}

async function createDocument(Model, document, session) {
  const created = await Model.create([document], { session });
  return Array.isArray(created) ? created[0] : created;
}

async function saveDocument(document, session) {
  await document.save({ session });
  return document;
}

export function formatCommercialReference(prefix, date, sequence) {
  const indiaTime = new Date(new Date(date).getTime() + INDIA_OFFSET_MS);
  if (Number.isNaN(indiaTime.getTime())) throw new CommercialError('Reference date is invalid.');
  return `${prefix}-${indiaTime.getUTCFullYear()}-${String(sequence).padStart(4, '0')}`;
}

async function nextCommercialReference(prefix, now, CounterModel, session) {
  const indiaTime = new Date(new Date(now).getTime() + INDIA_OFFSET_MS);
  const year = indiaTime.getUTCFullYear();
  const counter = await CounterModel.findOneAndUpdate(
    { _id: `${prefix.toLowerCase()}_${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );
  return formatCommercialReference(prefix, now, counter.seq);
}

function customerSnapshot(customer) {
  return compact({
    customerNumber: customer.customerNumber,
    name: customer.name,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    gstin: customer.gstin,
    billingAddress: customer.billingAddress ? plain(customer.billingAddress) : undefined,
    deliveryAddress: customer.deliveryAddress ? plain(customer.deliveryAddress) : undefined,
  });
}

function sellerSnapshot() {
  // Phase 7 deliberately avoids the legacy invoice seller constant because
  // its legal/contact values remain owner-unverified. A later legal-data
  // configuration can extend this immutable snapshot explicitly.
  return { name: 'Swamy Slabs' };
}

function projectSnapshot(lead) {
  if (!lead) return undefined;
  const result = compact({
    location: lead.project?.location,
    application: lead.project?.application,
    enteredArea: lead.project?.enteredArea,
    projectAreaSqFt: lead.estimatorContext?.projectAreaSqFt,
    planningAllowancePercent: lead.estimatorContext?.planningAllowancePercent,
    requiredAreaSqFt: lead.estimatorContext?.requiredAreaSqFt,
    estimatedSlabs: lead.estimatorContext?.estimatedSlabs,
  });
  return Object.keys(result).length ? result : undefined;
}

function deriveTax(totals) {
  if (!totals.taxMinor) return { taxType: 'NONE', cgstMinor: 0, sgstMinor: 0, igstMinor: 0 };
  return { taxType: 'UNSPECIFIED', cgstMinor: 0, sgstMinor: 0, igstMinor: 0 };
}

function buildCommercialLines(inputLines) {
  const calculated = calculateQuotationTotals(inputLines);
  const lineItems = calculated.lineItems.map((item) => {
    const stoneSnapshot = resolveCatalogStoneReference({ stoneId: item.stoneId, stoneSlug: item.stoneSlug });
    if (!stoneSnapshot) throw new CommercialError('A quotation line references an unknown or mismatched catalog stone.', 400, 'STONE_NOT_FOUND');
    return compact({
      stoneSnapshot,
      description: item.description || stoneSnapshot.name,
      finish: item.finish,
      thicknessMm: item.thicknessMm,
      dimensions: item.dimensions,
      quantity: item.quantity,
      quantityMilli: item.quantityMilli,
      areaSqFt: item.unit === 'SQ_FT' ? item.quantity : (item.areaSqFt == null ? undefined : Number(item.areaSqFt)),
      unit: item.unit,
      unitRateMinor: item.unitRateMinor,
      lineSubtotalMinor: item.lineSubtotalMinor,
      discountBasisPoints: item.discountBasisPoints,
      discountMinor: item.discountMinor,
      taxableMinor: item.taxableMinor,
      taxRateBasisPoints: item.taxRateBasisPoints,
      taxMinor: item.taxMinor,
      lineTotalMinor: item.lineTotalMinor,
      processingRequirements: item.processingRequirements,
      notes: item.notes,
    });
  });
  return { lineItems, totals: calculated.totals, taxBreakdown: calculated.taxBreakdown };
}

async function loadCommercialParties(input, models, session) {
  const customer = await findById(models.CustomerModel, input.customerId, session);
  if (!customer) throw new CommercialError('Customer was not found.', 404, 'CUSTOMER_NOT_FOUND');
  let lead = null;
  if (input.sourceLeadId) {
    lead = await findById(models.LeadModel, input.sourceLeadId, session);
    if (!lead) throw new CommercialError('Source lead was not found.', 404, 'LEAD_NOT_FOUND');
    if (lead.stage !== 'READY_FOR_QUOTATION' || !idsEqual(lead.customer, customer._id)) {
      throw new CommercialError('Source lead must be ready for quotation and linked to the selected customer.', 409, 'LEAD_NOT_READY');
    }
  }
  return { customer, lead };
}

function quotationDocument({ input, number, id, rootId, revision, customer, lead, actor, now, supersedesQuotationId }) {
  const commercial = buildCommercialLines(input.lineItems);
  const buyer = customerSnapshot(customer);
  const seller = sellerSnapshot();
  const tax = deriveTax(commercial.totals);
  return {
    _id: id,
    quotationNumber: number,
    rootQuotationId: rootId,
    supersedesQuotationId: supersedesQuotationId || null,
    revision,
    customerId: customer._id,
    sourceLeadId: lead?._id || null,
    sourceLeadNumber: lead?.leadNumber,
    status: 'DRAFT',
    issueDate: input.issueDate,
    validUntil: input.validUntil,
    customerSnapshot: buyer,
    sellerSnapshot: seller,
    projectSnapshot: projectSnapshot(lead),
    lineItems: commercial.lineItems,
    currency: input.currency,
    ...commercial.totals,
    ...tax,
    taxBreakdown: commercial.taxBreakdown,
    paymentTerms: input.paymentTerms,
    deliveryTerms: input.deliveryTerms,
    notes: input.notes,
    internalNotes: input.internalNotes,
    notification: { status: 'NOT_CONFIGURED' },
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
  };
}

function quotationEvent(quotation, type, actor, now, extra = {}) {
  return compact({
    quotation: quotation._id,
    quotationNumber: quotation.quotationNumber,
    revision: quotation.revision,
    type,
    actor,
    occurredAt: now,
    ...extra,
  });
}

export async function createQuotation({ input, actor, now = new Date(), models: overrides, connection, session = null }) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const { customer, lead } = await loadCommercialParties(input, models, activeSession);
    const number = await nextCommercialReference(QUOTATION_REFERENCE_PREFIX, now, models.CounterModel, activeSession);
    const id = new mongoose.Types.ObjectId();
    const quotation = await createDocument(models.QuotationModel, quotationDocument({
      input, number, id, rootId: id, revision: 1, customer, lead, actor: authenticatedActor, now,
    }), activeSession);
    const event = await createDocument(models.QuotationEventModel,
      quotationEvent(quotation, 'QUOTATION_CREATED', authenticatedActor, now), activeSession);
    return { quotation, event };
  } });
}

export async function updateQuotation({ quotationId, input, actor, now = new Date(), models: overrides, connection, session = null }) {
  requireObjectId(quotationId, 'Quotation ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const quotation = await findById(models.QuotationModel, quotationId, activeSession);
    if (!quotation) throw new CommercialError('Quotation was not found.', 404, 'QUOTATION_NOT_FOUND');
    if (quotation.status !== 'DRAFT') throw new CommercialError('Only draft quotations can be edited.', 409, 'INVALID_QUOTATION_STATE');
    const { customer, lead } = await loadCommercialParties(input, models, activeSession);
    const rebuilt = quotationDocument({
      input,
      number: quotation.quotationNumber,
      id: quotation._id,
      rootId: quotation.rootQuotationId,
      revision: quotation.revision,
      customer,
      lead,
      actor: quotation.createdBy,
      now,
      supersedesQuotationId: quotation.supersedesQuotationId,
    });
    for (const field of [
      'customerId', 'sourceLeadId', 'sourceLeadNumber', 'issueDate', 'validUntil', 'customerSnapshot',
      'sellerSnapshot', 'projectSnapshot', 'lineItems', 'currency', 'taxType', 'subtotalMinor',
      'discountMinor', 'taxableMinor', 'taxMinor', 'cgstMinor', 'sgstMinor', 'igstMinor',
      'grandTotalMinor', 'taxBreakdown', 'paymentTerms', 'deliveryTerms', 'notes', 'internalNotes',
    ]) quotation.set(field, rebuilt[field]);
    quotation.updatedBy = authenticatedActor;
    await saveDocument(quotation, activeSession);
    const event = await createDocument(models.QuotationEventModel,
      quotationEvent(quotation, 'QUOTATION_UPDATED', authenticatedActor, now), activeSession);
    return { quotation, event };
  } });
}

function endExclusive(date) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function quotationFilter({ search = '', status = '', customerId = '', sourceLeadId = '', from, to } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  if (sourceLeadId) filter.sourceLeadId = sourceLeadId;
  if (from || to) {
    filter.issueDate = compact({ $gte: from, $lt: to ? endExclusive(to) : undefined });
  }
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { quotationNumber: expression },
      { sourceLeadNumber: expression },
      { 'customerSnapshot.name': expression },
      { 'customerSnapshot.company': expression },
      { 'customerSnapshot.phone': expression },
      { 'lineItems.stoneSnapshot.name': expression },
      { 'lineItems.stoneSnapshot.slug': expression },
    ];
  }
  return filter;
}

export async function listQuotations({ page = 1, limit = 20, ...filters } = {}, { models: overrides } = {}) {
  const models = resolveModels(overrides);
  const filter = quotationFilter(filters);
  const skip = (page - 1) * limit;
  const [quotations, total] = await Promise.all([
    models.QuotationModel.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    models.QuotationModel.countDocuments(filter),
  ]);
  return {
    quotations,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getQuotation({ quotationId, models: overrides }) {
  requireObjectId(quotationId, 'Quotation ID');
  const models = resolveModels(overrides);
  const quotation = await models.QuotationModel.findById(quotationId).lean();
  if (!quotation) throw new CommercialError('Quotation was not found.', 404, 'QUOTATION_NOT_FOUND');
  return quotation;
}

export async function listQuotationEvents({ quotationId, models: overrides }) {
  requireObjectId(quotationId, 'Quotation ID');
  const models = resolveModels(overrides);
  const exists = await models.QuotationModel.exists({ _id: quotationId });
  if (!exists) throw new CommercialError('Quotation was not found.', 404, 'QUOTATION_NOT_FOUND');
  return models.QuotationEventModel.find({ quotation: quotationId }).sort({ occurredAt: 1, _id: 1 }).lean();
}

export async function getQuotationSummary({ models: overrides } = {}) {
  const models = resolveModels(overrides);
  const groups = await models.QuotationModel.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, valueMinor: { $sum: '$grandTotalMinor' } } },
  ]);
  const byStatus = Object.fromEntries(groups.map((entry) => [entry._id, entry.count]));
  const valueByStatusMinor = Object.fromEntries(groups.map((entry) => [entry._id, entry.valueMinor]));
  return {
    byStatus,
    valueByStatusMinor,
    total: groups.reduce((sum, entry) => sum + entry.count, 0),
    draftQuotations: byStatus.DRAFT || 0,
    issuedQuotations: byStatus.ISSUED || 0,
    acceptedQuotations: byStatus.ACCEPTED || 0,
    expiredQuotations: byStatus.EXPIRED || 0,
  };
}

async function transitionQuotation({
  quotationId,
  toStatus,
  eventType,
  actor,
  note,
  reason,
  now,
  models,
  session,
  beforeSave,
}) {
  const quotation = await findById(models.QuotationModel, quotationId, session);
  if (!quotation) throw new CommercialError('Quotation was not found.', 404, 'QUOTATION_NOT_FOUND');
  const fromStatus = quotation.status;
  if (!isQuotationTransitionAllowed(fromStatus, toStatus)) {
    throw new CommercialError(`Quotation cannot move from ${fromStatus} to ${toStatus}.`, 409, 'INVALID_QUOTATION_STATE');
  }
  if (typeof beforeSave === 'function') await beforeSave(quotation);
  quotation.status = toStatus;
  quotation.updatedBy = actor;
  if (toStatus === 'ACCEPTED') quotation.acceptedAt = now;
  if (toStatus === 'REJECTED') quotation.rejectedAt = now;
  if (toStatus === 'EXPIRED') quotation.expiredAt = now;
  if (toStatus === 'CANCELLED') quotation.cancelledAt = now;
  await saveDocument(quotation, session);
  const event = await createDocument(models.QuotationEventModel, quotationEvent(
    quotation,
    eventType,
    actor,
    now,
    {
      fromStatus,
      toStatus,
      note: note || reason,
      ...(eventType === 'QUOTATION_ISSUED' ? { snapshot: plain(quotation) } : {}),
    },
  ), session);
  return { quotation, event };
}

function quotationTransitionOperation(toStatus, eventType, options = {}) {
  return async ({
    quotationId,
    actor,
    note,
    reason,
    now = new Date(),
    models: overrides,
    connection,
    session = null,
  }) => {
    requireObjectId(quotationId, 'Quotation ID');
    const authenticatedActor = requireActor(actor);
    if (options.requireReason && !String(reason || '').trim()) {
      throw new CommercialError('A reason is required.');
    }
    const models = resolveModels(overrides);
    return runRequiredTransaction({ models, connection, session, work: (activeSession) => transitionQuotation({
      quotationId,
      toStatus,
      eventType,
      actor: authenticatedActor,
      note,
      reason: String(reason || '').trim(),
      now,
      models,
      session: activeSession,
      beforeSave: options.beforeSave ? (quotation) => options.beforeSave(quotation, now) : undefined,
    }) });
  };
}

export const issueQuotation = quotationTransitionOperation('ISSUED', 'QUOTATION_ISSUED', {
  beforeSave(quotation, now) {
    if (!quotation.validUntil) throw new CommercialError('A valid-until date is required before issue.', 409, 'VALIDITY_REQUIRED');
    if (quotation.taxMinor > 0 && !['IGST', 'CGST_SGST'].includes(quotation.taxType)) {
      throw new CommercialError('Tax type cannot be determined until seller tax configuration is owner-verified.', 409, 'TAX_CONFIGURATION_REQUIRED');
    }
    quotation.issueDate = quotation.issueDate || now;
    if (endExclusive(quotation.validUntil) <= quotation.issueDate) {
      throw new CommercialError('Valid-until date cannot be before the issue date.', 409, 'INVALID_VALIDITY');
    }
  },
});

export const acceptQuotation = quotationTransitionOperation('ACCEPTED', 'QUOTATION_ACCEPTED', {
  beforeSave(quotation, now) {
    if (quotation.validUntil && endExclusive(quotation.validUntil) <= now) {
      throw new CommercialError('An expired quotation cannot be accepted.', 409, 'QUOTATION_EXPIRED');
    }
  },
});

export const rejectQuotation = quotationTransitionOperation('REJECTED', 'QUOTATION_REJECTED', { requireReason: true });
export const cancelQuotation = quotationTransitionOperation('CANCELLED', 'QUOTATION_CANCELLED', { requireReason: true });
export const expireQuotation = quotationTransitionOperation('EXPIRED', 'QUOTATION_EXPIRED', {
  beforeSave(quotation, now) {
    if (!quotation.validUntil || endExclusive(quotation.validUntil) > now) {
      throw new CommercialError('Quotation validity has not elapsed.', 409, 'QUOTATION_NOT_EXPIRED');
    }
  },
});

function revisionDocument(source, { id, number, actor, now }) {
  const original = plain(source);
  return {
    ...original,
    _id: id,
    quotationNumber: number,
    rootQuotationId: source.rootQuotationId,
    supersedesQuotationId: source._id,
    supersededByQuotationId: null,
    revision: source.revision + 1,
    status: 'DRAFT',
    acceptedAt: undefined,
    rejectedAt: undefined,
    expiredAt: undefined,
    cancelledAt: undefined,
    convertedAt: undefined,
    convertedSalesOrderId: undefined,
    createdBy: actor,
    updatedBy: actor,
    createdAt: now,
    updatedAt: now,
    __v: undefined,
  };
}

export async function reviseQuotation({
  quotationId,
  actor,
  note,
  now = new Date(),
  models: overrides,
  connection,
  session = null,
}) {
  requireObjectId(quotationId, 'Quotation ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const source = await findById(models.QuotationModel, quotationId, activeSession);
    if (!source) throw new CommercialError('Quotation was not found.', 404, 'QUOTATION_NOT_FOUND');
    if (!['ISSUED', 'REJECTED', 'EXPIRED'].includes(source.status)) {
      throw new CommercialError('Only issued, rejected, or expired quotations can be revised.', 409, 'INVALID_QUOTATION_STATE');
    }
    const number = await nextCommercialReference(QUOTATION_REFERENCE_PREFIX, now, models.CounterModel, activeSession);
    const revised = await createDocument(models.QuotationModel, revisionDocument(source, {
      id: new mongoose.Types.ObjectId(), number, actor: authenticatedActor, now,
    }), activeSession);
    const fromStatus = source.status;
    source.status = 'SUPERSEDED';
    source.supersededByQuotationId = revised._id;
    source.updatedBy = authenticatedActor;
    await saveDocument(source, activeSession);
    const oldEvent = await createDocument(models.QuotationEventModel, quotationEvent(
      source, 'QUOTATION_SUPERSEDED', authenticatedActor, now,
      { fromStatus, toStatus: 'SUPERSEDED', note, relatedQuotationId: revised._id },
    ), activeSession);
    const newEvent = await createDocument(models.QuotationEventModel, quotationEvent(
      revised, 'QUOTATION_CREATED', authenticatedActor, now,
      { note, relatedQuotationId: source._id },
    ), activeSession);
    return { quotation: revised, supersededQuotation: source, events: [oldEvent, newEvent] };
  } });
}

function salesOrderEvent(salesOrder, type, actor, now, extra = {}) {
  return compact({
    salesOrder: salesOrder._id,
    salesOrderNumber: salesOrder.salesOrderNumber,
    type,
    actor,
    occurredAt: now,
    ...extra,
  });
}

function salesOrderItems(quotation) {
  return quotation.lineItems.map((line) => {
    const value = plain(line);
    const quotationLineItemId = value._id;
    delete value._id;
    return {
      _id: new mongoose.Types.ObjectId(),
      quotationLineItemId,
      ...value,
      reservedQuantity: 0,
      reservedAreaSqFt: 0,
      activeReservationCount: 0,
    };
  });
}

function financialSnapshot(quotation) {
  return {
    currency: quotation.currency,
    taxType: quotation.taxType,
    subtotalMinor: quotation.subtotalMinor,
    discountMinor: quotation.discountMinor,
    taxableMinor: quotation.taxableMinor,
    taxMinor: quotation.taxMinor,
    cgstMinor: quotation.cgstMinor,
    sgstMinor: quotation.sgstMinor,
    igstMinor: quotation.igstMinor,
    grandTotalMinor: quotation.grandTotalMinor,
    taxBreakdown: plain(quotation.taxBreakdown),
    paymentTerms: quotation.paymentTerms,
    deliveryTerms: quotation.deliveryTerms,
    notes: quotation.notes,
  };
}

function reconcileAllocation(salesOrder) {
  let allocatedLineCount = 0;
  let partiallyAllocatedLineCount = 0;
  let orderedQuantity = 0;
  let reservedQuantity = 0;
  let orderedAreaSqFt = 0;
  let reservedAreaSqFt = 0;
  let activeReservationCount = 0;

  for (const item of salesOrder.items || []) {
    const byArea = item.unit === 'SQ_FT';
    const ordered = byArea ? Number(item.areaSqFt ?? item.quantity) : Number(item.quantity);
    const reserved = byArea ? Number(item.reservedAreaSqFt || 0) : Number(item.reservedQuantity || 0);
    if (reserved > ordered + 0.0001) {
      throw new CommercialError('Reservation exceeds the sales order line requirement.', 409, 'ORDER_OVER_ALLOCATED');
    }
    if (reserved >= ordered - 0.0001) allocatedLineCount += 1;
    else if (reserved > 0) partiallyAllocatedLineCount += 1;
    if (!byArea) {
      orderedQuantity += Number(item.quantity || 0);
      reservedQuantity += Number(item.reservedQuantity || 0);
    }
    if (item.areaSqFt != null) orderedAreaSqFt += Number(item.areaSqFt || 0);
    reservedAreaSqFt += Number(item.reservedAreaSqFt || 0);
    activeReservationCount += Number(item.activeReservationCount || 0);
  }

  const totalLineCount = salesOrder.items?.length || 0;
  salesOrder.allocationSummary = {
    orderedQuantity,
    reservedQuantity,
    orderedAreaSqFt: roundArea(orderedAreaSqFt),
    reservedAreaSqFt: roundArea(reservedAreaSqFt),
    activeReservationCount,
    totalLineCount,
    allocatedLineCount,
    partiallyAllocatedLineCount,
  };
  if (['CONFIRMED', 'PARTIALLY_ALLOCATED', 'ALLOCATED'].includes(salesOrder.status)) {
    if (totalLineCount > 0 && allocatedLineCount === totalLineCount) salesOrder.status = 'ALLOCATED';
    else if (allocatedLineCount > 0 || partiallyAllocatedLineCount > 0) salesOrder.status = 'PARTIALLY_ALLOCATED';
    else salesOrder.status = 'CONFIRMED';
  }
  return salesOrder;
}

function buildSalesOrder(quotation, { id, number, actor, now }) {
  const salesOrder = {
    _id: id,
    salesOrderNumber: number,
    quotationId: quotation._id,
    quotationNumber: quotation.quotationNumber,
    quotationRevision: quotation.revision,
    customerId: quotation.customerId,
    sourceLeadId: quotation.sourceLeadId || null,
    status: 'CONFIRMED',
    customerSnapshot: plain(quotation.customerSnapshot),
    sellerSnapshot: plain(quotation.sellerSnapshot),
    items: salesOrderItems(quotation),
    currency: quotation.currency,
    financialSnapshot: financialSnapshot(quotation),
    confirmedAt: now,
    createdBy: actor,
    updatedBy: actor,
  };
  reconcileAllocation(salesOrder);
  return salesOrder;
}

export async function convertQuotationToSalesOrder({
  quotationId,
  actor,
  now = new Date(),
  models: overrides,
  connection,
  session = null,
}) {
  requireObjectId(quotationId, 'Quotation ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  const operation = async () => runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const existing = await findOne(models.SalesOrderModel, { quotationId }, activeSession);
    if (existing) return { salesOrder: existing, duplicate: true };
    const quotation = await findById(models.QuotationModel, quotationId, activeSession);
    if (!quotation) throw new CommercialError('Quotation was not found.', 404, 'QUOTATION_NOT_FOUND');
    if (quotation.status === 'CONVERTED' && quotation.convertedSalesOrderId) {
      const converted = await findById(models.SalesOrderModel, quotation.convertedSalesOrderId, activeSession);
      if (converted) return { salesOrder: converted, duplicate: true };
    }
    if (quotation.status !== 'ACCEPTED') {
      throw new CommercialError('Only an accepted quotation can become a sales order.', 409, 'INVALID_QUOTATION_STATE');
    }
    const number = await nextCommercialReference(SALES_ORDER_REFERENCE_PREFIX, now, models.CounterModel, activeSession);
    const salesOrder = await createDocument(models.SalesOrderModel, buildSalesOrder(quotation, {
      id: new mongoose.Types.ObjectId(), number, actor: authenticatedActor, now,
    }), activeSession);
    const fromStatus = quotation.status;
    quotation.status = 'CONVERTED';
    quotation.convertedAt = now;
    quotation.convertedSalesOrderId = salesOrder._id;
    quotation.updatedBy = authenticatedActor;
    await saveDocument(quotation, activeSession);
    const orderEvent = await createDocument(models.SalesOrderEventModel,
      salesOrderEvent(salesOrder, 'SALES_ORDER_CREATED', authenticatedActor, now), activeSession);
    const quotationAuditEvent = await createDocument(models.QuotationEventModel, quotationEvent(
      quotation,
      'QUOTATION_CONVERTED',
      authenticatedActor,
      now,
      { fromStatus, toStatus: 'CONVERTED', relatedSalesOrderId: salesOrder._id },
    ), activeSession);
    return { salesOrder, quotation, events: [orderEvent, quotationAuditEvent], duplicate: false };
  } });
  try {
    return await operation();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await models.SalesOrderModel.findOne({ quotationId });
    if (!existing) throw error;
    return { salesOrder: existing, duplicate: true };
  }
}

function salesOrderFilter({ search = '', status = '', customerId = '', sourceLeadId = '', from, to } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  if (sourceLeadId) filter.sourceLeadId = sourceLeadId;
  if (from || to) filter.confirmedAt = compact({ $gte: from, $lt: to ? endExclusive(to) : undefined });
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { salesOrderNumber: expression },
      { quotationNumber: expression },
      { 'customerSnapshot.name': expression },
      { 'customerSnapshot.company': expression },
      { 'customerSnapshot.phone': expression },
      { 'items.stoneSnapshot.name': expression },
      { 'items.stoneSnapshot.slug': expression },
    ];
  }
  return filter;
}

export async function listSalesOrders({ page = 1, limit = 20, ...filters } = {}, { models: overrides } = {}) {
  const models = resolveModels(overrides);
  const filter = salesOrderFilter(filters);
  const [salesOrders, total] = await Promise.all([
    models.SalesOrderModel.find(filter).sort({ updatedAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    models.SalesOrderModel.countDocuments(filter),
  ]);
  return {
    salesOrders,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function getSalesOrder({ salesOrderId, models: overrides }) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const models = resolveModels(overrides);
  const salesOrder = await models.SalesOrderModel.findById(salesOrderId).lean();
  if (!salesOrder) throw new CommercialError('Sales order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
  return salesOrder;
}

export async function listSalesOrderEvents({ salesOrderId, models: overrides }) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const models = resolveModels(overrides);
  const exists = await models.SalesOrderModel.exists({ _id: salesOrderId });
  if (!exists) throw new CommercialError('Sales order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
  return models.SalesOrderEventModel.find({ salesOrder: salesOrderId }).sort({ occurredAt: 1, _id: 1 }).lean();
}

export async function getSalesOrderSummary({ models: overrides } = {}) {
  const models = resolveModels(overrides);
  const groups = await models.SalesOrderModel.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(groups.map((entry) => [entry._id, entry.count]));
  return {
    byStatus,
    total: groups.reduce((sum, entry) => sum + entry.count, 0),
    confirmedOrders: byStatus.CONFIRMED || 0,
    awaitingAllocation: (byStatus.CONFIRMED || 0) + (byStatus.PARTIALLY_ALLOCATED || 0),
    allocatedOrders: byStatus.ALLOCATED || 0,
    inProductionOrders: byStatus.IN_PRODUCTION || 0,
  };
}

export async function updateSalesOrder({
  salesOrderId,
  updates,
  actor,
  now = new Date(),
  models: overrides,
  connection,
  session = null,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const salesOrder = await findById(models.SalesOrderModel, salesOrderId, activeSession);
    if (!salesOrder) throw new CommercialError('Sales order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
    if (salesOrder.status === 'CANCELLED') throw new CommercialError('A cancelled sales order cannot be edited.', 409, 'INVALID_SALES_ORDER_STATE');
    salesOrder.requestedDeliveryDate = updates.requestedDeliveryDate;
    salesOrder.updatedBy = authenticatedActor;
    await saveDocument(salesOrder, activeSession);
    const event = await createDocument(models.SalesOrderEventModel,
      salesOrderEvent(salesOrder, 'SALES_ORDER_UPDATED', authenticatedActor, now), activeSession);
    return { salesOrder, event };
  } });
}

function requireSalesOrderLine(salesOrder, lineItemId) {
  const line = typeof salesOrder.items?.id === 'function'
    ? salesOrder.items.id(lineItemId)
    : salesOrder.items?.find((item) => idsEqual(item._id, lineItemId));
  if (!line) throw new CommercialError('Sales order line was not found.', 404, 'SALES_ORDER_LINE_NOT_FOUND');
  return line;
}

async function applyReservationDelta({ reservation, delta, actor, now, session, release, models: overrides }) {
  requireActiveTransactionSession(session);
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  const salesOrder = await findById(models.SalesOrderModel, reservation?.salesOrderId, session);
  if (!salesOrder) throw new CommercialError('Sales order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
  if (salesOrder.status === 'CANCELLED' && !release) {
    throw new CommercialError('Cancelled sales orders cannot receive reservations.', 409, 'INVALID_SALES_ORDER_STATE');
  }
  const line = requireSalesOrderLine(salesOrder, reservation?.salesOrderLineItemId);
  const quantityDelta = Number(delta?.quantity || 0);
  const areaDeltaSqFt = roundArea(delta?.areaSqFt || 0);
  if (!Number.isFinite(quantityDelta) || !Number.isFinite(areaDeltaSqFt)) {
    throw new CommercialError('Reservation delta is invalid.', 400, 'INVALID_RESERVATION_DELTA');
  }
  if ((!release && (quantityDelta < 0 || areaDeltaSqFt < 0))
    || (release && (quantityDelta > 0 || areaDeltaSqFt > 0))) {
    throw new CommercialError('Reservation delta direction is invalid.', 400, 'INVALID_RESERVATION_DELTA');
  }
  if (line.unit === 'SQ_FT' && Math.abs(areaDeltaSqFt) < 0.0001) {
    throw new CommercialError('Square-foot order lines must be reserved by area.', 400, 'RESERVATION_BASIS_MISMATCH');
  }
  if (['PIECE', 'SLAB'].includes(line.unit)
    && (Math.abs(quantityDelta) < 1 || !Number.isInteger(quantityDelta))) {
    throw new CommercialError('Piece and slab order lines must be reserved by whole quantity.', 400, 'RESERVATION_BASIS_MISMATCH');
  }
  if ((line.stoneSnapshot?.stoneId && reservation.inventorySnapshot?.stoneRef?.stoneId
      && String(line.stoneSnapshot.stoneId) !== String(reservation.inventorySnapshot.stoneRef.stoneId))
    || (line.stoneSnapshot?.slug && reservation.inventorySnapshot?.stoneRef?.slug
      && String(line.stoneSnapshot.slug) !== String(reservation.inventorySnapshot.stoneRef.slug))) {
    throw new CommercialError('Reservation stone does not match the sales order line.', 409, 'STONE_MISMATCH');
  }
  const fromStatus = salesOrder.status;
  line.reservedQuantity = Number(line.reservedQuantity || 0) + quantityDelta;
  line.reservedAreaSqFt = roundArea(Number(line.reservedAreaSqFt || 0) + areaDeltaSqFt);
  line.activeReservationCount = Number(line.activeReservationCount || 0) + (release ? -1 : 1);
  if (line.reservedQuantity < -0.0001 || line.reservedAreaSqFt < -0.0001 || line.activeReservationCount < 0) {
    throw new CommercialError('Reservation release exceeds the allocated order balance.', 409, 'RESERVATION_INTEGRITY_ERROR');
  }
  if (Math.abs(line.reservedQuantity) < 0.0001) line.reservedQuantity = 0;
  if (Math.abs(line.reservedAreaSqFt) < 0.0001) line.reservedAreaSqFt = 0;
  salesOrder.updatedBy = authenticatedActor;
  reconcileAllocation(salesOrder);
  await saveDocument(salesOrder, session);
  const event = await createDocument(models.SalesOrderEventModel, salesOrderEvent(
    salesOrder,
    release ? 'RESERVATION_RELEASED' : 'RESERVATION_CREATED',
    authenticatedActor,
    now,
    {
      fromStatus,
      toStatus: salesOrder.status,
      lineItemId: line._id,
      reservationId: reservation._id,
      quantityDelta,
      areaDeltaSqFt,
      note: `${release ? 'Released' : 'Created'} reservation ${reservation.reservationNumber || ''}`.trim(),
    },
  ), session);
  return { salesOrder, event };
}

export function applySalesOrderAllocation(input) {
  return applyReservationDelta({ ...input, release: false });
}

export function applySalesOrderRelease(input) {
  return applyReservationDelta({ ...input, release: true });
}

export async function cancelSalesOrder({
  salesOrderId,
  reason,
  actor,
  now = new Date(),
  models: overrides,
  reservationModels,
  connection,
  session = null,
  releaseReservations = releaseSalesOrderReservations,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const authenticatedActor = requireActor(actor);
  const normalizedReason = String(reason || '').trim();
  if (!normalizedReason) throw new CommercialError('A cancellation reason is required.');
  const models = resolveModels(overrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const current = await findById(models.SalesOrderModel, salesOrderId, activeSession);
    if (!current) throw new CommercialError('Sales order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
    if (current.status === 'CANCELLED') return { salesOrder: current, releasedReservations: [], duplicate: true };
    if (current.processingLinks?.length) {
      throw new CommercialError('Unlink processing jobs before cancelling this sales order.', 409, 'PROCESSING_LINKS_ACTIVE');
    }
    const releasedReservations = await releaseReservations({
      salesOrderId,
      reason: normalizedReason,
      actor: authenticatedActor,
      now,
      models: reservationModels,
      session: activeSession,
      applySalesOrderRelease: (input) => applySalesOrderRelease({ ...input, models: overrides }),
    });
    const salesOrder = await findById(models.SalesOrderModel, salesOrderId, activeSession);
    const fromStatus = salesOrder.status;
    salesOrder.status = 'CANCELLED';
    salesOrder.cancelledAt = now;
    salesOrder.cancellationReason = normalizedReason;
    salesOrder.updatedBy = authenticatedActor;
    await saveDocument(salesOrder, activeSession);
    const event = await createDocument(models.SalesOrderEventModel, salesOrderEvent(
      salesOrder, 'SALES_ORDER_CANCELLED', authenticatedActor, now,
      { fromStatus, toStatus: 'CANCELLED', note: normalizedReason },
    ), activeSession);
    return { salesOrder, event, releasedReservations, duplicate: false };
  } });
}

function assertProcessingStone(line, job) {
  if (String(line.stoneSnapshot?.stoneId || '') !== String(job.stoneSnapshot?.stoneId || '')
    || String(line.stoneSnapshot?.slug || '') !== String(job.stoneSnapshot?.slug || '')) {
    throw new CommercialError('Processing job stone does not match the sales order line.', 409, 'STONE_MISMATCH');
  }
}

export async function linkSalesOrderProcessingJob({
  salesOrderId,
  lineItemId,
  processingJobId,
  actor,
  now = new Date(),
  models: overrides,
  connection,
  session = null,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  requireObjectId(lineItemId, 'Sales order line ID');
  requireObjectId(processingJobId, 'Processing job ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const salesOrder = await findById(models.SalesOrderModel, salesOrderId, activeSession);
    if (!salesOrder) throw new CommercialError('Sales order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
    if (salesOrder.status === 'CANCELLED') throw new CommercialError('Cancelled sales orders cannot link processing jobs.', 409, 'INVALID_SALES_ORDER_STATE');
    const line = requireSalesOrderLine(salesOrder, lineItemId);
    if (!line.processingRequirements?.length) {
      throw new CommercialError('This sales order line has no verified processing requirement.', 409, 'PROCESSING_NOT_REQUIRED');
    }
    const job = await findById(models.ProcessingJobModel, processingJobId, activeSession);
    if (!job) throw new CommercialError('Processing job was not found.', 404, 'PROCESSING_JOB_NOT_FOUND');
    if (!['DRAFT', 'PLANNED'].includes(job.status)) {
      throw new CommercialError('Only draft or planned processing jobs can be linked.', 409, 'INVALID_PROCESSING_STATE');
    }
    assertProcessingStone(line, job);
    const plannedOperations = new Set((job.routing || []).map((entry) => entry.operation));
    const requiredOperations = (line.processingRequirements || []).map((entry) => entry.operation);
    if (!requiredOperations.every((operation) => plannedOperations.has(operation))) {
      throw new CommercialError('Processing job routing does not cover every sales order requirement.', 409, 'PROCESSING_ROUTING_MISMATCH');
    }
    const alreadyLinked = job.sourceSalesOrder
      && idsEqual(job.sourceSalesOrder.salesOrderId, salesOrder._id)
      && idsEqual(job.sourceSalesOrder.salesOrderLineItemId, line._id);
    if (job.sourceSalesOrder && !alreadyLinked) {
      throw new CommercialError('Processing job is linked to another sales order line.', 409, 'PROCESSING_LINK_CONFLICT');
    }
    const existingOrderLink = salesOrder.processingLinks?.find((link) => idsEqual(link.processingJobId, job._id));
    if (alreadyLinked && existingOrderLink) return { salesOrder, processingJob: job, duplicate: true };
    job.sourceSalesOrder = {
      salesOrderId: salesOrder._id,
      salesOrderLineItemId: line._id,
      salesOrderNumber: salesOrder.salesOrderNumber,
    };
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    if (!existingOrderLink) salesOrder.processingLinks.push({ lineItemId: line._id, processingJobId: job._id, linkedAt: now });
    salesOrder.updatedBy = authenticatedActor;
    await saveDocument(salesOrder, activeSession);
    const event = await createDocument(models.SalesOrderEventModel, salesOrderEvent(
      salesOrder, 'PROCESSING_JOB_LINKED', authenticatedActor, now,
      { lineItemId: line._id, processingJobId: job._id },
    ), activeSession);
    return { salesOrder, processingJob: job, event, duplicate: false };
  } });
}

export async function unlinkSalesOrderProcessingJob({
  salesOrderId,
  processingJobId,
  actor,
  now = new Date(),
  models: overrides,
  connection,
  session = null,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  requireObjectId(processingJobId, 'Processing job ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const salesOrder = await findById(models.SalesOrderModel, salesOrderId, activeSession);
    if (!salesOrder) throw new CommercialError('Sales order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
    const link = salesOrder.processingLinks?.find((entry) => idsEqual(entry.processingJobId, processingJobId));
    if (!link) throw new CommercialError('Processing link was not found.', 404, 'PROCESSING_LINK_NOT_FOUND');
    const job = await findById(models.ProcessingJobModel, processingJobId, activeSession);
    if (!job) throw new CommercialError('Processing job was not found.', 404, 'PROCESSING_JOB_NOT_FOUND');
    if (!['DRAFT', 'PLANNED'].includes(job.status)) {
      throw new CommercialError('Only draft or planned processing jobs can be unlinked.', 409, 'INVALID_PROCESSING_STATE');
    }
    if (!job.sourceSalesOrder
      || !idsEqual(job.sourceSalesOrder.salesOrderId, salesOrder._id)
      || !idsEqual(job.sourceSalesOrder.salesOrderLineItemId, link.lineItemId)) {
      throw new CommercialError('Processing link records are inconsistent.', 409, 'PROCESSING_LINK_CONFLICT');
    }
    job.sourceSalesOrder = undefined;
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    if (typeof salesOrder.processingLinks.pull === 'function') salesOrder.processingLinks.pull(link._id);
    else salesOrder.processingLinks = salesOrder.processingLinks.filter((entry) => !idsEqual(entry.processingJobId, processingJobId));
    salesOrder.updatedBy = authenticatedActor;
    await saveDocument(salesOrder, activeSession);
    const event = await createDocument(models.SalesOrderEventModel, salesOrderEvent(
      salesOrder, 'PROCESSING_JOB_UNLINKED', authenticatedActor, now,
      { lineItemId: link.lineItemId, processingJobId: job._id },
    ), activeSession);
    return { salesOrder, processingJob: job, event };
  } });
}
