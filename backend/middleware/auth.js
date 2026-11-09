import { readToken } from '../utils/auth.js';
import { User } from '../models/User.js';
import { RevokedToken } from '../models/RevokedToken.js';
import { HttpError } from './error.js';

function bearer(req) {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Any valid token, demo or live.
export function requireSession(req, res, next) {
  const token = bearer(req);
  if (!token) return next(new HttpError(401, 'Sign in first'));
  try {
    req.session = readToken(token);
    // sign-in challenges and sign-up tickets are signed with the same key but are not sessions
    if (req.session.typ) throw new Error('not a session');
    next();
  } catch {
    next(new HttpError(401, 'Session expired, sign in again'));
  }
}

// True when this token was signed out. Tokens issued before jti existed cannot be revoked one by one; they run
// out within the 7-day token lifetime.
export const isRevoked = async (session) => !!session.jti && !!(await RevokedToken.exists({ jti: session.jti }));

// A live account loaded from the database. Demo sessions are refused: their data stays on the device.
export async function requireUser(req, res, next) {
  try {
    if (!req.session) await new Promise((ok, fail) => requireSession(req, res, (e) => (e ? fail(e) : ok())));
    if (req.session.demo) throw new HttpError(403, 'Demo accounts use on-device demo data. Sign up for a live account.');
    if (await isRevoked(req.session)) throw new HttpError(401, 'Signed out, sign in again');
    const user = await User.findById(req.session.sub);
    if (!user) throw new HttpError(401, 'Account not found, sign in again');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : next(new HttpError(403, role === 'venue' ? 'Only venue accounts can do this' : 'Only customer accounts can do this'));
