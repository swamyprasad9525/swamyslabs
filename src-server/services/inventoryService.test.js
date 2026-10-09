import { describe, expect, it, vi } from 'vitest';
import {
  ADJUSTMENT_DIRECTIONS,
  AREA_SQ_MM_PER_SQ_FT,
  INVENTORY_MODES,
  INVENTORY_STATUSES,
  MOVEMENT_TYPES,
} from '../constants/inventory.js';
import InventoryBatch from '../models/InventoryBatch.js';
import InventoryMovement from '../models/InventoryMovement.js';
import Slab from '../models/Slab.js';
import {
  InventoryError,
  adjustInventoryStock,
  canonicalStoneSnapshot,
  createInventoryBatch,
  createInventorySlab,
  formatInventoryReference,
  getInventorySummary,
  inventoryCostValue,
  listInventoryBatches,
  locationsEqual,
  nextInventoryReference,
  normalizeInventoryLocation,
  normalizeInventoryPagination,
  squareFeetFromMillimetres,
  transferInventory,
  updateInventoryBatch,
  updateInventorySlab,
} from './inventoryService.js';

const BATCH_ID = '507f1f77bcf86cd799439011';
const SLAB_ID = '507f191e810c19729de860ea';
const ACTOR = 'authenticated-admin';
const NOW = new Date('2026-10-09T10:00:00.000Z');

const stoneRef = {
  stoneId: '1',
  slug: 'tandur-yellow-limestone-cobble-premium',
  name: 'Tandur Yellow Limestone Cobble (Premium)',
  materialFamily: 'Limestone',
};

function batchDocument(overrides = {}) {
  return {
    _id: BATCH_ID,
    batchNumber: 'BAT-2026-0001',
    stoneRef,
    inventoryMode: 'BATCH',
    receivedDate: NOW,
    quantity: { receivedCount: 10, currentCount: 10 },
    area: { receivedSqFt: 100, availableSqFt: 100, basis: 'VERIFIED' },
    location: { warehouse: 'Main Yard', zone: 'A', rack: '1' },
    status: 'AVAILABLE',
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function baseCreateInput(overrides = {}) {
  return {
    stoneRef: { stoneId: '1' },
    inventoryMode: 'BATCH',
    receivedDate: '2026-10-09',
    quantity: { receivedCount: 10 },
    area: { receivedSqFt: 100 },
    location: { warehouse: 'Main Yard', zone: 'A', rack: '1' },
    ...overrides,
  };
}

function createModels({ batch, movement, slab } = {}) {
  const createdBatch = batch || batchDocument();
  const createdMovement = movement || { _id: '507f1f77bcf86cd799439099' };
  const createdSlab = slab || { _id: SLAB_ID };
  return {
    CounterModel: {
      findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }),
    },
    InventoryBatchModel: {
      create: vi.fn().mockResolvedValue(createdBatch),
      findById: vi.fn().mockResolvedValue(createdBatch),
      findOneAndUpdate: vi.fn().mockResolvedValue(createdBatch),
      countDocuments: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(true),
    },
    InventoryMovementModel: {
      create: vi.fn().mockResolvedValue(createdMovement),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
    SlabModel: {
      create: vi.fn().mockResolvedValue(createdSlab),
      findById: vi.fn().mockResolvedValue(createdSlab),
      findOne: vi.fn().mockResolvedValue(createdSlab),
      findOneAndUpdate: vi.fn().mockResolvedValue(createdSlab),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
  };
}

describe('inventory constants and reference helpers', () => {
  it('publishes only Phase 5 inventory modes, statuses and movement types', () => {
    expect(INVENTORY_MODES).toEqual(['BATCH', 'INDIVIDUAL_SLAB']);
    expect(INVENTORY_STATUSES).toEqual(['DRAFT', 'AVAILABLE', 'HOLD', 'DEPLETED', 'ARCHIVED']);
    expect(MOVEMENT_TYPES).toEqual(['RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'TRANSFER']);
    expect(ADJUSTMENT_DIRECTIONS).toEqual(['IN', 'OUT']);
  });

  it('generates the immutable batch reference format', () => {
    expect(formatInventoryReference('BAT', NOW, 42)).toBe('BAT-2026-0042');
  });

  it('uses India-local calendar year for references', () => {
    const utcStillPreviousYear = new Date('2025-12-31T20:00:00.000Z');
    expect(formatInventoryReference('SLB', utcStillPreviousYear, 1)).toBe('SLB-2026-0001');
  });

  it('allocates references through one atomic counter increment', async () => {
    const CounterModel = { findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 7 }) };
    await expect(nextInventoryReference('BAT', NOW, CounterModel)).resolves.toBe('BAT-2026-0007');
    expect(CounterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'bat_2026' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true },
    );
  });
});

describe('inventory pure calculations and normalization', () => {
  it('calculates slab square feet from millimetres', () => {
    expect(AREA_SQ_MM_PER_SQ_FT).toBe(92903.04);
    expect(squareFeetFromMillimetres(1000, 1000)).toBeCloseTo(10.7639, 4);
  });

  it('rejects zero or negative slab dimensions', () => {
    expect(() => squareFeetFromMillimetres(0, 1000)).toThrow(InventoryError);
    expect(() => squareFeetFromMillimetres(-1, 1000)).toThrow('greater than zero');
  });

  it('resolves a canonical catalog snapshot without copying marketing fields', () => {
    const snapshot = canonicalStoneSnapshot({ stoneId: '1', name: 'Forged name', price: 1 });
    expect(snapshot).toEqual(stoneRef);
    expect(snapshot).not.toHaveProperty('price');
    expect(snapshot.name).not.toBe('Forged name');
  });

  it('rejects missing and mismatched catalog references', () => {
    expect(() => canonicalStoneSnapshot({ stoneId: 'missing' })).toThrow('does not exist');
    expect(() => canonicalStoneSnapshot({
      stoneId: '1',
      slug: 'tandur-yellow-pool-coping',
    })).toThrow('does not exist');
  });

  it('normalizes lightweight locations and compares them case-insensitively', () => {
    const location = normalizeInventoryLocation({ warehouse: ' Main Yard ', zone: ' A ' });
    expect(location).toEqual({ warehouse: 'Main Yard', zone: 'A' });
    expect(locationsEqual(location, { warehouse: 'main yard', zone: 'a' })).toBe(true);
  });

  it('calculates cost value only when area, rate and currency exist', () => {
    expect(inventoryCostValue(100, { costPerSqFt: 42.25, currency: 'inr' })).toEqual({
      currency: 'INR',
      amount: 4225,
    });
    expect(inventoryCostValue(undefined, { costPerSqFt: 42, currency: 'INR' })).toBeNull();
    expect(inventoryCostValue(100, undefined)).toBeNull();
  });

  it('bounds pagination without accepting invalid page values', () => {
    expect(normalizeInventoryPagination(2, 999)).toEqual({ page: 2, limit: 100 });
    expect(() => normalizeInventoryPagination(0, 20)).toThrow('greater than zero');
  });
});

describe('batch creation', () => {
  it('creates a batch and its initial receipt movement', async () => {
    const models = createModels();
    const result = await createInventoryBatch({ input: baseCreateInput(), actor: ACTOR, now: NOW, models });

    expect(result.batch.batchNumber).toBe('BAT-2026-0001');
    expect(models.InventoryBatchModel.create).toHaveBeenCalledWith(expect.objectContaining({
      batchNumber: 'BAT-2026-0001',
      stoneRef,
      inventoryMode: 'BATCH',
      createdBy: ACTOR,
    }));
    expect(models.InventoryMovementModel.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'RECEIPT',
      batch: BATCH_ID,
      quantityDelta: 10,
      areaDeltaSqFt: 100,
      actor: ACTOR,
    }));
    expect(result.movements).toHaveLength(1);
  });

  it('rejects negative received quantity and area before persistence', async () => {
    const models = createModels();
    await expect(createInventoryBatch({
      input: baseCreateInput({ quantity: { receivedCount: -1 } }), actor: ACTOR, models,
    })).rejects.toThrow('zero or greater');
    await expect(createInventoryBatch({
      input: baseCreateInput({ area: { receivedSqFt: -1 } }), actor: ACTOR, models,
    })).rejects.toThrow('zero or greater');
    expect(models.InventoryBatchModel.create).not.toHaveBeenCalled();
  });

  it('requires cost currency and never fabricates a default', async () => {
    await expect(createInventoryBatch({
      input: baseCreateInput({ cost: { costPerSqFt: 50 } }),
      actor: ACTOR,
      models: createModels(),
    })).rejects.toThrow('Currency is required');
  });

  it('creates an empty individual-slab shell without phantom stock or movement', async () => {
    const individualBatch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB',
      quantity: { receivedCount: 0, currentCount: 0 },
      area: undefined,
      location: undefined,
      status: 'DRAFT',
    });
    const models = createModels({ batch: individualBatch });
    const result = await createInventoryBatch({
      input: baseCreateInput({
        inventoryMode: 'INDIVIDUAL_SLAB',
        quantity: { receivedCount: 0 },
        area: undefined,
        location: undefined,
      }),
      actor: ACTOR,
      models,
    });

    expect(result.movements).toEqual([]);
    expect(models.InventoryMovementModel.create).not.toHaveBeenCalled();
    expect(models.InventoryBatchModel.create).toHaveBeenCalledWith(expect.objectContaining({
      status: 'DRAFT',
      quantity: { receivedCount: 0, currentCount: 0 },
    }));
  });

  it('rejects aggregate stock on individual-slab creation to prevent double counting', async () => {
    await expect(createInventoryBatch({
      input: baseCreateInput({
        inventoryMode: 'INDIVIDUAL_SLAB',
        quantity: { receivedCount: 2 },
        area: undefined,
        location: undefined,
      }),
      actor: ACTOR,
      models: createModels(),
    })).rejects.toThrow('created from actual slab receipts');
  });
});

describe('inventory adjustments and transfers', () => {
  it('records an adjustment-in after the atomic batch balance update', async () => {
    const original = batchDocument();
    const updated = batchDocument({
      quantity: { receivedCount: 10, currentCount: 12 },
      area: { receivedSqFt: 100, availableSqFt: 120, basis: 'VERIFIED' },
    });
    const models = createModels({ batch: original });
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(updated);

    const result = await adjustInventoryStock({
      batchId: BATCH_ID,
      direction: 'IN',
      quantity: 2,
      areaSqFt: 20,
      reason: 'Verified physical count correction',
      actor: ACTOR,
      now: NOW,
      models,
    });

    expect(result.batch.quantity.currentCount).toBe(12);
    expect(models.InventoryMovementModel.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'ADJUSTMENT_IN',
      quantityDelta: 2,
      areaDeltaSqFt: 20,
      balanceAfter: { quantity: 12, areaSqFt: 120 },
    }));
  });

  it('rejects an adjustment-out when the guarded update cannot preserve nonnegative stock', async () => {
    const models = createModels();
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(null);
    await expect(adjustInventoryStock({
      batchId: BATCH_ID,
      direction: 'OUT',
      quantity: 11,
      reason: 'Physical correction',
      actor: ACTOR,
      models,
    })).rejects.toMatchObject({ status: 409 });
    expect(models.InventoryMovementModel.create).not.toHaveBeenCalled();
  });

  it('requires both a server actor and an adjustment reason', async () => {
    await expect(adjustInventoryStock({
      batchId: BATCH_ID,
      direction: 'IN',
      quantity: 1,
      reason: 'Correction',
      actor: '',
      models: createModels(),
    })).rejects.toMatchObject({ status: 401 });
    await expect(adjustInventoryStock({
      batchId: BATCH_ID,
      direction: 'IN',
      quantity: 1,
      reason: '',
      actor: ACTOR,
      models: createModels(),
    })).rejects.toThrow('reason is required');
  });

  it('moves a whole batch and records a zero-delta transfer', async () => {
    const original = batchDocument();
    const updated = batchDocument({ location: { warehouse: 'Overflow Yard', zone: 'B' } });
    const models = createModels({ batch: original });
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(updated);

    const result = await transferInventory({
      batchId: BATCH_ID,
      toLocation: { warehouse: 'Overflow Yard', zone: 'B' },
      reason: 'Yard reorganization',
      actor: ACTOR,
      now: NOW,
      models,
    });

    expect(result.batch.location.warehouse).toBe('Overflow Yard');
    expect(models.InventoryMovementModel.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'TRANSFER',
      quantityDelta: 0,
      areaDeltaSqFt: 0,
      fromLocation: original.location,
      toLocation: { warehouse: 'Overflow Yard', zone: 'B' },
    }));
  });

  it('rejects a no-op transfer', async () => {
    await expect(transferInventory({
      batchId: BATCH_ID,
      toLocation: { warehouse: 'main yard', zone: 'a', rack: '1' },
      reason: 'No move',
      actor: ACTOR,
      models: createModels(),
    })).rejects.toThrow('same');
  });
});

describe('individual slab inventory', () => {
  it('creates a stable slab receipt and calculates its area', async () => {
    const emptyBatch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB',
      quantity: { receivedCount: 0, currentCount: 0 },
      area: undefined,
      location: undefined,
      status: 'DRAFT',
    });
    const createdSlab = {
      _id: SLAB_ID,
      slabNumber: 'SLB-2026-0001',
      grossAreaSqFt: squareFeetFromMillimetres(2400, 1200),
      location: { warehouse: 'Main Yard', rack: 'S1' },
    };
    const updatedBatch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB',
      quantity: { receivedCount: 1, currentCount: 1 },
      area: {
        receivedSqFt: createdSlab.grossAreaSqFt,
        availableSqFt: createdSlab.grossAreaSqFt,
        basis: 'CALCULATED',
      },
      location: undefined,
    });
    const models = createModels({ batch: emptyBatch, slab: createdSlab });
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(updatedBatch);

    const result = await createInventorySlab({
      batchId: BATCH_ID,
      input: {
        dimensions: { lengthMm: 2400, widthMm: 1200, thicknessMm: 20 },
        location: { warehouse: 'Main Yard', rack: 'S1' },
      },
      actor: ACTOR,
      now: NOW,
      models,
    });

    expect(models.SlabModel.create).toHaveBeenCalledWith(expect.objectContaining({
      slabNumber: 'SLB-2026-0001',
      batch: BATCH_ID,
      grossAreaSqFt: expect.closeTo(31.0001, 3),
      stoneRef,
    }));
    expect(models.InventoryMovementModel.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'RECEIPT',
      slab: SLAB_ID,
      quantityDelta: 1,
    }));
    expect(result.slab.slabNumber).toBe('SLB-2026-0001');
  });

  it('scopes individual adjustments to a slab belonging to the selected batch', async () => {
    const batch = batchDocument({ inventoryMode: 'INDIVIDUAL_SLAB', location: undefined });
    const models = createModels({ batch });
    models.SlabModel.findOne.mockResolvedValue(null);
    await expect(adjustInventoryStock({
      batchId: BATCH_ID,
      slabId: SLAB_ID,
      direction: 'OUT',
      reason: 'Physical damage correction',
      actor: ACTOR,
      models,
    })).rejects.toMatchObject({ status: 404, code: 'SLAB_NOT_FOUND' });
    expect(models.SlabModel.findOne).toHaveBeenCalledWith({ _id: SLAB_ID, batch: BATCH_ID });
  });

  it('does not allow silent slab status changes through metadata updates', async () => {
    const slab = {
      _id: SLAB_ID,
      batch: BATCH_ID,
      status: 'AVAILABLE',
      save: vi.fn(),
    };
    const models = createModels({ slab });
    await expect(updateInventorySlab({
      slabId: SLAB_ID,
      updates: { status: 'HOLD' },
      actor: ACTOR,
      models,
    })).rejects.toThrow('Unsupported slab field');
    expect(slab.save).not.toHaveBeenCalled();
  });
});

describe('integrity, reporting and query safety', () => {
  it('rejects balance and location mass assignment in batch metadata updates', async () => {
    await expect(updateInventoryBatch({
      batchId: BATCH_ID,
      updates: { quantity: { currentCount: 999 } },
      actor: ACTOR,
      models: createModels(),
    })).rejects.toThrow('Unsupported batch field');
    await expect(updateInventoryBatch({
      batchId: BATCH_ID,
      updates: { location: { warehouse: 'Silent move' } },
      actor: ACTOR,
      models: createModels(),
    })).rejects.toThrow('Unsupported batch field');
  });

  it('rejects archiving a batch that still holds stock', async () => {
    await expect(updateInventoryBatch({
      batchId: BATCH_ID,
      updates: { status: 'ARCHIVED' },
      actor: ACTOR,
      models: createModels(),
    })).rejects.toMatchObject({ status: 409 });
  });

  it('returns valuation totals separated by currency', async () => {
    const models = createModels();
    models.InventoryBatchModel.aggregate.mockResolvedValue([{
      metrics: [{
        activeBatches: 4,
        availableBatches: 3,
        depletedBatches: 1,
        availableAreaTrackedBatches: 3,
        totalAvailableSqFt: 321.45678,
      }],
      inventoryCostValues: [
        { _id: 'INR', amount: 12345.678, batches: 2 },
        { _id: 'USD', amount: 999.9, batches: 1 },
      ],
    }]);
    models.SlabModel.countDocuments.mockResolvedValue(7);

    await expect(getInventorySummary({ models })).resolves.toEqual({
      activeBatches: 4,
      availableBatches: 3,
      availableAreaTrackedBatches: 3,
      totalAvailableSqFt: 321.4568,
      individualSlabs: 7,
      depletedOrZeroStockBatches: 1,
      depletedBatches: 1,
      inventoryCostValues: [
        { currency: 'INR', amount: 12345.68, batches: 2 },
        { currency: 'USD', amount: 999.9, batches: 1 },
      ],
    });
  });

  it('returns null available area when no available batch has an area measurement', async () => {
    const models = createModels();
    models.InventoryBatchModel.aggregate.mockResolvedValue([{
      metrics: [{ activeBatches: 2, availableBatches: 2, availableAreaTrackedBatches: 0 }],
      inventoryCostValues: [],
    }]);
    models.SlabModel.countDocuments.mockResolvedValue(0);

    const summary = await getInventorySummary({ models });
    expect(summary.availableAreaTrackedBatches).toBe(0);
    expect(summary.totalAvailableSqFt).toBeNull();
  });

  it('escapes inventory search regex and clamps list page size', async () => {
    let capturedFilter;
    const query = {};
    query.sort = vi.fn(() => query);
    query.skip = vi.fn(() => query);
    query.limit = vi.fn(() => query);
    query.lean = vi.fn(() => Promise.resolve([]));
    const models = createModels();
    models.InventoryBatchModel.find = vi.fn((filter) => {
      capturedFilter = filter;
      return query;
    });
    models.InventoryBatchModel.countDocuments.mockResolvedValue(0);

    const result = await listInventoryBatches({ search: 'BAT.*', page: 1, limit: 1000, models });
    expect(result).toEqual({ batches: [], total: 0, page: 1, pages: 1 });
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(capturedFilter.$or[0].batchNumber.source).toBe('BAT\\.\\*');
  });

  it('marks stable batch and slab reference fields immutable at schema level', () => {
    expect(InventoryBatch.schema.path('batchNumber').options.immutable).toBe(true);
    expect(Slab.schema.path('slabNumber').options.immutable).toBe(true);
    expect(Slab.schema.path('batch').options.immutable).toBe(true);
  });

  it('rejects negative and fractional batch counts at schema validation', async () => {
    const batch = new InventoryBatch({
      batchNumber: 'BAT-2026-0099',
      stoneRef,
      inventoryMode: 'BATCH',
      receivedDate: NOW,
      quantity: { receivedCount: 1.5, currentCount: -1 },
      location: { warehouse: 'Test Yard' },
      status: 'AVAILABLE',
      createdBy: ACTOR,
    });
    await expect(batch.validate()).rejects.toMatchObject({ name: 'ValidationError' });
  });

  it('rejects slab usable area above its calculated gross area', async () => {
    const slab = new Slab({
      slabNumber: 'SLB-2026-0099',
      batch: BATCH_ID,
      stoneRef,
      dimensions: { lengthMm: 1000, widthMm: 1000 },
      grossAreaSqFt: 10.7639,
      usableAreaSqFt: 11,
      status: 'AVAILABLE',
      location: { warehouse: 'Test Yard' },
      createdBy: ACTOR,
    });
    await expect(slab.validate()).rejects.toThrow('Usable area cannot exceed gross area');
  });

  it('rejects a transfer movement without both location snapshots', async () => {
    const movement = new InventoryMovement({
      type: 'TRANSFER',
      inventoryMode: 'BATCH',
      batch: BATCH_ID,
      quantityDelta: 0,
      areaDeltaSqFt: 0,
      fromLocation: { warehouse: 'Test Yard' },
      reason: 'Test transfer',
      actor: ACTOR,
      occurredAt: NOW,
    });
    await expect(movement.validate()).rejects.toThrow('source and destination');
  });

  it('blocks updates and deletes through movement model middleware', async () => {
    await expect(InventoryMovement.updateOne({}, { $set: { reason: 'rewrite' } })).rejects.toThrow('append-only');
    await expect(InventoryMovement.findOneAndReplace({}, {})).rejects.toThrow('append-only');
    await expect(InventoryMovement.deleteOne({})).rejects.toThrow('append-only');
    await expect(InventoryMovement.bulkWrite([{ deleteOne: { filter: {} } }])).rejects.toThrow('append-only');

    const movement = new InventoryMovement({
      type: 'RECEIPT',
      inventoryMode: 'BATCH',
      batch: BATCH_ID,
      quantityDelta: 1,
      areaDeltaSqFt: 0,
      toLocation: { warehouse: 'Test Yard' },
      reason: 'Test receipt',
      actor: ACTOR,
    });
    await expect(movement.deleteOne()).rejects.toThrow('append-only');
  });
});
