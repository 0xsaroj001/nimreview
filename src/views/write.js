import { state, venue, me, distanceKm, evaluateDraft, submitReview, recordCheckin } from '../store.js';
import { esc, icon, km, TYPE_LABEL, toast, dHash } from '../ui.js';
import { verifyProof, POLICY } from '../core/genuine.js';
import { formatNim } from '../core/nimiq.js';

let d = null;
const fresh = (venueId) => ({
  venueId, step: 1, method: null, proof: { method: 'none' }, proofResult: null,
  rating: 0, aspects: { food: 0, service: 0, ambience: 0, value: 0 }, text: '',
  composition: { composeMs: 0, typedChars: 0, pastedChars: 0 }, startedAt: null, photos: [], outcome: null,
});
const LABELS = ['', 'Poor', 'Below average', 'Okay', 'Good', 'Excellent'];
const ASPECT_LABEL = { food: 'Food & drink', service: 'Service', ambience: 'Ambience', value: 'Value' };
const scoreColor = (s) => (s >= POLICY.minRewardScore ? 'var(--sage)' : s >= 35 ? 'var(--gold)' : 'var(--paprika)');

// ---------- venue picker ----------
function picker() {
  const items = state.venues.map((v) => ({ v, d: distanceKm(v) })).sort((a, b) => a.d - b.d);
  return {
    tabs: false,
    html: `
    <div class="page write-col">
      <div class="titlebar"><a class="icon-btn" href="#/" aria-label="Close">${icon('x')}</a><h1>New review</h1><span></span></div>
      <div class="page-head"><h2>Where did you <em>go?</em></h2><p>Pick the place you visited. Next you prove the visit, then write.</p></div>
      <div class="list" style="margin-top:12px;grid-template-columns:minmax(0,1fr)">
        ${items.map(({ v, d }, i) => `<a class="lrow" href="#/write/${v.id}"><span class="num">${String(i + 1).padStart(2, '0')}</span><div class="thumb" style="background-image:url('${v.img.replace('w=900', 'w=300')}')"></div><div class="grow"><h3 class="ellipsis">${esc(v.name)}</h3><div class="meta">${TYPE_LABEL[v.type]} · ${esc(v.cuisine)}</div></div><span class="dist">${km(d)}</span></a>`).join('')}
      </div>
    </div>`,
  };
}

// ---------- step 1: proof ----------
const PROOFS = [
  { id: 'payment', icon: 'hex', title: 'Paid with NIM', strength: 'Strongest', sc: 'm-pay', desc: 'We match an on-chain payment from your wallet to this venue in the last 7 days.' },
  { id: 'receipt', icon: 'receipt', title: 'Receipt code', strength: 'Strong', sc: 'm-receipt', desc: 'The single-use code printed on your bill. Valid for 72 hours.' },
  { id: 'checkin', icon: 'pin', title: 'Location check-in', strength: 'Weak', sc: 'm-checkin', desc: `Within ${POLICY.geofenceMeters} m for ${POLICY.minDwellMinutes}+ min. Only pays established accounts.` },
];

function proofForm(p, v) {
  if (p.id === 'receipt') {
    const demo = state.receipts.find((r) => r.venueId === v.id && !r.usedBy);
    return `<div class="form">
      <label class="field">${icon('receipt')}<input id="code" placeholder="e.g. K7Q2M-9XH4T" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(d.proof.method === 'receipt' ? d.proof.code : '')}"></label>
      <button class="btn sm" data-verify="receipt">Check code</button>
      <div class="hint">${demo ? `Demo: <button data-demo-code="${demo.code}">use today's bill code</button> or issue one in the owner view.` : 'Demo: issue a code for this venue in the owner view.'}</div>
    </div>`;
  }
  if (p.id === 'payment') {
    const tx = state.transactions.find((t) => t.recipient === v.nimAddress && t.sender === me().nimAddress && !t.usedBy);
    return `<div class="form">
      <label class="field">${icon('hex')}<input id="tx" placeholder="Transaction hash" autocomplete="off" spellcheck="false" value="${esc(d.proof.method === 'payment' ? d.proof.txHash : '')}"></label>
      <button class="btn sm" data-verify="payment">Find payment</button>
      <div class="hint">${tx ? `Demo: <button data-demo-tx="${tx.hash}">use my ${formatNim(tx.valueNim)} NIM payment</button> to this venue.` : 'No unused payment from your demo wallet to this venue.'}</div>
    </div>`;
  }
  return `<div class="form">
    <button class="btn sm" data-gps>${icon('crosshair')}Check in with GPS</button>
    <div class="hint">Demo: <button data-sim>simulate a 45-min visit here</button>. Real GPS fails outside Bengaluru.</div>
  </div>`;
}

function verdict(res) {
  if (!res) return '';
  const cls = res.ok ? (res.rewardable ? 'ok' : 'warn') : 'bad';
  return `<div class="verdict ${cls}">${icon(res.ok ? 'check' : 'alert')}<span>${esc(res.detail)}</span></div>`;
}
const canContinue = () => d.method === 'none' || (d.proofResult && d.proofResult.ok);

function step1() {
  const v = venue(d.venueId);
  return `
    <div class="page-head"><h2>First, prove you <em>were there.</em></h2><p>Only proven visits earn NIM. You can still post without proof; it shows as unverified.</p></div>
    <div class="proofs">
      ${PROOFS.map((p) => `
        <div class="proof ${d.method === p.id ? 'on' : ''}" data-method="${p.id}" role="button" tabindex="0">
          <span class="ic ${p.sc}">${icon(p.icon)}</span>
          <div class="grow">
            <b>${p.title} <span class="strength ${p.sc}">${p.strength}</span></b>
            <p>${p.desc}</p>
            ${d.method === p.id ? proofForm(p, v) + `<div id="verdict" style="margin-top:9px">${verdict(d.proofResult)}</div>` : ''}
          </div>
        </div>`).join('')}
      <button class="proof skip ${d.method === 'none' ? 'on' : ''}" data-method="none">
        <span class="ic m-none">${icon('info')}</span>
        <div class="grow"><b>Post without proof</b><p>Shown as unverified, counts 25% in the rating, earns nothing.</p></div>
      </button>
    </div>
    <div class="cta-bar"><div class="inner"><button class="btn block" data-next ${canContinue() ? '' : 'disabled'}>Continue${icon('chevron-right')}</button></div></div>`;
}

// ---------- step 2: write ----------
const composed = () => ({ ...d, composition: { ...d.composition, composeMs: d.startedAt ? Date.now() - d.startedAt : 0 } });

function meterHtml(r) {
  const next = r.blockers.find((b) => !b.startsWith('Genuineness')) || r.blockers[0];
  return `
    <div class="head"><b>Genuineness</b><span class="val">${r.score}<small> /100</small></span></div>
    <div class="gauge"><i style="width:${r.score}%;background:${scoreColor(r.score)}"></i><span class="th" style="left:${POLICY.minRewardScore}%"></span></div>
    <div class="gauge-legend"><span>${r.rewardable ? `Earns about ${formatNim(r.reward.amount)} NIM` : 'Not earning yet'}</span><span>${POLICY.minRewardScore} needed</span></div>
    <div class="checks">
      ${r.checks.filter((c) => c.id !== 'limits' || c.state !== 'pass').map((c) => `
        <div class="check ${c.state}"><span class="dot">${icon(c.state === 'pass' ? 'check' : c.state === 'warn' ? 'info' : 'x')}</span>
          <div class="grow"><b>${c.label}</b><span>${esc(c.detail)}</span></div>
          ${c.max ? `<span class="pts">${Math.round(c.points)}/${c.max}</span>` : ''}
        </div>`).join('')}
    </div>
    ${next && !r.rewardable ? `<div class="verdict warn" style="margin-top:14px">${icon('info')}<span>${esc(next)}</span></div>` : ''}`;
}

const miniHtml = (r) => `<span>Genuineness <b>${r.score}</b></span>
    <span class="mm-track"><i style="width:${r.score}%;background:${scoreColor(r.score)}"></i><span class="th" style="left:${POLICY.minRewardScore}%"></span></span>
    <span>${r.rewardable ? `≈ ${formatNim(r.reward.amount)} NIM` : 'No reward yet'}</span>`;

function promptsHtml(v) {
  const t = d.text.toLowerCase();
  return `<span class="lbl">Mention what you had</span>${v.menu.slice(0, 5).map((m) => `<span class="${t.includes(m) ? 'hit' : ''}">${t.includes(m) ? '✓ ' : ''}${esc(m)}</span>`).join('')}`;
}

const starButtons = (value, attr) => [1, 2, 3, 4, 5].map((n) => `<button class="${n <= value ? 'on' : ''}" ${attr}="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${icon('star')}</button>`).join('');

const photosHtml = () => `${d.photos.map((p, i) => `<div class="ph" style="background-image:url('${p.url}')"><button data-rm="${i}" aria-label="Remove photo">${icon('x')}</button></div>`).join('')}
    ${d.photos.length < 3 ? `<label class="add">${icon('camera')}Add photo<input type="file" accept="image/*" id="file" hidden></label>` : ''}`;

function step2() {
  const v = venue(d.venueId);
  const r = evaluateDraft(composed());
  return `
    <div class="page-head"><h2>How was it, <em>honestly?</em></h2><p>Your stars don't change your reward. A fair 2★ earns the same as a 5★.</p></div>
    <section class="rate-card card">
      <div class="rate-big" id="rate-big">${starButtons(d.rating, 'data-rate')}</div>
      <div class="rate-label" id="rate-label">${LABELS[d.rating] || 'Tap to rate'}</div>
      <div class="aspect-rate">
        ${Object.keys(d.aspects).map((k) => `<div class="row"><span>${ASPECT_LABEL[k]}</span><div class="mini-stars" data-aspect="${k}">${starButtons(d.aspects[k], 'data-a')}</div></div>`).join('')}
      </div>
    </section>
    <section class="compose card">
      <label for="text">Tell people what it was like</label>
      <textarea id="text" placeholder="What did you order? How long was the wait? Anything the next person should know?">${esc(d.text)}</textarea>
      <div class="counter"><span id="count">${d.text.length} characters</span><span>${POLICY.fullChars}+ for full points</span></div>
      <div class="prompts" id="prompts">${promptsHtml(v)}</div>
      <div class="photos-add" id="photos">${photosHtml()}</div>
    </section>
    <section class="meter card" id="meter">${meterHtml(r)}</section>
    <div class="cta-bar"><div class="inner">
      <div class="mini-meter" id="mini">${miniHtml(r)}</div>
      <button class="btn block gold" data-submit ${d.rating && d.text.trim() ? '' : 'disabled'}>${icon('check')}Post review</button>
    </div></div>`;
}

// ---------- step 3: result receipt ----------
function step3() {
  const v = venue(d.venueId);
  const { result, review } = d.outcome;
  const stamp = result.status === 'rejected' ? ['bad', 'Rejected'] : result.rewardable ? ['ok', 'Rewarded'] : result.status === 'verified' ? ['warn', 'Verified'] : ['warn', 'Unverified'];
  const title = {
    rejected: 'Not <em>published.</em>',
    unverified: 'Posted, <em>unverified.</em>',
    verified: result.rewardable ? 'Posted. <em>Reward pending.</em>' : 'Posted as a <em>proven visit.</em>',
  }[result.status];
  const sub = {
    rejected: 'This review failed a hard check. Nothing was posted and nothing was paid.',
    unverified: 'It is visible, marked unverified, and counts 25% in the rating.',
    verified: result.rewardable ? 'Your visit is proven and your review is specific enough to earn.' : 'Your visit is proven, but this review does not earn. Reasons below.',
  }[result.status];
  const unlock = new Date(result.reward.releaseAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const when = new Date(review.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const lineVal = (c) => (c.max ? `${Math.round(c.points)}/${c.max}` : c.state === 'pass' ? 'PASS' : c.state === 'fail' ? 'FAIL' : 'NOTE');
  return `
    <div class="result-head"><h2>${title}</h2><p>${sub}</p></div>
    <div class="receipt-wrap"><div class="receipt">
      <div class="r-head"><span class="logo">${icon('hex')}<span>Nim<em>review</em></span></span><small>Genuineness receipt</small><small>${esc(v.name)} · ${when}</small></div>
      <div class="r-rule"></div>
      ${result.checks.map((c) => `<div class="r-line ${c.state}"><span>${esc(c.label)}</span><span class="lead"></span><span class="v">${lineVal(c)}</span></div>`).join('')}
      <div class="r-rule"></div>
      <div class="r-total"><span>TOTAL</span><span class="r-stamp ${stamp[0]}">${stamp[1]}</span><b>${result.score}<span class="muted" style="font-size:16px">/100</span></b></div>
      ${result.rewardable
        ? `<div class="r-reward">${icon('hex')}<span><b>+${formatNim(result.reward.amount)} NIM</b>Unlocks ${unlock} unless a report is upheld. Your stars did not affect this.</span></div>`
        : `<div class="r-reward zero">${icon('info')}<span><b>0 NIM</b>${result.status === 'rejected' ? 'Rejected reviews earn nothing.' : 'This review does not earn.'}</span></div>`}
      <div class="barcode"></div>
      <div class="r-foot">${esc(review.id.toUpperCase())}</div>
    </div></div>
    ${result.blockers.length ? `<section class="blockers card"><h3>${result.rewardable ? 'Notes' : 'Why it did not earn'}</h3><ul>${result.blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>` : ''}
    <div class="stack-actions">
      ${result.status !== 'rejected' ? `<a class="btn block" href="#/venue/${d.venueId}">See it on the venue page</a>` : `<button class="btn block" data-edit>Edit and try again</button>`}
      <a class="btn block ghost" href="#/wallet">${icon('wallet')}Open wallet</a>
    </div>`;
}

// ---------- view ----------
export function writeView({ id, entering = false }) {
  if (!id) return picker();
  const v = venue(id);
  if (!v) return picker();
  if (!d || d.venueId !== id || (entering && d.step === 3)) d = fresh(id);

  const body = d.step === 1 ? step1() : d.step === 2 ? step2() : step3();
  const html = `
  <div class="page write-col">
    <div class="titlebar">
      <button class="icon-btn" data-back aria-label="Back">${icon(d.step === 3 ? 'x' : 'back')}</button>
      <h1>${d.step === 3 ? 'Your receipt' : `Step ${d.step} of 2`}</h1><span></span>
    </div>
    ${d.step < 3 ? `<div class="steps" aria-hidden="true"><i class="on"></i><i class="${d.step >= 2 ? 'on' : ''}"></i></div>
    <div class="w-venue"><div class="thumb" style="background-image:url('${v.img.replace('w=900', 'w=200')}')"></div><div class="grow"><b class="ellipsis">${esc(v.name)}</b><div class="small muted ellipsis">${esc(v.cuisine)} · ${esc(v.address)}</div></div></div>` : ''}
    ${body}
  </div>`;

  function rerender(root) {
    const view = writeView({ id });
    root.innerHTML = view.html;
    view.mount(root);
    scrollTo({ top: 0, behavior: 'instant' });
  }

  function mount(root) {
    root.querySelector('[data-back]').addEventListener('click', () => {
      if (d.step === 2) {
        d.step = 1;
        return rerender(root);
      }
      if (d.step === 3) d = null;
      location.hash = `#/venue/${id}`;
    });
    if (d.step === 1) mountStep1(root, v, () => rerender(root));
    if (d.step === 2) mountStep2(root, v, () => rerender(root));
    root.querySelector('[data-edit]')?.addEventListener('click', () => {
      d.step = 2;
      d.outcome = null;
      rerender(root);
    });
  }
  return { html, mount, tabs: false };
}

const check = (v) => verifyProof(d.proof, { venue: v, account: me(), now: Date.now(), receipts: state.receipts, transactions: state.transactions });

function mountStep1(root, v, rerender) {
  root.querySelectorAll('[data-method]').forEach((el) => {
    const pick = (e) => {
      if (e.target.closest('.form')) return;
      const m = el.dataset.method;
      if (d.method === m) return;
      d.method = m;
      d.proof = { method: m };
      d.proofResult = null;
      rerender();
    };
    el.addEventListener('click', pick);
    el.addEventListener('keydown', (e) => e.key === 'Enter' && e.target === el && pick(e));
  });
  const show = (res) => {
    d.proofResult = res;
    root.querySelector('#verdict').innerHTML = verdict(res);
    root.querySelector('[data-next]').disabled = !canContinue();
  };
  const verifyWith = (proof) => {
    d.proof = proof;
    show(check(v));
  };
  root.querySelector('[data-verify="receipt"]')?.addEventListener('click', () => verifyWith({ method: 'receipt', code: root.querySelector('#code').value }));
  root.querySelector('#code')?.addEventListener('keydown', (e) => e.key === 'Enter' && verifyWith({ method: 'receipt', code: e.target.value }));
  root.querySelector('[data-demo-code]')?.addEventListener('click', (e) => {
    root.querySelector('#code').value = e.target.dataset.demoCode;
    verifyWith({ method: 'receipt', code: e.target.dataset.demoCode });
  });
  root.querySelector('[data-verify="payment"]')?.addEventListener('click', () => verifyWith({ method: 'payment', txHash: root.querySelector('#tx').value }));
  root.querySelector('[data-demo-tx]')?.addEventListener('click', (e) => {
    root.querySelector('#tx').value = e.target.dataset.demoTx;
    verifyWith({ method: 'payment', txHash: e.target.dataset.demoTx });
  });
  root.querySelector('[data-sim]')?.addEventListener('click', () => {
    const now = Date.now();
    const checkin = { lat: v.lat + 0.0002, lng: v.lng - 0.0001, accuracy: 18, arrivedAt: now - 47 * 60e3, leftAt: now - 2 * 60e3, simulated: true };
    recordCheckin(v.id, checkin);
    verifyWith({ method: 'checkin', checkin });
  });
  root.querySelector('[data-gps]')?.addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Location is not available in this browser');
    toast(`${icon('crosshair')} Getting your position…`);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const now = Date.now();
        // a real check-in records arrival here and confirms dwell time on leaving; this records arrival only
        verifyWith({ method: 'checkin', checkin: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, arrivedAt: now, leftAt: now } });
      },
      () => show({ ok: false, detail: 'Location unavailable (permission denied, or the page is not on HTTPS)' }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
  root.querySelector('[data-next]').addEventListener('click', () => {
    if (d.method === 'none') d.proof = { method: 'none' };
    d.step = 2;
    rerender();
  });
}

function mountStep2(root, v) {
  const meter = root.querySelector('#meter');
  const mini = root.querySelector('#mini');
  const submit = root.querySelector('[data-submit]');
  let t;
  const refresh = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const r = evaluateDraft(composed());
      meter.innerHTML = meterHtml(r);
      mini.innerHTML = miniHtml(r);
      submit.disabled = !(d.rating && d.text.trim());
    }, 120);
  };

  root.querySelector('#rate-big').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rate]');
    if (!b) return;
    d.rating = Number(b.dataset.rate);
    root.querySelectorAll('[data-rate]').forEach((x) => x.classList.toggle('on', Number(x.dataset.rate) <= d.rating));
    root.querySelector('#rate-label').textContent = LABELS[d.rating];
    navigator.vibrate?.(8);
    refresh();
  });
  root.querySelectorAll('[data-aspect]').forEach((g) =>
    g.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      d.aspects[g.dataset.aspect] = Number(b.dataset.a);
      g.querySelectorAll('[data-a]').forEach((x) => x.classList.toggle('on', Number(x.dataset.a) <= d.aspects[g.dataset.aspect]));
    }),
  );

  const ta = root.querySelector('#text');
  ta.addEventListener('paste', (e) => {
    d.composition.pastedChars += (e.clipboardData?.getData('text') || '').length;
  });
  ta.addEventListener('beforeinput', (e) => {
    if (!d.startedAt) d.startedAt = Date.now();
    if (/^insert(Text|CompositionText|ReplacementText)$/.test(e.inputType)) d.composition.typedChars += (e.data || '').length || 1;
    if (e.inputType === 'insertFromDrop') d.composition.pastedChars += (e.dataTransfer?.getData('text') || '').length;
  });
  ta.addEventListener('input', () => {
    d.text = ta.value;
    root.querySelector('#count').textContent = `${d.text.length} characters`;
    root.querySelector('#prompts').innerHTML = promptsHtml(v);
    refresh();
  });

  const photos = root.querySelector('#photos');
  photos.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await downscale(file);
    const hash = await dHash(url);
    d.photos.push({ url, hash });
    photos.innerHTML = photosHtml();
    refresh();
  });
  photos.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    d.photos.splice(Number(rm.dataset.rm), 1);
    photos.innerHTML = photosHtml();
    refresh();
  });

  submit.addEventListener('click', () => {
    d.composition.composeMs = d.startedAt ? Date.now() - d.startedAt : 0;
    d.outcome = submitReview(d);
    d.step = 3;
    if (d.outcome.result.rewardable) toast(`${icon('hex')} +${formatNim(d.outcome.result.reward.amount)} NIM pending`);
    navigator.vibrate?.([10, 40, 10]);
    const view = writeView({ id: v.id });
    root.innerHTML = view.html;
    view.mount(root);
    scrollTo({ top: 0, behavior: 'instant' });
  });
}

function downscale(file, max = 720) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const s = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * s);
        c.height = Math.round(im.height * s);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

export const resetWriteDraft = () => (d = null);
