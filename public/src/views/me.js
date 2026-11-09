import { state, me, wallet, venue, resetDemo } from '../store.js';
import { esc, icon, avatar, stars, methodBadge, timeAgo, toast, copy, logoutBtn } from '../ui.js';
import { accountTrust } from '../core/genuine.js';
import { formatNim, shortAddress, formatAddress } from '../core/nimiq.js';
import { resetWriteDraft } from './write.js';
import { isLive } from '../session.js';

export function meView() {
  const u = me();
  const t = accountTrust(u, Date.now());
  const b = wallet();
  const mine = state.reviews.filter((r) => r.authorId === state.meId).sort((a, c) => c.createdAt - a.createdAt);
  const live = isLive();
  const next = t.tier === 'new' ? 6 : t.tier === 'regular' ? 14 : 20;
  const html = `
  <div class="page">
    <div class="titlebar"><span></span><h1>Profile</h1>${logoutBtn()}</div>
    <div class="two-col">
      <div class="col">
        <section class="profile">
          ${avatar(u.name, 72)}
          <div class="grow"><h1>${esc(u.name)}</h1><div class="small muted" style="margin-top:4px">${esc(shortAddress(u.nimAddress))} · member ${t.ageDays} days</div></div>
        </section>
        <div class="stats">
          <div class="stat"><b>${u.reviewCount}</b><span>Reviews</span></div>
          <div class="stat"><b>${u.helpfulVotes}</b><span>Helpful votes</span></div>
          <div class="stat"><b>${formatNim(b.earned, 0)}</b><span>NIM earned</span></div>
        </div>
        <section class="trustbar card">
          <div class="row"><span class="tier ${t.tier}" style="margin:0">${t.tier}</span><b class="grow" style="font-size:14.5px">Account trust ${t.points}/20</b><span class="small muted">cash-out wait set by each place</span></div>
          <div class="track"><i style="width:${(t.points / 20) * 100}%"></i></div>
          <p class="small muted" style="margin-top:10px">${t.tier === 'trusted' ? 'Top tier: the strongest signal a place can see about you.' : `Reach ${next} for the next tier. Trust grows with account age, proven reviews and helpful votes; upheld reports take it away.`}</p>
        </section>
        <section class="section">
          <div class="card menu">
            <a href="#/trust"><span class="ic">${icon('shield')}</span>How reviews stay genuine${icon('chevron-right', 'chev')}</a>
            ${live ? `<button data-copy-addr><span class="ic">${icon('wallet')}</span>Wallet · ${esc(shortAddress(u.nimAddress))}${icon('copy', 'chev')}</button>` : `<button data-reset><span class="ic">${icon('refresh')}</span>Reset demo data${icon('chevron-right', 'chev')}</button>`}
            <button data-logout><span class="ic">${icon('logout')}</span>Log out${icon('chevron-right', 'chev')}</button>
          </div>
        </section>
      </div>
      <div class="col">
        <section class="section">
          <div class="section-h"><h2>My <em>reviews</em></h2><span class="eyebrow">${live ? 'your account' : 'this device'}</span></div>
          <div class="card" style="margin:0 var(--gutter)">
            ${mine.length ? mine.map((r) => `<a class="myrev" href="#/venue/${r.venueId}"><div class="grow"><b class="ellipsis">${esc(venue(r.venueId).name)}</b><div class="row tiny muted" style="gap:6px;margin-top:4px">${stars(r.rating, 'sm')}<span>${timeAgo(r.createdAt)} · score ${r.score}</span></div></div>${methodBadge(r.method)}</a>`).join('')
              : `<div class="empty">${icon('edit')}Reviews you write show up here.${live ? '' : ` Your ${u.reviewCount} earlier ones are counted in the stats.`}</div>`}
          </div>
        </section>
      </div>
    </div>
  </div>`;

  function mount(root) {
    root.querySelector('[data-copy-addr]')?.addEventListener('click', () => copy(formatAddress(u.nimAddress)));
    root.querySelector('[data-reset]')?.addEventListener('click', () => {
      resetDemo();
      resetWriteDraft();
      toast(`${icon('refresh')} Demo data reset`);
      dispatchEvent(new Event('nr:refresh'));
    });
  }
  return { html, mount, tab: 'me' };
}
