import mongoose from 'mongoose';
import {
  DEFAULT_DISPATCH_PAGE_SIZE,
  DISPATCH_STATUSES,
  MAX_DISPATCH_PAGE_SIZE,
} from '../constants/dispatch.js';
import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';
import Dispatch from '../models/Dispatch.js';
import DispatchEvent from '../models/DispatchEvent.js';
import InventoryBatch from '../models/InventoryBatch.js';
import InventoryMovement from '../models/InventoryMovement.js';
import InventoryReservation from '../models/InventoryReservation.js';
import ReservationEvent from '../models/ReservationEvent.js';
import SalesOrder from '../models/SalesOrder.js';
import SalesOrderEvent from '../models/SalesOrderEvent.js';
import Slab from '../models/Slab.js';
import { escapeRegex } from '../utils/security.js';
import { nextInventoryReference } from './inventoryService.js';

const DEFAULT_MODELS = Object.freeze({
  CounterModel: Counter,
  CustomerModel: Customer,
  DispatchModel: Dispatch,
  DispatchEventModel: DispatchEvent,
  InventoryBatchModel: InventoryBatch,
  InventoryMovementModel: InventoryMovement,
  InventoryReservationModel: InventoryReservation,
  ReservationEventModel: ReservationEvent,
  SalesOrderModel: SalesOrder,
  SalesOrderEventModel: SalesOrderEvent,
  SlabModel: Slab,
});

export class DispatchError extends Error {
  constructor(message, status = 400, code = 'DISPATCH_ERROR') {
    super(message);
    this.name = 'DispatchError';
    this.status = status;
    this.code = code;
  }
}

function resolveModels(overrides = {}) {
  return { ...DEFAULT_MODELS, ...overrides };
}

function requireActor(actor) {
  const value = String(actor || '').trim();
  if (!value) throw new DispatchError('An authenticated actor is required.', 401, 'ACTOR_REQUIRED');
  if (value.length > 120) throw new DispatchError('Actor identifier is too long.');
  return value;
}

function requireObjectId(value, label) {
  if (!mongoose.isValidObjectId(value)) throw new DispatchError(`${label} is invalid.`, 400, 'INVALID_ID');
  return String(value);
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

function roundDecimals(value, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function transactionUnsupported(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 20 || error?.codeName === 'IllegalOperation'
    || message.includes('transaction numbers are only allowed')
    || message.includes('does not support transactions');
}

function requireActiveTransactionSession(session) {
  if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) {
    throw new DispatchError(
      'MongoDB transaction support is required for dispatch operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }
  return session;
}

async function runRequiredTransaction({ models, connection, session, work }) {
  if (session) return work(requireActiveTransactionSession(session));
  const database = connection || models.DispatchModel?.db || models.InventoryBatchModel?.db;
  if (typeof database?.startSession !== 'function') {
    throw new DispatchError(
      'MongoDB transaction support is required for dispatch operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }

  let ownedSession;
  try {
    ownedSession = await database.startSession();
  } catch {
    throw new DispatchError('Dispatch transaction service is unavailable.', 503, 'TRANSACTION_UNAVAILABLE');
  }
  if (typeof ownedSession?.withTransaction !== 'function') {
    if (typeof ownedSession?.endSession === 'function') await ownedSession.endSession();
    throw new DispatchError(
      'MongoDB transaction support is required for dispatch operations.',
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
      throw new DispatchError(
        'MongoDB transaction support is required for dispatch operations.',
        503,
        'TRANSACTION_REQUIRED',
      );
    }
    if (error?.name === 'VersionError') {
      throw new DispatchError('Dispatch inventory changed concurrently. Try again.', 409, 'DISPATCH_CONFLICT');
    }
    throw error;
  } finally {
    await ownedSession.endSession();
  }
}

function applySession(query, session) {
  return session && typeof query?.session === 'function' ? query.session(session) : query;
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

export async function createDispatchDraft({
  salesOrderId,
  reservationIds,
  dispatchDate = new Date(),
  transport = {},
  destinationAddress,
  notes = '',
  requestKey,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session,
}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);

  if (!Array.isArray(reservationIds) || reservationIds.length === 0) {
    throw new DispatchError('At least one reservation is required for dispatch.', 400, 'RESERVATIONS_REQUIRED');
  }

  return runRequiredTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      if (requestKey) {
        const existingByRequest = await findOne(models.DispatchModel, { salesOrderId, requestKey }, activeSession);
        if (existingByRequest) {
          return { dispatch: plain(existingByRequest), duplicate: true };
        }
      }

      const salesOrder = await findById(models.SalesOrderModel, salesOrderId, activeSession);
      if (!salesOrder) throw new DispatchError('Sales Order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
      if (salesOrder.status === 'CANCELLED') {
        throw new DispatchError('Cancelled sales orders cannot be dispatched.', 409, 'INVALID_SALES_ORDER_STATE');
      }

      // Fetch and validate reservations
      const reservations = await models.InventoryReservationModel.find({
        _id: { $in: reservationIds },
      }).session(activeSession);

      if (reservations.length !== reservationIds.length) {
        throw new DispatchError('One or more selected reservations were not found.', 404, 'RESERVATION_NOT_FOUND');
      }

      let totalQuantity = 0;
      let totalAreaSqFt = 0;
      let totalSlabs = 0;
      const items = [];

      for (const res of reservations) {
        if (String(res.salesOrderId) !== String(salesOrderId)) {
          throw new DispatchError('Reservation does not belong to this Sales Order.', 409, 'RESERVATION_ORDER_MISMATCH');
        }
        if (res.status !== 'ACTIVE') {
          throw new DispatchError(`Reservation ${res.reservationNumber} is not active (${res.status}).`, 409, 'RESERVATION_NOT_ACTIVE');
        }
        if (res.preparedDispatchId) {
          throw new DispatchError(
            `Reservation ${res.reservationNumber} is already prepared for another dispatch.`,
            409,
            'RESERVATION_ALREADY_PREPARED',
          );
        }

        // Verify batch stock is not in active processing
        const batch = await findById(models.InventoryBatchModel, res.batch, activeSession);
        if (!batch) throw new DispatchError(`Inventory batch for reservation ${res.reservationNumber} was not found.`, 404, 'BATCH_NOT_FOUND');
        if (batch.status === 'IN_PROCESSING') {
          throw new DispatchError(
            `Material in batch ${batch.batchNumber} is currently in processing and cannot be dispatched.`,
            409,
            'BATCH_IN_PROCESSING',
          );
        }

        // Find associated sales order line
        const orderLine = (salesOrder.items || []).find((line) => String(line._id) === String(res.salesOrderLineItemId));
        const unit = orderLine?.unit || (res.inventoryMode === 'INDIVIDUAL_SLAB' ? 'SLABS' : 'UNITS');

        totalQuantity += res.quantity;
        totalAreaSqFt += res.areaSqFt;
        totalSlabs += (res.slabIds?.length || 0);

        items.push({
          salesOrderLineItemId: res.salesOrderLineItemId,
          reservationId: res._id,
          batchId: res.batch,
          batchNumber: res.inventorySnapshot?.batchNumber || batch.batchNumber,
          stoneSnapshot: res.inventorySnapshot?.stoneRef || batch.stoneSnapshot,
          inventoryMode: res.inventoryMode,
          quantity: res.quantity,
          quantityMilli: Math.round(res.quantity * 1000),
          areaSqFt: res.areaSqFt,
          slabIds: res.slabIds || [],
          slabNumbers: res.inventorySnapshot?.slabNumbers || [],
          unit,
        });
      }

      const dispatchNumber = await nextInventoryReference('DSP', dispatchDate, models.CounterModel, activeSession);

      const customer = salesOrder.customerSnapshot || {};
      const destination = destinationAddress || customer.deliveryAddress || customer.billingAddress;

      const dispatch = await createDocument(models.DispatchModel, {
        dispatchNumber,
        salesOrderId: salesOrder._id,
        salesOrderNumber: salesOrder.salesOrderNumber,
        customerId: salesOrder.customerId,
        customerSnapshot: plain(customer),
        status: 'DRAFT',
        dispatchDate: new Date(dispatchDate),
        transport: transport || { mode: 'BY_LORRY' },
        ...(destination ? { destinationAddress: destination } : {}),
        items,
        totalQuantity: roundDecimals(totalQuantity, 4),
        totalAreaSqFt: roundDecimals(totalAreaSqFt, 4),
        totalSlabs,
        ...(requestKey ? { requestKey } : {}),
        notes: notes || '',
        createdBy: authenticatedActor,
        updatedBy: authenticatedActor,
      }, activeSession);

      // Mark reservations as prepared for this dispatch
      await models.InventoryReservationModel.updateMany(
        { _id: { $in: reservationIds } },
        {
          $set: {
            preparedDispatchId: dispatch._id,
            preparedAt: now,
            preparedBy: authenticatedActor,
          },
        },
        { session: activeSession },
      );

      const event = await createDocument(models.DispatchEventModel, {
        dispatchId: dispatch._id,
        dispatchNumber: dispatch.dispatchNumber,
        salesOrderId: salesOrder._id,
        type: 'DISPATCH_CREATED',
        toStatus: 'DRAFT',
        actor: authenticatedActor,
        occurredAt: now,
        snapshot: {
          salesOrderNumber: salesOrder.salesOrderNumber,
          totalQuantity: dispatch.totalQuantity,
          totalAreaSqFt: dispatch.totalAreaSqFt,
          itemCount: items.length,
        },
      }, activeSession);

      return { dispatch: plain(dispatch), event, duplicate: false };
    },
  });
}

export async function updateDispatchDraft({
  dispatchId,
  updates,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session,
}) {
  requireObjectId(dispatchId, 'Dispatch ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);

  return runRequiredTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      const dispatch = await findById(models.DispatchModel, dispatchId, activeSession);
      if (!dispatch) throw new DispatchError('Dispatch was not found.', 404, 'DISPATCH_NOT_FOUND');
      if (dispatch.status !== 'DRAFT') {
        throw new DispatchError('Only draft dispatches can be updated.', 409, 'DISPATCH_IMMUTABLE');
      }

      if (updates.dispatchDate) dispatch.dispatchDate = new Date(updates.dispatchDate);
      if (updates.transport) dispatch.transport = { ...dispatch.transport, ...updates.transport };
      if (updates.destinationAddress) dispatch.destinationAddress = updates.destinationAddress;
      if (Object.hasOwn(updates, 'notes')) dispatch.notes = updates.notes;

      // Handle updating reservation lines if provided
      if (Array.isArray(updates.reservationIds)) {
        const currentResIds = dispatch.items.map((i) => String(i.reservationId));
        const newResIds = updates.reservationIds.map(String);

        const removedIds = currentResIds.filter((id) => !newResIds.includes(id));
        const addedIds = newResIds.filter((id) => !currentResIds.includes(id));

        if (removedIds.length > 0) {
          // Clear preparation on removed reservations
          await models.InventoryReservationModel.updateMany(
            { _id: { $in: removedIds }, preparedDispatchId: dispatch._id },
            { $set: { preparedDispatchId: null, preparedAt: null, preparedBy: null } },
            { session: activeSession },
          );
        }

        if (addedIds.length > 0) {
          const addedReservations = await models.InventoryReservationModel.find({ _id: { $in: addedIds } }).session(activeSession);
          for (const res of addedReservations) {
            if (String(res.salesOrderId) !== String(dispatch.salesOrderId)) {
              throw new DispatchError('Reservation does not belong to this Sales Order.', 409, 'RESERVATION_ORDER_MISMATCH');
            }
            if (res.status !== 'ACTIVE' || res.preparedDispatchId) {
              throw new DispatchError(`Reservation ${res.reservationNumber} is not available for preparation.`, 409, 'RESERVATION_UNAVAILABLE');
            }
          }
          await models.InventoryReservationModel.updateMany(
            { _id: { $in: addedIds } },
            { $set: { preparedDispatchId: dispatch._id, preparedAt: now, preparedBy: authenticatedActor } },
            { session: activeSession },
          );
        }

        // Recompute all items from new reservations list
        const allReservations = await models.InventoryReservationModel.find({ _id: { $in: newResIds } }).session(activeSession);
        const salesOrder = await findById(models.SalesOrderModel, dispatch.salesOrderId, activeSession);

        let totalQuantity = 0;
        let totalAreaSqFt = 0;
        let totalSlabs = 0;
        const newItems = [];

        for (const res of allReservations) {
          const batch = await findById(models.InventoryBatchModel, res.batch, activeSession);
          const orderLine = (salesOrder?.items || []).find((l) => String(l._id) === String(res.salesOrderLineItemId));
          const unit = orderLine?.unit || (res.inventoryMode === 'INDIVIDUAL_SLAB' ? 'SLABS' : 'UNITS');

          totalQuantity += res.quantity;
          totalAreaSqFt += res.areaSqFt;
          totalSlabs += (res.slabIds?.length || 0);

          newItems.push({
            salesOrderLineItemId: res.salesOrderLineItemId,
            reservationId: res._id,
            batchId: res.batch,
            batchNumber: res.inventorySnapshot?.batchNumber || batch?.batchNumber,
            stoneSnapshot: res.inventorySnapshot?.stoneRef || batch?.stoneSnapshot,
            inventoryMode: res.inventoryMode,
            quantity: res.quantity,
            quantityMilli: Math.round(res.quantity * 1000),
            areaSqFt: res.areaSqFt,
            slabIds: res.slabIds || [],
            slabNumbers: res.inventorySnapshot?.slabNumbers || [],
            unit,
          });
        }

        dispatch.items = newItems;
        dispatch.totalQuantity = roundDecimals(totalQuantity, 4);
        dispatch.totalAreaSqFt = roundDecimals(totalAreaSqFt, 4);
        dispatch.totalSlabs = totalSlabs;
      }

      dispatch.updatedBy = authenticatedActor;
      await dispatch.save({ session: activeSession });

      const event = await createDocument(models.DispatchEventModel, {
        dispatchId: dispatch._id,
        dispatchNumber: dispatch.dispatchNumber,
        salesOrderId: dispatch.salesOrderId,
        type: 'DISPATCH_UPDATED',
        fromStatus: 'DRAFT',
        toStatus: 'DRAFT',
        actor: authenticatedActor,
        occurredAt: now,
        snapshot: { changedFields: Object.keys(updates) },
      }, activeSession);

      return { dispatch: plain(dispatch), event };
    },
  });
}

export async function markDispatchReady({
  dispatchId,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session,
}) {
  requireObjectId(dispatchId, 'Dispatch ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);

  return runRequiredTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      const dispatch = await findById(models.DispatchModel, dispatchId, activeSession);
      if (!dispatch) throw new DispatchError('Dispatch was not found.', 404, 'DISPATCH_NOT_FOUND');
      if (dispatch.status === 'READY_TO_DISPATCH') return { dispatch: plain(dispatch) };
      if (dispatch.status !== 'DRAFT') {
        throw new DispatchError('Only draft dispatches can be marked ready.', 409, 'INVALID_DISPATCH_STATE');
      }

      dispatch.status = 'READY_TO_DISPATCH';
      dispatch.readyAt = now;
      dispatch.readyBy = authenticatedActor;
      dispatch.updatedBy = authenticatedActor;
      await dispatch.save({ session: activeSession });

      const event = await createDocument(models.DispatchEventModel, {
        dispatchId: dispatch._id,
        dispatchNumber: dispatch.dispatchNumber,
        salesOrderId: dispatch.salesOrderId,
        type: 'DISPATCH_MARKED_READY',
        fromStatus: 'DRAFT',
        toStatus: 'READY_TO_DISPATCH',
        actor: authenticatedActor,
        occurredAt: now,
      }, activeSession);

      return { dispatch: plain(dispatch), event };
    },
  });
}

/**
 * Confirms physical material dispatch.
 * Transactionally deducts physical inventory, consumes reservations,
 * creates audit movements, updates sales order fulfillment.
 */
export async function confirmDispatch({
  dispatchId,
  gatePassNumber,
  notes,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session,
}) {
  requireObjectId(dispatchId, 'Dispatch ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);

  return runRequiredTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      const dispatch = await findById(models.DispatchModel, dispatchId, activeSession);
      if (!dispatch) throw new DispatchError('Dispatch was not found.', 404, 'DISPATCH_NOT_FOUND');
      if (dispatch.status === 'DISPATCHED') {
        return { dispatch: plain(dispatch), alreadyDispatched: true };
      }
      if (!['DRAFT', 'READY_TO_DISPATCH'].includes(dispatch.status)) {
        throw new DispatchError(`Dispatch in status ${dispatch.status} cannot be confirmed.`, 409, 'INVALID_DISPATCH_STATE');
      }

      const salesOrder = await findById(models.SalesOrderModel, dispatch.salesOrderId, activeSession);
      if (!salesOrder) throw new DispatchError('Sales Order was not found.', 404, 'SALES_ORDER_NOT_FOUND');
      if (salesOrder.status === 'CANCELLED') {
        throw new DispatchError('Cancelled sales orders cannot be fulfilled.', 409, 'SALES_ORDER_CANCELLED');
      }

      // Generate Gate Pass number
      const effectiveGatePass = gatePassNumber
        || await nextInventoryReference('GP', now, models.CounterModel, activeSession);

      // Process each item/reservation
      for (const item of dispatch.items) {
        const reservation = await findById(models.InventoryReservationModel, item.reservationId, activeSession);
        if (!reservation) {
          throw new DispatchError(`Reservation ${item.reservationId} was not found.`, 404, 'RESERVATION_NOT_FOUND');
        }
        if (reservation.status !== 'ACTIVE') {
          throw new DispatchError(`Reservation ${reservation.reservationNumber} is already ${reservation.status}.`, 409, 'RESERVATION_NOT_ACTIVE');
        }

        const batch = await findById(models.InventoryBatchModel, item.batchId, activeSession);
        if (!batch) throw new DispatchError(`Batch ${item.batchNumber} was not found.`, 404, 'BATCH_NOT_FOUND');
        if (batch.status === 'IN_PROCESSING') {
          throw new DispatchError(`Batch ${batch.batchNumber} is currently in processing.`, 409, 'BATCH_IN_PROCESSING');
        }

        // Verify stock sufficiency
        if (batch.quantityOnHand < item.quantity || batch.areaOnHandSqFt < item.areaSqFt) {
          throw new DispatchError(
            `Insufficient stock in batch ${batch.batchNumber} to fulfill dispatch.`,
            409,
            'INSUFFICIENT_STOCK',
          );
        }

        // If individual slab mode, update slabs to DEPLETED
        if (item.inventoryMode === 'INDIVIDUAL_SLAB' && Array.isArray(item.slabIds) && item.slabIds.length > 0) {
          const slabs = await models.SlabModel.find({ _id: { $in: item.slabIds } }).session(activeSession);
          for (const slab of slabs) {
            if (slab.status === 'DEPLETED') {
              throw new DispatchError(`Slab ${slab.slabNumber} is already depleted.`, 409, 'SLAB_DEPLETED');
            }
            slab.status = 'DEPLETED';
            slab.notes = `Dispatched under ${dispatch.dispatchNumber} (GP: ${effectiveGatePass})`;
            await slab.save({ session: activeSession });
          }
        }

        // Deduct physical on-hand and reserved balances from batch
        batch.quantityOnHand = roundDecimals(batch.quantityOnHand - item.quantity, 4);
        batch.areaOnHandSqFt = roundDecimals(batch.areaOnHandSqFt - item.areaSqFt, 4);
        batch.reservedQuantity = roundDecimals(Math.max(0, (batch.reservedQuantity || 0) - item.quantity), 4);
        batch.reservedAreaSqFt = roundDecimals(Math.max(0, (batch.reservedAreaSqFt || 0) - item.areaSqFt), 4);

        if (batch.quantityOnHand <= 0 && batch.areaOnHandSqFt <= 0) {
          batch.status = 'DEPLETED';
        }
        await batch.save({ session: activeSession });

        // Record immutable physical inventory movement
        await createDocument(models.InventoryMovementModel, {
          type: 'DISPATCH',
          inventoryMode: item.inventoryMode,
          batch: batch._id,
          quantityDelta: -item.quantity,
          areaDeltaSqFt: -item.areaSqFt,
          balanceAfter: {
            quantity: batch.quantityOnHand,
            areaSqFt: batch.areaOnHandSqFt,
          },
          reason: `Customer dispatch ${dispatch.dispatchNumber} against SO ${salesOrder.salesOrderNumber}`,
          actor: authenticatedActor,
          occurredAt: now,
          relatedSalesOrderId: salesOrder._id,
          relatedDispatchId: dispatch._id,
          relatedReservationId: reservation._id,
        }, activeSession);

        // Transition reservation to CONSUMED
        reservation.status = 'CONSUMED';
        reservation.preparedDispatchId = null;
        reservation.consumedDispatchId = dispatch._id;
        reservation.consumedAt = now;
        reservation.consumedBy = authenticatedActor;
        await reservation.save({ session: activeSession });

        await createDocument(models.ReservationEventModel, {
          reservation: reservation._id,
          reservationNumber: reservation.reservationNumber,
          salesOrderId: salesOrder._id,
          salesOrderLineItemId: reservation.salesOrderLineItemId,
          dispatchId: dispatch._id,
          type: 'RESERVATION_CONSUMED',
          actor: authenticatedActor,
          occurredAt: now,
          details: {
            fromStatus: 'ACTIVE',
            toStatus: 'CONSUMED',
            batchId: batch._id,
            slabIds: reservation.slabIds || [],
            quantity: reservation.quantity,
            areaSqFt: reservation.areaSqFt,
            dispatchId: dispatch._id,
          },
        }, activeSession);

        // Update sales order line fulfillment and reservations
        const orderLine = (salesOrder.items || []).find((l) => String(l._id) === String(item.salesOrderLineItemId));
        if (orderLine) {
          orderLine.fulfilledQuantity = roundDecimals((orderLine.fulfilledQuantity || 0) + item.quantity, 4);
          orderLine.remainingQuantity = roundDecimals(Math.max(0, orderLine.quantity - orderLine.fulfilledQuantity), 4);
          orderLine.fulfilledAreaSqFt = roundDecimals((orderLine.fulfilledAreaSqFt || 0) + item.areaSqFt, 4);
          orderLine.remainingAreaSqFt = roundDecimals(Math.max(0, (orderLine.areaSqFt || 0) - orderLine.fulfilledAreaSqFt), 4);

          orderLine.reservedQuantity = roundDecimals(Math.max(0, (orderLine.reservedQuantity || 0) - item.quantity), 4);
          orderLine.reservedAreaSqFt = roundDecimals(Math.max(0, (orderLine.reservedAreaSqFt || 0) - item.areaSqFt), 4);
          orderLine.activeReservationCount = Math.max(0, (orderLine.activeReservationCount || 0) - 1);
        }
      }

      // Reconcile Sales Order fulfillment metrics
      let totalOrderedQty = 0;
      let totalFulfilledQty = 0;
      let totalRemainingQty = 0;
      let totalOrderedArea = 0;
      let totalFulfilledArea = 0;
      let totalRemainingArea = 0;
      let fullyDispatchedLines = 0;
      let partiallyDispatchedLines = 0;

      for (const line of salesOrder.items) {
        totalOrderedQty += line.quantity;
        totalFulfilledQty += line.fulfilledQuantity || 0;
        totalRemainingQty += line.remainingQuantity || 0;
        totalOrderedArea += line.areaSqFt || 0;
        totalFulfilledArea += line.fulfilledAreaSqFt || 0;
        totalRemainingArea += line.remainingAreaSqFt || 0;

        if ((line.remainingQuantity || 0) <= 0 && (line.remainingAreaSqFt || 0) <= 0) {
          fullyDispatchedLines += 1;
        } else if ((line.fulfilledQuantity || 0) > 0) {
          partiallyDispatchedLines += 1;
        }
      }

      const isFullyFulfilled = totalRemainingQty <= 0 && totalRemainingArea <= 0;
      const fulfillmentStatus = isFullyFulfilled
        ? 'FULFILLED'
        : totalFulfilledQty > 0
          ? 'PARTIALLY_FULFILLED'
          : 'UNFULFILLED';

      salesOrder.fulfillment = {
        status: fulfillmentStatus,
        orderedQuantity: roundDecimals(totalOrderedQty, 4),
        fulfilledQuantity: roundDecimals(totalFulfilledQty, 4),
        remainingQuantity: roundDecimals(totalRemainingQty, 4),
        orderedAreaSqFt: roundDecimals(totalOrderedArea, 4),
        fulfilledAreaSqFt: roundDecimals(totalFulfilledArea, 4),
        remainingAreaSqFt: roundDecimals(totalRemainingArea, 4),
        totalLineCount: salesOrder.items.length,
        fullyDispatchedLineCount: fullyDispatchedLines,
        partiallyDispatchedLineCount: partiallyDispatchedLines,
        lastDispatchAt: now,
      };

      if (isFullyFulfilled) {
        salesOrder.status = 'COMPLETED';
      }

      salesOrder.updatedBy = authenticatedActor;
      await salesOrder.save({ session: activeSession });

      await createDocument(models.SalesOrderEventModel, {
        salesOrder: salesOrder._id,
        salesOrderNumber: salesOrder.salesOrderNumber,
        type: 'SALES_ORDER_FULFILLMENT_UPDATED',
        dispatchId: dispatch._id,
        fulfillmentStatus,
        quantityDelta: dispatch.totalQuantity,
        areaDeltaSqFt: dispatch.totalAreaSqFt,
        actor: authenticatedActor,
        occurredAt: now,
        note: `Dispatched under ${dispatch.dispatchNumber} (GP: ${effectiveGatePass})`,
      }, activeSession);

      // Confirm dispatch
      const previousStatus = dispatch.status;
      dispatch.status = 'DISPATCHED';
      dispatch.confirmedAt = now;
      dispatch.confirmedBy = authenticatedActor;
      dispatch.gatePassNumber = effectiveGatePass;
      if (notes) dispatch.notes = notes;
      dispatch.dispatchedSnapshot = plain(dispatch);
      dispatch.updatedBy = authenticatedActor;
      await dispatch.save({ session: activeSession });

      const dispatchEvent = await createDocument(models.DispatchEventModel, {
        dispatchId: dispatch._id,
        dispatchNumber: dispatch.dispatchNumber,
        salesOrderId: salesOrder._id,
        type: 'DISPATCH_CONFIRMED',
        fromStatus: previousStatus,
        toStatus: 'DISPATCHED',
        actor: authenticatedActor,
        occurredAt: now,
        snapshot: {
          gatePassNumber: effectiveGatePass,
          totalQuantity: dispatch.totalQuantity,
          totalAreaSqFt: dispatch.totalAreaSqFt,
          fulfillmentStatus,
        },
      }, activeSession);

      return { dispatch: plain(dispatch), event: dispatchEvent };
    },
  });
}

export async function cancelDispatch({
  dispatchId,
  reason,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session,
}) {
  requireObjectId(dispatchId, 'Dispatch ID');
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);

  return runRequiredTransaction({
    models,
    connection,
    session,
    work: async (activeSession) => {
      const dispatch = await findById(models.DispatchModel, dispatchId, activeSession);
      if (!dispatch) throw new DispatchError('Dispatch was not found.', 404, 'DISPATCH_NOT_FOUND');
      if (dispatch.status === 'CANCELLED') return { dispatch: plain(dispatch) };
      if (dispatch.status === 'DISPATCHED') {
        throw new DispatchError('Confirmed dispatches cannot be cancelled. Physical stock was already deducted.', 409, 'CANNOT_CANCEL_DISPATCHED');
      }

      const resIds = dispatch.items.map((i) => i.reservationId);
      // Release reservation preparation
      await models.InventoryReservationModel.updateMany(
        { _id: { $in: resIds }, preparedDispatchId: dispatch._id },
        { $set: { preparedDispatchId: null, preparedAt: null, preparedBy: null } },
        { session: activeSession },
      );

      const fromStatus = dispatch.status;
      dispatch.status = 'CANCELLED';
      dispatch.cancelledAt = now;
      dispatch.cancelledBy = authenticatedActor;
      dispatch.cancellationReason = reason || 'Cancelled by administrator';
      dispatch.updatedBy = authenticatedActor;
      await dispatch.save({ session: activeSession });

      const event = await createDocument(models.DispatchEventModel, {
        dispatchId: dispatch._id,
        dispatchNumber: dispatch.dispatchNumber,
        salesOrderId: dispatch.salesOrderId,
        type: 'DISPATCH_CANCELLED',
        fromStatus,
        toStatus: 'CANCELLED',
        actor: authenticatedActor,
        occurredAt: now,
        snapshot: { cancellationReason: dispatch.cancellationReason },
      }, activeSession);

      return { dispatch: plain(dispatch), event };
    },
  });
}

export async function getDispatchById({ dispatchId, models: overrides }) {
  requireObjectId(dispatchId, 'Dispatch ID');
  const models = resolveModels(overrides);

  const dispatch = await models.DispatchModel.findById(dispatchId).lean();
  if (!dispatch) throw new DispatchError('Dispatch was not found.', 404, 'DISPATCH_NOT_FOUND');

  const [events, salesOrder] = await Promise.all([
    models.DispatchEventModel.find({ dispatchId }).sort({ occurredAt: 1 }).lean(),
    models.SalesOrderModel.findById(dispatch.salesOrderId).select('salesOrderNumber status fulfillment items').lean(),
  ]);

  return { dispatch, events: events || [], salesOrder };
}

export async function listDispatches(query = {}, { models: overrides } = {}) {
  const models = resolveModels(overrides);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.salesOrderId) filter.salesOrderId = query.salesOrderId;
  if (query.customerId) filter.customerId = query.customerId;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [
      { dispatchNumber: rx },
      { salesOrderNumber: rx },
      { gatePassNumber: rx },
      { 'transport.vehicleNumber': rx },
      { 'customerSnapshot.name': rx },
      { 'customerSnapshot.company': rx },
    ];
  }

  if (query.from || query.to) {
    filter.dispatchDate = {};
    if (query.from) filter.dispatchDate.$gte = new Date(query.from);
    if (query.to) filter.dispatchDate.$lte = new Date(query.to);
  }

  const [dispatches, total] = await Promise.all([
    models.DispatchModel.find(filter)
      .sort({ dispatchDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    models.DispatchModel.countDocuments(filter),
  ]);

  return {
    dispatches,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function getEligibleReservationsForDispatch(salesOrderId, { models: overrides } = {}) {
  requireObjectId(salesOrderId, 'Sales Order ID');
  const models = resolveModels(overrides);

  const reservations = await models.InventoryReservationModel.find({
    salesOrderId,
    status: 'ACTIVE',
    preparedDispatchId: null,
  }).populate('batch', 'batchNumber finish thicknessMm status inventoryMode').lean();

  return reservations;
}

export async function getDispatchSummaryMetrics({ models: overrides } = {}) {
  const models = resolveModels(overrides);

  const [dispatchedAgg, readyCount, draftCount] = await Promise.all([
    models.DispatchModel.aggregate([
      { $match: { status: 'DISPATCHED' } },
      { $group: { _id: null, totalArea: { $sum: '$totalAreaSqFt' }, count: { $sum: 1 } } },
    ]),
    models.DispatchModel.countDocuments({ status: 'READY_TO_DISPATCH' }),
    models.DispatchModel.countDocuments({ status: 'DRAFT' }),
  ]);

  return {
    dispatchedCount: dispatchedAgg[0]?.count || 0,
    dispatchedAreaSqFt: dispatchedAgg[0]?.totalArea || 0,
    readyCount,
    draftCount,
  };
}
