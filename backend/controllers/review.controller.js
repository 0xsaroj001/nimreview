import mongoose from 'mongoose';
import { Review } from '../models/Review.js';
import { Venue } from '../models/Venue.js';
import { BillCode } from '../models/BillCode.js';
import { User } from '../models/User.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { evaluateReview, verifyReceipt, normalizeCode } from '../../public/src/core/genuine.js';
import { HttpError } from '../middleware/error.js';
import { venueJson, reviewJson, billJson } from '../views/serialize.js';

const MAX_PHOTO_CHARS = 400_000; // a downscaled 720 px JPEG as a data URL
const ms = (d) => new Date(d).getTime();

async function findVenue(id) {
  const v = mongoose.isValidObjectId(id) ? await Venue.findById(id) : null;
  if (!v) throw new HttpError(404, 'Venue not found');
  return v;
}

async function findReview(id) {
  const r = mongoose.isValidObjectId(id) ? await Review.findById(id) : null;
  if (!r) throw new HttpError(404, 'Review not found');
  return r;
}

// Live accounts prove a visit with a venue bill code, or post without proof. Payment lookups need a Nimiq RPC
// integration (G3) and GPS dwell cannot be trusted from the client (G7), so both are refused here.
function cleanProof(proof) {
  const method = proof?.method || 'none';
  if (method === 'none') return { method: 'none' };
  if (method === 'receipt') return { method: 'receipt', code: String(proof.code ?? '').slice(0, 20) };
  throw new HttpError(400, 'Live accounts prove a visit with the bill code for now');
}

async function receiptsFor(proof) {
  if (proof.method !== 'receipt') return [];
  const bill = await BillCode.findOne({ key: normalizeCode(proof.code) });
  return bill ? [{ ...billJson(bill), _id: bill._id }] : [];
}

export async function checkProof(req, res) {
  const venue = await findVenue(req.body.venueId);
  const proof = cleanProof(req.body.proof);
  if (proof.method !== 'receipt') return res.json({ result: { ok: true, method: 'none', detail: 'No proof of visit' } });
  const receipts = await receiptsFor(proof);
  const result = verifyReceipt(proof.code, receipts, { venueId: String(venue._id), now: Date.now() });
  const r = receipts[0];
  // the preview lets the browser show a live score; the server re-checks everything on submit
  res.json({ result, receipt: result.ok ? { code: r.code, venueId: r.venueId, amount: r.amount, issuedAt: r.issuedAt } : null });
}

export async function create(req, res) {
  const user = req.user;
  const venue = await findVenue(req.body.venueId);
  const rating = Number(req.body.rating);
  const text = String(req.body.text ?? '').trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Pick a star rating');
  if (!text || text.length > 4000) throw new HttpError(400, 'Write your review (up to 4000 characters)');
  const photos = (Array.isArray(req.body.photos) ? req.body.photos : []).slice(0, 3);
  for (const p of photos) {
    // whole-string match: only base64 characters, because the URL is rendered inside CSS url('…')
    if (typeof p?.url !== 'string' || p.url.length > MAX_PHOTO_CHARS || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.url)) throw new HttpError(400, 'Photos must be images under 300 KB');
  }
  const aspects = {};
  for (const k of ['food', 'service', 'ambience', 'value']) aspects[k] = Math.max(0, Math.min(5, Math.round(Number(req.body.aspects?.[k]) || 0)));
  const c = req.body.composition || {};
  const composition = { composeMs: Number(c.composeMs) || 0, typedChars: Number(c.typedChars) || 0, pastedChars: Number(c.pastedChars) || 0 };
  const proof = cleanProof(req.body.proof);
  const photoHashes = photos.map((p) => String(p.hash || '')).filter((h) => /^[0-9a-f]{16}$/.test(h));
  const now = Date.now();

  const [receipts, existing, rewards, venueReviews, owned] = await Promise.all([
    receiptsFor(proof),
    Review.find({}, { text: 1, photoHashes: 1 }).lean(),
    LedgerEntry.find({ user: user._id, type: 'reward', status: { $ne: 'voided' } }).lean(),
    Review.find({ venue: venue._id }, { createdAt: 1, author: 1 }).populate('author', 'createdAt').lean(),
    Venue.find({ owner: user._id }, { _id: 1 }).lean(),
  ]);

  const result = evaluateReview({
    review: { text, rating, photoHashes, composition },
    account: { id: String(user._id), createdAt: ms(user.createdAt), reviewCount: user.reviewCount, helpfulVotes: user.helpfulVotes, upheldFlags: user.upheldFlags, nimAddress: user.nimAddress, ownsVenueIds: owned.map((v) => String(v._id)) },
    venue: venueJson(venue),
    proof,
    ctx: {
      now,
      receipts,
      transactions: [],
      existingReviews: existing.map((r) => ({ id: String(r._id), text: r.text, photoHashes: r.photoHashes })),
      rewards: rewards.map((e) => ({ accountId: String(user._id), venueId: String(e.venue), at: ms(e.at) })),
      venueRecent: venueReviews.map((r) => ({ createdAt: ms(r.createdAt), authorCreatedAt: ms(r.author?.createdAt ?? r.createdAt) })),
    },
  });

  const p = result.signals.proof;
  // a bad, expired or already-used bill code is refused outright instead of posting as unverified
  if (proof.method === 'receipt' && !p.ok) throw new HttpError(p.detail.includes('already used') ? 409 : 400, p.detail);

  // rejected reviews are not stored and do not use up the bill code
  if (result.status === 'rejected') return res.json({ review: { id: 'not-posted', venueId: String(venue._id), createdAt: now }, result });

  const reviewId = new mongoose.Types.ObjectId();
  let claimed = null;
  if (p.ok && p.method === 'receipt') {
    // the single-use guarantee: only one request can flip usedBy from null
    claimed = await BillCode.findOneAndUpdate({ _id: receipts[0]._id, usedBy: null }, { usedBy: reviewId, usedByUser: user._id, usedAt: new Date(now) }, { new: true });
    if (!claimed) throw new HttpError(409, 'This bill code was already used for a review');
  }

  let review;
  try {
    review = await Review.create({
      _id: reviewId,
      venue: venue._id,
      author: user._id,
      rating,
      aspects: Object.values(aspects).some(Boolean) ? aspects : undefined,
      text,
      method: result.status === 'verified' ? p.method : 'none',
      status: result.status,
      score: result.score,
      proofRef: p.ok ? p.ref : null,
      photos: photos.map((x) => x.url),
      photoHashes,
    });
  } catch (err) {
    if (claimed) await BillCode.updateOne({ _id: claimed._id, usedBy: reviewId }, { usedBy: null, usedByUser: null, usedAt: null });
    throw err;
  }

  await User.updateOne({ _id: user._id }, { $inc: { reviewCount: 1 } });
  if (result.rewardable) {
    await LedgerEntry.create({
      user: user._id, type: 'reward', review: reviewId, venue: venue._id, label: `Review · ${venue.name}`,
      amount: result.reward.amount, status: 'pending', at: new Date(now), releaseAt: new Date(result.reward.releaseAt),
    });
  }
  res.status(201).json({ review: reviewJson(review), result });
}

export async function toggleHelpful(req, res) {
  const r = await findReview(req.params.id);
  if (String(r.author) === String(req.user._id)) throw new HttpError(400, 'You cannot vote on your own review');
  const uid = req.user._id;
  const added = await Review.updateOne({ _id: r._id, helpfulBy: { $ne: uid } }, { $addToSet: { helpfulBy: uid } });
  if (added.modifiedCount) {
    await User.updateOne({ _id: r.author }, { $inc: { helpfulVotes: 1 } });
    return res.json({ voted: true });
  }
  await Review.updateOne({ _id: r._id }, { $pull: { helpfulBy: uid } });
  await User.updateOne({ _id: r.author, helpfulVotes: { $gt: 0 } }, { $inc: { helpfulVotes: -1 } });
  res.json({ voted: false });
}

export async function flag(req, res) {
  const r = await findReview(req.params.id);
  const reason = String(req.body.reason ?? '').trim().slice(0, 80);
  if (!reason) throw new HttpError(400, 'Pick a reason');
  await Review.updateOne({ _id: r._id, 'flags.by': { $ne: req.user._id } }, { $push: { flags: { by: req.user._id, reason, at: new Date() } } });
  res.json({ ok: true });
}

export async function reply(req, res) {
  const r = await findReview(req.params.id);
  const mine = await Venue.exists({ _id: r.venue, owner: req.user._id });
  if (!mine) throw new HttpError(403, 'You can only reply to reviews of your own venue');
  const text = String(req.body.text ?? '').trim();
  if (text.length < 5 || text.length > 500) throw new HttpError(400, 'Replies are 5 to 500 characters');
  r.ownerReply = { text, at: new Date() };
  await r.save();
  res.json({ review: reviewJson(r) });
}
