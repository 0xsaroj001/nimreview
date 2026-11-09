// First screen. One way in for real accounts: sign in with your Nimiq wallet. A new wallet is then asked for the
// only two things setup needs: reviewer or owner (and an optional display name). Two demos need no wallet.
import { signIn } from '../session.js';
import { signInWith, createAccount } from '../walletauth.js';
import { inNimiqPay, openInNimiqPayUrl } from '../nimiqpay.js';
import { esc, icon, toast } from '../ui.js';
import { shortAddress } from '../core/nimiq.js';

const MOBILE = /Android|iPhone|iPad|iPod/i;
const ROLE_CARDS = [
  { id: 'customer', icon: 'edit', title: 'I review places', desc: 'Prove your visit with the bill code, write something useful, earn NIM.' },
  { id: 'venue', icon: 'store', title: 'I own a restaurant, café or hotel', desc: 'List your place, set what you pay per review, issue bill codes, pay your guests.' },
];

const ui = { step: 'start', role: 'customer', ticket: null, address: null, error: '', busy: false, autoTried: false };

function startHtml() {
  const pay = inNimiqPay();
  const phone = !pay && MOBILE.test(navigator.userAgent);
  return `
    <h2 class="auth-h">Sign in with <em>Nimiq</em></h2>
    <p class="small muted">Your Nimiq wallet is your account: no email, no password. You sign one free message to prove the wallet is yours. If you ever lose the wallet, the account is gone with it.</p>
    <div class="stack">
      ${pay
        ? `<button class="btn block gold" data-how="pay">${icon('wallet')}Continue with Nimiq Pay</button>`
        : `${phone ? `<a class="btn block gold" href="${esc(openInNimiqPayUrl())}">${icon('wallet')}Open in Nimiq Pay</a>
             <p class="tiny muted">Best on a phone: it signs you in inside the Nimiq Pay app without leaving it.</p>` : ''}
           <button class="btn block ${phone ? '' : 'gold'}" data-how="hub">${icon('wallet')}${phone ? 'Use Nimiq Hub instead' : 'Continue with Nimiq Hub'}</button>
           <p class="tiny muted">Opens hub.nimiq.com in a pop-up to sign a one-time message. Nothing is sent and nothing is paid.${phone ? ' In-app browsers may open it as a separate page instead.' : ''}</p>`}
    </div>`;
}

function roleHtml() {
  return `
    <h2 class="auth-h">Set up your <em>account</em></h2>
    <div class="verdict ok">${icon('check')}<span>Wallet <code>${esc(shortAddress(ui.address))}</code> verified.</span></div>
    <form class="auth-form" id="setup" novalidate>
      <span class="eyebrow">I am…</span>
      <div class="proofs" style="padding:0">
        ${ROLE_CARDS.map((r) => `
          <label class="proof ${ui.role === r.id ? 'on' : ''}">
            <input type="radio" name="role" value="${r.id}" ${ui.role === r.id ? 'checked' : ''} class="sr-only">
            <span class="ic m-receipt">${icon(r.icon)}</span>
            <div class="grow"><b>${r.title}</b><p>${r.desc}</p></div>
          </label>`).join('')}
      </div>
      <label class="field">${icon('user')}<input class="plain" name="name" autocomplete="name" placeholder="${ui.role === 'venue' ? 'Your name or the owner' : 'Display name (optional)'}" maxlength="40"></label>
      <button class="btn block gold" type="submit">Create my account</button>
      <button class="btn block soft" type="button" data-back>Use a different wallet</button>
    </form>`;
}

export function authView() {
  const html = `
  <div class="page auth">
    <section class="auth-hero">
      <a class="logo" href="#/">${icon('hex')}<span>Nim<em>review</em></span></a>
      <h1>Reviews from people who <em>actually</em> went.</h1>
      <p>Reviewers prove the visit with a single-use bill code and earn NIM for a useful review, whatever the stars. Owners set what they pay per review and when it can be cashed out.</p>
      <div class="demo-box card">
        <span class="eyebrow">Try it first, no wallet needed</span>
        <p class="small muted">Demo data and demo NIM only. Nothing real is paid or stored, and it disappears when you close the tab.</p>
        <div class="demo-btns">
          <button class="btn" data-demo="customer">${icon('user')}Demo as a reviewer</button>
          <button class="btn ghost" data-demo="venue">${icon('store')}Demo as an owner</button>
        </div>
      </div>
    </section>
    <section class="auth-card card" id="auth-card"></section>
  </div>`;

  function mount(root) {
    const card = root.querySelector('#auth-card');
    const draw = () => {
      card.innerHTML = `${ui.step === 'role' ? roleHtml() : startHtml()}<div id="auth-err">${ui.error ? `<div class="verdict bad">${icon('alert')}<span>${esc(ui.error)}</span></div>` : ''}</div>`;
      bind();
    };
    const fail = (x) => {
      ui.error = x?.cancelled ? '' : x?.message || 'Could not sign in';
      if (x?.cancelled) toast('You declined, nothing was signed');
      ui.busy = false;
      draw();
    };

    const run = async (how) => {
      if (ui.busy) return;
      ui.busy = true;
      ui.error = '';
      card.querySelectorAll('button').forEach((b) => (b.disabled = true));
      try {
        const next = await signInWith(how);
        ui.busy = false;
        if (next) {
          Object.assign(ui, { step: 'role', ticket: next.ticket, address: next.address });
          draw();
        }
      } catch (x) {
        fail(x);
      }
    };

    function bind() {
      card.querySelectorAll('[data-how]').forEach((b) => b.addEventListener('click', () => run(b.dataset.how)));
      card.querySelector('[data-back]')?.addEventListener('click', () => {
        Object.assign(ui, { step: 'start', ticket: null, address: null, error: '' });
        draw();
      });
      card.querySelectorAll('input[name=role]').forEach((r) =>
        r.addEventListener('change', () => {
          ui.role = r.value;
          const name = card.querySelector('[name=name]').value;
          draw();
          card.querySelector('[name=name]').value = name;
        }),
      );
      card.querySelector('#setup')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (ui.busy) return;
        ui.busy = true;
        const name = e.currentTarget.name.value.trim();
        card.querySelectorAll('button').forEach((b) => (b.disabled = true));
        try {
          await createAccount({ ticket: ui.ticket, role: ui.role, name });
          Object.assign(ui, { step: 'start', ticket: null, address: null, busy: false });
        } catch (x) {
          // the ticket lasts 15 minutes; after that the wallet has to sign again
          if (/expired|not valid/i.test(x.message)) Object.assign(ui, { step: 'start', ticket: null, address: null });
          fail(x);
        }
      });
    }
    draw();

    // inside Nimiq Pay there is nothing to choose: ask for the signature straight away, once
    if (inNimiqPay() && ui.step === 'start' && !ui.autoTried) {
      ui.autoTried = true;
      run('pay');
    }
    root.querySelectorAll('[data-demo]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await signIn('/auth/demo', { role: b.dataset.demo });
        } catch (x) {
          toast(esc(x.message));
          b.disabled = false;
        }
      }),
    );
  }
  return { html, mount, tabs: false };
}
