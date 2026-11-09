import { Venue } from '../models/Venue.js';
import { HttpError } from '../middleware/error.js';
import { venueJson } from '../views/serialize.js';
import { normalizeImageUrl } from '../../public/src/core/imageurl.js';

const EDITABLE = ['name', 'type', 'cuisine', 'price', 'address', 'lat', 'lng', 'hours', 'img', 'menu', 'rewardPerReview', 'payoutCooldownDays'];

// The link is rendered inside a CSS url('…') in every guest's browser. normalizeImageUrl percent-encodes quotes and
// brackets, unwraps Google image-search and Drive links, and refuses anything that is not a plain https picture link.
function safeImageUrl(raw) {
  const r = normalizeImageUrl(raw);
  if (r.error) throw new HttpError(400, r.error);
  return r.url;
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
  if (out.payoutCooldownDays !== undefined) {
    out.payoutCooldownDays = Math.round(Number(out.payoutCooldownDays));
    if (!(out.payoutCooldownDays >= 0 && out.payoutCooldownDays <= 30)) throw new HttpError(400, 'Cooldown is 0 (instant) to 30 days');
  }
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
