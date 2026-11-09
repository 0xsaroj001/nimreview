import { Venue } from '../models/Venue.js';
import { Review } from '../models/Review.js';
import { User } from '../models/User.js';
import { BillCode } from '../models/BillCode.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { settle, settleVenue } from './wallet.controller.js';
import { venueJson, userJson, reviewJson, billJson, ledgerJson, payoutJson } from '../views/serialize.js';

// Everything one signed-in user's screens need, in the same shape as the demo data set.
// Customers get their wallet; venue accounts get their bill codes and what they owe their guests (reward entries and
// cash-out requests, the latter with the guest's name and wallet so the venue knows whom to pay). Neither sees the
// other's private data.
export async function bootstrap(req, res) {
  const me = req.user;
  const meId = String(me._id);
  if (me.role === 'customer') await settle(me._id);

  const [venues, reviews] = await Promise.all([Venue.find().sort({ createdAt: -1 }), Review.find({}, { flags: 0 }).sort({ createdAt: -1 })]);
  const authorIds = [...new Set(reviews.map((r) => String(r.author)))].filter((x) => x !== meId);
  const authors = await User.find({ _id: { $in: authorIds } });
  const myVenue = venues.find((v) => String(v.owner) === meId);

  const users = Object.fromEntries(authors.map((u) => [String(u._id), userJson(u)]));
  users[meId] = userJson(me, { self: true, ownsVenueIds: myVenue ? [String(myVenue._id)] : [] });

  const myFlags = await Review.find({ 'flags.by': me._id }, { _id: 1 }).lean();
  const out = {
    meId,
    venues: venues.map(venueJson),
    users,
    reviews: reviews.map(reviewJson),
    votes: reviews.filter((r) => r.helpfulBy.some((x) => String(x) === meId)).map((r) => String(r._id)),
    flags: myFlags.map((r) => ({ reviewId: String(r._id), by: meId })),
    receipts: [],
    ledger: [],
    rewards: [],
  };

  if (me.role === 'venue' && myVenue) {
    out.receipts = (await BillCode.find({ venue: myVenue._id }).sort({ issuedAt: -1 }).limit(50)).map(billJson);
    await settleVenue(myVenue._id);
    const entries = await LedgerEntry.find({ venue: myVenue._id }).sort({ at: -1 }).limit(500);
    const guests = Object.fromEntries((await User.find({ _id: { $in: [...new Set(entries.filter((e) => e.type === 'cashout').map((e) => String(e.user)))] } })).map((u) => [String(u._id), u]));
    out.ledger = entries.map((e) => (e.type === 'cashout' ? payoutJson(e, guests[String(e.user)]) : ledgerJson(e)));
  }
  if (me.role === 'customer') {
    out.ledger = (await LedgerEntry.find({ user: me._id }).sort({ at: -1 })).map(ledgerJson);
    out.rewards = out.ledger.filter((e) => e.type === 'reward' && e.status !== 'voided').map((e) => ({ accountId: meId, venueId: e.venueId, at: e.at }));
  }
  res.json(out);
}
