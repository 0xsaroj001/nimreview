import { randomBytes } from 'node:crypto';
import { BillCode } from '../models/BillCode.js';
import { Venue } from '../models/Venue.js';
import { makeReceiptCode, normalizeCode } from '../../public/src/core/genuine.js';
import { HttpError } from '../middleware/error.js';
import { billJson } from '../views/serialize.js';

async function myVenue(user) {
  const v = await Venue.findOne({ owner: user._id });
  if (!v) throw new HttpError(404, 'List your venue first');
  return v;
}

export async function issue(req, res) {
  const venue = await myVenue(req.user);
  const amount = Math.round(Number(req.body.amount));
  if (!(amount >= 1 && amount <= 10_000_000)) throw new HttpError(400, 'Enter the bill amount');
  const label = String(req.body.label ?? '').trim().slice(0, 20);
  // 32^10 possible codes; the unique index on `key` turns a collision into a retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = makeReceiptCode(randomBytes(10));
    try {
      const bill = await BillCode.create({ code, key: normalizeCode(code), venue: venue._id, amount, label });
      return res.status(201).json({ bill: billJson(bill) });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  throw new HttpError(500, 'Could not issue a code, try again');
}

export async function listMine(req, res) {
  const venue = await myVenue(req.user);
  const bills = await BillCode.find({ venue: venue._id }).sort({ issuedAt: -1 }).limit(50);
  res.json({ bills: bills.map(billJson) });
}
