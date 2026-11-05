import mongoose from 'mongoose';
import {
  BILLING_CURRENCIES,
  COMMERCIAL_TAX_TYPES,
  INVOICE_DOCUMENT_STATUSES,
  INVOICE_PAYMENT_STATUSES,
  INVOICE_RECORD_VERSION,
} from '../constants/billing.js';

const { Schema } = mongoose;

// The legacy shapes remain intact so historical invoices can still be listed,
// viewed, printed and exported without a data migration.
const sellerSchema = new Schema({
  name: { type: String, required: true },
  tagline: String,
  address: { type: String, required: true },
  gstin: { type: String, required: true },
  email: String,
  phone: String,
  stateCode: { type: String, required: true },
}, { _id: false });

const partySchema = new Schema({
  name: { type: String, required: true },
  address: String,
  state: String,
  stateCode: String,
  gstin: String,
}, { _id: false });

const lineItemSchema = new Schema({
  hsnCode: String,
  description: { type: String, required: true },
  qty: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'Sqm' },
  rate: { type: Number, required: true, min: 0 },
  amount: Number,
}, { _id: false });

const addressSchema = new Schema({
  line1: { type: String, trim: true, maxlength: 240 },
  line2: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 120 },
  stateCode: { type: String, trim: true, maxlength: 2 },
  postalCode: { type: String, trim: true, maxlength: 20 },
  country: { type: String, trim: true, maxlength: 120 },
}, { _id: false });

const invoiceItemV2Schema = new Schema({
  sourceSalesOrderLineItemId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  stoneSnapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  description: { type: String, required: true, trim: true, maxlength: 500, immutable: true },
  finish: { type: String, trim: true, maxlength: 120, immutable: true },
  thicknessMm: { type: Number, min: 0.01, immutable: true },
  dimensions: { type: Schema.Types.Mixed, immutable: true },
  quantity: { type: Number, required: true, min: 0.001, immutable: true },
  quantityMilli: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  areaSqFt: { type: Number, min: 0.001, immutable: true },
  unit: { type: String, required: true, trim: true, maxlength: 30, immutable: true },
  unitRateMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  lineSubtotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  discountBasisPoints: { type: Number, required: true, min: 0, max: 10000, validate: Number.isInteger, immutable: true },
  discountMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  taxableMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  taxRateBasisPoints: { type: Number, required: true, min: 0, max: 10000, validate: Number.isInteger, immutable: true },
  taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  lineTotalMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger, immutable: true },
  hsnCode: { type: String, trim: true, maxlength: 30 },
}, { _id: true });

const taxBreakdownSchema = new Schema({
  taxRateBasisPoints: { type: Number, required: true, min: 0, max: 10000, validate: Number.isInteger },
  taxableMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  taxMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  cgstMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  sgstMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  igstMinor: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
}, { _id: false });

const paymentSummarySchema = new Schema({
  confirmedMinor: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
  outstandingMinor: { type: Number, required: true, default: 0, min: 0, validate: Number.isSafeInteger },
  status: { type: String, enum: INVOICE_PAYMENT_STATUSES, required: true, default: 'UNPAID' },
  lastReconciledAt: Date,
}, { _id: false });

const invoiceSchema = new Schema({
  // Shared and legacy-compatible identity.
  invoiceNumber: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  invoiceDate: { type: Date, required: true, default: Date.now },
  recordVersion: { type: Number, enum: [INVOICE_RECORD_VERSION] },
  draftReference: { type: String, trim: true, maxlength: 100 },
  draftRequestKey: { type: String, trim: true, maxlength: 120 },
  issueRequestKey: { type: String, trim: true, maxlength: 120 },

  // Phase 8 source-of-truth links. Historical rows deliberately remain unlinked.
  salesOrderId: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
  quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation' },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
  salesOrderNumber: { type: String, trim: true, maxlength: 100 },
  quotationNumber: { type: String, trim: true, maxlength: 100 },

  documentStatus: { type: String, enum: INVOICE_DOCUMENT_STATUSES },
  currency: { type: String, enum: BILLING_CURRENCIES, uppercase: true },
  issueDate: Date,
  taxDate: Date,
  dueDate: Date,
  placeOfSupplyStateCode: { type: String, trim: true, maxlength: 2 },
  customerIdentitySnapshot: { type: Schema.Types.Mixed },
  sellerIdentitySnapshot: { type: Schema.Types.Mixed },
  billingAddressSnapshot: { type: addressSchema, default: undefined },
  shippingAddressSnapshot: { type: addressSchema, default: undefined },
  itemsV2: { type: [invoiceItemV2Schema], default: undefined },
  subtotalMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  discountMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  taxableMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  taxMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  cgstMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  sgstMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  igstMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  grandTotalMinor: { type: Number, min: 0, validate: Number.isSafeInteger },
  taxBreakdownV2: { type: [taxBreakdownSchema], default: undefined },
  paymentSummary: { type: paymentSummarySchema, default: undefined },
  terms: { type: String, trim: true, maxlength: 3000 },
  issuedAt: Date,
  issuedBy: { type: String, trim: true, maxlength: 120 },
  issuedSnapshot: { type: Schema.Types.Mixed, immutable: true },

  // Original invoice fields retained for historical records and legacy exports.
  copyType: {
    type: String,
    enum: ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER'],
    default: 'ORIGINAL FOR RECIPIENT',
  },
  supplyType: { type: String, default: 'Outward' },
  subType: { type: String, default: 'Supply' },
  docType: { type: String, default: 'Tax Invoice' },
  transactionType: { type: String, default: 'Regular' },
  poNumber: String,
  transportMode: { type: String, default: 'By Lorry' },
  vehicleNumber: String,
  placeOfSupply: String,
  seller: { type: sellerSchema },
  dispatchFrom: { type: Schema.Types.Mixed },
  buyer: { type: partySchema },
  consignee: { type: partySchema },
  shipToDetails: { type: Schema.Types.Mixed },
  lineItems: { type: [lineItemSchema], default: undefined },
  packing: { type: Schema.Types.Mixed },
  transportation: { type: Schema.Types.Mixed },
  partB: { type: Schema.Types.Mixed },
  taxableValue: Number,
  taxType: { type: String, enum: COMMERCIAL_TAX_TYPES },
  taxRate: Number,
  taxAmount: Number,
  grandTotal: Number,
  amountInWords: String,
  notes: { type: String, trim: true, maxlength: 3000 },
  createdBy: { type: String, trim: true, maxlength: 120 },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
});

invoiceSchema.pre('validate', function validateRecordShape() {
  if (this.recordVersion === INVOICE_RECORD_VERSION) {
    const required = [
      ['salesOrderId', this.salesOrderId],
      ['quotationId', this.quotationId],
      ['customerId', this.customerId],
      ['documentStatus', this.documentStatus],
      ['currency', this.currency],
    ];
    for (const [field, value] of required) {
      if (!value) this.invalidate(field, field + ' is required for a version 2 invoice.');
    }
    if (!Array.isArray(this.itemsV2) || this.itemsV2.length === 0) {
      this.invalidate('itemsV2', 'At least one invoice item is required.');
    }
    for (const field of ['subtotalMinor', 'discountMinor', 'taxableMinor', 'taxMinor', 'grandTotalMinor']) {
      if (!Number.isSafeInteger(this[field]) || this[field] < 0) {
        this.invalidate(field, field + ' must be a non-negative safe integer.');
      }
    }
    if (this.documentStatus === 'ISSUED') {
      if (!this.issueDate || !this.issuedAt || !this.issuedSnapshot) {
        this.invalidate('documentStatus', 'Issued invoices require an immutable issuance snapshot.');
      }
      if (String(this.invoiceNumber).startsWith('DRAFT-')) {
        this.invalidate('invoiceNumber', 'Issued invoices require an official invoice number.');
      }
    }
    return;
  }

  if (!this.seller) this.invalidate('seller', 'Seller is required.');
  if (!this.buyer) this.invalidate('buyer', 'Buyer is required.');
  if (!this.consignee) this.invalidate('consignee', 'Consignee is required.');
  if (!Array.isArray(this.lineItems) || this.lineItems.length === 0) {
    this.invalidate('lineItems', 'At least one line item is required.');
  }
  for (const field of ['taxableValue', 'taxRate', 'taxAmount', 'grandTotal']) {
    if (!Number.isFinite(this[field])) this.invalidate(field, field + ' is required.');
  }
  if (!this.taxType) this.invalidate('taxType', 'Tax type is required.');
  if (!this.amountInWords) this.invalidate('amountInWords', 'Amount in words is required.');
});

invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ 'buyer.name': 1 });
invoiceSchema.index({ documentStatus: 1, issueDate: -1 });
invoiceSchema.index({ customerId: 1, createdAt: -1 });
invoiceSchema.index({ salesOrderId: 1 }, {
  unique: true,
  partialFilterExpression: { recordVersion: INVOICE_RECORD_VERSION, salesOrderId: { $type: 'objectId' } },
});
invoiceSchema.index({ draftRequestKey: 1 }, {
  unique: true,
  partialFilterExpression: { recordVersion: INVOICE_RECORD_VERSION, draftRequestKey: { $type: 'string' } },
});
invoiceSchema.index({ issueRequestKey: 1 }, {
  unique: true,
  partialFilterExpression: { recordVersion: INVOICE_RECORD_VERSION, issueRequestKey: { $type: 'string' } },
});

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

export default Invoice;
