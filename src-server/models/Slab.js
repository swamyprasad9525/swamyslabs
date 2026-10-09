import mongoose from 'mongoose';
import { INVENTORY_STATUSES } from '../constants/inventory.js';

const { Schema } = mongoose;

const stoneRefSchema = new Schema({
  stoneId: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 180, immutable: true },
  materialFamily: { type: String, trim: true, maxlength: 100, immutable: true },
}, { _id: false });

const dimensionsSchema = new Schema({
  lengthMm: { type: Number, required: true, min: 0.01 },
  widthMm: { type: Number, required: true, min: 0.01 },
  thicknessMm: { type: Number, min: 0.01 },
}, { _id: false });

const locationSchema = new Schema({
  warehouse: { type: String, required: true, trim: true, maxlength: 160 },
  zone: { type: String, trim: true, maxlength: 100 },
  rack: { type: String, trim: true, maxlength: 100 },
}, { _id: false });

const slabSchema = new Schema({
  slabNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    immutable: true,
  },
  batch: {
    type: Schema.Types.ObjectId,
    ref: 'InventoryBatch',
    required: true,
    immutable: true,
    index: true,
  },
  stoneRef: { type: stoneRefSchema, required: true, immutable: true },
  dimensions: { type: dimensionsSchema, required: true },
  grossAreaSqFt: { type: Number, required: true, min: 0.0001, immutable: true },
  usableAreaSqFt: { type: Number, min: 0 },
  status: {
    type: String,
    enum: INVENTORY_STATUSES,
    required: true,
    default: 'AVAILABLE',
    index: true,
  },
  location: { type: locationSchema, required: true },
  grade: { type: String, trim: true, maxlength: 100 },
  shade: { type: String, trim: true, maxlength: 100 },
  defects: { type: String, trim: true, maxlength: 1000 },
  notes: { type: String, trim: true, maxlength: 3000 },
  createdBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
  strict: 'throw',
});

slabSchema.pre('validate', function validateSlab() {
  if (this.usableAreaSqFt != null && this.usableAreaSqFt > this.grossAreaSqFt) {
    this.invalidate('usableAreaSqFt', 'Usable area cannot exceed gross area.');
  }
});

slabSchema.index({ batch: 1, slabNumber: 1 });
slabSchema.index({ batch: 1, status: 1, updatedAt: -1 });
slabSchema.index({ 'location.warehouse': 1, status: 1 });

const Slab = mongoose.models.Slab || mongoose.model('Slab', slabSchema);

export default Slab;
