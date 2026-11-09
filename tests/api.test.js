// End-to-end API test against a throwaway database on the configured cluster (MONGODB_URI from .env).
// Uses MONGODB_DB=nimreview_test and drops it afterwards; skipped when no MONGODB_URI is set.
// The Nimiq chain is a small fake JSON-RPC server (NIMIQ_RPC_URL), so no test touches the real network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {}
process.env.MONGODB_DB = 'nimreview_test';
const skip = !process.env.MONGODB_URI && 'MONGODB_URI not set';

let base;
let server;
let chain;
let mongoose;
const chainTxs = new Map(); // hash -> tx fields the fake chain knows about

before(async () => {
  if (skip) return;
  chain = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { params, id } = JSON.parse(body);
      const tx = chainTxs.get(params[0]);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(tx
        ? { jsonrpc: '2.0', result: { data: { hash: params[0], ...tx }, metadata: null }, id }
        : { jsonrpc: '2.0', error: { code: -32603, message: 'Internal error', data: `Transaction not found: ${params[0]}` }, id }));
    });
  }).listen(0);
  await new Promise((ok) => chain.once('listening', ok));
  process.env.NIMIQ_RPC_URL = `http://127.0.0.1:${chain.address().port}`;
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
  chain?.close();
});

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const { addressFromPublicKey, signedForms } = await import('../backend/utils/wallet-sig.js');
const run = Date.now().toString(36);
// Twelve unrelated reviews: the duplicate-text check (rightly) rejects a review that overlaps an earlier one.
const P = [
  'The masala dosa was crisp edge to edge and the filter coffee strong. Service was quick, we waited about ten minutes for a table on Sunday, and the bill for two was under three hundred rupees.',
  'Booked the corner suite for a wedding weekend. Marble bathroom was spotless, but the air conditioner rattled all night and breakfast ran out of papaya by nine. Valet was polite and quick with the luggage.',
  'Pongal was buttery and peppery, appam with stew only after eleven. Clean tables, quick service and the bill was fair for what we ate.',
  'We sat outside, the coconut chutney was fresh and the vada crisp. The waiter forgot our coffee once but brought it fast when asked.',
  'Truffle pasta arrived lukewarm yet the burrata starter was lovely. Candles on every table, jazz a little too loud, and our server explained the wine list patiently without any pressure.',
  'Quiet weekday lunch: grilled paneer wrap, mint lemonade and a slice of lemon tart. Wifi was fast, power sockets at every bench, and the owner remembered my name from last month.',
  'Cold brew was smooth and not watery, the almond croissant flaky but a little too sweet. Barista remembered our order, the corner table was quiet enough to work for two hours.',
  'Hot chocolate came with proper marshmallows and the sourdough toast was thick and buttery. It rained outside, they handed out towels, and the playlist was all old Hindi songs.',
  'Biryani for six on a Friday night. Rice was fragrant, raita cool, mutton tender. They split the bill four ways without grumbling and wrapped leftovers in banana leaf.',
  'Rooftop breakfast with idli, medu vada and strong filter kaapi while pigeons watched. Staff cleared plates quickly, the lift was slow, and checkout took barely five minutes.',
  'Ordered the thali at noon: dal, three sabzis, rotis straight off the tawa and a sweet kheer. Spice level was gentle, water jug refilled twice, the fan above us wobbled slightly.',
  'Late dinner after a train delay: tomato soup, garlic naan and a surprisingly good gulab jamun sundae. Kitchen stayed open past eleven and nobody rushed us out.',
];
const TEXT = P[0];

// ---------- wallets: a real Ed25519 key per test account, like a Nimiq wallet ----------
function newWallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return { pub, privateKey, publicKeyHex: pub.toString('hex'), address: addressFromPublicKey(pub) };
}
const signWith = (w, message, form = 0) => edSign(null, signedForms(message)[form], w.privateKey).toString('hex');

async function walletLogin(w, { form = 0 } = {}) {
  const c = await call('/auth/challenge', { method: 'POST' });
  assert.equal(c.status, 200);
  return { c: c.body, res: await call('/auth/wallet', { method: 'POST', body: { challenge: c.body.challenge, publicKey: w.publicKeyHex, signature: signWith(w, c.body.message, form) } }) };
}

const wallets = {};
async function account(role, i, name) {
  const w = newWallet();
  const { res } = await walletLogin(w);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.needsSignup, true);
  assert.equal(res.body.address, w.address);
  const s = await call('/auth/signup', { method: 'POST', body: { ticket: res.body.ticket, role, name } });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  assert.equal(s.body.session.nimAddress, w.address);
  wallets[role + i] = w;
  return s.body.token;
}

const review = (venueId, code, text = TEXT) => ({
  venueId, rating: 2, text, aspects: { food: 4, service: 3, ambience: 3, value: 5 },
  composition: { composeMs: 120_000, typedChars: text.length, pastedChars: 0 },
  proof: code ? { method: 'receipt', code } : { method: 'none' },
});
async function venueWithCode(i, listing = {}) {
  const tok = await account('venue', i, `Owner ${i}`);
  const v = await call('/venues', { method: 'POST', token: tok, body: { name: `Test Place ${i} ${run}`, type: 'restaurant', address: '100 Feet Road', lat: 12.97, lng: 77.64, menu: 'masala dosa, filter coffee', rewardPerReview: 20, ...listing } });
  assert.equal(v.status, 201, JSON.stringify(v.body));
  const code = async (amount = 600) => (await call('/bills', { method: 'POST', token: tok, body: { amount } })).body.bill.code;
  return { tok, id: v.body.venue.id, venue: v.body.venue, code };
}

// ---------- sign in with a wallet ----------
test('wallet sign-in: a signed challenge makes an account, the same wallet signs back in, forgeries and replays fail', { skip }, async () => {
  const w = newWallet();
  // every signed form Nimiq wallets are known to use is accepted
  for (const form of [0, 1, 2]) {
    const w2 = newWallet();
    const { res } = await walletLogin(w2, { form });
    assert.equal(res.status, 200, `form ${form}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.address, w2.address);
  }
  const { c, res } = await walletLogin(w);
  assert.equal(res.body.needsSignup, true);

  // signup: role is required and checked, name is optional
  assert.equal((await call('/auth/signup', { method: 'POST', body: { ticket: res.body.ticket, role: 'admin' } })).status, 400);
  assert.equal((await call('/auth/signup', { method: 'POST', body: { ticket: 'garbage', role: 'customer' } })).status, 401);
  assert.equal((await call('/auth/signup', { method: 'POST', body: { ticket: c.challenge, role: 'customer' } })).status, 401); // a challenge is not a ticket
  const made = await call('/auth/signup', { method: 'POST', body: { ticket: res.body.ticket, role: 'customer' } });
  assert.equal(made.status, 201);
  assert.match(made.body.session.name, /^Reviewer /);
  assert.equal(made.body.session.role, 'customer');
  assert.equal((await call('/bootstrap', { token: made.body.token })).body.users[(await call('/bootstrap', { token: made.body.token })).body.meId].nimAddress, w.address);

  // the same wallet signs back in to the same account, and its role cannot be picked again
  const again = await walletLogin(w);
  assert.equal(again.res.status, 200);
  assert.equal(again.res.body.needsSignup, undefined);
  assert.equal(again.res.body.session.role, 'customer');
  assert.equal(again.res.body.session.nimAddress, w.address);

  // a signature from another key, a bad signature, someone else's public key, a replayed challenge: all refused
  const c2 = (await call('/auth/challenge', { method: 'POST' })).body;
  const other = newWallet();
  assert.equal((await call('/auth/wallet', { method: 'POST', body: { challenge: c2.challenge, publicKey: w.publicKeyHex, signature: signWith(other, c2.message) } })).status, 401);
  assert.equal((await call('/auth/wallet', { method: 'POST', body: { challenge: c2.challenge, publicKey: w.publicKeyHex, signature: '00'.repeat(64) } })).status, 401);
  assert.equal((await call('/auth/wallet', { method: 'POST', body: { challenge: c2.challenge, publicKey: 'zz', signature: signWith(w, c2.message) } })).status, 401);
  assert.equal((await call('/auth/wallet', { method: 'POST', body: { challenge: 'garbage', publicKey: w.publicKeyHex, signature: signWith(w, c2.message) } })).status, 401);
  // a signature over a different message (not ours) does not work, even from the right wallet
  assert.equal((await call('/auth/wallet', { method: 'POST', body: { challenge: c2.challenge, publicKey: w.publicKeyHex, signature: signWith(w, 'Sign in to NimReview\n\nSomething else') } })).status, 401);
  // a challenge is single use
  const good = { challenge: c2.challenge, publicKey: w.publicKeyHex, signature: signWith(w, c2.message) };
  assert.equal((await call('/auth/wallet', { method: 'POST', body: good })).status, 200);
  assert.equal((await call('/auth/wallet', { method: 'POST', body: good })).status, 401);

  // challenge / ticket tokens are not sessions
  assert.equal((await call('/bootstrap', { token: c2.challenge })).status, 401);
  assert.equal((await call('/bootstrap', { token: res.body.ticket })).status, 401);
  // email and password sign-in is gone
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'a@b.co', password: 'password1' } })).status, 404);

  // two people signing up with one wallet at once end up in one account
  const w3 = newWallet();
  const tickets = await Promise.all([1, 2].map(async () => (await walletLogin(w3)).res.body.ticket));
  const both = await Promise.all(tickets.map((ticket) => call('/auth/signup', { method: 'POST', body: { ticket, role: 'venue', name: 'Twin' } })));
  assert.ok(both.every((r) => r.status === 201 || r.status === 200), JSON.stringify(both.map((r) => r.body)));
  assert.equal(new Set(both.map((r) => r.body.session.nimAddress)).size, 1);
  assert.equal((await mongoose.connection.collection('users').countDocuments({ nimAddress: w3.address })), 1);
});

test('an address stored by an old account is not proof: only a wallet that signed at sign-up owns an account', { skip }, async () => {
  const w = newWallet();
  // an account from before wallet sign-in: its address was pasted, never proven
  const legacy = await mongoose.connection.collection('users').insertOne({ nimAddress: w.address, name: 'Old Owner', role: 'venue', email: 'old@example.test', createdAt: new Date(), updatedAt: new Date() });
  const { res } = await walletLogin(w);
  assert.equal(res.status, 200);
  assert.equal(res.body.needsSignup, true, 'the legacy account must not be handed to whoever holds that address');
  const made = await call('/auth/signup', { method: 'POST', body: { ticket: res.body.ticket, role: 'customer', name: 'New Person' } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const mine = (await call('/bootstrap', { token: made.body.token })).body;
  assert.notEqual(mine.meId, String(legacy.insertedId));
  assert.equal(await mongoose.connection.collection('users').countDocuments({ nimAddress: w.address }), 2);
  // and signing in again finds the proven account, not the old one
  const again = await walletLogin(w);
  assert.equal(again.res.body.session.name, 'New Person');
  assert.equal(again.res.body.session.role, 'customer');
});

// ---------- the venue flow ----------
test('live flow: owner lists, sets reward and cooldown, issues bill codes; a code works for exactly one review', { skip }, async () => {
  const venue = await venueWithCode(0, { payoutCooldownDays: 0 });
  const c1 = await account('customer', 1);
  const c2 = await account('customer', 2);
  const c3 = await account('customer', 3);
  const venueTok = venue.tok;
  const venueId = venue.id;
  assert.equal(venue.venue.nimAddress, wallets.venue0.address); // the venue is paid at the owner's wallet
  assert.equal(venue.venue.payoutCooldownDays, 0);

  // role isolation
  assert.equal((await call('/bills', { method: 'POST', token: c1, body: { amount: 500 } })).status, 403);
  assert.equal((await call('/reviews', { method: 'POST', token: venueTok, body: review('x', null) })).status, 403);
  assert.equal((await call('/wallet/cashout', { method: 'POST', token: venueTok, body: { venueId, amount: 1 } })).status, 403);
  const demo = await call('/auth/demo', { method: 'POST', body: { role: 'customer' } });
  assert.equal((await call('/bootstrap', { token: demo.body.token })).status, 403);
  assert.equal((await call('/bootstrap')).status, 401);

  // listing settings: reward and cooldown are validated, one listing per account
  assert.equal((await call('/venues/mine', { method: 'PUT', token: venueTok, body: { rewardPerReview: 20 } })).body.venue.rewardPerReview, 20);
  for (const payoutCooldownDays of [-1, 31, 'x']) assert.equal((await call('/venues/mine', { method: 'PUT', token: venueTok, body: { payoutCooldownDays } })).status, 400, String(payoutCooldownDays));
  assert.equal((await call('/venues', { method: 'POST', token: venueTok, body: { name: 'Second', type: 'cafe', address: 'x', lat: 1, lng: 1 } })).status, 409);

  // bill code: valid once
  const bill = (await call('/bills', { method: 'POST', token: venueTok, body: { amount: 480, label: 'Table 4' } })).body.bill;
  assert.match(bill.code, /^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  const check = await call('/reviews/check-proof', { method: 'POST', token: c1, body: { venueId, proof: { method: 'receipt', code: bill.code.toLowerCase() } } });
  assert.equal(check.body.result.ok, true);
  assert.equal(check.body.receipt.amount, 480);
  // live accounts cannot prove a visit any other way
  for (const proof of [{ method: 'checkin' }, { method: 'payment', txHash: 'a'.repeat(64) }]) assert.equal((await call('/reviews', { method: 'POST', token: c1, body: { ...review(venueId, null), proof } })).status, 400);

  // first use: verified, rewarded at the venue's rate, never by the stars; cooldown 0 = instantly claimable
  const first = await call('/reviews', { method: 'POST', token: c1, body: review(venueId, bill.code) });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.review.status, 'verified');
  assert.equal(first.body.result.rewardable, true, first.body.result.blockers.join('; '));
  const reward = first.body.result.reward.amount;
  assert.equal(reward, Math.round(20 * first.body.result.score * 10 / 100) / 10);
  assert.equal(first.body.result.reward.vestDays, 0);
  const cb = (await call('/bootstrap', { token: c1 })).body;
  assert.equal(cb.ledger[0].status, 'claimable');
  assert.equal(cb.ledger[0].amount, reward);
  assert.equal(cb.receipts.length, 0); // guests never see the owner's codes

  // second use of the same code: refused, nothing posted
  const again = await call('/reviews', { method: 'POST', token: c2, body: review(venueId, bill.code, P[1]) });
  assert.equal(again.status, 409);
  const reused = await call('/reviews/check-proof', { method: 'POST', token: c2, body: { venueId, proof: { method: 'receipt', code: bill.code } } });
  assert.equal(reused.body.result.ok, false);
  assert.match(reused.body.result.detail, /already used/);

  // race: two guests submit one fresh code at the same moment, exactly one wins
  const bill2 = await venue.code(900);
  const race = await Promise.all([c2, c3].map((t, i) => call('/reviews', { method: 'POST', token: t, body: review(venueId, bill2, P[2 + i]) })));
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);

  // owner sees the code as used, what it owes, and can reply
  const vb = (await call('/bootstrap', { token: venueTok })).body;
  assert.ok(vb.receipts.find((r) => r.code === bill.code).usedBy);
  assert.ok(vb.ledger.filter((e) => e.type === 'reward').length >= 2);
  assert.ok(vb.ledger.every((e) => e.venueId === venueId));
  assert.equal((await call(`/reviews/${first.body.review.id}/reply`, { method: 'POST', token: venueTok, body: { text: 'Thanks, we will fix the sambar.' } })).status, 200);
  assert.equal((await call('/bootstrap', { token: c1 })).body.reviews.find((r) => r.id === first.body.review.id).ownerReply.text, 'Thanks, we will fix the sambar.');

  // race: one guest submits four fresh codes from the same venue at once; at most one reward may stand
  const c4 = await account('customer', 4);
  const codes4 = await Promise.all([1, 2, 3, 4].map(() => venue.code(700)));
  const c4Posts = await Promise.all(codes4.map((b, i) => call('/reviews', { method: 'POST', token: c4, body: review(venueId, b, P[4 + i]) })));
  assert.ok(c4Posts.every((p) => p.status === 201), JSON.stringify(c4Posts.map((p) => p.body.error)));
  assert.ok((await call('/bootstrap', { token: c4 })).body.ledger.filter((e) => e.type === 'reward' && e.status !== 'voided').length <= 1);
});

test('the venue sets the cooldown: a 3-day venue holds rewards, an instant venue does not', { skip }, async () => {
  const slow = await venueWithCode(30, { payoutCooldownDays: 3 });
  const g = await account('customer', 31);
  const posted = await call('/reviews', { method: 'POST', token: g, body: review(slow.id, await slow.code(), P[8]) });
  assert.equal(posted.status, 201, JSON.stringify(posted.body));
  assert.equal(posted.body.result.reward.vestDays, 3);
  const entry = (await call('/bootstrap', { token: g })).body.ledger[0];
  assert.equal(entry.status, 'pending');
  assert.ok(Math.abs(entry.releaseAt - entry.at - 3 * 864e5) < 2000);
  // pending money cannot be cashed out
  assert.equal((await call('/wallet/cashout', { method: 'POST', token: g, body: { venueId: slow.id, amount: 1 } })).status, 400);
  // when the cooldown ends the reward unlocks by itself
  await mongoose.connection.collection('ledgerentries').updateMany({ type: 'reward', venue: new mongoose.Types.ObjectId(slow.id) }, { $set: { releaseAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('/bootstrap', { token: g })).body.ledger[0].status, 'claimable');
  // changing the cooldown applies to rewards earned after that
  assert.equal((await call('/venues/mine', { method: 'PUT', token: slow.tok, body: { payoutCooldownDays: 0 } })).body.venue.payoutCooldownDays, 0);
});

// ---------- the venue pays its guests ----------
test('cash-out: the guest asks the venue, the venue pays on-chain, the server confirms the payment before marking it paid', { skip }, async () => {
  const venue = await venueWithCode(40, { payoutCooldownDays: 0 });
  const other = await venueWithCode(41, { payoutCooldownDays: 0 });
  const g = await account('customer', 42, 'Payout Guest');
  const stranger = await account('customer', 43);
  const guest = wallets.customer42;
  const posted = await call('/reviews', { method: 'POST', token: g, body: review(venue.id, await venue.code(), P[9]) });
  const owed = posted.body.result.reward.amount;
  assert.ok(owed > 0, posted.body.result.blockers.join('; '));

  // a guest can only cash out what THAT venue owes them
  const ask = (venueId, amount, token = g) => call('/wallet/cashout', { method: 'POST', token, body: { venueId, amount } });
  assert.equal((await ask(other.id, 1)).status, 400);
  assert.equal((await ask(venue.id, owed + 0.1)).status, 400);
  assert.equal((await ask(venue.id, 0)).status, 400);
  assert.equal((await ask('nope', 1)).status, 404);
  assert.equal((await ask(venue.id, 1, stranger)).status, 400);
  const asked = await ask(venue.id, owed);
  assert.equal(asked.status, 201, JSON.stringify(asked.body));
  assert.equal(asked.body.entry.status, 'requested');
  assert.equal(asked.body.entry.toAddress, guest.address);
  // the request is held against the balance straight away
  assert.equal((await ask(venue.id, 0.1)).status, 400);

  // the venue sees who to pay, where, and how much; the other venue and other guests see nothing of it
  const requests = (await call('/bootstrap', { token: venue.tok })).body.ledger.filter((e) => e.type === 'cashout');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].guestName, 'Payout Guest');
  assert.equal(requests[0].guestAddress, guest.address);
  assert.equal((await call('/bootstrap', { token: other.tok })).body.ledger.filter((e) => e.type === 'cashout').length, 0);
  const id = requests[0].id;
  const pay = (hash, token = venue.tok) => call(`/payouts/${id}/paid`, { method: 'POST', token, body: { txHash: hash } });
  const luna = Math.round(owed * 1e5);
  const H = (n) => n.toString(16).padStart(64, '0');
  const tx = (over) => ({ from: wallets.venue40.address, to: guest.address, value: luna, confirmations: 3, executionResult: true, timestamp: Date.now(), ...over });

  // refused: other venue, a guest, junk, a transaction the chain does not know (retry), and every kind of wrong payment
  assert.equal((await pay(H(1), other.tok)).status, 404);
  assert.equal((await pay(H(1), g)).status, 403);
  assert.equal((await pay('not-a-hash')).status, 400);
  const unknown = await pay(H(2));
  assert.equal(unknown.status, 409);
  assert.match(unknown.body.error, /does not show/);
  chainTxs.set(H(3), tx({ from: wallets.venue41.address }));
  assert.equal((await pay(H(3))).status, 422);
  chainTxs.set(H(4), tx({ to: wallets.customer43.address }));
  assert.equal((await pay(H(4))).status, 422);
  chainTxs.set(H(5), tx({ value: luna - 1 }));
  assert.equal((await pay(H(5))).status, 422);
  chainTxs.set(H(6), tx({ executionResult: false }));
  assert.equal((await pay(H(6))).status, 422);
  chainTxs.set(H(7), tx({ confirmations: 0 }));
  assert.equal((await pay(H(7))).status, 409);
  // an older payment from the venue to this guest (before they asked) cannot settle the request
  chainTxs.set(H(9), tx({ timestamp: Date.now() - 3600_000 }));
  const stale = await pay(H(9));
  assert.equal(stale.status, 422);
  assert.match(stale.body.error, /before the guest asked/);
  chainTxs.set(H(10), tx({ timestamp: undefined }));
  assert.equal((await pay(H(10))).status, 422);
  assert.equal((await call('/bootstrap', { token: g })).body.ledger.find((e) => e.type === 'cashout').status, 'requested');

  // the real payment (a bigger amount than asked is fine) settles it, exactly once
  chainTxs.set(H(8), tx({ value: luna + 500 }));
  const paid = await pay(H(8));
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.entry.status, 'paid');
  assert.equal(paid.body.entry.txHash, H(8));
  assert.equal((await pay(H(8))).status, 409);
  const after = (await call('/bootstrap', { token: g })).body.ledger.find((e) => e.type === 'cashout');
  assert.equal(after.status, 'paid');
  assert.equal((await ask(venue.id, 0.1)).status, 400); // paid money is spent

  // one transaction cannot settle two payouts
  const bill2 = await venue.code();
  await mongoose.connection.collection('ledgerentries').insertOne({ user: new mongoose.Types.ObjectId((await call('/bootstrap', { token: g })).body.meId), type: 'reward', venue: new mongoose.Types.ObjectId(venue.id), amount: owed, status: 'claimable', at: new Date(), releaseAt: new Date() });
  assert.equal(bill2.length > 0, true);
  const second = await ask(venue.id, owed);
  assert.equal(second.status, 201, JSON.stringify(second.body));
  const reuse = await call(`/payouts/${second.body.entry.id}/paid`, { method: 'POST', token: venue.tok, body: { txHash: H(8) } });
  assert.equal(reuse.status, 409);

  // rejecting refunds the guest, with the venue's note
  const rej = await call(`/payouts/${second.body.entry.id}/reject`, { method: 'POST', token: venue.tok, body: { note: 'Please come to the counter' } });
  assert.equal(rej.status, 200);
  assert.equal(rej.body.entry.status, 'rejected');
  assert.equal((await call(`/payouts/${second.body.entry.id}/reject`, { method: 'POST', token: venue.tok, body: {} })).status, 409);
  assert.equal((await ask(venue.id, owed)).status, 201); // the refunded balance can be asked for again
});

test('cash-out race: two requests at once cannot both spend the same balance', { skip }, async () => {
  const venue = await venueWithCode(50, { payoutCooldownDays: 0 });
  const g = await account('customer', 51);
  const meId = (await call('/bootstrap', { token: g })).body.meId;
  const users = mongoose.connection.collection('users');
  const gOid = new mongoose.Types.ObjectId(meId);
  await mongoose.connection.collection('ledgerentries').insertOne({ user: gOid, type: 'reward', venue: new mongoose.Types.ObjectId(venue.id), amount: 10, status: 'claimable', at: new Date(), releaseAt: new Date() });
  const ask = (amount) => call('/wallet/cashout', { method: 'POST', token: g, body: { venueId: venue.id, amount } });
  const both = await Promise.all([ask(10), ask(10)]);
  assert.equal(both.filter((p) => p.status === 201).length, 1, JSON.stringify(both.map((p) => p.status)));
  const requested = (await call('/bootstrap', { token: g })).body.ledger.filter((e) => e.type === 'cashout');
  assert.equal(requested.reduce((s, e) => s + e.amount, 0), 10);
  // lease semantics: a live lease held by another request is respected, an expired one can be taken over, and the
  // lease is cleared afterwards
  await users.updateOne({ _id: gOid }, { $set: { payoutLockUntil: new Date(Date.now() + 60_000), payoutLockId: 'other-request' } });
  assert.equal((await ask(1)).status, 409);
  assert.equal((await users.findOne({ _id: gOid })).payoutLockId, 'other-request');
  await users.updateOne({ _id: gOid }, { $set: { payoutLockUntil: new Date(Date.now() - 1000) } });
  assert.equal((await ask(1)).status, 400); // lease taken over; the balance is 0
  assert.equal((await users.findOne({ _id: gOid })).payoutLockId, null);
});

// ---------- photo links ----------
test('venue photo links: Google shapes are fixed up, anything that could break out of a style attribute is neutralised', { skip }, async () => {
  const v = await venueWithCode(60);
  const put = (img) => call('/venues/mine', { method: 'PUT', token: v.tok, body: { img } });
  let r = await put('https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fhotel%20(front).jpg&imgrefurl=https%3A%2F%2Fexample.com');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.venue.img, 'https://example.com/hotel%20%28front%29.jpg');
  r = await put('https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing');
  assert.equal(r.body.venue.img, 'https://lh3.googleusercontent.com/d/1AbC_dEf-123');
  r = await put('http://images.example.test/cafe.jpg?w=900&amp;q=70');
  assert.equal(r.body.venue.img, 'https://images.example.test/cafe.jpg?w=900&q=70');
  for (const page of ['https://photos.app.goo.gl/abc', 'https://maps.app.goo.gl/abc', 'https://www.google.com/search?q=hotel&tbm=isch']) assert.equal((await put(page)).status, 400, page);
  for (const bad of ['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'not a link']) assert.equal((await put(bad)).status, 400, bad);
  // hostile text is stored percent-encoded: no quote, bracket, backslash, angle bracket or space survives
  for (const hostile of ["https://x.test/a.jpg')\"><img src=x onerror=alert(1)>", 'https://x.test/a.jpg&#39;;color:red', 'https://x.test/a.jpg&apos;;x', "https://x.test/a.jpg');background:red;('"]) {
    const out = await put(hostile);
    if (out.status === 200) assert.ok(!/["'()<>\\\s]/.test(out.body.venue.img), out.body.venue.img);
    else assert.equal(out.status, 400);
  }
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
  for (const ref of ['https://x.test/a.jpg&#39;;color:red;--x:&#39;', 'https://x.test/a.jpg&#x27;;color:red', 'https://x.test/a.jpg&apos;;color:red']) {
    const out = bgImg(ref);
    assert.equal(decoded(out).split("'").length - 1, 2, ref);
    assert.ok(!/[<>"]/.test(out), ref);
  }
});

// ---------- sign out ----------
test('sign out revokes only that token; demo sign out needs no database', { skip }, async () => {
  const w = newWallet();
  const first = await walletLogin(w);
  const made = await call('/auth/signup', { method: 'POST', body: { ticket: first.res.body.ticket, role: 'customer' } });
  const a = made.body.token;
  const b = (await walletLogin(w)).res.body.token;
  assert.ok(b && a !== b);
  assert.equal((await call('/bootstrap', { token: a })).status, 200);
  assert.equal((await call('/auth/logout', { method: 'POST', token: a })).status, 200);
  assert.equal((await call('/bootstrap', { token: a })).status, 401);
  assert.equal((await call('/auth/me', { token: a })).status, 401);
  assert.equal((await call('/wallet/cashout', { method: 'POST', token: a, body: { venueId: 'x', amount: 1 } })).status, 401);
  assert.equal((await call('/auth/logout', { method: 'POST', token: a })).status, 200); // repeating is harmless
  assert.equal((await call('/bootstrap', { token: b })).status, 200); // the other device stays signed in
  assert.equal((await call('/auth/logout', { method: 'POST' })).status, 401);
  const demo = (await call('/auth/demo', { method: 'POST', body: { role: 'venue' } })).body.token;
  assert.equal((await call('/auth/logout', { method: 'POST', token: demo })).status, 200);
});
