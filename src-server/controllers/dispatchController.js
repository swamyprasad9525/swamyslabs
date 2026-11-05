import mongoose from 'mongoose';
import {
  DispatchError,
  cancelDispatch,
  confirmDispatch,
  createDispatchDraft,
  getDispatchById,
  getDispatchSummaryMetrics,
  getEligibleReservationsForDispatch,
  listDispatches,
  markDispatchReady,
  updateDispatchDraft,
} from '../services/dispatchService.js';
import {
  parseDispatchListQuery,
  validateDispatchCancel,
  validateDispatchConfirm,
  validateDispatchCreate,
  validateDispatchUpdate,
} from '../utils/dispatchValidation.js';

const AUTHENTICATED_ADMIN_ACTOR = 'authenticated-admin';

function handleDispatchError(res, error, fallbackMessage) {
  if (error instanceof DispatchError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error?.name === 'ValidationError' || error?.name === 'CastError' || error?.name === 'StrictModeError') {
    return res.status(400).json({ error: 'Invalid dispatch data.' });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ error: 'Dispatch operation conflicts with existing data.' });
  }
  console.error(`${fallbackMessage}:`, error?.message || error);
  return res.status(500).json({ error: fallbackMessage });
}

export async function createDispatchDraftRecord(req, res) {
  const validation = validateDispatchCreate(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await createDispatchDraft({
      salesOrderId: validation.value.salesOrderId,
      reservationIds: validation.value.reservationIds,
      dispatchDate: validation.value.dispatchDate,
      transport: validation.value.transport,
      destinationAddress: validation.value.destinationAddress,
      notes: validation.value.notes,
      requestKey: validation.value.requestKey,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to create dispatch draft.');
  }
}

export async function updateDispatchDraftRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid dispatch ID.' });
  }
  const validation = validateDispatchUpdate(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await updateDispatchDraft({
      dispatchId: req.params.id,
      updates: validation.value,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(result);
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to update dispatch draft.');
  }
}

export async function markDispatchReadyRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid dispatch ID.' });
  }
  try {
    const result = await markDispatchReady({
      dispatchId: req.params.id,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(result);
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to mark dispatch ready.');
  }
}

export async function confirmDispatchRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid dispatch ID.' });
  }
  const validation = validateDispatchConfirm(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await confirmDispatch({
      dispatchId: req.params.id,
      gatePassNumber: validation.value?.gatePassNumber,
      notes: validation.value?.notes,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(result);
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to confirm dispatch.');
  }
}

export async function cancelDispatchRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid dispatch ID.' });
  }
  const validation = validateDispatchCancel(req.body);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await cancelDispatch({
      dispatchId: req.params.id,
      reason: validation.value.reason,
      actor: req.admin?.role || AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(result);
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to cancel dispatch.');
  }
}

export async function getDispatchRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid dispatch ID.' });
  }
  try {
    const result = await getDispatchById({ dispatchId: req.params.id });
    return res.json(result);
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to load dispatch.');
  }
}

export async function listDispatchRecords(req, res) {
  const validation = parseDispatchListQuery(req.query);
  if (validation.error) return res.status(400).json({ error: validation.error });
  try {
    const result = await listDispatches(validation.value);
    return res.json(result);
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to list dispatches.');
  }
}

export async function getEligibleReservationsRecord(req, res) {
  if (!mongoose.isValidObjectId(req.params.salesOrderId)) {
    return res.status(400).json({ error: 'Invalid Sales Order ID.' });
  }
  try {
    const reservations = await getEligibleReservationsForDispatch(req.params.salesOrderId);
    return res.json({ reservations });
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to load eligible reservations.');
  }
}

export async function getDispatchSummaryMetricsRecord(_req, res) {
  try {
    const metrics = await getDispatchSummaryMetrics();
    return res.json({ metrics });
  } catch (error) {
    return handleDispatchError(res, error, 'Failed to load dispatch metrics.');
  }
}

