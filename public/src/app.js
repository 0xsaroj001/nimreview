import { explore } from './views/explore.js';
import { venueView } from './views/venue.js';
import { writeView, resetWriteDraft } from './views/write.js';
import { walletView } from './views/wallet.js';
import { perksView } from './views/perks.js';
import { meView } from './views/me.js';
import { ownerOverview, ownerReviews, ownerCodes, ownerPayouts, ownerSettings } from './views/owner.js';
import { trustView } from './views/trust.js';
import { authView } from './views/auth.js';
import { listingView } from './views/listing.js';
import { closeSheet, icon, toast, esc } from './ui.js';
import { wallet, initStore, state } from './store.js';
import { getSession, signOut } from './session.js';
import { formatNim } from './core/nimiq.js';

// Reviewers and owners get separate route tables, so neither can open the other's screens.
const CUSTOMER = [
  [/^\/?$/, () => explore()],
  [/^\/venue\/([\w-]+)$/, (m) => venueView({ id: m[1] })],
  [/^\/write(?:\/([\w-]+))?$/, (m, entering) => writeView({ id: m[1], entering })],
  [/^\/wallet$/, () => walletView()],
  [/^\/perks$/, () => perksView()],
  [/^\/me$/, () => meView()],
  [/^\/trust$/, () => trustView()],
];
const VENUE = [
  [/^\/(owner)?$/, () => ownerOverview()],
  [/^\/owner\/reviews$/, () => ownerReviews()],
  [/^\/owner\/codes$/, () => ownerCodes()],
  [/^\/owner\/payouts$/, () => ownerPayouts()],
  [/^\/owner\/settings$/, () => ownerSettings()],
  [/^\/listing$/, () => listingView()],
  [/^\/trust$/, () => trustView()],
];

const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const vtabbar = document.getElementById('vtabbar');
const siteBal = document.getElementById('site-bal');
let lastPath = null;
let ready = false;

function pickView(path, changed) {
  const s = getSession();
  if (!s) return authView();
  if (s.role === 'venue' && s.mode === 'live' && !s.hasVenue) return listingView();
  for (const [re, fn] of s.role === 'venue' ? VENUE : CUSTOMER) {
    const m = path.match(re);
    if (m) return fn(m, changed);
  }
  return s.role === 'venue' ? ownerOverview() : explore();
}

// owners see how many cash-out requests are waiting for them
function paintPayoutBadge(s) {
  const n = s?.role === 'venue' ? state.ledger.filter((e) => e.type === 'cashout' && e.status === 'requested').length : 0;
  for (const id of ['payout-badge', 'payout-badge-m']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.hidden = !n;
    el.textContent = n > 9 ? '9+' : String(n);
  }
}

function render() {
  if (!ready) return;
  const s = getSession();
  const path = location.hash.replace(/^#/, '') || '/';
  const changed = path !== lastPath;
  // Leaving the review form throws the half-written review away: coming back later starts clean.
  if (changed && lastPath?.startsWith('/write') && !path.startsWith('/write')) resetWriteDraft();
  const view = pickView(path, changed);

  document.body.dataset.role = s?.role || 'none';
  document.body.dataset.mode = s?.mode || 'none';
  const keep = changed ? 0 : scrollY;
  viewEl.innerHTML = view.html;
  viewEl.className = `${changed ? 'view-enter' : ''} ${view.tabs === false ? 'no-tabs' : ''}`;
  tabbar.classList.toggle('hidden', !(view.tabs !== false && s?.role === 'customer'));
  vtabbar.classList.toggle('hidden', !(view.tabs !== false && s?.role === 'venue'));
  document.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === view.tab));
  if (s?.role === 'customer') siteBal.innerHTML = `${icon('hex')}${formatNim(wallet().claimable)}`;
  paintPayoutBadge(s);
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

// every log out button, wherever a view renders one
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-logout]')) signOut();
});
addEventListener('hashchange', render);
addEventListener('nr:refresh', render);
addEventListener('nr:session', boot);
boot();
