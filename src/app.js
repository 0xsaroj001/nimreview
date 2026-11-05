import { explore } from './views/explore.js';
import { venueView } from './views/venue.js';
import { writeView } from './views/write.js';
import { walletView } from './views/wallet.js';
import { perksView } from './views/perks.js';
import { meView } from './views/me.js';
import { ownerView } from './views/owner.js';
import { trustView } from './views/trust.js';
import { closeSheet, icon } from './ui.js';
import { wallet } from './store.js';
import { formatNim } from './core/nimiq.js';

const routes = [
  [/^\/?$/, () => explore()],
  [/^\/venue\/([\w-]+)$/, (m) => venueView({ id: m[1] })],
  [/^\/write(?:\/([\w-]+))?$/, (m, entering) => writeView({ id: m[1], entering })],
  [/^\/wallet$/, () => walletView()],
  [/^\/perks$/, () => perksView()],
  [/^\/me$/, () => meView()],
  [/^\/owner$/, () => ownerView()],
  [/^\/trust$/, () => trustView()],
];

const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const siteBal = document.getElementById('site-bal');
let lastPath = null;

function render() {
  const path = location.hash.replace(/^#/, '') || '/';
  const changed = path !== lastPath;
  let view = null;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      view = fn(m, changed);
      break;
    }
  }
  if (!view) view = explore();

  const keep = changed ? 0 : scrollY;
  viewEl.innerHTML = view.html;
  viewEl.className = `${changed ? 'view-enter' : ''} ${view.tabs === false ? 'no-tabs' : ''}`;
  tabbar.classList.toggle('hidden', view.tabs === false);
  document.querySelectorAll('[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === view.tab));
  siteBal.innerHTML = `${icon('hex')}${formatNim(wallet().claimable)}`;
  view.mount?.(viewEl);
  scrollTo({ top: keep, behavior: 'instant' });
  if (changed) {
    closeSheet();
    viewEl.focus({ preventScroll: true });
  }
  lastPath = path;
}

addEventListener('hashchange', render);
addEventListener('nr:refresh', render);
render();
