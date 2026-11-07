import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    role: { type: String, enum: ['customer', 'venue'], required: true },
    nimAddress: { type: String, default: null },
    walletLabel: { type: String, default: '' },
    reviewCount: { type: Number, default: 0 },
    helpfulVotes: { type: Number, default: 0 },
    upheldFlags: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const User = mongoose.models.User || mongoose.model('User', userSchema);
