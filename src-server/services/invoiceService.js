import mongoose from 'mongoose';
import { INVOICE_RECORD_VERSION } from '../constants/billing.js';
import Counter from '../models/Counter.js';
import Invoice from '../models/Invoice.js';
import InvoiceEvent from '../models/InvoiceEvent.js';
import SalesOrder from '../models/SalesOrder.js';
import SellerTaxProfile from '../models/SellerTaxProfile.js';
import { amountInWords } from '../utils/invoiceHelpers.js';
import { escapeRegex } from '../utils/security.js';

const BASIS_POINTS = 10_000n;
const INDIA_OFFSET_MS = 330 * 60 * 1000;
const PROFILE_KEY = 'default';
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

const DEFAULT_MODELS = Object.freeze({
  CounterModel: Counter,
  InvoiceModel: Invoice,
  InvoiceEventModel: InvoiceEvent,
  SalesOrderModel: SalesOrder,
  SellerTaxProfileModel: SellerTaxProfile,
});

export class BillingError extends Error {
  constructor(message, status = 400, code = 'BILLING_ERROR') {
    super(message);
    this.name = 'BillingError';
    this.status = status;
    this.code = code;
  }
}

function resolveModels(overrides = {}) {
  return { ...DEFAULT_MODELS, ...overrides };
}

function requireActor(actor) {
  const value = String(actor || '').trim();
  if (!value) throw new BillingError('An authenticated actor is required.', 401, 'ACTOR_REQUIRED');
  if (value.length > 120) throw new BillingError('Actor identifier is too long.');
  return value;
}

function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw new BillingError(label + ' is invalid.', 400, 'INVALID_ID');
  return value;
}

function plain(value) {
  if (value == null) return value;
  return typeof value.toObject === 'function'
    ? value.toObject({ versionKey: false })
    : structuredClone(value);
}

function transactionUnsupported(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 20
    || error?.codeName === 'IllegalOperation'
    || message.includes('transaction numbers are only allowed')
    || message.includes('does not support transactions');
}

function asBillingError(error) {
  if (error instanceof BillingError) return error;
  if (error?.name === 'VersionError') {
    return new BillingError('Invoice changed concurrently. Try again.', 409, 'BILLING_CONFLICT');
  }
  return error;
}

function requireTransactionSession(session) {
  if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) {
    throw new BillingError(
      'MongoDB transaction support is required for billing operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }
  return session;
}

async function runRequiredTransaction({ models, connection, session, work }) {
  if (session) {
    try {
      return await work(requireTransactionSession(session));
    } catch (error) {
      throw asBillingError(error);
    }
  }
  const database = connection || models.InvoiceModel?.db || models.SalesOrderModel?.db;
  if (typeof database?.startSession !== 'function') {
    throw new BillingError(
      'MongoDB transaction support is required for billing operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }
  let ownedSession;
  try {
    ownedSession = await database.startSession();
  } catch {
    throw new BillingError('Billing transaction service is unavailable.', 503, 'TRANSACTION_UNAVAILABLE');
  }
  if (typeof ownedSession?.withTransaction !== 'function') {
    if (typeof ownedSession?.endSession === 'function') await ownedSession.endSession();
    throw new BillingError(
      'MongoDB transaction support is required for billing operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }
  let result;
  try {
    await ownedSession.withTransaction(async () => {
      result = await work(ownedSession);
    });
    return result;
  } catch (error) {
    if (transactionUnsupported(error)) {
      throw new BillingError(
        'MongoDB transaction support is required for billing operations.',
        503,
        'TRANSACTION_REQUIRED',
      );
    }
    throw asBillingError(error);
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

function roundDivide(numerator, denominator) {
  return (numerator + (denominator / 2n)) / denominator;
}

function safeInteger(value, label, { positive = false } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < (positive ? 1 : 0)) {
    throw new BillingError(label + ' is invalid.', 409, 'SOURCE_FINANCIAL_MISMATCH');
  }
  return number;
}

function safeAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new BillingError(label + ' is too large.', 409, 'SOURCE_FINANCIAL_MISMATCH');
  }
  return value;
}

/**
 * Recomputes every line from the immutable Sales Order minor-unit inputs.
 * Saved line totals are treated as integrity assertions, never as client input.
 */
export function calculateInvoiceTotalsFromOrderLines(orderLines) {
  if (!Array.isArray(orderLines) || orderLines.length === 0) {
    throw new BillingError('Sales Order has no invoiceable lines.', 409, 'NO_INVOICEABLE_LINES');
  }

  const items = [];
  const totals = {
    subtotalMinor: 0,
    discountMinor: 0,
    taxableMinor: 0,
    taxMinor: 0,
    grandTotalMinor: 0,
  };
  const taxBreakdown = new Map();

  for (const source of orderLines) {
    const quantityMilli = safeInteger(source.quantityMilli, 'Order line quantity', { positive: true });
    const unitRateMinor = safeInteger(source.unitRateMinor, 'Order line rate');
    const discountBasisPoints = safeInteger(source.discountBasisPoints ?? 0, 'Order line discount');
    const taxRateBasisPoints = safeInteger(source.taxRateBasisPoints ?? 0, 'Order line tax rate');
    if (discountBasisPoints > 10000 || taxRateBasisPoints > 10000) {
      throw new BillingError('Order line percentage is invalid.', 409, 'SOURCE_FINANCIAL_MISMATCH');
    }

    const subtotal = roundDivide(BigInt(quantityMilli) * BigInt(unitRateMinor), 1000n);
    const discount = roundDivide(subtotal * BigInt(discountBasisPoints), BASIS_POINTS);
    const taxable = subtotal - discount;
    const tax = roundDivide(taxable * BigInt(taxRateBasisPoints), BASIS_POINTS);
    const total = taxable + tax;
    const computed = {
      lineSubtotalMinor: Number(subtotal),
      discountMinor: Number(discount),
      taxableMinor: Number(taxable),
      taxMinor: Number(tax),
      lineTotalMinor: Number(total),
    };
    for (const [field, expected] of Object.entries(computed)) {
      if (!Number.isSafeInteger(expected) || Number(source[field]) !== expected) {
        throw new BillingError(
          'Sales Order financial snapshot does not reconcile.',
          409,
          'SOURCE_FINANCIAL_MISMATCH',
        );
      }
    }

    totals.subtotalMinor = safeAdd(totals.subtotalMinor, computed.lineSubtotalMinor, 'Invoice subtotal');
    totals.discountMinor = safeAdd(totals.discountMinor, computed.discountMinor, 'Invoice discount');
    totals.taxableMinor = safeAdd(totals.taxableMinor, computed.taxableMinor, 'Invoice taxable value');
    totals.taxMinor = safeAdd(totals.taxMinor, computed.taxMinor, 'Invoice tax');
    totals.grandTotalMinor = safeAdd(totals.grandTotalMinor, computed.lineTotalMinor, 'Invoice total');

    const breakdown = taxBreakdown.get(taxRateBasisPoints) || { taxableMinor: 0, taxMinor: 0 };
    breakdown.taxableMinor = safeAdd(breakdown.taxableMinor, computed.taxableMinor, 'Taxable breakdown');
    breakdown.taxMinor = safeAdd(breakdown.taxMinor, computed.taxMinor, 'Tax breakdown');
    taxBreakdown.set(taxRateBasisPoints, breakdown);

    items.push({
      sourceSalesOrderLineItemId: source._id,
      stoneSnapshot: plain(source.stoneSnapshot),
      description: source.description,
      finish: source.finish,
      thicknessMm: source.thicknessMm,
      dimensions: plain(source.dimensions),
      quantity: quantityMilli / 1000,
      quantityMilli,
      areaSqFt: source.areaSqFt,
      unit: source.unit,
      unitRateMinor,
      discountBasisPoints,
      taxRateBasisPoints,
      ...computed,
    });
  }

  return {
    items,
    totals,
    taxBreakdown: [...taxBreakdown.entries()]
      .sort(([left], [right]) => left - right)
      .map(([taxRateBasisPoints, amounts]) => ({ taxRateBasisPoints, ...amounts })),
  };
}

function ensureOrderSnapshotMatches(order, totals) {
  const snapshot = order.financialSnapshot || {};
  for (const field of ['subtotalMinor', 'discountMinor', 'taxableMinor', 'taxMinor', 'grandTotalMinor']) {
    if (Number(snapshot[field]) !== totals[field]) {
      throw new BillingError(
        'Sales Order financial snapshot does not reconcile.',
        409,
        'SOURCE_FINANCIAL_MISMATCH',
      );
    }
  }
  if (order.currency !== 'INR' || snapshot.currency !== 'INR') {
    throw new BillingError('Only INR Sales Orders are supported in Phase 8.', 409, 'CURRENCY_UNSUPPORTED');
  }
}

function formatAddress(address = {}) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].filter(Boolean).join(', ');
}

function legacyParty(customer, address, stateCode) {
  return {
    name: customer.company || customer.name,
    address: formatAddress(address),
    state: address?.state || '',
    stateCode: stateCode || address?.stateCode || '',
    gstin: customer.gstin || '',
  };
}

function legacyItems(items) {
  return items.map((item) => ({
    hsnCode: item.hsnCode || '',
    description: item.description,
    qty: item.quantity,
    unit: item.unit,
    rate: item.unitRateMinor / 100,
    amount: item.lineSubtotalMinor / 100,
  }));
}

function paymentSummary(grandTotalMinor) {
  return {
    confirmedMinor: 0,
    outstandingMinor: grandTotalMinor,
    status: 'UNPAID',
  };
}

function eventFor(invoice, type, actor, now, extra = {}) {
  return {
    invoice: invoice._id,
    invoiceNumber: invoice.invoiceNumber,
    type,
    actor,
    occurredAt: now,
    ...extra,
  };
}

function applyDraftFields(invoice, updates) {
  if (Object.hasOwn(updates, 'dueDate')) invoice.dueDate = updates.dueDate;
  if (Object.hasOwn(updates, 'placeOfSupplyStateCode')) {
    invoice.placeOfSupplyStateCode = updates.placeOfSupplyStateCode;
  }
  if (Object.hasOwn(updates, 'billingAddress')) invoice.billingAddressSnapshot = updates.billingAddress;
  if (Object.hasOwn(updates, 'shippingAddress')) invoice.shippingAddressSnapshot = updates.shippingAddress;
  if (Object.hasOwn(updates, 'notes')) invoice.notes = updates.notes;
  if (Object.hasOwn(updates, 'terms')) invoice.terms = updates.terms;

  const customer = invoice.customerIdentitySnapshot || {};
  invoice.buyer = legacyParty(customer, invoice.billingAddressSnapshot, invoice.placeOfSupplyStateCode);
  invoice.consignee = legacyParty(
    customer,
    invoice.shippingAddressSnapshot || invoice.billingAddressSnapshot,
    invoice.shippingAddressSnapshot?.stateCode || invoice.placeOfSupplyStateCode,
  );
}

export async function createInvoiceDraft({
  salesOrderId,
  requestKey,
  draft = {},
  actor,
  now = new Date(),
  models: overrides,
  connection,
  session = null,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);

  const operation = async () => runRequiredTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      const byRequest = await findOne(
        models.InvoiceModel,
        { recordVersion: INVOICE_RECORD_VERSION, draftRequestKey: requestKey },
        activeSession,
      );
      if (byRequest) {
        if (String(byRequest.salesOrderId) !== String(salesOrderId)) {
          throw new BillingError('Request key is already used.', 409, 'IDEMPOTENCY_CONFLICT');
        }
        return { invoice: byRequest, event: null, duplicate: true };
      }
      const existing = await findOne(
        models.InvoiceModel,
        { recordVersion: INVOICE_RECORD_VERSION, salesOrderId },
        activeSession,
      );
      if (existing) return { invoice: existing, event: null, duplicate: true };

      const order = await findById(models.SalesOrderModel, salesOrderId, activeSession);
      if (!order) throw new BillingError('Sales Order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
      if (order.status === 'CANCELLED') {
        throw new BillingError('A cancelled Sales Order cannot be invoiced.', 409, 'INVALID_SALES_ORDER_STATE');
      }

      const calculation = calculateInvoiceTotalsFromOrderLines(order.items);
      ensureOrderSnapshotMatches(order, calculation.totals);
      const customer = plain(order.customerSnapshot);
      const billingAddress = plain(draft.billingAddress || customer.billingAddress);
      const shippingAddress = plain(draft.shippingAddress || customer.deliveryAddress || billingAddress);
      const invoiceId = new mongoose.Types.ObjectId();
      const draftReference = 'DRAFT-' + invoiceId.toString().toUpperCase();
      const uniformRates = [...new Set(calculation.items.map((item) => item.taxRateBasisPoints))];
      const invoice = await createDocument(models.InvoiceModel, {
        _id: invoiceId,
        invoiceNumber: draftReference,
        invoiceDate: now,
        recordVersion: INVOICE_RECORD_VERSION,
        draftReference,
        draftRequestKey: requestKey,
        salesOrderId: order._id,
        quotationId: order.quotationId,
        customerId: order.customerId,
        salesOrderNumber: order.salesOrderNumber,
        quotationNumber: order.quotationNumber,
        documentStatus: 'DRAFT',
        currency: order.currency,
        dueDate: draft.dueDate,
        placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
        customerIdentitySnapshot: customer,
        billingAddressSnapshot: billingAddress,
        shippingAddressSnapshot: shippingAddress,
        itemsV2: calculation.items,
        ...calculation.totals,
        cgstMinor: 0,
        sgstMinor: 0,
        igstMinor: 0,
        taxBreakdownV2: calculation.taxBreakdown.map((entry) => ({
          ...entry,
          cgstMinor: 0,
          sgstMinor: 0,
          igstMinor: 0,
        })),
        paymentSummary: paymentSummary(calculation.totals.grandTotalMinor),
        taxType: calculation.totals.taxMinor > 0 ? undefined : 'NONE',
        taxRate: uniformRates.length === 1 ? uniformRates[0] / 100 : 0,
        taxableValue: calculation.totals.taxableMinor / 100,
        taxAmount: calculation.totals.taxMinor / 100,
        grandTotal: calculation.totals.grandTotalMinor / 100,
        amountInWords: amountInWords(calculation.totals.grandTotalMinor / 100),
        lineItems: legacyItems(calculation.items),
        notes: draft.notes || order.financialSnapshot?.notes || '',
        terms: draft.terms || order.financialSnapshot?.paymentTerms || '',
        createdBy: authenticatedActor,
        updatedBy: authenticatedActor,
      }, activeSession);
      applyDraftFields(invoice, {});
      await invoice.save({ session: activeSession });
      const event = await createDocument(
        models.InvoiceEventModel,
        eventFor(invoice, 'INVOICE_DRAFT_CREATED', authenticatedActor, now, {
          toStatus: 'DRAFT',
          snapshot: {
            salesOrderId: order._id,
            salesOrderNumber: order.salesOrderNumber,
            grandTotalMinor: invoice.grandTotalMinor,
            currency: invoice.currency,
          },
        }),
        activeSession,
      );
      return { invoice, event, duplicate: false };
    },
  });

  try {
    return await operation();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await models.InvoiceModel.findOne({
      recordVersion: INVOICE_RECORD_VERSION,
      $or: [{ salesOrderId }, { draftRequestKey: requestKey }],
    });
    if (!existing) throw error;
    if (String(existing.salesOrderId) !== String(salesOrderId)) {
      throw new BillingError('Request key is already used.', 409, 'IDEMPOTENCY_CONFLICT');
    }
    return { invoice: existing, event: null, duplicate: true };
  }
}

export async function updateInvoiceDraft({
  invoiceId,
  updates,
  actor,
  now = new Date(),
  models: overrides,
  connection,
  session = null,
}) {
  requireObjectId(invoiceId, 'Invoice ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);
  return runRequiredTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      const invoice = await findById(models.InvoiceModel, invoiceId, activeSession);
      if (!invoice) throw new BillingError('Invoice was not found.', 404, 'INVOICE_NOT_FOUND');
      if (invoice.recordVersion !== INVOICE_RECORD_VERSION) {
        throw new BillingError('Historical invoices cannot be edited by the Phase 8 workflow.', 409, 'LEGACY_INVOICE_READ_ONLY');
      }
      if (invoice.documentStatus !== 'DRAFT') {
        throw new BillingError('Only draft invoices can be edited.', 409, 'INVOICE_IMMUTABLE');
      }
      applyDraftFields(invoice, updates);
      invoice.updatedBy = authenticatedActor;
      await invoice.save({ session: activeSession });
      const event = await createDocument(
        models.InvoiceEventModel,
        eventFor(invoice, 'INVOICE_DRAFT_UPDATED', authenticatedActor, now, {
          fromStatus: 'DRAFT',
          toStatus: 'DRAFT',
          snapshot: { changedFields: Object.keys(updates).sort() },
        }),
        activeSession,
      );
      return { invoice, event };
    },
  });
}
