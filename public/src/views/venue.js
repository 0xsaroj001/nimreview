import { state, venue, venueReviews, rating, aspectAverages, distanceKm, user, toggleHelpful, flagReview, toggleSaved } from '../store.js';
import { esc, icon, stars, avatar, proofLine, timeAgo, km, TYPE_LABEL, priceLevel, openSheet, closeSheet, toast, bgImg } from '../ui.js';
import { accountTrust, POLICY, venueReward } from '../core/genuine.js';

const filters = { v: 'all' };

export function reviewCard(r, { ownerView = false } = {}) {
  const a = user(r.authorId);
  const tier = accountTrust(a, Date.now()).tier;
  const voted = state.votes.includes(r.id);
  const flagged = state.flags.some((f) => f.reviewId === r.id);
  const mine = r.authorId === state.meId;
  return `
  <article class="review card ${r.status === 'unverified' ? 'unverified' : ''}">
    <div class="who">
      ${avatar(a.name, 44)}
      <div class="grow">
        <b>${esc(a.name)}${mine ? ' (you)' : ''}</b><span class="tier ${tier}">${tier}</span>
        <div class="sub">${stars(r.rating, 'sm')}<span>${timeAgo(r.createdAt)}</span></div>
      </div>
    </div>
    <p class="text">${esc(r.text)}</p>
    ${r.photos?.length ? `<div class="photos">${r.photos.map((p) => `<span style="${bgImg(p)}"></span>`).join('')}</div>` : ''}
    ${r.ownerReply ? `<div class="owner-reply"><b>${icon('store')}Owner replied · ${timeAgo(r.ownerReply.at)}</b>${esc(r.ownerReply.text)}</div>` : ''}
    ${proofLine(r.method)}
    <div class="foot">
      <div class="actions">
        ${ownerView
          ? `${r.ownerReply ? '' : `<button class="act" data-reply="${r.id}">${icon('reply')}Reply</button>`}<button class="act" data-dispute="${r.id}" ${flagged ? 'disabled' : ''}>${icon('flag')}${flagged ? 'Disputed' : 'Dispute'}</button>`
          : `<button class="act ${voted ? 'on' : ''}" data-helpful="${r.id}" aria-pressed="${voted}" ${mine ? 'disabled' : ''}>${icon('thumb')}Helpful · ${r.helpful}</button>`}
      </div>
      ${ownerView ? `<span class="tiny muted">Genuineness ${r.score}</span>` : mine ? '' : `<button class="act" data-flag="${r.id}" aria-label="Report review" ${flagged ? 'disabled' : ''}>${icon('flag')}${flagged ? 'Reported' : ''}</button>`}
    </div>
  </article>`;
}

function reviewsHtml(id) {
  let list = venueReviews(id);
  if (filters.v === 'verified') list = list.filter((r) => r.status === 'verified');
  if (filters.v === 'photos') list = list.filter((r) => r.photos?.length);
  if (filters.v === 'critical') list = list.filter((r) => r.rating <= 3);
  if (!list.length) return `<div class="empty">${icon('info')}No reviews match this filter.</div>`;
  return list.map((r) => reviewCard(r)).join('');
}

export function venueView({ id }) {
  const v = venue(id);
  if (!v) return { html: `<div class="page"><div class="empty">Venue not found. <a class="link" href="#/">Back</a></div></div>`, tabs: false };
  const r = rating(id);
  const aspects = aspectAverages(id);
  const perk = state.perks.find((p) => p.venueId === id);
  const saved = state.saved.includes(id);
  const pct = (n) => (r.total ? Math.round((n / r.total) * 100) : 0);
  const typeIcon = { restaurant: 'utensils', cafe: 'coffee', hotel: 'bed' }[v.type];

  const html = `
  <div class="page venue">
    <div class="v-hero" style="${bgImg(v.img, 1600)}">
      <div class="bar">
        <button class="icon-btn glass" data-back aria-label="Back">${icon('back')}</button>
        <div class="row">
          <button class="icon-btn glass" data-share aria-label="Share">${icon('share')}</button>
          <button class="icon-btn glass ${saved ? 'on' : ''}" data-save aria-label="Save" aria-pressed="${saved}">${icon('bookmark')}</button>
        </div>
      </div>
      <div class="v-title">
        <div class="kind">${TYPE_LABEL[v.type]} · ${esc(v.cuisine)}</div>
        <h1>${esc(v.name)}</h1>
        <div class="sub">${esc(v.address)} · ${priceLevel(v.price)} · ${km(distanceKm(v))}</div>
      </div>
    </div>
    <div class="v-layout">
      <aside class="v-side">
        <div class="facts">
          <span class="pill"><i class="dot-live"></i>${esc(v.hours)}</span>
          <span class="pill gold">${icon('hex')}Accepts NIM</span>
          <span class="pill">${icon(typeIcon)}${TYPE_LABEL[v.type]}</span>
        </div>
        <section class="scorecard card">
          <div class="sc-top">
            <div class="sc-num"><b>${r.avg.toFixed(1)}</b><span>out of 5 · weighted</span>${stars(r.avg, 'lg')}</div>
            <div class="stamp"><b>${r.verified}</b><small>proven<br>visits</small></div>
          </div>
          <div class="bars">
            ${[5, 4, 3, 2, 1].map((n) => `<div class="bar-row"><span class="lbl">${n}${icon('star')}</span><span class="track"><i style="width:${pct(r.dist[n])}%"></i></span><span class="pct">${pct(r.dist[n])}%</span></div>`).join('')}
          </div>
          <div class="aspects">
            ${aspects.map((a) => `<div class="aspect"><div class="row"><span>${a.key[0].toUpperCase() + a.key.slice(1)}</span><b>${a.avg ? a.avg.toFixed(1) : '–'}</b></div><span class="track"><i style="width:${(a.avg / 5) * 100}%"></i></span></div>`).join('')}
          </div>
          <div class="trust-note">${icon('shield')}<span>${r.verified} proven visits count fully; ${r.unverified} unverified count ${POLICY.unverifiedWeight * 100}%. Reviewers earn the same for every star.</span></div>
        </section>
        ${Number.isFinite(v.payoutCooldownDays) ? `<div class="trust-note">${icon('clock')}<span>${v.payoutCooldownDays === 0 ? 'Rewards here can be cashed out instantly.' : `Rewards here can be cashed out ${v.payoutCooldownDays} day${v.payoutCooldownDays === 1 ? '' : 's'} after you post.`}</span></div>` : ''}
        ${perk ? `<a class="perk-strip" href="#/perks"><span class="ic">${icon('gift')}</span><span class="grow"><b>${esc(perk.title)}</b><span>Claim with ${perk.cost} NIM in Perks</span></span>${icon('chevron-right')}</a>` : ''}
        <div class="cta-bar"><div class="inner"><a class="btn block" href="#/write/${v.id}">${icon('edit')}Review this place · earn up to <span class="nim">${icon('hex')}${venueReward(v)}</span></a></div></div>
      </aside>
      <section class="v-main">
        <div class="rv-head"><h2>${r.total} <em>reviews</em></h2><a class="link" href="#/trust">How we verify</a></div>
        <div class="chips">
          ${[['all', 'All'], ['verified', 'Proven visits'], ['photos', 'With photos'], ['critical', '3★ and below']].map(([k, l]) => `<button class="chip sm ${filters.v === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}
        </div>
        <div class="rv-list" id="reviews">${reviewsHtml(id)}</div>
      </section>
    </div>
  </div>`;

  function mount(root) {
    root.querySelector('[data-back]').addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
    root.querySelector('[data-save]').addEventListener('click', (e) => {
      toggleSaved(id);
      const on = state.saved.includes(id);
      e.currentTarget.classList.toggle('on', on);
      toast(`${icon('bookmark')} ${on ? 'Saved' : 'Removed from saved'}`);
    });
    root.querySelector('[data-share]').addEventListener('click', async () => {
      if (navigator.share) return navigator.share({ title: v.name, url: location.href }).catch(() => {});
      await navigator.clipboard?.writeText(location.href).catch(() => {});
      toast(`${icon('copy')} Link copied`);
    });
    root.querySelectorAll('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        filters.v = b.dataset.filter;
        root.querySelectorAll('[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
        root.querySelector('#reviews').innerHTML = reviewsHtml(id);
      }),
    );
    root.querySelector('#reviews').addEventListener('click', (e) => {
      const h = e.target.closest('[data-helpful]');
      if (h) {
        h.disabled = true;
        toggleHelpful(h.dataset.helpful)
          .then(() => (root.querySelector('#reviews').innerHTML = reviewsHtml(id)))
          .catch((x) => {
            toast(esc(x.message));
            h.disabled = false;
          });
        return;
      }
      const f = e.target.closest('[data-flag]');
      if (f) reportSheet(f.dataset.flag, () => (root.querySelector('#reviews').innerHTML = reviewsHtml(id)));
    });
  }
  return { html, mount, tabs: false };
}

export function reportSheet(reviewId, done) {
  const reasons = ['Not a real visit', 'Copied or generic text', 'Paid or pushed by the venue', 'Offensive or personal attack', 'Wrong venue'];
  openSheet(
    `<h2>Report this review</h2>
     <p class="lead">Reports go to moderation. If one is upheld while the reward is still unlocking, the reward is cancelled.</p>
     <div class="stack">${reasons.map((r, i) => `<label class="radio"><input type="radio" name="reason" value="${esc(r)}" ${i === 0 ? 'checked' : ''}>${esc(r)}</label>`).join('')}</div>
     <div class="stack"><button class="btn block" data-send>Send report</button><button class="btn block soft" data-close>Cancel</button></div>`,
    (panel) =>
      panel.querySelector('[data-send]').addEventListener('click', async () => {
        try {
          await flagReview(reviewId, panel.querySelector('input[name=reason]:checked').value);
          closeSheet();
          toast(`${icon('flag')} Report sent to moderation`);
          done?.();
        } catch (x) {
          toast(esc(x.message));
        }
      }),
  );
}
