// Small rendering helpers shared by the views.
import { formatNim } from './core/nimiq.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Image URLs from the server end up inside a style attribute, where HTML escaping is undone before CSS parses
// them, so only plain https URLs and base64 image data are allowed through; anything else renders no image.
const SAFE_IMG = /^(https:\/\/[^\s"'()<>\\]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/;
export function bgImg(url, width) {
  const u = width ? String(url ?? '').replace('w=900', `w=${width}`) : String(url ?? '');
  return SAFE_IMG.test(u) ? `background-image:url('${u}')` : '';
}

export const icon = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export const nim = (n, cls = '') => `<span class="nim ${cls}">${icon('hex', 'hex')}<b>${formatNim(n)}</b></span>`;

export function stars(value, size = 'md') {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return `<span class="stars stars-${size}" role="img" aria-label="${value} out of 5" style="--p:${pct}%"></span>`;
}

const PALETTE = ['#F4D27A', '#A9D8C3', '#F3B194', '#C8BCF0', '#A8CDE8', '#EFB7C4', '#C9DE9C'];
export function avatar(name, size = 40) {
  const initials = String(name).split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="avatar" style="--s:${size}px;--c:${PALETTE[h % PALETTE.length]}">${esc(initials)}</span>`;
}

export const METHOD = {
  payment: { icon: 'hex', label: 'Paid in NIM', cls: 'm-pay' },
  receipt: { icon: 'receipt', label: 'Receipt verified', cls: 'm-receipt' },
  checkin: { icon: 'pin', label: 'Checked in', cls: 'm-checkin' },
  none: { icon: 'info', label: 'Unverified', cls: 'm-none' },
};
export const methodBadge = (m) => {
  const x = METHOD[m] || METHOD.none;
  return `<span class="badge ${x.cls}">${icon(x.icon)}${x.label}</span>`;
};

const PROOF_TEXT = {
  payment: 'Visit proven by NIM payment',
  receipt: 'Visit proven by venue receipt',
  checkin: 'Visit proven by location check-in',
  none: 'No proof of visit · counts 25% in the rating',
};
export const proofLine = (m) => {
  const x = METHOD[m] || METHOD.none;
  return `<div class="proof-line ${x.cls}">${icon(m === 'none' ? 'info' : x.icon)}${PROOF_TEXT[m] || PROOF_TEXT.none}</div>`;
};

export const TYPE_LABEL = { restaurant: 'Restaurant', cafe: 'Café', hotel: 'Hotel' };
export const priceLevel = (n) => '₹'.repeat(n);

export function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d < 7) return d === 1 ? 'yesterday' : `${d} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const km = (d) => (d < 1 ? `${Math.round(d * 1000)} m` : d < 100 ? `${d.toFixed(1)} km` : `${Math.round(d)} km`);

// ---------- toast ----------
let toastTimer;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.className = `toast show ${kind}`;
  el.innerHTML = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
}

// ---------- bottom sheet ----------
export function openSheet(html, onMount) {
  const root = document.getElementById('sheet');
  root.innerHTML = `<div class="sheet-scrim" data-close></div><div class="sheet-panel" role="dialog" aria-modal="true"><div class="sheet-grip"></div>${html}</div>`;
  root.classList.add('open');
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
  onMount?.(root.querySelector('.sheet-panel'));
  setTimeout(() => root.querySelector('.sheet-panel input, .sheet-panel textarea')?.focus(), 250);
}
export function closeSheet() {
  const root = document.getElementById('sheet');
  root.classList.remove('open');
  setTimeout(() => {
    if (!root.classList.contains('open')) root.innerHTML = '';
  }, 250);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${icon('check')} Copied`);
  } catch {
    toast('Copy failed, select the text instead');
  }
}

// Difference hash of an image (64 bits, hex). Near-identical photos land within a few bits of each other.
export function dHash(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas');
      c.width = 9;
      c.height = 8;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0, 9, 8);
      const d = g.getImageData(0, 0, 9, 8).data;
      const lum = (x, y) => {
        const i = (y * 9 + x) * 4;
        return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      };
      let bits = '';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += lum(x, y) > lum(x + 1, y) ? '1' : '0';
      let hex = '';
      for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
      resolve(hex);
    };
    im.onerror = () => resolve(null);
    im.src = url;
  });
}
