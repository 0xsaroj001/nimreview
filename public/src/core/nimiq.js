// Nimiq address helpers. Addresses are IBAN-style: "NQ" + 2 check digits + 32 base32 chars.
// The check digits use the IBAN mod-97 scheme; the all-zero burn address comes out as NQ07, which the tests pin.

export const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY';
export const LUNA_PER_NIM = 100_000;

export function normalizeAddress(address) {
  return String(address ?? '').toUpperCase().replace(/\s+/g, '');
}

function mod97(str) {
  const digits = str
    .split('')
    .map((c) => (c >= 'A' && c <= 'Z' ? String(c.charCodeAt(0) - 55) : c))
    .join('');
  let rest = 0;
  for (let i = 0; i < digits.length; i += 6) {
    rest = Number(String(rest) + digits.slice(i, i + 6)) % 97;
  }
  return rest;
}

export function checkDigits(body32) {
  return String(98 - mod97(body32 + 'NQ00')).padStart(2, '0');
}

export function isValidAddress(address) {
  const s = normalizeAddress(address);
  if (!/^NQ\d{2}[0-9A-Z]{32}$/.test(s)) return false;
  const body = s.slice(4);
  for (const ch of body) if (!ALPHABET.includes(ch)) return false;
  return mod97(body + s.slice(0, 4)) === 1;
}

export function makeAddress(body32) {
  const body = normalizeAddress(body32);
  if (body.length !== 32) throw new Error('Address body must be 32 characters');
  return formatAddress('NQ' + checkDigits(body) + body);
}

export function formatAddress(address) {
  return normalizeAddress(address).replace(/(.{4})(?=.)/g, '$1 ');
}

export function shortAddress(address) {
  const s = formatAddress(address);
  return s.length > 14 ? `${s.slice(0, 9)}…${s.slice(-4)}` : s;
}

export function formatNim(n, digits = 2) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
