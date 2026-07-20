import mongoose from 'mongoose';

/**
 * Counters collection — tracks the last-used invoice sequence per financial year.
 * _id  : counter key, e.g. "invoices_2025-26"
 * seq  : last used sequence number (incremented atomically with findOneAndUpdate)
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export default Counter;
