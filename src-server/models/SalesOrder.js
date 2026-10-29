import mongoose from 'mongoose';
import {
  COMMERCIAL_CURRENCIES,
  COMMERCIAL_UNITS,
  SALES_ORDER_FULFILLMENT_STATUSES,
  SALES_ORDER_STATUSES,
} from '../constants/commercial.js';
import { PROCESSING_OPERATION_TYPES } from '../constants/processing.js';

const { Schema } = mongoose;
const addressSchema = new Schema({
  line1: { type: String, trim: true, maxlength: 240 }, line2: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 }, state: { type: String, trim: true, maxlength: 120 },
  postalCode: { type: String, trim: true, maxlength: 20 }, country: { type: String, trim: true, maxlength: 120 },
}, { _id: false });
const customerSnapshotSchema = new Schema({
  customerNumber: { type: String, required: true, trim: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  company: { type: String, trim: true, maxlength: 160 }, email: { type: String, trim: true, maxlength: 254 },
  phone: { type: String, required: true, trim: true, maxlength: 20 }, gstin: { type: String, trim: true, maxlength: 30 },
  billingAddress: { type: addressSchema, default: undefined }, deliveryAddress: { type: addressSchema, default: undefined },
}, { _id: false });
const stoneSnapshotSchema = new Schema({
  stoneId: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, trim: true, maxlength: 180 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  materialFamily: { type: String, trim: true, maxlength: 100 },
}, { _id: false });
const processingRequirementSchema = new Schema({
  operation: { type: String, enum: PROCESSING_OPERATION_TYPES, required: true },
  notes: { type: String, trim: true, maxlength: 1000 },
}, { _id: true });
const dimensionsSchema = new Schema({
  lengthMm: { type: Number, min: 0.01 },
  widthMm: { type: Number, min: 0.01 },
}, { _id: false });
const orderLineSchema = new Schema({
  quotationLineItemId: { type: Schema.Types.ObjectId, required: true },
  stoneSnapshot: { type: stoneSnapshotSchema, required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  finish: { type: String, trim: true, maxlength: 120 }, thicknessMm: { type: Number, min: 0.01 },
  dimensions: { type: dimensionsSchema, default: undefined },
  quantity: { type: Number, required: true, min: 0.001 },
  quantityMilli: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  areaSqFt: { type: Number, min: 0.001 },
  unit: { type: String, enum: COMMERCIAL_UNITS, required: true },
  unitRateMinor: { type: Number, required: true, min: 0 },
  lineSubtotalMinor: { type: Number, required: true, min: 0 },
  discountBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
  discountMinor: { type: Number, required: true, min: 0 },
  taxableMinor: { type: Number, required: true, min: 0 },
  taxRateBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
  taxMinor: { type: Number, required: true, min: 0 },
  lineTotalMinor: { type: Number, required: true, min: 0 },
  processingRequirements: { type: [processingRequirementSchema], default: undefined },
  notes: { type: String, trim: true, maxlength: 1000 },
  reservedQuantity: { type: Number, required: true, min: 0, default: 0 },
  reservedAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
  activeReservationCount: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  fulfilledQuantity: { type: Number, required: true, min: 0, default: 0 },
  remainingQuantity: { type: Number, required: true, min: 0, default: 0 },
  fulfilledAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
  remainingAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
}, { _id: true });
const allocationSummarySchema = new Schema({
  orderedQuantity: { type: Number, required: true, min: 0, default: 0 },
  reservedQuantity: { type: Number, required: true, min: 0, default: 0 },
  orderedAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
  reservedAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
  activeReservationCount: { type: Number, required: true, min: 0, default: 0 },
  totalLineCount: { type: Number, required: true, min: 0, default: 0 },
  allocatedLineCount: { type: Number, required: true, min: 0, default: 0 },
  partiallyAllocatedLineCount: { type: Number, required: true, min: 0, default: 0 },
}, { _id: false });
const processingLinkSchema = new Schema({
  lineItemId: { type: Schema.Types.ObjectId, required: true },
  processingJobId: { type: Schema.Types.ObjectId, ref: 'ProcessingJob', required: true },
  linkedAt: { type: Date, required: true },
}, { _id: true });
const fulfillmentSchema = new Schema({
  status: {
    type: String,
    enum: SALES_ORDER_FULFILLMENT_STATUSES,
    required: true,
    default: 'UNFULFILLED',
  },
  orderedQuantity: { type: Number, required: true, min: 0, default: 0 },
  fulfilledQuantity: { type: Number, required: true, min: 0, default: 0 },
  remainingQuantity: { type: Number, required: true, min: 0, default: 0 },
  orderedAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
  fulfilledAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
  remainingAreaSqFt: { type: Number, required: true, min: 0, default: 0 },
  totalLineCount: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  fullyDispatchedLineCount: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  partiallyDispatchedLineCount: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
  lastDispatchAt: { type: Date },
}, { _id: false });

const salesOrderSchema = new Schema({
  salesOrderNumber: { type: String, required: true, unique: true, immutable: true, trim: true },
  quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true, immutable: true, unique: true },
  quotationNumber: { type: String, required: true, immutable: true, trim: true },
  quotationRevision: { type: Number, required: true, immutable: true, min: 1 },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true, index: true },
  sourceLeadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null, immutable: true, index: true },
  status: { type: String, enum: SALES_ORDER_STATUSES, required: true, default: 'CONFIRMED', index: true },
  customerSnapshot: { type: customerSnapshotSchema, required: true, immutable: true },
  sellerSnapshot: { type: Schema.Types.Mixed, immutable: true },
  items: { type: [orderLineSchema], required: true },
  currency: { type: String, enum: COMMERCIAL_CURRENCIES, required: true, immutable: true },
  financialSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  requestedDeliveryDate: Date,
  allocationSummary: { type: allocationSummarySchema, required: true, default: () => ({}) },
  fulfillment: { type: fulfillmentSchema, required: true, default: () => ({}) },
  processingLinks: { type: [processingLinkSchema], default: [] },
  confirmedAt: { type: Date, required: true }, cancelledAt: Date,
  cancellationReason: { type: String, trim: true, maxlength: 1000 },
  createdBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, { timestamps: true, minimize: true, optimisticConcurrency: true, strict: 'throw' });

salesOrderSchema.index({ status: 1, updatedAt: -1 });
salesOrderSchema.index({ customerId: 1, createdAt: -1 });
salesOrderSchema.index({ sourceLeadId: 1, createdAt: -1 });

const SalesOrder = mongoose.models.SalesOrder || mongoose.model('SalesOrder', salesOrderSchema);
export default SalesOrder;
