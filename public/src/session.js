// Who is signed in, and the one function that talks to the backend.
const KEY = 'nimreview:session';

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function setSession(s) {
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
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

export function signOut() {
  setSession(null);
  location.hash = '#/';
  dispatchEvent(new Event('nr:session'));
}
