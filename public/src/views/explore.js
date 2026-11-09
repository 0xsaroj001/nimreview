import { state, rating, distanceKm, wallet, setHere } from '../store.js';
import { esc, icon, stars, km, TYPE_LABEL, priceLevel, toast, bgImg } from '../ui.js';
import { venueReward } from '../core/genuine.js';
import { isDemo } from '../session.js';
import { DEMO_CENTER } from '../data/seed.js';
import { formatNim } from '../core/nimiq.js';

const ui = { q: '', cat: 'all' };
const CATS = [
  ['all', 'Everything', 'sparkle'],
  ['restaurant', 'Restaurants', 'utensils'],
  ['cafe', 'Cafés', 'coffee'],
  ['hotel', 'Hotels', 'bed'],
];

function filtered() {
  const q = ui.q.trim().toLowerCase();
  return state.venues
    .filter((v) => ui.cat === 'all' || v.type === ui.cat)
    .filter((v) => !q || [v.name, v.cuisine, v.address, ...v.menu].some((s) => s.toLowerCase().includes(q)))
    .map((v) => ({ v, r: rating(v.id), d: distanceKm(v) }))
    .sort((a, b) => a.d - b.d);
}

const pcard = ({ v, r, d }) => `
  <a class="pcard" href="#/venue/${v.id}" style="${bgImg(v.img)}">
    <span class="score"><b>${r.avg.toFixed(1)}</b><span>${r.verified} PROVEN</span></span>
    <div class="cap">
      <div class="kind">${TYPE_LABEL[v.type]} · ${km(d)}</div>
      <h3>${esc(v.name)}</h3>
      <span class="earn">${icon('hex')}Earn up to ${venueReward(v)} NIM</span>
    </div>
  </a>`;

const lrow = ({ v, r, d }, i) => `
  <a class="lrow" href="#/venue/${v.id}">
    <span class="num">${String(i + 1).padStart(2, '0')}</span>
    <div class="thumb" style="${bgImg(v.img, 300)}"></div>
    <div class="grow">
      <h3 class="ellipsis">${esc(v.name)}</h3>
      <div class="meta ellipsis">${esc(v.cuisine)} · ${priceLevel(v.price)}</div>
      <div class="sc">${stars(r.avg, 'sm')}<b>${r.avg.toFixed(1)}</b><span class="muted">· ${r.verified} proven</span></div>
    </div>
    <span class="dist">${km(d)}</span>
  </a>`;

function listHtml() {
  const items = filtered();
  if (!state.venues.length) return `<div class="empty">${icon('store')}No places listed yet. Restaurants, cafés and hotels list themselves from a venue account.</div>`;
  if (!items.length) return `<div class="empty">${icon('search')}No places match “${esc(ui.q)}”.</div>`;
  return items.map(lrow).join('');
}

export function explore() {
  const bal = wallet();
  const proven = state.reviews.filter((r) => r.status === 'verified').length;
  const html = `
  <div class="page explore">
    <header class="topbar m-only">
      <a class="logo" href="#/">${icon('hex')}<span>Nim<em>review</em></span></a>
      <a class="nim-chip" href="#/wallet" aria-label="Wallet balance">${icon('hex')}${formatNim(bal.claimable)}</a>
    </header>
    <section class="hero">
      <div class="hero-copy">
        <button class="loc" data-act="locate" aria-label="Change location">${icon('pin')}${esc(state.here.label)}${icon('chevron-down', 'chev')}</button>
        <h1>Eat where people <em>actually</em> went.</h1>
        <p>Every rating is weighted by proof of visit. Write something useful about a place you went, earn NIM.</p>
        <div class="hero-stats">
          <div><b>${state.venues.length}</b>places nearby</div>
          <div><b>${proven}</b>proven visits</div>
          <div><b>${Math.max(0, ...state.venues.map(venueReward))}</b>NIM per review, max</div>
        </div>
      </div>
      <label class="search">${icon('search')}<input id="q" type="search" enterkeyhint="search" placeholder="Dosa, rooftop, cold brew…" value="${esc(ui.q)}" autocomplete="off" aria-label="Search places and dishes"><span class="go" aria-hidden="true">${icon('sliders')}</span></label>
    </section>
    <div class="chips cats" role="tablist">
      ${CATS.map(([id, label, ic]) => `<button class="chip ${ui.cat === id ? 'on' : ''}" data-cat="${id}" role="tab" aria-selected="${ui.cat === id}">${icon(ic)}${label}</button>`).join('')}
    </div>
    <section class="section" id="picks" ${ui.q ? 'hidden' : ''}>
      <div class="section-h"><h2>Proven <em>picks</em> nearby</h2>${isDemo() ? '<span class="pill demo">Demo data</span>' : ''}</div>
      <div class="rail" id="rail">${filtered().slice(0, 4).map(pcard).join('')}</div>
    </section>
    <section class="section">
      <div class="section-h"><h2 id="list-title">${ui.q ? 'Results' : 'The full list'}</h2><span class="eyebrow">by distance</span></div>
      <div class="list" id="list">${listHtml()}</div>
    </section>
    <a class="promo" href="#/trust">
      <span class="eyebrow">Why trust these ratings</span>
      <b>Stars never change what a reviewer earns.</b>
      <span class="sub">Only proven visits earn, copies are refused and each place sets how soon you can cash out.</span>
      <span class="link">How it works</span>
    </a>
  </div>`;

  function mount(root) {
    const input = root.querySelector('#q');
    input.addEventListener('input', () => {
      ui.q = input.value;
      root.querySelector('#list').innerHTML = listHtml();
      root.querySelector('#picks').hidden = !!ui.q;
      root.querySelector('#list-title').textContent = ui.q ? 'Results' : 'The full list';
    });
    root.querySelectorAll('[data-cat]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.cat = b.dataset.cat;
        root.querySelectorAll('[data-cat]').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-selected', x === b);
        });
        root.querySelector('#list').innerHTML = listHtml();
        root.querySelector('#rail').innerHTML = filtered().slice(0, 4).map(pcard).join('');
      }),
    );
    root.querySelector('[data-act="locate"]').addEventListener('click', () => {
      if (state.here.real) {
        setHere({ ...DEMO_CENTER, real: false });
        toast(`${icon('pin')} Back to the demo area`);
        dispatchEvent(new Event('nr:refresh'));
        return;
      }
      if (!navigator.geolocation) return toast('Location is not available in this browser');
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setHere({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your location', real: true });
          toast(`${icon('crosshair')} Using your location.${isDemo() ? ' Demo venues are in Bengaluru.' : ''}`);
          dispatchEvent(new Event('nr:refresh'));
        },
        () => toast('Location permission denied, staying in the demo area'),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }
  return { html, mount, tab: 'explore' };
}
