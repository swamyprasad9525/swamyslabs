import { describe, expect, it } from 'vitest';
import {
  parseInventoryChildListQuery,
  parseInventoryListQuery,
  validateInventoryAdjustment,
  validateInventoryBatchCreate,
  validateInventoryBatchUpdate,
  validateInventorySlabCreate,
  validateInventorySlabUpdate,
  validateInventoryTransfer,
} from './inventoryValidation.js';

const batchInput = (overrides = {}) => ({
  stoneSlug: 'tandur-yellow-limestone-cobble-premium',
  inventoryMode: 'BATCH',
  receivedDate: '2026-10-09',
  receivedCount: 20,
  location: { warehouse: 'Main yard', zone: 'A', rack: '01' },
  ...overrides,
});

describe('inventory list validation', () => {
  it('applies bounded pagination defaults and canonicalizes a stone filter', () => {
    const result = parseInventoryListQuery({ stone: 'tandur-yellow-limestone-cobble-premium' });
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      page: 1,
      limit: 20,
      stoneSlug: 'tandur-yellow-limestone-cobble-premium',
    });
  });

  it('rejects pagination above the maximum', () => {
    expect(parseInventoryListQuery({ limit: '101' }).error).toMatch(/Limit/);
    expect(parseInventoryListQuery({ page: '0' }).error).toMatch(/Page/);
  });

  it('rejects unsupported and invalid controlled filters', () => {
    expect(parseInventoryListQuery({ status: 'RESERVED' }).error).toMatch(/Status/);
    expect(parseInventoryListQuery({ stone: 'not-a-catalog-stone' }).error).toMatch(/Stone/);
    expect(parseInventoryListQuery({ internal: 'true' }).error).toMatch(/Unsupported/);
  });

  it('bounds movement and slab history pagination', () => {
    expect(parseInventoryChildListQuery({ page: '2', limit: '50' }).value).toEqual({ page: 2, limit: 50 });
    expect(parseInventoryChildListQuery({ limit: '500' }).error).toMatch(/Limit/);
  });
});

describe('inventory batch validation', () => {
  it('creates only a canonical catalog identity snapshot', () => {
    const result = validateInventoryBatchCreate(batchInput());
    expect(result.error).toBeUndefined();
    expect(result.value.stoneRef).toEqual({
      stoneId: '1',
      slug: 'tandur-yellow-limestone-cobble-premium',
      name: 'Tandur Yellow Limestone Cobble (Premium)',
      materialFamily: 'Limestone',
    });
    expect(result.value.stoneRef).not.toHaveProperty('price');
    expect(result.value.stoneRef).not.toHaveProperty('finish');
  });

  it('rejects invalid or conflicting catalog references', () => {
    expect(validateInventoryBatchCreate(batchInput({ stoneSlug: 'unknown-stone' })).error).toMatch(/Stone reference/);
    expect(validateInventoryBatchCreate(batchInput({ stoneId: '2' })).error).toMatch(/Stone reference/);
  });

  it('rejects negative and empty opening stock', () => {
    expect(validateInventoryBatchCreate(batchInput({ receivedCount: -1 })).error).toMatch(/Received count/);
    expect(validateInventoryBatchCreate(batchInput({ receivedCount: 0, receivedSqFt: -1 })).error).toMatch(/Received area/);
    expect(validateInventoryBatchCreate(batchInput({ receivedCount: 0, receivedSqFt: 0 })).error).toMatch(/positive/);
  });

  it('requires a controlled mode and a batch location', () => {
    expect(validateInventoryBatchCreate(batchInput({ inventoryMode: 'PALLET' })).error).toMatch(/Inventory mode/);
    expect(validateInventoryBatchCreate(batchInput({ location: undefined })).error).toMatch(/Location/);
  });

  it('creates an empty individual-slab shell without batch stock or location', () => {
    const locatedIndividualInput = batchInput({ inventoryMode: 'INDIVIDUAL_SLAB' });
    delete locatedIndividualInput.receivedCount;
    const result = validateInventoryBatchCreate(locatedIndividualInput);
    expect(result.error).toMatch(/locations must be recorded on each slab/);

    const individualInput = batchInput({
      inventoryMode: 'INDIVIDUAL_SLAB',
      location: undefined,
    });
    delete individualInput.receivedCount;
    const valid = validateInventoryBatchCreate(individualInput);
    expect(valid.error).toBeUndefined();
    expect(valid.value).toMatchObject({ inventoryMode: 'INDIVIDUAL_SLAB' });
    expect(valid.value).not.toHaveProperty('receivedCount');
    expect(valid.value).not.toHaveProperty('location');
    expect(validateInventoryBatchCreate(batchInput({
      inventoryMode: 'INDIVIDUAL_SLAB',
      receivedCount: 1,
      location: undefined,
    })).error).toMatch(/must omit received count/);
    expect(validateInventoryBatchCreate(batchInput({
      inventoryMode: 'INDIVIDUAL_SLAB',
      receivedCount: 0,
      location: undefined,
    })).error).toMatch(/must omit received count/);
    const statusInput = batchInput({
      inventoryMode: 'INDIVIDUAL_SLAB',
      location: undefined,
      status: 'HOLD',
    });
    delete statusInput.receivedCount;
    expect(validateInventoryBatchCreate(statusInput).error).toMatch(/status is derived/);
  });

  it('validates dates, dimensions, and costs without inventing defaults', () => {
    expect(validateInventoryBatchCreate(batchInput({ receivedDate: '2026-02-30' })).error).toMatch(/valid date/);
    expect(validateInventoryBatchCreate(batchInput({ nominalDimensions: { lengthMm: 2000 } })).error).toMatch(/together/);
    expect(validateInventoryBatchCreate(batchInput({ nominalDimensions: { lengthMm: -1, widthMm: 1000 } })).error).toMatch(/greater than zero/);
    expect(validateInventoryBatchCreate(batchInput({ cost: { costPerSqFt: 25 } })).error).toMatch(/together/);

    const valid = validateInventoryBatchCreate(batchInput({
      cost: { costPerSqFt: 25, currency: 'inr' },
      selling: { pricePerSqFt: 40, currency: 'usd' },
    }));
    expect(valid.value.cost).toEqual({ costPerSqFt: 25, currency: 'INR' });
    expect(valid.value.selling).toEqual({ pricePerSqFt: 40, currency: 'USD' });
  });

  it('prevents unsafe or nonsensical creation statuses', () => {
    expect(validateInventoryBatchCreate(batchInput({ status: 'DEPLETED' })).error).toMatch(/Status/);
    expect(validateInventoryBatchCreate(batchInput({ status: 'ARCHIVED' })).error).toMatch(/Status/);
    expect(validateInventoryBatchCreate(batchInput({ status: 'HOLD' })).value.status).toBe('HOLD');
  });

  it('uses an explicit batch update allowlist', () => {
    for (const forbidden of ['batchNumber', 'stoneRef', 'stoneSlug', 'inventoryMode', 'receivedCount', 'receivedSqFt', 'quantity', 'area', 'location']) {
      expect(validateInventoryBatchUpdate({ [forbidden]: 'attempted-change' }).error).toMatch(/Unsupported/);
    }
    expect(validateInventoryBatchUpdate({ finish: 'Honed', status: 'HOLD' }).value).toEqual({
      finish: 'Honed',
      status: 'HOLD',
    });
  });

  it('does not permit manually setting derived batch statuses', () => {
    expect(validateInventoryBatchUpdate({ status: 'DEPLETED' }).error).toMatch(/Status/);
    expect(validateInventoryBatchUpdate({ status: 'DRAFT' }).error).toMatch(/Status/);
    expect(validateInventoryBatchUpdate({ status: 'ARCHIVED' }).value.status).toBe('ARCHIVED');
  });
});

describe('inventory action validation', () => {
  it('accepts a reasoned batch adjustment in either direction', () => {
    expect(validateInventoryAdjustment({ direction: 'IN', quantity: 2, reason: 'Physical count correction' }).value)
      .toMatchObject({ direction: 'IN', quantity: 2 });
    expect(validateInventoryAdjustment({ direction: 'OUT', areaSqFt: 12.5, reason: 'Damaged material' }).value)
      .toMatchObject({ direction: 'OUT', areaSqFt: 12.5 });
  });

  it('rejects invalid, negative, unreasoned, or empty adjustments', () => {
    expect(validateInventoryAdjustment({ direction: 'SIDEWAYS', quantity: 1, reason: 'Test' }).error).toMatch(/direction/);
    expect(validateInventoryAdjustment({ direction: 'OUT', quantity: -1, reason: 'Test' }).error).toMatch(/greater than zero/);
    expect(validateInventoryAdjustment({ direction: 'OUT', quantity: 1 }).error).toMatch(/reason/);
    expect(validateInventoryAdjustment({ direction: 'OUT', reason: 'Test' }).error).toMatch(/quantity or area/);
  });

  it('models individual adjustments as a whole slab operation', () => {
    const slabId = '507f1f77bcf86cd799439011';
    expect(validateInventoryAdjustment({ direction: 'OUT', slabId, reason: 'Slab damaged' }).value)
      .toMatchObject({ direction: 'OUT', slabId });
    expect(validateInventoryAdjustment({ direction: 'OUT', slabId, quantity: 1, reason: 'Test' }).error)
      .toMatch(/complete slab/);
  });

  it('accepts only whole-batch or one-slab transfers to a valid destination', () => {
    const wholeBatch = validateInventoryTransfer({
      toLocation: { warehouse: 'Secondary yard', zone: 'B' },
      reason: 'Yard reorganization',
    });
    expect(wholeBatch.value.toLocation.warehouse).toBe('Secondary yard');

    const slab = validateInventoryTransfer({
      slabId: '507f1f77bcf86cd799439011',
      toLocation: { warehouse: 'Secondary yard' },
      reason: 'Move selected slab',
    });
    expect(slab.value.slabId).toBe('507f1f77bcf86cd799439011');
    expect(validateInventoryTransfer({
      quantity: 2,
      toLocation: { warehouse: 'Secondary yard' },
      reason: 'Partial move',
    }).error).toMatch(/Unsupported/);
  });
});

describe('individual slab validation', () => {
  const slabInput = (overrides = {}) => ({
    dimensions: { lengthMm: 2400, widthMm: 1200, thicknessMm: 20 },
    location: { warehouse: 'Main yard', rack: 'R-1' },
    ...overrides,
  });

  it('requires verified positive dimensions and a physical location', () => {
    expect(validateInventorySlabCreate(slabInput()).error).toBeUndefined();
    expect(validateInventorySlabCreate(slabInput({ dimensions: { lengthMm: 2400 } })).error).toMatch(/width/);
    expect(validateInventorySlabCreate(slabInput({ dimensions: { lengthMm: -1, widthMm: 1200 } })).error).toMatch(/greater than zero/);
    expect(validateInventorySlabCreate(slabInput({ location: undefined })).error).toMatch(/location/);
  });

  it('rejects usable area greater than calculated gross area', () => {
    expect(validateInventorySlabCreate(slabInput({ usableAreaSqFt: 100 })).error).toMatch(/gross area/);
    expect(validateInventorySlabCreate(slabInput({ usableAreaSqFt: 30 })).value.usableAreaSqFt).toBe(30);
  });

  it('allows only safe slab metadata and keeps status changes ledger-backed', () => {
    expect(validateInventorySlabUpdate({ grade: 'A', defects: 'Small edge chip' }).value)
      .toEqual({ grade: 'A', defects: 'Small edge chip' });
    expect(validateInventorySlabUpdate({ status: 'HOLD' }).error).toMatch(/Unsupported/);
    expect(validateInventorySlabUpdate({ status: 'DEPLETED' }).error).toMatch(/Unsupported/);
    expect(validateInventorySlabUpdate({ dimensions: { lengthMm: 1, widthMm: 1 } }).error).toMatch(/Unsupported/);
    expect(validateInventorySlabUpdate({ location: { warehouse: 'Other' } }).error).toMatch(/Unsupported/);
  });
});
