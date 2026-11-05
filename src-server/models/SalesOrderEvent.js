import mongoose from 'mongoose';
import {
  SALES_ORDER_EVENT_TYPES,
  SALES_ORDER_FULFILLMENT_STATUSES,
  SALES_ORDER_STATUSES,
} from '../constants/commercial.js';

const { Schema } = mongoose;
const salesOrderEventSchema = new Schema({
  salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true, immutable: true, index: true },
  salesOrderNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  type: { type: String, enum: SALES_ORDER_EVENT_TYPES, required: true, immutable: true, index: true },
  fromStatus: { type: String, enum: SALES_ORDER_STATUSES, immutable: true },
  toStatus: { type: String, enum: SALES_ORDER_STATUSES, immutable: true },
  lineItemId: { type: Schema.Types.ObjectId, immutable: true },
  reservationId: { type: Schema.Types.ObjectId, ref: 'InventoryReservation', immutable: true },
  processingJobId: { type: Schema.Types.ObjectId, ref: 'ProcessingJob', immutable: true },
  dispatchId: { type: Schema.Types.ObjectId, ref: 'Dispatch', immutable: true, index: true },
  fulfillmentStatus: { type: String, enum: SALES_ORDER_FULFILLMENT_STATUSES, immutable: true },
  quantityDelta: { type: Number, immutable: true }, areaDeltaSqFt: { type: Number, immutable: true },
  actor: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  note: { type: String, trim: true, maxlength: 3000, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: true, strict: 'throw' });

salesOrderEventSchema.pre('save', function preventRewrite() {
  if (!this.isNew) throw new Error('Sales order events are append-only.');
});
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  salesOrderEventSchema.pre(operation, function preventMutation() { throw new Error('Sales order events are append-only.'); });
}
salesOrderEventSchema.pre('bulkWrite', function preventBulkMutation() { throw new Error('Sales order events are append-only.'); });
salesOrderEventSchema.pre('updateOne', { document: true, query: false }, function preventDocumentUpdate() {
  throw new Error('Sales order events are append-only.');
});
salesOrderEventSchema.pre('deleteOne', { document: true, query: false }, function preventDocumentDelete() {
  throw new Error('Sales order events are append-only.');
});
salesOrderEventSchema.index({ salesOrder: 1, occurredAt: -1, _id: -1 });
salesOrderEventSchema.index({ dispatchId: 1, occurredAt: -1, _id: -1 });

const SalesOrderEvent = mongoose.models.SalesOrderEvent || mongoose.model('SalesOrderEvent', salesOrderEventSchema);
export default SalesOrderEvent;
