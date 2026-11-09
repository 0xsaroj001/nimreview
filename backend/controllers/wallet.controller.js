import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Venue } from '../models/Venue.js';
import { User } from '../models/User.js';
import { balancesByVenue } from '../../public/src/core/genuine.js';
import { HttpError } from '../middleware/error.js';
import { ledgerJson } from '../views/serialize.js';

// Rewards whose cooldown has run out become claimable (and a 0-day cooldown means instant).
export async function settle(userId) {
  await LedgerEntry.updateMany({ user: userId, type: 'reward', status: 'pending', releaseAt: { $lte: new Date() } }, { status: 'claimable' });
}
export async function settleVenue(venueId) {
  await LedgerEntry.updateMany({ venue: venueId, type: 'reward', status: 'pending', releaseAt: { $lte: new Date() } }, { status: 'claimable' });
}

// A guest asks one venue to pay out what that venue owes them. The venue sends the NIM from its own wallet and the
// server confirms it on-chain (payout.controller). Nothing is paid by the server itself.
export async function cashOut(req, res) {
  const amount = Math.round(Number(req.body.amount) * 10) / 10;
  if (!(amount > 0)) throw new HttpError(400, 'Enter an amount');
  const venue = mongoose.isValidObjectId(req.body.venueId) ? await Venue.findById(req.body.venueId) : null;
  if (!venue) throw new HttpError(404, 'Pick the place that owes you this reward');
  // Balance check and insert must not interleave with another payout for the same user, or two requests could
  // each see the full balance. Take a 15 s lease (expires on its own if this instance dies), release it after.
  // The lease carries a random token so a slow request can only ever release its own lease, never a newer one.
  const now = new Date();
  const token = randomUUID();
  const lock = await User.findOneAndUpdate(
    { _id: req.user._id, $or: [{ payoutLockUntil: null }, { payoutLockUntil: { $lt: now } }] },
    { payoutLockUntil: new Date(now.getTime() + 15_000), payoutLockId: token },
  );
  if (!lock) throw new HttpError(409, 'Another payout request is in progress, try again in a moment');
  try {
    await settle(req.user._id);
    const entries = (await LedgerEntry.find({ user: req.user._id, venue: venue._id })).map(ledgerJson);
    const claimable = balancesByVenue(entries)[String(venue._id)]?.claimable ?? 0;
    if (amount > claimable) throw new HttpError(400, `${venue.name} owes you ${claimable} NIM that can be cashed out now`);
    const entry = await LedgerEntry.create({
      user: req.user._id,
      type: 'cashout',
      venue: venue._id,
      label: `Cash out · ${venue.name}`,
      amount,
      status: 'requested',
      toAddress: req.user.nimAddress,
    });
    res.status(201).json({ entry: ledgerJson(entry) });
  } finally {
    await User.updateOne({ _id: req.user._id, payoutLockId: token }, { payoutLockUntil: null, payoutLockId: null });
  }
}
