import mongoose from 'mongoose';

// An account IS a Nimiq wallet: the address is the identity and there is no password or email. Losing the wallet
// means losing the account (by design). Accounts made before wallet sign-in may still carry email/password fields
// in the database; nothing reads them any more.
const userSchema = new mongoose.Schema(
  {
    nimAddress: { type: String, required: true },
    // true only when the wallet signed a challenge at sign-up. Accounts from before wallet sign-in stored an address
    // that was merely pasted (never proven), so they are never matched to a wallet and never block a real one.
    walletProven: { type: Boolean, default: false },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    role: { type: String, enum: ['customer', 'venue'], required: true },
    reviewCount: { type: Number, default: 0 },
    helpfulVotes: { type: Number, default: 0 },
    upheldFlags: { type: Number, default: 0 },
    // short lease that serialises payout requests per user (see wallet.controller cashOut)
    payoutLockUntil: { type: Date, default: null },
    payoutLockId: { type: String, default: null },
  },
  { timestamps: true },
);
// one proven wallet, one account; older accounts with unproven addresses are outside the index
userSchema.index({ nimAddress: 1 }, { unique: true, partialFilterExpression: { walletProven: true } });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
