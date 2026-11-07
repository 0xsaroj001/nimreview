// Live accounts must connect a Nimiq wallet before anything else. The Hub's chooseAddress() returns an address
// the user picks from their own Nimiq account; it does not prove ownership (that needs signMessage, GAPS.md G16).
import { connectWallet, me } from '../store.js';
import { getSession, signOut } from '../session.js';
import { esc, icon, toast } from '../ui.js';
import { isValidAddress, formatAddress } from '../core/nimiq.js';

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

export function connectView() {
  const s = getSession();
  const venue = s.role === 'venue';
  const current = me()?.nimAddress || s.nimAddress;
  const html = `
  <div class="page write-col">
    <div class="titlebar">${current ? `<a class="icon-btn" href="#/${venue ? 'owner' : 'wallet'}" aria-label="Back">${icon('back')}</a>` : '<span></span>'}<h1>Wallet</h1><button class="icon-btn" data-logout aria-label="Sign out">${icon('x')}</button></div>
    <div class="page-head"><h2>Connect your <em>Nimiq wallet.</em></h2>
      <p>${venue ? 'Your listing shows this wallet, and guests who pay in NIM pay you here.' : 'Review rewards and payouts go to this wallet.'} Live accounts need one before they can continue.</p></div>
    <section class="card connect-card">
      ${current ? `<div class="verdict ok">${icon('check')}<span>Connected: <code>${esc(formatAddress(current))}</code></span></div>` : ''}
      <button class="btn block gold" data-hub>${icon('wallet')}Connect with Nimiq Hub</button>
      <p class="tiny muted">Opens hub.nimiq.com in a pop-up. Pick an address; nothing is signed or sent.</p>
      <div class="divider"></div>
      <span class="eyebrow">Or paste an address</span>
      <label class="field">${icon('hex')}<input id="addr" placeholder="NQ.. .... ...." autocomplete="off" spellcheck="false" style="font-size:13px"></label>
      <div id="addr-state"></div>
      <button class="btn block" data-save disabled>Use this address</button>
    </section>
  </div>`;

  function mount(root) {
    const done = () => {
      toast(`${icon('check')} Wallet connected`);
      location.hash = venue ? '#/owner' : '#/';
      dispatchEvent(new Event('nr:refresh'));
    };
    const save = async (address, label) => {
      try {
        await connectWallet(address, label);
        done();
      } catch (x) {
        toast(esc(x.message));
      }
    };
    root.querySelector('[data-logout]').addEventListener('click', signOut);
    root.querySelector('[data-hub]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try {
        const HubApi = await loadHub();
        const hub = new HubApi('https://hub.nimiq.com');
        const r = await hub.chooseAddress({ appName: 'NimReview' });
        await save(r.address, r.label);
      } catch (x) {
        toast(esc(x?.message || 'No address selected'));
      } finally {
        e.target.closest('button').disabled = false;
      }
    });
    const addr = root.querySelector('#addr');
    const st = root.querySelector('#addr-state');
    const btn = root.querySelector('[data-save]');
    addr.addEventListener('input', () => {
      const ok = isValidAddress(addr.value);
      st.innerHTML = addr.value.trim() ? `<div class="verdict ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'alert')}<span>${ok ? 'Valid Nimiq address' : 'Not a valid Nimiq address (format or checksum)'}</span></div>` : '';
      btn.disabled = !ok;
    });
    btn.addEventListener('click', () => save(addr.value, ''));
  }
  return { html, mount, tabs: false };
}
