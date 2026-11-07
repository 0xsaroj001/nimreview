// Genuineness engine: decides whether a review is verified, how much it can earn and why.
// Pure functions only (no DOM, no storage, no clock): the same file runs in the browser demo and on a server.
// In production it MUST run on the server; anything computed in the browser can be forged.
//
// Design rules
// 1. Money needs proof of a real visit: a NIM payment to the venue, a single-use receipt code the venue issued
//    at billing, or (weakest) a GPS check-in with dwell time. Without proof a review is still published
//    (open system) but shown as unverified, weighted at 25 % and paid nothing.
// 2. The reward never reads the star rating. A 1-star and a 5-star review with the same evidence earn the same.
// 3. Copies are refused: near-duplicate text (any venue) or a reused photo blocks the review.
// 4. Rewards vest before they can be spent, so a later flag or a fraud pattern can void them.
// 5. Limits cap the farm: 3 rewarded reviews a day, one rewarded review per venue per 30 days, owners and staff
//    cannot review their own venue, and a venue's rewards pause during a burst of reviews from new accounts.

export const POLICY = Object.freeze({
  baseReward: 25, // NIM for a perfect score
  minRewardScore: 60,
  minContentPoints: 8,
  weights: Object.freeze({ proof: 40, content: 30, composition: 10, trust: 20 }),
  proofPoints: Object.freeze({ payment: 40, receipt: 34, checkin: 16, none: 0 }),
  receiptTtlHours: 72,
  paymentWindowDays: 7,
  checkinWindowHours: 48,
  minBill: 150, // local currency; smaller bills verify the visit but earn nothing
  minPaymentNim: 50,
  geofenceMeters: 120,
  maxGpsAccuracy: 80,
  minDwellMinutes: 20,
  maxRewardedPerDay: 3,
  venueCooldownDays: 30,
  duplicateThreshold: 0.5,
  photoHashMaxDistance: 6,
  minChars: 40,
  fullChars: 180,
  maxPasteRatio: 0.6,
  maxCharsPerSecond: 12,
  vestDays: Object.freeze({ new: 14, regular: 7, trusted: 3 }),
  burst: Object.freeze({ windowHours: 24, newAccountDays: 7, maxNewAccountReviews: 4 }),
  unverifiedWeight: 0.25,
});

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ---------- text ----------

export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(text) {
  const n = normalizeText(text);
  return n ? n.split(' ') : [];
}

export function shingles(text, k = 3) {
  const w = words(text);
  if (w.length < k) return new Set(w.length ? [w.join(' ')] : []);
  const out = new Set();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(' '));
  return out;
}

// Overlap coefficient on word 3-shingles: catches light edits and a copied review with text added around it.
export function similarity(a, b) {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  const small = Math.min(A.size, B.size);
  return small >= 5 ? inter / small : inter / (A.size + B.size - inter);
}

export const ASPECTS = Object.freeze({
  food: ['taste', 'tasted', 'flavour', 'flavor', 'spicy', 'fresh', 'crispy', 'portion', 'portions', 'cooked', 'dish', 'dishes', 'dessert', 'sweet', 'salty', 'bland', 'coffee', 'tea', 'starter', 'mains'],
  service: ['service', 'staff', 'waiter', 'waitress', 'server', 'friendly', 'rude', 'attentive', 'wait', 'waited', 'served', 'manager', 'barista', 'host'],
  ambience: ['ambience', 'ambiance', 'music', 'noise', 'noisy', 'quiet', 'crowded', 'seating', 'decor', 'view', 'lighting', 'vibe', 'cosy', 'cozy', 'outdoor'],
  value: ['price', 'prices', 'priced', 'expensive', 'cheap', 'value', 'bill', 'worth', 'overpriced', 'affordable'],
  hygiene: ['clean', 'dirty', 'hygiene', 'washroom', 'restroom', 'tidy', 'smell'],
  stay: ['room', 'bed', 'pool', 'breakfast', 'shower', 'wifi', 'housekeeping', 'reception', 'checkout', 'lobby', 'balcony'],
});

export const GENERIC_PHRASES = Object.freeze([
  'very good', 'nice place', 'good food', 'great food', 'best restaurant', 'highly recommend', 'highly recommended',
  'must visit', 'awesome', 'amazing experience', 'good service', 'nice ambience', 'loved it', 'great place',
  'value for money', 'five stars', '5 stars', 'best place', 'excellent service', 'superb',
]);

export function analyzeContent(text, { menu = [] } = {}) {
  const raw = String(text ?? '').trim();
  const norm = normalizeText(raw);
  const w = words(raw);
  const wset = new Set(w);
  const chars = raw.length;
  const flags = [];

  const lengthPts = chars < POLICY.minChars ? 0 : Math.min(10, (10 * (chars - POLICY.minChars)) / (POLICY.fullChars - POLICY.minChars));

  const menuHits = menu.filter((item) => norm.includes(normalizeText(item)));
  const aspectHits = Object.entries(ASPECTS)
    .filter(([, keys]) => keys.some((k) => wset.has(k)))
    .map(([name]) => name);
  const hasDetail = /\b\d+\s?(min|mins|minutes|hours?|am|pm|rs|inr|nim|people|of us)\b|[₹$€]\s?\d/i.test(raw);
  const specificity = Math.min(14, menuHits.length * 4 + aspectHits.length * 2 + (hasDetail ? 2 : 0));

  let originality = 6;
  const genericHits = GENERIC_PHRASES.filter((p) => norm.includes(p));
  if (genericHits.length) {
    originality -= w.length < 25 ? 4 : genericHits.length;
    flags.push('Generic phrases');
  }
  const diversity = w.length ? wset.size / w.length : 1;
  if (w.length >= 20 && diversity < 0.4) {
    originality -= 3;
    flags.push('Repetitive wording');
  }

  let spamCount = 0;
  const letters = raw.replace(/[^A-Za-z]/g, '');
  const spamTests = [
    [/https?:\/\/|www\.|\.(com|in|net|io)\b/i.test(raw), 'Contains a link'],
    [/(\+\d{1,3}[\s-]?)?\d{10}\b/.test(raw.replace(/[\s-]/g, '')), 'Contains a phone number'],
    [letters.length > 20 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.5, 'Mostly capitals'],
    [/(.)\1{4,}/.test(raw), 'Repeated characters'],
    [(raw.match(/!/g) || []).length > 5, 'Too many exclamation marks'],
  ];
  for (const [hit, label] of spamTests) {
    if (hit) {
      spamCount++;
      originality -= 3;
      flags.push(label);
    }
  }

  const points = round1(clamp(lengthPts + specificity + originality, 0, POLICY.weights.content));
  return { points, chars, words: w.length, menuHits, aspectHits, genericHits, hasDetail, flags, spamCount };
}

// Client-reported typing signals. Cheap to forge, so they carry 10 points at most and never block on their own.
export function analyzeComposition(composition, chars) {
  if (!composition) return { points: 0, pasteRatio: 0, cps: 0, flags: ['No typing data'] };
  const typed = composition.typedChars || 0;
  const pasted = composition.pastedChars || 0;
  const pasteRatio = typed + pasted ? pasted / (typed + pasted) : 0;
  const cps = chars / Math.max(1, (composition.composeMs || 0) / 1000);
  const flags = [];
  let points = POLICY.weights.composition;
  if (pasteRatio > POLICY.maxPasteRatio) {
    points = 0;
    flags.push('Mostly pasted text');
  } else {
    points -= pasteRatio * 8;
  }
  if (cps > POLICY.maxCharsPerSecond) {
    points = Math.min(points, 2);
    flags.push('Written faster than a person types');
  }
  return { points: round1(clamp(points, 0, POLICY.weights.composition)), pasteRatio, cps: round1(cps), flags };
}

// ---------- account ----------

export function accountTrust(account, now) {
  const ageDays = (now - account.createdAt) / DAY;
  const agePts = clamp((ageDays / 90) * 8, 0, 8);
  const reviews = account.reviewCount || 0;
  const historyPts = Math.min(reviews, 10) * 0.5;
  const helpfulPts = reviews ? Math.min(5, ((account.helpfulVotes || 0) / reviews) * 2.5) : 0;
  const penalty = (account.upheldFlags || 0) * 4;
  const points = round1(clamp(agePts + historyPts + helpfulPts - penalty, 0, POLICY.weights.trust));
  const tier = points >= 14 ? 'trusted' : points >= 6 ? 'regular' : 'new';
  return { points, tier, ageDays: Math.floor(ageDays) };
}

export function checkLimits(account, venueId, rewards, now) {
  const mine = rewards.filter((r) => r.accountId === account.id);
  const reasons = [];
  const today = mine.filter((r) => now - r.at < DAY).length;
  if (today >= POLICY.maxRewardedPerDay) reasons.push(`Daily limit reached (${POLICY.maxRewardedPerDay} rewarded reviews a day)`);
  const here = mine.filter((r) => r.venueId === venueId && now - r.at < POLICY.venueCooldownDays * DAY);
  if (here.length) reasons.push(`Already rewarded for this venue in the last ${POLICY.venueCooldownDays} days`);
  return { ok: reasons.length === 0, reasons };
}

// A venue whose reviews suddenly come from brand-new accounts is the signature of a bought campaign.
export function venueBurst(recent, now) {
  const { windowHours, newAccountDays, maxNewAccountReviews } = POLICY.burst;
  const count = recent.filter(
    (r) => now - r.createdAt < windowHours * HOUR && r.createdAt - r.authorCreatedAt < newAccountDays * DAY,
  ).length;
  return { frozen: count > maxNewAccountReviews, count };
}

// ---------- proof of visit ----------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function makeReceiptCode(bytes) {
  let s = '';
  for (let i = 0; i < 10; i++) s += CROCKFORD[bytes[i] & 31];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export function normalizeCode(code) {
  return String(code ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

const fail = (method, detail) => ({ ok: false, method, points: 0, rewardable: false, detail });

export function verifyReceipt(code, receipts, { venueId, now }) {
  const key = normalizeCode(code);
  if (key.length !== 10) return fail('receipt', 'A receipt code has 10 characters');
  const r = receipts.find((x) => normalizeCode(x.code) === key);
  if (!r) return fail('receipt', 'No receipt with this code');
  if (r.venueId !== venueId) return fail('receipt', 'This receipt belongs to a different venue');
  if (r.usedBy) return fail('receipt', 'This receipt was already used for a review');
  if (now - r.issuedAt > POLICY.receiptTtlHours * HOUR) return fail('receipt', `Receipt expired (codes last ${POLICY.receiptTtlHours} h)`);
  const rewardable = r.amount >= POLICY.minBill;
  return {
    ok: true,
    method: 'receipt',
    points: POLICY.proofPoints.receipt,
    rewardable,
    ref: r.code,
    visitedAt: r.issuedAt,
    detail: rewardable ? 'Single-use receipt issued by the venue at billing' : `Bill under ${POLICY.minBill}: visit verified, no reward`,
  };
}

export function verifyPayment(txHash, transactions, { venue, reviewerAddress, now }) {
  const hash = String(txHash ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) return fail('payment', 'A transaction hash has 64 hex characters');
  const tx = transactions.find((t) => t.hash.toLowerCase() === hash);
  const same = (a, b) => String(a).replace(/\s/g, '').toUpperCase() === String(b).replace(/\s/g, '').toUpperCase();
  if (!tx) return fail('payment', 'Transaction not found on chain');
  if (!same(tx.recipient, venue.nimAddress)) return fail('payment', "Payment did not go to this venue's wallet");
  if (!same(tx.sender, reviewerAddress)) return fail('payment', 'Payment was not sent from your wallet');
  if (tx.usedBy) return fail('payment', 'This payment was already used for a review');
  if (now - tx.timestamp > POLICY.paymentWindowDays * DAY) return fail('payment', `Payment older than ${POLICY.paymentWindowDays} days`);
  const rewardable = tx.valueNim >= POLICY.minPaymentNim;
  return {
    ok: true,
    method: 'payment',
    points: POLICY.proofPoints.payment,
    rewardable,
    ref: tx.hash,
    visitedAt: tx.timestamp,
    detail: rewardable ? 'On-chain NIM payment from your wallet to the venue' : `Payment under ${POLICY.minPaymentNim} NIM: visit verified, no reward`,
  };
}

export function haversineMeters(a, b) {
  const R = 6_371_000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function verifyCheckin(checkin, venue, { now }) {
  if (!checkin) return fail('checkin', 'No check-in recorded');
  if (checkin.accuracy > POLICY.maxGpsAccuracy) return fail('checkin', `GPS fix too imprecise (±${Math.round(checkin.accuracy)} m)`);
  const d = haversineMeters(checkin, venue);
  if (d > POLICY.geofenceMeters) return fail('checkin', `You were ${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'} from the venue`);
  const dwell = (checkin.leftAt - checkin.arrivedAt) / MIN;
  if (dwell < POLICY.minDwellMinutes) return fail('checkin', `Stayed ${Math.round(dwell)} min; ${POLICY.minDwellMinutes} min needed`);
  if (now - checkin.leftAt > POLICY.checkinWindowHours * HOUR) return fail('checkin', `Check-in older than ${POLICY.checkinWindowHours} h`);
  return {
    ok: true,
    method: 'checkin',
    points: POLICY.proofPoints.checkin,
    rewardable: true,
    visitedAt: checkin.arrivedAt,
    detail: `At the venue for ${Math.round(dwell)} min (weakest proof: GPS can be spoofed)`,
  };
}

export function verifyProof(proof, { venue, account, now, receipts = [], transactions = [] }) {
  switch (proof?.method) {
    case 'receipt':
      return verifyReceipt(proof.code, receipts, { venueId: venue.id, now });
    case 'payment':
      return verifyPayment(proof.txHash, transactions, { venue, reviewerAddress: account.nimAddress, now });
    case 'checkin':
      return verifyCheckin(proof.checkin, venue, { now });
    default:
      return fail('none', 'No proof of visit');
  }
}

// ---------- duplicates ----------

export function hamming(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return Infinity;
  let d = 0;
  for (let i = 0; i < hexA.length; i++) {
    let x = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export function findDuplicates(text, photoHashes = [], existing = []) {
  let textMatch = null;
  let photoMatch = null;
  for (const r of existing) {
    const sim = similarity(text, r.text);
    if (sim >= POLICY.duplicateThreshold && (!textMatch || sim > textMatch.similarity)) textMatch = { reviewId: r.id, similarity: sim };
    for (const h of photoHashes) {
      for (const h2 of r.photoHashes || []) {
        const dist = hamming(h, h2);
        if (dist <= POLICY.photoHashMaxDistance && (!photoMatch || dist < photoMatch.distance)) photoMatch = { reviewId: r.id, distance: dist };
      }
    }
  }
  // the same photo twice inside one review is fine; reuse across reviews is not
  return { text: textMatch, photo: photoMatch };
}

// ---------- the decision ----------

// NIM paid for a perfect score at this venue. Venues set their own amount; the stars never change it.
export const venueReward = (venue) => (Number.isFinite(venue?.rewardPerReview) ? Math.max(0, venue.rewardPerReview) : POLICY.baseReward);

/**
 * @param {object} p
 * @param {{text:string, rating?:number, photoHashes?:string[], composition?:object}} p.review  rating is ignored on purpose
 * @param {object} p.account  {id, createdAt, reviewCount, helpfulVotes, upheldFlags, nimAddress, ownsVenueIds}
 * @param {object} p.venue    {id, lat, lng, nimAddress, menu}
 * @param {object} p.proof    {method:'receipt'|'payment'|'checkin'|'none', ...}
 * @param {object} p.ctx      {now, receipts, transactions, existingReviews, rewards, venueRecent}
 */
export function evaluateReview({ review, account, venue, proof, ctx }) {
  const now = ctx.now;
  const hard = [];

  if ((account.ownsVenueIds || []).includes(venue.id)) hard.push('Owners and staff cannot review their own venue');

  const p = verifyProof(proof, { venue, account, now, receipts: ctx.receipts, transactions: ctx.transactions });
  const c = analyzeContent(review.text, { menu: venue.menu });
  const comp = analyzeComposition(review.composition, c.chars);
  const t = accountTrust(account, now);
  const dup = findDuplicates(review.text, review.photoHashes, ctx.existingReviews || []);
  const burst = venueBurst(ctx.venueRecent || [], now);
  const limits = checkLimits(account, venue.id, ctx.rewards || [], now);

  if (dup.text) hard.push(`Text matches an existing review (${Math.round(dup.text.similarity * 100)}% overlap)`);
  if (dup.photo) hard.push('A photo was already used in another review');
  if (c.spamCount >= 2) hard.push('Looks like spam (links, phone numbers or shouting)');

  const proofPts = p.ok ? p.points : 0;
  const score = Math.round(proofPts + c.points + comp.points + t.points);

  const blockers = [...hard];
  if (!p.ok) blockers.push(proof?.method && proof.method !== 'none' ? p.detail : 'No proof of visit: published, but earns nothing');
  else if (!p.rewardable) blockers.push(p.detail);
  if (c.points < POLICY.minContentPoints) blockers.push('Too short or generic to earn: say what you had and how it was');
  if (score < POLICY.minRewardScore) blockers.push(`Genuineness ${score}/100 is under the ${POLICY.minRewardScore} needed to earn`);
  blockers.push(...limits.reasons);
  if (burst.frozen) blockers.push('Rewards at this venue are paused while unusual review activity is checked');
  const base = venueReward(venue);
  if (!base) blockers.push('This venue does not fund review rewards');

  const status = hard.length ? 'rejected' : p.ok ? 'verified' : 'unverified';
  const rewardable = blockers.length === 0;
  const vestDays = POLICY.vestDays[t.tier];
  const amount = rewardable ? round1((base * score) / 100) : 0;

  const W = POLICY.weights;
  const state = (ok, warn) => (ok ? 'pass' : warn ? 'warn' : 'fail');
  const checks = [
    { id: 'proof', label: 'Proof of visit', points: proofPts, max: W.proof, detail: p.detail, state: p.ok ? (p.rewardable ? 'pass' : 'warn') : proof?.method === 'none' || !proof ? 'warn' : 'fail' },
    {
      id: 'content',
      label: 'Specific, first-hand detail',
      points: c.points,
      max: W.content,
      state: state(c.points >= 18 && !c.spamCount, c.points >= POLICY.minContentPoints && c.spamCount < 2),
      detail: contentDetail(c),
    },
    { id: 'original', label: 'Original text and photos', points: null, max: null, state: dup.text || dup.photo ? 'fail' : 'pass', detail: dup.text ? 'Matches another review' : dup.photo ? 'Photo reused from another review' : 'No match among existing reviews' },
    { id: 'composition', label: 'Written here, by a person', points: comp.points, max: W.composition, state: state(comp.flags.length === 0, comp.points > 0), detail: comp.flags[0] || 'Typed, not pasted' },
    { id: 'trust', label: 'Account history', points: t.points, max: W.trust, state: state(t.tier !== 'new', true), detail: `${t.tier[0].toUpperCase() + t.tier.slice(1)} account · ${t.ageDays} days old` },
    { id: 'limits', label: 'Fair-use limits', points: null, max: null, state: limits.ok && !burst.frozen ? 'pass' : 'warn', detail: limits.reasons[0] || (burst.frozen ? 'Venue under review' : 'Within daily and per-venue limits') },
  ];

  return {
    status,
    score,
    rewardable,
    reward: { amount, vestDays, releaseAt: now + vestDays * DAY },
    tier: t.tier,
    blockers,
    checks,
    signals: { proof: p, content: c, composition: comp, trust: t, duplicates: dup, burst },
  };
}

function contentDetail(c) {
  if (c.spamCount) return c.flags.join(', ');
  const bits = [];
  if (c.menuHits.length) bits.push(`mentions ${c.menuHits.slice(0, 2).join(', ')}`);
  if (c.aspectHits.length) bits.push(`covers ${c.aspectHits.slice(0, 3).join(', ')}`);
  if (!bits.length) return c.chars < POLICY.minChars ? 'Too short' : 'Name a dish and describe the service or setting';
  return bits.join(' · ');
}

// ---------- ratings and ledger ----------

export function weightedRating(reviews) {
  let sum = 0;
  let weight = 0;
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let verified = 0;
  let unverified = 0;
  for (const r of reviews) {
    if (r.status === 'rejected') continue;
    const w = r.status === 'verified' ? 1 : POLICY.unverifiedWeight;
    r.status === 'verified' ? verified++ : unverified++;
    sum += r.rating * w;
    weight += w;
    dist[r.rating] += 1;
  }
  return { avg: weight ? Math.round((sum / weight) * 10) / 10 : 0, verified, unverified, total: verified + unverified, dist };
}

export function settleLedger(entries, now, voidedReviewIds = new Set()) {
  return entries.map((e) => {
    if (e.type !== 'reward' || e.status !== 'pending') return e;
    if (voidedReviewIds.has(e.reviewId)) return { ...e, status: 'voided' };
    if (now >= e.releaseAt) return { ...e, status: 'claimable' };
    return e;
  });
}

export function balances(entries) {
  let claimable = 0;
  let pending = 0;
  let earned = 0;
  for (const e of entries) {
    if (e.type === 'reward') {
      if (e.status === 'claimable') claimable += e.amount;
      if (e.status === 'pending') pending += e.amount;
      if (e.status !== 'voided') earned += e.amount;
    } else {
      claimable -= e.amount; // coupon or cash-out
    }
  }
  return { claimable: round1(claimable), pending: round1(pending), earned: round1(earned) };
}
