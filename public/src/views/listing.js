// Live venue accounts list their place here (first time) and edit it later.
import { myVenue, saveListing } from '../store.js';
import { esc, icon, toast, TYPE_LABEL, logoutBtn, bgImg } from '../ui.js';
import { normalizeImageUrl } from '../core/imageurl.js';

export function listingView() {
  const v = myVenue();
  const isNew = !v;
  const f = v || { type: 'restaurant', price: 2, menu: [] };
  const input = (name, ph, extra = '') => `<label class="field"><input class="plain" name="${name}" placeholder="${ph}" value="${esc(f[name] ?? '')}" ${extra}></label>`;
  const html = `
  <div class="page write-col">
    <div class="titlebar">${isNew ? '<span></span>' : `<a class="icon-btn" href="#/owner/settings" aria-label="Back">${icon('back')}</a>`}<h1>${isNew ? 'List your place' : 'Edit listing'}</h1>${logoutBtn()}</div>
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
      ${input('img', 'Photo link (https://…)', 'inputmode="url" autocomplete="off" spellcheck="false"')}
      <div id="img-check" class="img-check" aria-live="polite"></div>
      <label class="field"><input class="plain" name="menu" placeholder="Signature items, comma separated" value="${esc((f.menu || []).join(', '))}"></label>
      <p class="tiny muted">${isNew ? 'Next you choose what you pay per review and when guests can cash out.' : 'What you pay and when guests can cash out is under Settings.'}</p>
      <div id="listing-err"></div>
      <button class="btn block gold" type="submit">${isNew ? 'Publish listing' : 'Save changes'}</button>
    </form>
  </div>`;

  function mount(root) {
    const form = root.querySelector('#listing');
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
    // Check the photo link as it is pasted: unwrap Google links, and try to load the picture so a dead link is
    // caught here instead of showing a broken image to every guest.
    const imgEl = form.img;
    const chk = root.querySelector('#img-check');
    let imgState = 'empty'; // empty | checking | ok | bad
    let timer;
    const checkImage = () => {
      clearTimeout(timer);
      const r = normalizeImageUrl(imgEl.value);
      if (r.error) {
        imgState = 'bad';
        chk.innerHTML = `<div class="verdict bad">${icon('alert')}<span>${esc(r.error)}</span></div>`;
        return;
      }
      if (!r.url) {
        imgState = 'empty';
        chk.innerHTML = '';
        return;
      }
      imgState = 'checking';
      chk.innerHTML = `<div class="verdict warn">${icon('clock')}<span>Checking the picture…</span></div>`;
      const probe = new Image();
      probe.referrerPolicy = 'no-referrer';
      const stale = () => normalizeImageUrl(imgEl.value).url !== r.url;
      probe.onload = () => {
        if (stale()) return;
        imgState = 'ok';
        chk.innerHTML = `<div class="verdict ok">${icon('check')}<span>Picture loads.${r.url !== imgEl.value.trim() ? ' We will use the picture address inside that link.' : ''}${r.note ? ` ${esc(r.note)}.` : ''}</span></div><div class="img-prev" style="${bgImg(r.url, 600)}"></div>`;
      };
      probe.onerror = () => {
        if (stale()) return;
        imgState = 'bad';
        chk.innerHTML = `<div class="verdict bad">${icon('alert')}<span>That link did not give a picture. Some sites stop other websites from showing their pictures. Right-click the picture, choose "Copy image address", and paste that.</span></div>`;
      };
      timer = setTimeout(() => {
        if (imgState === 'checking' && !stale()) probe.onerror();
      }, 8000);
      probe.src = r.url;
    };
    imgEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(checkImage, 350);
    });
    if (imgEl.value.trim()) checkImage();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(form));
      const err = root.querySelector('#listing-err');
      const show = (m) => (err.innerHTML = `<div class="verdict bad">${icon('alert')}<span>${esc(m)}</span></div>`);
      if (!d.name?.trim() || !d.address?.trim()) return show('Name and address are required');
      if (!Number.isFinite(Number(d.lat)) || !Number.isFinite(Number(d.lng)) || d.lat === '' || d.lng === '') return show('Add the coordinates, or use your current location');
      if (imgState === 'bad') return show('Fix the photo link first, or clear it to use a stock photo');
      if (imgState === 'checking') return show('Still checking the picture, one moment');
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const img = normalizeImageUrl(d.img).url;
        await saveListing({ ...d, img, menu: d.menu }, isNew);
        toast(`${icon('check')} ${isNew ? 'Listing published. Now set what you pay.' : 'Listing saved'}`);
        location.hash = '#/owner/settings';
        dispatchEvent(new Event('nr:refresh'));
      } catch (x) {
        show(x.message);
        btn.disabled = false;
      }
    });
  }
  return { html, mount, tabs: false };
}
