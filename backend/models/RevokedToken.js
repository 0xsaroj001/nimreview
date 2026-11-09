import mongoose from 'mongoose';

// Tokens signed out before they expired. Each live token carries a random id (jti); MongoDB deletes the record
// once the token would have expired anyway, so the collection only ever holds still-valid signed-out tokens.
const revokedSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expireAt: { type: Date, required: true, expires: 0 },
});

export const RevokedToken = mongoose.models.RevokedToken || mongoose.model('RevokedToken', revokedSchema);
