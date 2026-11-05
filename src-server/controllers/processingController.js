import mongoose from 'mongoose';
import {
  ProcessingError,
  addProcessingNote,
  cancelProcessingJob,
  completeProcessingJob,
  completeProcessingOperation,
  createProcessingJob,
  getProcessingJob,
  getProcessingSummary,
  listProcessingEvents,
  listProcessingMovements,
  listProcessingJobs,
  planProcessingJob,
  recordProcessingQC,
  startProcessingJob,
  startProcessingOperation,
  updateProcessingJob,
} from '../services/processingService.js';
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
} from '../utils/processingValidation.js';

const AUTHENTICATED_ADMIN_ACTOR = 'authenticated-admin';

function invalidObjectId(value) {
  return !mongoose.isValidObjectId(value);
}

function adminJson(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(adminJson);
  if (typeof value?.toObject === 'function') {
    return adminJson(value.toObject({ versionKey: false }));
  }
  if (value instanceof Date || value.constructor !== Object) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '__v')
      .map(([key, item]) => [key, adminJson(item)]),
  );
}

function validationFailure(res, validation) {
  if (!validation.error) return false;
  res.status(400).json({ error: validation.error });
  return true;
}

function handleProcessingError(res, error, fallbackMessage) {
  if (error instanceof ProcessingError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error?.name === 'ValidationError' || error?.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid processing data.' });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ error: 'A processing record with that reference already exists.' });
  }
  console.error(`${fallbackMessage}:`, error?.name || 'Unexpected error');
  return res.status(500).json({ error: fallbackMessage });
}

function invalidJobId(res, value) {
  if (!invalidObjectId(value)) return false;
  res.status(400).json({ error: 'Invalid processing job ID.' });
  return true;
}

export async function processingSummary(_req, res) {
  try {
    const summary = await getProcessingSummary({});
    return res.json({ summary: adminJson(summary) });
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to load processing summary.');
  }
}

export async function listJobs(req, res) {
  const validation = parseProcessingListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await listProcessingJobs(validation.value);
    return res.json(adminJson({ ...result, limit: result.limit ?? validation.value.limit }));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to load processing jobs.');
  }
}

export async function createJob(req, res) {
  const validation = validateProcessingJobCreate(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await createProcessingJob({
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.status(201).json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to create processing job.');
  }
}

export async function getJob(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;

  try {
    const job = await getProcessingJob({ jobId: req.params.id });
    return res.json({ job: adminJson(job) });
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to load processing job.');
  }
}

export async function updateJob(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = validateProcessingJobUpdate(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await updateProcessingJob({
      jobId: req.params.id,
      updates: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    const job = result?.job ?? result;
    return res.json({ job: adminJson(job) });
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to update processing job.');
  }
}

export async function planJob(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = validateProcessingEmptyAction(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await planProcessingJob({
      jobId: req.params.id,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to plan processing job.');
  }
}

export async function startJob(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = validateProcessingEmptyAction(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await startProcessingJob({
      jobId: req.params.id,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to start processing job.');
  }
}

export async function cancelJob(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = validateProcessingCancellation(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await cancelProcessingJob({
      jobId: req.params.id,
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to cancel processing job.');
  }
}

export async function addNote(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = validateProcessingNote(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await addProcessingNote({
      jobId: req.params.id,
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to add processing note.');
  }
}

export async function startOperation(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  if (invalidObjectId(req.params.operationId)) {
    return res.status(400).json({ error: 'Invalid processing operation ID.' });
  }
  const validation = validateProcessingOperationAction(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await startProcessingOperation({
      jobId: req.params.id,
      operationId: req.params.operationId,
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to start processing operation.');
  }
}

export async function completeOperation(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  if (invalidObjectId(req.params.operationId)) {
    return res.status(400).json({ error: 'Invalid processing operation ID.' });
  }
  const validation = validateProcessingOperationAction(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await completeProcessingOperation({
      jobId: req.params.id,
      operationId: req.params.operationId,
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to complete processing operation.');
  }
}

export async function recordQualityCheck(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = validateProcessingQualityCheck(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await recordProcessingQC({
      jobId: req.params.id,
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to record processing quality check.');
  }
}

export async function completeJob(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = validateProcessingEmptyAction(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await completeProcessingJob({
      jobId: req.params.id,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json(adminJson(result));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to complete processing job.');
  }
}

export async function listEvents(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = parseProcessingEventListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await listProcessingEvents({
      jobId: req.params.id,
      ...validation.value,
    });
    return res.json(adminJson({ ...result, limit: result.limit ?? validation.value.limit }));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to load processing events.');
  }
}

export async function listMovements(req, res) {
  if (invalidJobId(res, req.params.id)) return undefined;
  const validation = parseProcessingEventListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await listProcessingMovements({
      jobId: req.params.id,
      ...validation.value,
    });
    return res.json(adminJson({ ...result, limit: result.limit ?? validation.value.limit }));
  } catch (error) {
    return handleProcessingError(res, error, 'Failed to load processing inventory movements.');
  }
}
