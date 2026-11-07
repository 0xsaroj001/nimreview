import { User } from '../models/User.js';
import { Venue } from '../models/Venue.js';
import { hashPassword, verifyPassword, signToken } from '../utils/auth.js';
import { HttpError } from '../middleware/error.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['customer', 'venue'];
const DEMO_NAMES = { customer: 'Aanya Rao', venue: 'Karan Mehta' };

async function sessionOf(user) {
  const venue = user.role === 'venue' ? await Venue.exists({ owner: user._id }) : null;
  return { mode: 'live', role: user.role, name: user.name, email: user.email, nimAddress: user.nimAddress, hasVenue: !!venue };
}

export async function signup(req, res) {
  const name = String(req.body.name ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const role = req.body.role;
  if (name.length < 2 || name.length > 60) throw new HttpError(400, 'Name must be 2 to 60 characters');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email');
  if (password.length < 8 || password.length > 128) throw new HttpError(400, 'Password must be at least 8 characters');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Pick an account type');
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');

  const user = await User.create({ name, email, role, passwordHash: await hashPassword(password) });
  res.status(201).json({ token: signToken({ sub: String(user._id), role }), session: await sessionOf(user) });
}

export async function login(req, res) {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, 'Wrong email or password');
  res.json({ token: signToken({ sub: String(user._id), role: user.role }), session: await sessionOf(user) });
}

// Demo sessions need no database: the browser loads the demo data set and no real NIM is involved.
export function demo(req, res) {
  const role = req.body.role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Pick customer or venue');
  res.json({ token: signToken({ demo: true, role }), session: { mode: 'demo', role, name: DEMO_NAMES[role] } });
}

export async function me(req, res) {
  if (req.session.demo) return res.json({ session: { mode: 'demo', role: req.session.role, name: DEMO_NAMES[req.session.role] } });
  const user = await User.findById(req.session.sub);
  if (!user) throw new HttpError(401, 'Account not found, sign in again');
  res.json({ session: await sessionOf(user) });
}
