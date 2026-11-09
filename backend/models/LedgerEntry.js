import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// A guest's money trail. 'reward' = NIM a venue owes the guest for a review (pending while the venue's cooldown
// runs, then claimable). 'cashout' = the guest asking that venue to pay it out; the venue pays from its own wallet
// and the server marks it 'paid' only after finding that transaction on the Nimiq chain (see payout.controller).
const ledgerSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['reward', 'cashout'], required: true },
  review: { type: ObjectId, ref: 'Review', default: null },
  venue: { type: ObjectId, ref: 'Venue', default: null, index: true },
  label: { type: String, default: '' },
  amount: { type: Number, required: true, min: 0 },
  // reward: pending | claimable | voided · cashout: requested | paid | rejected
  status: { type: String, enum: ['pending', 'claimable', 'voided', 'requested', 'paid', 'rejected'], required: true },
  toAddress: { type: String, default: null },
  txHash: { type: String, default: null },
  note: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  releaseAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
});
// one transaction can settle one payout, ever
ledgerSchema.index({ txHash: 1 }, { unique: true, partialFilterExpression: { txHash: { $type: 'string' } } });

export const LedgerEntry = mongoose.models.LedgerEntry || mongoose.model('LedgerEntry', ledgerSchema);
