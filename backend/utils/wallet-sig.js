// Proof that a person controls a Nimiq wallet: they sign a one-time challenge, and this file checks the signature
// and works out the wallet address from the public key. No private key or seed phrase ever reaches the server.
//
// Address = first 20 bytes of Blake2b-256(public key), written as 32 base32 characters plus IBAN check digits.
// (Pinned by tests/wallet-sig.test.js against a real transaction on the Nimiq chain.)
//
// What exactly Nimiq Pay's `sign(message)` signs is NOT documented on nimiq.dev (checked 2026-11-08: no prefix,
// hash step or verification example is given). The usual Nimiq convention is Ed25519 over
// SHA-256("\x16Nimiq Signed Message:\n" + byteLength + message); the other plausible form is the raw message
// bytes. Every candidate below proves the same thing: the holder of that key signed OUR one-time challenge (it
// contains the domain and a nonce), so accepting any of them cannot let someone log in without the key.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { blake2b } from '@noble/hashes/blake2.js';
import { ALPHABET, makeAddress } from '../../public/src/core/nimiq.js';

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const HEX = (n) => new RegExp(`^[0-9a-fA-F]{${n * 2}}$`);

export function addressFromPublicKey(publicKey) {
  const hash = blake2b(publicKey, { dkLen: 32 }).slice(0, 20);
  let bits = '';
  for (const b of hash) bits += b.toString(2).padStart(8, '0');
  let body = '';
  for (let i = 0; i < 160; i += 5) body += ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  return makeAddress(body);
}

// the byte strings a wallet may have signed for this message
export function signedForms(message) {
  const raw = Buffer.from(message, 'utf8');
  const prefixed = Buffer.concat([Buffer.from(`\x16Nimiq Signed Message:\n${raw.length}`, 'utf8'), raw]);
  return [raw, createHash('sha256').update(prefixed).digest(), prefixed];
}

const asBytes = (x, n) => {
  if (x instanceof Uint8Array || Array.isArray(x)) return Buffer.from(x);
  if (typeof x === 'string' && HEX(n).test(x)) return Buffer.from(x, 'hex');
  return null;
};

// -> { address } when the signature is valid, otherwise null
export function verifyWalletSignature({ message, publicKey, signature }) {
  const pub = asBytes(publicKey, 32);
  const sig = asBytes(signature, 64);
  if (!pub || pub.length !== 32 || !sig || sig.length !== 64) return null;
  let key;
  try {
    key = createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, pub]), format: 'der', type: 'spki' });
  } catch {
    return null;
  }
  const ok = signedForms(message).some((data) => {
    try {
      return verify(null, data, key, sig);
    } catch {
      return false;
    }
  });
  return ok ? { address: addressFromPublicKey(pub) } : null;
}
