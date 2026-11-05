import mongoose from 'mongoose';
import { DISPATCH_EVENT_TYPES, DISPATCH_STATUSES } from '../constants/dispatch.js';

const { Schema } = mongoose;

const dispatchEventSchema = new Schema({
  dispatchId: {
    type: Schema.Types.ObjectId,
    ref: 'Dispatch',
    required: true,
    immutable: true,
    index: true,
  },
  dispatchNumber: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    maxlength: 80,
  },
  salesOrderId: {
    type: Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true,
    immutable: true,
    index: true,
  },
  type: {
    type: String,
    enum: DISPATCH_EVENT_TYPES,
    required: true,
    immutable: true,
    index: true,
  },
  fromStatus: {
    type: String,
    enum: DISPATCH_STATUSES,
    immutable: true,
  },
  toStatus: {
    type: String,
    enum: DISPATCH_STATUSES,
    required: true,
    immutable: true,
  },
  actor: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
    immutable: true,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 1000,
    immutable: true,
  },
  snapshot: {
    type: Schema.Types.Mixed,
    immutable: true,
  },
  occurredAt: {
    type: Date,
    required: true,
    default: Date.now,
    immutable: true,
  },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: true,
  strict: 'throw',
});

dispatchEventSchema.index({ dispatchId: 1, occurredAt: -1 });
dispatchEventSchema.index({ salesOrderId: 1, occurredAt: -1 });

const DispatchEvent = mongoose.models.DispatchEvent
  || mongoose.model('DispatchEvent', dispatchEventSchema);

export default DispatchEvent;

