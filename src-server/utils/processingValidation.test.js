import { describe, expect, it } from 'vitest';
import {
  parseProcessingEventListQuery,
  parseProcessingListQuery,
  validateProcessingCancellation,
  validateProcessingEmptyAction,
  validateProcessingJobCreate,
  validateProcessingJobUpdate,
  validateProcessingNote,
  validateProcessingOperationAction,
  validateProcessingQualityCheck,
} from './processingValidation.js';

const BATCH_ID = '507f1f77bcf86cd799439011';
const SLAB_ID_1 = '507f191e810c19729de860ea';
const SLAB_ID_2 = '507f191e810c19729de860eb';

function validCreate(overrides = {}) {
  return {
    inventoryMode: 'BATCH',
    input: { batchId: BATCH_ID },
    target: { finish: 'Honed', thicknessMm: 20 },
    routing: [
      { operation: 'CALIBRATION', plannedStart: '2026-10-10', plannedEnd: '2026-10-11' },
      { operation: 'HONING', machineLabel: 'Honing line' },
    ],
    expectedCompletionDate: '2026-10-12',
    notes: 'Process after calibration inspection.',
    ...overrides,
  };
}

describe('processing job validation', () => {
  it('normalizes a valid batch job and derives routing sequence from array order', () => {
    const parsed = validateProcessingJobCreate(validCreate());

    expect(parsed.error).toBeUndefined();
    expect(parsed.value).toMatchObject({
      inventoryMode: 'BATCH',
      input: { batchId: BATCH_ID },
      target: { finish: 'Honed', thicknessMm: 20 },
      routing: [
        { operation: 'CALIBRATION', sequence: 1 },
        { operation: 'HONING', sequence: 2, machineLabel: 'Honing line' },
      ],
    });
  });

  it('requires mode-appropriate source inventory and unique slab IDs', () => {
    expect(validateProcessingJobCreate(validCreate({
      input: { batchId: BATCH_ID, slabIds: [] },
    })).error).toMatch(/must not include slab IDs/i);

    expect(validateProcessingJobCreate(validCreate({
      inventoryMode: 'INDIVIDUAL_SLAB',
      input: { batchId: BATCH_ID },
    })).error).toMatch(/require slab IDs/i);

    expect(validateProcessingJobCreate(validCreate({
      inventoryMode: 'INDIVIDUAL_SLAB',
      input: { batchId: BATCH_ID, slabIds: [SLAB_ID_1, SLAB_ID_1] },
    })).error).toMatch(/must be unique/i);

    const parsed = validateProcessingJobCreate(validCreate({
      inventoryMode: 'individual_slab',
      input: { batchId: BATCH_ID, slabIds: [SLAB_ID_1, SLAB_ID_2] },
    }));
    expect(parsed.value.input.slabIds).toEqual([SLAB_ID_1, SLAB_ID_2]);
  });

  it('rejects malformed IDs, unbounded slab selections and server-owned fields', () => {
    expect(validateProcessingJobCreate(validCreate({
      input: { batchId: 'not-an-object-id' },
    })).error).toMatch(/Batch ID is invalid/i);

    expect(validateProcessingJobCreate(validCreate({
      inventoryMode: 'INDIVIDUAL_SLAB',
      input: { batchId: BATCH_ID, slabIds: Array.from({ length: 501 }, () => SLAB_ID_1) },
    })).error).toMatch(/between 1 and 500/i);

    for (const field of ['status', 'jobNumber', 'stoneSnapshot', 'currentOperation', 'output', 'actor']) {
      expect(validateProcessingJobCreate({ ...validCreate(), [field]: 'forged' }).error)
        .toMatch(new RegExp(`Unsupported processing job field: ${field}`, 'i'));
    }
  });

  it('requires a meaningful target and controlled, bounded routing', () => {
    expect(validateProcessingJobCreate(validCreate({ target: {} })).error)
      .toMatch(/at least one processing outcome/i);
    expect(validateProcessingJobCreate(validCreate({ routing: [] })).error)
      .toMatch(/between 1 and 25/i);
    expect(validateProcessingJobCreate(validCreate({
      routing: [{ operation: 'LASER_ETCHING' }],
    })).error).toMatch(/Operation 1 is invalid/i);
    expect(validateProcessingJobCreate(validCreate({
      routing: [{ operation: 'CUTTING', status: 'COMPLETED' }],
    })).error).toMatch(/Unsupported routing operation 1 field: status/i);
  });

  it('validates real calendar dates, canonical date-times and route date order', () => {
    expect(validateProcessingJobCreate(validCreate({ expectedCompletionDate: '2026-02-30' })).error)
      .toMatch(/valid ISO date/i);
    expect(validateProcessingJobCreate(validCreate({ expectedCompletionDate: '2026-02-30T10:00:00Z' })).error)
      .toMatch(/valid ISO date/i);
    expect(validateProcessingJobCreate(validCreate({
      routing: [{
        operation: 'CUTTING',
        plannedStart: '2026-10-11T10:00:00+05:30',
        plannedEnd: '2026-10-10T10:00:00+05:30',
      }],
    })).error).toMatch(/must not be before/i);
    expect(validateProcessingJobCreate(validCreate({
      routing: [{ operation: 'CUTTING', plannedStart: '2026-10-10T10:00' }],
    })).value.routing[0].plannedStart).toBe('2026-10-10T10:00Z');
    expect(validateProcessingJobCreate(validCreate({
      routing: [{ operation: 'CUTTING', plannedStart: '2026-10-10T25:00' }],
    })).error).toMatch(/valid ISO date/i);
  });

  it('permits only explicit metadata fields in PATCH and rejects empty updates', () => {
    expect(validateProcessingJobUpdate({ notes: 'Updated production note.' }).value)
      .toEqual({ notes: 'Updated production note.' });
    expect(validateProcessingJobUpdate({ input: { batchId: BATCH_ID } }).error)
      .toMatch(/Unsupported processing job update field: input/i);
    expect(validateProcessingJobUpdate({ status: 'COMPLETED' }).error)
      .toMatch(/Unsupported processing job update field: status/i);
    expect(validateProcessingJobUpdate({}).error).toMatch(/At least one permitted/i);
  });
});

describe('processing list and action validation', () => {
  it('normalizes controlled filters and bounded pagination', () => {
    const parsed = parseProcessingListQuery({
      page: '2',
      limit: '100',
      search: ' PJ.* ',
      status: 'in_progress',
      operation: 'honing',
      stoneSlug: 'tandur-yellow-limestone-cobble-premium',
    });

    expect(parsed.value).toMatchObject({
      page: 2,
      limit: 100,
      search: 'PJ.*',
      status: 'IN_PROGRESS',
      operation: 'HONING',
      stoneSlug: 'tandur-yellow-limestone-cobble-premium',
    });
    expect(parseProcessingListQuery({ limit: '101' }).error).toMatch(/must not exceed 100/i);
    expect(parseProcessingListQuery({ sort: 'unsafe' }).error).toMatch(/Unsupported query field/i);
    expect(parseProcessingEventListQuery({})).toEqual({ value: { page: 1, limit: 50 } });
  });

  it('accepts only empty plan/start/complete action bodies', () => {
    expect(validateProcessingEmptyAction(undefined)).toEqual({ value: {} });
    expect(validateProcessingEmptyAction({})).toEqual({ value: {} });
    expect(validateProcessingEmptyAction(null).error).toMatch(/JSON object/i);
    expect(validateProcessingEmptyAction({ status: 'IN_PROGRESS' }).error)
      .toMatch(/does not accept request fields/i);
  });

  it('allows only bounded machine and note metadata on operation actions', () => {
    expect(validateProcessingOperationAction({ machineLabel: 'Polishing line 2', notes: 'Verified setup.' }).value)
      .toEqual({ machineLabel: 'Polishing line 2', notes: 'Verified setup.' });
    expect(validateProcessingOperationAction({ actualEnd: '2026-10-10' }).error)
      .toMatch(/Unsupported operation action field/i);
    expect(validateProcessingOperationAction({ machineLabel: 'x'.repeat(161) }).error)
      .toMatch(/must not exceed 160/i);
  });

  it('requires a bounded cancellation reason', () => {
    expect(validateProcessingCancellation({ reason: 'Production has not started; plan withdrawn.' }).value)
      .toEqual({ reason: 'Production has not started; plan withdrawn.' });
    expect(validateProcessingCancellation({}).error).toMatch(/Cancellation reason is required/i);
    expect(validateProcessingCancellation({ reason: 'ok', actor: 'forged' }).error)
      .toMatch(/Unsupported cancellation field/i);
  });

  it('requires a bounded processing note and rejects audit-field injection', () => {
    expect(validateProcessingNote({ note: 'Stone moved to the calibration line.' }).value)
      .toEqual({ note: 'Stone moved to the calibration line.' });
    expect(validateProcessingNote({}).error).toMatch(/Processing note is required/i);
    expect(validateProcessingNote({ note: 'x'.repeat(3001) }).error).toMatch(/must not exceed 3000/i);
    expect(validateProcessingNote({ note: 'Valid', actor: 'forged' }).error)
      .toMatch(/Unsupported processing note field: actor/i);
  });
});

describe('processing quality-check validation', () => {
  it('validates explicit PASS output and unique returned slab results', () => {
    const parsed = validateProcessingQualityCheck({
      result: 'pass',
      verifiedOutput: {
        quantity: 2,
        areaSqFt: 42.75,
        finish: 'Honed',
        slabOutputs: [
          {
            slabId: SLAB_ID_1,
            usableAreaSqFt: 21.25,
            dimensions: { lengthMm: 2400, widthMm: 820, thicknessMm: 20 },
          },
          { slabId: SLAB_ID_2, usableAreaSqFt: 21.5 },
        ],
      },
      observations: 'Finish and dimensions verified.',
    });

    expect(parsed.error).toBeUndefined();
    expect(parsed.value.result).toBe('PASS');
    expect(parsed.value.verifiedOutput.slabOutputs).toHaveLength(2);
  });

  it('requires verified output for PASS but permits HOLD/FAIL without it', () => {
    expect(validateProcessingQualityCheck({ result: 'PASS' }).error)
      .toMatch(/Verified output is required/i);
    expect(validateProcessingQualityCheck({ result: 'HOLD', notes: 'Awaiting rework review.' }).value)
      .toEqual({ result: 'HOLD', notes: 'Awaiting rework review.' });
    expect(validateProcessingQualityCheck({ result: 'FAIL' }).value).toEqual({ result: 'FAIL' });
    expect(validateProcessingQualityCheck({
      result: 'PASS',
      verifiedOutput: { quantity: 3 },
    }).value.verifiedOutput).toEqual({ quantity: 3 });
  });

  it('rejects impossible numeric shapes and duplicate slab outputs', () => {
    expect(validateProcessingQualityCheck({
      result: 'PASS',
      verifiedOutput: { quantity: 1.5, areaSqFt: 10 },
    }).error).toMatch(/whole number/i);
    expect(validateProcessingQualityCheck({
      result: 'PASS',
      verifiedOutput: { quantity: 1, areaSqFt: -1 },
    }).error).toMatch(/at least 0/i);
    expect(validateProcessingQualityCheck({
      result: 'PASS',
      verifiedOutput: {
        quantity: 2,
        areaSqFt: 10,
        slabOutputs: [
          { slabId: SLAB_ID_1, usableAreaSqFt: 5 },
          { slabId: SLAB_ID_1, usableAreaSqFt: 5 },
        ],
      },
    }).error).toMatch(/Slab output IDs must be unique/i);
    expect(validateProcessingQualityCheck({
      result: 'PASS',
      verifiedOutput: {
        quantity: 1,
        areaSqFt: 10,
        slabOutputs: [{ slabId: SLAB_ID_1 }],
      },
    }).error).toMatch(/usable area is required/i);
  });
});
