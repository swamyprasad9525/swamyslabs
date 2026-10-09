import mongoose from 'mongoose';
import { INVENTORY_MODES, MOVEMENT_TYPES } from '../constants/inventory.js';

const { Schema } = mongoose;

const locationSchema = new Schema({
  warehouse: { type: String, required: true, trim: true, maxlength: 160 },
  zone: { type: String, trim: true, maxlength: 100 },
  rack: { type: String, trim: true, maxlength: 100 },
}, { _id: false });

const balanceSchema = new Schema({
  quantity: { type: Number, min: 0 },
  areaSqFt: { type: Number, min: 0 },
}, { _id: false });

const inventoryMovementSchema = new Schema({
  type: { type: String, enum: MOVEMENT_TYPES, required: true, immutable: true, index: true },
  inventoryMode: { type: String, enum: INVENTORY_MODES, required: true, immutable: true },
  batch: {
    type: Schema.Types.ObjectId,
    ref: 'InventoryBatch',
    required: true,
    immutable: true,
    index: true,
  },
  slab: { type: Schema.Types.ObjectId, ref: 'Slab', immutable: true, index: true },
  quantityDelta: { type: Number, required: true, default: 0, immutable: true },
  areaDeltaSqFt: { type: Number, required: true, default: 0, immutable: true },
  balanceAfter: { type: balanceSchema, default: undefined, immutable: true },
  fromLocation: { type: locationSchema, default: undefined, immutable: true },
  toLocation: { type: locationSchema, default: undefined, immutable: true },
  reason: { type: String, required: true, trim: true, maxlength: 1000, immutable: true },
  actor: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  relatedProcessingJobId: { type: Schema.Types.ObjectId, default: null, immutable: true },
  relatedQuotationId: { type: Schema.Types.ObjectId, default: null, immutable: true },
  relatedSalesOrderId: { type: Schema.Types.ObjectId, default: null, immutable: true },
  relatedDispatchId: { type: Schema.Types.ObjectId, default: null, immutable: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: true,
  strict: 'throw',
});

inventoryMovementSchema.pre('validate', function validateMovement() {
  if (!Number.isInteger(this.quantityDelta)) {
    this.invalidate('quantityDelta', 'Quantity movement must be a whole number.');
  }

  if (this.type === 'RECEIPT' && this.quantityDelta < 0) {
    this.invalidate('quantityDelta', 'Receipt quantity cannot be negative.');
  }
  if (this.type === 'RECEIPT' && this.areaDeltaSqFt < 0) {
    this.invalidate('areaDeltaSqFt', 'Receipt area cannot be negative.');
  }
  if (this.type === 'ADJUSTMENT_IN' && (this.quantityDelta < 0 || this.areaDeltaSqFt < 0)) {
    this.invalidate('type', 'Adjustment-in deltas cannot be negative.');
  }
  if (this.type === 'ADJUSTMENT_OUT' && (this.quantityDelta > 0 || this.areaDeltaSqFt > 0)) {
    this.invalidate('type', 'Adjustment-out deltas cannot be positive.');
  }
  if (this.type === 'TRANSFER') {
    if (this.quantityDelta !== 0 || this.areaDeltaSqFt !== 0) {
      this.invalidate('type', 'Transfers do not change inventory quantity or area.');
    }
    if (!this.fromLocation || !this.toLocation) {
      this.invalidate('toLocation', 'Transfers require both source and destination locations.');
    }
  }
});

inventoryMovementSchema.pre('save', function preventMovementRewrite() {
  if (!this.isNew) throw new Error('Inventory movements are append-only.');
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
  inventoryMovementSchema.pre(operation, function preventMovementMutation() {
    throw new Error('Inventory movements are append-only.');
  });
}

inventoryMovementSchema.pre('updateOne', { document: true, query: false }, function preventDocumentUpdate() {
  throw new Error('Inventory movements are append-only.');
});

inventoryMovementSchema.pre('deleteOne', { document: true, query: false }, function preventDocumentDelete() {
  throw new Error('Inventory movements are append-only.');
});

inventoryMovementSchema.pre('bulkWrite', function preventMovementBulkMutation() {
  throw new Error('Inventory movements are append-only.');
});

inventoryMovementSchema.index({ batch: 1, occurredAt: -1 });
inventoryMovementSchema.index({ slab: 1, occurredAt: -1 });

const InventoryMovement = mongoose.models.InventoryMovement
  || mongoose.model('InventoryMovement', inventoryMovementSchema);

export default InventoryMovement;
