import mongoose from 'mongoose';
import { INVENTORY_MODES } from '../constants/inventory.js';
import {
  PROCESSING_JOB_STATUSES,
  PROCESSING_OPERATION_STATUSES,
  PROCESSING_OPERATION_TYPES,
  PROCESSING_QC_RESULTS,
} from '../constants/processing.js';

const { Schema } = mongoose;

const stoneSnapshotSchema = new Schema({
  stoneId: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  materialFamily: { type: String, trim: true, maxlength: 100 },
}, { _id: false });

const dimensionsSchema = new Schema({
  lengthMm: { type: Number, min: 0.01 },
  widthMm: { type: Number, min: 0.01 },
  thicknessMm: { type: Number, min: 0.01 },
}, { _id: false });

const locationSchema = new Schema({
  warehouse: { type: String, required: true, trim: true, maxlength: 160 },
  zone: { type: String, trim: true, maxlength: 100 },
  rack: { type: String, trim: true, maxlength: 100 },
}, { _id: false });

const slabSnapshotSchema = new Schema({
  slabId: { type: Schema.Types.ObjectId, ref: 'Slab', required: true },
  slabNumber: { type: String, required: true, trim: true, maxlength: 80 },
  grossAreaSqFt: { type: Number, required: true, min: 0 },
  usableAreaSqFt: { type: Number, min: 0 },
  inventoryAreaSqFt: { type: Number, required: true, min: 0 },
  finish: { type: String, trim: true, maxlength: 120 },
  dimensions: { type: dimensionsSchema, required: true },
  location: { type: locationSchema, required: true },
}, { _id: false });

const inputSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'InventoryBatch', required: true },
  batchNumber: { type: String, required: true, trim: true, maxlength: 80 },
  slabIds: [{ type: Schema.Types.ObjectId, ref: 'Slab' }],
  slabNumbers: [{ type: String, trim: true, maxlength: 80 }],
  quantity: { type: Number, min: 0, validate: Number.isInteger },
  areaSqFt: { type: Number, min: 0 },
  finish: { type: String, trim: true, maxlength: 120 },
  thicknessMm: { type: Number, min: 0.01 },
  dimensions: { type: dimensionsSchema, default: undefined },
  sourceLocation: { type: locationSchema, default: undefined },
  slabSnapshots: { type: [slabSnapshotSchema], default: undefined },
  issuedAt: { type: Date },
}, { _id: false });

const targetSchema = new Schema({
  finish: { type: String, trim: true, maxlength: 120 },
  thicknessMm: { type: Number, min: 0.01 },
  dimensions: { type: dimensionsSchema, default: undefined },
}, { _id: false });

const routingOperationSchema = new Schema({
  operation: { type: String, enum: PROCESSING_OPERATION_TYPES, required: true },
  sequence: { type: Number, required: true, min: 1, validate: Number.isInteger },
  status: {
    type: String,
    enum: PROCESSING_OPERATION_STATUSES,
    required: true,
    default: 'PENDING',
  },
  plannedStart: { type: Date },
  plannedEnd: { type: Date },
  actualStart: { type: Date },
  actualEnd: { type: Date },
  machineLabel: { type: String, trim: true, maxlength: 160 },
  notes: { type: String, trim: true, maxlength: 2000 },
});

const slabOutputSchema = new Schema({
  slabId: { type: Schema.Types.ObjectId, ref: 'Slab', required: true },
  sourceSlabId: { type: Schema.Types.ObjectId, ref: 'Slab', required: true },
  slabNumber: { type: String, trim: true, maxlength: 80 },
  usableAreaSqFt: { type: Number, required: true, min: 0.0001 },
  grossAreaSqFt: { type: Number, min: 0.0001 },
  finish: { type: String, trim: true, maxlength: 120 },
  dimensions: { type: dimensionsSchema, default: undefined },
  location: { type: locationSchema, default: undefined },
}, { _id: false });

const verifiedOutputSchema = new Schema({
  quantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  areaSqFt: { type: Number, min: 0 },
  finish: { type: String, trim: true, maxlength: 120 },
  thicknessMm: { type: Number, min: 0.01 },
  dimensions: { type: dimensionsSchema, default: undefined },
  slabOutputs: { type: [slabOutputSchema], default: undefined },
}, { _id: false });

const qualityCheckSchema = new Schema({
  result: { type: String, enum: PROCESSING_QC_RESULTS, required: true },
  checkedAt: { type: Date, required: true },
  notes: { type: String, trim: true, maxlength: 3000 },
  observations: { type: String, trim: true, maxlength: 3000 },
  verifiedOutput: { type: verifiedOutputSchema, default: undefined },
}, { _id: false });

const wasteSchema = new Schema({
  quantity: { type: Number, min: 0, validate: Number.isInteger },
  areaSqFt: { type: Number, min: 0 },
}, { _id: false });

const currentOperationSchema = new Schema({
  operationId: { type: Schema.Types.ObjectId, required: true },
  operation: { type: String, enum: PROCESSING_OPERATION_TYPES, required: true },
  sequence: { type: Number, required: true, min: 1 },
}, { _id: false });

const sourceSalesOrderSchema = new Schema({
  salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
  salesOrderLineItemId: { type: Schema.Types.ObjectId, required: true },
  salesOrderNumber: { type: String, trim: true, maxlength: 80 },
}, { _id: false });

const processingJobSchema = new Schema({
  jobNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    immutable: true,
  },
  status: {
    type: String,
    enum: PROCESSING_JOB_STATUSES,
    required: true,
    default: 'DRAFT',
    index: true,
  },
  sourceSalesOrder: { type: sourceSalesOrderSchema, default: undefined },
  stoneSnapshot: { type: stoneSnapshotSchema, required: true, immutable: true },
  inventoryMode: { type: String, enum: INVENTORY_MODES, required: true, immutable: true },
  input: { type: inputSchema, required: true },
  target: { type: targetSchema, default: undefined },
  routing: { type: [routingOperationSchema], required: true, default: () => [] },
  currentOperation: { type: currentOperationSchema, default: undefined },
  qualityCheck: { type: qualityCheckSchema, default: undefined },
  output: { type: verifiedOutputSchema, default: undefined },
  waste: { type: wasteSchema, default: undefined },
  yieldPercent: { type: Number, min: 0, max: 100 },
  yieldBasis: { type: String, enum: ['AREA', 'QUANTITY'] },
  expectedCompletionDate: { type: Date },
  startedAt: { type: Date },
  completedAt: { type: Date },
  cancelledAt: { type: Date },
  notes: { type: String, trim: true, maxlength: 3000 },
  createdBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
  strict: 'throw',
});

processingJobSchema.pre('validate', function validateProcessingJob() {
  const slabIds = (this.input?.slabIds || []).map(String);
  if (new Set(slabIds).size !== slabIds.length) {
    this.invalidate('input.slabIds', 'Selected slabs must be unique.');
  }

  if (this.inventoryMode === 'BATCH' && slabIds.length) {
    this.invalidate('input.slabIds', 'Batch-mode jobs cannot select individual slabs.');
  }
  if (this.inventoryMode === 'INDIVIDUAL_SLAB' && !slabIds.length) {
    this.invalidate('input.slabIds', 'Individual-slab jobs require at least one slab.');
  }

  const sequences = (this.routing || []).map((operation) => operation.sequence).sort((a, b) => a - b);
  if (new Set(sequences).size !== sequences.length
    || sequences.some((sequence, index) => sequence !== index + 1)) {
    this.invalidate('routing', 'Routing sequence must be unique and contiguous from 1.');
  }

  for (const operation of this.routing || []) {
    if (operation.plannedStart && operation.plannedEnd && operation.plannedEnd < operation.plannedStart) {
      this.invalidate('routing', 'Operation planned end cannot be before planned start.');
      break;
    }
    if (operation.actualStart && operation.actualEnd && operation.actualEnd < operation.actualStart) {
      this.invalidate('routing', 'Operation completion cannot be before its start.');
      break;
    }
  }
});

processingJobSchema.index({ status: 1, updatedAt: -1 });
processingJobSchema.index({ status: 1, expectedCompletionDate: 1 });
processingJobSchema.index({ 'input.batchId': 1, createdAt: -1 });
processingJobSchema.index({ 'input.slabIds': 1, status: 1 });
processingJobSchema.index({ 'stoneSnapshot.slug': 1, updatedAt: -1 });
processingJobSchema.index({ 'currentOperation.operation': 1, status: 1 });
processingJobSchema.index({ 'sourceSalesOrder.salesOrderId': 1, createdAt: -1 });
processingJobSchema.index({ 'sourceSalesOrder.salesOrderLineItemId': 1, status: 1 });

const ProcessingJob = mongoose.models.ProcessingJob
  || mongoose.model('ProcessingJob', processingJobSchema);

export default ProcessingJob;
