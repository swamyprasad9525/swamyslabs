import mongoose from 'mongoose';
import {
  PROCESSING_EVENT_TYPES,
  PROCESSING_JOB_STATUSES,
  PROCESSING_OPERATION_TYPES,
  PROCESSING_QC_RESULTS,
} from '../constants/processing.js';

const { Schema } = mongoose;

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

const slabOutputSnapshotSchema = new Schema({
  slabId: { type: Schema.Types.ObjectId, ref: 'Slab', required: true },
  sourceSlabId: { type: Schema.Types.ObjectId, ref: 'Slab', required: true },
  slabNumber: { type: String, trim: true, maxlength: 80 },
  usableAreaSqFt: { type: Number, required: true, min: 0.0001 },
  grossAreaSqFt: { type: Number, min: 0.0001 },
  finish: { type: String, trim: true, maxlength: 120 },
  dimensions: { type: dimensionsSchema, default: undefined },
  location: { type: locationSchema, default: undefined },
}, { _id: false });

const verifiedOutputSnapshotSchema = new Schema({
  quantity: { type: Number, required: true, min: 0, validate: Number.isInteger },
  areaSqFt: { type: Number, min: 0 },
  finish: { type: String, trim: true, maxlength: 120 },
  thicknessMm: { type: Number, min: 0.01 },
  dimensions: { type: dimensionsSchema, default: undefined },
  slabOutputs: { type: [slabOutputSnapshotSchema], default: undefined },
}, { _id: false });

const eventDetailsSchema = new Schema({
  fromStatus: { type: String, enum: PROCESSING_JOB_STATUSES },
  toStatus: { type: String, enum: PROCESSING_JOB_STATUSES },
  operationId: { type: Schema.Types.ObjectId },
  operation: { type: String, enum: PROCESSING_OPERATION_TYPES },
  sequence: { type: Number, min: 1 },
  qcResult: { type: String, enum: PROCESSING_QC_RESULTS },
  observations: { type: String, trim: true, maxlength: 3000 },
  verifiedOutput: { type: verifiedOutputSnapshotSchema, default: undefined },
  quantity: { type: Number, min: 0 },
  areaSqFt: { type: Number, min: 0 },
  progressPercent: { type: Number, min: 0, max: 100 },
}, { _id: false });

const processingEventSchema = new Schema({
  job: {
    type: Schema.Types.ObjectId,
    ref: 'ProcessingJob',
    required: true,
    immutable: true,
    index: true,
  },
  jobNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  type: { type: String, enum: PROCESSING_EVENT_TYPES, required: true, immutable: true, index: true },
  actor: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  note: { type: String, trim: true, maxlength: 3000, immutable: true },
  details: { type: eventDetailsSchema, default: undefined, immutable: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: true,
  strict: 'throw',
});

processingEventSchema.pre('save', function preventEventRewrite() {
  if (!this.isNew) throw new Error('Processing events are append-only.');
});

for (const operation of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
]) {
  processingEventSchema.pre(operation, function preventEventMutation() {
    throw new Error('Processing events are append-only.');
  });
}

processingEventSchema.pre('updateOne', { document: true, query: false }, function preventDocumentUpdate() {
  throw new Error('Processing events are append-only.');
});

processingEventSchema.pre('deleteOne', { document: true, query: false }, function preventDocumentDelete() {
  throw new Error('Processing events are append-only.');
});

processingEventSchema.pre('bulkWrite', function preventEventBulkMutation() {
  throw new Error('Processing events are append-only.');
});

processingEventSchema.index({ job: 1, occurredAt: -1, _id: -1 });

const ProcessingEvent = mongoose.models.ProcessingEvent
  || mongoose.model('ProcessingEvent', processingEventSchema);

export default ProcessingEvent;
