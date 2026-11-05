import mongoose from 'mongoose';
import { INVOICE_RECORD_VERSION } from '../constants/billing.js';
import Counter from '../models/Counter.js';
import Invoice from '../models/Invoice.js';
import InvoiceEvent from '../models/InvoiceEvent.js';
import Payment from '../models/Payment.js';
import SalesOrder from '../models/SalesOrder.js';
import SellerTaxProfile from '../models/SellerTaxProfile.js';
import { amountInWords } from '../utils/invoiceHelpers.js';
import { escapeRegex } from '../utils/security.js';
import { formatInventoryReference } from './inventoryService.js';

const BASIS_POINTS = 10_000n;
const INDIA_OFFSET_MS = 330 * 60 * 1000;
const PROFILE_KEY = 'default';

const DEFAULT_MODELS = Object.freeze({
  CounterModel: Counter,
  InvoiceModel: Invoice,
  InvoiceEventModel: InvoiceEvent,
  PaymentModel: Payment,
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
  if (!mongoose.isValidObjectId(value)) throw new BillingError(`${label} is invalid.`, 400, 'INVALID_ID');
  return value;
}

function plain(value) {
  if (value == null) return value;
  if (typeof value.toObject === 'function') {
    return value.toObject({ versionKey: false });
  }
  try {
    return structuredClone(value);
  } catch {
    const copy = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v !== 'function') copy[k] = v;
    }
    return copy;
  }
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
    throw new BillingError(`${label} is invalid.`, 409, 'SOURCE_FINANCIAL_MISMATCH');
  }
  return number;
}

function safeAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    throw new BillingError(`${label} is too large.`, 409, 'SOURCE_FINANCIAL_MISMATCH');
  }
  return value;
}

export async function nextBillingReference(prefix = 'INV', date = new Date(), CounterModel = Counter, session = null) {
  const normalizedPrefix = String(prefix || 'INV').trim().toUpperCase();
  const indiaTime = new Date(new Date(date).getTime() + INDIA_OFFSET_MS);
  if (Number.isNaN(indiaTime.getTime())) throw new BillingError('Reference date is invalid.');
  const year = indiaTime.getUTCFullYear();
  const options = { new: true, upsert: true };
  if (session) options.session = session;

  const counter = await CounterModel.findOneAndUpdate(
    { _id: `${normalizedPrefix.toLowerCase()}_${year}` },
    { $inc: { seq: 1 } },
    options,
  );
  return formatInventoryReference(normalizedPrefix, date, counter.seq);
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
      const draftReference = `DRAFT-${invoiceId.toString().toUpperCase()}`;
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
        placeOfSupplyStateCode: draft.placeOfSupplyStateCode || billingAddress?.stateCode,
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

export async function issueInvoice({
  invoiceId,
  issueDate,
  requestKey,
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
        throw new BillingError('Historical invoices cannot be issued.', 409, 'LEGACY_INVOICE_UNSUPPORTED');
      }
      if (invoice.documentStatus === 'ISSUED') {
        if (requestKey && invoice.issueRequestKey === requestKey) {
          return { invoice, duplicate: true };
        }
        throw new BillingError('Invoice is already issued.', 409, 'INVOICE_ALREADY_ISSUED');
      }
      if (invoice.documentStatus !== 'DRAFT') {
        throw new BillingError('Only draft invoices can be issued.', 409, 'INVALID_INVOICE_STATE');
      }

      // Check seller tax profile verification (GST / Legal safety)
      const profile = await findOne(models.SellerTaxProfileModel, { profileKey: PROFILE_KEY }, activeSession);
      if (!profile || !profile.verification?.identityVerified) {
        throw new BillingError(
          'Seller identity profile is not verified. Please verify legal name, address, GSTIN and registration state before issuing invoices.',
          400,
          'TAX_PROFILE_UNVERIFIED',
        );
      }
      if (!profile.legalName || !profile.registeredAddress || !profile.gstin || !profile.stateCode) {
        throw new BillingError(
          'Seller tax profile is incomplete. Required: registered business name, address, GSTIN, and registration state code.',
          400,
          'SELLER_PROFILE_INCOMPLETE',
        );
      }

      // Positive tax requires verified tax rules
      const hasPositiveTax = (invoice.taxMinor || 0) > 0;
      if (hasPositiveTax) {
        if (!profile.verification?.taxRulesVerified) {
          throw new BillingError(
            'Tax rules are not verified for positive-tax invoicing. Please verify HSN code and applicable GST rates in Seller Tax Profile.',
            400,
            'TAX_PROFILE_UNVERIFIED',
          );
        }

        // Verify each line has a matching tax rule in the profile
        const rules = profile.taxRules || [];
        for (const item of invoice.itemsV2) {
          const stoneId = item.stoneSnapshot?.stoneId || item.stoneSnapshot?.id;
          const slug = item.stoneSnapshot?.slug?.toLowerCase();
          const matchingRule = rules.find((r) => r.stoneId === stoneId || r.stoneSlug === slug);
          if (!matchingRule) {
            throw new BillingError(
              `Tax rule for stone "${item.stoneSnapshot?.name || item.description}" is not verified in Seller Tax Profile.`,
              400,
              'TAX_RULE_MISSING',
            );
          }
          item.hsnCode = matchingRule.hsnCode;
        }
      }

      // Determine Place of Supply and Intra-state vs Inter-state
      const posState = String(invoice.placeOfSupplyStateCode || invoice.billingAddressSnapshot?.stateCode || '').trim();
      if (!posState) {
        throw new BillingError('Place of supply state code is required to determine GST tax breakdown.', 400, 'PLACE_OF_SUPPLY_REQUIRED');
      }

      const isIntraState = profile.stateCode === posState;
      let taxType = 'NONE';
      let cgstMinor = 0;
      let sgstMinor = 0;
      let igstMinor = 0;

      if (hasPositiveTax) {
        if (isIntraState) {
          taxType = 'CGST_SGST';
          const half = roundDivide(BigInt(invoice.taxMinor), 2n);
          cgstMinor = Number(half);
          sgstMinor = invoice.taxMinor - cgstMinor;
          igstMinor = 0;
        } else {
          taxType = 'IGST';
          igstMinor = invoice.taxMinor;
          cgstMinor = 0;
          sgstMinor = 0;
        }
      }

      invoice.taxType = taxType;
      invoice.cgstMinor = cgstMinor;
      invoice.sgstMinor = sgstMinor;
      invoice.igstMinor = igstMinor;

      // Update tax breakdown per line rate
      invoice.taxBreakdownV2 = (invoice.taxBreakdownV2 || []).map((entry) => {
        const lineTax = entry.taxMinor || 0;
        if (!hasPositiveTax || lineTax === 0) {
          return { ...entry, cgstMinor: 0, sgstMinor: 0, igstMinor: 0 };
        }
        if (isIntraState) {
          const lineCgst = Number(roundDivide(BigInt(lineTax), 2n));
          return { ...entry, cgstMinor: lineCgst, sgstMinor: lineTax - lineCgst, igstMinor: 0 };
        }
        return { ...entry, cgstMinor: 0, sgstMinor: 0, igstMinor: lineTax };
      });

      // Generate official invoice number
      const effectiveDate = issueDate ? new Date(issueDate) : now;
      const series = profile.invoiceSeries || 'INV';
      const officialInvoiceNumber = await nextBillingReference(series, effectiveDate, models.CounterModel, activeSession);

      invoice.invoiceNumber = officialInvoiceNumber;
      invoice.issueDate = effectiveDate;
      invoice.taxDate = effectiveDate;
      invoice.issuedAt = now;
      invoice.issuedBy = authenticatedActor;
      invoice.documentStatus = 'ISSUED';
      if (requestKey) invoice.issueRequestKey = requestKey;

      invoice.sellerIdentitySnapshot = {
        legalName: profile.legalName,
        registeredAddress: profile.registeredAddress,
        gstin: profile.gstin,
        registrationState: profile.registrationState,
        stateCode: profile.stateCode,
        email: profile.email,
        phone: profile.phone,
      };

      invoice.seller = {
        name: profile.legalName,
        address: profile.registeredAddress,
        gstin: profile.gstin,
        stateCode: profile.stateCode,
        email: profile.email,
        phone: profile.phone,
      };

      invoice.lineItems = legacyItems(invoice.itemsV2);
      invoice.taxAmount = (invoice.taxMinor || 0) / 100;
      invoice.grandTotal = (invoice.grandTotalMinor || 0) / 100;
      invoice.amountInWords = amountInWords(invoice.grandTotal);
      invoice.issuedSnapshot = plain(invoice);

      await invoice.save({ session: activeSession });

      const event = await createDocument(
        models.InvoiceEventModel,
        eventFor(invoice, 'INVOICE_ISSUED', authenticatedActor, now, {
          fromStatus: 'DRAFT',
          toStatus: 'ISSUED',
          snapshot: {
            officialInvoiceNumber,
            grandTotalMinor: invoice.grandTotalMinor,
            taxType,
            taxMinor: invoice.taxMinor,
            cgstMinor,
            sgstMinor,
            igstMinor,
          },
        }),
        activeSession,
      );

      return { invoice, event, duplicate: false };
    },
  });
}

export async function voidInvoice({
  invoiceId,
  reason,
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
        throw new BillingError('Historical invoices cannot be voided.', 409, 'LEGACY_INVOICE_READ_ONLY');
      }
      if (invoice.documentStatus !== 'ISSUED') {
        throw new BillingError('Only issued invoices can be voided.', 409, 'INVALID_INVOICE_STATE');
      }
      if (invoice.paymentSummary?.confirmedMinor > 0) {
        throw new BillingError(
          'Cannot void an invoice with confirmed payments. Payments must be reversed first.',
          409,
          'INVOICE_HAS_PAYMENTS',
        );
      }

      invoice.documentStatus = 'VOID';
      invoice.updatedBy = authenticatedActor;
      await invoice.save({ session: activeSession });

      const event = await createDocument(
        models.InvoiceEventModel,
        eventFor(invoice, 'INVOICE_VOIDED', authenticatedActor, now, {
          fromStatus: 'ISSUED',
          toStatus: 'VOID',
          snapshot: { reason: reason || 'Voided by administrator' },
        }),
        activeSession,
      );

      return { invoice, event };
    },
  });
}

export async function getInvoiceById({ invoiceId, models: overrides }) {
  requireObjectId(invoiceId, 'Invoice ID');
  const models = resolveModels(overrides);
  const invoice = await models.InvoiceModel.findById(invoiceId).lean();
  if (!invoice) throw new BillingError('Invoice was not found.', 404, 'INVOICE_NOT_FOUND');

  const [events, payments, salesOrder] = await Promise.all([
    models.InvoiceEventModel.find({ invoice: invoiceId }).sort({ occurredAt: 1 }).lean(),
    models.PaymentModel.find({ invoiceId }).sort({ receivedAt: -1, createdAt: -1 }).lean(),
    invoice.salesOrderId ? models.SalesOrderModel.findById(invoice.salesOrderId).select('salesOrderNumber status customerSnapshot').lean() : null,
  ]);

  return {
    invoice,
    events: events || [],
    payments: payments || [],
    salesOrder: salesOrder || null,
  };
}

export async function listInvoicesV2(query = {}, { models: overrides } = {}) {
  const models = resolveModels(overrides);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};

  if (query.recordType === 'v2') {
    filter.recordVersion = INVOICE_RECORD_VERSION;
  } else if (query.recordType === 'legacy') {
    filter.recordVersion = { $ne: INVOICE_RECORD_VERSION };
  }

  if (query.documentStatus) {
    filter.documentStatus = query.documentStatus;
  }

  if (query.paymentStatus) {
    filter['paymentSummary.status'] = query.paymentStatus;
  }

  if (query.salesOrderId) {
    filter.salesOrderId = query.salesOrderId;
  }

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { invoiceNumber: rx },
      { 'customerIdentitySnapshot.name': rx },
      { 'customerIdentitySnapshot.company': rx },
      { 'buyer.name': rx },
      { salesOrderNumber: rx },
    ];
  }

  if (query.from || query.to) {
    filter.invoiceDate = {};
    if (query.from) filter.invoiceDate.$gte = new Date(query.from);
    if (query.to) filter.invoiceDate.$lte = new Date(query.to);
  }

  const [invoices, total] = await Promise.all([
    models.InvoiceModel.find(filter)
      .sort({ invoiceDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.InvoiceModel.countDocuments(filter),
  ]);

  return {
    invoices,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function getSellerTaxProfile({ models: overrides } = {}) {
  const models = resolveModels(overrides);
  const profile = await models.SellerTaxProfileModel.findOne({ profileKey: PROFILE_KEY }).lean();
  if (profile) return profile;

  return {
    profileKey: PROFILE_KEY,
    legalName: '',
    registeredAddress: '',
    gstin: '',
    registrationState: '',
    stateCode: '',
    email: '',
    phone: '',
    invoiceSeries: 'INV',
    taxRules: [],
    verification: {
      identityVerified: false,
      taxRulesVerified: false,
      verificationNote: '',
    },
  };
}

export async function updateSellerTaxProfile({
  updates,
  actor,
  now = new Date(),
  models: overrides,
}) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(overrides);

  const profile = await models.SellerTaxProfileModel.findOneAndUpdate(
    { profileKey: PROFILE_KEY },
    {
      $set: {
        ...updates,
        ...(updates.verification ? { 'verification.verifiedAt': now } : {}),
        updatedBy: authenticatedActor,
      },
    },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  return profile;
}

export async function getEligibleSalesOrders({ page = 1, limit = 20, search = '' } = {}, { models: overrides } = {}) {
  const models = resolveModels(overrides);
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  // Find sales orders that already have an invoice
  const existingInvoices = await models.InvoiceModel.find({
    recordVersion: INVOICE_RECORD_VERSION,
    documentStatus: { $in: ['DRAFT', 'ISSUED'] },
  }).select('salesOrderId').lean();

  const invoicedOrderIds = (existingInvoices || []).map((inv) => inv.salesOrderId).filter(Boolean);

  const filter = {
    _id: { $nin: invoicedOrderIds },
    status: { $in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_FOR_DISPATCH', 'PARTIALLY_DISPATCHED', 'COMPLETED'] },
  };

  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { salesOrderNumber: rx },
      { 'customerSnapshot.name': rx },
      { 'customerSnapshot.company': rx },
    ];
  }

  const [orders, total] = await Promise.all([
    models.SalesOrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    models.SalesOrderModel.countDocuments(filter),
  ]);

  return {
    orders,
    total,
    page: parsedPage,
    pages: Math.ceil(total / parsedLimit) || 1,
  };
}
