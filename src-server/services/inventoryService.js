import mongoose from 'mongoose';
import { getStoneById, getStoneBySlug } from '../../src/lib/catalog.js';
import {
  ADJUSTMENT_DIRECTIONS,
  AREA_SQ_MM_PER_SQ_FT,
  DEFAULT_INVENTORY_PAGE_SIZE,
  INVENTORY_MODES,
  INVENTORY_REFERENCE_PREFIXES,
  INVENTORY_STATUSES,
  MAX_INVENTORY_PAGE_SIZE,
} from '../constants/inventory.js';
import Counter from '../models/Counter.js';
import InventoryBatch from '../models/InventoryBatch.js';
import InventoryMovement from '../models/InventoryMovement.js';
import Slab from '../models/Slab.js';
import { escapeRegex } from '../utils/security.js';

const INDIA_OFFSET_MS = 330 * 60 * 1000;
const AREA_PRECISION = 4;

const DEFAULT_MODELS = Object.freeze({
  CounterModel: Counter,
  InventoryBatchModel: InventoryBatch,
  InventoryMovementModel: InventoryMovement,
  SlabModel: Slab,
});

const BATCH_METADATA_FIELDS = Object.freeze([
  'receivedDate',
  'externalLotNumber',
  'source',
  'finish',
  'thicknessMm',
  'nominalDimensions',
  'cost',
  'selling',
  'grade',
  'shade',
  'notes',
  'status',
]);

const SLAB_METADATA_FIELDS = Object.freeze([
  'grade',
  'shade',
  'defects',
  'notes',
]);

export class InventoryError extends Error {
  constructor(message, status = 400, code = 'INVENTORY_ERROR') {
    super(message);
    this.name = 'InventoryError';
    this.status = status;
    this.code = code;
  }
}

function resolveModels(overrides = {}) {
  return { ...DEFAULT_MODELS, ...overrides };
}

function requireActor(actor) {
  const value = String(actor || '').trim();
  if (!value) throw new InventoryError('An authenticated actor is required.', 401, 'ACTOR_REQUIRED');
  if (value.length > 120) throw new InventoryError('Actor identifier is too long.');
  return value;
}

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) {
    throw new InventoryError(`${field} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

function requiredString(value, field, maxLength) {
  const normalized = optionalString(value, field, maxLength);
  if (!normalized) throw new InventoryError(`${field} is required.`);
  return normalized;
}

function numberValue(value, field, {
  optional = false,
  integer = false,
  positive = false,
} = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new InventoryError(`${field} is required.`);
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized)) throw new InventoryError(`${field} must be a finite number.`);
  if (integer && !Number.isInteger(normalized)) throw new InventoryError(`${field} must be a whole number.`);
  if (positive ? normalized <= 0 : normalized < 0) {
    throw new InventoryError(`${field} must be ${positive ? 'greater than zero' : 'zero or greater'}.`);
  }
  return normalized;
}

function dateValue(value, field) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new InventoryError(`${field} must be a valid date.`);
  return date;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''),
  );
}

function roundArea(value) {
  return Number(Number(value).toFixed(AREA_PRECISION));
}

function requireObjectId(value, field) {
  if (!mongoose.isValidObjectId(value)) {
    throw new InventoryError(`${field} is invalid.`, 400, 'INVALID_ID');
  }
  return value;
}

function hasPositiveInventory(batch) {
  return Number(batch?.quantity?.currentCount || 0) > 0
    || Number(batch?.area?.availableSqFt || 0) > 0;
}

function availableArea(batch) {
  const value = batch?.area?.availableSqFt;
  return value === undefined || value === null ? undefined : Number(value);
}

function slabInventoryArea(slab) {
  return Number(slab.usableAreaSqFt ?? slab.grossAreaSqFt);
}

function ensureKnownEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new InventoryError(`${field} is invalid.`);
  return value;
}

export function squareFeetFromMillimetres(lengthMm, widthMm) {
  const length = numberValue(lengthMm, 'lengthMm', { positive: true });
  const width = numberValue(widthMm, 'widthMm', { positive: true });
  return roundArea((length * width) / AREA_SQ_MM_PER_SQ_FT);
}

export function formatInventoryReference(prefix, date, sequence) {
  const normalizedPrefix = requiredString(prefix, 'Reference prefix', 10).toUpperCase();
  const normalizedSequence = numberValue(sequence, 'Reference sequence', { integer: true, positive: true });
  const indiaTime = new Date(new Date(date).getTime() + INDIA_OFFSET_MS);
  if (Number.isNaN(indiaTime.getTime())) throw new InventoryError('Reference date is invalid.');
  return `${normalizedPrefix}-${indiaTime.getUTCFullYear()}-${String(normalizedSequence).padStart(4, '0')}`;
}

export async function nextInventoryReference(prefix, date = new Date(), CounterModel = Counter, session = null) {
  const normalizedPrefix = requiredString(prefix, 'Reference prefix', 10).toUpperCase();
  const indiaTime = new Date(new Date(date).getTime() + INDIA_OFFSET_MS);
  if (Number.isNaN(indiaTime.getTime())) throw new InventoryError('Reference date is invalid.');
  const year = indiaTime.getUTCFullYear();
  const options = { new: true, upsert: true };
  if (session) options.session = session;

  const counter = await CounterModel.findOneAndUpdate(
    { _id: `${normalizedPrefix.toLowerCase()}_${year}` },
    { $inc: { seq: 1 } },
    options,
  );
  return formatInventoryReference(normalizedPrefix, date, counter.seq);
}

export function canonicalStoneSnapshot(stoneInput, {
  findById = getStoneById,
  findBySlug = getStoneBySlug,
} = {}) {
  const requested = stoneInput?.stoneRef || stoneInput || {};
  const stoneId = optionalString(requested.stoneId ?? requested.id, 'stoneId', 80);
  const slug = optionalString(requested.slug, 'stone slug', 180)?.toLowerCase();
  if (!stoneId && !slug) {
    throw new InventoryError('A canonical catalog stone ID or slug is required.', 400, 'INVALID_STONE');
  }

  const byId = stoneId ? findById(stoneId) : null;
  const bySlug = slug ? findBySlug(slug) : null;
  if ((stoneId && !byId) || (slug && !bySlug) || (byId && bySlug && byId.id !== bySlug.id)) {
    throw new InventoryError('The selected catalog stone does not exist.', 400, 'INVALID_STONE');
  }

  const stone = byId || bySlug;
  return compactObject({
    stoneId: String(stone.id),
    slug: String(stone.slug),
    name: String(stone.name),
    materialFamily: stone.materialFamily ? String(stone.materialFamily) : undefined,
  });
}

export function normalizeInventoryLocation(input, { required = true } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (!required) return undefined;
    throw new InventoryError('Location is required.');
  }

  const warehouse = optionalString(input.warehouse, 'Warehouse', 160);
  if (!warehouse) {
    if (!required && !input.zone && !input.rack) return undefined;
    throw new InventoryError('Location warehouse is required.');
  }

  return compactObject({
    warehouse,
    zone: optionalString(input.zone, 'Location zone', 100),
    rack: optionalString(input.rack, 'Location rack', 100),
  });
}

export function locationsEqual(left, right) {
  const normalize = (location) => ({
    warehouse: String(location?.warehouse || '').trim().toLocaleLowerCase(),
    zone: String(location?.zone || '').trim().toLocaleLowerCase(),
    rack: String(location?.rack || '').trim().toLocaleLowerCase(),
  });
  const a = normalize(left);
  const b = normalize(right);
  return a.warehouse === b.warehouse && a.zone === b.zone && a.rack === b.rack;
}

export function inventoryCostValue(areaSqFt, cost) {
  if (areaSqFt === undefined || areaSqFt === null || cost?.costPerSqFt === undefined || !cost?.currency) {
    return null;
  }
  const area = numberValue(areaSqFt, 'Available area', { optional: false });
  const rate = numberValue(cost.costPerSqFt, 'Cost per square foot', { optional: false });
  return {
    currency: String(cost.currency).trim().toUpperCase(),
    amount: Number((area * rate).toFixed(2)),
  };
}

export function normalizeInventoryPagination(page = 1, limit = DEFAULT_INVENTORY_PAGE_SIZE) {
  const normalizedPage = numberValue(page, 'page', { integer: true, positive: true });
  const requestedLimit = numberValue(limit, 'limit', { integer: true, positive: true });
  return {
    page: normalizedPage,
    limit: Math.min(requestedLimit, MAX_INVENTORY_PAGE_SIZE),
  };
}

function normalizeSource(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new InventoryError('Source must be an object.');
  const source = compactObject({
    quarry: optionalString(input.quarry, 'Quarry', 180),
    origin: optionalString(input.origin, 'Origin', 180),
    supplier: optionalString(input.supplier, 'Supplier', 180),
  });
  return Object.keys(source).length ? source : undefined;
}

function normalizeDimensions(input, { required = false, thickness = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (required) throw new InventoryError('Dimensions are required.');
    return undefined;
  }
  const lengthMm = numberValue(input.lengthMm, 'Length', { optional: !required, positive: true });
  const widthMm = numberValue(input.widthMm, 'Width', { optional: !required, positive: true });
  if ((lengthMm == null) !== (widthMm == null)) {
    throw new InventoryError('Both length and width are required when dimensions are supplied.');
  }
  if (lengthMm == null && widthMm == null) return undefined;
  return compactObject({
    lengthMm,
    widthMm,
    thicknessMm: thickness
      ? numberValue(input.thicknessMm, 'Thickness', { optional: true, positive: true })
      : undefined,
  });
}

function normalizeCost(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new InventoryError('Cost must be an object.');
  const costPerSqFt = numberValue(input.costPerSqFt, 'Cost per square foot', { optional: true });
  const currency = optionalString(input.currency, 'Cost currency', 3)?.toUpperCase();
  if (costPerSqFt != null && !currency) {
    throw new InventoryError('Currency is required when cost per square foot is supplied.');
  }
  if (currency && currency.length !== 3) throw new InventoryError('Cost currency must be a 3-letter code.');
  if (costPerSqFt == null && currency) throw new InventoryError('Cost per square foot is required when currency is supplied.');
  return costPerSqFt == null ? undefined : { costPerSqFt, currency };
}

function normalizeSelling(input) {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== 'object' || Array.isArray(input)) throw new InventoryError('Selling price must be an object.');
  const pricePerSqFt = numberValue(input.pricePerSqFt, 'Selling price per square foot', { optional: true });
  const currency = optionalString(input.currency, 'Selling currency', 3)?.toUpperCase();
  if (pricePerSqFt != null && !currency) {
    throw new InventoryError('Currency is required when selling price per square foot is supplied.');
  }
  if (currency && currency.length !== 3) throw new InventoryError('Selling currency must be a 3-letter code.');
  if (pricePerSqFt == null && currency) {
    throw new InventoryError('Selling price per square foot is required when currency is supplied.');
  }
  return pricePerSqFt == null ? undefined : { pricePerSqFt, currency };
}

async function findById(Model, id, session = null) {
  const query = Model.findById(id);
  return session && typeof query?.session === 'function' ? query.session(session) : query;
}

async function findOne(Model, filter, session = null) {
  const query = Model.findOne(filter);
  return session && typeof query?.session === 'function' ? query.session(session) : query;
}

async function createDocument(Model, document, session = null) {
  if (!session) return Model.create(document);
  const created = await Model.create([document], { session });
  return created[0];
}

async function runInventoryTransaction(InventoryBatchModel, providedSession, work) {
  if (providedSession) return work(providedSession);
  if (typeof InventoryBatchModel?.db?.startSession !== 'function') return work(null);

  const ownedSession = await InventoryBatchModel.db.startSession();
  let result;
  try {
    await ownedSession.withTransaction(async () => {
      result = await work(ownedSession);
    });
    return result;
  } finally {
    await ownedSession.endSession();
  }
}

function receiptMovement({ batch, slab, quantity, areaSqFt, location, actor, now, reason }) {
  return {
    type: 'RECEIPT',
    inventoryMode: batch.inventoryMode,
    batch: batch._id,
    slab: slab?._id,
    quantityDelta: quantity,
    areaDeltaSqFt: areaSqFt,
    balanceAfter: compactObject({
      quantity: Number(batch.quantity?.currentCount || 0),
      areaSqFt: availableArea(batch),
    }),
    toLocation: location,
    reason,
    actor,
    occurredAt: now,
  };
}

function normalizeCreateBatch(input, actor, now) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new InventoryError('Batch input is required.');
  }

  const inventoryMode = ensureKnownEnum(input.inventoryMode, INVENTORY_MODES, 'Inventory mode');
  const receivedCount = numberValue(input.quantity?.receivedCount ?? input.receivedCount ?? 0, 'Received count', {
    integer: true,
  });
  const receivedSqFt = numberValue(input.area?.receivedSqFt ?? input.receivedSqFt, 'Received area', {
    optional: true,
  });

  if (inventoryMode === 'BATCH' && receivedCount === 0 && Number(receivedSqFt || 0) === 0) {
    throw new InventoryError('Batch inventory requires a positive received quantity or area.');
  }
  if (inventoryMode === 'INDIVIDUAL_SLAB' && (receivedCount > 0 || Number(receivedSqFt || 0) > 0)) {
    throw new InventoryError('Individual-slab batch totals are created from actual slab receipts.');
  }

  const location = inventoryMode === 'BATCH'
    ? normalizeInventoryLocation(input.location)
    : undefined;
  if (inventoryMode === 'INDIVIDUAL_SLAB' && input.location) {
    throw new InventoryError('Individual-slab locations must be recorded on each slab.');
  }

  const requestedStatus = input.status || (inventoryMode === 'BATCH' ? 'AVAILABLE' : 'DRAFT');
  const allowedInitialStatuses = inventoryMode === 'BATCH' ? ['AVAILABLE', 'HOLD'] : ['DRAFT'];
  if (!allowedInitialStatuses.includes(requestedStatus)) {
    throw new InventoryError(`A new ${inventoryMode} batch cannot start in ${requestedStatus} status.`);
  }

  return {
    stoneRef: canonicalStoneSnapshot(input.stoneRef || input),
    inventoryMode,
    receivedDate: dateValue(input.receivedDate, 'Received date'),
    externalLotNumber: optionalString(input.externalLotNumber, 'External lot number', 160),
    source: normalizeSource(input.source),
    finish: optionalString(input.finish, 'Finish', 120),
    thicknessMm: numberValue(input.thicknessMm, 'Thickness', { optional: true, positive: true }),
    nominalDimensions: normalizeDimensions(input.nominalDimensions),
    quantity: { receivedCount, currentCount: receivedCount },
    area: receivedSqFt == null ? undefined : {
      receivedSqFt,
      availableSqFt: receivedSqFt,
      basis: 'VERIFIED',
    },
    cost: normalizeCost(input.cost),
    selling: normalizeSelling(input.selling),
    location,
    grade: optionalString(input.grade, 'Grade', 100),
    shade: optionalString(input.shade, 'Shade', 100),
    notes: optionalString(input.notes, 'Notes', 3000),
    status: requestedStatus,
    createdBy: actor,
    updatedBy: actor,
    now,
  };
}

export async function createInventoryBatch({
  input,
  actor,
  now = new Date(),
  models: modelOverrides,
  session = null,
}) {
  const authenticatedActor = requireActor(actor);
  const models = resolveModels(modelOverrides);
  const normalized = normalizeCreateBatch(input, authenticatedActor, now);

  return runInventoryTransaction(models.InventoryBatchModel, session, async (activeSession) => {
    const batchNumber = await nextInventoryReference(
      INVENTORY_REFERENCE_PREFIXES.BATCH,
      now,
      models.CounterModel,
      activeSession,
    );
    const { now: _ignored, ...batchDocument } = normalized;
    batchDocument.batchNumber = batchNumber;

    const batch = await createDocument(models.InventoryBatchModel, batchDocument, activeSession);
    const movements = [];

    if (batch.inventoryMode === 'BATCH') {
      const movement = await createDocument(models.InventoryMovementModel, receiptMovement({
        batch,
        quantity: Number(batch.quantity.currentCount || 0),
        areaSqFt: Number(batch.area?.availableSqFt || 0),
        location: batch.location,
        actor: authenticatedActor,
        now,
        reason: 'Initial inventory receipt.',
      }), activeSession);
      movements.push(movement);
    }

    return { batch, movements, slabs: [] };
  });
}

export async function getInventorySummary({ models: modelOverrides } = {}) {
  const { InventoryBatchModel, SlabModel } = resolveModels(modelOverrides);
  const [aggregation, individualSlabs] = await Promise.all([
    InventoryBatchModel.aggregate([
      {
        $facet: {
          metrics: [
            { $match: { status: { $ne: 'ARCHIVED' } } },
            {
              $group: {
                _id: null,
                activeBatches: { $sum: 1 },
                availableBatches: {
                  $sum: { $cond: [{ $eq: ['$status', 'AVAILABLE'] }, 1, 0] },
                },
                depletedBatches: {
                  $sum: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ['$status', 'DEPLETED'] },
                          {
                            $and: [
                              { $in: ['$status', ['AVAILABLE', 'HOLD']] },
                              { $lte: [{ $ifNull: ['$quantity.currentCount', 0] }, 0] },
                              { $lte: [{ $ifNull: ['$area.availableSqFt', 0] }, 0] },
                            ],
                          },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                availableAreaTrackedBatches: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $eq: ['$status', 'AVAILABLE'] },
                          { $isNumber: '$area.availableSqFt' },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                totalAvailableSqFt: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', 'AVAILABLE'] },
                      { $ifNull: ['$area.availableSqFt', 0] },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          inventoryCostValues: [
            {
              $match: {
                status: { $in: ['AVAILABLE', 'HOLD'] },
                'area.availableSqFt': { $gt: 0 },
                'cost.costPerSqFt': { $gte: 0 },
                'cost.currency': { $type: 'string' },
              },
            },
            {
              $group: {
                _id: '$cost.currency',
                amount: { $sum: { $multiply: ['$area.availableSqFt', '$cost.costPerSqFt'] } },
                batches: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]),
    SlabModel.countDocuments({ status: { $in: ['AVAILABLE', 'HOLD'] } }),
  ]);

  const result = aggregation[0] || {};
  const metrics = result.metrics?.[0] || {};
  const availableAreaTrackedBatches = Number(metrics.availableAreaTrackedBatches || 0);
  return {
    activeBatches: Number(metrics.activeBatches || 0),
    availableBatches: Number(metrics.availableBatches || 0),
    availableAreaTrackedBatches,
    totalAvailableSqFt: availableAreaTrackedBatches > 0
      ? roundArea(metrics.totalAvailableSqFt || 0)
      : null,
    individualSlabs: Number(individualSlabs || 0),
    depletedOrZeroStockBatches: Number(metrics.depletedBatches || 0),
    depletedBatches: Number(metrics.depletedBatches || 0),
    inventoryCostValues: (result.inventoryCostValues || []).map((entry) => ({
      currency: entry._id,
      amount: Number(Number(entry.amount || 0).toFixed(2)),
      batches: Number(entry.batches || 0),
    })),
  };
}

function applyQueryMethod(query, method, ...args) {
  return typeof query?.[method] === 'function' ? query[method](...args) : query;
}

export async function listInventoryBatches({
  page = 1,
  limit = DEFAULT_INVENTORY_PAGE_SIZE,
  search,
  stoneSlug,
  finish,
  status,
  warehouse,
  models: modelOverrides,
} = {}) {
  const { InventoryBatchModel } = resolveModels(modelOverrides);
  const pagination = normalizeInventoryPagination(page, limit);
  const filter = {};

  if (stoneSlug) filter['stoneRef.slug'] = String(stoneSlug).trim().toLowerCase();
  if (finish) filter.finish = String(finish).trim();
  if (status) filter.status = ensureKnownEnum(status, INVENTORY_STATUSES, 'Status');
  if (warehouse) {
    const safeWarehouse = escapeRegex(String(warehouse).trim().slice(0, 160));
    if (safeWarehouse) filter['location.warehouse'] = new RegExp(safeWarehouse, 'i');
  }
  if (search) {
    const safeSearch = escapeRegex(String(search).trim().slice(0, 160));
    if (safeSearch) {
      const regex = new RegExp(safeSearch, 'i');
      filter.$or = [
        { batchNumber: regex },
        { externalLotNumber: regex },
        { 'stoneRef.name': regex },
        { 'stoneRef.slug': regex },
      ];
    }
  }

  let query = InventoryBatchModel.find(filter);
  query = applyQueryMethod(query, 'sort', { updatedAt: -1, _id: -1 });
  query = applyQueryMethod(query, 'skip', (pagination.page - 1) * pagination.limit);
  query = applyQueryMethod(query, 'limit', pagination.limit);
  query = applyQueryMethod(query, 'lean');

  const [batches, total] = await Promise.all([
    query,
    InventoryBatchModel.countDocuments(filter),
  ]);
  return {
    batches,
    total,
    page: pagination.page,
    pages: Math.max(1, Math.ceil(total / pagination.limit)),
  };
}

export async function getInventoryBatch({ batchId, models: modelOverrides }) {
  requireObjectId(batchId, 'Batch ID');
  const { InventoryBatchModel } = resolveModels(modelOverrides);
  const batch = await findById(InventoryBatchModel, batchId);
  if (!batch) throw new InventoryError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
  return batch;
}

function statusForMetadataUpdate(batch, requestedStatus) {
  if (!requestedStatus || requestedStatus === batch.status) return batch.status;
  ensureKnownEnum(requestedStatus, INVENTORY_STATUSES, 'Status');
  if (batch.status === 'ARCHIVED') throw new InventoryError('Archived batches cannot be changed.', 409);
  if (['DRAFT', 'DEPLETED'].includes(requestedStatus)) {
    throw new InventoryError(`${requestedStatus} status is derived from inventory balances.`);
  }
  if (requestedStatus === 'AVAILABLE' && !hasPositiveInventory(batch)) {
    throw new InventoryError('An empty batch cannot be marked available.', 409);
  }
  if (requestedStatus === 'HOLD' && !hasPositiveInventory(batch)) {
    throw new InventoryError('An empty batch cannot be placed on hold.', 409);
  }
  if (requestedStatus === 'ARCHIVED' && hasPositiveInventory(batch)) {
    throw new InventoryError('A batch with stock cannot be archived. Adjust stock out first.', 409);
  }
  return requestedStatus;
}

export async function updateInventoryBatch({
  batchId,
  updates,
  actor,
  models: modelOverrides,
  session = null,
}) {
  requireObjectId(batchId, 'Batch ID');
  const authenticatedActor = requireActor(actor);
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new InventoryError('Batch updates are required.');
  }
  const unknownFields = Object.keys(updates).filter((key) => !BATCH_METADATA_FIELDS.includes(key));
  if (unknownFields.length) throw new InventoryError(`Unsupported batch field: ${unknownFields[0]}.`);

  const { InventoryBatchModel } = resolveModels(modelOverrides);
  const batch = await findById(InventoryBatchModel, batchId, session);
  if (!batch) throw new InventoryError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
  if (batch.status === 'ARCHIVED') throw new InventoryError('Archived batches cannot be changed.', 409);

  if ('receivedDate' in updates) batch.receivedDate = dateValue(updates.receivedDate, 'Received date');
  if ('externalLotNumber' in updates) {
    batch.externalLotNumber = optionalString(updates.externalLotNumber, 'External lot number', 160);
  }
  if ('source' in updates) batch.source = normalizeSource(updates.source);
  if ('finish' in updates) batch.finish = optionalString(updates.finish, 'Finish', 120);
  if ('thicknessMm' in updates) {
    batch.thicknessMm = numberValue(updates.thicknessMm, 'Thickness', { optional: true, positive: true });
  }
  if ('nominalDimensions' in updates) batch.nominalDimensions = normalizeDimensions(updates.nominalDimensions);
  if ('cost' in updates) batch.cost = normalizeCost(updates.cost);
  if ('selling' in updates) batch.selling = normalizeSelling(updates.selling);
  if ('grade' in updates) batch.grade = optionalString(updates.grade, 'Grade', 100);
  if ('shade' in updates) batch.shade = optionalString(updates.shade, 'Shade', 100);
  if ('notes' in updates) batch.notes = optionalString(updates.notes, 'Notes', 3000);
  if ('status' in updates) batch.status = statusForMetadataUpdate(batch, updates.status);
  batch.updatedBy = authenticatedActor;
  await batch.save(session ? { session } : undefined);
  return batch;
}

function derivedStatusExpression(quantityExpression, areaExpression) {
  return {
    $cond: [
      { $eq: ['$status', 'HOLD'] },
      'HOLD',
      {
        $cond: [
          { $or: [{ $gt: [quantityExpression, 0] }, { $gt: [areaExpression, 0] }] },
          'AVAILABLE',
          'DEPLETED',
        ],
      },
    ],
  };
}

function batchBalancePipeline(quantityDelta, areaDelta, actor, { receipt = false } = {}) {
  const currentQuantity = { $ifNull: ['$quantity.currentCount', 0] };
  const currentArea = { $ifNull: ['$area.availableSqFt', 0] };
  const nextQuantity = { $add: [currentQuantity, quantityDelta] };
  const nextArea = { $add: [currentArea, areaDelta] };
  const set = {
    'quantity.currentCount': nextQuantity,
    status: derivedStatusExpression(nextQuantity, nextArea),
    updatedBy: actor,
    updatedAt: '$$NOW',
  };
  if (areaDelta !== 0 || receipt) set['area.availableSqFt'] = nextArea;
  if (receipt) {
    set['quantity.receivedCount'] = { $add: [{ $ifNull: ['$quantity.receivedCount', 0] }, quantityDelta] };
    set['area.receivedSqFt'] = { $add: [{ $ifNull: ['$area.receivedSqFt', 0] }, areaDelta] };
  }
  return [{ $set: set }];
}

function normalizeAdjustment(direction, quantity, areaSqFt) {
  ensureKnownEnum(direction, ADJUSTMENT_DIRECTIONS, 'Adjustment direction');
  const normalizedQuantity = numberValue(quantity ?? 0, 'Adjustment quantity', { integer: true });
  const normalizedArea = numberValue(areaSqFt ?? 0, 'Adjustment area', {});
  if (normalizedQuantity === 0 && normalizedArea === 0) {
    throw new InventoryError('Adjustment quantity or area must be greater than zero.');
  }
  const sign = direction === 'IN' ? 1 : -1;
  return {
    quantity: normalizedQuantity,
    areaSqFt: roundArea(normalizedArea),
    quantityDelta: sign * normalizedQuantity,
    areaDelta: sign * roundArea(normalizedArea),
    movementType: direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
  };
}

async function adjustBatchMode({
  batch,
  direction,
  quantity,
  areaSqFt,
  reason,
  actor,
  now,
  models,
  session,
}) {
  const adjustment = normalizeAdjustment(direction, quantity, areaSqFt);
  const filter = { _id: batch._id, inventoryMode: 'BATCH', status: { $ne: 'ARCHIVED' } };
  if (direction === 'OUT' && adjustment.quantity > 0) {
    filter['quantity.currentCount'] = { $gte: adjustment.quantity };
  }
  if (direction === 'OUT' && adjustment.areaSqFt > 0) {
    filter['area.availableSqFt'] = { $gte: adjustment.areaSqFt };
  }

  const updatedBatch = await models.InventoryBatchModel.findOneAndUpdate(
    filter,
    batchBalancePipeline(adjustment.quantityDelta, adjustment.areaDelta, actor),
    { new: true, session: session || undefined },
  );
  if (!updatedBatch) {
    throw new InventoryError('Adjustment would make inventory negative or the batch changed concurrently.', 409);
  }

  const movement = await createDocument(models.InventoryMovementModel, {
    type: adjustment.movementType,
    inventoryMode: 'BATCH',
    batch: updatedBatch._id,
    quantityDelta: adjustment.quantityDelta,
    areaDeltaSqFt: adjustment.areaDelta,
    balanceAfter: compactObject({
      quantity: Number(updatedBatch.quantity.currentCount || 0),
      areaSqFt: availableArea(updatedBatch),
    }),
    reason,
    actor,
    occurredAt: now,
  }, session);
  return { batch: updatedBatch, movement };
}

async function adjustIndividualSlabMode({
  batch,
  slabId,
  direction,
  quantity,
  areaSqFt,
  reason,
  actor,
  now,
  models,
  session,
}) {
  requireObjectId(slabId, 'Slab ID');
  if (quantity !== undefined || areaSqFt !== undefined) {
    throw new InventoryError('Individual-slab adjustments derive quantity and area from the selected slab.');
  }
  ensureKnownEnum(direction, ADJUSTMENT_DIRECTIONS, 'Adjustment direction');

  const currentStatuses = direction === 'OUT' ? ['AVAILABLE'] : ['DEPLETED'];
  const nextStatus = direction === 'OUT' ? 'DEPLETED' : 'AVAILABLE';
  const slab = await findOne(models.SlabModel, { _id: slabId, batch: batch._id }, session);
  if (!slab) throw new InventoryError('Slab was not found in this batch.', 404, 'SLAB_NOT_FOUND');
  if (!currentStatuses.includes(slab.status)) {
    throw new InventoryError(`Slab cannot be adjusted ${direction.toLowerCase()} from ${slab.status}.`, 409);
  }

  const area = slabInventoryArea(slab);
  const sign = direction === 'IN' ? 1 : -1;
  const updatedSlab = await models.SlabModel.findOneAndUpdate(
    { _id: slab._id, batch: batch._id, status: { $in: currentStatuses } },
    { $set: { status: nextStatus, updatedBy: actor } },
    { new: true, session: session || undefined, runValidators: true },
  );
  if (!updatedSlab) throw new InventoryError('Slab changed concurrently. Try again.', 409);

  const batchFilter = { _id: batch._id, status: { $ne: 'ARCHIVED' } };
  if (direction === 'OUT') {
    batchFilter['quantity.currentCount'] = { $gte: 1 };
    if (area > 0) batchFilter['area.availableSqFt'] = { $gte: area };
  }
  const updatedBatch = await models.InventoryBatchModel.findOneAndUpdate(
    batchFilter,
    batchBalancePipeline(sign, sign * area, actor),
    { new: true, session: session || undefined },
  );
  if (!updatedBatch) {
    throw new InventoryError('Adjustment would make inventory negative or the batch changed concurrently.', 409);
  }

  const movement = await createDocument(models.InventoryMovementModel, {
    type: direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
    inventoryMode: 'INDIVIDUAL_SLAB',
    batch: updatedBatch._id,
    slab: updatedSlab._id,
    quantityDelta: sign,
    areaDeltaSqFt: roundArea(sign * area),
    balanceAfter: {
      quantity: Number(updatedBatch.quantity.currentCount || 0),
      areaSqFt: Number(updatedBatch.area?.availableSqFt || 0),
    },
    reason,
    actor,
    occurredAt: now,
  }, session);
  return { batch: updatedBatch, slab: updatedSlab, movement };
}

export async function adjustInventoryStock({
  batchId,
  slabId,
  direction,
  quantity,
  areaSqFt,
  reason,
  actor,
  now = new Date(),
  models: modelOverrides,
  session = null,
}) {
  requireObjectId(batchId, 'Batch ID');
  const authenticatedActor = requireActor(actor);
  const normalizedReason = requiredString(reason, 'Adjustment reason', 1000);
  const models = resolveModels(modelOverrides);

  return runInventoryTransaction(models.InventoryBatchModel, session, async (activeSession) => {
    const batch = await findById(models.InventoryBatchModel, batchId, activeSession);
    if (!batch) throw new InventoryError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
    if (batch.status === 'ARCHIVED') throw new InventoryError('Archived batches cannot be adjusted.', 409);

    if (batch.inventoryMode === 'BATCH') {
      if (slabId) throw new InventoryError('Batch-mode adjustments cannot target a slab.');
      return adjustBatchMode({
        batch,
        direction,
        quantity,
        areaSqFt,
        reason: normalizedReason,
        actor: authenticatedActor,
        now,
        models,
        session: activeSession,
      });
    }

    return adjustIndividualSlabMode({
      batch,
      slabId,
      direction,
      quantity,
      areaSqFt,
      reason: normalizedReason,
      actor: authenticatedActor,
      now,
      models,
      session: activeSession,
    });
  });
}

function locationConcurrencyFilter(location) {
  return {
    'location.warehouse': location.warehouse,
    'location.zone': location.zone ?? { $exists: false },
    'location.rack': location.rack ?? { $exists: false },
  };
}

export async function transferInventory({
  batchId,
  slabId,
  toLocation,
  reason,
  actor,
  now = new Date(),
  models: modelOverrides,
  session = null,
}) {
  requireObjectId(batchId, 'Batch ID');
  const authenticatedActor = requireActor(actor);
  const destination = normalizeInventoryLocation(toLocation);
  const normalizedReason = requiredString(reason, 'Transfer reason', 1000);
  const models = resolveModels(modelOverrides);

  return runInventoryTransaction(models.InventoryBatchModel, session, async (activeSession) => {
    const batch = await findById(models.InventoryBatchModel, batchId, activeSession);
    if (!batch) throw new InventoryError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
    if (batch.status === 'ARCHIVED') throw new InventoryError('Archived inventory cannot be transferred.', 409);

    if (batch.inventoryMode === 'BATCH') {
      if (slabId) throw new InventoryError('Batch-mode transfers move the whole batch, not a slab.');
      const source = normalizeInventoryLocation(batch.location);
      if (locationsEqual(source, destination)) throw new InventoryError('Source and destination locations are the same.');

      const updatedBatch = await models.InventoryBatchModel.findOneAndUpdate(
        { _id: batch._id, status: { $ne: 'ARCHIVED' }, ...locationConcurrencyFilter(source) },
        { $set: { location: destination, updatedBy: authenticatedActor } },
        { new: true, session: activeSession || undefined, runValidators: true },
      );
      if (!updatedBatch) throw new InventoryError('Batch location changed concurrently. Try again.', 409);

      const movement = await createDocument(models.InventoryMovementModel, {
        type: 'TRANSFER',
        inventoryMode: 'BATCH',
        batch: updatedBatch._id,
        quantityDelta: 0,
        areaDeltaSqFt: 0,
        balanceAfter: compactObject({
          quantity: Number(updatedBatch.quantity?.currentCount || 0),
          areaSqFt: availableArea(updatedBatch),
        }),
        fromLocation: source,
        toLocation: destination,
        reason: normalizedReason,
        actor: authenticatedActor,
        occurredAt: now,
      }, activeSession);
      return { batch: updatedBatch, movement };
    }

    requireObjectId(slabId, 'Slab ID');
    const slab = await findOne(models.SlabModel, { _id: slabId, batch: batch._id }, activeSession);
    if (!slab) throw new InventoryError('Slab was not found in this batch.', 404, 'SLAB_NOT_FOUND');
    if (!['AVAILABLE', 'HOLD'].includes(slab.status)) {
      throw new InventoryError('Only physically available or held slabs can be transferred.', 409);
    }
    const source = normalizeInventoryLocation(slab.location);
    if (locationsEqual(source, destination)) throw new InventoryError('Source and destination locations are the same.');

    const updatedSlab = await models.SlabModel.findOneAndUpdate(
      {
        _id: slab._id,
        batch: batch._id,
        status: { $in: ['AVAILABLE', 'HOLD'] },
        ...locationConcurrencyFilter(source),
      },
      { $set: { location: destination, updatedBy: authenticatedActor } },
      { new: true, session: activeSession || undefined, runValidators: true },
    );
    if (!updatedSlab) throw new InventoryError('Slab location changed concurrently. Try again.', 409);

    const movement = await createDocument(models.InventoryMovementModel, {
      type: 'TRANSFER',
      inventoryMode: 'INDIVIDUAL_SLAB',
      batch: batch._id,
      slab: updatedSlab._id,
      quantityDelta: 0,
      areaDeltaSqFt: 0,
      balanceAfter: {
        quantity: Number(batch.quantity?.currentCount || 0),
        areaSqFt: Number(batch.area?.availableSqFt || 0),
      },
      fromLocation: source,
      toLocation: destination,
      reason: normalizedReason,
      actor: authenticatedActor,
      occurredAt: now,
    }, activeSession);
    return { batch, slab: updatedSlab, movement };
  });
}

export async function listInventoryMovements({
  batchId,
  page = 1,
  limit = DEFAULT_INVENTORY_PAGE_SIZE,
  models: modelOverrides,
}) {
  requireObjectId(batchId, 'Batch ID');
  const { InventoryBatchModel, InventoryMovementModel } = resolveModels(modelOverrides);
  const batchExists = await InventoryBatchModel.exists({ _id: batchId });
  if (!batchExists) throw new InventoryError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
  const pagination = normalizeInventoryPagination(page, limit);
  const filter = { batch: batchId };

  let query = InventoryMovementModel.find(filter);
  query = applyQueryMethod(query, 'sort', { occurredAt: -1, _id: -1 });
  query = applyQueryMethod(query, 'skip', (pagination.page - 1) * pagination.limit);
  query = applyQueryMethod(query, 'limit', pagination.limit);
  query = applyQueryMethod(query, 'populate', 'slab', 'slabNumber');
  query = applyQueryMethod(query, 'lean');
  const [movements, total] = await Promise.all([
    query,
    InventoryMovementModel.countDocuments(filter),
  ]);
  return {
    movements,
    total,
    page: pagination.page,
    pages: Math.max(1, Math.ceil(total / pagination.limit)),
  };
}

function normalizeSlabInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InventoryError('Slab input is required.');
  const dimensions = normalizeDimensions(input.dimensions || input, { required: true, thickness: true });
  const grossAreaSqFt = squareFeetFromMillimetres(dimensions.lengthMm, dimensions.widthMm);
  const usableAreaSqFt = numberValue(input.usableAreaSqFt, 'Usable area', { optional: true });
  if (usableAreaSqFt != null && usableAreaSqFt > grossAreaSqFt) {
    throw new InventoryError('Usable area cannot exceed gross area.');
  }
  return {
    dimensions,
    grossAreaSqFt,
    usableAreaSqFt: usableAreaSqFt == null ? undefined : roundArea(usableAreaSqFt),
    location: normalizeInventoryLocation(input.location),
    grade: optionalString(input.grade, 'Grade', 100),
    shade: optionalString(input.shade, 'Shade', 100),
    defects: optionalString(input.defects, 'Defects', 1000),
    notes: optionalString(input.notes, 'Notes', 3000),
  };
}

export async function createInventorySlab({
  batchId,
  input,
  actor,
  now = new Date(),
  models: modelOverrides,
  session = null,
}) {
  requireObjectId(batchId, 'Batch ID');
  const authenticatedActor = requireActor(actor);
  const normalized = normalizeSlabInput(input);
  const models = resolveModels(modelOverrides);

  return runInventoryTransaction(models.InventoryBatchModel, session, async (activeSession) => {
    const batch = await findById(models.InventoryBatchModel, batchId, activeSession);
    if (!batch) throw new InventoryError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
    if (batch.inventoryMode !== 'INDIVIDUAL_SLAB') {
      throw new InventoryError('Slabs can only be added to an individual-slab batch.', 409);
    }
    if (batch.status === 'ARCHIVED') throw new InventoryError('Archived batches cannot receive slabs.', 409);

    const slabNumber = await nextInventoryReference(
      INVENTORY_REFERENCE_PREFIXES.SLAB,
      now,
      models.CounterModel,
      activeSession,
    );
    const slab = await createDocument(models.SlabModel, {
      slabNumber,
      batch: batch._id,
      stoneRef: batch.stoneRef?.toObject ? batch.stoneRef.toObject() : { ...batch.stoneRef },
      dimensions: normalized.dimensions,
      grossAreaSqFt: normalized.grossAreaSqFt,
      usableAreaSqFt: normalized.usableAreaSqFt,
      status: 'AVAILABLE',
      location: normalized.location,
      grade: normalized.grade,
      shade: normalized.shade,
      defects: normalized.defects,
      notes: normalized.notes,
      createdBy: authenticatedActor,
      updatedBy: authenticatedActor,
    }, activeSession);

    const area = slabInventoryArea(slab);
    const updatedBatch = await models.InventoryBatchModel.findOneAndUpdate(
      { _id: batch._id, inventoryMode: 'INDIVIDUAL_SLAB', status: { $ne: 'ARCHIVED' } },
      batchBalancePipeline(1, area, authenticatedActor, { receipt: true }),
      { new: true, session: activeSession || undefined },
    );
    if (!updatedBatch) throw new InventoryError('Batch changed concurrently. Try again.', 409);

    const movement = await createDocument(models.InventoryMovementModel, receiptMovement({
      batch: updatedBatch,
      slab,
      quantity: 1,
      areaSqFt: area,
      location: slab.location,
      actor: authenticatedActor,
      now,
      reason: 'Individual slab received.',
    }), activeSession);
    return { batch: updatedBatch, slab, movement };
  });
}

export async function listInventorySlabs({
  batchId,
  page = 1,
  limit = DEFAULT_INVENTORY_PAGE_SIZE,
  models: modelOverrides,
}) {
  requireObjectId(batchId, 'Batch ID');
  const { InventoryBatchModel, SlabModel } = resolveModels(modelOverrides);
  const batch = await findById(InventoryBatchModel, batchId);
  if (!batch) throw new InventoryError('Inventory batch was not found.', 404, 'BATCH_NOT_FOUND');
  if (batch.inventoryMode !== 'INDIVIDUAL_SLAB') {
    throw new InventoryError('This batch does not use individual slab tracking.', 409);
  }
  const pagination = normalizeInventoryPagination(page, limit);
  const filter = { batch: batchId };

  let query = SlabModel.find(filter);
  query = applyQueryMethod(query, 'sort', { slabNumber: 1, _id: 1 });
  query = applyQueryMethod(query, 'skip', (pagination.page - 1) * pagination.limit);
  query = applyQueryMethod(query, 'limit', pagination.limit);
  query = applyQueryMethod(query, 'lean');
  const [slabs, total] = await Promise.all([query, SlabModel.countDocuments(filter)]);
  return {
    slabs,
    total,
    page: pagination.page,
    pages: Math.max(1, Math.ceil(total / pagination.limit)),
  };
}

export async function updateInventorySlab({
  slabId,
  updates,
  actor,
  models: modelOverrides,
  session = null,
}) {
  requireObjectId(slabId, 'Slab ID');
  const authenticatedActor = requireActor(actor);
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new InventoryError('Slab updates are required.');
  }
  const unknownFields = Object.keys(updates).filter((key) => !SLAB_METADATA_FIELDS.includes(key));
  if (unknownFields.length) throw new InventoryError(`Unsupported slab field: ${unknownFields[0]}.`);

  const { InventoryBatchModel, SlabModel } = resolveModels(modelOverrides);
  const slab = await findById(SlabModel, slabId, session);
  if (!slab) throw new InventoryError('Slab was not found.', 404, 'SLAB_NOT_FOUND');
  const batch = await findById(InventoryBatchModel, slab.batch, session);
  if (!batch) throw new InventoryError('The slab batch was not found.', 409, 'BATCH_NOT_FOUND');
  if (batch.status === 'ARCHIVED') throw new InventoryError('Slabs in an archived batch cannot be changed.', 409);

  if ('grade' in updates) slab.grade = optionalString(updates.grade, 'Grade', 100);
  if ('shade' in updates) slab.shade = optionalString(updates.shade, 'Shade', 100);
  if ('defects' in updates) slab.defects = optionalString(updates.defects, 'Defects', 1000);
  if ('notes' in updates) slab.notes = optionalString(updates.notes, 'Notes', 3000);
  slab.updatedBy = authenticatedActor;
  await slab.save(session ? { session } : undefined);
  return slab;
}
