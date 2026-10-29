import mongoose from 'mongoose';
import { INVOICE_DOCUMENT_STATUSES, INVOICE_EVENT_TYPES } from '../constants/billing.js';

const { Schema } = mongoose;

const invoiceEventSchema = new Schema({
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, immutable: true, index: true },
  invoiceNumber: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  type: { type: String, enum: INVOICE_EVENT_TYPES, required: true, immutable: true, index: true },
  fromStatus: { type: String, enum: INVOICE_DOCUMENT_STATUSES, immutable: true },
  toStatus: { type: String, enum: INVOICE_DOCUMENT_STATUSES, immutable: true },
  actor: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  note: { type: String, trim: true, maxlength: 3000, immutable: true },
  snapshot: { type: Schema.Types.Mixed, immutable: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: true,
  strict: 'throw',
});

invoiceEventSchema.pre('save', function preventRewrite() {
  if (!this.isNew) throw new Error('Invoice events are append-only.');
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
  invoiceEventSchema.pre(operation, function preventMutation() {
    throw new Error('Invoice events are append-only.');
  });
}
invoiceEventSchema.pre('bulkWrite', function preventBulkMutation() {
  throw new Error('Invoice events are append-only.');
});
invoiceEventSchema.pre('updateOne', { document: true, query: false }, function preventDocumentUpdate() {
  throw new Error('Invoice events are append-only.');
});
invoiceEventSchema.pre('deleteOne', { document: true, query: false }, function preventDocumentDelete() {
  throw new Error('Invoice events are append-only.');
});
invoiceEventSchema.index({ invoice: 1, occurredAt: 1, _id: 1 });

const InvoiceEvent = mongoose.models.InvoiceEvent || mongoose.model('InvoiceEvent', invoiceEventSchema);

export default InvoiceEvent;
