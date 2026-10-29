import mongoose from 'mongoose';

const { Schema } = mongoose;

const taxRuleSchema = new Schema({
  stoneId: { type: String, required: true, trim: true, maxlength: 80 },
  stoneSlug: { type: String, required: true, trim: true, lowercase: true, maxlength: 180 },
  hsnCode: { type: String, required: true, trim: true, maxlength: 30 },
  taxRateBasisPoints: {
    type: Number,
    required: true,
    min: 0,
    max: 10000,
    validate: Number.isInteger,
  },
}, { _id: true });

const sellerTaxProfileSchema = new Schema({
  profileKey: {
    type: String,
    required: true,
    default: 'default',
    unique: true,
    immutable: true,
    trim: true,
    maxlength: 40,
  },
  legalName: { type: String, trim: true, maxlength: 180 },
  registeredAddress: { type: String, trim: true, maxlength: 1000 },
  gstin: { type: String, trim: true, uppercase: true, maxlength: 15 },
  registrationState: { type: String, trim: true, maxlength: 120 },
  stateCode: { type: String, trim: true, maxlength: 2 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 30 },
  invoiceSeries: { type: String, trim: true, uppercase: true, maxlength: 24 },
  taxRules: { type: [taxRuleSchema], default: [] },
  verification: {
    identityVerified: { type: Boolean, required: true, default: false },
    taxRulesVerified: { type: Boolean, required: true, default: false },
    verifiedAt: Date,
    verificationNote: { type: String, trim: true, maxlength: 1000 },
  },
  updatedBy: { type: String, trim: true, maxlength: 120 },
}, {
  timestamps: true,
  minimize: true,
  optimisticConcurrency: true,
  strict: 'throw',
});

const SellerTaxProfile = mongoose.models.SellerTaxProfile
  || mongoose.model('SellerTaxProfile', sellerTaxProfileSchema);

export default SellerTaxProfile;
