import mongoose from 'mongoose';

const { Schema } = mongoose;

const addressSchema = new Schema({
  line1: { type: String, trim: true, maxlength: 240 },
  line2: { type: String, trim: true, maxlength: 240 },
  city: { type: String, trim: true, maxlength: 120 },
  state: { type: String, trim: true, maxlength: 120 },
  postalCode: { type: String, trim: true, maxlength: 20 },
  country: { type: String, trim: true, maxlength: 120 },
}, { _id: false });

const customerSchema = new Schema({
  customerNumber: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  company: { type: String, trim: true, maxlength: 160 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, required: true, trim: true, maxlength: 20 },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 30 },
  billingAddress: addressSchema,
  deliveryAddress: addressSchema,
  notes: { type: String, trim: true, maxlength: 3000 },
  sourceLead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, unique: true },
}, {
  timestamps: true,
  minimize: true,
});

customerSchema.index({ createdAt: -1 });
customerSchema.index({ name: 1 });
customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });

const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);

export default Customer;
