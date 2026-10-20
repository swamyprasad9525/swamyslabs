import mongoose from 'mongoose';
import { INVENTORY_MODES } from '../constants/inventory.js';
import { RESERVATION_STATUSES } from '../constants/commercial.js';

const { Schema } = mongoose;

export const RESERVATION_BASES = Object.freeze([
  'QUANTITY',
  'AREA',
  'INDIVIDUAL_SLAB',
]);

const stoneSnapshotSchema = new Schema({
  stoneId: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 180, immutable: true },
  materialFamily: { type: String, trim: true, maxlength: 100, immutable: true },
}, { _id: false });

const inventorySnapshotSchema = new Schema({
  batchNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  stoneRef: { type: stoneSnapshotSchema, required: true, immutable: true },
  finish: { type: String, trim: true, maxlength: 120, immutable: true },
  thicknessMm: { type: Number, min: 0.01, immutable: true },
  slabNumbers: [{ type: String, trim: true, maxlength: 80, immutable: true }],
}, { _id: false });

const inventoryReservationSchema = new Schema({
  reservationNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 80,
    immutable: true,
  },
  requestKey: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  salesOrderId: {
    type: Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true,
    immutable: true,
    index: true,
  },
  salesOrderLineItemId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  inventoryMode: { type: String, enum: INVENTORY_MODES, required: true, immutable: true },
  basis: { type: String, enum: RESERVATION_BASES, required: true, immutable: true },
  batch: {
    type: Schema.Types.ObjectId,
    ref: 'InventoryBatch',
    required: true,
    immutable: true,
    index: true,
  },
  slabIds: [{ type: Schema.Types.ObjectId, ref: 'Slab', immutable: true }],
  quantity: {
    type: Number,
    required: true,
    min: 0,
    validate: { validator: Number.isInteger, message: 'Reserved quantity must be a whole number.' },
    immutable: true,
  },
  areaSqFt: { type: Number, required: true, min: 0, immutable: true },
  inventorySnapshot: { type: inventorySnapshotSchema, required: true, immutable: true },
  status: {
    type: String,
    enum: RESERVATION_STATUSES,
    required: true,
    default: 'ACTIVE',
    index: true,
  },
  reservedAt: { type: Date, required: true, default: Date.now, immutable: true },
  reservedBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  releasedAt: { type: Date },
  releasedBy: { type: String, trim: true, maxlength: 120 },
  releaseReason: { type: String, trim: true, maxlength: 1000 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
  strict: 'throw',
});

inventoryReservationSchema.pre('validate', function validateReservation() {
  const slabIds = (this.slabIds || []).map(String);
  if (new Set(slabIds).size !== slabIds.length) {
    this.invalidate('slabIds', 'Reserved slabs must be unique.');
  }

  if (this.basis === 'QUANTITY') {
    if (this.inventoryMode !== 'BATCH' || this.quantity <= 0 || this.areaSqFt !== 0 || slabIds.length) {
      this.invalidate('basis', 'Quantity reservations require positive batch quantity only.');
    }
  } else if (this.basis === 'AREA') {
    if (this.inventoryMode !== 'BATCH' || this.areaSqFt <= 0 || this.quantity !== 0 || slabIds.length) {
      this.invalidate('basis', 'Area reservations require positive batch area only.');
    }
  } else if (this.basis === 'INDIVIDUAL_SLAB') {
    if (this.inventoryMode !== 'INDIVIDUAL_SLAB' || !slabIds.length
      || this.quantity !== slabIds.length || this.areaSqFt <= 0) {
      this.invalidate('basis', 'Individual-slab reservations require explicit slabs and derived quantity and area.');
    }
  }

  if (this.status === 'ACTIVE' && (this.releasedAt || this.releasedBy || this.releaseReason)) {
    this.invalidate('status', 'Active reservations cannot contain release details.');
  }
  if (this.status === 'RELEASED' && (!this.releasedAt || !this.releasedBy || !this.releaseReason)) {
    this.invalidate('status', 'Released reservations require release date, actor, and reason.');
  }
});

inventoryReservationSchema.index(
  { salesOrderId: 1, requestKey: 1 },
  { unique: true },
);
inventoryReservationSchema.index({ salesOrderId: 1, salesOrderLineItemId: 1, status: 1, createdAt: -1 });
inventoryReservationSchema.index({ batch: 1, status: 1, createdAt: -1 });
inventoryReservationSchema.index({ slabIds: 1, status: 1 });
inventoryReservationSchema.index(
  { slabIds: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE', inventoryMode: 'INDIVIDUAL_SLAB' },
  },
);

const InventoryReservation = mongoose.models.InventoryReservation
  || mongoose.model('InventoryReservation', inventoryReservationSchema);

export default InventoryReservation;
