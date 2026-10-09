import mongoose from 'mongoose';
import { ACTIVITY_TYPES, LEAD_SOURCES, LEAD_STAGES } from '../constants/crm.js';

const { Schema } = mongoose;

const activitySchema = new Schema({
  type: { type: String, enum: ACTIVITY_TYPES, required: true },
  note: { type: String, trim: true, maxlength: 3000, required: true },
  actor: { type: String, trim: true, maxlength: 120, required: true },
  createdAt: { type: Date, default: Date.now, required: true },
}, { _id: true });

const stageHistorySchema = new Schema({
  from: { type: String, enum: LEAD_STAGES },
  to: { type: String, enum: LEAD_STAGES, required: true },
  reason: { type: String, trim: true, maxlength: 1000 },
  actor: { type: String, trim: true, maxlength: 120, required: true },
  changedAt: { type: Date, default: Date.now, required: true },
}, { _id: true });

const materialSelectionSchema = new Schema({
  stoneId: { type: String, trim: true, maxlength: 80 },
  stoneSlug: { type: String, trim: true, maxlength: 180 },
  stoneName: { type: String, trim: true, maxlength: 150, required: true },
  materialFamily: { type: String, trim: true, maxlength: 100 },
  finish: { type: String, trim: true, maxlength: 120 },
  thickness: { type: String, trim: true, maxlength: 50 },
  quantity: { type: Number, min: 1, max: 10000 },
}, { _id: false });

const leadSchema = new Schema({
  leadNumber: { type: String, required: true, unique: true, trim: true },
  submissionId: { type: String, required: true, unique: true, trim: true },
  source: { type: String, enum: LEAD_SOURCES, required: true, index: true },
  stage: { type: String, enum: LEAD_STAGES, default: 'NEW', required: true, index: true },
  contact: {
    name: { type: String, trim: true, maxlength: 120 },
    company: { type: String, trim: true, maxlength: 160 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20, required: true },
  },
  project: {
    location: { type: String, trim: true, maxlength: 200 },
    message: { type: String, trim: true, maxlength: 3000 },
    application: { type: String, trim: true, maxlength: 160 },
    enteredArea: { type: String, trim: true, maxlength: 160 },
    sourcePage: { type: String, trim: true, maxlength: 500 },
    preferredContactTime: { type: String, trim: true, maxlength: 100 },
  },
  materialContext: {
    stoneId: { type: String, trim: true, maxlength: 80 },
    stoneSlug: { type: String, trim: true, maxlength: 180 },
    stoneName: { type: String, trim: true, maxlength: 150 },
    materialFamily: { type: String, trim: true, maxlength: 100 },
    finish: { type: String, trim: true, maxlength: 120 },
    thickness: { type: String, trim: true, maxlength: 50 },
    application: { type: String, trim: true, maxlength: 160 },
    quantity: { type: String, trim: true, maxlength: 100 },
  },
  materialSelections: {
    type: [materialSelectionSchema],
    default: undefined,
    validate: {
      validator: (items) => !items || items.length <= 25,
      message: 'A maximum of 25 material selections is allowed.',
    },
  },
  estimatorContext: {
    projectAreaSqFt: { type: Number, min: 0 },
    planningAllowancePercent: { type: Number, min: 0, max: 100 },
    requiredAreaSqFt: { type: Number, min: 0 },
    estimatedSlabs: { type: Number, min: 0 },
    indicativeMaterialEstimate: { type: Number, min: 0 },
  },
  attachment: {
    filename: { type: String, trim: true, maxlength: 120 },
    mimeType: { type: String, trim: true, maxlength: 80 },
    size: { type: Number, min: 0, max: 5 * 1024 * 1024 },
  },
  notification: {
    emailStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED', 'NOT_CONFIGURED'],
      default: 'PENDING',
    },
    attemptedAt: Date,
  },
  stageHistory: { type: [stageHistorySchema], default: [] },
  activities: { type: [activitySchema], default: [] },
  lostReason: { type: String, trim: true, maxlength: 1000 },
  customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
  convertedAt: Date,
}, {
  timestamps: true,
  minimize: true,
});

leadSchema.index({ createdAt: -1 });
leadSchema.index({ stage: 1, createdAt: -1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ 'contact.email': 1 });
leadSchema.index({ 'contact.phone': 1 });

const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema);

export default Lead;
