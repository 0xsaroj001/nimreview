// Nimiq Pay runs this site as a Mini App and injects two objects into the page: `window.nimiqPay` (host info,
// present before page scripts run) and `window.nimiq` (the wallet provider, may arrive a moment later).
// Read from @nimiq/mini-app-sdk 0.2.5 (dist/index.js): its init() only waits for window.nimiq and wraps it, so
// the provider is called directly here instead of adding the package. Docs: https://nimiq.dev/mini-apps
//   sign(message)  -> { publicKey, signature } (hex). Asks the user; the server checks it (backend/utils/wallet-sig.js).
//   sendBasicTransaction({ recipient, value }) -> transaction hash. Asks the user; value is in Luna.
// Both reject with { type, code, message }; code 4001 / PERMISSION_DENIED means the user said no.

export const inNimiqPay = () => typeof window !== 'undefined' && !!(window.nimiqPay || window.nimiq);
export const nimiqPayNetwork = () => window.nimiqPay?.network; // 'mainnet' | 'testnet' | undefined

// Deep link from the Mini Apps docs: opens this site inside Nimiq Pay (unlisted URLs show a warning first).
export const openInNimiqPayUrl = () => `https://nimpay.app/miniapps/open/${location.host}`;

function provider(timeout) {
  if (window.nimiq) return Promise.resolve(window.nimiq);
  return new Promise((ok, fail) => {
    const started = Date.now();
    const t = setInterval(() => {
      if (window.nimiq) {
        clearInterval(t);
        ok(window.nimiq);
      } else if (Date.now() - started > timeout) {
        clearInterval(t);
        fail(new Error('Nimiq Pay did not provide a wallet. Update Nimiq Pay and try again.'));
      }
    }, 50);
  });
}

function friendly(x) {
  if (x?.code === 4001 || x?.type === 'PERMISSION_DENIED') return Object.assign(new Error('You declined in Nimiq Pay'), { cancelled: true });
  return new Error(x?.message || 'Nimiq Pay could not complete that');
}

async function ask(fn, timeout) {
  const p = await provider(timeout);
  let out;
  try {
    out = await fn(p);
  } catch (x) {
    throw friendly(x);
  }
  // older hosts resolve with { error: { type, message } } instead of rejecting
  if (out && typeof out === 'object' && out.error) throw friendly(out.error);
  return out;
}

// Proves the user controls their Nimiq Pay wallet by signing our one-time message.
export async function nimiqPaySign(message, { timeout = 5000 } = {}) {
  const out = await ask((p) => p.sign(message), timeout);
  if (!out?.publicKey || !out?.signature) throw new Error('Nimiq Pay did not return a signature');
  return { publicKey: out.publicKey, signature: out.signature };
}

// Sends NIM from the user's Nimiq Pay wallet (Nimiq Pay shows its own confirmation). Resolves with the hash.
export async function nimiqPaySend({ recipient, luna }, { timeout = 5000 } = {}) {
  const out = await ask((p) => p.sendBasicTransaction({ recipient, value: luna }), timeout);
  const hash = typeof out === 'string' ? out : out?.hash;
  if (!/^[0-9a-f]{64}$/i.test(hash || '')) throw new Error('Nimiq Pay did not return a transaction hash');
  return hash.toLowerCase();
}
