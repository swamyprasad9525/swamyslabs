import mongoose from 'mongoose';
import {
  COMMERCIAL_CURRENCIES,
  COMMERCIAL_TAX_TYPES,
  COMMERCIAL_UNITS,
  QUOTATION_STATUSES,
} from '../constants/commercial.js';
import { PROCESSING_OPERATION_TYPES } from '../constants/processing.js';

const { Schema } = mongoose;

const addressSchema = new Schema({
  line1: { type: String, trim: true, maxlength: 240 },
  line2: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 120 },
  postalCode: { type: String, trim: true, maxlength: 20 },
  country: { type: String, trim: true, maxlength: 120 },
}, { _id: false });

const customerSnapshotSchema = new Schema({
  customerNumber: { type: String, required: true, trim: true, maxlength: 80 },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  company: { type: String, trim: true, maxlength: 160 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 30 },
  billingAddress: { type: addressSchema, default: undefined },
  deliveryAddress: { type: addressSchema, default: undefined },
}, { _id: false });

const sellerSnapshotSchema = new Schema({
  name: { type: String, trim: true, maxlength: 180 },
  tagline: { type: String, trim: true, maxlength: 240 },
  address: { type: String, trim: true, maxlength: 1000 },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 30 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 30 },
  stateCode: { type: String, trim: true, maxlength: 10 },
}, { _id: false });

const stoneSnapshotSchema = new Schema({
  stoneId: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
  name: { type: String, required: true, trim: true, maxlength: 180 },
  materialFamily: { type: String, trim: true, maxlength: 100 },
}, { _id: false });

const dimensionsSchema = new Schema({
  lengthMm: { type: Number, min: 0.01 },
  widthMm: { type: Number, min: 0.01 },
}, { _id: false });

const processingRequirementSchema = new Schema({
  operation: { type: String, enum: PROCESSING_OPERATION_TYPES, required: true },
  notes: { type: String, trim: true, maxlength: 1000 },
}, { _id: true });

const quotationLineSchema = new Schema({
  stoneSnapshot: { type: stoneSnapshotSchema, required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  finish: { type: String, trim: true, maxlength: 120 },
  thicknessMm: { type: Number, min: 0.01 },
  dimensions: { type: dimensionsSchema, default: undefined },
  quantity: { type: Number, required: true, min: 0.001 },
  quantityMilli: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  areaSqFt: { type: Number, min: 0.001 },
  unit: { type: String, enum: COMMERCIAL_UNITS, required: true },
  unitRateMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  lineSubtotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  discountBasisPoints: { type: Number, required: true, min: 0, max: 10000, validate: Number.isInteger },
  discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  taxableMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  taxRateBasisPoints: { type: Number, required: true, min: 0, max: 10000, validate: Number.isInteger },
  taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  lineTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  processingRequirements: { type: [processingRequirementSchema], default: undefined },
  notes: { type: String, trim: true, maxlength: 1000 },
}, { _id: true });

const taxBreakdownSchema = new Schema({
  taxRateBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
  taxableMinor: { type: Number, required: true, min: 0 },
  taxMinor: { type: Number, required: true, min: 0 },
}, { _id: false });

const projectSnapshotSchema = new Schema({
  location: { type: String, trim: true, maxlength: 200 },
  application: { type: String, trim: true, maxlength: 160 },
  enteredArea: { type: String, trim: true, maxlength: 160 },
  projectAreaSqFt: { type: Number, min: 0 },
  planningAllowancePercent: { type: Number, min: 0, max: 100 },
  requiredAreaSqFt: { type: Number, min: 0 },
  estimatedSlabs: { type: Number, min: 0 },
}, { _id: false });

const notificationSchema = new Schema({
  status: {
    type: String,
    enum: ['NOT_SENT', 'NOT_CONFIGURED'],
    required: true,
    default: 'NOT_CONFIGURED',
  },
}, { _id: false });

const quotationSchema = new Schema({
  quotationNumber: { type: String, required: true, unique: true, immutable: true, trim: true },
  rootQuotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true, immutable: true, index: true },
  supersedesQuotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', immutable: true, default: null },
  supersededByQuotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', default: null },
  revision: { type: Number, required: true, min: 1, validate: Number.isInteger, immutable: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  sourceLeadId: { type: Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
  sourceLeadNumber: { type: String, trim: true, maxlength: 80, immutable: true },
  status: { type: String, enum: QUOTATION_STATUSES, required: true, default: 'DRAFT', index: true },
  issueDate: { type: Date },
  validUntil: { type: Date },
  customerSnapshot: { type: customerSnapshotSchema, required: true },
  sellerSnapshot: { type: sellerSnapshotSchema, default: undefined },
  projectSnapshot: { type: projectSnapshotSchema, default: undefined },
  lineItems: { type: [quotationLineSchema], required: true, validate: (items) => Array.isArray(items) && items.length > 0 },
  currency: { type: String, enum: COMMERCIAL_CURRENCIES, required: true, uppercase: true },
  taxType: { type: String, enum: COMMERCIAL_TAX_TYPES, required: true, default: 'NONE' },
  subtotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  taxableMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  cgstMinor: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  sgstMinor: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  igstMinor: { type: Number, required: true, min: 0, default: 0, validate: Number.isSafeInteger },
  grandTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  taxBreakdown: { type: [taxBreakdownSchema], default: [] },
  paymentTerms: { type: String, trim: true, maxlength: 3000 },
  deliveryTerms: { type: String, trim: true, maxlength: 3000 },
  notes: { type: String, trim: true, maxlength: 3000 },
  internalNotes: { type: String, trim: true, maxlength: 3000 },
  notification: { type: notificationSchema, required: true, default: () => ({ status: 'NOT_CONFIGURED' }) },
  acceptedAt: Date,
  rejectedAt: Date,
  expiredAt: Date,
  cancelledAt: Date,
  convertedAt: Date,
  convertedSalesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  createdBy: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, { timestamps: true, minimize: true, optimisticConcurrency: true, strict: 'throw' });

quotationSchema.index({ status: 1, validUntil: 1 });
quotationSchema.index({ customerId: 1, createdAt: -1 });
quotationSchema.index({ sourceLeadId: 1, createdAt: -1 });
quotationSchema.index({ rootQuotationId: 1, revision: 1 }, { unique: true });
quotationSchema.index(
  { convertedSalesOrderId: 1 },
  { unique: true, partialFilterExpression: { convertedSalesOrderId: { $type: 'objectId' } } },
);

const Quotation = mongoose.models.Quotation || mongoose.model('Quotation', quotationSchema);
export default Quotation;
