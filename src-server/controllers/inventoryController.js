import mongoose from 'mongoose';
import {
  InventoryError,
  adjustInventoryStock,
  createInventoryBatch,
  createInventorySlab,
  getInventoryBatch,
  getInventorySummary,
  listInventoryBatches,
  listInventoryMovements,
  listInventorySlabs,
  transferInventory,
  updateInventoryBatch,
  updateInventorySlab,
} from '../services/inventoryService.js';
import {
  parseInventoryChildListQuery,
  parseInventoryListQuery,
  validateInventoryAdjustment,
  validateInventoryBatchCreate,
  validateInventoryBatchUpdate,
  validateInventorySlabCreate,
  validateInventorySlabUpdate,
  validateInventoryTransfer,
} from '../utils/inventoryValidation.js';

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

function handleInventoryError(res, error, fallbackMessage) {
  if (error instanceof InventoryError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error?.name === 'ValidationError' || error?.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid inventory data.' });
  }
  if (error?.code === 11000) {
    return res.status(409).json({ error: 'An inventory record with that reference already exists.' });
  }
  console.error(`${fallbackMessage}:`, error?.name || 'Unexpected error');
  return res.status(500).json({ error: fallbackMessage });
}

export async function inventorySummary(_req, res) {
  try {
    const summary = await getInventorySummary({});
    return res.json({ summary: adminJson(summary) });
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to load inventory summary.');
  }
}

export async function listBatches(req, res) {
  const validation = parseInventoryListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await listInventoryBatches(validation.value);
    return res.json(adminJson({ ...result, limit: result.limit ?? validation.value.limit }));
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to load inventory batches.');
  }
}

export async function createBatch(req, res) {
  const validation = validateInventoryBatchCreate(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await createInventoryBatch({
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.status(201).json(adminJson(result));
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to create inventory batch.');
  }
}

export async function getBatch(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid batch ID.' });

  try {
    const batch = await getInventoryBatch({ batchId: req.params.id });
    return res.json({ batch: adminJson(batch) });
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to load inventory batch.');
  }
}

export async function updateBatch(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid batch ID.' });
  const validation = validateInventoryBatchUpdate(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const batch = await updateInventoryBatch({
      batchId: req.params.id,
      updates: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json({ batch: adminJson(batch) });
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to update inventory batch.');
  }
}

export async function adjustBatch(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid batch ID.' });
  const validation = validateInventoryAdjustment(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await adjustInventoryStock({
      batchId: req.params.id,
      ...validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.status(201).json(adminJson(result));
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to adjust inventory stock.');
  }
}

export async function transferBatch(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid batch ID.' });
  const validation = validateInventoryTransfer(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await transferInventory({
      batchId: req.params.id,
      ...validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.status(201).json(adminJson(result));
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to transfer inventory.');
  }
}

export async function listMovements(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid batch ID.' });
  const validation = parseInventoryChildListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await listInventoryMovements({ batchId: req.params.id, ...validation.value });
    return res.json(adminJson({ ...result, limit: result.limit ?? validation.value.limit }));
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to load inventory movements.');
  }
}

export async function createSlab(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid batch ID.' });
  const validation = validateInventorySlabCreate(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await createInventorySlab({
      batchId: req.params.id,
      input: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.status(201).json(adminJson(result));
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to create inventory slab.');
  }
}

export async function listSlabs(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid batch ID.' });
  const validation = parseInventoryChildListQuery(req.query);
  if (validationFailure(res, validation)) return undefined;

  try {
    const result = await listInventorySlabs({ batchId: req.params.id, ...validation.value });
    return res.json(adminJson({ ...result, limit: result.limit ?? validation.value.limit }));
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to load inventory slabs.');
  }
}

export async function updateSlab(req, res) {
  if (invalidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid slab ID.' });
  const validation = validateInventorySlabUpdate(req.body);
  if (validationFailure(res, validation)) return undefined;

  try {
    const slab = await updateInventorySlab({
      slabId: req.params.id,
      updates: validation.value,
      actor: AUTHENTICATED_ADMIN_ACTOR,
    });
    return res.json({ slab: adminJson(slab) });
  } catch (error) {
    return handleInventoryError(res, error, 'Failed to update inventory slab.');
  }
}
