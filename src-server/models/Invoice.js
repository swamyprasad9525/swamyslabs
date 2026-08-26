import mongoose from 'mongoose';

const { Schema } = mongoose;

// ── Sub-schemas ──────────────────────────────────────────────────────────────

const sellerSchema = new Schema({
  name:      { type: String, required: true },
  tagline:   { type: String },
  address:   { type: String, required: true },
  gstin:     { type: String, required: true },
  email:     { type: String },
  phone:     { type: String },
  stateCode: { type: String, required: true },
}, { _id: false });

const partySchema = new Schema({
  name:      { type: String, required: true },
  address:   { type: String },
  state:     { type: String },
  stateCode: { type: String },
  gstin:     { type: String },
}, { _id: false });

// Consignee doesn't require GSTIN
const consigneeSchema = new Schema({
  name:      { type: String, required: true },
  address:   { type: String },
  state:     { type: String },
  stateCode: { type: String },
  gstin:     { type: String },
}, { _id: false });

const lineItemSchema = new Schema({
  hsnCode:     { type: String },
  description: { type: String, required: true },
  qty:         { type: Number, required: true, min: 0 },
  unit:        { type: String, default: 'Sqm' },
  rate:        { type: Number, required: true, min: 0 },
  amount:      { type: Number },   // computed server-side
}, { _id: false });

const packingSchema = new Schema({
  totalCrates:    { type: Number },
  piecesPerCrate: { type: Number },
}, { _id: false });

const dispatchSchema = new Schema({
  address: { type: String },
  place:   { type: String },
  pincode: { type: String },
  state:   { type: String },
}, { _id: false });

const shipToSchema = new Schema({
  address: { type: String },
  place:   { type: String },
  pincode: { type: String },
  state:   { type: String },
}, { _id: false });

const transportationSchema = new Schema({
  transporterId:   { type: String },
  transporterName: { type: String },
  distanceKm:      { type: String },
}, { _id: false });

const partBSchema = new Schema({
  mode:          { type: String, default: 'Road' },
  vehicleType:   { type: String, default: 'Regular' },
  vehicleNumber: { type: String },
  docNoDate:     { type: String },
}, { _id: false });

// ── Main Invoice schema ───────────────────────────────────────────────────────

const invoiceSchema = new Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  invoiceDate:   { type: Date, required: true, default: Date.now },
  copyType: {
    type: String,
    enum: [
      'ORIGINAL FOR RECIPIENT',
      'DUPLICATE FOR TRANSPORTER',
      'TRIPLICATE FOR SUPPLIER',
    ],
    default: 'ORIGINAL FOR RECIPIENT',
  },
  supplyType:      { type: String, default: 'Outward' },
  subType:         { type: String, default: 'Supply' },
  docType:         { type: String, default: 'Tax Invoice' },
  transactionType: { type: String, default: 'Regular' },
  poNumber:        { type: String },
  transportMode:   { type: String, default: 'By Lorry' },
  vehicleNumber:   { type: String },
  placeOfSupply:   { type: String },

  seller:       { type: sellerSchema, required: true },
  dispatchFrom: { type: dispatchSchema },
  buyer:        { type: partySchema, required: true },
  consignee:    { type: consigneeSchema, required: true },
  shipToDetails:{ type: shipToSchema },

  lineItems: { type: [lineItemSchema], required: true, validate: v => v.length > 0 },

  packing:        { type: packingSchema },
  transportation: { type: transportationSchema },
  partB:          { type: partBSchema },

  // Computed fields — always set server-side
  taxableValue:  { type: Number, required: true },
  taxType: {
    type: String,
    enum: ['IGST', 'CGST_SGST'],
    required: true,
  },
  taxRate:       { type: Number, required: true, default: 18 },
  taxAmount:     { type: Number, required: true },
  grandTotal:    { type: Number, required: true },
  amountInWords: { type: String, required: true },

  notes:     { type: String },
  createdBy: { type: String }, // admin identifier (email or 'admin')
}, {
  timestamps: true, // adds createdAt + updatedAt
});

// Useful list queries
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ 'buyer.name': 1 });

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

export default Invoice;
