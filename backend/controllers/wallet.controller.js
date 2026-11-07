import { LedgerEntry } from '../models/LedgerEntry.js';
import { Venue } from '../models/Venue.js';
import { isValidAddress, formatAddress } from '../../public/src/core/nimiq.js';
import { balances } from '../../public/src/core/genuine.js';
import { HttpError } from '../middleware/error.js';
import { ledgerJson } from '../views/serialize.js';

export async function settle(userId) {
  await LedgerEntry.updateMany({ user: userId, type: 'reward', status: 'pending', releaseAt: { $lte: new Date() } }, { status: 'claimable' });
}

// Stores the address the user picked in the Nimiq Hub (or typed). Checksum-validated; ownership is not proven
// (that needs a signed message, GAPS.md G16). A venue's payout wallet follows its owner's wallet.
export async function connectWallet(req, res) {
  const address = String(req.body.address ?? '');
  if (!isValidAddress(address)) throw new HttpError(400, 'Not a valid Nimiq address (format or checksum)');
  req.user.nimAddress = formatAddress(address);
  req.user.walletLabel = String(req.body.label ?? '').slice(0, 40);
  await req.user.save();
  if (req.user.role === 'venue') await Venue.updateOne({ owner: req.user._id }, { nimAddress: req.user.nimAddress });
  res.json({ nimAddress: req.user.nimAddress, walletLabel: req.user.walletLabel });
}

// Records a payout request to the connected wallet. No NIM is sent: there is no treasury signer yet (G4).
export async function cashOut(req, res) {
  const amount = Math.round(Number(req.body.amount) * 10) / 10;
  if (!(amount > 0)) throw new HttpError(400, 'Enter an amount');
  await settle(req.user._id);
  const entries = (await LedgerEntry.find({ user: req.user._id })).map(ledgerJson);
  const { claimable } = balances(entries);
  if (amount > claimable) throw new HttpError(400, 'Amount exceeds claimable balance');
  const entry = await LedgerEntry.create({
    user: req.user._id,
    type: 'cashout',
    label: `Payout request to ${req.user.nimAddress.slice(0, 9)}…`,
    amount,
    status: 'requested',
    toAddress: req.user.nimAddress,
  });
  res.status(201).json({ entry: ledgerJson(entry) });
}
