import mongoose from 'mongoose';
import { INVENTORY_MODES } from '../constants/inventory.js';
import {
  ACTIVE_PROCESSING_JOB_STATUSES,
  DEFAULT_PROCESSING_PAGE_SIZE,
  MAX_PROCESSING_PAGE_SIZE,
  PROCESSING_JOB_STATUSES,
  PROCESSING_OPERATION_TYPES,
  PROCESSING_QC_RESULTS,
  PROCESSING_REFERENCE_PREFIX,
} from '../constants/processing.js';
import Counter from '../models/Counter.js';
import InventoryBatch from '../models/InventoryBatch.js';
import InventoryMovement from '../models/InventoryMovement.js';
import ProcessingEvent from '../models/ProcessingEvent.js';
import ProcessingJob from '../models/ProcessingJob.js';
import Slab from '../models/Slab.js';
import {
  InventoryError,
  formatInventoryReference,
  issueInventoryToProcessing,
  nextInventoryReference,
  returnInventoryFromProcessing,
  squareFeetFromMillimetres,
} from './inventoryService.js';
import { escapeRegex } from '../utils/security.js';

const AREA_PRECISION = 4;
const PERCENT_PRECISION = 2;

const DEFAULT_MODELS = Object.freeze({
  CounterModel: Counter,
  InventoryBatchModel: InventoryBatch,
  InventoryMovementModel: InventoryMovement,
  ProcessingEventModel: ProcessingEvent,
  ProcessingJobModel: ProcessingJob,
  SlabModel: Slab,
});

export class ProcessingError extends Error {
  constructor(message, status = 400, code = 'PROCESSING_ERROR') {
    super(message);
    this.name = 'ProcessingError';
    this.status = status;
    this.code = code;
  }
}

function resolveModels(overrides = {}) {
  return { ...DEFAULT_MODELS, ...overrides };
}

function requireActor(actor) {
  const value = String(actor || '').trim();
  if (!value) throw new ProcessingError('An authenticated actor is required.', 401, 'ACTOR_REQUIRED');
  if (value.length > 120) throw new ProcessingError('Actor identifier is too long.');
  return value;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new ProcessingError(`${field} must be at most ${maxLength} characters.`);
  return normalized;
}

function requiredText(value, field, maxLength) {
  const normalized = optionalText(value, field, maxLength);
  if (!normalized) throw new ProcessingError(`${field} is required.`);
  return normalized;
}

function finiteNumber(value, field, {
  optional = false,
  integer = false,
  positive = false,
} = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new ProcessingError(`${field} is required.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new ProcessingError(`${field} must be a finite number.`);
  if (integer && !Number.isInteger(number)) throw new ProcessingError(`${field} must be a whole number.`);
  if (positive ? number <= 0 : number < 0) {
    throw new ProcessingError(`${field} must be ${positive ? 'greater than zero' : 'zero or greater'}.`);
  }
  return number;
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ProcessingError(`${field} must be a valid date.`);
  return date;
}

function requireObjectId(value, field) {
  if (!mongoose.isValidObjectId(value)) throw new ProcessingError(`${field} is invalid.`, 400, 'INVALID_ID');
  return value;
}

function enumValue(value, allowed, field) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!allowed.includes(normalized)) throw new ProcessingError(`${field} is invalid.`);
  return normalized;
}

function compact(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''),
  );
}

function plain(value) {
  if (!value) return value;
  return typeof value.toObject === 'function' ? value.toObject() : { ...value };
}

function roundArea(value) {
  return Number(Number(value).toFixed(AREA_PRECISION));
}

function appendNote(existing, next) {
  const addition = optionalText(next, 'Operation notes', 2000);
  if (!addition) return existing;
  const current = String(existing || '').trim();
  return current ? `${current}\n${addition}`.slice(0, 2000) : addition;
}

function asProcessingError(error) {
  if (error instanceof ProcessingError) return error;
  if (error instanceof InventoryError) {
    return new ProcessingError(error.message, error.status, error.code);
  }
  if (error?.name === 'VersionError') {
    return new ProcessingError('Processing job changed concurrently. Try again.', 409, 'PROCESSING_CONFLICT');
  }
  return error;
}

function transactionUnsupported(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === 20
    || error?.codeName === 'IllegalOperation'
    || message.includes('transaction numbers are only allowed')
    || message.includes('does not support transactions');
}

function requireActiveTransactionSession(session) {
  if (typeof session?.inTransaction !== 'function' || !session.inTransaction()) {
    throw new ProcessingError(
      'MongoDB transaction support is required for processing operations.',
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
      throw asProcessingError(error);
    }
  }

  const database = connection || models.ProcessingJobModel?.db;
  if (typeof database?.startSession !== 'function') {
    throw new ProcessingError(
      'MongoDB transaction support is required for processing operations.',
      503,
      'TRANSACTION_REQUIRED',
    );
  }

  let ownedSession;
  try {
    ownedSession = await database.startSession();
  } catch {
    throw new ProcessingError('Processing transaction service is unavailable.', 503, 'TRANSACTION_UNAVAILABLE');
  }
  if (typeof ownedSession?.withTransaction !== 'function') {
    if (typeof ownedSession?.endSession === 'function') await ownedSession.endSession();
    throw new ProcessingError(
      'MongoDB transaction support is required for processing operations.',
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
      throw new ProcessingError(
        'MongoDB transaction support is required for processing operations.',
        503,
        'TRANSACTION_REQUIRED',
      );
    }
    throw asProcessingError(error);
  } finally {
    await ownedSession.endSession();
  }
}

async function findById(Model, id, session = null) {
  let query = Model.findById(id);
  if (session && typeof query?.session === 'function') query = query.session(session);
  return query;
}

async function findMany(Model, filter, session = null, sort = null) {
  let query = Model.find(filter);
  if (session && typeof query?.session === 'function') query = query.session(session);
  if (sort && typeof query?.sort === 'function') query = query.sort(sort);
  return query;
}

async function createDocument(Model, document, session) {
  const created = await Model.create([document], { session });
  return Array.isArray(created) ? created[0] : created;
}

async function saveDocument(document, session) {
  if (typeof document?.save !== 'function') throw new ProcessingError('Processing record cannot be saved.', 500);
  await document.save({ session });
  return document;
}

function normalizeDimensions(input, field = 'Dimensions') {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new ProcessingError(`${field} must be an object.`);
  const lengthMm = finiteNumber(input.lengthMm, `${field} length`, { optional: true, positive: true });
  const widthMm = finiteNumber(input.widthMm, `${field} width`, { optional: true, positive: true });
  const thicknessMm = finiteNumber(input.thicknessMm, `${field} thickness`, { optional: true, positive: true });
  if ((lengthMm == null) !== (widthMm == null)) {
    throw new ProcessingError(`${field} length and width must be supplied together.`);
  }
  const result = compact({ lengthMm, widthMm, thicknessMm });
  return Object.keys(result).length ? result : undefined;
}

function normalizeTarget(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new ProcessingError('Processing target must be an object.');
  const target = compact({
    finish: optionalText(input.finish, 'Target finish', 120),
    thicknessMm: finiteNumber(input.thicknessMm, 'Target thickness', { optional: true, positive: true }),
    dimensions: normalizeDimensions(input.dimensions, 'Target dimensions'),
  });
  return Object.keys(target).length ? target : undefined;
}

function normalizeRouting(input, { required = false } = {}) {
  if (input === undefined || input === null) {
    if (required) throw new ProcessingError('At least one processing operation is required.');
    return [];
  }
  if (!Array.isArray(input)) throw new ProcessingError('Routing must be an array.');
  if (input.length > 25) throw new ProcessingError('Routing cannot contain more than 25 operations.');
  if (required && !input.length) throw new ProcessingError('At least one processing operation is required.');

  return input.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ProcessingError(`Routing operation ${index + 1} is invalid.`);
    }
    const sequence = index + 1;
    if (entry.sequence != null && Number(entry.sequence) !== sequence) {
      throw new ProcessingError('Routing sequence must be contiguous and match array order.');
    }
    const plannedStart = optionalDate(entry.plannedStart, `Operation ${sequence} planned start`);
    const plannedEnd = optionalDate(entry.plannedEnd, `Operation ${sequence} planned end`);
    if (plannedStart && plannedEnd && plannedEnd < plannedStart) {
      throw new ProcessingError(`Operation ${sequence} planned end cannot be before planned start.`);
    }
    return compact({
      operation: enumValue(entry.operation, PROCESSING_OPERATION_TYPES, `Operation ${sequence}`),
      sequence,
      status: 'PENDING',
      plannedStart,
      plannedEnd,
      machineLabel: optionalText(entry.machineLabel, `Operation ${sequence} machine label`, 160),
      notes: optionalText(entry.notes, `Operation ${sequence} notes`, 2000),
    });
  });
}

export function calculateProcessingProgress(routing = []) {
  if (!Array.isArray(routing) || !routing.length) return 0;
  const completed = routing.filter((operation) => operation.status === 'COMPLETED').length;
  return Number(((completed / routing.length) * 100).toFixed(PERCENT_PRECISION));
}

export function formatProcessingJobReference(date, sequence) {
  return formatInventoryReference(PROCESSING_REFERENCE_PREFIX, date, sequence);
}

export function calculateProcessingOutcome(input, output) {
  const inputQuantity = finiteNumber(input?.quantity, 'Input quantity', { integer: true });
  const outputQuantity = finiteNumber(output?.quantity, 'Output quantity', { integer: true });
  const inputArea = finiteNumber(input?.areaSqFt, 'Input area', { optional: true });
  const outputArea = finiteNumber(output?.areaSqFt, 'Output area', { optional: true });
  if (inputArea != null && outputArea == null) throw new ProcessingError('Output area is required for area-tracked input.');
  if (inputArea != null && outputArea > inputArea + 0.0001) {
    throw new ProcessingError('Output area cannot exceed input area.');
  }

  if (inputArea > 0) {
    return {
      waste: { areaSqFt: roundArea(inputArea - outputArea) },
      yieldBasis: 'AREA',
      yieldPercent: Number(((outputArea / inputArea) * 100).toFixed(PERCENT_PRECISION)),
    };
  }

  if (outputQuantity > inputQuantity) {
    throw new ProcessingError(
      'Verified input and output area are required when processing increases piece count.',
    );
  }
  return {
    waste: { quantity: inputQuantity - outputQuantity },
    yieldBasis: inputQuantity > 0 ? 'QUANTITY' : undefined,
    yieldPercent: inputQuantity > 0
      ? Number(((outputQuantity / inputQuantity) * 100).toFixed(PERCENT_PRECISION))
      : undefined,
  };
}

function stoneSnapshot(batch) {
  const source = plain(batch?.stoneRef) || {};
  if (!source.stoneId || !source.slug || !source.name) {
    throw new ProcessingError('The inventory batch has no valid stone identity.', 409, 'INVALID_INVENTORY_IDENTITY');
  }
  return compact({
    stoneId: String(source.stoneId),
    slug: String(source.slug),
    name: String(source.name),
    materialFamily: source.materialFamily ? String(source.materialFamily) : undefined,
  });
}

function normalizeSlabIds(values) {
  if (values === undefined || values === null) return [];
  if (!Array.isArray(values)) throw new ProcessingError('Selected slab IDs must be an array.');
  if (values.length > 500) throw new ProcessingError('A processing job cannot select more than 500 slabs.');
  const ids = values.map((value) => requireObjectId(value, 'Slab ID'));
  if (new Set(ids.map(String)).size !== ids.length) throw new ProcessingError('Selected slabs must be unique.');
  return ids;
}

async function loadAvailableSource({ inventoryMode, input, models, session }) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProcessingError('Processing input is required.');
  }
  const batchId = requireObjectId(input.batchId, 'Batch ID');
  const batch = await findById(models.InventoryBatchModel, batchId, session);
  if (!batch) throw new ProcessingError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
  if (batch.inventoryMode !== inventoryMode) {
    throw new ProcessingError('Processing mode does not match the inventory batch.', 409, 'INVENTORY_MODE_MISMATCH');
  }
  if (batch.status !== 'AVAILABLE' || batch.activeProcessingJob) {
    throw new ProcessingError('The selected inventory is not available for processing.', 409, 'INVENTORY_UNAVAILABLE');
  }

  const slabIds = normalizeSlabIds(input.slabIds);
  if (inventoryMode === 'BATCH') {
    if (slabIds.length) throw new ProcessingError('Batch-mode processing cannot select individual slabs.');
    if (Number(batch.quantity?.currentCount || 0) <= 0 && Number(batch.area?.availableSqFt || 0) <= 0) {
      throw new ProcessingError('The selected batch has no available material.', 409, 'INVENTORY_UNAVAILABLE');
    }
    return { batch, slabs: [] };
  }

  if (!slabIds.length) throw new ProcessingError('At least one available slab must be selected.');
  const slabs = await findMany(models.SlabModel, {
    _id: { $in: slabIds },
    batch: batch._id,
    status: 'AVAILABLE',
    activeProcessingJob: null,
  }, session, { slabNumber: 1, _id: 1 });
  if (!Array.isArray(slabs) || slabs.length !== slabIds.length) {
    throw new ProcessingError(
      'Every selected slab must belong to the batch and be available.',
      409,
      'SLAB_UNAVAILABLE',
    );
  }
  return { batch, slabs };
}

function eventDocument({ job, type, actor, now, note, details }) {
  return compact({
    job: job._id,
    jobNumber: job.jobNumber,
    type,
    actor,
    occurredAt: now,
    note,
    details: details && Object.keys(details).length ? compact(details) : undefined,
  });
}

async function createEvent(models, input, session) {
  return createDocument(models.ProcessingEventModel, eventDocument(input), session);
}

function firstPendingOperation(job) {
  return [...(job.routing || [])]
    .sort((left, right) => left.sequence - right.sequence)
    .find((operation) => operation.status !== 'COMPLETED');
}

function currentOperationSnapshot(operation) {
  if (!operation) return undefined;
  return {
    operationId: operation._id,
    operation: operation.operation,
    sequence: operation.sequence,
  };
}

function findOperation(job, operationId) {
  requireObjectId(operationId, 'Operation ID');
  if (typeof job.routing?.id === 'function') return job.routing.id(operationId);
  return (job.routing || []).find((operation) => String(operation._id) === String(operationId));
}

function setUndefined(document, field) {
  if (typeof document?.set === 'function') document.set(field, undefined);
  else document[field] = undefined;
}

function jobWithProgress(job) {
  const value = plain(job);
  return { ...value, progressPercent: calculateProcessingProgress(value.routing) };
}

export async function createProcessingJob({
  input,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProcessingError('Processing job input is required.');
  }
  if (Object.hasOwn(input, 'status')) {
    throw new ProcessingError('Processing job status is controlled by lifecycle actions.');
  }
  const inventoryMode = enumValue(input.inventoryMode, INVENTORY_MODES, 'Inventory mode');
  const target = normalizeTarget(input.target);
  const routing = normalizeRouting(input.routing);
  const expectedCompletionDate = optionalDate(
    input.expectedCompletionDate ?? input.schedule?.expectedCompletionDate,
    'Expected completion date',
  );
  const notes = optionalText(input.notes, 'Production notes', 3000);
  const models = resolveModels(modelOverrides);

  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const source = await loadAvailableSource({
      inventoryMode,
      input: input.input,
      models,
      session: activeSession,
    });
    const jobNumber = await nextInventoryReference(
      PROCESSING_REFERENCE_PREFIX,
      now,
      models.CounterModel,
      activeSession,
    );
    const job = await createDocument(models.ProcessingJobModel, {
      jobNumber,
      status: 'DRAFT',
      stoneSnapshot: stoneSnapshot(source.batch),
      inventoryMode,
      input: compact({
        batchId: source.batch._id,
        batchNumber: source.batch.batchNumber,
        slabIds: source.slabs.length ? source.slabs.map((slab) => slab._id) : undefined,
        slabNumbers: source.slabs.length ? source.slabs.map((slab) => slab.slabNumber) : undefined,
      }),
      target,
      routing,
      expectedCompletionDate,
      notes,
      createdBy: authenticatedActor,
      updatedBy: authenticatedActor,
    }, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'JOB_CREATED',
      actor: authenticatedActor,
      now,
      details: { toStatus: 'DRAFT' },
    }, activeSession);
    return { job, event };
  }});
}

async function requireJob(jobId, models, session) {
  requireObjectId(jobId, 'Processing job ID');
  const job = await findById(models.ProcessingJobModel, jobId, session);
  if (!job) throw new ProcessingError('Processing job was not found.', 404, 'JOB_NOT_FOUND');
  return job;
}

async function revalidateJobSource(job, models, session) {
  return loadAvailableSource({
    inventoryMode: job.inventoryMode,
    input: { batchId: job.input.batchId, slabIds: job.input.slabIds || [] },
    models,
    session,
  });
}

export async function updateProcessingJob({
  jobId,
  updates,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new ProcessingError('Processing job updates are required.');
  }
  const allowedFields = new Set(['target', 'routing', 'expectedCompletionDate', 'schedule', 'notes']);
  const unsupported = Object.keys(updates).find((field) => !allowedFields.has(field));
  if (unsupported) throw new ProcessingError(`Unsupported processing job field: ${unsupported}.`);
  if (!Object.keys(updates).length) throw new ProcessingError('At least one processing job field is required.');
  const models = resolveModels(modelOverrides);

  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (!['DRAFT', 'PLANNED'].includes(job.status)) {
      throw new ProcessingError('An active or closed processing job cannot be edited.', 409, 'INVALID_JOB_STATE');
    }
    if (job.status !== 'DRAFT' && ('target' in updates || 'routing' in updates)) {
      throw new ProcessingError('Target and routing can only be changed while the job is a draft.', 409, 'INVALID_JOB_STATE');
    }

    if ('target' in updates) job.target = normalizeTarget(updates.target);
    if ('routing' in updates) job.routing = normalizeRouting(updates.routing);
    if ('expectedCompletionDate' in updates || 'schedule' in updates) {
      job.expectedCompletionDate = optionalDate(
        updates.expectedCompletionDate ?? updates.schedule?.expectedCompletionDate,
        'Expected completion date',
      );
    }
    if ('notes' in updates) job.notes = optionalText(updates.notes, 'Production notes', 3000);
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'NOTE',
      actor: authenticatedActor,
      now,
      note: 'Processing job configuration updated.',
    }, activeSession);
    return { job, event };
  }});
}

export async function planProcessingJob({
  jobId,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (job.status !== 'DRAFT') {
      throw new ProcessingError('Only a draft processing job can be planned.', 409, 'INVALID_JOB_STATE');
    }
    if (!job.routing?.length) throw new ProcessingError('At least one processing operation is required.');
    if (job.routing.some((operation) => operation.status !== 'PENDING')) {
      throw new ProcessingError('A draft routing must contain only pending operations.', 409, 'INVALID_ROUTING_STATE');
    }
    await revalidateJobSource(job, models, activeSession);

    job.status = 'PLANNED';
    job.currentOperation = currentOperationSnapshot(firstPendingOperation(job));
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'JOB_PLANNED',
      actor: authenticatedActor,
      now,
      details: { fromStatus: 'DRAFT', toStatus: 'PLANNED' },
    }, activeSession);
    return { job, event };
  }});
}

export async function startProcessingJob({
  jobId,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (job.status !== 'PLANNED') {
      throw new ProcessingError('Only a planned processing job can be started.', 409, 'INVALID_JOB_STATE');
    }
    if (!job.routing?.length || job.routing.some((operation) => operation.status !== 'PENDING')) {
      throw new ProcessingError('The planned routing is not ready to start.', 409, 'INVALID_ROUTING_STATE');
    }

    const issue = await issueInventoryToProcessing({
      processingJobId: job._id,
      jobNumber: job.jobNumber,
      batchId: job.input.batchId,
      slabIds: job.input.slabIds || [],
      actor: authenticatedActor,
      now,
      models,
      session: activeSession,
    });

    Object.assign(job.input, issue.inputSnapshot);
    job.status = 'IN_PROGRESS';
    job.startedAt = now;
    job.currentOperation = currentOperationSnapshot(firstPendingOperation(job));
    job.updatedBy = authenticatedActor;
    if (typeof job.markModified === 'function') job.markModified('input');
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'JOB_STARTED',
      actor: authenticatedActor,
      now,
      details: {
        fromStatus: 'PLANNED',
        toStatus: 'IN_PROGRESS',
        quantity: issue.inputSnapshot.quantity,
        areaSqFt: issue.inputSnapshot.areaSqFt,
        progressPercent: 0,
      },
    }, activeSession);
    return { job, event, batch: issue.batch, slabs: issue.slabs, movements: issue.movements };
  }});
}

export async function startProcessingOperation({
  jobId,
  operationId,
  input = {},
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (job.status !== 'IN_PROGRESS') {
      throw new ProcessingError('Operations can only start on an in-progress job.', 409, 'INVALID_JOB_STATE');
    }
    const operation = findOperation(job, operationId);
    if (!operation) throw new ProcessingError('Processing operation was not found.', 404, 'OPERATION_NOT_FOUND');
    const next = firstPendingOperation(job);
    if (!next || String(next._id) !== String(operation._id) || operation.status !== 'PENDING') {
      throw new ProcessingError('Processing operations must be started in routing order.', 409, 'OPERATION_SEQUENCE');
    }
    if (job.routing.some((entry) => entry.status === 'IN_PROGRESS')) {
      throw new ProcessingError('Another processing operation is already in progress.', 409, 'OPERATION_ACTIVE');
    }

    operation.status = 'IN_PROGRESS';
    operation.actualStart = now;
    if (input.machineLabel !== undefined) {
      operation.machineLabel = optionalText(input.machineLabel, 'Machine or workstation label', 160);
    }
    if (input.notes !== undefined) operation.notes = appendNote(operation.notes, input.notes);
    job.currentOperation = currentOperationSnapshot(operation);
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'OPERATION_STARTED',
      actor: authenticatedActor,
      now,
      note: optionalText(input.notes, 'Operation notes', 2000),
      details: {
        operationId: operation._id,
        operation: operation.operation,
        sequence: operation.sequence,
        progressPercent: calculateProcessingProgress(job.routing),
      },
    }, activeSession);
    return { job, event };
  }});
}

export async function completeProcessingOperation({
  jobId,
  operationId,
  input = {},
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (job.status !== 'IN_PROGRESS') {
      throw new ProcessingError('Operations can only complete on an in-progress job.', 409, 'INVALID_JOB_STATE');
    }
    const operation = findOperation(job, operationId);
    if (!operation) throw new ProcessingError('Processing operation was not found.', 404, 'OPERATION_NOT_FOUND');
    const current = firstPendingOperation(job);
    if (!current || String(current._id) !== String(operation._id) || operation.status !== 'IN_PROGRESS') {
      throw new ProcessingError('Only the current operation can be completed.', 409, 'OPERATION_SEQUENCE');
    }

    operation.status = 'COMPLETED';
    operation.actualEnd = now;
    if (input.machineLabel !== undefined) {
      operation.machineLabel = optionalText(input.machineLabel, 'Machine or workstation label', 160);
    }
    if (input.notes !== undefined) operation.notes = appendNote(operation.notes, input.notes);
    const next = firstPendingOperation(job);
    if (next) {
      job.currentOperation = currentOperationSnapshot(next);
    } else {
      job.status = 'QC_PENDING';
      setUndefined(job, 'currentOperation');
    }
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'OPERATION_COMPLETED',
      actor: authenticatedActor,
      now,
      note: optionalText(input.notes, 'Operation notes', 2000),
      details: compact({
        operationId: operation._id,
        operation: operation.operation,
        sequence: operation.sequence,
        toStatus: job.status === 'QC_PENDING' ? 'QC_PENDING' : undefined,
        progressPercent: calculateProcessingProgress(job.routing),
      }),
    }, activeSession);
    return { job, event };
  }});
}

function normalizeVerifiedOutput(job, input, { required = false } = {}) {
  if (input === undefined || input === null) {
    if (required) throw new ProcessingError('Verified output is required for a passing quality check.');
    return undefined;
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new ProcessingError('Verified output must be an object.');
  }

  const quantity = finiteNumber(input.quantity, 'Verified output quantity', { integer: true });
  const areaSqFt = finiteNumber(input.areaSqFt, 'Verified output area', { optional: true });
  const dimensions = normalizeDimensions(input.dimensions, 'Verified output dimensions');
  const output = compact({
    quantity,
    areaSqFt: areaSqFt == null ? undefined : roundArea(areaSqFt),
    finish: optionalText(input.finish, 'Verified finish', 120),
    thicknessMm: finiteNumber(input.thicknessMm, 'Verified thickness', { optional: true, positive: true }),
    dimensions,
  });

  if (required && quantity === 0 && Number(areaSqFt || 0) === 0) {
    throw new ProcessingError('A passing quality check requires positive verified output.');
  }
  if (required && Number(job.input?.quantity || 0) > 0 && quantity <= 0) {
    throw new ProcessingError('A passing quality check requires positive verified output quantity.');
  }
  if (required && Number(job.input?.areaSqFt || 0) > 0 && Number(areaSqFt || 0) <= 0) {
    throw new ProcessingError('A passing quality check requires positive verified output area.');
  }
  calculateProcessingOutcome(job.input, output);

  const rawSlabOutputs = input.slabOutputs;
  if (job.inventoryMode === 'BATCH') {
    if (Array.isArray(rawSlabOutputs) && rawSlabOutputs.length) {
      throw new ProcessingError('Batch-mode output cannot contain individual slab output records.');
    }
    return output;
  }

  if (dimensions) {
    throw new ProcessingError('Individual-slab dimensions must be verified on each returned slab.');
  }
  if (!Array.isArray(rawSlabOutputs)) {
    throw new ProcessingError('Individual-slab output requires an explicit returned-slab list.');
  }
  const selected = new Set((job.input.slabIds || []).map(String));
  if (quantity > selected.size) {
    throw new ProcessingError(
      'One-to-many cutting output is not supported for individual-slab jobs. Use area-tracked batch processing.',
    );
  }
  const sourceSnapshots = new Map(
    (job.input.slabSnapshots || []).map((snapshot) => [String(snapshot.slabId), plain(snapshot)]),
  );
  const seen = new Set();
  const slabOutputs = rawSlabOutputs.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ProcessingError(`Returned slab ${index + 1} is invalid.`);
    }
    const slabId = requireObjectId(entry.slabId, 'Returned slab ID');
    const key = String(slabId);
    if (!selected.has(key)) throw new ProcessingError('A returned slab is not part of this processing job.');
    if (seen.has(key)) throw new ProcessingError('Returned slabs must be unique.');
    seen.add(key);
    const slabDimensions = normalizeDimensions(entry.dimensions, `Returned slab ${index + 1} dimensions`);
    if (output.thicknessMm != null && slabDimensions?.thicknessMm != null
      && Number(output.thicknessMm) !== Number(slabDimensions.thicknessMm)) {
      throw new ProcessingError('Returned slab thickness conflicts with the verified output thickness.');
    }
    const sourceSnapshot = sourceSnapshots.get(key) || {};
    const resolvedDimensions = compact({
      ...plain(sourceSnapshot.dimensions),
      ...slabDimensions,
      ...(output.thicknessMm == null ? {} : { thicknessMm: output.thicknessMm }),
    });
    const sourceGrossArea = Number(sourceSnapshot.grossAreaSqFt);
    const grossAreaSqFt = resolvedDimensions.lengthMm && resolvedDimensions.widthMm
      ? squareFeetFromMillimetres(resolvedDimensions.lengthMm, resolvedDimensions.widthMm)
      : (Number.isFinite(sourceGrossArea) && sourceGrossArea > 0
        ? roundArea(sourceGrossArea)
        : undefined);
    const usableAreaSqFt = roundArea(finiteNumber(
      entry.usableAreaSqFt,
      `Returned slab ${index + 1} usable area`,
      { positive: true },
    ));
    if (grossAreaSqFt != null && usableAreaSqFt > grossAreaSqFt) {
      throw new ProcessingError('Returned slab usable area cannot exceed its gross area.');
    }
    return {
      slabId,
      sourceSlabId: slabId,
      slabNumber: sourceSnapshot.slabNumber,
      usableAreaSqFt,
      grossAreaSqFt,
      finish: output.finish || sourceSnapshot.finish,
      dimensions: Object.keys(resolvedDimensions).length ? resolvedDimensions : undefined,
      location: plain(sourceSnapshot.location),
    };
  });
  if (quantity !== slabOutputs.length) {
    throw new ProcessingError('Verified output quantity must match the returned slab list.');
  }
  const slabArea = roundArea(slabOutputs.reduce((sum, slab) => sum + slab.usableAreaSqFt, 0));
  if (areaSqFt == null || Math.abs(roundArea(areaSqFt) - slabArea) > 0.0001) {
    throw new ProcessingError('Verified output area must equal the returned slab usable-area total.');
  }
  if (required && !slabOutputs.length) {
    throw new ProcessingError('A passing individual-slab quality check must return at least one slab.');
  }
  output.slabOutputs = slabOutputs;
  return output;
}

export async function recordProcessingQC({
  jobId,
  input,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ProcessingError('Quality-check input is required.');
  }
  const result = enumValue(input.result, PROCESSING_QC_RESULTS, 'Quality-check result');
  const notes = optionalText(input.notes, 'Quality-check notes', 3000);
  const observations = optionalText(input.observations, 'Quality-check observations', 3000);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (job.status !== 'QC_PENDING' || job.routing.some((operation) => operation.status !== 'COMPLETED')) {
      throw new ProcessingError('Quality control requires all processing operations to be complete.', 409, 'INVALID_JOB_STATE');
    }
    const verifiedOutput = normalizeVerifiedOutput(job, input.verifiedOutput, { required: result === 'PASS' });
    job.qualityCheck = compact({ result, checkedAt: now, notes, observations, verifiedOutput });
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'QC_RECORDED',
      actor: authenticatedActor,
      now,
      note: notes,
      details: compact({
        qcResult: result,
        observations,
        quantity: verifiedOutput?.quantity,
        areaSqFt: verifiedOutput?.areaSqFt,
        progressPercent: 100,
        verifiedOutput: verifiedOutput ? plain(verifiedOutput) : undefined,
      }),
    }, activeSession);
    return { job, event };
  }});
}

export async function completeProcessingJob({
  jobId,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (job.status !== 'QC_PENDING') {
      throw new ProcessingError('Only a QC-pending job can be completed.', 409, 'INVALID_JOB_STATE');
    }
    if (job.qualityCheck?.result !== 'PASS' || !job.qualityCheck?.verifiedOutput) {
      throw new ProcessingError('A passing quality check with verified output is required.', 409, 'QC_PASS_REQUIRED');
    }
    const verifiedOutput = normalizeVerifiedOutput(job, plain(job.qualityCheck.verifiedOutput), { required: true });
    const returned = await returnInventoryFromProcessing({
      processingJobId: job._id,
      jobNumber: job.jobNumber,
      batchId: job.input.batchId,
      slabIds: job.input.slabIds || [],
      verifiedOutput,
      actor: authenticatedActor,
      now,
      models,
      session: activeSession,
    });
    const finalizedOutput = returned.slabs?.length
      ? {
        ...verifiedOutput,
        slabOutputs: returned.slabs.map((slab) => {
          const value = plain(slab);
          const prior = verifiedOutput.slabOutputs?.find(
            (entry) => String(entry.slabId) === String(value._id),
          );
          return compact({
            slabId: value._id,
            sourceSlabId: prior?.sourceSlabId || value._id,
            slabNumber: value.slabNumber,
            grossAreaSqFt: Number(value.grossAreaSqFt),
            usableAreaSqFt: value.usableAreaSqFt == null
              ? Number(value.grossAreaSqFt)
              : Number(value.usableAreaSqFt),
            finish: value.finish || verifiedOutput.finish,
            dimensions: plain(value.dimensions),
            location: plain(value.location),
          });
        }),
      }
      : verifiedOutput;
    const outcome = calculateProcessingOutcome(job.input, finalizedOutput);

    job.output = finalizedOutput;
    job.qualityCheck.verifiedOutput = finalizedOutput;
    job.waste = outcome.waste;
    job.yieldPercent = outcome.yieldPercent;
    job.yieldBasis = outcome.yieldBasis;
    job.status = 'COMPLETED';
    job.completedAt = now;
    setUndefined(job, 'currentOperation');
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'JOB_COMPLETED',
      actor: authenticatedActor,
      now,
      details: {
        fromStatus: 'QC_PENDING',
        toStatus: 'COMPLETED',
        qcResult: 'PASS',
        quantity: finalizedOutput.quantity,
        areaSqFt: finalizedOutput.areaSqFt,
        verifiedOutput: finalizedOutput,
        progressPercent: 100,
      },
    }, activeSession);
    return {
      job,
      event,
      batch: returned.batch,
      slabs: returned.slabs,
      movements: returned.movements,
    };
  }});
}

export async function cancelProcessingJob({
  jobId,
  input,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const reason = requiredText(input?.reason, 'Cancellation reason', 1000);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    if (!['DRAFT', 'PLANNED'].includes(job.status)) {
      throw new ProcessingError(
        'Only a draft or planned job can be cancelled without material reconciliation.',
        409,
        'INVALID_JOB_STATE',
      );
    }
    const fromStatus = job.status;
    job.status = 'CANCELLED';
    job.cancelledAt = now;
    setUndefined(job, 'currentOperation');
    job.updatedBy = authenticatedActor;
    await saveDocument(job, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'JOB_CANCELLED',
      actor: authenticatedActor,
      now,
      note: reason,
      details: { fromStatus, toStatus: 'CANCELLED' },
    }, activeSession);
    return { job, event };
  }});
}

export async function addProcessingNote({
  jobId,
  input,
  actor,
  now = new Date(),
  models: modelOverrides,
  connection,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const note = requiredText(input?.note, 'Processing note', 3000);
  const models = resolveModels(modelOverrides);
  return runRequiredTransaction({ models, connection, session, work: async (activeSession) => {
    const job = await requireJob(jobId, models, activeSession);
    const event = await createEvent(models, {
      job,
      type: 'NOTE',
      actor: authenticatedActor,
      now,
      note,
    }, activeSession);
    return { job, event };
  }});
}

function normalizePagination(page = 1, limit = DEFAULT_PROCESSING_PAGE_SIZE) {
  const normalizedPage = finiteNumber(page, 'page', { integer: true, positive: true });
  const normalizedLimit = finiteNumber(limit, 'limit', { integer: true, positive: true });
  return { page: normalizedPage, limit: Math.min(normalizedLimit, MAX_PROCESSING_PAGE_SIZE) };
}

function applyQueryMethod(query, method, ...args) {
  return typeof query?.[method] === 'function' ? query[method](...args) : query;
}

export async function getProcessingSummary({ now = new Date(), models: modelOverrides } = {}) {
  const { ProcessingJobModel } = resolveModels(modelOverrides);
  const recentBoundary = new Date(new Date(now).getTime() - (30 * 24 * 60 * 60 * 1000));
  const aggregation = await ProcessingJobModel.aggregate([
    {
      $facet: {
        metrics: [
          {
            $group: {
              _id: null,
              plannedJobs: { $sum: { $cond: [{ $eq: ['$status', 'PLANNED'] }, 1, 0] } },
              inProgressJobs: { $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] } },
              qcPendingJobs: { $sum: { $cond: [{ $eq: ['$status', 'QC_PENDING'] }, 1, 0] } },
              completedRecently: {
                $sum: {
                  $cond: [
                    { $and: [{ $eq: ['$status', 'COMPLETED'] }, { $gte: ['$completedAt', recentBoundary] }] },
                    1,
                    0,
                  ],
                },
              },
              overdueJobs: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $in: ['$status', ['PLANNED', 'IN_PROGRESS', 'QC_PENDING']] },
                        { $ne: [{ $ifNull: ['$expectedCompletionDate', null] }, null] },
                        { $lt: ['$expectedCompletionDate', now] },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
          },
        ],
        material: [
          { $match: { status: { $in: ACTIVE_PROCESSING_JOB_STATUSES } } },
          {
            $group: {
              _id: null,
              jobs: { $sum: 1 },
              quantity: { $sum: { $ifNull: ['$input.quantity', 0] } },
              areaSqFt: { $sum: { $ifNull: ['$input.areaSqFt', 0] } },
              areaTrackedJobs: {
                $sum: { $cond: [{ $isNumber: '$input.areaSqFt' }, 1, 0] },
              },
            },
          },
        ],
      },
    },
  ]);
  const result = aggregation[0] || {};
  const metrics = result.metrics?.[0] || {};
  const material = result.material?.[0] || {};
  return {
    plannedJobs: Number(metrics.plannedJobs || 0),
    inProgressJobs: Number(metrics.inProgressJobs || 0),
    qcPendingJobs: Number(metrics.qcPendingJobs || 0),
    completedRecently: Number(metrics.completedRecently || 0),
    overdueJobs: Number(metrics.overdueJobs || 0),
    materialInProcessing: {
      jobs: Number(material.jobs || 0),
      quantity: Number(material.quantity || 0),
      areaSqFt: Number(material.areaTrackedJobs || 0) > 0 ? roundArea(material.areaSqFt || 0) : null,
      areaTrackedJobs: Number(material.areaTrackedJobs || 0),
    },
  };
}

export async function listProcessingJobs({
  page = 1,
  limit = DEFAULT_PROCESSING_PAGE_SIZE,
  search,
  status,
  operation,
  stoneSlug,
  models: modelOverrides,
} = {}) {
  const { ProcessingJobModel } = resolveModels(modelOverrides);
  const pagination = normalizePagination(page, limit);
  const filter = {};
  if (status) filter.status = enumValue(status, PROCESSING_JOB_STATUSES, 'Status');
  if (operation) {
    filter['currentOperation.operation'] = enumValue(operation, PROCESSING_OPERATION_TYPES, 'Operation');
  }
  if (stoneSlug) filter['stoneSnapshot.slug'] = String(stoneSlug).trim().toLowerCase().slice(0, 180);
  if (search) {
    const safe = escapeRegex(String(search).trim().slice(0, 160));
    if (safe) {
      const regex = new RegExp(safe, 'i');
      filter.$or = [
        { jobNumber: regex },
        { 'stoneSnapshot.name': regex },
        { 'stoneSnapshot.slug': regex },
        { 'input.batchNumber': regex },
        { 'input.slabNumbers': regex },
      ];
    }
  }

  let query = ProcessingJobModel.find(filter);
  query = applyQueryMethod(query, 'sort', { updatedAt: -1, _id: -1 });
  query = applyQueryMethod(query, 'skip', (pagination.page - 1) * pagination.limit);
  query = applyQueryMethod(query, 'limit', pagination.limit);
  query = applyQueryMethod(query, 'lean');
  const [jobs, total] = await Promise.all([query, ProcessingJobModel.countDocuments(filter)]);
  return {
    jobs: (jobs || []).map(jobWithProgress),
    total,
    page: pagination.page,
    pages: Math.max(1, Math.ceil(total / pagination.limit)),
    limit: pagination.limit,
  };
}

export async function getProcessingJob({ jobId, models: modelOverrides }) {
  const models = resolveModels(modelOverrides);
  const job = await requireJob(jobId, models, null);
  return jobWithProgress(job);
}

export async function listProcessingEvents({
  jobId,
  page = 1,
  limit = DEFAULT_PROCESSING_PAGE_SIZE,
  models: modelOverrides,
}) {
  requireObjectId(jobId, 'Processing job ID');
  const models = resolveModels(modelOverrides);
  const exists = await models.ProcessingJobModel.exists({ _id: jobId });
  if (!exists) throw new ProcessingError('Processing job was not found.', 404, 'JOB_NOT_FOUND');
  const pagination = normalizePagination(page, limit);
  const filter = { job: jobId };
  let query = models.ProcessingEventModel.find(filter);
  query = applyQueryMethod(query, 'sort', { occurredAt: -1, _id: -1 });
  query = applyQueryMethod(query, 'skip', (pagination.page - 1) * pagination.limit);
  query = applyQueryMethod(query, 'limit', pagination.limit);
  query = applyQueryMethod(query, 'lean');
  const [events, total] = await Promise.all([query, models.ProcessingEventModel.countDocuments(filter)]);
  return {
    events,
    total,
    page: pagination.page,
    pages: Math.max(1, Math.ceil(total / pagination.limit)),
    limit: pagination.limit,
  };
}

export async function listProcessingMovements({
  jobId,
  page = 1,
  limit = DEFAULT_PROCESSING_PAGE_SIZE,
  models: modelOverrides,
}) {
  requireObjectId(jobId, 'Processing job ID');
  const models = resolveModels(modelOverrides);
  const exists = await models.ProcessingJobModel.exists({ _id: jobId });
  if (!exists) throw new ProcessingError('Processing job was not found.', 404, 'JOB_NOT_FOUND');
  const pagination = normalizePagination(page, limit);
  const filter = { relatedProcessingJobId: jobId };
  let query = models.InventoryMovementModel.find(filter);
  query = applyQueryMethod(query, 'sort', { occurredAt: 1, _id: 1 });
  query = applyQueryMethod(query, 'skip', (pagination.page - 1) * pagination.limit);
  query = applyQueryMethod(query, 'limit', pagination.limit);
  query = applyQueryMethod(query, 'populate', 'batch', 'batchNumber');
  query = applyQueryMethod(query, 'populate', 'slab', 'slabNumber');
  query = applyQueryMethod(query, 'lean');
  const [movements, total] = await Promise.all([
    query,
    models.InventoryMovementModel.countDocuments(filter),
  ]);
  return {
    movements: movements || [],
    total,
    page: pagination.page,
    pages: Math.max(1, Math.ceil(total / pagination.limit)),
    limit: pagination.limit,
  };
}
