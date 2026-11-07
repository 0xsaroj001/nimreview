import { readToken } from '../utils/auth.js';
import { User } from '../models/User.js';
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
    next();
  } catch {
    next(new HttpError(401, 'Session expired, sign in again'));
  }
}

// A live account loaded from the database. Demo sessions are refused: their data stays on the device.
export async function requireUser(req, res, next) {
  try {
    if (!req.session) await new Promise((ok, fail) => requireSession(req, res, (e) => (e ? fail(e) : ok())));
    if (req.session.demo) throw new HttpError(403, 'Demo accounts use on-device demo data. Sign up for a live account.');
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

export const requireWallet = (req, res, next) =>
  req.user?.nimAddress ? next() : next(new HttpError(409, 'Connect your Nimiq wallet first'));
