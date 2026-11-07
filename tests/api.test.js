// End-to-end API test against a throwaway database on the configured cluster (MONGODB_URI from .env).
// Uses MONGODB_DB=nimreview_test and drops it afterwards; skipped when no MONGODB_URI is set.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {}
process.env.MONGODB_DB = 'nimreview_test';
const skip = !process.env.MONGODB_URI && 'MONGODB_URI not set';

let base;
let server;
let mongoose;

before(async () => {
  if (skip) return;
  const { createApp } = await import('../backend/app.js');
  mongoose = (await import('mongoose')).default;
  server = createApp().listen(0);
  await new Promise((ok) => server.once('listening', ok));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (skip) return;
  if (mongoose?.connection.readyState === 1) {
    assert.equal(mongoose.connection.name, 'nimreview_test');
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  server?.close();
});

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const { makeAddress } = await import('../public/src/core/nimiq.js');
const run = Date.now().toString(36);
const WALLETS = ['5D3A0V4E9LCX7H1MBQRTUFYK2PNS8G6J', 'HQ4T8N2CY6RJ0VKDX3LM9BPE1G7AF5SU', '2V7KPC9X4NQ1TH8ME3RJ6YB0DLF5GSUA', 'YB6L1R8DT3Q0XK5VNG2HJ9CMP4A7FEUS'].map(makeAddress);
const TEXT = 'The masala dosa was crisp edge to edge and the filter coffee strong. Service was quick, we waited about ten minutes for a table on Sunday, and the bill for two was under three hundred rupees.';

async function account(role, i) {
  const s = await call('/auth/signup', { method: 'POST', body: { name: `Test ${role} ${i}`, email: `t-${run}-${role}${i}@example.test`, password: 'correct horse 1', role } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const token = s.body.token;
  const w = await call('/me/wallet', { method: 'PUT', token, body: { address: WALLETS[i % WALLETS.length] } });
  assert.equal(w.status, 200, JSON.stringify(w.body));
  return token;
}

const review = (venueId, code, text = TEXT) => ({
  venueId, rating: 2, text, aspects: { food: 4, service: 3, ambience: 3, value: 5 },
  composition: { composeMs: 120_000, typedChars: text.length, pastedChars: 0 },
  proof: code ? { method: 'receipt', code } : { method: 'none' },
});

test('image URLs only reach a style attribute when they are plain https or base64 image data', async () => {
  const { bgImg } = await import('../public/src/ui.js');
  // what CSS sees after the browser decodes character references in the attribute value
  const decoded = (attr) => attr.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  assert.equal(decoded(bgImg('https://images.unsplash.com/photo-1?w=900&q=70', 300)), "background-image:url('https://images.unsplash.com/photo-1?w=300&q=70')");
  assert.equal(decoded(bgImg('data:image/jpeg;base64,/9j/4AAQSkZJRg==')), "background-image:url('data:image/jpeg;base64,/9j/4AAQSkZJRg==')");
  for (const bad of ["https://x.test/a.jpg')\"><img src=x onerror=alert(1)>", "https://x.test/a.jpg');background:red;('", 'javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', '', null]) {
    assert.equal(bgImg(bad), '', String(bad));
  }
  // character references must not decode into quotes: CSS still sees exactly the two quotes of url('…')
  for (const ref of ['https://x.test/a.jpg&#39;;color:red;--x:&#39;', 'https://x.test/a.jpg&#x27;;color:red', 'https://x.test/a.jpg&apos;;color:red']) {
    const out = bgImg(ref);
    assert.equal(decoded(out).split("'").length - 1, 2, ref);
    assert.ok(!/[<>"]/.test(out), ref);
  }
});

test('live flow: venue lists, sets reward, issues a bill code; the code works for exactly one review', { skip }, async () => {
  const venueTok = await account('venue', 0);
  const c1 = await account('customer', 1);
  const c2 = await account('customer', 2);
  const c3 = await account('customer', 3);

  // role isolation
  assert.equal((await call('/bills', { method: 'POST', token: c1, body: { amount: 500 } })).status, 403);
  assert.equal((await call('/reviews', { method: 'POST', token: venueTok, body: review('x', null) })).status, 403);
  const demo = await call('/auth/demo', { method: 'POST', body: { role: 'customer' } });
  assert.equal((await call('/bootstrap', { token: demo.body.token })).status, 403);
  assert.equal((await call('/bootstrap')).status, 401);

  // listing + reward per review
  const created = await call('/venues', { method: 'POST', token: venueTok, body: { name: `Test Dosa ${run}`, type: 'restaurant', address: '100 Feet Road', lat: 12.97, lng: 77.64, menu: 'masala dosa, filter coffee' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const venueId = created.body.venue.id;
  assert.equal(created.body.venue.nimAddress, WALLETS[0]);
  assert.equal((await call('/venues/mine', { method: 'PUT', token: venueTok, body: { rewardPerReview: 20 } })).body.venue.rewardPerReview, 20);
  assert.equal((await call('/venues', { method: 'POST', token: venueTok, body: { name: 'Second', type: 'cafe', address: 'x', lat: 1, lng: 1 } })).status, 409);
  // photo links render inside CSS url('…'): anything that could break out is refused
  for (const img of ["https://x.test/a.jpg')\"><img src=x onerror=alert(1)>", 'javascript:alert(1)', 'http://x.test/a.jpg', 'https://x.test/a b.jpg', 'https://x.test/a.jpg&#39;;color:red', 'https://x.test/a.jpg&#x27;', 'https://x.test/a.jpg&apos;;x']) {
    assert.equal((await call('/venues/mine', { method: 'PUT', token: venueTok, body: { img } })).status, 400, img);
  }
  assert.equal((await call('/venues/mine', { method: 'PUT', token: venueTok, body: { img: 'https://images.example.test/cafe.jpg?w=900&q=70&fit=crop' } })).status, 200);

  // bill code
  const bill = (await call('/bills', { method: 'POST', token: venueTok, body: { amount: 480, label: 'Table 4' } })).body.bill;
  assert.match(bill.code, /^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  const check = await call('/reviews/check-proof', { method: 'POST', token: c1, body: { venueId, proof: { method: 'receipt', code: bill.code.toLowerCase() } } });
  assert.equal(check.body.result.ok, true);
  assert.equal(check.body.receipt.amount, 480);

  // first use: verified, rewarded at the venue's rate, never by the stars
  const first = await call('/reviews', { method: 'POST', token: c1, body: review(venueId, bill.code) });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.review.status, 'verified');
  assert.equal(first.body.review.method, 'receipt');
  assert.equal(first.body.result.rewardable, true, first.body.result.blockers.join('; '));
  assert.equal(first.body.result.reward.amount, Math.round(20 * first.body.result.score * 10 / 100) / 10);

  // second use of the same code: refused, nothing posted
  const again = await call('/reviews', { method: 'POST', token: c2, body: review(venueId, bill.code, TEXT.replace('dosa', 'idli').replace('Sunday', 'Monday morning, again') + ' Different words for the second guest, the sambar was too sweet.') });
  assert.equal(again.status, 409);
  const reused = await call('/reviews/check-proof', { method: 'POST', token: c2, body: { venueId, proof: { method: 'receipt', code: bill.code } } });
  assert.equal(reused.body.result.ok, false);
  assert.match(reused.body.result.detail, /already used/);

  // race: two guests submit one fresh code at the same moment, exactly one wins
  const bill2 = (await call('/bills', { method: 'POST', token: venueTok, body: { amount: 900 } })).body.bill;
  const texts = [
    'Pongal was buttery and peppery, appam with stew only after eleven. Clean tables, quick service and the bill was fair for what we ate.',
    'We sat outside, the coconut chutney was fresh and the vada crisp. The waiter forgot our coffee once but brought it fast when asked.',
  ];
  const race = await Promise.all([c2, c3].map((t, i) => call('/reviews', { method: 'POST', token: t, body: review(venueId, bill2.code, texts[i]) })));
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);

  // venue sees the code as used and can reply; customer ledger shows the pending reward
  const vb = (await call('/bootstrap', { token: venueTok })).body;
  assert.ok(vb.receipts.find((r) => r.code === bill.code).usedBy);
  assert.equal(vb.ledger.length, 0);
  assert.equal((await call(`/reviews/${first.body.review.id}/reply`, { method: 'POST', token: venueTok, body: { text: 'Thanks, we will fix the sambar.' } })).status, 200);
  const cb = (await call('/bootstrap', { token: c1 })).body;
  assert.equal(cb.ledger[0].status, 'pending');
  assert.equal(cb.receipts.length, 0);
  assert.equal(cb.reviews.find((r) => r.id === first.body.review.id).ownerReply.text, 'Thanks, we will fix the sambar.');

  // race: one guest submits four fresh codes from the same venue at once. However the requests interleave, at
  // most one reward may stand (one rewarded review per venue per 30 days). Whether the requests actually overlap
  // is timing-dependent, so this pins the invariant rather than a specific interleaving.
  const c4 = await account('customer', 4);
  const codes4 = await Promise.all([1, 2, 3, 4].map(() => call('/bills', { method: 'POST', token: venueTok, body: { amount: 700 } })));
  const t4 = [
    'Ordered the masala dosa at lunch: lacy, crisp and the potato filling well spiced. Service was polite and quick, the table was cleaned before we sat, bill was 350 rupees.',
    'Breakfast on a weekday. The filter coffee was strong without being bitter and arrived in a steel tumbler. Staff refilled the sambar twice without asking; seating is cramped.',
    'Came with family on Saturday night, waited twenty minutes outside. Kids liked the mini idli, my uncle found the rasam too salty. Cashier was friendly, parking is hard.',
    'Takeaway order for the office: six vadas packed in foil stayed warm for the walk back. Chutney leaked a little through the bag. Ready in twelve minutes as promised.',
  ];
  const c4Posts = await Promise.all(codes4.map((b, i) => call('/reviews', { method: 'POST', token: c4, body: review(venueId, b.body.bill.code, t4[i]) })));
  assert.ok(c4Posts.every((p) => p.status === 201), JSON.stringify(c4Posts.map((p) => p.body.error)));
  const c4Rewards = (await call('/bootstrap', { token: c4 })).body.ledger.filter((e) => e.type === 'reward');
  assert.ok(c4Rewards.filter((e) => e.status !== 'voided').length <= 1, JSON.stringify(c4Rewards));

  // race: two payout requests at once cannot both spend the same balance
  const c1Id = (await call('/bootstrap', { token: c1 })).body.meId;
  await mongoose.connection.collection('ledgerentries').insertOne({ user: new mongoose.Types.ObjectId(c1Id), type: 'reward', amount: 10, status: 'claimable', at: new Date(), releaseAt: new Date() });
  const payouts = await Promise.all([1, 2].map(() => call('/wallet/cashout', { method: 'POST', token: c1, body: { amount: 10 } })));
  assert.equal(payouts.filter((p) => p.status === 201).length, 1, JSON.stringify(payouts.map((p) => p.status)));
  const requested = (await call('/bootstrap', { token: c1 })).body.ledger.filter((e) => e.type === 'cashout');
  assert.equal(requested.reduce((s, e) => s + e.amount, 0), 10);

  // login works, wrong password does not
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: `t-${run}-customer1@example.test`, password: 'correct horse 1' } })).status, 200);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: `t-${run}-customer1@example.test`, password: 'wrong password' } })).status, 401);
});
