// Reads the Nimiq chain so the server never has to trust "I paid" claims. Uses a public JSON-RPC server
// (default rpc.nimiqwatch.com, which nimiq.dev lists as an OPEN server: no uptime promise, "not suitable for
// production", requests may be logged). Point NIMIQ_RPC_URL at your own node or a provider before real money flows.
// Response shape checked against the live server on 2026-11-08 (getTransactionByHash: from, to, value in Luna,
// confirmations, executionResult).
import { HttpError } from '../middleware/error.js';
import { LUNA_PER_NIM, normalizeAddress } from '../../public/src/core/nimiq.js';

const rpcUrl = () => process.env.NIMIQ_RPC_URL || 'https://rpc.nimiqwatch.com';

export const lunaOf = (nim) => Math.round(Number(nim) * LUNA_PER_NIM);

// -> normalised transaction, or null when the chain does not know that hash (yet)
export async function getTransaction(hash) {
  let json;
  try {
    const res = await fetch(rpcUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'getTransactionByHash', params: [hash], id: 1 }),
      signal: AbortSignal.timeout(8000),
    });
    json = await res.json();
  } catch {
    throw new HttpError(502, 'Could not reach the Nimiq network. Try again in a moment.');
  }
  if (json?.error) {
    if (/not found/i.test(String(json.error.data ?? json.error.message))) return null;
    throw new HttpError(502, 'The Nimiq network lookup failed. Try again in a moment.');
  }
  const t = json?.result?.data;
  if (!t || typeof t !== 'object') throw new HttpError(502, 'The Nimiq network lookup failed. Try again in a moment.');
  return {
    hash: String(t.hash),
    from: normalizeAddress(t.from),
    to: normalizeAddress(t.to),
    valueLuna: Number(t.value),
    confirmations: Number(t.confirmations ?? 0),
    executionResult: t.executionResult,
  };
}

// Does this transaction pay `amountNim` (or more) from `from` to `to`, successfully and already in a block?
export function checkPayment(tx, { from, to, amountNim }) {
  if (!tx) return { ok: false, retry: true, reason: 'The Nimiq network does not show that transaction yet. Wait a few seconds and try again.' };
  if (tx.from !== normalizeAddress(from)) return { ok: false, reason: 'That payment was not sent from your venue wallet.' };
  if (tx.to !== normalizeAddress(to)) return { ok: false, reason: "That payment did not go to the guest's wallet." };
  if (!(tx.valueLuna >= lunaOf(amountNim))) return { ok: false, reason: `That payment is less than ${amountNim} NIM.` };
  if (tx.executionResult === false) return { ok: false, reason: 'That transaction failed on the network.' };
  if (!(tx.confirmations >= 1)) return { ok: false, retry: true, reason: 'The payment is not confirmed yet. Wait a few seconds and try again.' };
  return { ok: true };
}
