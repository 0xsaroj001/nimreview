import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const reviewSchema = new mongoose.Schema(
  {
    venue: { type: ObjectId, ref: 'Venue', required: true, index: true },
    author: { type: ObjectId, ref: 'User', required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    aspects: { food: Number, service: Number, ambience: Number, value: Number },
    text: { type: String, required: true, maxlength: 4000 },
    method: { type: String, enum: ['payment', 'receipt', 'checkin', 'none'], default: 'none' },
    status: { type: String, enum: ['verified', 'unverified'], required: true },
    score: { type: Number, default: 0 },
    proofRef: { type: String, default: null },
    helpfulBy: { type: [ObjectId], default: [] },
    photos: { type: [String], default: [] },
    photoHashes: { type: [String], default: [] },
    ownerReply: { text: String, at: Date },
    flags: { type: [{ by: ObjectId, reason: String, at: Date }], default: [] },
  },
  { timestamps: true },
);

export const Review = mongoose.models.Review || mongoose.model('Review', reviewSchema);
