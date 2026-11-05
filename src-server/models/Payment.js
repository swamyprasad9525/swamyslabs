import mongoose from 'mongoose';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '../constants/payment.js';

const { Schema } = mongoose;

const customerSnapshotSchema = new Schema({
  customerNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 160, immutable: true },
  company: { type: String, trim: true, maxlength: 160, immutable: true },
}, { _id: false });

const paymentSchema = new Schema({
  recordVersion: { type: Number, required: true, default: 1, immutable: true },
  requestKey: { type: String, required: true, trim: true, minlength: 8, maxlength: 120, immutable: true },
  invoiceId: {
    type: Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    immutable: true,
    index: true,
  },
  invoiceNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    immutable: true,
    index: true,
  },
  customerSnapshot: { type: customerSnapshotSchema, required: true, immutable: true },
  currency: { type: String, required: true, enum: ['INR'], default: 'INR', immutable: true },
  amountMinor: {
    type: Number,
    required: true,
    immutable: true,
    validate: {
      validator: (value) => Number.isSafeInteger(value) && value > 0,
      message: 'Payment amount must be a positive safe integer in minor units.',
    },
  },
  method: { type: String, required: true, enum: PAYMENT_METHODS, immutable: true, index: true },
  referenceNumber: { type: String, trim: true, maxlength: 160, immutable: true },
  receivedAt: { type: Date, required: true, default: Date.now, immutable: true, index: true },
  notes: { type: String, trim: true, maxlength: 1000, immutable: true },
  status: {
    type: String,
    required: true,
    enum: PAYMENT_STATUSES,
    default: 'PENDING_VERIFICATION',
    index: true,
  },
  createdBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  confirmedAt: { type: Date },
  confirmedBy: { type: String, trim: true, maxlength: 120 },
  rejectedAt: { type: Date },
  rejectedBy: { type: String, trim: true, maxlength: 120 },
  rejectionReason: { type: String, trim: true, maxlength: 1000 },
  reversedAt: { type: Date },
  reversedBy: { type: String, trim: true, maxlength: 120 },
  reversalReason: { type: String, trim: true, maxlength: 1000 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
  strict: 'throw',
});

paymentSchema.pre('validate', function validatePaymentLifecycle() {
  const hasConfirmation = Boolean(this.confirmedAt && this.confirmedBy);
  const hasRejection = Boolean(this.rejectedAt || this.rejectedBy || this.rejectionReason);
  const hasReversal = Boolean(this.reversedAt || this.reversedBy || this.reversalReason);

  if (this.status === 'PENDING_VERIFICATION' && (hasConfirmation || hasRejection || hasReversal)) {
    this.invalidate('status', 'Pending payments cannot contain transition metadata.');
  } else if (this.status === 'CONFIRMED' && (!hasConfirmation || hasRejection || hasReversal)) {
    this.invalidate('status', 'Confirmed payments require confirmation metadata only.');
  } else if (this.status === 'REJECTED'
    && (hasConfirmation || !this.rejectedAt || !this.rejectedBy || !this.rejectionReason || hasReversal)) {
    this.invalidate('status', 'Rejected payments require complete rejection metadata only.');
  } else if (this.status === 'REVERSED'
    && (!hasConfirmation || hasRejection || !this.reversedAt || !this.reversedBy || !this.reversalReason)) {
    this.invalidate('status', 'Reversed payments require confirmation and reversal metadata.');
  }
});

paymentSchema.index({ invoiceId: 1, requestKey: 1 }, { unique: true });
paymentSchema.index({ invoiceId: 1, status: 1, receivedAt: -1, _id: -1 });
paymentSchema.index({ customerId: 1, receivedAt: -1, _id: -1 });
paymentSchema.index({ status: 1, receivedAt: -1, _id: -1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

export default Payment;
