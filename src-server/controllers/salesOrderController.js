import mongoose from 'mongoose';
import InventoryReservation from '../models/InventoryReservation.js';
import {
  applySalesOrderAllocation,
  applySalesOrderRelease,
  CommercialError,
  cancelSalesOrder,
  getSalesOrder,
  getSalesOrderSummary,
  linkSalesOrderProcessingJob,
  listSalesOrderEvents,
  listSalesOrders,
  unlinkSalesOrderProcessingJob,
  updateSalesOrder,
} from '../services/commercialService.js';
import {
  InventoryError,
  listInventoryAllocationCandidates,
  listReservableSlabs,
} from '../services/inventoryService.js';
import {
  ReservationError,
  releaseInventoryReservation,
  reserveInventory,
} from '../services/reservationService.js';
import {
  parseSalesOrderListQuery,
  validateCommercialAction,
  validateInventoryReservationPayload,
  validateInventoryReservationRelease,
  validateProcessingLink,
  validateSalesOrderAvailabilityQuery,
  validateSalesOrderSlabAvailabilityQuery,
  validateSalesOrderUpdate,
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

function invalidId(res, value, label) {
  if (mongoose.isValidObjectId(value)) return false;
  res.status(400).json({ error: `Invalid ${label}.`, code: 'INVALID_ID' });
  return true;
}

function handleCommercialError(res, error, fallbackMessage) {
  if (error instanceof CommercialError || error instanceof InventoryError || error instanceof ReservationError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  if (error?.name === 'ValidationError' || error?.name === 'CastError' || error?.name === 'StrictModeError') {
    return res.status(400).json({ error: 'Invalid sales order data.' });
  }
  if (error?.code === 11000) return res.status(409).json({ error: 'Sales order operation conflicts with existing data.' });
  console.error(`${fallbackMessage}:`, error?.name || 'Unexpected error');
  return res.status(500).json({ error: fallbackMessage });
}

function salesOrderLine(order, lineItemId) {
  return order.items?.find((item) => String(item._id) === String(lineItemId));
}

function salesOrderAllowedActions(order) {
  const active = order.status !== 'CANCELLED';
  return {
    update: active,
    reserve: active,
    linkProcessing: active,
    cancel: active && !(order.processingLinks?.length),
  };
}

export async function salesOrderSummary(_req, res) {
  try {
    return res.json({ summary: adminJson(await getSalesOrderSummary({})) });
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load sales order summary.');
  }
}

export async function listSalesOrderRecords(req, res) {
  const validation = parseSalesOrderListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;
  try {
    return res.json(adminJson(await listSalesOrders(validation.value)));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load sales orders.');
  }
}

export async function getSalesOrderRecord(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')) return undefined;
  try {
    const [salesOrder, events, reservations] = await Promise.all([
      getSalesOrder({ salesOrderId: req.params.id }),
      listSalesOrderEvents({ salesOrderId: req.params.id }),
      InventoryReservation.find({ salesOrderId: req.params.id }).sort({ createdAt: 1, _id: 1 }).lean(),
    ]);
    return res.json(adminJson({
      salesOrder,
      events,
      reservations,
      allowedActions: salesOrderAllowedActions(salesOrder),
    }));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load sales order.');
  }
}

export async function updateSalesOrderRecord(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')) return undefined;
  const validation = validateSalesOrderUpdate(req.body);
  if (validationFailure(res, validation)) return undefined;
  try {
    const result = await updateSalesOrder({
      salesOrderId: req.params.id,
      updates: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json({ salesOrder: adminJson(result.salesOrder) });
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to update sales order.');
  }
}

export async function getSalesOrderAvailability(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')) return undefined;
  const validation = validateSalesOrderAvailabilityQuery(req.query);
  if (validationFailure(res, validation)) return undefined;
  try {
    const salesOrder = await getSalesOrder({ salesOrderId: req.params.id });
    const line = salesOrderLine(salesOrder, validation.value.lineItemId);
    if (!line) {
      return res.status(404).json({
        error: 'Sales order line was not found.',
        code: 'SALES_ORDER_LINE_NOT_FOUND',
      });
    }
    if (salesOrder.status === 'CANCELLED') {
      return res.status(409).json({
        error: 'Cancelled sales orders cannot receive reservations.',
        code: 'INVALID_SALES_ORDER_STATE',
      });
    }

    const candidates = await listInventoryAllocationCandidates({
      stoneId: line.stoneSnapshot?.stoneId,
      stoneSlug: line.stoneSnapshot?.slug,
      finish: line.finish,
      thicknessMm: line.thicknessMm,
      page: validation.value.page,
      limit: validation.value.limit,
    });
    const batches = await Promise.all(candidates.batches.map(async (batch) => {
      if (batch.inventoryMode !== 'INDIVIDUAL_SLAB') return batch;
      const slabResult = await listReservableSlabs({ batchId: batch._id, page: 1, limit: 100 });
      return {
        ...batch,
        slabs: slabResult.slabs,
        slabPagination: {
          page: slabResult.page,
          limit: slabResult.limit,
          total: slabResult.total,
          pages: slabResult.pages,
        },
      };
    }));
    return res.json(adminJson({ ...candidates, batches, lineItem: line }));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load available inventory.');
  }
}

export async function getSalesOrderReservableSlabs(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')
    || invalidId(res, req.params.batchId, 'inventory batch ID')) return undefined;
  const validation = validateSalesOrderSlabAvailabilityQuery(req.query);
  if (validationFailure(res, validation)) return undefined;

  try {
    const salesOrder = await getSalesOrder({ salesOrderId: req.params.id });
    const line = salesOrderLine(salesOrder, validation.value.lineItemId);
    if (!line) {
      return res.status(404).json({
        error: 'Sales order line was not found.',
        code: 'SALES_ORDER_LINE_NOT_FOUND',
      });
    }
    if (salesOrder.status === 'CANCELLED') {
      return res.status(409).json({
        error: 'Cancelled sales orders cannot receive reservations.',
        code: 'INVALID_SALES_ORDER_STATE',
      });
    }

    const candidates = await listInventoryAllocationCandidates({
      stoneId: line.stoneSnapshot?.stoneId,
      stoneSlug: line.stoneSnapshot?.slug,
      batchId: req.params.batchId,
      inventoryMode: 'INDIVIDUAL_SLAB',
      finish: line.finish,
      thicknessMm: line.thicknessMm,
      page: 1,
      limit: 1,
    });
    const matchingBatch = candidates.batches.find(
      (batch) => String(batch._id) === String(req.params.batchId),
    );
    if (!matchingBatch) {
      return res.status(404).json({
        error: 'Matching inventory batch was not found.',
        code: 'ALLOCATION_BATCH_NOT_FOUND',
      });
    }

    const result = await listReservableSlabs({
      batchId: matchingBatch._id,
      page: validation.value.page,
      limit: validation.value.limit,
    });
    return res.json(adminJson({ ...result, lineItem: line }));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to load reservable slabs.');
  }
}

export async function createSalesOrderReservation(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')) return undefined;
  const validation = validateInventoryReservationPayload(req.body);
  if (validationFailure(res, validation)) return undefined;
  try {
    const salesOrder = await getSalesOrder({ salesOrderId: req.params.id });
    const line = salesOrderLine(salesOrder, validation.value.lineItemId);
    if (!line) {
      return res.status(404).json({
        error: 'Sales order line was not found.',
        code: 'SALES_ORDER_LINE_NOT_FOUND',
      });
    }
    if (salesOrder.status === 'CANCELLED') {
      return res.status(409).json({
        error: 'Cancelled sales orders cannot receive reservations.',
        code: 'INVALID_SALES_ORDER_STATE',
      });
    }
    const result = await reserveInventory({
      salesOrderId: salesOrder._id,
      salesOrderLineItemId: line._id,
      requestKey: validation.value.requestKey,
      batchId: validation.value.batchId,
      slabIds: validation.value.slabIds,
      quantity: validation.value.quantity,
      areaSqFt: validation.value.areaSqFt,
      expectedStone: {
        stoneId: line.stoneSnapshot?.stoneId,
        slug: line.stoneSnapshot?.slug,
      },
      actor: AUTHENTICATED_ADMIN_ACTOR,
      applySalesOrderAllocation,
    });
    return res.status(result.idempotent ? 200 : 201).json(adminJson(result));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to reserve inventory.');
  }
}

export async function releaseSalesOrderReservation(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')
    || invalidId(res, req.params.reservationId, 'reservation ID')) return undefined;
  const validation = validateInventoryReservationRelease(req.body);
  if (validationFailure(res, validation)) return undefined;
  try {
    const result = await releaseInventoryReservation({
      reservationId: req.params.reservationId,
      salesOrderId: req.params.id,
      reason: validation.value.reason,
      actor: AUTHENTICATED_ADMIN_ACTOR,
      applySalesOrderRelease,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to release inventory reservation.');
  }
}

export async function cancelSalesOrderRecord(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')) return undefined;
  const validation = validateCommercialAction(req.body, { requireReason: true });
  if (validationFailure(res, validation)) return undefined;
  try {
    const result = await cancelSalesOrder({
      salesOrderId: req.params.id,
      reason: validation.value.reason,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to cancel sales order.');
  }
}

export async function linkProcessingJob(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')) return undefined;
  const validation = validateProcessingLink(req.body);
  if (validationFailure(res, validation)) return undefined;
  try {
    const result = await linkSalesOrderProcessingJob({
      salesOrderId: req.params.id,
      lineItemId: validation.value.lineItemId,
      processingJobId: validation.value.processingJobId,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to link processing job.');
  }
}

export async function unlinkProcessingJob(req, res) {
  if (invalidId(res, req.params.id, 'sales order ID')
    || invalidId(res, req.params.processingJobId, 'processing job ID')) return undefined;
  try {
    const result = await unlinkSalesOrderProcessingJob({
      salesOrderId: req.params.id,
      processingJobId: req.params.processingJobId,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleCommercialError(res, error, 'Failed to unlink processing job.');
  }
}
