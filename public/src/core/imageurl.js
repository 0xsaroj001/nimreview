// Turns whatever a person pastes as "photo link" into a link a browser can show, or says why it cannot.
// Pure functions, shared by the browser (live preview in the listing form) and the server (what gets stored).
//
// Why links fail when copied from Google:
//  - Google Images "visit" / address-bar links (google.com/imgres?imgurl=...) are web pages; the real picture
//    address is inside the imgurl parameter.
//  - Google Drive share links (drive.google.com/file/d/ID/view) are pages; lh3.googleusercontent.com/d/ID is the file.
//  - Google Photos / Maps / search share links (photos.app.goo.gl, maps.app.goo.gl, google.com/maps ...) are pages
//    with no direct picture address at all.
//  - Links copied from page source carry HTML character references (&amp;) that break the query string.
//  - The link ends up inside CSS url('...'), so quotes and brackets in it must be percent-encoded (they are valid
//    in real URLs, e.g. Wikipedia file names with brackets).

const ENTITIES = { '&amp;': '&', '&#38;': '&', '&#x26;': '&', '&quot;': '"', '&#34;': '"', '&#x22;': '"', '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&lt;': '<', '&#60;': '<', '&gt;': '>', '&#62;': '>' };
const ENTITY = new RegExp(Object.keys(ENTITIES).map((k) => k.replace(/[&#;]/g, '\\$&')).join('|'), 'gi');
const decodeEntities = (s) => {
  for (let i = 0; i < 3; i++) {
    const next = s.replace(ENTITY, (m) => ENTITIES[m.toLowerCase()]);
    if (next === s) break;
    s = next;
  }
  return s;
};

const PAGE_NOT_PICTURE = 'That link opens a web page, not a picture. Open the picture itself, right-click it and choose "Copy image address".';
const NOT_A_LINK = 'That does not look like an image link. It should start with https://';
export const MAX_IMAGE_URL = 1000;

const hostIs = (host, ...names) => names.some((n) => host === n || host.endsWith(`.${n}`));

export function normalizeImageUrl(raw, depth = 0) {
  let s = decodeEntities(String(raw ?? '').trim());
  if (!s) return { url: '' };
  if (/^\/\//.test(s)) s = `https:${s}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[\w-]+(\.[\w-]+)+\//.test(s)) s = `https://${s}`;
  if (/^http:\/\//i.test(s)) s = s.replace(/^http:/i, 'https:'); // a secure page cannot show insecure pictures
  let u;
  try {
    u = new URL(s);
  } catch {
    return { error: NOT_A_LINK };
  }
  if (u.protocol !== 'https:') return { error: NOT_A_LINK };
  const host = u.hostname.toLowerCase();

  // Google Images result: the picture is the imgurl parameter
  if (/(^|\.)google\.[a-z.]+$/.test(host) && u.pathname === '/imgres') {
    const inner = u.searchParams.get('imgurl');
    if (inner && depth < 1) return normalizeImageUrl(inner, depth + 1);
    return { error: PAGE_NOT_PICTURE };
  }
  // Google Drive file: a shared file can be shown through googleusercontent
  if (host === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get('id');
    if (id && /^[\w-]+$/.test(id)) return { url: `https://lh3.googleusercontent.com/d/${id}`, note: 'Drive file: it must be shared as "anyone with the link"' };
    return { error: PAGE_NOT_PICTURE };
  }
  // share/search/maps pages never contain one picture address
  if (
    hostIs(host, 'goo.gl', 'photos.app.goo.gl', 'maps.app.goo.gl', 'share.google', 'photos.google.com', 'instagram.com', 'facebook.com', 'fb.com', 'pinterest.com') ||
    (/(^|\.)google\.[a-z.]+$/.test(host) && /^\/(search|maps|travel|url|aclk)/.test(u.pathname))
  ) {
    return { error: PAGE_NOT_PICTURE };
  }

  const href = u.href.replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
  if (href.length > MAX_IMAGE_URL) return { error: `That link is too long (over ${MAX_IMAGE_URL} characters). Use the picture's own address.` };
  // nothing left that could close a CSS string or an HTML attribute
  if (/["'()<>\\\s]/.test(href)) return { error: NOT_A_LINK };
  return { url: href };
}
