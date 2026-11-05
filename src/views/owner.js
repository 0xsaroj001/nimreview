import { state, owner, venue, venueReviews, rating, issueReceipt, replyToReview, user } from '../store.js';
import { esc, icon, openSheet, closeSheet, toast, copy } from '../ui.js';
import { POLICY, venueBurst } from '../core/genuine.js';
import { reviewCard, reportSheet } from './venue.js';

let lastIssued = null;

export function ownerView() {
  const o = owner();
  const v = venue(o.ownsVenueIds[0]);
  const r = rating(v.id);
  const reviews = venueReviews(v.id);
  const now = Date.now();
  const week = reviews.filter((x) => now - x.createdAt < 7 * 864e5).length;
  const avgScore = reviews.length ? Math.round(reviews.reduce((s, x) => s + x.score, 0) / reviews.length) : 0;
  const burst = venueBurst(state.reviews.filter((x) => x.venueId === v.id).map((x) => ({ createdAt: x.createdAt, authorCreatedAt: user(x.authorId).createdAt })), now);
  const codes = state.receipts.filter((x) => x.venueId === v.id).slice(0, 6);
  const expired = (c) => now - c.issuedAt > POLICY.receiptTtlHours * 36e5;

  const html = `
  <div class="page">
    <div class="titlebar"><a class="icon-btn m-only" href="#/me" aria-label="Back">${icon('back')}</a><h1>Owner view</h1><span class="pill demo">Demo</span></div>
    <div class="two-col">
      <div class="col">
        <section class="owner-top card">
          <div class="thumb" style="background-image:url('${v.img.replace('w=900', 'w=200')}')"></div>
          <div class="grow"><b>${esc(v.name)}</b><div class="small muted">Signed in as ${esc(o.name)}, owner</div></div>
        </section>
        <div class="kpis">
          <div class="kpi"><span>${icon('star')}Weighted rating</span><b>${r.avg.toFixed(1)}</b></div>
          <div class="kpi"><span>${icon('shield')}Proven share</span><b>${r.total ? Math.round((r.verified / r.total) * 100) : 0}%</b></div>
          <div class="kpi"><span>${icon('trend')}Reviews, 7 days</span><b>${week}</b></div>
          <div class="kpi"><span>${icon('sparkle')}Avg genuineness</span><b>${avgScore}</b></div>
        </div>
        ${burst.frozen ? `<div class="alert warn">${icon('alert')}<span>${burst.count} reviews from accounts under ${POLICY.burst.newAccountDays} days old in 24 h. Rewards at your venue are paused while this is checked.</span></div>` : ''}
        <section class="issue card">
          <h3>Print a receipt code</h3>
          <p>Goes on the bill. One review per code, valid ${POLICY.receiptTtlHours} h. Bills under ₹${POLICY.minBill} prove the visit but earn the guest nothing.</p>
          <div class="form">
            <label class="field"><span class="muted" style="font-weight:800">₹</span><input id="amt" class="plain" type="number" inputmode="numeric" placeholder="Bill amount" min="1"></label>
            <label class="field"><input id="lbl" class="plain" placeholder="Table / note" maxlength="20"></label>
          </div>
          <button class="btn block" style="margin-top:10px" data-issue>${icon('receipt')}Generate code</button>
          <div id="issued">${lastIssued ? issuedHtml(lastIssued) : ''}</div>
          <div class="divider"></div>
          <span class="eyebrow">Recent codes</span>
          ${codes.map((c) => `<div class="rc"><code>${esc(c.code)}</code><span class="grow muted ellipsis">${esc(c.label || '')} ₹${c.amount}</span><span class="pill ${c.usedBy ? 'green' : expired(c) ? 'red' : ''}">${c.usedBy ? 'Reviewed' : expired(c) ? 'Expired' : 'Open'}</span></div>`).join('')}
        </section>
        <div class="alert info">${icon('lock')}<span>Owners can reply and dispute. They can't edit, hide, delete or pay for reviews, or review their own venue. Guests earn the same for 1★ and 5★.</span></div>
      </div>
      <div class="col">
        <div class="rv-head"><h2>Guest <em>reviews</em></h2><span class="eyebrow">${r.verified} proven · ${r.unverified} unverified</span></div>
        <div class="rv-list" id="reviews" style="padding-top:0">${reviews.map((x) => reviewCard(x, { ownerView: true })).join('')}</div>
      </div>
    </div>
  </div>`;

  function mount(root) {
    root.querySelector('[data-issue]').addEventListener('click', () => {
      const amt = Number(root.querySelector('#amt').value);
      if (!amt || amt < 1) return toast('Enter the bill amount');
      lastIssued = issueReceipt(v.id, amt, root.querySelector('#lbl').value.trim());
      dispatchEvent(new Event('nr:refresh'));
    });
    root.querySelector('#issued').addEventListener('click', (e) => {
      if (e.target.closest('[data-copy]')) copy(lastIssued.code);
    });
    root.querySelector('#reviews').addEventListener('click', (e) => {
      const rep = e.target.closest('[data-reply]');
      if (rep) {
        openSheet(
          `<h2>Reply publicly</h2><p class="lead">Your reply shows under the review. Say what you'll change.</p>
           <div class="stack"><textarea id="reply" maxlength="500" placeholder="Thanks for the feedback…"></textarea>
           <button class="btn block" data-send>Post reply</button><button class="btn block soft" data-close>Cancel</button></div>`,
          (p) =>
            p.querySelector('[data-send]').addEventListener('click', () => {
              const t = p.querySelector('#reply').value.trim();
              if (t.length < 5) return toast('Write a short reply first');
              replyToReview(rep.dataset.reply, t);
              closeSheet();
              toast(`${icon('reply')} Reply posted`);
              dispatchEvent(new Event('nr:refresh'));
            }),
        );
      }
      const dis = e.target.closest('[data-dispute]');
      if (dis) reportSheet(dis.dataset.dispute, () => dispatchEvent(new Event('nr:refresh')), 'u_owner');
    });
  }
  return { html, mount, tabs: false, tab: 'owner' };
}

function issuedHtml(rc) {
  const until = new Date(rc.issuedAt + POLICY.receiptTtlHours * 36e5).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="receipt-wrap"><div class="receipt">
    <div class="r-head"><small>Review code · ₹${rc.amount}${rc.label ? ' · ' + esc(rc.label) : ''}</small></div>
    <div class="code">${esc(rc.code)}</div>
    <small class="muted" style="font-size:11px;letter-spacing:.08em">SINGLE USE · VALID UNTIL ${esc(until.toUpperCase())}</small>
    <div class="barcode"></div>
    <button class="btn sm gold" data-copy style="margin-top:14px">${icon('copy')}Copy code</button>
  </div></div>`;
}
