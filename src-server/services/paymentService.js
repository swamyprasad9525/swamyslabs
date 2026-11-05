import mongoose from 'mongoose';
import {
  INVOICE_PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '../constants/payment.js';
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import PaymentEvent from '../models/PaymentEvent.js';
import { escapeRegex } from '../utils/security.js';

const DEFAULT_MODELS = Object.freeze({
  CustomerModel: Customer,
  InvoiceModel: Invoice,
  PaymentModel: Payment,
  PaymentEventModel: PaymentEvent,
});

export class PaymentError extends Error {
  constructor(message, status = 400, code = 'PAYMENT_ERROR') {
    super(message);
    this.name = 'PaymentError';
    this.status = status;
    this.code = code;
  }
}

function resolveModels(overrides = {}) {
  return { ...DEFAULT_MODELS, ...overrides };
}

function requireActor(actor) {
  const value = String(actor || '').trim();
  if (!value) throw new PaymentError('An authenticated actor is required.', 401, 'ACTOR_REQUIRED');
  if (value.length > 120) throw new PaymentError('Actor identifier is too long.');
  return value;
}

function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw new PaymentError(`${label} is invalid.`, 400, 'INVALID_ID');
  return String(value);
}

function requireText(value, label, maximum) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new PaymentError(`${label} is required.`);
  if (normalized.length > maximum) throw new PaymentError(`${label} is too long.`);
  return normalized;
}

function optionalText(value, label, maximum) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string') throw new PaymentError(`${label} is invalid.`);
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > maximum) throw new PaymentError(`${label} is too long.`);
  return normalized;
}

function requireMinorUnits(value, label = 'Payment amount') {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PaymentError(`${label} must be a positive safe integer in minor units.`);
  }
  return value;
}

function plain(value) {
  if (value == null) return value;
  return typeof value.toObject === 'function' ? value.toObject({ versionKey: false }) : value;
}

function idsEqual(left, right) {
  return String(left?._id || left || '') === String(right?._id || right || '');
}

function transactionUnsupported(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 20 || error?.codeName === 'IllegalOperation'
    || message.includes('transaction numbers are only allowed')
    || message.includes('does not support transactions');
}

function requireActiveTransactionSession(session) {
  if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) {
    throw new PaymentError(
      'MongoDB transaction support is required for payment operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }
  return session;
}

async function runRequiredPaymentTransaction({ models, connection, session, work }) {
  if (session) return work(requireActiveTransactionSession(session));
  const database = connection || models.PaymentModel?.db || models.InvoiceModel?.db;
  if (typeof database?.startSession !== 'function') {
    throw new PaymentError(
      'MongoDB transaction support is required for payment operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }

  let ownedSession;
  try {
    ownedSession = await database.startSession();
  } catch {
    throw new PaymentError('Payment transaction service is unavailable.', 503, 'TRANSACTION_UNAVAILABLE');
  }
  if (typeof ownedSession?.withTransaction !== 'function') {
    if (typeof ownedSession?.endSession === 'function') await ownedSession.endSession();
    throw new PaymentError(
      'MongoDB transaction support is required for payment operations.',
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
      throw new PaymentError(
        'MongoDB transaction support is required for payment operations.',
        503,
        'TRANSACTION_REQUIRED',
      );
    }
    if (error?.name === 'VersionError') {
      throw new PaymentError('Payment data changed concurrently. Try again.', 409, 'PAYMENT_CONFLICT');
    }
    throw error;
  } finally {
    await ownedSession.endSession();
  }
}

function applySession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query;
}

function applyQuery(query, method, ...args) {
  return typeof query?.[method] === 'function' ? query[method](...args) : query;
}

async function findById(Model, id, session = null) {
  return applySession(Model.findById(id), session);
}

async function findOne(Model, filter, session = null) {
  return applySession(Model.findOne(filter), session);
}

async function createDocument(Model, value, session) {
  const created = await Model.create([value], { session });
  return Array.isArray(created) ? created[0] : created;
}

function normalizeInvoicePaymentSummary(invoice) {
  const grandTotalMinor = Number(invoice?.grandTotalMinor);
  const confirmedMinor = Number(invoice?.paymentSummary?.confirmedMinor);
  const outstandingMinor = Number(invoice?.paymentSummary?.outstandingMinor);
  const status = invoice?.paymentSummary?.status;
  if (!Number.isSafeInteger(grandTotalMinor) || grandTotalMinor < 0
    || !Number.isSafeInteger(confirmedMinor) || confirmedMinor < 0
    || !Number.isSafeInteger(outstandingMinor) || outstandingMinor < 0
    || confirmedMinor + outstandingMinor !== grandTotalMinor
    || !INVOICE_PAYMENT_STATUSES.includes(status)) {
    throw new PaymentError(
      'Invoice payment data is not ready for payment processing.',
      409,
      'INVOICE_PAYMENT_DATA_INVALID',
    );
  }
  const expectedStatus = confirmedMinor === 0
    ? 'UNPAID'
    : outstandingMinor === 0 ? 'PAID' : 'PARTIALLY_PAID';
  if (status !== expectedStatus) {
    throw new PaymentError(
      'Invoice payment data is not ready for payment processing.',
      409,
      'INVOICE_PAYMENT_DATA_INVALID',
    );
  }
  return { grandTotalMinor, confirmedMinor, outstandingMinor, status };
}

function requireEligibleInvoice(invoice, { customerId, currency = 'INR' } = {}) {
  if (!invoice) throw new PaymentError('Invoice was not found.', 404, 'INVOICE_NOT_FOUND');
  if (Number(invoice.recordVersion) !== 2) {
    throw new PaymentError('Only V2 invoices can receive payments.', 409, 'INVOICE_VERSION_UNSUPPORTED');
  }
  if (invoice.documentStatus !== 'ISSUED') {
    throw new PaymentError('Only issued invoices can receive payment changes.', 409, 'INVOICE_NOT_ISSUED');
  }
  if (invoice.currency !== currency) {
    throw new PaymentError('Payment currency does not match the invoice.', 409, 'PAYMENT_CURRENCY_MISMATCH');
  }
  if (!invoice.customerId || !idsEqual(invoice.customerId, customerId)) {
    throw new PaymentError('Payment customer does not match the invoice.', 409, 'PAYMENT_CUSTOMER_MISMATCH');
  }
  return normalizeInvoicePaymentSummary(invoice);
}

function customerSnapshot(customer) {
  const customerNumber = requireText(customer?.customerNumber, 'Customer number', 80);
  const name = requireText(customer?.name, 'Customer name', 160);
  const company = optionalText(customer?.company, 'Customer company', 160);
  return { customerNumber, name, ...(company ? { company } : {}) };
}

function samePaymentIntent(payment, input) {
  return idsEqual(payment.invoiceId, input.invoiceId)
    && idsEqual(payment.customerId, input.customerId)
    && Number(payment.amountMinor) === input.amountMinor
    && payment.currency === input.currency
    && payment.method === input.method
    && String(payment.referenceNumber || '') === String(input.referenceNumber || '');
}

function derivePaymentSummary(grandTotalMinor, confirmedMinor) {
  if (!Number.isSafeInteger(grandTotalMinor) || grandTotalMinor < 0
    || !Number.isSafeInteger(confirmedMinor) || confirmedMinor < 0) {
    throw new PaymentError('Payment totals are invalid.', 409, 'PAYMENT_TOTALS_INVALID');
  }
  if (confirmedMinor > grandTotalMinor) {
    throw new PaymentError('Payment would exceed the invoice outstanding amount.', 409, 'PAYMENT_OVERPAYMENT');
  }
  const outstandingMinor = grandTotalMinor - confirmedMinor;
  return {
    confirmedMinor,
    outstandingMinor,
    status: confirmedMinor === 0 ? 'UNPAID' : outstandingMinor === 0 ? 'PAID' : 'PARTIALLY_PAID',
  };
}

async function confirmedPaymentTotal(PaymentModel, invoiceId, session) {
  let query = PaymentModel.find({ invoiceId, status: 'CONFIRMED' });
  query = applySession(query, session);
  query = applyQuery(query, 'select', 'amountMinor');
  query = applyQuery(query, 'lean');
  const payments = await query;
  return (payments || []).reduce((total, payment) => {
    const amount = Number(payment.amountMinor);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(total + amount)) {
      throw new PaymentError('Confirmed payment totals are invalid.', 409, 'PAYMENT_TOTALS_INVALID');
    }
    return total + amount;
  }, 0);
}

async function updateInvoicePaymentSummary({ models, invoice, summary, session }) {
  const updated = await models.InvoiceModel.findOneAndUpdate(
    {
      _id: invoice._id,
      recordVersion: 2,
      documentStatus: 'ISSUED',
      currency: invoice.currency,
      grandTotalMinor: invoice.grandTotalMinor,
    },
    { $set: { paymentSummary: summary } },
    { new: true, runValidators: true, session },
  );
  if (!updated) {
    throw new PaymentError('Invoice changed concurrently. Try again.', 409, 'PAYMENT_CONFLICT');
  }
  return updated;
}

async function appendPaymentEvent(models, value, session) {
  return createDocument(models.PaymentEventModel, value, session);
}

export async function createPayment({
  input,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session,
}) {
  const models = resolveModels(modelOverrides);
  const authenticatedActor = requireActor(actor);
  const normalized = {
    invoiceId: requireObjectId(input?.invoiceId, 'Invoice ID'),
    customerId: requireObjectId(input?.customerId, 'Customer ID'),
    amountMinor: requireMinorUnits(input?.amountMinor),
    currency: input?.currency === 'INR' ? 'INR' : (() => { throw new PaymentError('Payment currency must be INR.'); })(),
    method: PAYMENT_METHODS.includes(input?.method) ? input.method : (() => { throw new PaymentError('Payment method is invalid.'); })(),
    requestKey: requireText(input?.requestKey, 'Payment request key', 120),
    referenceNumber: optionalText(input?.referenceNumber, 'Payment reference', 160),
    notes: optionalText(input?.notes, 'Payment notes', 1000),
    receivedAt: input?.receivedAt ? new Date(input.receivedAt) : new Date(now),
  };
  if (normalized.requestKey.length < 8) throw new PaymentError('Payment request key is too short.');
  if (Number.isNaN(normalized.receivedAt.getTime())) throw new PaymentError('Payment received date is invalid.');

  const operation = () => runRequiredPaymentTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      const existing = await findOne(models.PaymentModel, {
        invoiceId: normalized.invoiceId,
        requestKey: normalized.requestKey,
      }, activeSession);
      if (existing) {
        if (!samePaymentIntent(existing, normalized)) {
          throw new PaymentError('Payment request key is already used for different data.', 409, 'IDEMPOTENCY_CONFLICT');
        }
        return { payment: plain(existing), idempotent: true };
      }

      const invoice = await findById(models.InvoiceModel, normalized.invoiceId, activeSession);
      const currentSummary = requireEligibleInvoice(invoice, normalized);
      if (normalized.amountMinor > currentSummary.grandTotalMinor) {
        throw new PaymentError('Payment amount exceeds the invoice total.', 409, 'PAYMENT_OVERPAYMENT');
      }
      const customer = await findById(models.CustomerModel, normalized.customerId, activeSession);
      if (!customer) throw new PaymentError('Customer was not found.', 404, 'CUSTOMER_NOT_FOUND');

      const payment = await createDocument(models.PaymentModel, {
        requestKey: normalized.requestKey,
        invoiceId: normalized.invoiceId,
        invoiceNumber: requireText(invoice.invoiceNumber, 'Invoice number', 80),
        customerId: normalized.customerId,
        customerSnapshot: customerSnapshot(customer),
        currency: normalized.currency,
        amountMinor: normalized.amountMinor,
        method: normalized.method,
        ...(normalized.referenceNumber ? { referenceNumber: normalized.referenceNumber } : {}),
        receivedAt: normalized.receivedAt,
        ...(normalized.notes ? { notes: normalized.notes } : {}),
        status: 'PENDING_VERIFICATION',
        createdBy: authenticatedActor,
      }, activeSession);
      await appendPaymentEvent(models, {
        paymentId: payment._id,
        invoiceId: normalized.invoiceId,
        customerId: normalized.customerId,
        type: 'PAYMENT_CREATED',
        toStatus: 'PENDING_VERIFICATION',
        amountMinor: normalized.amountMinor,
        currency: normalized.currency,
        paymentSummary: {
          confirmedMinor: currentSummary.confirmedMinor,
          outstandingMinor: currentSummary.outstandingMinor,
          status: currentSummary.status,
        },
        actor: authenticatedActor,
        occurredAt: new Date(now),
      }, activeSession);
      return { payment: plain(payment), idempotent: false };
    },
  });

  try {
    return await operation();
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await findOne(models.PaymentModel, {
      invoiceId: normalized.invoiceId,
      requestKey: normalized.requestKey,
    });
    if (existing && samePaymentIntent(existing, normalized)) {
      return { payment: plain(existing), idempotent: true };
    }
    throw new PaymentError('Payment request key is already used for different data.', 409, 'IDEMPOTENCY_CONFLICT');
  }
}
