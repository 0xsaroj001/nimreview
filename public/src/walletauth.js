// Sign in with a Nimiq wallet: get a one-time message from the server, have the wallet sign it (Nimiq Pay inside
// the app, the Nimiq Hub pop-up elsewhere), send the signature back. The server proves the signature, works out the
// wallet address from it and either signs the person in or asks them to pick reviewer / owner first.
import { api, setSession } from './session.js';
import { nimiqPaySign } from './nimiqpay.js';

const HUB_SRC = 'https://cdn.jsdelivr.net/npm/@nimiq/hub-api@1.10.0/dist/standalone/HubApi.standalone.umd.js';
const HUB_SRI = 'sha256-+SGul9asL86fbSc9VF/yjB+Ibe5K/Bn/AZAJ20jA4E0=';

function loadHub() {
  if (window.HubApi) return Promise.resolve(window.HubApi);
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = HUB_SRC;
    s.integrity = HUB_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = () => (window.HubApi ? ok(window.HubApi) : fail(new Error('Nimiq Hub did not load')));
    s.onerror = () => fail(new Error('Could not load the Nimiq Hub'));
    document.head.append(s);
  });
}

const hex = (bytes) => (typeof bytes === 'string' ? bytes : [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''));

async function hubSign(message) {
  const HubApi = await loadHub();
  const hub = new HubApi('https://hub.nimiq.com');
  const r = await hub.signMessage({ appName: 'NimReview', message });
  return { publicKey: hex(r.signerPublicKey), signature: hex(r.signature) };
}

// -> { needsSignup: true, ticket, address } for a new wallet, otherwise the person is signed in (null)
export async function signInWith(how) {
  const { challenge, message } = await api('/auth/challenge', { method: 'POST' });
  const proof = how === 'pay' ? await nimiqPaySign(message) : await hubSign(message);
  const out = await api('/auth/wallet', { method: 'POST', body: { challenge, ...proof } });
  if (out.needsSignup) return out;
  finish(out);
  return null;
}

export async function createAccount({ ticket, role, name }) {
  finish(await api('/auth/signup', { method: 'POST', body: { ticket, role, name } }));
}

function finish({ token, session }) {
  setSession({ token, ...session });
  dispatchEvent(new Event('nr:session'));
}
