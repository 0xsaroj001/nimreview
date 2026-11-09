import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { addressFromPublicKey, verifyWalletSignature, signedForms } from '../backend/utils/wallet-sig.js';
import { isValidAddress } from '../public/src/core/nimiq.js';
import { normalizeImageUrl } from '../public/src/core/imageurl.js';
import { checkPayment, lunaOf } from '../backend/utils/chain.js';

test('address derivation matches a real Nimiq mainnet transaction (public key from its proof, address from its sender)', () => {
  // tx ba06b889…8c5f, read from rpc.nimiqwatch.com on 2026-11-08: proof bytes 1..33 are the sender's public key
  const pub = Buffer.from('fd6e787d6c17f3c324e2beb922b61a03e17c40e8e324ea2c7ccec91a5c1f4494', 'hex');
  assert.equal(addressFromPublicKey(pub), 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3');
  assert.ok(isValidAddress(addressFromPublicKey(pub)));
});

test('wallet signatures: valid for every accepted signing form, refused for anything else', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const msg = 'Sign in to NimReview\n\nNonce: abc';
  signedForms(msg).forEach((data, i) => {
    const out = verifyWalletSignature({ message: msg, publicKey: pub.toString('hex'), signature: sign(null, data, privateKey).toString('hex') });
    assert.equal(out?.address, addressFromPublicKey(pub), `form ${i}`);
  });
  const sig = sign(null, signedForms(msg)[0], privateKey).toString('hex');
  assert.equal(verifyWalletSignature({ message: msg + '!', publicKey: pub.toString('hex'), signature: sig }), null);
  assert.equal(verifyWalletSignature({ message: msg, publicKey: pub.toString('hex'), signature: sig.slice(0, -2) + '00' }), null);
  assert.equal(verifyWalletSignature({ message: msg, publicKey: '00'.repeat(32), signature: sig }), null);
  assert.equal(verifyWalletSignature({ message: msg, publicKey: 'xyz', signature: sig }), null);
  assert.equal(verifyWalletSignature({ message: msg, publicKey: pub.toString('hex'), signature: undefined }), null);
  // byte arrays (the Nimiq Hub returns Uint8Arrays) work as well as hex
  assert.ok(verifyWalletSignature({ message: msg, publicKey: new Uint8Array(pub), signature: new Uint8Array(Buffer.from(sig, 'hex')) }));
});

test('payment check: right sender, recipient, amount, success and a block', () => {
  const ok = { from: 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3'.replace(/ /g, ''), to: 'NQ49N8MBXYCRXBUP404CKXKKL49MA7BTF082', valueLuna: lunaOf(12.3), confirmations: 2, executionResult: true };
  const want = { from: 'NQ02 31N6 3KM5 T6G5 22TN EPF5 5XPY RLHK RMB3', to: 'nq49 n8mb xycr xbup 404c kxkk l49m a7bt f082', amountNim: 12.3 };
  assert.equal(lunaOf(12.3), 1_230_000);
  assert.equal(checkPayment(ok, want).ok, true);
  assert.equal(checkPayment(null, want).retry, true);
  assert.equal(checkPayment({ ...ok, from: 'NQ07' }, want).ok, false);
  assert.equal(checkPayment({ ...ok, to: 'NQ07' }, want).ok, false);
  assert.equal(checkPayment({ ...ok, valueLuna: lunaOf(12.2) }, want).ok, false);
  assert.equal(checkPayment({ ...ok, executionResult: false }, want).ok, false);
  assert.equal(checkPayment({ ...ok, confirmations: 0 }, want).retry, true);
  assert.equal(checkPayment({ ...ok, executionResult: undefined }, want).ok, true); // field absent: not a failure
});

test('photo links pasted from Google', () => {
  const n = (x) => normalizeImageUrl(x);
  assert.equal(n('https://lh3.googleusercontent.com/p/AF1Qip=s1360-w1360').url, 'https://lh3.googleusercontent.com/p/AF1Qip=s1360-w1360');
  assert.equal(n('https://www.google.com/imgres?imgurl=https%3A%2F%2Fexample.com%2Fa%20(1).jpg&tbnid=x').url, 'https://example.com/a%20%281%29.jpg');
  assert.equal(n('https://www.google.co.in/imgres?imgurl=https%3A%2F%2Fexample.com%2Fb.jpg').url, 'https://example.com/b.jpg');
  assert.equal(n('https://drive.google.com/open?id=1AbC_dEf').url, 'https://lh3.googleusercontent.com/d/1AbC_dEf');
  assert.equal(n('https://images.example.test/c.jpg?w=1&amp;q=2').url, 'https://images.example.test/c.jpg?w=1&q=2');
  assert.equal(n('http://images.example.test/c.jpg').url, 'https://images.example.test/c.jpg');
  assert.equal(n('images.example.test/c.jpg').url, 'https://images.example.test/c.jpg');
  assert.equal(n('').url, '');
  for (const page of ['https://photos.app.goo.gl/x', 'https://www.google.com/maps/place/x', 'https://share.google/abc', 'https://www.google.com/imgres?q=no+imgurl']) assert.match(n(page).error, /web page/, page);
  for (const bad of ['javascript:alert(1)', 'ftp://x.test/a.jpg', 'just words']) assert.ok(n(bad).error, bad);
  assert.ok(n('https://x.test/' + 'a'.repeat(1100)).error);
});
