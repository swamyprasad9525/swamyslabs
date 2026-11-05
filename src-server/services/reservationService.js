import mongoose from 'mongoose';
import { RESERVATION_REFERENCE_PREFIX } from '../constants/commercial.js';
import Counter from '../models/Counter.js';
import InventoryBatch from '../models/InventoryBatch.js';
import InventoryReservation from '../models/InventoryReservation.js';
import ReservationEvent from '../models/ReservationEvent.js';
import Slab from '../models/Slab.js';

const INDIA_OFFSET_MS = 330 * 60 * 1000;
const AREA_PRECISION = 4;

const DEFAULT_MODELS = Object.freeze({
  CounterModel: Counter,
  InventoryBatchModel: InventoryBatch,
  InventoryReservationModel: InventoryReservation,
  ReservationEventModel: ReservationEvent,
  SlabModel: Slab,
});

export class ReservationError extends Error {
  constructor(message, status = 400, code = 'RESERVATION_ERROR') {
    super(message);
    this.name = 'ReservationError';
    this.status = status;
    this.code = code;
  }
}

function resolveModels(overrides = {}) {
  return { ...DEFAULT_MODELS, ...overrides };
}

function requiredText(value, field, maxLength) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new ReservationError(`${field} is required.`);
  if (normalized.length > maxLength) {
    throw new ReservationError(`${field} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

function requireActor(actor) {
  const normalized = requiredText(actor, 'Authenticated actor', 120);
  return normalized;
}

function requireObjectId(value, field) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ReservationError(`${field} is invalid.`, 400, 'INVALID_ID');
  }
  return value;
}

function optionalPositiveNumber(value, field, { integer = false } = {}) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0 || (integer && !Number.isInteger(normalized))) {
    throw new ReservationError(`${field} must be a positive${integer ? ' whole' : ''} number.`);
  }
  return normalized;
}

function requiredPositiveNumber(value, field, options) {
  const normalized = optionalPositiveNumber(value, field, options);
  if (normalized === undefined) throw new ReservationError(`${field} is required.`);
  return normalized;
}

function roundArea(value) {
  return Number(Number(value || 0).toFixed(AREA_PRECISION));
}

function plain(value) {
  if (!value) return value;
  return typeof value.toObject === 'function' ? value.toObject() : { ...value };
}

function idsEqual(left, right) {
  return String(left || '') === String(right || '');
}

function sortedIds(values = []) {
  return values.map(String).sort();
}

function arraysEqual(left, right) {
  const a = sortedIds(left);
  const b = sortedIds(right);
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function transactionUnsupported(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 20
    || error?.codeName === 'IllegalOperation'
    || message.includes('transaction numbers are only allowed')
    || message.includes('does not support transactions');
}

function asReservationError(error) {
  if (error instanceof ReservationError) return error;
  if (error?.status && error?.code) {
    return new ReservationError(error.message || 'Reservation operation failed.', error.status, error.code);
  }
  if (error?.code === 11000) {
    return new ReservationError(
      'Reservation changed concurrently. Retry with the same request key.',
      409,
      'RESERVATION_CONFLICT',
    );
  }
  if (error?.name === 'VersionError') {
    return new ReservationError('Reservation changed concurrently.', 409, 'RESERVATION_CONFLICT');
  }
  return error;
}

function requireActiveTransactionSession(session) {
  if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) {
    throw new ReservationError(
      'MongoDB transaction support is required for inventory reservations.',
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
      throw asReservationError(error);
    }
  }

  const database = connection || models.InventoryReservationModel?.db;
  if (typeof database?.startSession !== 'function') {
    throw new ReservationError(
      'MongoDB transaction support is required for inventory reservations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }

  let ownedSession;
  try {
    ownedSession = await database.startSession();
  } catch {
    throw new ReservationError('Reservation transaction service is unavailable.', 503, 'TRANSACTION_UNAVAILABLE');
  }
  if (typeof ownedSession?.withTransaction !== 'function') {
    if (typeof ownedSession?.endSession === 'function') await ownedSession.endSession();
    throw new ReservationError(
      'MongoDB transaction support is required for inventory reservations.',
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
      throw new ReservationError(
        'MongoDB transaction support is required for inventory reservations.',
        503,
        'TRANSACTION_REQUIRED',
      );
    }
    throw asReservationError(error);
  } finally {
    await ownedSession.endSession();
  }
}

async function findById(Model, id, session) {
  let query = Model.findById(id);
  if (typeof query?.session === 'function') query = query.session(session);
  return query;
}

async function findOne(Model, filter, session) {
  let query = Model.findOne(filter);
  if (typeof query?.session === 'function') query = query.session(session);
  return query;
}

async function findMany(Model, filter, session, sort = null) {
  let query = Model.find(filter);
  if (typeof query?.session === 'function') query = query.session(session);
  if (sort && typeof query?.sort === 'function') query = query.sort(sort);
  return query;
}

async function createDocument(Model, document, session) {
  const created = await Model.create([document], { session });
  return Array.isArray(created) ? created[0] : created;
}

async function nextReservationNumber(now, CounterModel, session) {
  const indiaTime = new Date(new Date(now).getTime() + INDIA_OFFSET_MS);
  if (Number.isNaN(indiaTime.getTime())) throw new ReservationError('Reservation date is invalid.');
  const year = indiaTime.getUTCFullYear();
  const counter = await CounterModel.findOneAndUpdate(
    { _id: `${RESERVATION_REFERENCE_PREFIX.toLowerCase()}_${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session },
  );
  return `${RESERVATION_REFERENCE_PREFIX}-${year}-${String(counter.seq).padStart(4, '0')}`;
}

function normalizeExpectedStone(expectedStone) {
  if (!expectedStone || typeof expectedStone !== 'object' || Array.isArray(expectedStone)) {
    throw new ReservationError('The Sales Order line canonical stone is required.', 400, 'STONE_REQUIRED');
  }
  const stoneId = String(expectedStone.stoneId || expectedStone.id || '').trim();
  const slug = String(expectedStone.slug || '').trim().toLowerCase();
  if (!stoneId && !slug) {
    throw new ReservationError('The Sales Order line canonical stone is required.', 400, 'STONE_REQUIRED');
  }
  return { stoneId: stoneId || undefined, slug: slug || undefined };
}

function assertStoneMatches(stoneRef, expectedStone) {
  if ((expectedStone.stoneId && String(stoneRef?.stoneId) !== expectedStone.stoneId)
    || (expectedStone.slug && String(stoneRef?.slug || '').toLowerCase() !== expectedStone.slug)) {
    throw new ReservationError(
      'Selected inventory does not match the Sales Order line stone.',
      409,
      'STONE_MISMATCH',
    );
  }
}

function slabInventoryArea(slab) {
  return roundArea(slab.usableAreaSqFt ?? slab.grossAreaSqFt);
}

export function inventoryAvailabilitySnapshot(batch) {
  const onHandQuantity = Number(batch?.quantity?.currentCount || 0);
  const onHandArea = batch?.area?.availableSqFt == null
    ? null
    : roundArea(batch.area.availableSqFt);
  const reservedQuantity = Number(batch?.reservationBalance?.quantity || 0);
  const reservedArea = roundArea(batch?.reservationBalance?.areaSqFt || 0);
  const areaAuthoritative = batch?.inventoryMode === 'BATCH' && onHandArea != null;
  const quantityAvailable = areaAuthoritative
    ? null
    : Math.max(0, onHandQuantity - reservedQuantity);
  const areaAvailable = onHandArea == null ? null : roundArea(Math.max(0, onHandArea - reservedArea));
  const hasReservation = reservedQuantity > 0 || reservedArea > 0;
  const fullyReserved = hasReservation && (areaAuthoritative
    ? areaAvailable <= 0
    : quantityAvailable <= 0);

  return {
    basis: areaAuthoritative ? 'AREA' : 'QUANTITY',
    onHand: { quantity: onHandQuantity, areaSqFt: onHandArea },
    reserved: { quantity: reservedQuantity, areaSqFt: reservedArea },
    availableToPromise: { quantity: quantityAvailable, areaSqFt: areaAvailable },
    reservationState: fullyReserved ? 'FULL' : (hasReservation ? 'PARTIAL' : 'NONE'),
  };
}

export function hasActiveReservationBalance(batch) {
  const snapshot = inventoryAvailabilitySnapshot(batch);
  return snapshot.reserved.quantity > 0 || snapshot.reserved.areaSqFt > 0;
}

function reservationMatchesRequest(reservation, {
  salesOrderLineItemId,
  batchId,
  slabIds,
  quantity,
  areaSqFt,
}) {
  if (!idsEqual(reservation.salesOrderLineItemId, salesOrderLineItemId)
    || !idsEqual(reservation.batch, batchId)
    || !arraysEqual(reservation.slabIds || [], slabIds || [])) return false;
  if (quantity != null && Number(reservation.quantity) !== Number(quantity)) return false;
  if (areaSqFt != null && roundArea(reservation.areaSqFt) !== roundArea(areaSqFt)) return false;
  return true;
}

function inventorySnapshot(batch, slabs) {
  return {
    batchNumber: batch.batchNumber,
    stoneRef: plain(batch.stoneRef),
    finish: batch.finish,
    thicknessMm: batch.thicknessMm,
    slabNumbers: slabs.length ? slabs.map((slab) => slab.slabNumber) : undefined,
  };
}

function eventDocument(reservation, type, actor, now, reason) {
  return {
    reservation: reservation._id,
    reservationNumber: reservation.reservationNumber,
    salesOrderId: reservation.salesOrderId,
    salesOrderLineItemId: reservation.salesOrderLineItemId,
    type,
    actor,
    occurredAt: now,
    reason,
    details: {
      fromStatus: type === 'RELEASED' ? 'ACTIVE' : undefined,
      toStatus: type === 'RELEASED' ? 'RELEASED' : 'ACTIVE',
      batchId: reservation.batch,
      slabIds: reservation.slabIds || [],
      quantity: Number(reservation.quantity || 0),
      areaSqFt: roundArea(reservation.areaSqFt || 0),
    },
  };
}

async function createReservationInSession({
  salesOrderId,
  salesOrderLineItemId,
  requestKey,
  batchId,
  slabIds,
  quantity,
  areaSqFt,
  expectedStone,
  actor,
  now,
  models,
  session,
  applySalesOrderAllocation,
}) {
  const existing = await findOne(models.InventoryReservationModel, { salesOrderId, requestKey }, session);
  if (existing) {
    if (!reservationMatchesRequest(existing, {
      salesOrderLineItemId, batchId, slabIds, quantity, areaSqFt,
    })) {
      throw new ReservationError(
        'This request key was already used for a different reservation.',
        409,
        'IDEMPOTENCY_KEY_REUSED',
      );
    }
    assertStoneMatches(existing.inventorySnapshot?.stoneRef, expectedStone);
    const batch = await findById(models.InventoryBatchModel, existing.batch, session);
    return {
      reservation: existing,
      batch,
      slabs: [],
      event: null,
      idempotent: true,
      availability: inventoryAvailabilitySnapshot(batch),
      salesOrderResult: null,
    };
  }

  const batch = await findById(models.InventoryBatchModel, batchId, session);
  if (!batch) throw new ReservationError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
  if (batch.status !== 'AVAILABLE' || batch.activeProcessingJob) {
    throw new ReservationError('Only available inventory can be reserved.', 409, 'INVENTORY_UNAVAILABLE');
  }
  assertStoneMatches(batch.stoneRef, expectedStone);

  const reservationId = new mongoose.Types.ObjectId();
  let basis;
  let reservedQuantity;
  let reservedArea;
  let slabs = [];
  let updatedBatch;

  if (batch.inventoryMode === 'BATCH') {
    if (slabIds.length) throw new ReservationError('Batch-mode reservations cannot select slabs.');
    const areaTracked = batch.area?.availableSqFt != null;
    if (areaTracked) {
      basis = 'AREA';
      reservedArea = roundArea(requiredPositiveNumber(areaSqFt, 'Reservation area'));
      if (quantity !== undefined && quantity !== null && Number(quantity) !== 0) {
        throw new ReservationError('Area-tracked batches must be reserved by area only.');
      }
      reservedQuantity = 0;
      updatedBatch = await models.InventoryBatchModel.findOneAndUpdate(
        {
          _id: batch._id,
          inventoryMode: 'BATCH',
          status: 'AVAILABLE',
          activeProcessingJob: null,
          $expr: {
            $gte: [
              {
                $subtract: [
                  { $ifNull: ['$area.availableSqFt', 0] },
                  { $ifNull: ['$reservationBalance.areaSqFt', 0] },
                ],
              },
              reservedArea,
            ],
          },
        },
        { $inc: { 'reservationBalance.areaSqFt': reservedArea } },
        { new: true, session, runValidators: true },
      );
    } else {
      basis = 'QUANTITY';
      reservedQuantity = requiredPositiveNumber(quantity, 'Reservation quantity', { integer: true });
      if (areaSqFt !== undefined && areaSqFt !== null && Number(areaSqFt) !== 0) {
        throw new ReservationError('Quantity-tracked batches cannot be reserved by area.');
      }
      reservedArea = 0;
      updatedBatch = await models.InventoryBatchModel.findOneAndUpdate(
        {
          _id: batch._id,
          inventoryMode: 'BATCH',
          status: 'AVAILABLE',
          activeProcessingJob: null,
          $expr: {
            $gte: [
              {
                $subtract: [
                  { $ifNull: ['$quantity.currentCount', 0] },
                  { $ifNull: ['$reservationBalance.quantity', 0] },
                ],
              },
              reservedQuantity,
            ],
          },
        },
        { $inc: { 'reservationBalance.quantity': reservedQuantity } },
        { new: true, session, runValidators: true },
      );
    }
  } else {
    basis = 'INDIVIDUAL_SLAB';
    const normalizedIds = slabIds.map((slabId) => requireObjectId(slabId, 'Slab ID'));
    if (!normalizedIds.length) throw new ReservationError('At least one slab must be selected.');
    if (new Set(normalizedIds.map(String)).size !== normalizedIds.length) {
      throw new ReservationError('Selected slabs must be unique.');
    }
    slabs = await findMany(models.SlabModel, {
      _id: { $in: normalizedIds },
      batch: batch._id,
    }, session, { slabNumber: 1, _id: 1 });
    if (!Array.isArray(slabs) || slabs.length !== normalizedIds.length) {
      throw new ReservationError('Every selected slab must belong to this batch.', 409, 'SLAB_UNAVAILABLE');
    }
    for (const slab of slabs) {
      assertStoneMatches(slab.stoneRef, expectedStone);
      if (slab.status !== 'AVAILABLE' || slab.activeProcessingJob || slab.reservation) {
        throw new ReservationError('Every selected slab must be available and unreserved.', 409, 'SLAB_UNAVAILABLE');
      }
    }
    reservedQuantity = slabs.length;
    reservedArea = roundArea(slabs.reduce((sum, slab) => sum + slabInventoryArea(slab), 0));
    if (quantity != null && Number(quantity) !== reservedQuantity) {
      throw new ReservationError('Reservation quantity must match the selected slab count.');
    }
    if (areaSqFt != null && roundArea(areaSqFt) !== reservedArea) {
      throw new ReservationError('Reservation area must match the selected slab area.');
    }

    updatedBatch = await models.InventoryBatchModel.findOneAndUpdate(
      {
        _id: batch._id,
        inventoryMode: 'INDIVIDUAL_SLAB',
        status: 'AVAILABLE',
        activeProcessingJob: null,
        $expr: {
          $and: [
            {
              $gte: [
                {
                  $subtract: [
                    { $ifNull: ['$quantity.currentCount', 0] },
                    { $ifNull: ['$reservationBalance.quantity', 0] },
                  ],
                },
                reservedQuantity,
              ],
            },
            {
              $gte: [
                {
                  $subtract: [
                    { $ifNull: ['$area.availableSqFt', 0] },
                    { $ifNull: ['$reservationBalance.areaSqFt', 0] },
                  ],
                },
                reservedArea,
              ],
            },
          ],
        },
      },
      {
        $inc: {
          'reservationBalance.quantity': reservedQuantity,
          'reservationBalance.areaSqFt': reservedArea,
        },
      },
      { new: true, session, runValidators: true },
    );
    if (updatedBatch) {
      const slabUpdate = await models.SlabModel.updateMany(
        {
          _id: { $in: normalizedIds },
          batch: batch._id,
          status: 'AVAILABLE',
          activeProcessingJob: null,
          $or: [{ reservation: { $exists: false } }, { reservation: null }],
        },
        {
          $set: {
            reservation: {
              reservationId,
              salesOrderId,
              salesOrderLineItemId,
              reservedAt: now,
            },
          },
        },
        { session, runValidators: true },
      );
      if (Number(slabUpdate?.modifiedCount ?? slabUpdate?.nModified) !== normalizedIds.length) {
        throw new ReservationError('One or more slabs changed concurrently.', 409, 'INVENTORY_CONFLICT');
      }
    }
  }

  if (!updatedBatch) {
    throw new ReservationError('Available-to-promise stock changed concurrently.', 409, 'INVENTORY_CONFLICT');
  }

  const reservationNumber = await nextReservationNumber(now, models.CounterModel, session);
  const reservation = await createDocument(models.InventoryReservationModel, {
    _id: reservationId,
    reservationNumber,
    requestKey,
    salesOrderId,
    salesOrderLineItemId,
    inventoryMode: batch.inventoryMode,
    basis,
    batch: batch._id,
    slabIds: slabs.map((slab) => slab._id),
    quantity: reservedQuantity,
    areaSqFt: reservedArea,
    inventorySnapshot: inventorySnapshot(batch, slabs),
    status: 'ACTIVE',
    reservedAt: now,
    reservedBy: actor,
  }, session);
  const event = await createDocument(
    models.ReservationEventModel,
    eventDocument(reservation, 'RESERVED', actor, now),
    session,
  );
  const availability = inventoryAvailabilitySnapshot(updatedBatch);
  const salesOrderResult = await applySalesOrderAllocation({
    reservation,
    delta: { quantity: reservedQuantity, areaSqFt: reservedArea },
    availability,
    actor,
    now,
    session,
  });

  return {
    reservation,
    batch: updatedBatch,
    slabs,
    event,
    idempotent: false,
    availability,
    salesOrderResult,
  };
}

export async function reserveInventory({
  salesOrderId,
  salesOrderLineItemId,
  requestKey,
  batchId,
  slabIds = [],
  quantity,
  areaSqFt,
  expectedStone,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
  applySalesOrderAllocation,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  requireObjectId(salesOrderLineItemId, 'Sales Order line item ID');
  requireObjectId(batchId, 'Batch ID');
  if (!Array.isArray(slabIds)) throw new ReservationError('Slab IDs must be an array.');
  if (slabIds.length > 500) throw new ReservationError('A reservation cannot select more than 500 slabs.');
  const normalizedRequestKey = requiredText(requestKey, 'Reservation request key', 120);
  if (normalizedRequestKey.length < 8) throw new ReservationError('Reservation request key is too short.');
  const authenticatedActor = requireActor(actor);
  const normalizedStone = normalizeExpectedStone(expectedStone);
  if (typeof applySalesOrderAllocation !== 'function') {
    throw new ReservationError('Sales Order allocation integration is required.', 503, 'SALES_ORDER_INTEGRATION_REQUIRED');
  }
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: (activeSession) => (
    createReservationInSession({
      salesOrderId,
      salesOrderLineItemId,
      requestKey: normalizedRequestKey,
      batchId,
      slabIds,
      quantity,
      areaSqFt,
      expectedStone: normalizedStone,
      actor: authenticatedActor,
      now,
      models,
      session: activeSession,
      applySalesOrderAllocation,
    })
  ) });
}

async function releaseReservationInSession({
  reservationId,
  salesOrderId,
  reason,
  actor,
  now,
  models,
  session,
  applySalesOrderRelease,
}) {
  const filter = { _id: reservationId };
  if (salesOrderId) filter.salesOrderId = salesOrderId;
  const current = await findOne(models.InventoryReservationModel, filter, session);
  if (!current) throw new ReservationError('Inventory reservation was not found.', 404, 'RESERVATION_NOT_FOUND');
  if (current.status === 'RELEASED') {
    const batch = await findById(models.InventoryBatchModel, current.batch, session);
    return {
      reservation: current,
      batch,
      event: null,
      idempotent: true,
      availability: inventoryAvailabilitySnapshot(batch),
      salesOrderResult: null,
    };
  }

  const released = await models.InventoryReservationModel.findOneAndUpdate(
    { ...filter, status: 'ACTIVE' },
    {
      $set: {
        status: 'RELEASED',
        releasedAt: now,
        releasedBy: actor,
        releaseReason: reason,
      },
    },
    { new: true, session, runValidators: true },
  );
  if (!released) throw new ReservationError('Reservation changed concurrently.', 409, 'RESERVATION_CONFLICT');

  if (released.inventoryMode === 'INDIVIDUAL_SLAB') {
    const slabUpdate = await models.SlabModel.updateMany(
      {
        _id: { $in: released.slabIds },
        batch: released.batch,
        'reservation.reservationId': released._id,
      },
      { $unset: { reservation: 1 } },
      { session, runValidators: true },
    );
    if (Number(slabUpdate?.modifiedCount ?? slabUpdate?.nModified) !== released.slabIds.length) {
      throw new ReservationError('Reserved slab locks are inconsistent.', 409, 'RESERVATION_INTEGRITY_ERROR');
    }
  }

  const batchFilter = {
    _id: released.batch,
    $expr: {
      $and: [
        {
          $gte: [
            { $ifNull: ['$reservationBalance.quantity', 0] },
            Number(released.quantity || 0),
          ],
        },
        {
          $gte: [
            { $ifNull: ['$reservationBalance.areaSqFt', 0] },
            roundArea(released.areaSqFt || 0),
          ],
        },
      ],
    },
  };
  const batch = await models.InventoryBatchModel.findOneAndUpdate(
    batchFilter,
    {
      $inc: {
        'reservationBalance.quantity': -Number(released.quantity || 0),
        'reservationBalance.areaSqFt': -roundArea(released.areaSqFt || 0),
      },
    },
    { new: true, session, runValidators: true },
  );
  if (!batch) {
    throw new ReservationError('Reservation balance is inconsistent.', 409, 'RESERVATION_INTEGRITY_ERROR');
  }

  const event = await createDocument(
    models.ReservationEventModel,
    eventDocument(released, 'RELEASED', actor, now, reason),
    session,
  );
  const availability = inventoryAvailabilitySnapshot(batch);
  const salesOrderResult = await applySalesOrderRelease({
    reservation: released,
    delta: {
      quantity: -Number(released.quantity || 0),
      areaSqFt: -roundArea(released.areaSqFt || 0),
    },
    availability,
    actor,
    now,
    session,
  });
  return {
    reservation: released,
    batch,
    event,
    idempotent: false,
    availability,
    salesOrderResult,
  };
}

export async function releaseInventoryReservation({
  reservationId,
  salesOrderId,
  reason,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
  applySalesOrderRelease,
}) {
  requireObjectId(reservationId, 'Reservation ID');
  if (salesOrderId) requireObjectId(salesOrderId, 'Sales Order ID');
  const normalizedReason = requiredText(reason, 'Release reason', 1000);
  const authenticatedActor = requireActor(actor);
  if (typeof applySalesOrderRelease !== 'function') {
    throw new ReservationError('Sales Order release integration is required.', 503, 'SALES_ORDER_INTEGRATION_REQUIRED');
  }
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: (activeSession) => (
    releaseReservationInSession({
      reservationId,
      salesOrderId,
      reason: normalizedReason,
      actor: authenticatedActor,
      now,
      models,
      session: activeSession,
      applySalesOrderRelease,
    })
  ) });
}

export async function releaseSalesOrderReservations({
  salesOrderId,
  reason,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
  applySalesOrderRelease,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const normalizedReason = requiredText(reason, 'Release reason', 1000);
  const authenticatedActor = requireActor(actor);
  if (typeof applySalesOrderRelease !== 'function') {
    throw new ReservationError('Sales Order release integration is required.', 503, 'SALES_ORDER_INTEGRATION_REQUIRED');
  }
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const reservations = await findMany(
      models.InventoryReservationModel,
      { salesOrderId, status: 'ACTIVE' },
      activeSession,
      { createdAt: 1, _id: 1 },
    );
    const released = [];
    for (const reservation of reservations) {
      released.push(await releaseReservationInSession({
        reservationId: reservation._id,
        salesOrderId,
        reason: normalizedReason,
        actor: authenticatedActor,
        now,
        models,
        session: activeSession,
        applySalesOrderRelease,
      }));
    }
    return released;
  } });
}
