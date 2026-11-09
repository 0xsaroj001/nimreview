// The owner's area, one job per page so nothing is crowded:
//   Overview · Reviews · Bill codes · Payouts · Settings
// Only owner accounts have routes to these pages (see app.js); guests cannot open them.
import { state, owner, myVenue, venueReviews, rating, issueReceipt, replyToReview, user, saveRewardSettings, switchDemoVenue, venueOwed, markPayoutPaid, rejectPayout } from '../store.js';
import { isLive } from '../session.js';
import { esc, icon, openSheet, closeSheet, toast, copy, TYPE_LABEL, bgImg, timeAgo, logoutBtn, shortHash } from '../ui.js';
import { POLICY, venueBurst, venueReward } from '../core/genuine.js';
import { formatNim, formatAddress, shortAddress, LUNA_PER_NIM } from '../core/nimiq.js';
import { inNimiqPay, nimiqPaySend } from '../nimiqpay.js';
import { reviewCard, reportSheet } from './venue.js';

const refresh = () => dispatchEvent(new Event('nr:refresh'));
const fail = (x) => toast(esc(x.message));
const COOLDOWNS = [[0, 'Instant'], [1, '1 day'], [3, '3 days'], [7, '7 days'], [14, '14 days'], [30, '30 days']];
const cooldownText = (d) => (d === 0 ? 'instantly' : `${d} day${d === 1 ? '' : 's'} after posting`);

let lastIssued = null;
let reviewFilter = 'all';
const sentHashes = {}; // payout id -> hash of a payment already sent from Nimiq Pay, waiting for the chain to show it

// ---------- shared page frame ----------
function page({ title, tab, body, wide = true }) {
  const live = isLive();
  return {
    tab,
    html: `
  <div class="page">
    <div class="titlebar"><span></span><h1>${esc(title)}</h1>${logoutBtn()}</div>
    ${live ? '' : `<div class="demo-bar">${icon('info')}<span>Demo owner: demo NIM only, nothing is real, and it disappears when you close this tab.</span></div>`}
    ${wide ? `<div class="two-col">${body}</div>` : body}
  </div>`,
  };
}

const venueCard = (v, o) => `
  <section class="owner-top card">
    <div class="thumb" style="${bgImg(v.img, 200)}"></div>
    <div class="grow"><b>${esc(v.name)}</b><div class="small muted">${TYPE_LABEL[v.type]} · ${esc(o.name)}</div>
      <div class="tiny muted">${isLive() ? `Paid from ${esc(shortAddress(v.nimAddress))}` : 'Demo venue'}</div></div>
  </section>`;

function ctx() {
  const o = owner();
  const v = myVenue();
  const r = rating(v.id);
  const reviews = venueReviews(v.id);
  return { o, v, r, reviews, owed: venueOwed(v.id), now: Date.now() };
}

// ---------- Overview ----------
export function ownerOverview() {
  const { o, v, r, reviews, owed, now } = ctx();
  const live = isLive();
  const week = reviews.filter((x) => now - x.createdAt < 7 * 864e5).length;
  const avgScore = reviews.length ? Math.round(reviews.reduce((s, x) => s + x.score, 0) / reviews.length) : 0;
  const burst = venueBurst(state.reviews.filter((x) => x.venueId === v.id).map((x) => ({ createdAt: x.createdAt, authorCreatedAt: user(x.authorId).createdAt })), now);
  const unanswered = reviews.filter((x) => !x.ownerReply).length;
  const waiting = owed.requests.filter((e) => e.status === 'requested');
  const demoVenues = live ? [] : ['lumen', 'copper', 'marigold'].map((id) => state.venues.find((x) => x.id === id)).filter(Boolean);

  const attention = [
    waiting.length ? `<a class="attn urgent" href="#/owner/payouts">${icon('wallet')}<span><b>${waiting.length} guest${waiting.length === 1 ? '' : 's'} waiting to be paid</b> · ${formatNim(owed.waiting)} NIM</span>${icon('chevron-right', 'chev')}</a>` : '',
    unanswered ? `<a class="attn" href="#/owner/reviews">${icon('reply')}<span><b>${unanswered} review${unanswered === 1 ? '' : 's'}</b> without your reply</span>${icon('chevron-right', 'chev')}</a>` : '',
    burst.frozen ? `<div class="attn warn">${icon('alert')}<span>${burst.count} reviews from accounts under ${POLICY.burst.newAccountDays} days old in 24 h. Rewards at your place are paused while this is checked.</span></div>` : '',
  ].filter(Boolean);

  const body = `
    <div class="col">
      ${venueCard(v, o)}
      ${demoVenues.length ? `<div class="demo-switch">${demoVenues.map((x) => `<button class="chip sm ${x.id === v.id ? 'on' : ''}" data-switch="${x.id}">${TYPE_LABEL[x.type]}: ${esc(x.name)}</button>`).join('')}</div>` : ''}
      <div class="kpis">
        <div class="kpi"><span>${icon('star')}Weighted rating</span><b>${r.avg.toFixed(1)}</b></div>
        <div class="kpi"><span>${icon('shield')}Proven share</span><b>${r.total ? Math.round((r.verified / r.total) * 100) : 0}%</b></div>
        <div class="kpi"><span>${icon('trend')}Reviews, 7 days</span><b>${week}</b></div>
        <div class="kpi"><span>${icon('sparkle')}Avg genuineness</span><b>${avgScore}</b></div>
      </div>
      <section class="section tight"><div class="section-h"><h2>Needs <em>you</em></h2></div>
        <div class="attn-list">${attention.length ? attention.join('') : `<div class="card empty">${icon('check')}All caught up. Nothing is waiting for you.</div>`}</div>
      </section>
      <a class="card owed-mini" href="#/owner/payouts">
        <span class="eyebrow">You owe guests</span>
        <div class="mini-row"><div><b>${formatNim(owed.waiting)}</b>waiting for you</div><div><b>${formatNim(owed.available)}</b>can be asked for</div><div><b>${formatNim(owed.unlocking)}</b>unlocking</div></div>
      </a>
    </div>
    <div class="col">
      <div class="rv-head"><h2>Latest <em>reviews</em></h2><a class="link" href="#/owner/reviews">See all ${reviews.length}</a></div>
      <div class="rv-list" style="padding-top:0">${reviews.length ? reviews.slice(0, 3).map((x) => reviewCard(x, { ownerView: true })).join('') : `<div class="card empty">${icon('edit')}No reviews yet. Hand out bill codes with the bill and they will come.</div>`}</div>
      ${reviews.length ? '' : `<a class="btn block" href="#/owner/codes">${icon('receipt')}Issue your first bill code</a>`}
    </div>`;
  const p = page({ title: 'Overview', tab: 'ov', body });
  p.mount = (root) => {
    root.querySelectorAll('[data-switch]').forEach((b) =>
      b.addEventListener('click', () => {
        switchDemoVenue(b.dataset.switch);
        refresh();
      }),
    );
    bindReviewActions(root);
  };
  return p;
}

// ---------- Reviews ----------
export function ownerReviews() {
  const { r, reviews } = ctx();
  const shown = reviewFilter === 'open' ? reviews.filter((x) => !x.ownerReply) : reviews;
  const body = `
    <div class="col full">
      <div class="rv-head"><h2>Guest <em>reviews</em></h2><span class="eyebrow">${r.verified} proven · ${r.unverified} unverified</span></div>
      <div class="chips" style="padding:0 var(--gutter)">
        <button class="chip ${reviewFilter === 'all' ? 'on' : ''}" data-filter="all">All ${reviews.length}</button>
        <button class="chip ${reviewFilter === 'open' ? 'on' : ''}" data-filter="open">Needs a reply ${reviews.filter((x) => !x.ownerReply).length}</button>
      </div>
      <div class="rv-list" id="reviews">${shown.length ? shown.map((x) => reviewCard(x, { ownerView: true })).join('') : `<div class="card empty">${icon('check')}${reviews.length ? 'Every review has your reply.' : 'No reviews yet.'}</div>`}</div>
      <div class="alert info">${icon('lock')}<span>Owners can reply and dispute. You can't edit, hide, delete or pay for reviews, or review your own place. Guests earn the same for 1★ and 5★.</span></div>
    </div>`;
  const p = page({ title: 'Reviews', tab: 'reviews', body, wide: false });
  p.mount = (root) => {
    root.querySelectorAll('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        reviewFilter = b.dataset.filter;
        refresh();
      }),
    );
    bindReviewActions(root);
  };
  return p;
}

function bindReviewActions(root) {
  // the .page element is rebuilt on every draw, so listeners never stack up (root itself lives forever)
  root.querySelector('.page').addEventListener('click', (e) => {
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

// ---------- Bill codes ----------
export function ownerCodes() {
  const { v, now } = ctx();
  if (lastIssued && lastIssued.venueId !== v.id) lastIssued = null;
  const codes = state.receipts.filter((x) => x.venueId === v.id).slice(0, 15);
  const expired = (c) => now - c.issuedAt > POLICY.receiptTtlHours * 36e5;
  const body = `
    <div class="col">
      <section class="issue card">
        <h3>Issue a bill code</h3>
        <p>Print it on the bill. A code can be used for one review only, valid ${POLICY.receiptTtlHours} h. Bills under ₹${POLICY.minBill} prove the visit but earn the guest nothing.</p>
        <div class="form">
          <label class="field"><span class="muted" style="font-weight:800">₹</span><input id="amt" class="plain" type="number" inputmode="numeric" placeholder="Bill amount" min="1"></label>
          <label class="field"><input id="lbl" class="plain" placeholder="${v.type === 'hotel' ? 'Room / note' : 'Table / note'}" maxlength="20"></label>
        </div>
        <button class="btn block" style="margin-top:10px" data-issue>${icon('receipt')}Generate code</button>
        <div id="issued">${lastIssued ? issuedHtml(lastIssued) : ''}</div>
      </section>
    </div>
    <div class="col">
      <section class="issue card">
        <h3>Recent codes</h3>
        ${codes.length ? codes.map((c) => `<div class="rc"><code>${esc(c.code)}</code><span class="grow muted ellipsis">${esc(c.label || '')} ₹${c.amount}</span><span class="pill ${c.usedBy ? 'green' : expired(c) ? 'red' : ''}">${c.usedBy ? 'Used' : expired(c) ? 'Expired' : 'Open'}</span></div>`).join('') : '<p class="small muted">No codes yet. They show up here as you issue them.</p>'}
      </section>
    </div>`;
  const p = page({ title: 'Bill codes', tab: 'codes', body });
  p.mount = (root) => {
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
  };
  return p;
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

// ---------- Payouts ----------
export function ownerPayouts() {
  const { v, owed } = ctx();
  const live = isLive();
  const open = owed.requests.filter((e) => e.status === 'requested');
  const done = owed.requests.filter((e) => e.status !== 'requested').slice(0, 10);
  const body = `
    <div class="col">
      <div class="kpis">
        <div class="kpi ${owed.waiting ? 'hot' : ''}"><span>${icon('wallet')}Waiting for you</span><b>${formatNim(owed.waiting)}</b></div>
        <div class="kpi"><span>${icon('check')}Paid so far</span><b>${formatNim(owed.paid)}</b></div>
        <div class="kpi"><span>${icon('gift')}Can be asked for</span><b>${formatNim(owed.available)}</b></div>
        <div class="kpi"><span>${icon('clock')}Unlocking</span><b>${formatNim(owed.unlocking)}</b></div>
      </div>
      <div class="alert info">${icon('info')}<span>Guests are paid <b>${cooldownText(v.payoutCooldownDays ?? 3)}</b>, and you pay them from your own Nimiq wallet. ${live ? 'After you pay, the app checks the payment on the Nimiq network before it counts.' : 'Demo: paying is simulated.'} <a class="link" href="#/owner/settings">Change the wait</a></span></div>
    </div>
    <div class="col">
      <div class="rv-head"><h2>Requests <em>to pay</em></h2><span class="eyebrow">${open.length} open</span></div>
      <div class="pay-list" id="payouts">
        ${open.length ? open.map((e) => payRow(e, live)).join('') : `<div class="card empty">${icon('check')}No one is waiting for a payout.</div>`}
      </div>
      ${done.length ? `<div class="rv-head"><h2>History</h2></div>
        <div class="card ledger">${done.map((e) => `<div class="tx"><span class="ic" style="background:${e.status === 'paid' ? 'var(--sage-soft)' : 'var(--line)'};color:${e.status === 'paid' ? 'var(--sage)' : 'var(--muted)'}">${icon(e.status === 'paid' ? 'check' : 'x')}</span>
          <div class="grow"><b class="ellipsis">${esc(e.guestName || 'Guest')}</b><span class="tiny muted">${timeAgo(e.paidAt || e.at)} · ${e.status === 'paid' ? `paid${e.txHash ? ` · ${shortHash(e.txHash)}` : ''}` : `declined${e.note ? `: ${esc(e.note)}` : ''}`}</span></div>
          <span class="amt ${e.status === 'paid' ? '' : 'void'}">${formatNim(e.amount)}</span></div>`).join('')}</div>` : ''}
    </div>`;
  const p = page({ title: 'Payouts', tab: 'payouts', body });
  p.mount = (root) => {
    root.querySelector('#payouts').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const entry = owed.requests.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.act === 'copy') return copy(formatAddress(entry.guestAddress));
      if (btn.dataset.act === 'decline') return declineSheet(entry);
      if (btn.dataset.act === 'hash') return hashSheet(entry);
      btn.disabled = true;
      try {
        if (!live) {
          await markPayoutPaid(entry.id);
          toast(`${icon('check')} Paid ${formatNim(entry.amount)} NIM (demo)`);
        } else {
          // pay from Nimiq Pay (or re-check a payment already sent), then let the server confirm it on-chain
          if (!sentHashes[entry.id]) sentHashes[entry.id] = await nimiqPaySend({ recipient: formatAddress(entry.guestAddress), luna: Math.round(entry.amount * LUNA_PER_NIM) });
          await markPayoutPaid(entry.id, sentHashes[entry.id]);
          delete sentHashes[entry.id];
          toast(`${icon('check')} Paid ${formatNim(entry.amount)} NIM`);
        }
        refresh();
      } catch (x) {
        fail(x);
        refresh();
      }
    });
  };
  return p;
}

function payRow(e, live) {
  const sent = sentHashes[e.id];
  const inPay = inNimiqPay();
  return `<div class="card pay-req">
    <div class="row"><b class="grow ellipsis">${esc(e.guestName || 'Guest')}</b><span class="nim">${icon('hex')}${formatNim(e.amount)}</span></div>
    <div class="tiny muted">asked ${timeAgo(e.at)} · to <code>${esc(shortAddress(e.guestAddress))}</code> <button class="link-btn" data-act="copy" data-id="${e.id}">copy</button></div>
    ${sent ? `<div class="verdict warn" style="margin:8px 0 0">${icon('clock')}<span>You sent it (${esc(shortHash(sent))}). Waiting for the network to show it.</span></div>` : ''}
    <div class="pay-acts">
      ${live && !inPay && !sent
        ? `<button class="btn sm gold" data-act="hash" data-id="${e.id}">${icon('check')}I paid it, enter the transaction</button>`
        : `<button class="btn sm gold" data-act="pay" data-id="${e.id}">${icon('wallet')}${sent ? 'Check the payment' : live ? `Pay ${formatNim(e.amount)} NIM in Nimiq Pay` : 'Pay now (demo)'}</button>`}
      <button class="btn sm soft" data-act="decline" data-id="${e.id}">Decline</button>
    </div>
    ${live && !inPay && !sent ? `<p class="tiny muted" style="margin-top:8px">Open this site inside Nimiq Pay to pay with one tap, or send the NIM from any wallet to the address above and paste the transaction here.</p>` : ''}
  </div>`;
}

function hashSheet(entry) {
  openSheet(
    `<h2>Enter the transaction</h2>
     <p class="lead">Paste the 64-character transaction hash of your payment of ${formatNim(entry.amount)} NIM to ${esc(entry.guestName || 'the guest')}. The app looks it up on the Nimiq network and only then marks it paid.</p>
     <div class="stack"><label class="field">${icon('hex')}<input id="hash" class="plain" placeholder="Transaction hash" autocomplete="off" spellcheck="false" style="font-size:13px"></label>
     <button class="btn block gold" data-go>Check and mark paid</button><button class="btn block soft" data-close>Cancel</button></div>`,
    (p) =>
      p.querySelector('[data-go]').addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        btn.disabled = true;
        try {
          await markPayoutPaid(entry.id, p.querySelector('#hash').value.trim().toLowerCase());
          closeSheet();
          toast(`${icon('check')} Paid ${formatNim(entry.amount)} NIM`);
          refresh();
        } catch (x) {
          fail(x);
          btn.disabled = false;
        }
      }),
  );
}

function declineSheet(entry) {
  openSheet(
    `<h2>Decline this payout?</h2>
     <p class="lead">${esc(entry.guestName || 'The guest')} keeps the ${formatNim(entry.amount)} NIM in their balance and can ask again. Say why, they will see it.</p>
     <div class="stack"><label class="field"><input id="note" class="plain" maxlength="120" placeholder="e.g. Please see the counter"></label>
     <button class="btn block" data-go>Decline</button><button class="btn block soft" data-close>Cancel</button></div>`,
    (p) =>
      p.querySelector('[data-go]').addEventListener('click', async (ev) => {
        ev.currentTarget.disabled = true;
        try {
          await rejectPayout(entry.id, p.querySelector('#note').value.trim());
          closeSheet();
          toast('Payout declined');
          refresh();
        } catch (x) {
          fail(x);
          ev.currentTarget.disabled = false;
        }
      }),
  );
}

// ---------- Settings ----------
export function ownerSettings() {
  const { o, v } = ctx();
  const live = isLive();
  const reward = venueReward(v);
  const days = Number.isFinite(v.payoutCooldownDays) ? v.payoutCooldownDays : 3;
  const body = `
    <div class="col">
      <section class="issue card">
        <h3>Reward per review</h3>
        <p>What you pay a guest for a perfect, proven review. Lower genuineness scores earn proportionally less; the stars never change it. 0 means you don't pay rewards.</p>
        <label class="field">${icon('hex')}<input id="reward" class="plain" type="number" inputmode="decimal" min="0" max="1000" step="0.5" value="${reward}" aria-label="NIM per review"><span class="small muted">NIM max</span></label>
        <p class="tiny muted" id="reward-hint" style="margin-top:8px"></p>
      </section>
      <section class="issue card">
        <h3>When can guests cash out?</h3>
        <p>You choose how long a guest waits after posting. <b>Instant</b> lets them ask for payment right away. A longer wait gives you time to spot fake reviews: an upheld report cancels a reward that is still waiting.</p>
        <div class="chips seg" role="radiogroup" aria-label="Cash-out wait">
          ${COOLDOWNS.map(([d, l]) => `<button class="chip ${d === days ? 'on' : ''}" role="radio" aria-checked="${d === days}" data-days="${d}">${l}</button>`).join('')}
        </div>
        <p class="tiny muted" id="days-hint" style="margin-top:8px"></p>
        <button class="btn block gold" style="margin-top:12px" data-save>Save</button>
      </section>
    </div>
    <div class="col">
      <section class="issue card">
        <h3>Your wallet</h3>
        <p>${live ? 'Guests are paid from this wallet, and it is your account. Lose the wallet and you lose the account.' : 'Demo wallet: nothing real.'}</p>
        <div class="coupon-big"><span class="tiny muted">${live ? 'Nimiq wallet' : 'Demo wallet'}</span><code style="font-size:14px;letter-spacing:.03em">${esc(formatAddress(v.nimAddress || o.nimAddress || ''))}</code></div>
        <button class="btn sm soft" data-copy-addr style="margin-top:10px">${icon('copy')}Copy address</button>
      </section>
      <section class="section tight"><div class="card menu">
        ${live ? `<a href="#/listing"><span class="ic">${icon('edit')}</span>Edit listing: name, photo, address${icon('chevron-right', 'chev')}</a>` : ''}
        <a href="#/trust"><span class="ic">${icon('shield')}</span>How reviews stay genuine${icon('chevron-right', 'chev')}</a>
        <button data-logout><span class="ic">${icon('logout')}</span>Log out${icon('chevron-right', 'chev')}</button>
      </div></section>
    </div>`;
  const p = page({ title: 'Settings', tab: 'settings', body });
  p.mount = (root) => {
    let chosen = days;
    const rewardEl = root.querySelector('#reward');
    const hint = () => {
      const n = Number(rewardEl.value) || 0;
      root.querySelector('#reward-hint').textContent = n ? `A perfect review pays ${formatNim(n)} NIM; a typical one (score 70) pays ${formatNim(Math.round(n * 7) / 10)}.` : 'No rewards: guests can still review, they just earn nothing.';
      root.querySelector('#days-hint').textContent = chosen === 0 ? 'Guests can ask for payment the moment they post. You carry the risk of a fake review being paid.' : `Guests can ask for payment ${cooldownText(chosen)}.`;
    };
    rewardEl.addEventListener('input', hint);
    root.querySelectorAll('[data-days]').forEach((b) =>
      b.addEventListener('click', () => {
        chosen = Number(b.dataset.days);
        root.querySelectorAll('[data-days]').forEach((x) => {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
        hint();
      }),
    );
    hint();
    root.querySelector('[data-copy-addr]').addEventListener('click', () => copy(formatAddress(v.nimAddress || o.nimAddress)));
    root.querySelector('[data-save]').addEventListener('click', async (e) => {
      const n = Math.round(Number(rewardEl.value) * 10) / 10;
      if (!(n >= 0 && n <= 1000)) return toast('Pick 0 to 1000 NIM');
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await saveRewardSettings(v.id, { rewardPerReview: n, payoutCooldownDays: chosen });
        toast(`${icon('check')} Saved: up to ${formatNim(n)} NIM, cash-out ${cooldownText(chosen)}`);
        refresh();
      } catch (x) {
        fail(x);
        btn.disabled = false;
      }
    });
  };
  return p;
}
