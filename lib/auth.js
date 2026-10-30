import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const COOKIE = 'karshan_admin';
const MAX_AGE_S = 7 * 24 * 3600;

function secret() {
  const s = process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) return null;
  return createHash('sha256').update('karshan:' + s).digest();
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  const key = secret();
  const body = b64(JSON.stringify(payload));
  const mac = createHmac('sha256', key).update(body).digest('base64url');
  return body + '.' + mac;
}

function verify(token) {
  const key = secret();
  if (!key || !token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = createHmac('sha256', key).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const raw = req.headers?.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkPassword(given) {
  const want = process.env.ADMIN_PASSWORD;
  if (!want || typeof given !== 'string') return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(want).digest();
  return timingSafeEqual(a, b);
}

export function sessionCookie(name) {
  const token = sign({ who: name || 'admin', exp: Date.now() + MAX_AGE_S * 1000 });
  const secure = process.env.NODE_ENV === 'development' ? '' : ' Secure;';
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${MAX_AGE_S}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function currentAdmin(req) {
  return verify(readCookie(req, COOKIE));
}
