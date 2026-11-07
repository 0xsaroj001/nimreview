import { state, wallet, me, cashOut, daysLeft } from '../store.js';
import { esc, icon, timeAgo, openSheet, closeSheet, toast, copy } from '../ui.js';
import { formatNim, isValidAddress, formatAddress, shortAddress } from '../core/nimiq.js';
import { isLive } from '../session.js';

const KIND = {
  reward: { icon: 'edit', bg: 'var(--sage-soft)', c: 'var(--sage)' },
  coupon: { icon: 'gift', bg: 'var(--gold-soft)', c: 'var(--gold-deep)' },
  cashout: { icon: 'share', bg: 'var(--sky-soft)', c: 'var(--sky)' },
};

export function walletView() {
  const b = wallet();
  const pending = state.ledger.filter((e) => e.type === 'reward' && e.status === 'pending').sort((a, c) => a.releaseAt - c.releaseAt);
  const html = `
  <div class="page">
    <div class="titlebar"><span></span><h1>Wallet</h1><button class="icon-btn" data-addr aria-label="Your NIM address">${icon('qr')}</button></div>
    <div class="two-col">
      <div class="col">
        <section class="balance">
          <span class="eyebrow">Claimable now</span>
          <div class="amt"><b>${formatNim(b.claimable)}</b><span>NIM</span></div>
          <div class="sub"><div><b>${formatNim(b.pending)}</b>unlocking</div><div><b>${formatNim(b.earned)}</b>earned, all time</div></div>
          <div class="acts"><button class="btn gold" data-cashout>${icon('share')}Cash out</button><a class="btn ghost" href="#/perks">${icon('gift')}Spend on perks</a></div>
        </section>
        <section class="section">
          <div class="section-h"><h2>Unlocking <em>soon</em></h2><span class="eyebrow">holding period</span></div>
          <div class="vest">
            ${pending.length ? pending.map((e) => {
              const done = Math.min(100, Math.max(4, ((Date.now() - e.at) / (e.releaseAt - e.at)) * 100));
              return `<div class="card"><div class="row"><b class="grow ellipsis">${esc(e.label.replace('Review · ', ''))}</b><span class="nim">${icon('hex')}${formatNim(e.amount)}</span></div>
                <div class="track"><i style="width:${done}%"></i></div>
                <div class="foot"><span>${icon('lock')}Cancelled if a report is upheld</span><span>${daysLeft(e.releaseAt)} days left</span></div></div>`;
            }).join('') : `<div class="card empty">${icon('clock')}Nothing unlocking. Rewards wait 3–14 days, depending on account history.</div>`}
          </div>
        </section>
      </div>
      <div class="col">
        <section class="section">
          <div class="section-h"><h2>Activity</h2></div>
          <div class="card ledger">
            ${state.ledger.length ? '' : `<div class="empty">${icon('edit')}No activity yet. Proven reviews earn NIM here.</div>`}
            ${state.ledger.slice().sort((a, c) => c.at - a.at).map((e) => {
              const k = KIND[e.type];
              const plus = e.type === 'reward';
              const status = plus ? { pending: 'Unlocking', claimable: 'Claimable', voided: 'Cancelled' }[e.status] : e.type === 'cashout' ? (e.status === 'requested' ? 'Requested, not sent on-chain yet' : 'Demo, nothing sent') : 'Redeemed';
              return `<div class="tx"><span class="ic" style="background:${k.bg};color:${k.c}">${icon(k.icon)}</span>
                <div class="grow"><b class="ellipsis">${esc(e.label)}</b><span class="tiny muted">${timeAgo(e.at)} · ${status}</span></div>
                <span class="amt ${plus ? (e.status === 'voided' ? 'void' : 'plus') : ''}">${plus ? '+' : '−'}${formatNim(e.amount)}</span></div>`;
            }).join('')}
          </div>
        </section>
      </div>
    </div>
  </div>`;

  function mount(root) {
    root.querySelector('[data-cashout]').addEventListener('click', () => cashOutSheet(() => dispatchEvent(new Event('nr:refresh'))));
    root.querySelector('[data-addr]').addEventListener('click', () =>
      openSheet(
        `<h2>Your NIM address</h2><p class="lead">Cash-outs are paid to this address.</p>
         <div class="coupon-big"><span class="tiny muted">${isLive() ? 'Connected wallet' : 'Demo wallet'}</span><code style="font-size:16px;letter-spacing:.04em">${esc(formatAddress(me().nimAddress))}</code></div>
         <div class="stack"><button class="btn block" data-copy>${icon('copy')}Copy address</button>${isLive() ? `<a class="btn block ghost" href="#/connect">${icon('switch')}Change wallet</a>` : ''}<button class="btn block soft" data-close>Done</button></div>`,
        (p) => p.querySelector('[data-copy]').addEventListener('click', () => copy(formatAddress(me().nimAddress))),
      ),
    );
  }
  return { html, mount, tab: 'wallet' };
}

export function cashOutSheet(done) {
  const b = wallet();
  openSheet(
    `<h2>Cash out NIM</h2>
     <p class="lead">Send claimable NIM to any Nimiq wallet. Rewards still unlocking can't be cashed out yet.</p>
     <div class="stack">
       <label class="field">${icon('hex')}<input id="amt" class="plain" type="number" inputmode="decimal" min="1" step="0.1" max="${b.claimable}" value="${b.claimable}" aria-label="Amount"><span class="small muted">of ${formatNim(b.claimable)}</span></label>
       <label class="field">${icon('wallet')}<input id="addr" value="${esc(formatAddress(me().nimAddress))}" aria-label="Nimiq address" autocomplete="off" spellcheck="false" style="font-size:13px" ${isLive() ? 'readonly' : ''}></label>
       <div id="addr-state" class="verdict ok">${icon('check')}<span>${isLive() ? 'Your connected wallet' : 'Valid Nimiq address'}</span></div>
       <div class="verdict warn">${icon('info')}<span>${isLive() ? 'This records a payout request to your connected wallet. Sending NIM on-chain is not built yet, so nothing arrives in your wallet today.' : 'Demo: no NIM moves. In production the rewards treasury signs and sends this payout on-chain.'}</span></div>
       <button class="btn block gold" data-go>Cash out</button>
       <button class="btn block soft" data-close>Cancel</button>
     </div>`,
    (p) => {
      const addr = p.querySelector('#addr');
      const st = p.querySelector('#addr-state');
      const go = p.querySelector('[data-go]');
      addr.addEventListener('input', () => {
        const ok = isValidAddress(addr.value);
        st.className = `verdict ${ok ? 'ok' : 'bad'}`;
        st.innerHTML = `${icon(ok ? 'check' : 'alert')}<span>${ok ? 'Valid Nimiq address' : 'Not a valid Nimiq address (format or checksum)'}</span>`;
        go.disabled = !ok;
      });
      go.addEventListener('click', async () => {
        const amt = Math.round(Number(p.querySelector('#amt').value) * 10) / 10;
        go.disabled = true;
        let r;
        try {
          r = await cashOut(amt, formatAddress(addr.value));
        } catch (x) {
          r = { ok: false, reason: esc(x.message) };
        }
        go.disabled = false;
        if (!r.ok) return toast(r.reason);
        closeSheet();
        toast(`${icon('check')} ${formatNim(amt)} NIM to ${esc(shortAddress(addr.value))} (${isLive() ? 'requested' : 'demo'})`);
        setTimeout(done, 300);
      });
    },
  );
}
