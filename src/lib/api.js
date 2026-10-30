import { syncServerTime } from './time.js';

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api/' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw Object.assign(new Error('You seem to be offline. Check your connection and try again.'), { code: 'offline' });
  }
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (data.serverNow) syncServerTime(data.serverNow);
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status, code: data.code });
  return data;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function clientId() {
  try {
    let id = localStorage.getItem('karshan-client');
    if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('karshan-client', id); }
    return id;
  } catch {
    return 'anon' + Math.random().toString(16).slice(2, 14);
  }
}

export function copyText(txt, btn, selectEl) {
  const label = btn.textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
    .then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = label), 1500); })
    .catch(() => {
      if (selectEl) { const r = document.createRange(); r.selectNodeContents(selectEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
      btn.textContent = 'Selected, press copy';
    });
}

export function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
