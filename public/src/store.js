// App state. Demo sessions run on the fictional seed data in localStorage (no real NIM, nothing leaves the
// device). Live sessions load the same shape from the backend, and every write goes through the API, where the
// genuineness engine re-runs; the browser copy of the engine only previews the score.
import { createSeed, DEMO_CENTER } from './data/seed.js';
import { evaluateReview, settleLedger, balances, weightedRating, makeReceiptCode, normalizeCode, haversineMeters } from './core/genuine.js';
import { getSession, isLive, api, updateSession } from './session.js';

const KEY = 'nimreview:v1';
const DAY = 864e5;

const empty = () => ({
  version: 1, meId: null, here: { ...DEMO_CENTER, real: false },
  venues: [], users: {}, reviews: [], receipts: [], transactions: [], ledger: [], rewards: [],
  perks: [], myPerks: [], saved: [], votes: [], flags: [], checkins: [],
});

export let state = empty();

function loadDemo(role) {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(KEY));
  } catch {}
  if (!s || s.version !== 1) s = createSeed(Date.now());
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
  if (isLive()) localStorage.setItem(savedKey(), JSON.stringify(state.saved));
  else localStorage.setItem(KEY, JSON.stringify(state));
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
    state.ledger.unshift({ id: uid('l_'), type: 'reward', reviewId: review.id, venueId: v.id, label: `Review · ${v.name}`, amount: result.reward.amount, status: 'pending', at: now, releaseAt: result.reward.releaseAt });
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

// NIM a venue funds per rewarded review (scaled by the genuineness score)
export async function setReward(venueId, amount) {
  if (isLive()) {
    await api('/venues/mine', { method: 'PUT', body: { rewardPerReview: amount } });
    return pull();
  }
  venue(venueId).rewardPerReview = amount;
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

export async function connectWallet(address, label) {
  const out = await api('/me/wallet', { method: 'PUT', body: { address, label } });
  updateSession({ nimAddress: out.nimAddress });
  return pull();
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

export async function cashOut(amount, address) {
  if (amount <= 0 || amount > wallet().claimable) return { ok: false, reason: 'Amount exceeds claimable balance' };
  if (isLive()) {
    await api('/wallet/cashout', { method: 'POST', body: { amount } });
    await pull();
    return { ok: true };
  }
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
