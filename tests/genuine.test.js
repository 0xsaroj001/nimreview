import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  POLICY, evaluateReview, similarity, verifyReceipt, verifyPayment, verifyCheckin, analyzeContent,
  analyzeComposition, accountTrust, venueBurst, settleLedger, balances, weightedRating, makeReceiptCode,
  normalizeCode, hamming,
} from '../src/core/genuine.js';
import { isValidAddress, makeAddress } from '../src/core/nimiq.js';

const DAY = 864e5;
const now = Date.UTC(2026, 10, 5, 12);
const venueAddr = makeAddress('5D3A0V4E9LCX7H1MBQRTUFYK2PNS8G6J');
const userAddr = makeAddress('M8K2X4QHV7C0D3NB9RPLT5YEUJ1F6GSA');
const venue = { id: 'lumen', lat: 12.9719, lng: 77.6412, nimAddress: venueAddr, menu: ['truffle risotto', 'burrata', 'tiramisu'] };
const account = { id: 'u1', createdAt: now - 80 * DAY, reviewCount: 6, helpfulVotes: 14, upheldFlags: 0, nimAddress: userAddr, ownsVenueIds: [] };
const freshAccount = { ...account, id: 'u2', createdAt: now - 1 * DAY, reviewCount: 0, helpfulVotes: 0 };
const goodText =
  'Had the truffle risotto and burrata on a Friday night. Risotto was creamy and properly seasoned, burrata a bit cold. ' +
  'Staff were attentive even though it was crowded; we waited 20 min for mains. Bill was fair for the portion size.';
const typed = { composeMs: 160_000, typedChars: goodText.length, pastedChars: 0 };
const receipts = [
  { code: 'K7Q2M-9XH4T', venueId: 'lumen', amount: 1240, issuedAt: now - 3 * 3600e3 },
  { code: 'AB12C-DE34F', venueId: 'lumen', amount: 90, issuedAt: now - 3600e3 },
  { code: 'ZZ99Z-ZZ99Z', venueId: 'lumen', amount: 900, issuedAt: now - 4 * DAY },
  { code: 'USED0-00001', venueId: 'lumen', amount: 900, issuedAt: now - 3600e3, usedBy: 'r9' },
];
const hash = 'a'.repeat(64);
const transactions = [{ hash, sender: userAddr, recipient: venueAddr, valueNim: 320, timestamp: now - DAY }];
const ctx = (extra = {}) => ({ now, receipts, transactions, existingReviews: [], rewards: [], venueRecent: [], ...extra });
const evalWith = (over = {}) =>
  evaluateReview({
    review: { text: goodText, rating: 4, composition: typed, photoHashes: [], ...over.review },
    account: over.account || account,
    venue,
    proof: over.proof || { method: 'receipt', code: 'k7q2m 9xh4t' },
    ctx: ctx(over.ctx),
  });

test('a specific, typed review with a valid receipt is verified and earns', () => {
  const r = evalWith();
  assert.equal(r.status, 'verified');
  assert.equal(r.rewardable, true, r.blockers.join('; '));
  assert.ok(r.score >= POLICY.minRewardScore);
  assert.ok(r.reward.amount > 0 && r.reward.amount <= POLICY.baseReward);
});

test('the star rating never changes the score or the reward', () => {
  const one = evalWith({ review: { rating: 1 } });
  const five = evalWith({ review: { rating: 5 } });
  assert.equal(one.score, five.score);
  assert.equal(one.reward.amount, five.reward.amount);
});

test('no proof: published as unverified, earns nothing', () => {
  const r = evalWith({ proof: { method: 'none' } });
  assert.equal(r.status, 'unverified');
  assert.equal(r.rewardable, false);
  assert.equal(r.reward.amount, 0);
});

test('copied text is rejected, even lightly edited and padded', () => {
  const copy = 'Honestly ' + goodText.replace('Friday', 'Saturday').replace('20 min', '25 min') + ' Would go again.';
  assert.ok(similarity(goodText, copy) >= POLICY.duplicateThreshold);
  const r = evalWith({ review: { text: copy, composition: { ...typed, typedChars: copy.length } }, ctx: { existingReviews: [{ id: 'r1', text: goodText }] } });
  assert.equal(r.status, 'rejected');
  assert.equal(r.rewardable, false);
});

test('different reviews of the same dish are not flagged as copies', () => {
  const other = 'The tiramisu was too sweet for me and the coffee arrived lukewarm. Seating near the door is noisy, ask for the back room.';
  assert.ok(similarity(goodText, other) < POLICY.duplicateThreshold);
});

test('a reused photo is rejected', () => {
  const r = evalWith({ review: { photoHashes: ['ffff0000ffff0001'] }, ctx: { existingReviews: [{ id: 'r1', text: 'x', photoHashes: ['ffff0000ffff0000'] }] } });
  assert.equal(hamming('ffff0000ffff0001', 'ffff0000ffff0000'), 1);
  assert.equal(r.status, 'rejected');
});

test('generic one-liner with a receipt is verified but earns nothing', () => {
  const text = 'Very good food, nice place. Highly recommend!';
  const r = evalWith({ review: { text, composition: { composeMs: 20_000, typedChars: text.length, pastedChars: 0 } } });
  assert.equal(r.status, 'verified');
  assert.equal(r.rewardable, false);
});

test('receipt rules: single use, venue-bound, expiring, minimum bill', () => {
  const o = { venueId: 'lumen', now };
  assert.equal(verifyReceipt('K7Q2M-9XH4T', receipts, o).ok, true);
  assert.equal(verifyReceipt('USED0-00001', receipts, o).ok, false);
  assert.equal(verifyReceipt('K7Q2M-9XH4T', receipts, { ...o, venueId: 'brew' }).ok, false);
  assert.equal(verifyReceipt('ZZ99Z-ZZ99Z', receipts, o).ok, false);
  const small = verifyReceipt('AB12C-DE34F', receipts, o);
  assert.equal(small.ok, true);
  assert.equal(small.rewardable, false);
  assert.equal(verifyReceipt('NOPE', receipts, o).ok, false);
});

test('receipt codes are 10 Crockford chars and tolerate O/0 and I/1 typos', () => {
  const code = makeReceiptCode(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.match(code, /^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  assert.equal(normalizeCode('o1il0-xxxxx'), '01110XXXXX');
});

test('payment proof must go from the reviewer to this venue, recently', () => {
  const o = { venue, reviewerAddress: userAddr, now };
  assert.equal(verifyPayment(hash, transactions, o).ok, true);
  assert.equal(verifyPayment(hash, transactions, { ...o, reviewerAddress: venueAddr }).ok, false);
  assert.equal(verifyPayment(hash, transactions, { ...o, venue: { ...venue, nimAddress: userAddr } }).ok, false);
  assert.equal(verifyPayment(hash, transactions, { ...o, now: now + 30 * DAY }).ok, false);
  assert.equal(verifyPayment('b'.repeat(64), transactions, o).ok, false);
});

test('check-in needs to be inside the geofence, precise and long enough', () => {
  const base = { lat: venue.lat + 0.0003, lng: venue.lng, accuracy: 20, arrivedAt: now - 3 * 3600e3, leftAt: now - 2 * 3600e3 };
  assert.equal(verifyCheckin(base, venue, { now }).ok, true);
  assert.equal(verifyCheckin({ ...base, lat: venue.lat + 0.01 }, venue, { now }).ok, false);
  assert.equal(verifyCheckin({ ...base, accuracy: 500 }, venue, { now }).ok, false);
  assert.equal(verifyCheckin({ ...base, leftAt: base.arrivedAt + 5 * 60e3 }, venue, { now }).ok, false);
});

test('check-in alone does not pay a brand-new account', () => {
  const checkin = { lat: venue.lat, lng: venue.lng, accuracy: 15, arrivedAt: now - 2 * 3600e3, leftAt: now - 3600e3 };
  const r = evalWith({ account: freshAccount, proof: { method: 'checkin', checkin } });
  assert.equal(r.status, 'verified');
  assert.equal(r.rewardable, false);
  const seasoned = evalWith({ proof: { method: 'checkin', checkin } });
  assert.equal(seasoned.rewardable, true, seasoned.blockers.join('; '));
});

test('owners cannot review their own venue', () => {
  const r = evalWith({ account: { ...account, ownsVenueIds: ['lumen'] } });
  assert.equal(r.status, 'rejected');
});

test('limits: one rewarded review per venue per 30 days, 3 per day', () => {
  const here = evalWith({ ctx: { rewards: [{ accountId: 'u1', venueId: 'lumen', at: now - 10 * DAY }] } });
  assert.equal(here.rewardable, false);
  const daily = evalWith({ ctx: { rewards: [1, 2, 3].map((i) => ({ accountId: 'u1', venueId: 'v' + i, at: now - i * 3600e3 })) } });
  assert.equal(daily.rewardable, false);
  assert.equal(daily.status, 'verified');
});

test('a burst of reviews from new accounts pauses rewards at the venue', () => {
  const recent = Array.from({ length: 6 }, (_, i) => ({ createdAt: now - i * 3600e3, authorCreatedAt: now - (i + 1) * 3600e3 - DAY }));
  assert.equal(venueBurst(recent, now).frozen, true);
  assert.equal(evalWith({ ctx: { venueRecent: recent } }).rewardable, false);
  const organic = recent.map((r) => ({ ...r, authorCreatedAt: r.createdAt - 200 * DAY }));
  assert.equal(venueBurst(organic, now).frozen, false);
});

test('pasted or impossibly fast text loses the composition points', () => {
  assert.equal(analyzeComposition({ composeMs: 120_000, typedChars: 10, pastedChars: 300 }, 310).points, 0);
  assert.ok(analyzeComposition({ composeMs: 2_000, typedChars: 300, pastedChars: 0 }, 300).points <= 2);
  assert.equal(analyzeComposition({ composeMs: 120_000, typedChars: 300, pastedChars: 0 }, 300).points, 10);
});

test('spam signals are caught', () => {
  const c = analyzeContent('BEST BIRYANI IN TOWN!!!!!!! call 9876543210 or visit www.cheapfood.com');
  assert.ok(c.spamCount >= 2);
  const r = evalWith({ review: { text: 'BEST BIRYANI IN TOWN!!!!!!! call 9876543210 or visit www.cheapfood.com' } });
  assert.equal(r.status, 'rejected');
});

test('account trust tiers', () => {
  assert.equal(accountTrust(freshAccount, now).tier, 'new');
  assert.notEqual(accountTrust(account, now).tier, 'new');
  assert.equal(accountTrust({ ...account, upheldFlags: 5 }, now).points, 0);
});

test('vesting: pending becomes claimable after release, voided if flagged', () => {
  const entries = [
    { id: 'a', type: 'reward', reviewId: 'r1', amount: 20, status: 'pending', releaseAt: now - 1 },
    { id: 'b', type: 'reward', reviewId: 'r2', amount: 15, status: 'pending', releaseAt: now + DAY },
    { id: 'c', type: 'reward', reviewId: 'r3', amount: 10, status: 'pending', releaseAt: now - 1 },
    { id: 'd', type: 'coupon', amount: 5, status: 'done' },
  ];
  const settled = settleLedger(entries, now, new Set(['r3']));
  assert.deepEqual(settled.map((e) => e.status), ['claimable', 'pending', 'voided', 'done']);
  assert.deepEqual(balances(settled), { claimable: 15, pending: 15, earned: 35 });
});

test('unverified reviews count at a quarter weight, rejected not at all', () => {
  const r = weightedRating([
    { rating: 5, status: 'verified' },
    { rating: 1, status: 'unverified' },
    { rating: 1, status: 'rejected' },
  ]);
  assert.equal(r.avg, 4.2);
  assert.equal(r.verified, 1);
  assert.equal(r.unverified, 1);
});

test('nimiq addresses: burn address checksum and generated addresses validate', () => {
  assert.equal(isValidAddress('NQ07 0000 0000 0000 0000 0000 0000 0000 0000'), true);
  assert.equal(isValidAddress('NQ08 0000 0000 0000 0000 0000 0000 0000 0000'), false);
  assert.equal(isValidAddress(venueAddr), true);
  assert.equal(isValidAddress(venueAddr.replace(/.$/, (c) => (c === '0' ? '1' : '0'))), false);
  assert.equal(isValidAddress('NQ07 0000'), false);
});
