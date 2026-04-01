import mongoose from 'mongoose';

const processedEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true },
  processedAt: { type: Date, required: true, default: Date.now }
}, { timestamps: false });

// TTL index to auto-delete old processed events after 7 days
processedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 604800 });

const ProcessedEvent = mongoose.model('ProcessedEvent', processedEventSchema);

export default ProcessedEvent;
