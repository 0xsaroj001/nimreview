import mongoose from 'mongoose';

// A single-use code printed on a bill. `key` is the normalised code and is unique, so a code can never be issued
// twice; `usedBy` is set with a conditional update, so it can only ever be redeemed once.
const billCodeSchema = new mongoose.Schema({
  code: { type: String, required: true },
  key: { type: String, required: true, unique: true },
  venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  label: { type: String, trim: true, maxlength: 20, default: '' },
  issuedAt: { type: Date, default: Date.now },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Review', default: null },
  usedByUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  usedAt: { type: Date, default: null },
});

export const BillCode = mongoose.models.BillCode || mongoose.model('BillCode', billCodeSchema);
