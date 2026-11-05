import mongoose from 'mongoose';
import {
  PaymentError,
  confirmPayment,
  createPayment,
  getPaymentById,
  getPaymentSummaryMetrics,
  listPayments,
  rejectPayment,
  reversePayment,
} from '../services/paymentService.js';
import {
  parsePaymentListQuery,
  validatePaymentConfirm,
  validatePaymentCreate,
  validatePaymentReasonAction,
} from '../utils/paymentValidation.js';

const AUTHENTICATED_ADMIN_ACTOR = 'authenticated-admin';

function handlePaymentError(res, error, fallbackMessage) {
  if (error instanceof PaymentError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error?.name === 'ValidationError' || error?.name === 'CastError' || error?.name === 'StrictModeError') {
    return res.status(400).json({ error: 'Invalid payment data.' });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ error: 'Payment operation conflicts with existing data.' });
  }
  console.error(`${fallbackMessage}:`, error?.message || error);
  return res.status(500).json({ error: fallbackMessage });
}

export async function createPaymentRecord(req, res) {
  const validation = validatePaymentCreate(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await createPayment({
      input: validation.value,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.status(result.idempotent ? 200 : 201).json(result);
  } catch (error) {
    return handlePaymentError(res, error, 'Failed to record payment.');
  }
}

export async function confirmPaymentRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid payment ID.' });
  }
  const validation = validatePaymentConfirm(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await confirmPayment({
      paymentId: req.params.id,
      note: validation.value?.note,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(result);
  } catch (error) {
    return handlePaymentError(res, error, 'Failed to confirm payment.');
  }
}

export async function rejectPaymentRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid payment ID.' });
  }
  const validation = validatePaymentReasonAction(req.body, 'Payment rejection');
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await rejectPayment({
      paymentId: req.params.id,
      reason: validation.value.reason,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(result);
  } catch (error) {
    return handlePaymentError(res, error, 'Failed to reject payment.');
  }
}

export async function reversePaymentRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid payment ID.' });
  }
  const validation = validatePaymentReasonAction(req.body, 'Payment reversal');
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await reversePayment({
      paymentId: req.params.id,
      reason: validation.value.reason,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(result);
  } catch (error) {
    return handlePaymentError(res, error, 'Failed to reverse payment.');
  }
}

export async function getPaymentRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid payment ID.' });
  }
  try {
    const result = await getPaymentById({ paymentId: req.params.id });
    return res.json(result);
  } catch (error) {
    return handlePaymentError(res, error, 'Failed to load payment.');
  }
}

export async function listPaymentRecords(req, res) {
  const validation = parsePaymentListQuery(req.query);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await listPayments(validation.value);
    return res.json(result);
  } catch (error) {
    return handlePaymentError(res, error, 'Failed to list payments.');
  }
}

export async function getPaymentSummaryMetricsRecord(_req, res) {
  try {
    const metrics = await getPaymentSummaryMetrics();
    return res.json({ metrics });
  } catch (error) {
    return handlePaymentError(res, error, 'Failed to load payment metrics.');
  }
}

