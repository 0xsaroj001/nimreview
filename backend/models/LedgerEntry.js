import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Rewards owed to a reviewer and payout requests. Nothing here moves NIM on-chain yet (see GAPS.md G4).
const ledgerSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['reward', 'cashout'], required: true },
  review: { type: ObjectId, ref: 'Review', default: null },
  venue: { type: ObjectId, ref: 'Venue', default: null },
  label: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'claimable', 'voided', 'requested'], required: true },
  toAddress: { type: String, default: null },
  at: { type: Date, default: Date.now },
  releaseAt: { type: Date, default: null },
});

export const LedgerEntry = mongoose.models.LedgerEntry || mongoose.model('LedgerEntry', ledgerSchema);
