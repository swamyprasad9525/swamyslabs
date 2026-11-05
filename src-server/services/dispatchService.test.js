import { describe, expect, it, vi } from 'vitest';
import {
  cancelDispatch,
  confirmDispatch,
  createDispatchDraft,
  DispatchError,
  markDispatchReady,
} from './dispatchService.js';

const activeSession = { inTransaction: () => true };
const salesOrderId = '507f1f77bcf86cd799439011';
const dispatchId = '507f1f77bcf86cd799439077';
const customerId = '507f1f77bcf86cd799439033';
const reservationId = '507f1f77bcf86cd799439088';
const batchId = '507f1f77bcf86cd799439066';
const lineItemId = '507f1f77bcf86cd799439055';

function sampleReservation(overrides = {}) {
  return {
    _id: reservationId,
    reservationNumber: 'RES-2026-0001',
    salesOrderId,
    salesOrderLineItemId: lineItemId,
    inventoryMode: 'BATCH',
    batch: batchId,
    quantity: 10,
    areaSqFt: 100,
    status: 'ACTIVE',
    preparedDispatchId: null,
    inventorySnapshot: {
      batchNumber: 'BAT-2026-0001',
      stoneRef: { stoneId: 'black-galaxy', name: 'Black Galaxy' },
    },
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('dispatch draft creation and preparation', () => {
  it('creates dispatch draft and sets preparedDispatchId on active reservation', async () => {
    const res = sampleReservation();
    const mockOrder = {
      _id: salesOrderId,
      salesOrderNumber: 'SO-2026-0001',
      customerId,
      status: 'CONFIRMED',
      items: [{
        _id: lineItemId,
        quantity: 10,
        areaSqFt: 100,
        unit: 'SQ_FT',
      }],
      customerSnapshot: { name: 'Acme Stone', deliveryAddress: { line1: 'Site 101' } },
    };
    const mockBatch = {
      _id: batchId,
      batchNumber: 'BAT-2026-0001',
      status: 'AVAILABLE',
      stoneSnapshot: { stoneId: 'black-galaxy', name: 'Black Galaxy' },
    };

    const createdDispatches = [];
    const createdEvents = [];

    const mockDispatchModel = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ([doc]) => {
        createdDispatches.push(doc);
        return [doc];
      }),
    };
    const mockReservationModel = {
      find: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([res]) }),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const mockBatchModel = {
      findById: vi.fn().mockResolvedValue(mockBatch),
    };
    const mockSalesOrderModel = {
      findById: vi.fn().mockResolvedValue(mockOrder),
    };
    const mockCounter = {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    };

    const result = await createDispatchDraft({
      salesOrderId,
      reservationIds: [reservationId],
      transport: { mode: 'BY_LORRY', vehicleNumber: 'KA-01-AB-1234' },
      actor: 'admin',
      session: activeSession,
      models: {
        DispatchModel: mockDispatchModel,
        InventoryReservationModel: mockReservationModel,
        InventoryBatchModel: mockBatchModel,
        SalesOrderModel: mockSalesOrderModel,
        CounterModel: mockCounter,
        DispatchEventModel: { create: vi.fn(async ([evt]) => { createdEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.dispatch.status).toBe('DRAFT');
    expect(result.dispatch.dispatchNumber).toBe('DSP-2026-0001');
    expect(result.dispatch.totalQuantity).toBe(10);
    expect(result.dispatch.totalAreaSqFt).toBe(100);
    expect(mockReservationModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [reservationId] } },
      expect.objectContaining({
        $set: expect.objectContaining({ preparedBy: 'admin' }),
      }),
      expect.any(Object),
    );
    expect(createdEvents[0].type).toBe('DISPATCH_CREATED');
  });

  it('blocks dispatch creation if inventory batch is currently in processing', async () => {
    const res = sampleReservation();
    const mockOrder = {
      _id: salesOrderId,
      status: 'CONFIRMED',
      items: [{ _id: lineItemId, quantity: 10, areaSqFt: 100 }],
    };
    const processingBatch = {
      _id: batchId,
      batchNumber: 'BAT-2026-0001',
      status: 'IN_PROCESSING', // Active processing job holds this batch!
    };

    await expect(createDispatchDraft({
      salesOrderId,
      reservationIds: [reservationId],
      actor: 'admin',
      session: activeSession,
      models: {
        DispatchModel: { findOne: vi.fn().mockResolvedValue(null) },
        InventoryReservationModel: { find: vi.fn().mockReturnValue({ session: vi.fn().mockResolvedValue([res]) }) },
        InventoryBatchModel: { findById: vi.fn().mockResolvedValue(processingBatch) },
        SalesOrderModel: { findById: vi.fn().mockResolvedValue(mockOrder) },
        CounterModel: { findAndUpdate: vi.fn() },
      },
    })).rejects.toMatchObject({
      status: 409,
      code: 'BATCH_IN_PROCESSING',
    });
  });

  it('marks draft dispatch as ready to dispatch', async () => {
    const mockDispatch = {
      _id: dispatchId,
      status: 'DRAFT',
      dispatchNumber: 'DSP-2026-0001',
      salesOrderId,
      save: vi.fn().mockResolvedValue(true),
    };
    const createdEvents = [];

    const result = await markDispatchReady({
      dispatchId,
      actor: 'admin',
      session: activeSession,
      models: {
        DispatchModel: { findById: vi.fn().mockResolvedValue(mockDispatch) },
        DispatchEventModel: { create: vi.fn(async ([evt]) => { createdEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.dispatch.status).toBe('READY_TO_DISPATCH');
    expect(createdEvents[0].type).toBe('DISPATCH_MARKED_READY');
  });
});

describe('dispatch confirmation and physical inventory fulfillment', () => {
  it('deducts inventory, consumes reservation, appends DISPATCH movement, updates SO fulfillment', async () => {
    const mockDispatch = {
      _id: dispatchId,
      dispatchNumber: 'DSP-2026-0001',
      salesOrderId,
      status: 'READY_TO_DISPATCH',
      totalQuantity: 10,
      totalAreaSqFt: 100,
      items: [{
        salesOrderLineItemId: lineItemId,
        reservationId,
        batchId,
        batchNumber: 'BAT-2026-0001',
        inventoryMode: 'BATCH',
        quantity: 10,
        areaSqFt: 100,
      }],
      save: vi.fn().mockResolvedValue(true),
    };

    const res = sampleReservation();
    const mockBatch = {
      _id: batchId,
      batchNumber: 'BAT-2026-0001',
      quantityOnHand: 15,
      areaOnHandSqFt: 150,
      reservedQuantity: 10,
      reservedAreaSqFt: 100,
      status: 'AVAILABLE',
      save: vi.fn().mockResolvedValue(true),
    };

    const mockOrder = {
      _id: salesOrderId,
      salesOrderNumber: 'SO-2026-0001',
      status: 'CONFIRMED',
      items: [{
        _id: lineItemId,
        quantity: 10,
        areaSqFt: 100,
        fulfilledQuantity: 0,
        remainingQuantity: 10,
        fulfilledAreaSqFt: 0,
        remainingAreaSqFt: 100,
        reservedQuantity: 10,
        reservedAreaSqFt: 100,
        activeReservationCount: 1,
      }],
      fulfillment: {},
      save: vi.fn().mockResolvedValue(true),
    };

    const createdMovements = [];
    const createdReservationEvents = [];
    const createdSalesOrderEvents = [];
    const createdDispatchEvents = [];

    const mockCounter = {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }), // Gate pass sequence
    };

    const result = await confirmDispatch({
      dispatchId,
      actor: 'admin',
      now: new Date('2026-11-05T12:00:00.000Z'),
      session: activeSession,
      models: {
        DispatchModel: { findById: vi.fn().mockResolvedValue(mockDispatch) },
        InventoryReservationModel: { findById: vi.fn().mockResolvedValue(res) },
        InventoryBatchModel: { findById: vi.fn().mockResolvedValue(mockBatch) },
        SalesOrderModel: { findById: vi.fn().mockResolvedValue(mockOrder) },
        CounterModel: mockCounter,
        InventoryMovementModel: { create: vi.fn(async ([m]) => { createdMovements.push(m); return [m]; }) },
        ReservationEventModel: { create: vi.fn(async ([evt]) => { createdReservationEvents.push(evt); return [evt]; }) },
        SalesOrderEventModel: { create: vi.fn(async ([evt]) => { createdSalesOrderEvents.push(evt); return [evt]; }) },
        DispatchEventModel: { create: vi.fn(async ([evt]) => { createdDispatchEvents.push(evt); return [evt]; }) },
      },
    });

    // 1. Dispatch confirmed with gate pass
    expect(result.dispatch.status).toBe('DISPATCHED');
    expect(result.dispatch.gatePassNumber).toBe('GP-2026-0001');

    // 2. Physical batch inventory deducted atomically
    expect(mockBatch.quantityOnHand).toBe(5);
    expect(mockBatch.areaOnHandSqFt).toBe(50);
    expect(mockBatch.reservedQuantity).toBe(0);
    expect(mockBatch.reservedAreaSqFt).toBe(0);

    // 3. Inventory Movement recorded
    expect(createdMovements).toHaveLength(1);
    expect(createdMovements[0].type).toBe('DISPATCH');
    expect(createdMovements[0].quantityDelta).toBe(-10);
    expect(createdMovements[0].areaDeltaSqFt).toBe(-100);
    expect(createdMovements[0].relatedDispatchId).toBe(dispatchId);

    // 4. Reservation CONSUMED
    expect(res.status).toBe('CONSUMED');
    expect(res.consumedDispatchId).toBe(dispatchId);
    expect(createdReservationEvents[0].type).toBe('RESERVATION_CONSUMED');

    // 5. Sales Order completed and fulfilled
    expect(mockOrder.status).toBe('COMPLETED');
    expect(mockOrder.fulfillment.status).toBe('FULFILLED');
    expect(mockOrder.fulfillment.fulfilledQuantity).toBe(10);
    expect(mockOrder.fulfillment.remainingQuantity).toBe(0);
    expect(createdSalesOrderEvents[0].type).toBe('SALES_ORDER_FULFILLMENT_UPDATED');
  });

  it('cancels dispatch before physical departure and releases reservation preparation', async () => {
    const mockDispatch = {
      _id: dispatchId,
      salesOrderId,
      dispatchNumber: 'DSP-2026-0001',
      status: 'DRAFT',
      items: [{ reservationId }],
      save: vi.fn().mockResolvedValue(true),
    };

    const mockReservationModel = {
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const createdEvents = [];

    const result = await cancelDispatch({
      dispatchId,
      reason: 'Vehicle broke down; rescheduled',
      actor: 'admin',
      session: activeSession,
      models: {
        DispatchModel: { findById: vi.fn().mockResolvedValue(mockDispatch) },
        InventoryReservationModel: mockReservationModel,
        DispatchEventModel: { create: vi.fn(async ([evt]) => { createdEvents.push(evt); return [evt]; }) },
      },
    });

    expect(result.dispatch.status).toBe('CANCELLED');
    expect(mockReservationModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: [reservationId] }, preparedDispatchId: dispatchId },
      expect.objectContaining({
        $set: { preparedDispatchId: null, preparedAt: null, preparedBy: null },
      }),
      expect.any(Object),
    );
    expect(createdEvents[0].type).toBe('DISPATCH_CANCELLED');
  });

  it('forbids cancelling a confirmed dispatch where material was already deducted', async () => {
    const mockDispatched = {
      _id: dispatchId,
      status: 'DISPATCHED',
      items: [],
    };

    await expect(cancelDispatch({
      dispatchId,
      reason: 'Try to undo',
      actor: 'admin',
      session: activeSession,
      models: {
        DispatchModel: { findById: vi.fn().mockResolvedValue(mockDispatched) },
      },
    })).rejects.toMatchObject({
      status: 409,
      code: 'CANNOT_CANCEL_DISPATCHED',
    });
  });
});
