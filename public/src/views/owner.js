// Venue dashboard: only venue accounts reach this screen; customers have no route to it.
import { state, owner, myVenue, venueReviews, rating, issueReceipt, replyToReview, user, setReward, switchDemoVenue } from '../store.js';
import { isLive, signOut } from '../session.js';
import { esc, icon, openSheet, closeSheet, toast, copy, TYPE_LABEL, bgImg } from '../ui.js';
import { POLICY, venueBurst, venueReward } from '../core/genuine.js';
import { shortAddress } from '../core/nimiq.js';
import { reviewCard, reportSheet } from './venue.js';

let lastIssued = null;
const refresh = () => dispatchEvent(new Event('nr:refresh'));
const fail = (x) => toast(esc(x.message));

export function ownerView() {
  const o = owner();
  const v = myVenue();
  const live = isLive();
  const r = rating(v.id);
  const reviews = venueReviews(v.id);
  const now = Date.now();
  const week = reviews.filter((x) => now - x.createdAt < 7 * 864e5).length;
  const avgScore = reviews.length ? Math.round(reviews.reduce((s, x) => s + x.score, 0) / reviews.length) : 0;
  const burst = venueBurst(state.reviews.filter((x) => x.venueId === v.id).map((x) => ({ createdAt: x.createdAt, authorCreatedAt: user(x.authorId).createdAt })), now);
  const codes = state.receipts.filter((x) => x.venueId === v.id).slice(0, 6);
  const expired = (c) => now - c.issuedAt > POLICY.receiptTtlHours * 36e5;
  const reward = venueReward(v);
  if (lastIssued && lastIssued.venueId !== v.id) lastIssued = null;
  const demoVenues = live ? [] : ['lumen', 'copper', 'marigold'].map((id) => state.venues.find((x) => x.id === id)).filter(Boolean);

  const html = `
  <div class="page">
    <div class="titlebar"><span></span><h1>Venue dashboard</h1>${live ? `<button class="icon-btn m-only" data-logout aria-label="Sign out">${icon('x')}</button>` : '<span class="pill demo">Demo</span>'}</div>
    <div class="two-col">
      <div class="col">
        <section class="owner-top card">
          <div class="thumb" style="${bgImg(v.img, 200)}"></div>
          <div class="grow"><b>${esc(v.name)}</b><div class="small muted">${TYPE_LABEL[v.type]} · signed in as ${esc(o.name)}</div>
            <div class="tiny muted">${live ? `Wallet ${esc(shortAddress(v.nimAddress))} · <a class="link" href="#/listing">Edit listing</a> · <a class="link" href="#/connect">Change wallet</a>` : 'Demo venue: no real NIM, data stays on this device'}</div></div>
        </section>
        ${demoVenues.length ? `<div class="demo-switch">${demoVenues.map((x) => `<button class="chip sm ${x.id === v.id ? 'on' : ''}" data-switch="${x.id}">${TYPE_LABEL[x.type]}: ${esc(x.name)}</button>`).join('')}</div>` : ''}
        <div class="kpis">
          <div class="kpi"><span>${icon('star')}Weighted rating</span><b>${r.avg.toFixed(1)}</b></div>
          <div class="kpi"><span>${icon('shield')}Proven share</span><b>${r.total ? Math.round((r.verified / r.total) * 100) : 0}%</b></div>
          <div class="kpi"><span>${icon('trend')}Reviews, 7 days</span><b>${week}</b></div>
          <div class="kpi"><span>${icon('sparkle')}Avg genuineness</span><b>${avgScore}</b></div>
        </div>
        ${burst.frozen ? `<div class="alert warn">${icon('alert')}<span>${burst.count} reviews from accounts under ${POLICY.burst.newAccountDays} days old in 24 h. Rewards at your venue are paused while this is checked.</span></div>` : ''}
        <section class="issue card">
          <h3>Reward per review</h3>
          <p>What you pay a guest for a perfect, proven review. Lower genuineness scores earn proportionally less; the stars never change it.</p>
          <div class="reward-set">
            <label class="field">${icon('hex')}<input id="reward" class="plain" type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${reward}" aria-label="NIM per review"><span class="small muted">NIM max</span></label>
            <button class="btn" data-reward>Save</button>
          </div>
          ${live ? `<p class="tiny muted" style="margin-top:8px">Rewards are recorded against your venue. On-chain payout from your wallet is not built yet.</p>` : ''}
        </section>
        <section class="issue card">
          <h3>Issue a bill code</h3>
          <p>Print it on the bill. A code can be used for one review only, valid ${POLICY.receiptTtlHours} h. Bills under ₹${POLICY.minBill} prove the visit but earn the guest nothing.</p>
          <div class="form">
            <label class="field"><span class="muted" style="font-weight:800">₹</span><input id="amt" class="plain" type="number" inputmode="numeric" placeholder="Bill amount" min="1"></label>
            <label class="field"><input id="lbl" class="plain" placeholder="${v.type === 'hotel' ? 'Room / note' : 'Table / note'}" maxlength="20"></label>
          </div>
          <button class="btn block" style="margin-top:10px" data-issue>${icon('receipt')}Generate code</button>
          <div id="issued">${lastIssued ? issuedHtml(lastIssued) : ''}</div>
          <div class="divider"></div>
          <span class="eyebrow">Recent codes</span>
          ${codes.length ? codes.map((c) => `<div class="rc"><code>${esc(c.code)}</code><span class="grow muted ellipsis">${esc(c.label || '')} ₹${c.amount}</span><span class="pill ${c.usedBy ? 'green' : expired(c) ? 'red' : ''}">${c.usedBy ? 'Used' : expired(c) ? 'Expired' : 'Open'}</span></div>`).join('') : '<p class="small muted">No codes yet.</p>'}
        </section>
        <div class="alert info">${icon('lock')}<span>Venues can reply and dispute. They can't edit, hide, delete or pay for reviews, or review their own place. Guests earn the same for 1★ and 5★.</span></div>
      </div>
      <div class="col">
        <div class="rv-head"><h2>Guest <em>reviews</em></h2><span class="eyebrow">${r.verified} proven · ${r.unverified} unverified</span></div>
        <div class="rv-list" id="reviews" style="padding-top:0">${reviews.length ? reviews.map((x) => reviewCard(x, { ownerView: true })).join('') : `<div class="card empty">${icon('edit')}No reviews yet. Hand out bill codes with the bill and they will come.</div>`}</div>
      </div>
    </div>
  </div>`;

  function mount(root) {
    root.querySelector('[data-logout]')?.addEventListener('click', signOut);
    root.querySelectorAll('[data-switch]').forEach((b) =>
      b.addEventListener('click', () => {
        switchDemoVenue(b.dataset.switch);
        refresh();
      }),
    );
    root.querySelector('[data-reward]').addEventListener('click', async (e) => {
      const n = Math.round(Number(root.querySelector('#reward').value) * 10) / 10;
      if (!(n >= 0 && n <= 1000)) return toast('Pick 0 to 1000 NIM');
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await setReward(v.id, n);
        toast(`${icon('hex')} Guests now earn up to ${n} NIM per review`);
        refresh();
      } catch (x) {
        fail(x);
        btn.disabled = false;
      }
    });
    root.querySelector('[data-issue]').addEventListener('click', async (e) => {
      const amt = Number(root.querySelector('#amt').value);
      if (!amt || amt < 1) return toast('Enter the bill amount');
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        lastIssued = await issueReceipt(v.id, amt, root.querySelector('#lbl').value.trim());
        refresh();
      } catch (x) {
        fail(x);
        btn.disabled = false;
      }
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
            p.querySelector('[data-send]').addEventListener('click', async () => {
              const t = p.querySelector('#reply').value.trim();
              if (t.length < 5) return toast('Write a short reply first');
              try {
                await replyToReview(rep.dataset.reply, t);
                closeSheet();
                toast(`${icon('reply')} Reply posted`);
                refresh();
              } catch (x) {
                fail(x);
              }
            }),
        );
      }
      const dis = e.target.closest('[data-dispute]');
      if (dis) reportSheet(dis.dataset.dispute, refresh);
    });
  }
  return { html, mount, tabs: false, tab: 'owner' };
}

function issuedHtml(rc) {
  const until = new Date(rc.issuedAt + POLICY.receiptTtlHours * 36e5).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="receipt-wrap"><div class="receipt">
    <div class="r-head"><small>Bill code · ₹${rc.amount}${rc.label ? ' · ' + esc(rc.label) : ''}</small></div>
    <div class="code">${esc(rc.code)}</div>
    <small class="muted" style="font-size:11px;letter-spacing:.08em">ONE REVIEW ONLY · VALID UNTIL ${esc(until.toUpperCase())}</small>
    <div class="barcode"></div>
    <button class="btn sm gold" data-copy style="margin-top:14px">${icon('copy')}Copy code</button>
  </div></div>`;
}
