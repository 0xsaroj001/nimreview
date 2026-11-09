// Sign in with a Nimiq wallet. No passwords: the person signs a one-time challenge in Nimiq Pay (or the Nimiq
// Hub) and the server checks the signature (backend/utils/wallet-sig.js).
//   POST /auth/challenge  -> { challenge, message }      what to sign
//   POST /auth/wallet     -> { token, session }          known wallet: signed in
//                         -> { needsSignup, ticket }     new wallet: ask reviewer or owner, then...
//   POST /auth/signup     -> { token, session }          create the account for the proven wallet
import { randomBytes } from 'node:crypto';
import { User } from '../models/User.js';
import { Venue } from '../models/Venue.js';
import { RevokedToken } from '../models/RevokedToken.js';
import { signToken, readToken } from '../utils/auth.js';
import { verifyWalletSignature } from '../utils/wallet-sig.js';
import { HttpError } from '../middleware/error.js';
import { isRevoked } from '../middleware/auth.js';
import { shortAddress } from '../../public/src/core/nimiq.js';

const ROLES = ['customer', 'venue'];
const DEMO_NAMES = { customer: 'Aanya Rao', venue: 'Karan Mehta' };
const CHALLENGE_MIN = 5;

async function sessionOf(user) {
  const venue = user.role === 'venue' ? await Venue.exists({ owner: user._id }) : null;
  return { mode: 'live', role: user.role, name: user.name, nimAddress: user.nimAddress, hasVenue: !!venue };
}
const signedIn = async (user) => ({ token: signToken({ sub: String(user._id), role: user.role }), session: await sessionOf(user) });

function typed(token, typ) {
  let t;
  try {
    t = readToken(String(token ?? ''));
  } catch {
    throw new HttpError(401, 'That sign-in step expired. Start again.');
  }
  if (t.typ !== typ) throw new HttpError(401, 'That sign-in step is not valid. Start again.');
  return t;
}

export function challenge(req, res) {
  const nonce = randomBytes(16).toString('hex');
  const expires = new Date(Date.now() + CHALLENGE_MIN * 60_000);
  const message = [
    'Sign in to NimReview',
    '',
    'This proves you own this Nimiq wallet. It costs nothing and sends no NIM.',
    '',
    `Site: ${req.get('host')}`,
    `Nonce: ${nonce}`,
    `Expires: ${expires.toISOString()}`,
  ].join('\n');
  res.json({ challenge: signToken({ typ: 'wallet-challenge', nonce, msg: message }, `${CHALLENGE_MIN}m`), message });
}

export async function wallet(req, res) {
  const c = typed(req.body.challenge, 'wallet-challenge');
  // the message signed is the one inside OUR token, never one the browser supplies
  const proved = verifyWalletSignature({ message: c.msg, publicKey: req.body.publicKey, signature: req.body.signature });
  if (!proved) throw new HttpError(401, 'That wallet signature was not accepted. Try again, or open the app inside Nimiq Pay.');
  // a challenge works once: the first request to record the nonce wins
  try {
    await RevokedToken.create({ jti: `challenge:${c.nonce}`, expireAt: new Date(Date.now() + 15 * 60_000) });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(401, 'That sign-in was already used. Start again.');
    throw err;
  }
  // only accounts whose wallet was proven by a signature match; an address someone once pasted proves nothing
  const user = await User.findOne({ nimAddress: proved.address, walletProven: true });
  if (user) return res.json(await signedIn(user));
  res.json({ needsSignup: true, address: proved.address, ticket: signToken({ typ: 'signup', address: proved.address }, '15m') });
}

export async function signup(req, res) {
  const t = typed(req.body.ticket, 'signup');
  const role = req.body.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Pick reviewer or owner');
  const given = String(req.body.name ?? '').trim();
  if (given && (given.length < 2 || given.length > 40)) throw new HttpError(400, 'Name must be 2 to 40 characters');
  const name = given || `${role === 'venue' ? 'Owner' : 'Reviewer'} ${shortAddress(t.address).slice(-4)}`;
  try {
    const user = await User.create({ nimAddress: t.address, walletProven: true, name, role });
    return res.status(201).json(await signedIn(user));
  } catch (err) {
    if (err.code !== 11000) throw err;
    // the same wallet signed up twice at once: it is the same person, so sign them in
    const user = await User.findOne({ nimAddress: t.address, walletProven: true });
    if (!user) throw err;
    res.json(await signedIn(user));
  }
}

// Demo sessions need no database: the browser loads the demo data set and no real NIM is involved.
export function demo(req, res) {
  const role = req.body.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Pick reviewer or owner');
  res.json({ token: signToken({ demo: true, role }), session: { mode: 'demo', role, name: DEMO_NAMES[role] } });
}

export async function me(req, res) {
  if (req.session.demo) return res.json({ session: { mode: 'demo', role: req.session.role, name: DEMO_NAMES[req.session.role] } });
  if (await isRevoked(req.session)) throw new HttpError(401, 'Signed out, sign in again');
  const user = await User.findById(req.session.sub);
  if (!user) throw new HttpError(401, 'Account not found, sign in again');
  res.json({ session: await sessionOf(user) });
}

// Signs out this token only: other devices stay signed in. Demo tokens hold no server state, so there is nothing
// to revoke; the browser drops them. Repeating the call is harmless.
export async function logout(req, res) {
  const { jti, exp, demo } = req.session;
  if (!demo && jti) await RevokedToken.updateOne({ jti }, { $setOnInsert: { jti, expireAt: new Date(exp * 1000) } }, { upsert: true });
  res.json({ ok: true });
}
