// Local demo store (localStorage). In production every write below is a server call and the
// genuineness engine runs there; here it runs in the browser so the prototype works offline.
import { createSeed } from './data/seed.js';
import { evaluateReview, settleLedger, balances, weightedRating, makeReceiptCode, normalizeCode, haversineMeters } from './core/genuine.js';

const KEY = 'nimreview:v1';
const DAY = 864e5;
const listeners = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return s;
  } catch {}
  return createSeed(Date.now());
}

export let state = load();

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn());
}
export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function resetDemo() {
  state = createSeed(Date.now());
  save();
}

export const uid = (p) => p + Math.random().toString(36).slice(2, 9);
export const me = () => state.users.u_me;
export const owner = () => state.users.u_owner;
export const venue = (id) => state.venues.find((v) => v.id === id);
export const user = (id) => state.users[id];
export const venueReviews = (id) => state.reviews.filter((r) => r.venueId === id && r.status !== 'rejected').sort((a, b) => (a.status === 'verified' ? 0 : 1) - (b.status === 'verified' ? 0 : 1) || b.createdAt - a.createdAt);
export const rating = (id) => weightedRating(state.reviews.filter((r) => r.venueId === id));
export const distanceKm = (v) => haversineMeters(state.here, v) / 1000;

export function wallet() {
  state.ledger = settleLedger(state.ledger, Date.now());
  return balances(state.ledger);
}

export function aspectAverages(id) {
  const keys = ['food', 'service', 'ambience', 'value'];
  const rs = state.reviews.filter((r) => r.venueId === id && r.status === 'verified' && r.aspects);
  return keys.map((k) => ({ key: k, avg: rs.length ? rs.reduce((s, r) => s + r.aspects[k], 0) / rs.length : 0 }));
}

function evalContext(venueId, now) {
  const venueRecent = state.reviews
    .filter((r) => r.venueId === venueId)
    .map((r) => ({ createdAt: r.createdAt, authorCreatedAt: state.users[r.authorId]?.createdAt ?? r.createdAt }));
  return {
    now,
    receipts: state.receipts,
    transactions: state.transactions,
    existingReviews: state.reviews.filter((r) => r.status !== 'rejected'),
    rewards: state.rewards,
    venueRecent,
  };
}

export function evaluateDraft(draft, now = Date.now()) {
  const v = venue(draft.venueId);
  return evaluateReview({
    review: { text: draft.text, rating: draft.rating, photoHashes: draft.photos.map((p) => p.hash), composition: draft.composition },
    account: me(),
    venue: v,
    proof: draft.proof,
    ctx: evalContext(v.id, now),
  });
}

export function submitReview(draft) {
  const now = Date.now();
  const result = evaluateDraft(draft, now);
  const v = venue(draft.venueId);
  const review = {
    id: uid('r_'),
    venueId: v.id,
    authorId: 'u_me',
    rating: draft.rating,
    aspects: draft.aspects,
    text: draft.text.trim(),
    method: result.status === 'verified' ? result.signals.proof.method : 'none',
    status: result.status,
    score: result.score,
    createdAt: now,
    helpful: 0,
    photos: draft.photos.map((p) => p.url),
    photoHashes: draft.photos.map((p) => p.hash),
    ownerReply: null,
  };
  if (result.status !== 'rejected') {
    state.reviews.push(review);
    me().reviewCount += 1;
    const p = result.signals.proof;
    if (p.ok && p.method === 'receipt') state.receipts.find((r) => normalizeCode(r.code) === normalizeCode(p.ref)).usedBy = review.id;
    if (p.ok && p.method === 'payment') state.transactions.find((t) => t.hash === p.ref).usedBy = review.id;
  }
  if (result.rewardable) {
    state.ledger.unshift({ id: uid('l_'), type: 'reward', reviewId: review.id, venueId: v.id, label: `Review · ${v.name}`, amount: result.reward.amount, status: 'pending', at: now, releaseAt: result.reward.releaseAt });
    state.rewards.push({ accountId: 'u_me', venueId: v.id, at: now });
  }
  save();
  return { review, result };
}

export function toggleHelpful(reviewId) {
  const r = state.reviews.find((x) => x.id === reviewId);
  const i = state.votes.indexOf(reviewId);
  if (i >= 0) {
    state.votes.splice(i, 1);
    r.helpful -= 1;
  } else {
    state.votes.push(reviewId);
    r.helpful += 1;
  }
  save();
}

export function flagReview(reviewId, reason, by) {
  state.flags.push({ reviewId, reason, by, at: Date.now() });
  save();
}

export function toggleSaved(venueId) {
  const i = state.saved.indexOf(venueId);
  i >= 0 ? state.saved.splice(i, 1) : state.saved.push(venueId);
  save();
}

export function issueReceipt(venueId, amount, label) {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const rec = { code: makeReceiptCode(bytes), venueId, amount: Number(amount), issuedAt: Date.now(), label: label || '' };
  state.receipts.unshift(rec);
  save();
  return rec;
}

export function replyToReview(reviewId, text) {
  const r = state.reviews.find((x) => x.id === reviewId);
  r.ownerReply = { text: text.trim(), at: Date.now() };
  save();
}

export function claimPerk(perkId) {
  const perk = state.perks.find((p) => p.id === perkId);
  if (wallet().claimable < perk.cost) return { ok: false, reason: 'Not enough claimable NIM' };
  const code = `${venue(perk.venueId).name.replace(/[^A-Z]/g, '').slice(0, 2) || 'NR'}-${makeReceiptCode(crypto.getRandomValues(new Uint8Array(10))).slice(0, 4)}`;
  state.ledger.unshift({ id: uid('l_'), type: 'coupon', label: `Perk · ${perk.title}, ${venue(perk.venueId).name}`, amount: perk.cost, status: 'done', at: Date.now() });
  const mine = { id: uid('mp_'), perkId, code, claimedAt: Date.now(), used: false };
  state.myPerks.unshift(mine);
  save();
  return { ok: true, mine };
}

export function cashOut(amount, address) {
  if (amount <= 0 || amount > wallet().claimable) return { ok: false, reason: 'Amount exceeds claimable balance' };
  state.ledger.unshift({ id: uid('l_'), type: 'cashout', label: `Cash out to ${address.slice(0, 9)}…`, amount, status: 'demo', at: Date.now() });
  save();
  return { ok: true };
}

export function setHere(here) {
  state.here = here;
  save();
}

export function recordCheckin(venueId, checkin) {
  state.checkins = state.checkins.filter((c) => c.venueId !== venueId);
  state.checkins.push({ venueId, ...checkin });
  save();
}

export const daysLeft = (t) => Math.max(0, Math.ceil((t - Date.now()) / DAY));
