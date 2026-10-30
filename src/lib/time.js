import { IST_OFFSET, istDayStart } from '../../shared/cities.js';

export const MIN = 60000;
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const p2 = (n) => String(n).padStart(2, '0');
export const ist = (ms) => new Date(ms + IST_OFFSET);
export const dayStart = istDayStart;

// The server's clock is the source of truth, so countdowns agree across phones.
let offset = 0;
export function syncServerTime(serverNow) {
  if (Number.isFinite(serverNow)) offset = serverNow - Date.now();
}
export const now = () => Date.now() + offset;

export function tLabel(ms) {
  const d = ist(ms);
  let h = d.getUTCHours();
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return h + ':' + p2(d.getUTCMinutes()) + ' ' + ap;
}
export const hhmm = (ms) => { const d = ist(ms); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); };
export const hhmmss = (ms) => { const d = ist(ms); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); };
export const dLabel = (ms) => { const d = ist(ms); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
export const dateInput = (ms) => { const d = ist(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); };
export function readInputs(dateVal, timeVal) {
  if (!dateVal || !timeVal) return null;
  const [y, mo, dd] = dateVal.split('-').map(Number), [H, M] = timeVal.split(':').map(Number);
  return Date.UTC(y, mo - 1, dd, H, M) - IST_OFFSET;
}
export function fmtLeft(ms) {
  if (ms <= 0) return '00:00:00';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (d ? d + 'd ' : '') + p2(h) + ':' + p2(m) + ':' + p2(x);
}
export function shortLeft(ms) {
  if (ms <= 0) return 'now';
  const m = Math.ceil(ms / MIN);
  if (m < 60) return 'in ' + m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return 'in ' + h + ' h' + (r ? ' ' + r + ' m' : '');
  const d = Math.round(m / 1440);
  return d === 1 ? 'in 1 day' : 'in ' + d + ' days';
}
