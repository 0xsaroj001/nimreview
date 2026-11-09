// A venue pays its guests. The guest asks (wallet.controller cashOut); the venue sends the NIM from its own
// wallet (in Nimiq Pay) and tells us the transaction hash; we mark the request paid ONLY after finding that exact
// payment on the Nimiq chain (sender = the venue wallet, recipient = the guest, amount at least what was asked).
// A venue that does not want to pay can reject the request, which refunds the guest's balance.
import mongoose from 'mongoose';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Venue } from '../models/Venue.js';
import { HttpError } from '../middleware/error.js';
import { getTransaction, checkPayment } from '../utils/chain.js';
import { ledgerJson } from '../views/serialize.js';

// a payment cannot predate the request it settles; allow a little for clock differences between us and the chain
const CLOCK_SKEW_MS = 2 * 60_000;

async function mineRequest(req) {
  const venue = await Venue.findOne({ owner: req.user._id });
  if (!venue) throw new HttpError(404, 'List your venue first');
  const entry = mongoose.isValidObjectId(req.params.id) ? await LedgerEntry.findOne({ _id: req.params.id, type: 'cashout', venue: venue._id }) : null;
  if (!entry) throw new HttpError(404, 'Payout request not found');
  if (entry.status !== 'requested') throw new HttpError(409, entry.status === 'paid' ? 'This payout was already paid' : 'This payout was rejected');
  return { venue, entry };
}

export async function markPaid(req, res) {
  const { venue, entry } = await mineRequest(req);
  const txHash = String(req.body.txHash ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txHash)) throw new HttpError(400, 'A transaction hash has 64 hex characters');
  const check = checkPayment(await getTransaction(txHash), { from: venue.nimAddress, to: entry.toAddress, amountNim: entry.amount, notBefore: entry.at.getTime() - CLOCK_SKEW_MS });
  if (!check.ok) throw new HttpError(check.retry ? 409 : 422, check.reason);
  let done;
  try {
    // only one request can flip requested -> paid, and one transaction can settle one payout
    done = await LedgerEntry.findOneAndUpdate({ _id: entry._id, status: 'requested' }, { status: 'paid', txHash, paidAt: new Date() }, { returnDocument: 'after' });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'That transaction already settled another payout');
    throw err;
  }
  if (!done) throw new HttpError(409, 'This payout was already handled');
  res.json({ entry: ledgerJson(done) });
}

export async function reject(req, res) {
  const { entry } = await mineRequest(req);
  const note = String(req.body.note ?? '').trim().slice(0, 120);
  const done = await LedgerEntry.findOneAndUpdate({ _id: entry._id, status: 'requested' }, { status: 'rejected', note }, { returnDocument: 'after' });
  if (!done) throw new HttpError(409, 'This payout was already handled');
  res.json({ entry: ledgerJson(done) });
}
