import mongoose from 'mongoose';
import { AREA_BASES, INVENTORY_MODES, INVENTORY_STATUSES } from '../constants/inventory.js';

const { Schema } = mongoose;

const stoneRefSchema = new Schema({
  stoneId: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 180, immutable: true },
  materialFamily: { type: String, trim: true, maxlength: 100, immutable: true },
}, { _id: false });

const sourceSchema = new Schema({
  quarry: { type: String, trim: true, maxlength: 180 },
  origin: { type: String, trim: true, maxlength: 180 },
  supplier: { type: String, trim: true, maxlength: 180 },
}, { _id: false });

const dimensionsSchema = new Schema({
  lengthMm: { type: Number, min: 0.01 },
  widthMm: { type: Number, min: 0.01 },
}, { _id: false });

const quantitySchema = new Schema({
  receivedCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: 'Received count must be a whole number.' },
  },
  currentCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: { validator: Number.isInteger, message: 'Current count must be a whole number.' },
  },
}, { _id: false });

const areaSchema = new Schema({
  receivedSqFt: { type: Number, min: 0 },
  availableSqFt: { type: Number, min: 0 },
  basis: { type: String, enum: AREA_BASES },
}, { _id: false });

const moneyRateSchema = new Schema({
  costPerSqFt: { type: Number, min: 0 },
  currency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
}, { _id: false });

const sellingRateSchema = new Schema({
  pricePerSqFt: { type: Number, min: 0 },
  currency: { type: String, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
}, { _id: false });

const locationSchema = new Schema({
  warehouse: { type: String, required: true, trim: true, maxlength: 160 },
  zone: { type: String, trim: true, maxlength: 100 },
  rack: { type: String, trim: true, maxlength: 100 },
}, { _id: false });

const inventoryBatchSchema = new Schema({
  batchNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    immutable: true,
  },
  stoneRef: { type: stoneRefSchema, required: true, immutable: true },
  inventoryMode: {
    type: String,
    enum: INVENTORY_MODES,
    required: true,
    immutable: true,
    index: true,
  },
  receivedDate: { type: Date, required: true },
  externalLotNumber: { type: String, trim: true, maxlength: 160 },
  source: { type: sourceSchema, default: undefined },
  finish: { type: String, trim: true, maxlength: 120 },
  thicknessMm: { type: Number, min: 0.01 },
  nominalDimensions: { type: dimensionsSchema, default: undefined },
  quantity: { type: quantitySchema, required: true, default: () => ({}) },
  area: { type: areaSchema, default: undefined },
  cost: { type: moneyRateSchema, default: undefined },
  selling: { type: sellingRateSchema, default: undefined },
  location: { type: locationSchema, default: undefined },
  grade: { type: String, trim: true, maxlength: 100 },
  shade: { type: String, trim: true, maxlength: 100 },
  notes: { type: String, trim: true, maxlength: 3000 },
  status: {
    type: String,
    enum: INVENTORY_STATUSES,
    required: true,
    default: 'DRAFT',
    index: true,
  },
  createdBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
  strict: 'throw',
});

inventoryBatchSchema.pre('validate', function validateInventoryBatch() {
  const lengthProvided = this.nominalDimensions?.lengthMm != null;
  const widthProvided = this.nominalDimensions?.widthMm != null;
  if (lengthProvided !== widthProvided) {
    this.invalidate('nominalDimensions', 'Both nominal length and width are required when dimensions are supplied.');
  }

  if (this.inventoryMode === 'INDIVIDUAL_SLAB' && this.location) {
    this.invalidate('location', 'Individual-slab inventory stores location on each slab, not on the batch.');
  }

  if (this.cost?.costPerSqFt != null && !this.cost.currency) {
    this.invalidate('cost.currency', 'Currency is required when cost per square foot is supplied.');
  }

  if (this.selling?.pricePerSqFt != null && !this.selling.currency) {
    this.invalidate('selling.currency', 'Currency is required when selling price per square foot is supplied.');
  }
});

inventoryBatchSchema.index({ 'stoneRef.slug': 1, status: 1 });
inventoryBatchSchema.index({ status: 1, updatedAt: -1 });
inventoryBatchSchema.index({ finish: 1, status: 1 });
inventoryBatchSchema.index({ 'location.warehouse': 1, status: 1 });
inventoryBatchSchema.index({ receivedDate: -1 });

const InventoryBatch = mongoose.models.InventoryBatch
  || mongoose.model('InventoryBatch', inventoryBatchSchema);

export default InventoryBatch;
