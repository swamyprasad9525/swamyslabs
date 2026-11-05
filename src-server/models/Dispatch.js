import mongoose from 'mongoose';
import {
  DISPATCH_STATUSES,
  TRANSPORT_MODES,
} from '../constants/dispatch.js';

const { Schema } = mongoose;

const addressSchema = new Schema({
  line1: { type: String, trim: true, maxlength: 240 },
  line2: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 120 },
  stateCode: { type: String, trim: true, maxlength: 2 },
  postalCode: { type: String, trim: true, maxlength: 20 },
  country: { type: String, trim: true, maxlength: 120 },
}, { _id: false });

const transportSchema = new Schema({
  mode: { type: String, enum: TRANSPORT_MODES, default: 'BY_LORRY' },
  transporterName: { type: String, trim: true, maxlength: 180 },
  vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 50 },
  driverName: { type: String, trim: true, maxlength: 120 },
  driverPhone: { type: String, trim: true, maxlength: 30 },
  lrNumber: { type: String, trim: true, maxlength: 100 },
  ewayBillNumber: { type: String, trim: true, maxlength: 50 },
  notes: { type: String, trim: true, maxlength: 1000 },
}, { _id: false });

const dispatchItemSchema = new Schema({
  salesOrderLineItemId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  reservationId: { type: Schema.Types.ObjectId, ref: 'InventoryReservation', required: true, immutable: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'InventoryBatch', required: true, immutable: true },
  batchNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  stoneSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  inventoryMode: { type: String, enum: ['BATCH', 'INDIVIDUAL_SLAB'], required: true, immutable: true },
  quantity: { type: Number, required: true, min: 0, immutable: true },
  quantityMilli: { type: Number, required: true, min: 0, immutable: true },
  areaSqFt: { type: Number, required: true, min: 0, immutable: true },
  slabIds: [{ type: Schema.Types.ObjectId, ref: 'Slab', immutable: true }],
  slabNumbers: [{ type: String, trim: true, maxlength: 80, immutable: true }],
  unit: { type: String, required: true, trim: true, maxlength: 30, immutable: true },
}, { _id: true });

const dispatchSchema = new Schema({
  dispatchNumber: {
    type: String,
    required: true,
    unique: true,
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
  salesOrderNumber: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    maxlength: 100,
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    immutable: true,
    index: true,
  },
  customerSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  status: {
    type: String,
    enum: DISPATCH_STATUSES,
    required: true,
    default: 'DRAFT',
    index: true,
  },
  dispatchDate: { type: Date, required: true, default: Date.now },
  transport: { type: transportSchema, default: () => ({ mode: 'BY_LORRY' }) },
  destinationAddress: { type: addressSchema, default: undefined },
  items: { type: [dispatchItemSchema], required: true },
  totalQuantity: { type: Number, required: true, min: 0 },
  totalAreaSqFt: { type: Number, required: true, min: 0 },
  totalSlabs: { type: Number, required: true, min: 0, default: 0 },
  gatePassNumber: { type: String, trim: true, maxlength: 80 },
  requestKey: { type: String, trim: true, maxlength: 120 },
  notes: { type: String, trim: true, maxlength: 2000 },
  readyAt: Date,
  readyBy: { type: String, trim: true, maxlength: 120 },
  confirmedAt: Date,
  confirmedBy: { type: String, trim: true, maxlength: 120 },
  cancelledAt: Date,
  cancelledBy: { type: String, trim: true, maxlength: 120 },
  cancellationReason: { type: String, trim: true, maxlength: 1000 },
  dispatchedSnapshot: { type: Schema.Types.Mixed, immutable: true },
  createdBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
  strict: 'throw',
});

dispatchSchema.pre('validate', function validateDispatch() {
  if (!Array.isArray(this.items) || this.items.length === 0) {
    this.invalidate('items', 'At least one dispatch item is required.');
  }

  if (this.status === 'DISPATCHED') {
    if (!this.confirmedAt || !this.confirmedBy) {
      this.invalidate('status', 'Dispatched status requires confirmation timestamp and actor.');
    }
    if (!this.dispatchedSnapshot) {
      this.invalidate('dispatchedSnapshot', 'Dispatched status requires an immutable dispatch snapshot.');
    }
  }

  if (this.status === 'CANCELLED') {
    if (!this.cancelledAt || !this.cancelledBy || !this.cancellationReason) {
      this.invalidate('status', 'Cancelled dispatch requires cancellation date, actor, and reason.');
    }
  }
});

dispatchSchema.index({ status: 1, dispatchDate: -1 });
dispatchSchema.index({ customerId: 1, createdAt: -1 });
dispatchSchema.index(
  { salesOrderId: 1, requestKey: 1 },
  { unique: true, partialFilterExpression: { requestKey: { $type: 'string' } } },
);

const Dispatch = mongoose.models.Dispatch || mongoose.model('Dispatch', dispatchSchema);

export default Dispatch;

