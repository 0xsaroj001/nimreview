import { Venue } from '../models/Venue.js';
import { HttpError } from '../middleware/error.js';
import { venueJson } from '../views/serialize.js';

const EDITABLE = ['name', 'type', 'cuisine', 'price', 'address', 'lat', 'lng', 'hours', 'img', 'menu', 'rewardPerReview'];

// The link is rendered inside a CSS url('…') in every guest's browser, so quotes, brackets, backslashes and
// whitespace are refused outright rather than escaped.
function safeImageUrl(raw) {
  const s = String(raw).trim();
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, 'Photo must be an https:// image link');
  }
  if (u.protocol !== 'https:' || /["'()<>\\\s]/.test(s) || /["'()<>\\\s]/.test(u.href)) throw new HttpError(400, 'Photo must be an https:// image link');
  // HTML character references (&#39; &#x27; &apos;) would decode into quotes inside a style attribute; plain
  // query strings like &q=70 have no trailing ';' and are fine
  if (/&#|&[a-z][a-z0-9]*;/i.test(s)) throw new HttpError(400, 'Photo must be an https:// image link');
  return u.href;
}

function pick(body) {
  const out = {};
  for (const k of EDITABLE) if (body[k] !== undefined) out[k] = body[k];
  if (out.menu !== undefined) {
    const list = Array.isArray(out.menu) ? out.menu : String(out.menu).split(',');
    out.menu = [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 12).map((s) => s.slice(0, 40));
  }
  if (out.img) out.img = safeImageUrl(out.img);
  for (const k of ['price', 'lat', 'lng', 'rewardPerReview']) if (out[k] !== undefined) out[k] = Number(out[k]);
  if (out.rewardPerReview !== undefined) out.rewardPerReview = Math.round(out.rewardPerReview * 10) / 10;
  return out;
}

export async function list(req, res) {
  res.json({ venues: (await Venue.find().sort({ createdAt: -1 })).map(venueJson) });
}

export async function getOne(req, res) {
  const v = await Venue.findById(req.params.id).catch(() => null);
  if (!v) throw new HttpError(404, 'Venue not found');
  res.json({ venue: venueJson(v) });
}

// One listing per venue account. The payout wallet is the owner's connected wallet.
export async function createMine(req, res) {
  if (await Venue.exists({ owner: req.user._id })) throw new HttpError(409, 'This account already has a listing');
  const v = await Venue.create({ ...pick(req.body), owner: req.user._id, nimAddress: req.user.nimAddress });
  res.status(201).json({ venue: venueJson(v) });
}

export async function updateMine(req, res) {
  const v = await Venue.findOne({ owner: req.user._id });
  if (!v) throw new HttpError(404, 'List your venue first');
  v.set(pick(req.body));
  await v.save();
  res.json({ venue: venueJson(v) });
}
