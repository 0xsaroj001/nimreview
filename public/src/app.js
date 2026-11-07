import { explore } from './views/explore.js';
import { venueView } from './views/venue.js';
import { writeView, resetWriteDraft } from './views/write.js';
import { walletView } from './views/wallet.js';
import { perksView } from './views/perks.js';
import { meView } from './views/me.js';
import { ownerView } from './views/owner.js';
import { trustView } from './views/trust.js';
import { authView } from './views/auth.js';
import { connectView } from './views/connect.js';
import { listingView } from './views/listing.js';
import { closeSheet, icon, toast, esc } from './ui.js';
import { wallet, initStore } from './store.js';
import { getSession, signOut } from './session.js';
import { formatNim } from './core/nimiq.js';

// Customers and venues get separate route tables, so neither can open the other's screens.
const CUSTOMER = [
  [/^\/?$/, () => explore()],
  [/^\/venue\/([\w-]+)$/, (m) => venueView({ id: m[1] })],
  [/^\/write(?:\/([\w-]+))?$/, (m, entering) => writeView({ id: m[1], entering })],
  [/^\/wallet$/, () => walletView()],
  [/^\/perks$/, () => perksView()],
  [/^\/me$/, () => meView()],
  [/^\/trust$/, () => trustView()],
  [/^\/connect$/, () => connectView()],
];
const VENUE = [
  [/^\/(owner)?$/, () => ownerView()],
  [/^\/listing$/, () => listingView()],
  [/^\/trust$/, () => trustView()],
  [/^\/connect$/, () => connectView()],
];

const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const siteBal = document.getElementById('site-bal');
let lastPath = null;
let ready = false;

function pickView(path, changed) {
  const s = getSession();
  if (!s) return authView();
  if (s.mode === 'live' && !s.nimAddress) return connectView();
  if (s.role === 'venue' && s.mode === 'live' && !s.hasVenue) return listingView();
  for (const [re, fn] of s.role === 'venue' ? VENUE : CUSTOMER) {
    const m = path.match(re);
    if (m) return fn(m, changed);
  }
  return s.role === 'venue' ? ownerView() : explore();
}

function render() {
  if (!ready) return;
  const s = getSession();
  const path = location.hash.replace(/^#/, '') || '/';
  const changed = path !== lastPath;
  const view = pickView(path, changed);

  document.body.dataset.role = s?.role || 'none';
  document.body.dataset.mode = s?.mode || 'none';
  const keep = changed ? 0 : scrollY;
  viewEl.innerHTML = view.html;
  viewEl.className = `${changed ? 'view-enter' : ''} ${view.tabs === false ? 'no-tabs' : ''}`;
  const tabs = view.tabs !== false && s?.role === 'customer';
  tabbar.classList.toggle('hidden', !tabs);
  document.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === view.tab));
  if (s?.role === 'customer') siteBal.innerHTML = `${icon('hex')}${formatNim(wallet().claimable)}`;
  view.mount?.(viewEl);
  scrollTo({ top: keep, behavior: 'instant' });
  if (changed) {
    closeSheet();
    viewEl.focus({ preventScroll: true });
  }
  lastPath = path;
}

// (re)load data for whoever is signed in, then draw
async function boot() {
  ready = false;
  resetWriteDraft();
  viewEl.innerHTML = `<div class="page"><div class="empty">${icon('hex')}Loading…</div></div>`;
  try {
    await initStore();
  } catch (x) {
    toast(esc(x.message));
    if (getSession()?.mode === 'live') return signOut();
  }
  ready = true;
  lastPath = null;
  render();
}

document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', signOut));
addEventListener('hashchange', render);
addEventListener('nr:refresh', render);
addEventListener('nr:session', boot);
boot();
