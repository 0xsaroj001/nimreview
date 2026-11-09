import { state, venue, wallet, walletByVenue, claimPerk } from '../store.js';
import { esc, icon, openSheet, toast, copy, timeAgo, bgImg } from '../ui.js';
import { formatNim } from '../core/nimiq.js';
import { isDemo } from '../session.js';

export function perksView() {
  const b = wallet();
  const by = walletByVenue();
  const mine = state.myPerks.map((m) => ({ m, p: state.perks.find((x) => x.id === m.perkId) }));
  const html = `
  <div class="page">
    <div class="titlebar"><span></span><h1>Perks</h1><a class="nim-chip" href="#/wallet" aria-label="Claimable balance">${icon('hex')}${formatNim(b.claimable)}</a></div>
    <div class="page-head"><h2>Spend NIM where you <em>eat and stay.</em></h2><p>Spend the NIM a place owes you at that same place. Claiming one never touches your reviews or your rating.</p></div>
    ${mine.length ? `<section class="section"><div class="section-h"><h2>My perks</h2><span class="eyebrow">${mine.length} claimed</span></div><div class="mine">
      ${mine.map(({ m, p }) => `<button class="ticket ${m.used ? 'used' : ''}" data-show="${m.id}"><span class="l">${icon('gift')}</span><span class="r"><b class="ellipsis">${esc(p.title)}</b><span class="tiny muted">${esc(venue(p.venueId).name)} · ${m.used ? 'used' : 'ready to use'}</span><br><code>${esc(m.code)}</code></span></button>`).join('')}
    </div></section>` : ''}
    <section class="section">
      <div class="section-h"><h2>Available <em>now</em></h2>${isDemo() ? '<span class="pill demo">Demo perks</span>' : ''}</div>
      ${state.perks.length ? '' : `<div class="card empty" style="margin:0 var(--gutter)">${icon('gift')}No perks yet. Venues will be able to offer perks you can spend NIM on.</div>`}
      <div class="perk-grid">
        ${state.perks.map((p) => {
          const v = venue(p.venueId);
          const have = by[p.venueId]?.claimable ?? 0;
          const can = have >= p.cost;
          return `<article class="perk"><div class="media" style="${bgImg(v.img, 500)}"></div><div class="tear"></div>
            <div class="body"><span class="venue ellipsis">${esc(v.name)}</span><h3>${esc(p.title)}</h3><p>${esc(p.terms)}</p>
            <span class="tiny muted">You have ${formatNim(have)} NIM from here</span>
            <button class="btn ${can ? 'gold' : 'soft'}" data-claim="${p.id}" ${can ? '' : 'disabled'}><span class="nim">${icon('hex')}${p.cost}</span></button></div></article>`;
        }).join('')}
      </div>
    </section>
  </div>`;

  function mount(root) {
    root.querySelectorAll('[data-claim]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const p = state.perks.find((x) => x.id === btn.dataset.claim);
        const v = venue(p.venueId);
        openSheet(
          `<h2>${esc(p.title)}</h2><p class="lead">${esc(v.name)} · ${esc(p.terms)}</p>
           <div class="stack"><div class="verdict warn">${icon('info')}<span>${p.cost} NIM leaves what ${esc(v.name)} owes you. Show the code at the counter; the venue marks it used.</span></div>
           <button class="btn block gold" data-ok>Claim for ${p.cost} NIM</button><button class="btn block soft" data-close>Cancel</button></div>`,
          (panel) =>
            panel.querySelector('[data-ok]').addEventListener('click', () => {
              const r = claimPerk(p.id);
              if (!r.ok) return toast(esc(r.reason)); // plain text that may contain a place name
              dispatchEvent(new Event('nr:refresh'));
              setTimeout(() => showCode(r.mine.id), 30);
            }),
        );
      }),
    );
    root.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => showCode(b.dataset.show)));
  }
  return { html, mount, tab: 'perks' };
}

function showCode(mineId) {
  const m = state.myPerks.find((x) => x.id === mineId);
  const p = state.perks.find((x) => x.id === m.perkId);
  openSheet(
    `<h2>${esc(p.title)}</h2><p class="lead">${esc(venue(p.venueId).name)} · claimed ${timeAgo(m.claimedAt)}</p>
     <div class="coupon-big"><span class="tiny muted">${m.used ? 'Already used' : 'Show this at the counter'}</span><code>${esc(m.code)}</code><span class="small muted">${esc(p.terms)}</span></div>
     <div class="stack"><button class="btn block" data-copy>${icon('copy')}Copy code</button><button class="btn block soft" data-close>Done</button></div>`,
    (panel) => panel.querySelector('[data-copy]').addEventListener('click', () => copy(m.code)),
  );
}
