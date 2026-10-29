import mongoose from 'mongoose';
import {
  INVOICE_PAYMENT_STATUSES,
  PAYMENT_EVENT_TYPES,
  PAYMENT_STATUSES,
} from '../constants/payment.js';

const { Schema } = mongoose;

const paymentSummarySchema = new Schema({
  confirmedMinor: {
    type: Number,
    required: true,
    min: 0,
    validate: Number.isSafeInteger,
    immutable: true,
  },
  outstandingMinor: {
    type: Number,
    required: true,
    min: 0,
    validate: Number.isSafeInteger,
    immutable: true,
  },
  status: { type: String, required: true, enum: INVOICE_PAYMENT_STATUSES, immutable: true },
}, { _id: false });

const paymentEventSchema = new Schema({
  paymentId: {
    type: Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    immutable: true,
    index: true,
  },
  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    immutable: true,
    index: true,
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    immutable: true,
  },
  type: { type: String, enum: PAYMENT_EVENT_TYPES, required: true, immutable: true, index: true },
  fromStatus: { type: String, enum: PAYMENT_STATUSES, immutable: true },
  toStatus: { type: String, enum: PAYMENT_STATUSES, required: true, immutable: true },
  amountMinor: {
    type: Number,
    required: true,
    validate: Number.isSafeInteger,
    immutable: true,
  },
  currency: { type: String, required: true, enum: ['INR'], immutable: true },
  paymentSummary: { type: paymentSummarySchema, immutable: true },
  actor: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  reason: { type: String, trim: true, maxlength: 1000, immutable: true },
  note: { type: String, trim: true, maxlength: 1000, immutable: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: true,
  strict: 'throw',
});

paymentEventSchema.pre('save', function preventRewrite() {
  if (!this.isNew) throw new Error('Payment events are append-only.');
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
  paymentEventSchema.pre(operation, function preventMutation() {
    throw new Error('Payment events are append-only.');
  });
}

paymentEventSchema.pre('bulkWrite', function preventBulkMutation() {
  throw new Error('Payment events are append-only.');
});
paymentEventSchema.pre('updateOne', { document: true, query: false }, function preventDocumentUpdate() {
  throw new Error('Payment events are append-only.');
});
paymentEventSchema.pre('deleteOne', { document: true, query: false }, function preventDocumentDelete() {
  throw new Error('Payment events are append-only.');
});

paymentEventSchema.index({ paymentId: 1, occurredAt: -1, _id: -1 });
paymentEventSchema.index({ invoiceId: 1, occurredAt: -1, _id: -1 });

const PaymentEvent = mongoose.models.PaymentEvent
  || mongoose.model('PaymentEvent', paymentEventSchema);

export default PaymentEvent;
