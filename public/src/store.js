// App state. Demo sessions run on the fictional seed data in localStorage (no real NIM, nothing leaves the
// device). Live sessions load the same shape from the backend, and every write goes through the API, where the
// genuineness engine re-runs; the browser copy of the engine only previews the score.
import { createSeed, DEMO_CENTER } from './data/seed.js';
import { evaluateReview, settleLedger, balances, balancesByVenue, weightedRating, makeReceiptCode, normalizeCode, haversineMeters } from './core/genuine.js';
import { getSession, isLive, api, updateSession, DEMO_KEY } from './session.js';

const SEED_VERSION = 2;
const DAY = 864e5;

const empty = () => ({
  version: SEED_VERSION, meId: null, here: { ...DEMO_CENTER, real: false },
  venues: [], users: {}, reviews: [], receipts: [], transactions: [], ledger: [], rewards: [],
  perks: [], myPerks: [], saved: [], votes: [], flags: [], checkins: [],
});

export let state = empty();

// The demo data set lives in sessionStorage: it survives reloads and switching between the reviewer and owner
// demos, and is gone when the tab closes or you leave the demo.
function loadDemo(role) {
  let s = null;
  try {
    s = JSON.parse(sessionStorage.getItem(DEMO_KEY));
  } catch {}
  if (!s || s.version !== SEED_VERSION) s = createSeed(Date.now());
  s.meId = role === 'venue' ? 'u_owner' : 'u_me';
  return s;
}

const savedKey = () => `nimreview:saved:${state.meId}`;
function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(savedKey())) || [];
  } catch {
    return [];
  }
}

export async function initStore() {
  const s = getSession();
  if (!s) state = empty();
  else if (s.mode === 'demo') state = loadDemo(s.role);
  else await pull();
}

// reload everything the signed-in live user can see
export async function pull() {
  const here = state.here;
  const data = await api('/bootstrap');
  state = { ...empty(), ...data, here };
  state.saved = loadSaved();
  const meU = state.users[state.meId];
  updateSession({ name: meU.name, nimAddress: meU.nimAddress, hasVenue: !!meU.ownsVenueIds?.length });
}

export function save() {
  try {
    if (isLive()) localStorage.setItem(savedKey(), JSON.stringify(state.saved));
    else sessionStorage.setItem(DEMO_KEY, JSON.stringify(state));
  } catch {}
}

export function resetDemo() {
  const meId = state.meId;
  state = createSeed(Date.now());
  state.meId = meId;
  save();
}

export const uid = (p) => p + Math.random().toString(36).slice(2, 9);
export const me = () => state.users[state.meId];
export const owner = me;
export const venue = (id) => state.venues.find((v) => v.id === id);
export const user = (id) => state.users[id] || { id, name: 'Guest', createdAt: Date.now(), reviewCount: 0, helpfulVotes: 0 };
export const venueReviews = (id) => state.reviews.filter((r) => r.venueId === id && r.status !== 'rejected').sort((a, b) => (a.status === 'verified' ? 0 : 1) - (b.status === 'verified' ? 0 : 1) || b.createdAt - a.createdAt);
export const rating = (id) => weightedRating(state.reviews.filter((r) => r.venueId === id));
export const distanceKm = (v) => haversineMeters(state.here, v) / 1000;
export const myVenue = () => venue(me()?.ownsVenueIds?.[0]);

export function wallet() {
  state.ledger = settleLedger(state.ledger, Date.now());
  return balances(state.ledger);
}

export function aspectAverages(id) {
  const keys = ['food', 'service', 'ambience', 'value'];
  const rs = state.reviews.filter((r) => r.venueId === id && r.status === 'verified' && r.aspects);
  return keys.map((k) => ({ key: k, avg: rs.length ? rs.reduce((s, r) => s + r.aspects[k], 0) / rs.length : 0 }));
}

function evalContext(venueId, now, receiptPreview) {
  const venueRecent = state.reviews
    .filter((r) => r.venueId === venueId)
    .map((r) => ({ createdAt: r.createdAt, authorCreatedAt: state.users[r.authorId]?.createdAt ?? r.createdAt }));
  return {
    now,
    // live customers never see the venue's codes; the server sends back only the one they typed
    receipts: isLive() ? (receiptPreview ? [receiptPreview] : []) : state.receipts,
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
    ctx: evalContext(v.id, now, draft.receiptPreview),
  });
}

export const checkProofLive = (venueId, proof) => api('/reviews/check-proof', { method: 'POST', body: { venueId, proof } });

export async function submitReview(draft) {
  if (isLive()) {
    const out = await api('/reviews', {
      method: 'POST',
      body: { venueId: draft.venueId, rating: draft.rating, aspects: draft.aspects, text: draft.text, photos: draft.photos, composition: draft.composition, proof: draft.proof },
    });
    await pull();
    return out;
  }
  const now = Date.now();
  const result = evaluateDraft(draft, now);
  const v = venue(draft.venueId);
  const review = {
    id: uid('r_'),
    venueId: v.id,
    authorId: state.meId,
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
    const amount = result.reward.amount;
    const instant = result.reward.releaseAt <= now;
    state.ledger.unshift({ id: uid('l_'), type: 'reward', reviewId: review.id, venueId: v.id, label: `Review · ${v.name}`, amount, status: instant ? 'claimable' : 'pending', at: now, releaseAt: result.reward.releaseAt });
    state.rewards.push({ accountId: state.meId, venueId: v.id, at: now });
  }
  save();
  return { review, result };
}

export async function toggleHelpful(reviewId) {
  if (isLive()) {
    await api(`/reviews/${reviewId}/helpful`, { method: 'POST' });
    return pull();
  }
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

export async function flagReview(reviewId, reason) {
  if (isLive()) {
    await api(`/reviews/${reviewId}/flag`, { method: 'POST', body: { reason } });
    return pull();
  }
  state.flags.push({ reviewId, reason, by: state.meId, at: Date.now() });
  save();
}

export function toggleSaved(venueId) {
  const i = state.saved.indexOf(venueId);
  i >= 0 ? state.saved.splice(i, 1) : state.saved.push(venueId);
  save();
}

export async function issueReceipt(venueId, amount, label) {
  if (isLive()) {
    const { bill } = await api('/bills', { method: 'POST', body: { amount, label } });
    await pull();
    return bill;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const rec = { code: makeReceiptCode(bytes), venueId, amount: Number(amount), issuedAt: Date.now(), label: label || '' };
  state.receipts.unshift(rec);
  save();
  return rec;
}

export async function replyToReview(reviewId, text) {
  if (isLive()) {
    await api(`/reviews/${reviewId}/reply`, { method: 'POST', body: { text } });
    return pull();
  }
  const r = state.reviews.find((x) => x.id === reviewId);
  r.ownerReply = { text: text.trim(), at: Date.now() };
  save();
}

// What a venue pays and when: NIM per perfect review, and the days a guest waits before cashing out (0 = instant).
export async function saveRewardSettings(venueId, { rewardPerReview, payoutCooldownDays }) {
  if (isLive()) {
    await api('/venues/mine', { method: 'PUT', body: { rewardPerReview, payoutCooldownDays } });
    return pull();
  }
  Object.assign(venue(venueId), { rewardPerReview, payoutCooldownDays });
  save();
}

// What one venue owes its guests: still unlocking, ready to be asked for, asked for and waiting for the venue to
// pay, and paid so far. (Live: built from the venue's own ledger; demo: from the demo ledger.)
export function venueOwed(venueId) {
  const entries = state.ledger.filter((e) => e.venueId === venueId);
  const sum = (f) => Math.round(entries.filter(f).reduce((t, e) => t + e.amount, 0) * 10) / 10;
  const b = balancesByVenue(entries)[venueId] || { claimable: 0, pending: 0, earned: 0 };
  return {
    unlocking: b.pending,
    available: b.claimable,
    waiting: sum((e) => e.type === 'cashout' && e.status === 'requested'),
    paid: sum((e) => e.type === 'cashout' && e.status === 'paid'),
    requests: entries.filter((e) => e.type === 'cashout').sort((a, c) => c.at - a.at),
  };
}

// The venue pays a guest's request. Live: Nimiq Pay sends the NIM first, then the server checks the transaction on
// the chain before marking it paid. Demo: marks it paid with a made-up hash (no NIM exists).
export async function markPayoutPaid(id, txHash) {
  if (isLive()) {
    await api(`/payouts/${id}/paid`, { method: 'POST', body: { txHash } });
    return pull();
  }
  const e = state.ledger.find((x) => x.id === id);
  Object.assign(e, { status: 'paid', paidAt: Date.now(), txHash: txHash || [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('') });
  save();
}

export async function rejectPayout(id, note) {
  if (isLive()) {
    await api(`/payouts/${id}/reject`, { method: 'POST', body: { note } });
    return pull();
  }
  Object.assign(state.ledger.find((x) => x.id === id), { status: 'rejected', note });
  save();
}

// demo venue accounts can try the dashboard as a restaurant, café or hotel
export function switchDemoVenue(venueId) {
  const o = me();
  for (const v of state.venues) if (v.ownerId === o.id) delete v.ownerId;
  venue(venueId).ownerId = o.id;
  o.ownsVenueIds = [venueId];
  save();
}

export async function saveListing(fields, isNew) {
  await api(isNew ? '/venues' : '/venues/mine', { method: isNew ? 'POST' : 'PUT', body: fields });
  return pull();
}

// Perks are spent from the NIM earned at the venue that offers them.
export const walletByVenue = () => balancesByVenue(state.ledger);

export function claimPerk(perkId) {
  const perk = state.perks.find((p) => p.id === perkId);
  if ((walletByVenue()[perk.venueId]?.claimable ?? 0) < perk.cost) return { ok: false, reason: `Not enough NIM earned at ${venue(perk.venueId).name}` };
  const code = `${venue(perk.venueId).name.replace(/[^A-Z]/g, '').slice(0, 2) || 'NR'}-${makeReceiptCode(crypto.getRandomValues(new Uint8Array(10))).slice(0, 4)}`;
  state.ledger.unshift({ id: uid('l_'), type: 'coupon', venueId: perk.venueId, label: `Perk · ${perk.title}, ${venue(perk.venueId).name}`, amount: perk.cost, status: 'done', at: Date.now() });
  const mine = { id: uid('mp_'), perkId, code, claimedAt: Date.now(), used: false };
  state.myPerks.unshift(mine);
  save();
  return { ok: true, mine };
}

// Ask one venue to pay out what it owes you. The venue sends the NIM from its own wallet (see markPayoutPaid).
export async function cashOut(venueId, amount) {
  const owed = walletByVenue()[venueId]?.claimable ?? 0;
  if (!(amount > 0) || amount > owed) return { ok: false, reason: `${venue(venueId)?.name ?? 'That place'} owes you ${owed} NIM that can be cashed out now` };
  if (isLive()) {
    await api('/wallet/cashout', { method: 'POST', body: { venueId, amount } });
    await pull();
    return { ok: true };
  }
  state.ledger.unshift({ id: uid('l_'), type: 'cashout', venueId, label: `Cash out · ${venue(venueId).name}`, amount, status: 'requested', at: Date.now(), toAddress: me().nimAddress, guestName: me().name, guestAddress: me().nimAddress });
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
