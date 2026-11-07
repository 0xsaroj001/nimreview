// First screen: sign in, create a live account (customer or venue), or open one of the two demos.
import { signIn } from '../session.js';
import { esc, icon, toast } from '../ui.js';

const ui = { tab: 'login', role: 'customer' };

const ROLE_CARDS = [
  { id: 'customer', icon: 'edit', title: 'I review places', desc: 'Prove your visit with the bill code, write something useful, earn NIM.' },
  { id: 'venue', icon: 'store', title: 'I run a restaurant, café or hotel', desc: 'List your place, set what you pay per review, issue bill codes.' },
];

function formHtml() {
  const signup = ui.tab === 'signup';
  return `
    <div class="chips auth-tabs" role="tablist">
      <button class="chip ${signup ? '' : 'on'}" data-tab-auth="login" role="tab" aria-selected="${!signup}">Sign in</button>
      <button class="chip ${signup ? 'on' : ''}" data-tab-auth="signup" role="tab" aria-selected="${signup}">Create account</button>
    </div>
    <form class="auth-form" id="auth-form" novalidate>
      ${signup ? `
        <div class="proofs" style="padding:0">
          ${ROLE_CARDS.map((r) => `
            <label class="proof ${ui.role === r.id ? 'on' : ''}">
              <input type="radio" name="role" value="${r.id}" ${ui.role === r.id ? 'checked' : ''} class="sr-only">
              <span class="ic m-receipt">${icon(r.icon)}</span>
              <div class="grow"><b>${r.title}</b><p>${r.desc}</p></div>
            </label>`).join('')}
        </div>
        <label class="field">${icon('user')}<input class="plain" name="name" autocomplete="name" placeholder="${ui.role === 'venue' ? 'Your name (owner or manager)' : 'Your name'}" maxlength="60" required></label>` : ''}
      <label class="field">${icon('info')}<input class="plain" name="email" type="email" autocomplete="email" placeholder="Email" required></label>
      <label class="field">${icon('lock')}<input class="plain" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'Password, 8+ characters' : 'Password'}" minlength="8" required></label>
      <div id="auth-err"></div>
      <button class="btn block gold" type="submit">${signup ? 'Create account' : 'Sign in'}</button>
      ${signup ? `<p class="tiny muted">Next you connect a Nimiq wallet. ${ui.role === 'venue' ? 'Guests pay you there.' : 'Rewards are paid there.'}</p>` : ''}
    </form>`;
}

export function authView() {
  const html = `
  <div class="page auth">
    <section class="auth-hero">
      <a class="logo" href="#/">${icon('hex')}<span>Nim<em>review</em></span></a>
      <h1>Reviews from people who <em>actually</em> went.</h1>
      <p>Guests prove the visit with a single-use bill code and earn NIM for a useful review, whatever the stars. Venues set what they pay per review.</p>
      <div class="demo-box card">
        <span class="eyebrow">Try it first, no sign-up</span>
        <p class="small muted">Demo data and demo NIM only. Nothing real is paid or stored on the server.</p>
        <div class="demo-btns">
          <button class="btn" data-demo="customer">${icon('user')}Demo as a guest</button>
          <button class="btn ghost" data-demo="venue">${icon('store')}Demo as a venue</button>
        </div>
      </div>
    </section>
    <section class="auth-card card" id="auth-card">${formHtml()}</section>
  </div>`;

  function mount(root) {
    const card = root.querySelector('#auth-card');
    const bind = () => {
      card.querySelectorAll('[data-tab-auth]').forEach((b) =>
        b.addEventListener('click', () => {
          ui.tab = b.dataset.tabAuth;
          card.innerHTML = formHtml();
          bind();
        }),
      );
      card.querySelectorAll('input[name=role]').forEach((r) =>
        r.addEventListener('change', () => {
          const keep = Object.fromEntries(new FormData(card.querySelector('form')));
          ui.role = r.value;
          card.innerHTML = formHtml();
          for (const [k, v] of Object.entries(keep)) if (k !== 'role' && card.querySelector(`[name=${k}]`)) card.querySelector(`[name=${k}]`).value = v;
          bind();
        }),
      );
      const form = card.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(form));
        const err = card.querySelector('#auth-err');
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          if (ui.tab === 'signup') await signIn('/auth/signup', { name: f.name, email: f.email, password: f.password, role: ui.role });
          else await signIn('/auth/login', { email: f.email, password: f.password });
        } catch (x) {
          err.innerHTML = `<div class="verdict bad">${icon('alert')}<span>${esc(x.message)}</span></div>`;
          btn.disabled = false;
        }
      });
    };
    bind();
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
