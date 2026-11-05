import mongoose from 'mongoose';
import { RESERVATION_EVENT_TYPES, RESERVATION_STATUSES } from '../constants/commercial.js';

const { Schema } = mongoose;

const eventDetailsSchema = new Schema({
  fromStatus: { type: String, enum: RESERVATION_STATUSES },
  toStatus: { type: String, enum: RESERVATION_STATUSES, required: true },
  batchId: { type: Schema.Types.ObjectId, ref: 'InventoryBatch', required: true },
  slabIds: [{ type: Schema.Types.ObjectId, ref: 'Slab' }],
  quantity: { type: Number, required: true, min: 0 },
  areaSqFt: { type: Number, required: true, min: 0 },
}, { _id: false });

const reservationEventSchema = new Schema({
  reservation: {
    type: Schema.Types.ObjectId,
    ref: 'InventoryReservation',
    required: true,
    immutable: true,
    index: true,
  },
  reservationNumber: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
  salesOrderId: {
    type: Schema.Types.ObjectId,
    ref: 'SalesOrder',
    required: true,
    immutable: true,
    index: true,
  },
  salesOrderLineItemId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  type: { type: String, enum: RESERVATION_EVENT_TYPES, required: true, immutable: true, index: true },
  actor: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  reason: { type: String, trim: true, maxlength: 1000, immutable: true },
  details: { type: eventDetailsSchema, required: true, immutable: true },
}, {
  timestamps: { createdAt: true, updatedAt: false },
  minimize: true,
  strict: 'throw',
});

reservationEventSchema.pre('save', function preventEventRewrite() {
  if (!this.isNew) throw new Error('Reservation events are append-only.');
});

for (const operation of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
]) {
  reservationEventSchema.pre(operation, function preventEventMutation() {
    throw new Error('Reservation events are append-only.');
  });
}

reservationEventSchema.pre('updateOne', { document: true, query: false }, function preventDocumentUpdate() {
  throw new Error('Reservation events are append-only.');
});

reservationEventSchema.pre('deleteOne', { document: true, query: false }, function preventDocumentDelete() {
  throw new Error('Reservation events are append-only.');
});

reservationEventSchema.pre('bulkWrite', function preventEventBulkMutation() {
  throw new Error('Reservation events are append-only.');
});

reservationEventSchema.index({ reservation: 1, occurredAt: -1, _id: -1 });
reservationEventSchema.index({ salesOrderId: 1, occurredAt: -1, _id: -1 });

const ReservationEvent = mongoose.models.ReservationEvent
  || mongoose.model('ReservationEvent', reservationEventSchema);

export default ReservationEvent;
