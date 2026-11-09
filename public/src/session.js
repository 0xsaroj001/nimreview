// Who is signed in, and the one function that talks to the backend.
const KEY = 'nimreview:session';
export const DEMO_KEY = 'nimreview:v1'; // the demo data set (store.js)

// Real logins survive closing the browser (localStorage). Demo sessions and the demo data live in sessionStorage,
// so a demo never lingers: close the tab and it is gone.
const read = (store) => {
  try {
    return JSON.parse(store.getItem(KEY));
  } catch {
    return null;
  }
};
export const getSession = () => read(sessionStorage) || read(localStorage);

export function setSession(s) {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
    if (s) (s.mode === 'demo' ? sessionStorage : localStorage).setItem(KEY, JSON.stringify(s));
  } catch {}
}

export const updateSession = (patch) => setSession({ ...getSession(), ...patch });
export const isLive = () => getSession()?.mode === 'live';
export const isDemo = () => getSession()?.mode === 'demo';
export const role = () => getSession()?.role;

export async function api(path, { method = 'GET', body } = {}) {
  const s = getSession();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(s?.token ? { authorization: `Bearer ${s.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && s?.token) {
    setSession(null);
    location.hash = '#/';
    dispatchEvent(new Event('nr:session'));
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export async function signIn(path, body) {
  const { token, session } = await api(path, { method: 'POST', body });
  setSession({ token, ...session });
  dispatchEvent(new Event('nr:session'));
}

// Live accounts: the server revokes this token first, so a copied token stops working too. The local log out
// happens whatever the network does; a token that could not be revoked still expires within 7 days.
// Leaving a demo keeps its data for this tab, so you can switch between the reviewer and owner demos and follow a
// cash-out from one to the other; closing the tab wipes it.
let leaving = false;
export async function signOut() {
  if (leaving) return;
  leaving = true;
  const s = getSession();
  try {
    if (s?.mode === 'live' && s.token) {
      await fetch('/api/auth/logout', { method: 'POST', headers: { authorization: `Bearer ${s.token}` }, keepalive: true }).catch(() => {});
    }
  } finally {
    setSession(null);
    leaving = false;
    location.hash = '#/';
    dispatchEvent(new Event('nr:session'));
  }
}
