// A reviewer's wallet. The NIM you earn is owed by the place that rewarded you, so it is shown, and cashed out,
// place by place: you ask that place, it pays you from its own Nimiq wallet, and the app confirms the payment
// on the Nimiq chain before marking it paid.
import { state, wallet, walletByVenue, venue, me, cashOut, daysLeft } from '../store.js';
import { esc, icon, timeAgo, openSheet, closeSheet, toast, copy, shortHash } from '../ui.js';
import { formatNim, formatAddress } from '../core/nimiq.js';
import { isLive, isDemo } from '../session.js';

const KIND = {
  reward: { icon: 'edit', bg: 'var(--sage-soft)', c: 'var(--sage)' },
  coupon: { icon: 'gift', bg: 'var(--gold-soft)', c: 'var(--gold-deep)' },
  cashout: { icon: 'share', bg: 'var(--sky-soft)', c: 'var(--sky)' },
};

const waitText = (v) => (v?.payoutCooldownDays === 0 ? 'Instant cash-out' : Number.isFinite(v?.payoutCooldownDays) ? `${v.payoutCooldownDays}-day wait after a review` : '');

function statusOf(e) {
  const v = venue(e.venueId);
  if (e.type === 'reward') return { pending: 'Unlocking', claimable: 'Ready to cash out', voided: 'Cancelled' }[e.status];
  if (e.type === 'coupon') return 'Redeemed';
  if (e.status === 'requested') return `Waiting for ${v?.name ?? 'the place'} to pay${isDemo() ? ' (demo: switch to the owner demo to pay it)' : ''}`;
  if (e.status === 'paid') return `Paid${e.txHash ? ` · ${shortHash(e.txHash)}` : ''}`;
  if (e.status === 'rejected') return `Declined${e.note ? `: ${esc(e.note)}` : ''}, back in your balance`;
  return '';
}

export function walletView() {
  const b = wallet();
  const by = walletByVenue();
  const rows = Object.entries(by)
    .map(([id, x]) => ({ v: venue(id), id, ...x }))
    .filter((r) => r.v && (r.claimable > 0 || r.pending > 0))
    .sort((a, c) => c.claimable - a.claimable || c.pending - a.pending);
  const pending = state.ledger.filter((e) => e.type === 'reward' && e.status === 'pending').sort((a, c) => a.releaseAt - c.releaseAt);
  const html = `
  <div class="page">
    <div class="titlebar"><span></span><h1>Wallet</h1><button class="icon-btn" data-addr aria-label="Your NIM address">${icon('qr')}</button></div>
    <div class="two-col">
      <div class="col">
        <section class="balance">
          <span class="eyebrow">Ready to cash out</span>
          <div class="amt"><b>${formatNim(b.claimable)}</b><span>NIM</span></div>
          <div class="sub"><div><b>${formatNim(b.pending)}</b>unlocking</div><div><b>${formatNim(b.earned)}</b>earned, all time</div></div>
          ${isDemo() ? `<div class="acts"><a class="btn ghost" href="#/perks">${icon('gift')}Spend on perks</a></div>` : ''}
        </section>
        <section class="section">
          <div class="section-h"><h2>Owed to you <em>by place</em></h2><span class="eyebrow">each place pays its own</span></div>
          <div class="owed">
            ${rows.length ? rows.map((r) => `<div class="card owed-row"><div class="grow"><b class="ellipsis">${esc(r.v.name)}</b>
                <span class="tiny muted">${r.pending > 0 ? `${formatNim(r.pending)} unlocking · ` : ''}${esc(waitText(r.v))}</span></div>
              <span class="nim">${icon('hex')}${formatNim(r.claimable)}</span>
              <button class="btn sm ${r.claimable > 0 ? 'gold' : 'soft'}" data-cash="${r.id}" ${r.claimable > 0 ? '' : 'disabled'}>Cash out</button></div>`).join('')
              : `<div class="card empty">${icon('edit')}Nothing owed yet. Proven reviews earn NIM from the place you reviewed.</div>`}
          </div>
        </section>
        ${pending.length ? `<section class="section">
          <div class="section-h"><h2>Unlocking <em>soon</em></h2><span class="eyebrow">each place's wait</span></div>
          <div class="vest">${pending.map((e) => {
            const done = Math.min(100, Math.max(4, ((Date.now() - e.at) / Math.max(1, e.releaseAt - e.at)) * 100));
            return `<div class="card"><div class="row"><b class="grow ellipsis">${esc(e.label.replace('Review · ', ''))}</b><span class="nim">${icon('hex')}${formatNim(e.amount)}</span></div>
              <div class="track"><i style="width:${done}%"></i></div>
              <div class="foot"><span>${icon('lock')}Cancelled if a report is upheld</span><span>${daysLeft(e.releaseAt)} days left</span></div></div>`;
          }).join('')}</div></section>` : ''}
      </div>
      <div class="col">
        <section class="section">
          <div class="section-h"><h2>Activity</h2></div>
          <div class="card ledger">
            ${state.ledger.length ? '' : `<div class="empty">${icon('edit')}No activity yet. Proven reviews earn NIM here.</div>`}
            ${state.ledger.slice().sort((a, c) => c.at - a.at).map((e) => {
              const k = KIND[e.type];
              const plus = e.type === 'reward';
              const dim = e.status === 'voided' || e.status === 'rejected';
              return `<div class="tx"><span class="ic" style="background:${k.bg};color:${k.c}">${icon(k.icon)}</span>
                <div class="grow"><b class="ellipsis">${esc(e.label)}</b><span class="tiny muted">${timeAgo(e.at)} · ${statusOf(e)}</span></div>
                <span class="amt ${plus ? (dim ? 'void' : 'plus') : dim ? 'void' : ''}">${plus ? '+' : '−'}${formatNim(e.amount)}</span></div>`;
            }).join('')}
          </div>
        </section>
      </div>
    </div>
  </div>`;

  function mount(root) {
    root.querySelectorAll('[data-cash]').forEach((btn) => btn.addEventListener('click', () => cashOutSheet(btn.dataset.cash, () => dispatchEvent(new Event('nr:refresh')))));
    root.querySelector('[data-addr]').addEventListener('click', () =>
      openSheet(
        `<h2>Your NIM address</h2><p class="lead">Cash-outs are sent to this wallet. It is also your account: if you lose the wallet, you lose the account.</p>
         <div class="coupon-big"><span class="tiny muted">${isLive() ? 'Your Nimiq wallet' : 'Demo wallet'}</span><code style="font-size:16px;letter-spacing:.04em">${esc(formatAddress(me().nimAddress))}</code></div>
         <div class="stack"><button class="btn block" data-copy>${icon('copy')}Copy address</button><button class="btn block soft" data-close>Done</button></div>`,
        (p) => p.querySelector('[data-copy]').addEventListener('click', () => copy(formatAddress(me().nimAddress))),
      ),
    );
  }
  return { html, mount, tab: 'wallet' };
}

export function cashOutSheet(venueId, done) {
  const v = venue(venueId);
  const owed = walletByVenue()[venueId]?.claimable ?? 0;
  openSheet(
    `<h2>Cash out from ${esc(v.name)}</h2>
     <p class="lead">${esc(v.name)} pays you from its own Nimiq wallet. They approve it, send the NIM, and the app confirms the payment on the Nimiq network before it counts as paid.</p>
     <div class="stack">
       <label class="field">${icon('hex')}<input id="amt" class="plain" type="number" inputmode="decimal" min="0.1" step="0.1" max="${owed}" value="${owed}" aria-label="Amount"><span class="small muted">of ${formatNim(owed)}</span></label>
       <div class="coupon-big"><span class="tiny muted">Sent to your wallet</span><code style="font-size:13px;letter-spacing:.03em">${esc(formatAddress(me().nimAddress))}</code></div>
       <div class="verdict warn">${icon('info')}<span>${isLive() ? 'This sends a request to the place. You are paid when they send it, so it can take a while. If they decline, the NIM goes back to your balance.' : 'Demo: nothing real moves. Switch to the owner demo (log out, then "Demo as an owner") to pay this request.'}</span></div>
       <button class="btn block gold" data-go>Ask ${esc(v.name)} to pay</button>
       <button class="btn block soft" data-close>Cancel</button>
     </div>`,
    (p) => {
      const go = p.querySelector('[data-go]');
      go.addEventListener('click', async () => {
        const amt = Math.round(Number(p.querySelector('#amt').value) * 10) / 10;
        go.disabled = true;
        let r;
        try {
          r = await cashOut(venueId, amt);
        } catch (x) {
          r = { ok: false, reason: esc(x.message) };
        }
        go.disabled = false;
        if (!r.ok) return toast(r.reason);
        closeSheet();
        toast(`${icon('check')} Asked ${esc(v.name)} to pay ${formatNim(amt)} NIM`);
        setTimeout(done, 300);
      });
    },
  );
}
