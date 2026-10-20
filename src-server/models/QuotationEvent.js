import mongoose from 'mongoose';
import { QUOTATION_EVENT_TYPES, QUOTATION_STATUSES } from '../constants/commercial.js';

const { Schema } = mongoose;
const quotationEventSchema = new Schema({
  quotation: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true, immutable: true, index: true },
  quotationNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  revision: { type: Number, required: true, min: 1, immutable: true },
  type: { type: String, enum: QUOTATION_EVENT_TYPES, required: true, immutable: true, index: true },
  fromStatus: { type: String, enum: QUOTATION_STATUSES, immutable: true },
  toStatus: { type: String, enum: QUOTATION_STATUSES, immutable: true },
  actor: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  note: { type: String, trim: true, maxlength: 3000, immutable: true },
  relatedQuotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', immutable: true },
  relatedSalesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder', immutable: true },
  snapshot: { type: Schema.Types.Mixed, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, minimize: true, strict: 'throw' });

quotationEventSchema.pre('save', function preventRewrite() {
  if (!this.isNew) throw new Error('Quotation events are append-only.');
});
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  quotationEventSchema.pre(operation, function preventMutation() { throw new Error('Quotation events are append-only.'); });
}
quotationEventSchema.pre('bulkWrite', function preventBulkMutation() { throw new Error('Quotation events are append-only.'); });
quotationEventSchema.pre('updateOne', { document: true, query: false }, function preventDocumentUpdate() {
  throw new Error('Quotation events are append-only.');
});
quotationEventSchema.pre('deleteOne', { document: true, query: false }, function preventDocumentDelete() {
  throw new Error('Quotation events are append-only.');
});
quotationEventSchema.index({ quotation: 1, occurredAt: -1, _id: -1 });

const QuotationEvent = mongoose.models.QuotationEvent || mongoose.model('QuotationEvent', quotationEventSchema);
export default QuotationEvent;
