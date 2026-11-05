import { describe, expect, it, vi } from 'vitest';
import {
  PROCESSING_EVENT_TYPES,
  PROCESSING_JOB_STATUSES,
  PROCESSING_OPERATION_STATUSES,
  PROCESSING_OPERATION_TYPES,
  PROCESSING_QC_RESULTS,
} from '../constants/processing.js';
import InventoryMovement from '../models/InventoryMovement.js';
import ProcessingEvent from '../models/ProcessingEvent.js';
import ProcessingJob from '../models/ProcessingJob.js';
import {
  ProcessingError,
  addProcessingNote,
  calculateProcessingOutcome,
  calculateProcessingProgress,
  cancelProcessingJob,
  completeProcessingJob,
  completeProcessingOperation,
  createProcessingJob,
  formatProcessingJobReference,
  getProcessingSummary,
  linkProcessingJobToSalesOrder,
  listProcessingEvents,
  listProcessingJobs,
  planProcessingJob,
  recordProcessingQC,
  startProcessingJob,
  startProcessingOperation,
  updateProcessingJob,
} from './processingService.js';
import {
  createInventorySlab,
  issueInventoryToProcessing,
  returnInventoryFromProcessing,
  updateInventoryBatch,
} from './inventoryService.js';

const JOB_ID = '507f1f77bcf86cd799439021';
const BATCH_ID = '507f1f77bcf86cd799439011';
const SLAB_ONE = '507f191e810c19729de860e1';
const SLAB_TWO = '507f191e810c19729de860e2';
const OP_ONE = '507f191e810c19729de86101';
const OP_TWO = '507f191e810c19729de86102';
const ACTOR = 'authenticated-admin';
const SALES_ORDER_ID = '507f1f77bcf86cd799439031';
const SALES_ORDER_LINE_ID = '507f1f77bcf86cd799439032';
const NOW = new Date('2026-10-09T10:00:00.000Z');
const SESSION = { id: 'test-session', inTransaction: () => true };

const stoneSnapshot = {
  stoneId: '1',
  slug: 'tandur-yellow-limestone-cobble-premium',
  name: 'Tandur Yellow Limestone Cobble (Premium)',
  materialFamily: 'Limestone',
};

function operation(sequence = 1, status = 'PENDING', overrides = {}) {
  return {
    _id: sequence === 1 ? OP_ONE : OP_TWO,
    operation: sequence === 1 ? 'CUTTING' : 'HONING',
    sequence,
    status,
    ...overrides,
  };
}

function batchDocument(overrides = {}) {
  return {
    _id: BATCH_ID,
    batchNumber: 'BAT-2026-0001',
    stoneRef: stoneSnapshot,
    inventoryMode: 'BATCH',
    quantity: { receivedCount: 10, currentCount: 10 },
    area: { receivedSqFt: 100, availableSqFt: 100, basis: 'VERIFIED' },
    finish: 'Raw',
    thicknessMm: 20,
    location: { warehouse: 'Main Yard', zone: 'A' },
    status: 'AVAILABLE',
    activeProcessingJob: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function slabDocument(id, number, overrides = {}) {
  return {
    _id: id,
    slabNumber: number,
    batch: BATCH_ID,
    stoneRef: stoneSnapshot,
    finish: 'Raw',
    dimensions: { lengthMm: 1000, widthMm: 929.0304, thicknessMm: 20 },
    grossAreaSqFt: 10,
    usableAreaSqFt: 10,
    location: { warehouse: 'Main Yard', rack: number },
    status: 'AVAILABLE',
    activeProcessingJob: null,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function jobDocument(overrides = {}) {
  return {
    _id: JOB_ID,
    jobNumber: 'PJ-2026-0001',
    status: 'DRAFT',
    stoneSnapshot,
    inventoryMode: 'BATCH',
    input: { batchId: BATCH_ID, batchNumber: 'BAT-2026-0001' },
    target: { finish: 'Honed' },
    routing: [operation(1), operation(2)],
    currentOperation: undefined,
    qualityCheck: undefined,
    save: vi.fn().mockResolvedValue(undefined),
    markModified: vi.fn(),
    ...overrides,
  };
}

function createModels({ batch, slabs, job } = {}) {
  const sourceBatch = batch || batchDocument();
  const sourceSlabs = slabs || [];
  const processingJob = job || jobDocument();
  const eventCreate = vi.fn(async ([document]) => [{ _id: '507f191e810c19729de86201', ...document }]);
  const movementCreate = vi.fn(async (value) => {
    const document = Array.isArray(value) ? value[0] : value;
    return Array.isArray(value)
      ? [{ _id: '507f191e810c19729de86301', ...document }]
      : { _id: '507f191e810c19729de86301', ...document };
  });
  return {
    CounterModel: { findOneAndUpdate: vi.fn().mockResolvedValue({ seq: 1 }) },
    InventoryBatchModel: {
      findById: vi.fn().mockResolvedValue(sourceBatch),
      findOneAndUpdate: vi.fn().mockResolvedValue(sourceBatch),
      aggregate: vi.fn().mockResolvedValue([]),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
    InventoryMovementModel: {
      create: movementCreate,
      countDocuments: vi.fn().mockResolvedValue(0),
    },
    SlabModel: {
      find: vi.fn().mockResolvedValue(sourceSlabs),
      findById: vi.fn().mockResolvedValue(sourceSlabs[0] || null),
      findOneAndUpdate: vi.fn().mockImplementation(async ({ _id }) => sourceSlabs.find((slab) => String(slab._id) === String(_id)) || null),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: sourceSlabs.length }),
      create: vi.fn(),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
    ProcessingJobModel: {
      findById: vi.fn().mockResolvedValue(processingJob),
      create: vi.fn(async ([document]) => [{ _id: JOB_ID, ...document, save: vi.fn(), markModified: vi.fn() }]),
      find: vi.fn().mockResolvedValue([]),
      countDocuments: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue([]),
      exists: vi.fn().mockResolvedValue(true),
    },
    ProcessingEventModel: {
      create: eventCreate,
      find: vi.fn().mockResolvedValue([]),
      countDocuments: vi.fn().mockResolvedValue(0),
    },
  };
}

function createInput(overrides = {}) {
  return {
    inventoryMode: 'BATCH',
    input: { batchId: BATCH_ID },
    target: { finish: 'Honed' },
    routing: [{ operation: 'CUTTING' }, { operation: 'HONING' }],
    expectedCompletionDate: '2026-10-20T00:00:00.000Z',
    notes: 'Production plan',
    ...overrides,
  };
}

describe('processing constants, calculations and schemas', () => {
  it('exposes only the controlled Phase 6 lifecycle values', () => {
    expect(PROCESSING_JOB_STATUSES).toEqual([
      'DRAFT', 'PLANNED', 'IN_PROGRESS', 'QC_PENDING', 'COMPLETED', 'CANCELLED',
    ]);
    expect(PROCESSING_OPERATION_STATUSES).toEqual(['PENDING', 'IN_PROGRESS', 'COMPLETED']);
    expect(PROCESSING_QC_RESULTS).toEqual(['PASS', 'HOLD', 'FAIL']);
    expect(PROCESSING_EVENT_TYPES).toContain('JOB_COMPLETED');
    expect(PROCESSING_OPERATION_TYPES).toContain('CALIBRATION');
  });

  it('generates an India-calendar immutable processing reference', () => {
    expect(formatProcessingJobReference(NOW, 42)).toBe('PJ-2026-0042');
    expect(formatProcessingJobReference(new Date('2025-12-31T20:00:00Z'), 1)).toBe('PJ-2026-0001');
  });

  it('derives progress only from completed routing operations', () => {
    expect(calculateProcessingProgress([])).toBe(0);
    expect(calculateProcessingProgress([operation(1, 'COMPLETED'), operation(2, 'PENDING')])).toBe(50);
  });

  it('calculates quantity waste and quantity yield when area is untracked', () => {
    expect(calculateProcessingOutcome({ quantity: 20 }, { quantity: 19 })).toEqual({
      waste: { quantity: 1 }, yieldBasis: 'QUANTITY', yieldPercent: 95,
    });
  });

  it('calculates verified area waste and yield', () => {
    expect(calculateProcessingOutcome(
      { quantity: 20, areaSqFt: 1000 },
      { quantity: 19, areaSqFt: 940 },
    )).toEqual({
      waste: { areaSqFt: 60 }, yieldBasis: 'AREA', yieldPercent: 94,
    });
  });

  it('allows cutting to increase piece count when verified area conserves material', () => {
    expect(calculateProcessingOutcome(
      { quantity: 1, areaSqFt: 100 },
      { quantity: 4, areaSqFt: 90 },
    )).toEqual({
      waste: { areaSqFt: 10 }, yieldBasis: 'AREA', yieldPercent: 90,
    });
  });

  it('requires area conservation for increased piece count and rejects excess area', () => {
    expect(() => calculateProcessingOutcome({ quantity: 1 }, { quantity: 2 }))
      .toThrow('area are required');
    expect(() => calculateProcessingOutcome(
      { quantity: 1, areaSqFt: 10 }, { quantity: 1, areaSqFt: 11 },
    )).toThrow('area cannot exceed');
  });

  it('marks the job number immutable and validates contiguous routing', async () => {
    expect(ProcessingJob.schema.path('jobNumber').options.immutable).toBe(true);
    const job = new ProcessingJob({
      jobNumber: 'PJ-2026-0099', status: 'DRAFT', stoneSnapshot, inventoryMode: 'BATCH',
      input: { batchId: BATCH_ID, batchNumber: 'BAT-2026-0001' },
      routing: [{ operation: 'CUTTING', sequence: 2 }], createdBy: ACTOR,
    });
    await expect(job.validate()).rejects.toThrow('contiguous');
  });

  it('rejects duplicate slab selection at schema level', async () => {
    const job = new ProcessingJob({
      jobNumber: 'PJ-2026-0100', status: 'DRAFT', stoneSnapshot, inventoryMode: 'INDIVIDUAL_SLAB',
      input: { batchId: BATCH_ID, batchNumber: 'BAT-2026-0001', slabIds: [SLAB_ONE, SLAB_ONE] },
      routing: [], createdBy: ACTOR,
    });
    await expect(job.validate()).rejects.toThrow('unique');
  });

  it('makes processing events append-only', async () => {
    await expect(ProcessingEvent.updateOne({}, { $set: { note: 'rewrite' } })).rejects.toThrow('append-only');
    await expect(ProcessingEvent.deleteOne({})).rejects.toThrow('append-only');
    await expect(ProcessingEvent.bulkWrite([{ deleteOne: { filter: {} } }])).rejects.toThrow('append-only');
  });

  it('validates processing inventory movement signs and job linkage', async () => {
    const valid = new InventoryMovement({
      type: 'PROCESSING_ISSUE', inventoryMode: 'BATCH', batch: BATCH_ID,
      quantityDelta: -1, areaDeltaSqFt: 0, fromLocation: { warehouse: 'Main Yard' },
      reason: 'Issue', actor: ACTOR, relatedProcessingJobId: JOB_ID,
    });
    await expect(valid.validate()).resolves.toBeUndefined();
    const missingLink = new InventoryMovement({
      type: 'PROCESSING_RETURN', inventoryMode: 'BATCH', batch: BATCH_ID,
      quantityDelta: 1, areaDeltaSqFt: 0, toLocation: { warehouse: 'Main Yard' },
      reason: 'Return', actor: ACTOR,
    });
    await expect(missingLink.validate()).rejects.toThrow('processing job reference');
  });
});

describe('job creation and planning', () => {
  it('fails before any write when transaction support is unavailable', async () => {
    const models = createModels();
    await expect(createProcessingJob({ input: createInput(), actor: ACTOR, models })).rejects.toMatchObject({
      status: 503, code: 'TRANSACTION_REQUIRED',
    });
    expect(models.ProcessingJobModel.create).not.toHaveBeenCalled();
  });

  it('creates a DRAFT job from real batch inventory with a counter reference', async () => {
    const models = createModels();
    const result = await createProcessingJob({ input: createInput(), actor: ACTOR, now: NOW, models, session: SESSION });
    expect(result.job.jobNumber).toBe('PJ-2026-0001');
    expect(result.job.status).toBe('DRAFT');
    expect(result.event.type).toBe('JOB_CREATED');
    expect(models.CounterModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'pj_2026' }, { $inc: { seq: 1 } }, { new: true, upsert: true, session: SESSION },
    );
  });

  it('rejects a client-supplied job status', async () => {
    await expect(createProcessingJob({
      input: createInput({ status: 'COMPLETED' }), actor: ACTOR, models: createModels(), session: SESSION,
    })).rejects.toThrow('controlled');
  });

  it('rejects inventory-mode mismatch', async () => {
    await expect(createProcessingJob({
      input: createInput({ inventoryMode: 'INDIVIDUAL_SLAB', input: { batchId: BATCH_ID, slabIds: [SLAB_ONE] } }),
      actor: ACTOR, models: createModels(), session: SESSION,
    })).rejects.toMatchObject({ code: 'INVENTORY_MODE_MISMATCH' });
  });

  it('rejects unavailable or foreign slabs during creation', async () => {
    const batch = batchDocument({ inventoryMode: 'INDIVIDUAL_SLAB' });
    const models = createModels({ batch, slabs: [] });
    await expect(createProcessingJob({
      input: createInput({ inventoryMode: 'INDIVIDUAL_SLAB', input: { batchId: BATCH_ID, slabIds: [SLAB_ONE] } }),
      actor: ACTOR, models, session: SESSION,
    })).rejects.toMatchObject({ code: 'SLAB_UNAVAILABLE' });
  });

  it('rejects duplicate selected slabs before persistence', async () => {
    const batch = batchDocument({ inventoryMode: 'INDIVIDUAL_SLAB' });
    await expect(createProcessingJob({
      input: createInput({
        inventoryMode: 'INDIVIDUAL_SLAB', input: { batchId: BATCH_ID, slabIds: [SLAB_ONE, SLAB_ONE] },
      }),
      actor: ACTOR, models: createModels({ batch }), session: SESSION,
    })).rejects.toThrow('unique');
  });

  it('plans a configured draft after revalidating inventory', async () => {
    const job = jobDocument();
    const models = createModels({ job });
    const result = await planProcessingJob({ jobId: JOB_ID, actor: ACTOR, now: NOW, models, session: SESSION });
    expect(result.job.status).toBe('PLANNED');
    expect(result.event.type).toBe('JOB_PLANNED');
    expect(result.job.currentOperation.operation).toBe('CUTTING');
  });

  it('rejects planning without a routing', async () => {
    const job = jobDocument({ routing: [] });
    await expect(planProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models: createModels({ job }), session: SESSION,
    })).rejects.toThrow('At least one');
  });

  it('updates only pre-production configuration fields', async () => {
    const job = jobDocument();
    const result = await updateProcessingJob({
      jobId: JOB_ID,
      updates: { target: { finish: 'Polished' }, expectedCompletionDate: '2026-10-22T00:00:00Z' },
      actor: ACTOR,
      models: createModels({ job }),
      session: SESSION,
    });
    expect(result.job.target.finish).toBe('Polished');
    expect(result.event.type).toBe('NOTE');
  });

  it('links a pre-production job to one verified Sales Order line idempotently', async () => {
    const job = jobDocument();
    const models = createModels({ job });
    const sourceSalesOrder = {
      salesOrderId: SALES_ORDER_ID,
      salesOrderLineItemId: SALES_ORDER_LINE_ID,
      salesOrderNumber: 'SO-2026-0001',
    };
    const linked = await linkProcessingJobToSalesOrder({
      jobId: JOB_ID,
      sourceSalesOrder,
      actor: ACTOR,
      now: NOW,
      models,
      session: SESSION,
    });
    expect(linked.idempotent).toBe(false);
    expect(job.sourceSalesOrder).toEqual(sourceSalesOrder);
    expect(linked.event).toMatchObject({ type: 'NOTE', note: 'Linked to Sales Order SO-2026-0001.' });

    const repeated = await linkProcessingJobToSalesOrder({
      jobId: JOB_ID,
      sourceSalesOrder,
      actor: ACTOR,
      now: NOW,
      models,
      session: SESSION,
    });
    expect(repeated).toMatchObject({ event: null, idempotent: true });
  });
});

describe('inventory issue and operation sequencing', () => {
  it('starts a planned whole-batch job and records PROCESSING_ISSUE', async () => {
    const job = jobDocument({ status: 'PLANNED' });
    const updatedBatch = batchDocument({
      quantity: { receivedCount: 10, currentCount: 0 },
      area: { receivedSqFt: 100, availableSqFt: 0, basis: 'VERIFIED' },
      status: 'IN_PROCESSING', activeProcessingJob: JOB_ID,
    });
    const models = createModels({ job });
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(updatedBatch);
    const result = await startProcessingJob({
      jobId: JOB_ID, actor: ACTOR, now: NOW, models, session: SESSION,
    });
    expect(result.job.status).toBe('IN_PROGRESS');
    expect(result.job.input).toMatchObject({ quantity: 10, areaSqFt: 100, finish: 'Raw' });
    expect(result.movements[0]).toMatchObject({
      type: 'PROCESSING_ISSUE', quantityDelta: -10, areaDeltaSqFt: -100,
      relatedProcessingJobId: JOB_ID,
    });
  });

  it('issues the exact complete current BATCH balance', async () => {
    const models = createModels();
    await issueInventoryToProcessing({
      processingJobId: JOB_ID, jobNumber: 'PJ-2026-0001', batchId: BATCH_ID,
      actor: ACTOR, now: NOW, models, session: SESSION,
    });
    expect(models.InventoryBatchModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        'quantity.currentCount': 10,
        'area.availableSqFt': 100,
        status: 'AVAILABLE',
        activeProcessingJob: null,
      }),
      expect.objectContaining({ $set: expect.objectContaining({ 'quantity.currentCount': 0, status: 'IN_PROCESSING' }) }),
      expect.objectContaining({ session: SESSION }),
    );
  });

  it('rejects a second start through server-controlled state', async () => {
    const job = jobDocument({ status: 'IN_PROGRESS' });
    await expect(startProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models: createModels({ job }), session: SESSION,
    })).rejects.toMatchObject({ status: 409, code: 'INVALID_JOB_STATE' });
  });

  it('rejects a batch already locked by another active job', async () => {
    const locked = batchDocument({ activeProcessingJob: '507f1f77bcf86cd799439099' });
    await expect(issueInventoryToProcessing({
      processingJobId: JOB_ID, jobNumber: 'PJ-2026-0001', batchId: BATCH_ID,
      actor: ACTOR, models: createModels({ batch: locked }), session: SESSION,
    })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects reserved batch stock before creating a physical processing issue', async () => {
    const reserved = batchDocument({ reservationBalance: { quantity: 0, areaSqFt: 20 } });
    const models = createModels({ batch: reserved });
    await expect(issueInventoryToProcessing({
      processingJobId: JOB_ID,
      jobNumber: 'PJ-2026-0001',
      batchId: BATCH_ID,
      actor: ACTOR,
      models,
      session: SESSION,
    })).rejects.toMatchObject({ status: 409, code: 'INVENTORY_RESERVED' });
    expect(models.InventoryBatchModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(models.InventoryMovementModel.create).not.toHaveBeenCalled();
  });

  it('issues only explicitly selected individual slabs', async () => {
    const slabs = [slabDocument(SLAB_ONE, 'SLB-2026-0001'), slabDocument(SLAB_TWO, 'SLB-2026-0002')];
    const batch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB',
      quantity: { receivedCount: 3, currentCount: 3 },
      area: { receivedSqFt: 30, availableSqFt: 30, basis: 'CALCULATED' },
      location: undefined,
    });
    const models = createModels({ batch, slabs });
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB', quantity: { receivedCount: 3, currentCount: 1 },
      area: { receivedSqFt: 30, availableSqFt: 10, basis: 'CALCULATED' }, location: undefined,
    }));
    const result = await issueInventoryToProcessing({
      processingJobId: JOB_ID, jobNumber: 'PJ-2026-0001', batchId: BATCH_ID,
      slabIds: [SLAB_ONE, SLAB_TWO], actor: ACTOR, models, session: SESSION,
    });
    expect(result.inputSnapshot.quantity).toBe(2);
    expect(result.inputSnapshot.areaSqFt).toBe(20);
    expect(result.movements).toHaveLength(2);
    expect(result.movements.every((movement) => movement.type === 'PROCESSING_ISSUE')).toBe(true);
    expect(models.SlabModel.find).toHaveBeenCalledWith(expect.objectContaining({
      $or: [{ reservation: { $exists: false } }, { reservation: null }],
    }));
  });

  it('requires one transaction session for inventory issue helpers', async () => {
    await expect(issueInventoryToProcessing({
      processingJobId: JOB_ID, jobNumber: 'PJ-2026-0001', batchId: BATCH_ID,
      actor: ACTOR, models: createModels(), session: null,
    })).rejects.toMatchObject({ status: 503, code: 'TRANSACTION_REQUIRED' });
  });

  it('starts only the first pending routing operation', async () => {
    const job = jobDocument({ status: 'IN_PROGRESS' });
    await expect(startProcessingOperation({
      jobId: JOB_ID, operationId: OP_TWO, input: {}, actor: ACTOR,
      models: createModels({ job }), session: SESSION,
    })).rejects.toMatchObject({ code: 'OPERATION_SEQUENCE' });
  });

  it('records operation start time, machine label and audit event', async () => {
    const job = jobDocument({ status: 'IN_PROGRESS' });
    const result = await startProcessingOperation({
      jobId: JOB_ID, operationId: OP_ONE,
      input: { machineLabel: 'Calibration line', notes: 'Started after inspection' },
      actor: ACTOR, now: NOW, models: createModels({ job }), session: SESSION,
    });
    expect(result.job.routing[0]).toMatchObject({
      status: 'IN_PROGRESS', actualStart: NOW, machineLabel: 'Calibration line',
    });
    expect(result.event.type).toBe('OPERATION_STARTED');
  });

  it('completes the current operation and advances routing', async () => {
    const job = jobDocument({ status: 'IN_PROGRESS', routing: [operation(1, 'IN_PROGRESS'), operation(2)] });
    const result = await completeProcessingOperation({
      jobId: JOB_ID, operationId: OP_ONE, input: { machineLabel: 'Cutting table' },
      actor: ACTOR, now: NOW, models: createModels({ job }), session: SESSION,
    });
    expect(result.job.routing[0].status).toBe('COMPLETED');
    expect(result.job.currentOperation.operation).toBe('HONING');
    expect(calculateProcessingProgress(result.job.routing)).toBe(50);
  });

  it('moves to QC_PENDING only after the final operation completes', async () => {
    const job = jobDocument({
      status: 'IN_PROGRESS',
      routing: [operation(1, 'COMPLETED'), operation(2, 'IN_PROGRESS')],
    });
    const result = await completeProcessingOperation({
      jobId: JOB_ID, operationId: OP_TWO, input: {}, actor: ACTOR, now: NOW,
      models: createModels({ job }), session: SESSION,
    });
    expect(result.job.status).toBe('QC_PENDING');
    expect(result.job.currentOperation).toBeUndefined();
    expect(result.event.details.progressPercent).toBe(100);
  });

  it('rejects completing a pending or already completed operation', async () => {
    const job = jobDocument({ status: 'IN_PROGRESS' });
    await expect(completeProcessingOperation({
      jobId: JOB_ID, operationId: OP_ONE, input: {}, actor: ACTOR,
      models: createModels({ job }), session: SESSION,
    })).rejects.toMatchObject({ code: 'OPERATION_SEQUENCE' });
  });
});

describe('quality control, output and completion', () => {
  function qcJob(overrides = {}) {
    return jobDocument({
      status: 'QC_PENDING',
      input: {
        batchId: BATCH_ID, batchNumber: 'BAT-2026-0001', quantity: 10, areaSqFt: 100,
        sourceLocation: { warehouse: 'Main Yard' }, issuedAt: NOW,
      },
      routing: [operation(1, 'COMPLETED'), operation(2, 'COMPLETED')],
      ...overrides,
    });
  }

  it('records QC HOLD without returning inventory', async () => {
    const job = qcJob();
    const models = createModels({ job });
    const result = await recordProcessingQC({
      jobId: JOB_ID, input: { result: 'HOLD', notes: 'Awaiting review', observations: 'Edge variance' },
      actor: ACTOR, now: NOW, models, session: SESSION,
    });
    expect(result.job.status).toBe('QC_PENDING');
    expect(result.job.qualityCheck).toMatchObject({ result: 'HOLD', observations: 'Edge variance' });
    expect(models.InventoryMovementModel.create).not.toHaveBeenCalled();
  });

  it('records QC FAIL without making stock available', async () => {
    const job = qcJob();
    const models = createModels({ job });
    const result = await recordProcessingQC({
      jobId: JOB_ID, input: { result: 'FAIL', notes: 'Corrective processing required' },
      actor: ACTOR, models, session: SESSION,
    });
    expect(result.job.qualityCheck.result).toBe('FAIL');
    expect(result.job.status).toBe('QC_PENDING');
    expect(models.InventoryBatchModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires verified output for QC PASS', async () => {
    await expect(recordProcessingQC({
      jobId: JOB_ID, input: { result: 'PASS' }, actor: ACTOR,
      models: createModels({ job: qcJob() }), session: SESSION,
    })).rejects.toThrow('Verified output is required');
  });

  it('rejects impossible output during QC', async () => {
    await expect(recordProcessingQC({
      jobId: JOB_ID,
      input: { result: 'PASS', verifiedOutput: { quantity: 11, areaSqFt: 101 } },
      actor: ACTOR, models: createModels({ job: qcJob() }), session: SESSION,
    })).rejects.toThrow('area cannot exceed');
  });

  it('records a valid QC PASS but keeps stock unavailable until completion', async () => {
    const job = qcJob();
    const models = createModels({ job });
    const result = await recordProcessingQC({
      jobId: JOB_ID,
      input: {
        result: 'PASS', notes: 'Accepted', observations: 'Edges and finish verified.',
        verifiedOutput: { quantity: 9, areaSqFt: 94, finish: 'Honed', thicknessMm: 18 },
      },
      actor: ACTOR, now: NOW, models, session: SESSION,
    });
    expect(result.job.qualityCheck.verifiedOutput).toMatchObject({ quantity: 9, areaSqFt: 94, finish: 'Honed' });
    expect(result.job.status).toBe('QC_PENDING');
    expect(models.InventoryMovementModel.create).not.toHaveBeenCalled();
    expect(models.ProcessingEventModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({
        details: expect.objectContaining({
          observations: 'Edges and finish verified.',
          verifiedOutput: expect.objectContaining({ quantity: 9, areaSqFt: 94 }),
        }),
      })],
      { session: SESSION },
    );
  });

  it('rejects caller-owned sessions that are not inside a transaction', async () => {
    await expect(planProcessingJob({
      jobId: JOB_ID,
      actor: ACTOR,
      models: createModels({ job: jobDocument() }),
      session: { inTransaction: () => false },
    })).rejects.toMatchObject({ status: 503, code: 'TRANSACTION_REQUIRED' });
  });

  it('requires explicit unique returned slabs and matching area in individual mode', async () => {
    const job = qcJob({
      inventoryMode: 'INDIVIDUAL_SLAB',
      input: {
        batchId: BATCH_ID, batchNumber: 'BAT-2026-0001',
        slabIds: [SLAB_ONE, SLAB_TWO], slabNumbers: ['SLB-1', 'SLB-2'], quantity: 2, areaSqFt: 20,
      },
    });
    await expect(recordProcessingQC({
      jobId: JOB_ID,
      input: {
        result: 'PASS',
        verifiedOutput: {
          quantity: 1, areaSqFt: 9,
          slabOutputs: [{ slabId: SLAB_ONE, usableAreaSqFt: 8 }],
        },
      },
      actor: ACTOR, models: createModels({ job }), session: SESSION,
    })).rejects.toThrow('usable-area total');
  });

  it('accepts a valid individual returned-slab subset', async () => {
    const job = qcJob({
      inventoryMode: 'INDIVIDUAL_SLAB',
      input: {
        batchId: BATCH_ID, batchNumber: 'BAT-2026-0001',
        slabIds: [SLAB_ONE, SLAB_TWO], slabNumbers: ['SLB-1', 'SLB-2'], quantity: 2, areaSqFt: 20,
      },
    });
    const result = await recordProcessingQC({
      jobId: JOB_ID,
      input: {
        result: 'PASS',
        verifiedOutput: {
          quantity: 1, areaSqFt: 8, finish: 'Honed', thicknessMm: 18,
          slabOutputs: [{ slabId: SLAB_ONE, usableAreaSqFt: 8, dimensions: { lengthMm: 900, widthMm: 900 } }],
        },
      },
      actor: ACTOR, models: createModels({ job }), session: SESSION,
    });
    expect(result.job.qualityCheck.verifiedOutput.slabOutputs).toHaveLength(1);
  });

  it('rejects an individual slab usable area above the gross area derived from output dimensions', async () => {
    const job = qcJob({
      inventoryMode: 'INDIVIDUAL_SLAB',
      input: {
        batchId: BATCH_ID,
        batchNumber: 'BAT-2026-0001',
        slabIds: [SLAB_ONE],
        slabNumbers: ['SLB-1'],
        quantity: 1,
        areaSqFt: 10,
        slabSnapshots: [{
          slabId: SLAB_ONE,
          slabNumber: 'SLB-1',
          grossAreaSqFt: 10,
          usableAreaSqFt: 10,
          dimensions: { lengthMm: 1000, widthMm: 929.0304, thicknessMm: 20 },
        }],
      },
    });

    await expect(recordProcessingQC({
      jobId: JOB_ID,
      input: {
        result: 'PASS',
        verifiedOutput: {
          quantity: 1,
          areaSqFt: 9,
          slabOutputs: [{
            slabId: SLAB_ONE,
            usableAreaSqFt: 9,
            dimensions: { lengthMm: 900, widthMm: 900 },
          }],
        },
      },
      actor: ACTOR,
      models: createModels({ job }),
      session: SESSION,
    })).rejects.toThrow('usable area cannot exceed its gross area');
  });

  it('forbids completion without the latest QC PASS', async () => {
    const job = qcJob({ qualityCheck: { result: 'HOLD', checkedAt: NOW } });
    await expect(completeProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models: createModels({ job }), session: SESSION,
    })).rejects.toMatchObject({ code: 'QC_PASS_REQUIRED' });
  });

  it('completes a passed BATCH job, returns verified stock and derives waste', async () => {
    const verifiedOutput = { quantity: 9, areaSqFt: 94, finish: 'Honed', thicknessMm: 18 };
    const job = qcJob({ qualityCheck: { result: 'PASS', checkedAt: NOW, verifiedOutput } });
    const lockedBatch = batchDocument({
      quantity: { receivedCount: 10, currentCount: 0 },
      area: { receivedSqFt: 100, availableSqFt: 0, basis: 'VERIFIED' },
      status: 'IN_PROCESSING', activeProcessingJob: JOB_ID,
    });
    const returnedBatch = batchDocument({
      quantity: { receivedCount: 10, currentCount: 9 },
      area: { receivedSqFt: 100, availableSqFt: 94, basis: 'VERIFIED' },
      status: 'AVAILABLE', activeProcessingJob: null, finish: 'Honed', thicknessMm: 18,
    });
    const models = createModels({ job, batch: lockedBatch });
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(returnedBatch);
    const result = await completeProcessingJob({
      jobId: JOB_ID, actor: ACTOR, now: NOW, models, session: SESSION,
    });
    expect(result.job.status).toBe('COMPLETED');
    expect(result.job.waste).toEqual({ areaSqFt: 6 });
    expect(result.job.yieldPercent).toBe(94);
    expect(result.movements[0]).toMatchObject({
      type: 'PROCESSING_RETURN', quantityDelta: 9, areaDeltaSqFt: 94,
    });
    expect(models.ProcessingEventModel.create).toHaveBeenCalledWith(
      [expect.objectContaining({
        type: 'JOB_COMPLETED',
        details: expect.objectContaining({
          verifiedOutput: expect.objectContaining(verifiedOutput),
        }),
      })],
      { session: SESSION },
    );
  });

  it('returns individual slabs, depletes omitted slabs and applies verified thickness', async () => {
    const verifiedOutput = {
      quantity: 1, areaSqFt: 8, finish: 'Honed', thicknessMm: 18,
      slabOutputs: [{ slabId: SLAB_ONE, usableAreaSqFt: 8, dimensions: { lengthMm: 900, widthMm: 900 } }],
    };
    const job = qcJob({
      inventoryMode: 'INDIVIDUAL_SLAB',
      input: {
        batchId: BATCH_ID, batchNumber: 'BAT-2026-0001', slabIds: [SLAB_ONE, SLAB_TWO],
        slabNumbers: ['SLB-1', 'SLB-2'], quantity: 2, areaSqFt: 20,
      },
      qualityCheck: { result: 'PASS', checkedAt: NOW, verifiedOutput },
    });
    const slabs = [
      slabDocument(SLAB_ONE, 'SLB-1', { status: 'IN_PROCESSING', activeProcessingJob: JOB_ID }),
      slabDocument(SLAB_TWO, 'SLB-2', { status: 'IN_PROCESSING', activeProcessingJob: JOB_ID }),
    ];
    const batch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB', quantity: { receivedCount: 2, currentCount: 0 },
      area: { receivedSqFt: 20, availableSqFt: 0, basis: 'CALCULATED' },
      location: undefined, status: 'IN_PROCESSING',
    });
    const models = createModels({ job, batch, slabs });
    models.SlabModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    models.InventoryBatchModel.findOneAndUpdate.mockResolvedValue(batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB', quantity: { receivedCount: 2, currentCount: 1 },
      area: { receivedSqFt: 20, availableSqFt: 8, basis: 'CALCULATED' }, location: undefined,
    }));
    const result = await completeProcessingJob({
      jobId: JOB_ID, actor: ACTOR, now: NOW, models, session: SESSION,
    });
    expect(result.slabs).toHaveLength(1);
    expect(models.SlabModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: expect.objectContaining({
        status: 'AVAILABLE', finish: 'Honed',
        dimensions: expect.objectContaining({ lengthMm: 900, widthMm: 900, thicknessMm: 18 }),
      }) },
      expect.objectContaining({ session: SESSION }),
    );
    expect(models.SlabModel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ _id: { $in: [SLAB_TWO] } }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'DEPLETED', activeProcessingJob: null }) }),
      expect.objectContaining({ session: SESSION }),
    );
  });

  it('cannot complete an already completed job twice', async () => {
    const job = qcJob({ status: 'COMPLETED' });
    await expect(completeProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models: createModels({ job }), session: SESSION,
    })).rejects.toMatchObject({ code: 'INVALID_JOB_STATE' });
  });

  it('requires a transaction session for processing return helpers', async () => {
    await expect(returnInventoryFromProcessing({
      processingJobId: JOB_ID, jobNumber: 'PJ-2026-0001', batchId: BATCH_ID,
      verifiedOutput: { quantity: 1 }, actor: ACTOR, models: createModels(),
    })).rejects.toMatchObject({ status: 503, code: 'TRANSACTION_REQUIRED' });
  });
});

describe('cancellation, audit queries, concurrency and inventory guards', () => {
  it('cancels a planned job without touching inventory', async () => {
    const job = jobDocument({ status: 'PLANNED' });
    const models = createModels({ job });
    const result = await cancelProcessingJob({
      jobId: JOB_ID, input: { reason: 'Production plan withdrawn' }, actor: ACTOR,
      now: NOW, models, session: SESSION,
    });
    expect(result.job.status).toBe('CANCELLED');
    expect(result.event.type).toBe('JOB_CANCELLED');
    expect(models.InventoryBatchModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects cancellation after inventory has been issued', async () => {
    const job = jobDocument({ status: 'IN_PROGRESS' });
    await expect(cancelProcessingJob({
      jobId: JOB_ID, input: { reason: 'Stop' }, actor: ACTOR,
      models: createModels({ job }), session: SESSION,
    })).rejects.toMatchObject({ code: 'INVALID_JOB_STATE' });
  });

  it('adds a note as an immutable event without changing job state', async () => {
    const job = jobDocument({ status: 'IN_PROGRESS' });
    const result = await addProcessingNote({
      jobId: JOB_ID, input: { note: 'Material checked at workstation' }, actor: ACTOR,
      models: createModels({ job }), session: SESSION,
    });
    expect(result.job.status).toBe('IN_PROGRESS');
    expect(result.event).toMatchObject({ type: 'NOTE', note: 'Material checked at workstation' });
  });

  it('maps optimistic concurrency failures to a generic 409', async () => {
    const versionError = Object.assign(new Error('internal version detail'), { name: 'VersionError' });
    const job = jobDocument({ save: vi.fn().mockRejectedValue(versionError) });
    await expect(updateProcessingJob({
      jobId: JOB_ID, updates: { notes: 'Changed' }, actor: ACTOR,
      models: createModels({ job }), session: SESSION,
    })).rejects.toMatchObject({ status: 409, code: 'PROCESSING_CONFLICT' });
  });

  it('does not execute a stock mutation when withTransaction rejects before callback', async () => {
    const models = createModels({ job: jobDocument({ status: 'PLANNED' }) });
    const endSession = vi.fn();
    const connection = {
      startSession: vi.fn().mockResolvedValue({
        withTransaction: vi.fn().mockRejectedValue(Object.assign(new Error('unsupported'), { code: 20 })),
        endSession,
      }),
    };
    await expect(startProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models, connection,
    })).rejects.toMatchObject({ status: 503, code: 'TRANSACTION_REQUIRED' });
    expect(models.InventoryBatchModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(endSession).toHaveBeenCalled();
  });

  it('propagates a mid-start movement failure inside the one owned transaction', async () => {
    const job = jobDocument({ status: 'PLANNED' });
    const models = createModels({ job });
    const failure = new Error('movement write failed');
    models.InventoryMovementModel.create.mockRejectedValue(failure);
    const transactionSession = {
      inTransaction: () => true,
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    };
    const connection = { startSession: vi.fn().mockResolvedValue(transactionSession) };

    await expect(startProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models, connection,
    })).rejects.toBe(failure);
    expect(models.InventoryBatchModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ session: transactionSession }),
    );
    expect(models.ProcessingEventModel.create).not.toHaveBeenCalled();
    expect(transactionSession.withTransaction).toHaveBeenCalledTimes(1);
  });

  it('propagates a mid-completion return failure before completing the job', async () => {
    const verifiedOutput = { quantity: 9, areaSqFt: 94 };
    const job = jobDocument({
      status: 'QC_PENDING',
      input: { batchId: BATCH_ID, batchNumber: 'BAT-2026-0001', quantity: 10, areaSqFt: 100 },
      routing: [operation(1, 'COMPLETED')],
      qualityCheck: { result: 'PASS', checkedAt: NOW, verifiedOutput },
    });
    const batch = batchDocument({
      quantity: { receivedCount: 10, currentCount: 0 },
      area: { receivedSqFt: 100, availableSqFt: 0, basis: 'VERIFIED' },
      status: 'IN_PROCESSING', activeProcessingJob: JOB_ID,
    });
    const models = createModels({ job, batch });
    const failure = new Error('return movement failed');
    models.InventoryMovementModel.create.mockRejectedValue(failure);
    const transactionSession = {
      inTransaction: () => true,
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    };
    const connection = { startSession: vi.fn().mockResolvedValue(transactionSession) };

    await expect(completeProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models, connection,
    })).rejects.toBe(failure);
    expect(models.InventoryBatchModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.objectContaining({ session: transactionSession }),
    );
    expect(job.save).not.toHaveBeenCalled();
    expect(models.ProcessingEventModel.create).not.toHaveBeenCalled();
  });

  it('keeps start job, inventory, movement and event writes on the same session', async () => {
    const job = jobDocument({ status: 'PLANNED' });
    const models = createModels({ job });
    const transactionSession = {
      inTransaction: () => true,
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    };
    const connection = { startSession: vi.fn().mockResolvedValue(transactionSession) };
    await startProcessingJob({ jobId: JOB_ID, actor: ACTOR, models, connection });
    expect(job.save).toHaveBeenCalledWith({ session: transactionSession });
    expect(models.InventoryMovementModel.create).toHaveBeenCalledWith(
      expect.any(Array), { session: transactionSession },
    );
    expect(models.ProcessingEventModel.create).toHaveBeenCalledWith(
      expect.any(Array), { session: transactionSession },
    );
  });

  it('propagates an event failure after completion writes without nontransactional retry', async () => {
    const verifiedOutput = { quantity: 9, areaSqFt: 94 };
    const job = jobDocument({
      status: 'QC_PENDING',
      input: { batchId: BATCH_ID, batchNumber: 'BAT-2026-0001', quantity: 10, areaSqFt: 100 },
      routing: [operation(1, 'COMPLETED')],
      qualityCheck: { result: 'PASS', checkedAt: NOW, verifiedOutput },
    });
    const batch = batchDocument({
      quantity: { receivedCount: 10, currentCount: 0 },
      area: { receivedSqFt: 100, availableSqFt: 0, basis: 'VERIFIED' },
      status: 'IN_PROCESSING', activeProcessingJob: JOB_ID,
    });
    const models = createModels({ job, batch });
    const failure = new Error('event write failed');
    models.ProcessingEventModel.create.mockRejectedValue(failure);
    const transactionSession = {
      inTransaction: () => true,
      withTransaction: vi.fn(async (callback) => callback()),
      endSession: vi.fn(),
    };
    const connection = { startSession: vi.fn().mockResolvedValue(transactionSession) };
    await expect(completeProcessingJob({
      jobId: JOB_ID, actor: ACTOR, models, connection,
    })).rejects.toBe(failure);
    expect(transactionSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(transactionSession.endSession).toHaveBeenCalledTimes(1);
    expect(connection.startSession).toHaveBeenCalledTimes(1);
  });

  it('bounds list pagination and escapes search regex', async () => {
    const models = createModels();
    let capturedFilter;
    const query = {
      sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([]),
    };
    models.ProcessingJobModel.find.mockImplementation((filter) => {
      capturedFilter = filter;
      return query;
    });
    const result = await listProcessingJobs({
      page: 1,
      limit: 999,
      search: 'PJ.*',
      operation: 'CUTTING',
      models,
    });
    expect(result.limit).toBe(100);
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(capturedFilter.$or[0].jobNumber.source).toBe('PJ\\.\\*');
    expect(capturedFilter['currentOperation.operation']).toBe('CUTTING');
  });

  it('returns the operational summary shape and excludes undated overdue jobs in its pipeline', async () => {
    const models = createModels();
    let pipeline;
    models.ProcessingJobModel.aggregate.mockImplementation(async (value) => {
      pipeline = value;
      return [{
        metrics: [{ plannedJobs: 2, inProgressJobs: 1, qcPendingJobs: 1, completedRecently: 3, overdueJobs: 1 }],
        material: [{ jobs: 2, quantity: 12, areaSqFt: 90, areaTrackedJobs: 1 }],
      }];
    });
    await expect(getProcessingSummary({ now: NOW, models })).resolves.toEqual({
      plannedJobs: 2, inProgressJobs: 1, qcPendingJobs: 1, completedRecently: 3, overdueJobs: 1,
      materialInProcessing: { jobs: 2, quantity: 12, areaSqFt: 90, areaTrackedJobs: 1 },
    });
    expect(JSON.stringify(pipeline)).toContain('$ifNull');
    expect(JSON.stringify(pipeline)).toContain('expectedCompletionDate');
  });

  it('paginates append-only event history', async () => {
    const models = createModels();
    const query = {
      sort: vi.fn().mockReturnThis(), skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([{ type: 'JOB_CREATED' }]),
    };
    models.ProcessingEventModel.find.mockReturnValue(query);
    models.ProcessingEventModel.countDocuments.mockResolvedValue(1);
    const result = await listProcessingEvents({ jobId: JOB_ID, page: 1, limit: 200, models });
    expect(result.events).toHaveLength(1);
    expect(result.limit).toBe(100);
  });

  it('blocks client metadata from setting IN_PROCESSING', async () => {
    const batch = batchDocument();
    await expect(updateInventoryBatch({
      batchId: BATCH_ID, updates: { status: 'IN_PROCESSING' }, actor: ACTOR,
      models: createModels({ batch }), session: SESSION,
    })).rejects.toThrow('derived');
  });

  it('blocks receiving a slab into a fully issued batch', async () => {
    const batch = batchDocument({
      inventoryMode: 'INDIVIDUAL_SLAB', status: 'IN_PROCESSING', location: undefined,
      quantity: { receivedCount: 2, currentCount: 0 },
      area: { receivedSqFt: 20, availableSqFt: 0, basis: 'CALCULATED' },
    });
    await expect(createInventorySlab({
      batchId: BATCH_ID,
      input: {
        dimensions: { lengthMm: 1000, widthMm: 1000 },
        location: { warehouse: 'Main Yard' },
      },
      actor: ACTOR,
      models: createModels({ batch }),
      session: SESSION,
    })).rejects.toMatchObject({ status: 409 });
  });
});
