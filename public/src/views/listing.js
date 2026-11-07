// Live venue accounts list their place here (first time) and edit it later.
import { myVenue, saveListing } from '../store.js';
import { signOut } from '../session.js';
import { esc, icon, toast, TYPE_LABEL } from '../ui.js';

export function listingView() {
  const v = myVenue();
  const isNew = !v;
  const f = v || { type: 'restaurant', price: 2, rewardPerReview: 10, menu: [] };
  const input = (name, ph, extra = '') => `<label class="field"><input class="plain" name="${name}" placeholder="${ph}" value="${esc(f[name] ?? '')}" ${extra}></label>`;
  const html = `
  <div class="page write-col">
    <div class="titlebar">${isNew ? '<span></span>' : `<a class="icon-btn" href="#/owner" aria-label="Back">${icon('back')}</a>`}<h1>${isNew ? 'List your place' : 'Edit listing'}</h1><button class="icon-btn" data-logout aria-label="Sign out">${icon('x')}</button></div>
    <div class="page-head"><h2>${isNew ? 'Put your place on <em>NimReview.</em>' : 'Your <em>listing.</em>'}</h2><p>Guests find you by name, dish and distance. Every field shows on your public page.</p></div>
    <form class="card listing-form" id="listing" novalidate>
      <div class="chips" style="padding:0">${Object.entries(TYPE_LABEL).map(([k, l]) => `<label class="chip ${f.type === k ? 'on' : ''}"><input type="radio" name="type" value="${k}" class="sr-only" ${f.type === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
      ${input('name', 'Name, e.g. Lumen Bistro', 'maxlength="80" required')}
      ${input('cuisine', 'Cuisine or kind, e.g. South Indian, boutique hotel', 'maxlength="60"')}
      ${input('address', 'Street address', 'maxlength="140" required')}
      <div class="form-2">
        ${input('lat', 'Latitude', 'inputmode="decimal"')}
        ${input('lng', 'Longitude', 'inputmode="decimal"')}
      </div>
      <button class="btn sm soft" type="button" data-locate>${icon('crosshair')}Use my current location</button>
      <div class="form-2">
        ${input('hours', 'Hours, e.g. 12:00 – 23:00', 'maxlength="40"')}
        <label class="field"><select name="price" class="plain">${[1, 2, 3].map((n) => `<option value="${n}" ${Number(f.price) === n ? 'selected' : ''}>${'₹'.repeat(n)} price</option>`).join('')}</select></label>
      </div>
      ${input('img', 'Photo link (https://…)', 'inputmode="url"')}
      <label class="field"><input class="plain" name="menu" placeholder="Signature items, comma separated" value="${esc((f.menu || []).join(', '))}"></label>
      <label class="field"><span class="muted" style="font-weight:800">${icon('hex')}</span><input class="plain" name="rewardPerReview" type="number" min="0" max="1000" step="0.5" value="${esc(f.rewardPerReview)}"><span class="small muted">NIM per review, max</span></label>
      <p class="tiny muted">A perfect review earns the full amount; lower genuineness scores earn proportionally less. Stars never change it. 0 means you don't fund rewards.</p>
      <div id="listing-err"></div>
      <button class="btn block gold" type="submit">${isNew ? 'Publish listing' : 'Save changes'}</button>
    </form>
  </div>`;

  function mount(root) {
    const form = root.querySelector('#listing');
    root.querySelector('[data-logout]').addEventListener('click', signOut);
    form.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => form.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.contains(form.querySelector('input[name=type]:checked'))))));
    root.querySelector('[data-locate]').addEventListener('click', () => {
      if (!navigator.geolocation) return toast('Location is not available in this browser');
      navigator.geolocation.getCurrentPosition(
        (p) => {
          form.lat.value = p.coords.latitude.toFixed(6);
          form.lng.value = p.coords.longitude.toFixed(6);
        },
        () => toast('Location unavailable, type the coordinates'),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const err = root.querySelector('#listing-err');
      const show = (m) => (err.innerHTML = `<div class="verdict bad">${icon('alert')}<span>${esc(m)}</span></div>`);
      if (!d.name?.trim() || !d.address?.trim()) return show('Name and address are required');
      if (!Number.isFinite(Number(d.lat)) || !Number.isFinite(Number(d.lng)) || d.lat === '' || d.lng === '') return show('Add the coordinates, or use your current location');
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await saveListing({ ...d, menu: d.menu }, isNew);
        toast(`${icon('check')} ${isNew ? 'Listing published' : 'Listing saved'}`);
        location.hash = '#/owner';
        dispatchEvent(new Event('nr:refresh'));
      } catch (x) {
        show(x.message);
        btn.disabled = false;
      }
    });
  }
  return { html, mount, tabs: false };
}
