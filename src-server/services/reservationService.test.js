import { describe, expect, it, vi } from 'vitest';
import InventoryReservation from '../models/InventoryReservation.js';
import ReservationEvent from '../models/ReservationEvent.js';
import {
  inventoryAvailabilitySnapshot,
  releaseInventoryReservation,
  reserveInventory,
} from './reservationService.js';

const SALES_ORDER_ID = '507f1f77bcf86cd799439101';
const LINE_ITEM_ID = '507f1f77bcf86cd799439102';
const BATCH_ID = '507f1f77bcf86cd799439103';
const SLAB_ONE = '507f1f77bcf86cd799439104';
const SLAB_TWO = '507f1f77bcf86cd799439105';
const RESERVATION_ID = '507f1f77bcf86cd799439106';
const NOW = new Date('2026-10-20T09:00:00.000Z');
const ACTOR = 'authenticated-admin';
const SESSION = { inTransaction: () => true };
const stoneRef = {
  stoneId: 'stone-1', slug: 'test-stone', name: 'Test Stone', materialFamily: 'Limestone',
};

function queryResult(value) {
  return { session: vi.fn().mockResolvedValue(value) };
}

function listQuery(value) {
  return {
    session: vi.fn().mockReturnThis(),
    sort: vi.fn().mockResolvedValue(value),
  };
}

function batchDocument(overrides = {}) {
  return {
    _id: BATCH_ID,
    batchNumber: 'BAT-2026-0001',
    inventoryMode: 'BATCH',
    stoneRef,
    finish: 'Natural',
    thicknessMm: 20,
    quantity: { receivedCount: 10, currentCount: 10 },
    area: { receivedSqFt: 100, availableSqFt: 100, basis: 'VERIFIED' },
    reservationBalance: { quantity: 0, areaSqFt: 0 },
    status: 'AVAILABLE',
    activeProcessingJob: null,
    ...overrides,
  };
}

function slabDocument(_id, slabNumber, overrides = {}) {
  return {
    _id,
    slabNumber,
    batch: BATCH_ID,
    stoneRef,
    status: 'AVAILABLE',
    activeProcessingJob: null,
    grossAreaSqFt: 10,
    usableAreaSqFt: 9,
    ...overrides,
  };
}

function createModels({ batch = batchDocument(), slabs = [], existing = null } = {}) {
  return {
    CounterModel: {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    },
    InventoryBatchModel: {
      findById: vi.fn(() => queryResult(batch)),
      findOneAndUpdate: vi.fn().mockResolvedValue(batch),
    },
    SlabModel: {
      find: vi.fn(() => listQuery(slabs)),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: slabs.length }),
    },
    InventoryReservationModel: {
      findOne: vi.fn(() => queryResult(existing)),
      findById: vi.fn(() => queryResult(existing)),
      findOneAndUpdate: vi.fn().mockResolvedValue(existing),
      create: vi.fn(async ([document]) => [{ ...document }]),
    },
    ReservationEventModel: {
      create: vi.fn(async ([document]) => [{ ...document }]),
    },
  };
}

function reserveInput(overrides = {}) {
  return {
    salesOrderId: SALES_ORDER_ID,
    salesOrderLineItemId: LINE_ITEM_ID,
    requestKey: 'request-key-0001',
    batchId: BATCH_ID,
    areaSqFt: 40,
    expectedStone: { stoneId: stoneRef.stoneId, slug: stoneRef.slug },
    actor: ACTOR,
    now: NOW,
    session: SESSION,
    applySalesOrderAllocation: vi.fn().mockResolvedValue({ status: 'PARTIALLY_ALLOCATED' }),
    ...overrides,
  };
}

describe('reservation availability math and schemas', () => {
  it('keeps on-hand unchanged and derives area ATP from the reserved subset', () => {
    expect(inventoryAvailabilitySnapshot(batchDocument({
      reservationBalance: { quantity: 0, areaSqFt: 40 },
    }))).toEqual({
      basis: 'AREA',
      onHand: { quantity: 10, areaSqFt: 100 },
      reserved: { quantity: 0, areaSqFt: 40 },
      availableToPromise: { quantity: null, areaSqFt: 60 },
      reservationState: 'PARTIAL',
    });
  });

  it('validates quantity, area and individual-slab reservation bases', async () => {
    const base = {
      reservationNumber: 'RSV-2026-0001',
      requestKey: 'request-key-0001',
      salesOrderId: SALES_ORDER_ID,
      salesOrderLineItemId: LINE_ITEM_ID,
      inventoryMode: 'BATCH',
      basis: 'AREA',
      batch: BATCH_ID,
      quantity: 1,
      areaSqFt: 40,
      inventorySnapshot: { batchNumber: 'BAT-2026-0001', stoneRef },
      reservedAt: NOW,
      reservedBy: ACTOR,
    };
    await expect(new InventoryReservation(base).validate()).rejects.toThrow('area only');
  });

  it('keeps reservation events append-only', async () => {
    const event = new ReservationEvent({
      reservation: RESERVATION_ID,
      reservationNumber: 'RSV-2026-0001',
      salesOrderId: SALES_ORDER_ID,
      salesOrderLineItemId: LINE_ITEM_ID,
      type: 'RESERVED',
      actor: ACTOR,
      occurredAt: NOW,
      details: { toStatus: 'ACTIVE', batchId: BATCH_ID, quantity: 0, areaSqFt: 40 },
    });
    event.isNew = false;
    await expect(event.save()).rejects.toThrow('append-only');
  });
});

describe('transactional inventory reservation', () => {
  it('atomically reserves batch area without creating a physical movement', async () => {
    const updatedBatch = batchDocument({ reservationBalance: { quantity: 0, areaSqFt: 40 } });
    const models = createModels({ batch: updatedBatch });
    const input = reserveInput({ models });

    const result = await reserveInventory(input);

    expect(result.reservation).toMatchObject({
      reservationNumber: 'RSV-2026-0001',
      inventoryMode: 'BATCH',
      basis: 'AREA',
      quantity: 0,
      areaSqFt: 40,
      status: 'ACTIVE',
    });
    expect(models.InventoryBatchModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'AVAILABLE', activeProcessingJob: null, $expr: expect.any(Object) }),
      { $inc: { 'reservationBalance.areaSqFt': 40 } },
      expect.objectContaining({ session: SESSION }),
    );
    expect(input.applySalesOrderAllocation).toHaveBeenCalledWith(expect.objectContaining({
      delta: { quantity: 0, areaSqFt: 40 },
      session: SESSION,
    }));
    expect(Object.keys(models)).not.toContain('InventoryMovementModel');
  });

  it('returns an existing exact request idempotently without reserving twice', async () => {
    const existing = {
      _id: RESERVATION_ID,
      reservationNumber: 'RSV-2026-0001',
      requestKey: 'request-key-0001',
      salesOrderId: SALES_ORDER_ID,
      salesOrderLineItemId: LINE_ITEM_ID,
      inventoryMode: 'BATCH',
      basis: 'AREA',
      batch: BATCH_ID,
      slabIds: [],
      quantity: 0,
      areaSqFt: 40,
      inventorySnapshot: { batchNumber: 'BAT-2026-0001', stoneRef },
      status: 'ACTIVE',
    };
    const models = createModels({ existing });
    const input = reserveInput({ models });

    const result = await reserveInventory(input);

    expect(result.idempotent).toBe(true);
    expect(models.InventoryBatchModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(models.InventoryReservationModel.create).not.toHaveBeenCalled();
    expect(input.applySalesOrderAllocation).not.toHaveBeenCalled();
  });

  it('derives individual slab quantity and area and locks every selected slab', async () => {
    const slabs = [slabDocument(SLAB_ONE, 'SLB-1'), slabDocument(SLAB_TWO, 'SLB-2')];
    const updatedBatch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB',
      area: { receivedSqFt: 20, availableSqFt: 20, basis: 'CALCULATED' },
      quantity: { receivedCount: 2, currentCount: 2 },
      reservationBalance: { quantity: 2, areaSqFt: 18 },
    });
    const models = createModels({ batch: updatedBatch, slabs });
    const result = await reserveInventory(reserveInput({
      models,
      slabIds: [SLAB_ONE, SLAB_TWO],
      quantity: undefined,
      areaSqFt: undefined,
    }));

    expect(result.reservation).toMatchObject({
      basis: 'INDIVIDUAL_SLAB', quantity: 2, areaSqFt: 18,
    });
    expect(models.SlabModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: [SLAB_ONE, SLAB_TWO] } }),
      expect.objectContaining({ $set: { reservation: expect.objectContaining({ salesOrderId: SALES_ORDER_ID }) } }),
      expect.objectContaining({ session: SESSION }),
    );
  });

  it('fails closed when the caller supplies no active transaction', async () => {
    await expect(reserveInventory(reserveInput({
      models: createModels(),
      session: { inTransaction: () => false },
    }))).rejects.toMatchObject({ status: 503, code: 'TRANSACTION_REQUIRED' });
  });

  it('releases exact slab locks and reserved balances without a physical movement', async () => {
    const active = {
      _id: RESERVATION_ID,
      reservationNumber: 'RSV-2026-0001',
      requestKey: 'request-key-0001',
      salesOrderId: SALES_ORDER_ID,
      salesOrderLineItemId: LINE_ITEM_ID,
      inventoryMode: 'INDIVIDUAL_SLAB',
      basis: 'INDIVIDUAL_SLAB',
      batch: BATCH_ID,
      slabIds: [SLAB_ONE, SLAB_TWO],
      quantity: 2,
      areaSqFt: 18,
      status: 'ACTIVE',
    };
    const released = {
      ...active,
      status: 'RELEASED',
      releasedAt: NOW,
      releasedBy: ACTOR,
      releaseReason: 'Order cancelled',
    };
    const batch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB',
      quantity: { receivedCount: 2, currentCount: 2 },
      area: { receivedSqFt: 20, availableSqFt: 20, basis: 'CALCULATED' },
      reservationBalance: { quantity: 0, areaSqFt: 0 },
    });
    const models = createModels({ batch, slabs: [slabDocument(SLAB_ONE, 'SLB-1'), slabDocument(SLAB_TWO, 'SLB-2')] });
    models.InventoryReservationModel.findOne = vi.fn(() => queryResult(active));
    models.InventoryReservationModel.findOneAndUpdate.mockResolvedValue(released);
    const applySalesOrderRelease = vi.fn().mockResolvedValue({ status: 'CANCELLED' });

    const result = await releaseInventoryReservation({
      reservationId: RESERVATION_ID,
      salesOrderId: SALES_ORDER_ID,
      reason: 'Order cancelled',
      actor: ACTOR,
      now: NOW,
      models,
      session: SESSION,
      applySalesOrderRelease,
    });

    expect(result.idempotent).toBe(false);
    expect(models.SlabModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ 'reservation.reservationId': RESERVATION_ID }),
      { $unset: { reservation: 1 } },
      expect.objectContaining({ session: SESSION }),
    );
    expect(models.InventoryBatchModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        $expr: {
          $and: [
            { $gte: [{ $ifNull: ['$reservationBalance.quantity', 0] }, 2] },
            { $gte: [{ $ifNull: ['$reservationBalance.areaSqFt', 0] }, 18] },
          ],
        },
      }),
      { $inc: { 'reservationBalance.quantity': -2, 'reservationBalance.areaSqFt': -18 } },
      expect.objectContaining({ session: SESSION }),
    );
    expect(applySalesOrderRelease).toHaveBeenCalledWith(expect.objectContaining({
      delta: { quantity: -2, areaSqFt: -18 }, session: SESSION,
    }));
    expect(Object.keys(models)).not.toContain('InventoryMovementModel');
  });

  it('releases legacy area reservations when the unused quantity counter is absent', async () => {
    const active = {
      _id: RESERVATION_ID,
      reservationNumber: 'RSV-2026-0002',
      requestKey: 'legacy-area-request',
      salesOrderId: SALES_ORDER_ID,
      salesOrderLineItemId: LINE_ITEM_ID,
      inventoryMode: 'BATCH',
      basis: 'AREA',
      batch: BATCH_ID,
      slabIds: [],
      quantity: 0,
      areaSqFt: 40,
      status: 'ACTIVE',
    };
    const released = {
      ...active,
      status: 'RELEASED',
      releasedAt: NOW,
      releasedBy: ACTOR,
      releaseReason: 'Legacy batch release',
    };
    const batch = batchDocument({
      reservationBalance: { areaSqFt: 0 },
    });
    const models = createModels({ batch });
    models.InventoryReservationModel.findOne = vi.fn(() => queryResult(active));
    models.InventoryReservationModel.findOneAndUpdate.mockResolvedValue(released);

    await releaseInventoryReservation({
      reservationId: RESERVATION_ID,
      salesOrderId: SALES_ORDER_ID,
      reason: 'Legacy batch release',
      actor: ACTOR,
      now: NOW,
      models,
      session: SESSION,
      applySalesOrderRelease: vi.fn().mockResolvedValue({ status: 'CONFIRMED' }),
    });

    expect(models.InventoryBatchModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: BATCH_ID,
        $expr: {
          $and: [
            { $gte: [{ $ifNull: ['$reservationBalance.quantity', 0] }, 0] },
            { $gte: [{ $ifNull: ['$reservationBalance.areaSqFt', 0] }, 40] },
          ],
        },
      },
      {
        $inc: {
          'reservationBalance.quantity': -0,
          'reservationBalance.areaSqFt': -40,
        },
      },
      { new: true, session: SESSION, runValidators: true },
    );
  });
});
