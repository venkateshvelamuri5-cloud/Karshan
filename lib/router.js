import { randomBytes } from 'node:crypto';
import { q, audit, hasDatabase } from './db.js';
import { adminConfigured, checkPassword, sessionCookie, clearCookie, currentAdmin } from './auth.js';
import { CITIES, CATEGORIES, REACTIONS, THEMES, LIVE_SPAN_MS, istDayStart, hourRate, DAY_RATE } from '../shared/cities.js';

const DAY = 86400e3;
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
const newId = (n = 10) => Array.from(randomBytes(n), (b) => ID_CHARS[b % 32]).join('');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (msg) => new HttpError(400, msg, 'invalid');

function send(res, status, data, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { throw bad('The request body is not valid JSON.'); }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString() || '{}';
  try { return JSON.parse(raw); } catch { throw bad('The request body is not valid JSON.'); }
}

const str = (v, max, field, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw bad(`${field} is required.`);
  if (s.length > max) throw bad(`${field} must be ${max} characters or fewer.`);
  return s;
};
const time = (v, field) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw bad(`${field} is not a valid time.`);
  return Math.round(n);
};
const city = (v) => {
  const c = CITIES[v];
  if (!c) throw bad('Unknown city.');
  return c;
};
const ipOf = (req) => String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);

const pubAnnouncement = (r, rx) => ({
  id: r.id, city: r.city, business: r.business, title: r.title, cat: r.category, area: r.area,
  at: Number(r.at), offer: r.offer,
  // The offer code is only revealed once the announcement is live.
  code: Number(r.at) <= Date.now() ? r.code : '',
  hasCode: Boolean(r.code),
  reactions: rx || {},
});

/* ---------------- public ---------------- */

async function cityFeed(req, res, slug) {
  const c = city(slug);
  const now = Date.now();
  const from = istDayStart(now) - DAY;
  const to = istDayStart(now) + 8 * DAY;
  const rows = await q(`SELECT * FROM announcements WHERE city=$1 AND status='approved' AND at >= $2 AND at < $3 ORDER BY at ASC LIMIT 400`, [c.slug, from, to]);
  const ids = rows.map((r) => r.id);
  const rx = {};
  if (ids.length) {
    const rr = await q(`SELECT announcement_id, emoji, n FROM reactions WHERE announcement_id = ANY($1::text[])`, [ids]);
    for (const r of rr) (rx[r.announcement_id] ||= {})[r.emoji] = Number(r.n);
  }
  const dayStart = istDayStart(now);
  const sponsors = await q(`SELECT id, brand, color, starts_at, ends_at FROM sponsors WHERE city=$1 AND ends_at > $2 AND starts_at < $3 ORDER BY starts_at`, [c.slug, dayStart, dayStart + DAY]);
  const [{ n: wishesToday }] = await q(`SELECT count(*)::int AS n FROM wishes WHERE at >= $1 AND at < $2`, [dayStart, dayStart + DAY]);
  const [{ n: watching }] = await q(`SELECT count(*)::int AS n FROM presence WHERE room=$1 AND last_seen > $2`, ['c:' + c.slug, now - 30000]);
  send(res, 200, {
    serverNow: now,
    city: c.slug,
    announcements: rows.map((r) => pubAnnouncement(r, rx[r.id])),
    sponsors: sponsors.map((s) => ({ id: s.id, brand: s.brand, color: s.color, startsAt: Number(s.starts_at), endsAt: Number(s.ends_at) })),
    wishesToday: Number(wishesToday),
    watching: Number(watching),
  });
}

async function createAnnouncement(req, res) {
  const b = await readBody(req);
  const c = city(b.city);
  const business = str(b.business, 40, 'Business name');
  const title = str(b.title, 60, 'Announcement');
  const category = CATEGORIES.includes(b.category) ? b.category : 'Opening';
  const area = c.areas.includes(b.area) ? b.area : c.areas[0];
  const at = time(b.at, 'Time');
  if (at < Date.now() - 60000) throw bad('Pick a time in the future.');
  if (at > Date.now() + 120 * DAY) throw bad('Announcements can be scheduled up to 120 days ahead.');
  const offer = str(b.offer, 60, 'Offer', false);
  const code = str(b.code, 16, 'Code', false).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const phone = str(b.phone, 14, 'Phone').replace(/[^\d+]/g, '');
  if (phone.replace(/\D/g, '').length < 10) throw bad('Enter a 10-digit phone number so we can verify the business.');
  const ip = ipOf(req);
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM announcements WHERE ip=$1 AND created_at > $2`, [ip, Date.now() - 3600e3]);
  if (Number(n) >= 5) throw new HttpError(429, 'Too many announcements from this connection. Try again in an hour.', 'rate_limited');
  const id = newId(8);
  await q(`INSERT INTO announcements (id, city, business, title, category, area, at, offer, code, phone, status, ip, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12)`,
    [id, c.slug, business, title, category, area, at, offer, code, phone, ip, Date.now()]);
  await audit('public', 'announcement.submitted', id, `${business} · ${c.slug}`);
  send(res, 201, { id, status: 'pending' });
}

async function react(req, res) {
  const b = await readBody(req);
  const id = str(b.id, 20, 'id');
  if (!REACTIONS.includes(b.emoji)) throw bad('Unknown reaction.');
  const [row] = await q(`SELECT id FROM announcements WHERE id=$1 AND status='approved'`, [id]);
  if (!row) throw new HttpError(404, 'That announcement is not on the clock.', 'not_found');
  await q(`INSERT INTO reactions (announcement_id, emoji, n) VALUES ($1,$2,1) ON CONFLICT (announcement_id, emoji) DO UPDATE SET n = reactions.n + 1`, [id, b.emoji]);
  const rr = await q(`SELECT emoji, n FROM reactions WHERE announcement_id=$1`, [id]);
  send(res, 200, { reactions: Object.fromEntries(rr.map((r) => [r.emoji, Number(r.n)])) });
}

async function presence(req, res) {
  const b = await readBody(req);
  const room = str(b.room, 40, 'room');
  if (!/^(c|w):[a-z0-9-]{2,20}$/.test(room)) throw bad('Unknown room.');
  const clientId = str(b.clientId, 32, 'clientId');
  const hearts = Math.max(0, Math.min(100000, Number(b.hearts) || 0));
  const now = Date.now();
  await q(`INSERT INTO presence (room, client_id, hearts, last_seen) VALUES ($1,$2,$3,$4) ON CONFLICT (room, client_id) DO UPDATE SET hearts=$3, last_seen=$4`, [room, clientId, hearts, now]);
  if (Math.random() < 0.05) await q(`DELETE FROM presence WHERE last_seen < $1`, [now - 3600e3]);
  const peers = await q(`SELECT client_id, hearts FROM presence WHERE room=$1 AND last_seen > $2 ORDER BY client_id LIMIT 200`, [room, now - 20000]);
  send(res, 200, {
    serverNow: now,
    count: peers.length,
    hearts: peers.reduce((s, p) => s + Number(p.hearts), 0),
    peers: peers.map((p) => ({ id: p.client_id.slice(0, 8), hearts: Number(p.hearts), me: p.client_id === clientId })),
  });
}

async function createWish(req, res) {
  const b = await readBody(req);
  const to = str(b.to, 30, 'Who it is for');
  const from = str(b.from, 30, 'Who it is from');
  const message = str(b.message, 90, 'Your wish');
  const at = time(b.at, 'Unlock time');
  if (at < Date.now() + 60000) throw bad('Pick a time at least a couple of minutes from now.');
  if (at > Date.now() + 400 * DAY) throw bad('Wishes can be scheduled up to a year ahead.');
  const theme = THEMES.includes(b.theme) ? b.theme : 'marigold';
  const c = CITIES[b.city] ? b.city : '';
  const ip = ipOf(req);
  const [{ n }] = await q(`SELECT count(*)::int AS n FROM wishes WHERE ip=$1 AND created_at > $2`, [ip, Date.now() - 3600e3]);
  if (Number(n) >= 20) throw new HttpError(429, 'Too many wishes from this connection. Try again in an hour.', 'rate_limited');
  const id = newId(10);
  await q(`INSERT INTO wishes (id, at, to_name, from_name, message, theme, city, ip, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, at, to, from, message, theme, c, ip, Date.now()]);
  send(res, 201, { id });
}

async function getWish(req, res, id) {
  if (!/^[a-z0-9]{6,16}$/.test(id)) throw new HttpError(404, 'We could not find this wish.', 'not_found');
  const [w] = await q(`SELECT * FROM wishes WHERE id=$1`, [id]);
  if (!w) throw new HttpError(404, 'We could not find this wish.', 'not_found');
  const now = Date.now(), at = Number(w.at), open = now >= at;
  // The message never leaves the server before its minute.
  send(res, 200, { id: w.id, to: w.to_name, from: w.from_name, at, theme: w.theme, open, message: open ? w.message : null, serverNow: now });
}

async function reportWish(req, res, id) {
  const b = await readBody(req);
  const [w] = await q(`SELECT id FROM wishes WHERE id=$1`, [id]);
  if (!w) throw new HttpError(404, 'We could not find this wish.', 'not_found');
  await q(`INSERT INTO reports (id, kind, target, reason, created_at) VALUES ($1,'wish',$2,$3,$4)`, [newId(8), id, str(b.reason, 200, 'Reason', false), Date.now()]);
  send(res, 201, { ok: true });
}

async function createEnquiry(req, res) {
  const b = await readBody(req);
  const brand = str(b.brand, 40, 'Brand');
  const name = str(b.name, 40, 'Your name');
  const phone = str(b.phone, 14, 'Phone').replace(/[^\d+]/g, '');
  if (phone.replace(/\D/g, '').length < 10) throw bad('Enter a 10-digit phone number.');
  const interest = str(b.interest, 40, 'Interest', false);
  const note = str(b.note, 240, 'Note', false);
  const c = CITIES[b.city] ? b.city : '';
  const id = newId(8);
  await q(`INSERT INTO enquiries (id, city, brand, name, phone, interest, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, c, brand, name, phone, interest, note, Date.now()]);
  await audit('public', 'enquiry.created', id, brand);
  send(res, 201, { id });
}

/* ---------------- admin ---------------- */

function requireAdmin(req) {
  const a = currentAdmin(req);
  if (!a) throw new HttpError(401, 'Please sign in to the admin console.', 'unauthorized');
  return a;
}

const loginAttempts = new Map();
async function adminLogin(req, res) {
  if (!adminConfigured()) throw new HttpError(503, 'Set ADMIN_PASSWORD in the Vercel project settings to turn on the admin console.', 'not_configured');
  const ip = ipOf(req), now = Date.now();
  const tries = (loginAttempts.get(ip) || []).filter((t) => t > now - 15 * 60e3);
  if (tries.length >= 8) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.', 'rate_limited');
  const b = await readBody(req);
  if (!checkPassword(b.password)) {
    tries.push(now);
    loginAttempts.set(ip, tries);
    throw new HttpError(401, 'That password is not right.', 'wrong_password');
  }
  loginAttempts.delete(ip);
  const name = str(b.name, 30, 'Name', false) || 'admin';
  await audit(name, 'admin.login');
  send(res, 200, { ok: true, name }, { 'Set-Cookie': sessionCookie(name) });
}

async function adminDashboard(req, res, admin, url) {
  const slug = url.searchParams.get('city') || '';
  const now = Date.now(), ds = istDayStart(now);
  const cityClause = slug ? ' AND city=$1' : '';
  const p = slug ? [slug] : [];
  const n = async (sql, extra = []) => Number((await q(sql, [...p, ...extra]))[0].n);
  const off = p.length;
  const data = {
    serverNow: now,
    pending: await n(`SELECT count(*)::int AS n FROM announcements WHERE status='pending'${cityClause}`),
    liveToday: await n(`SELECT count(*)::int AS n FROM announcements WHERE status='approved'${cityClause} AND at >= $${off + 1} AND at < $${off + 2}`, [ds, ds + DAY]),
    approvedWeek: await n(`SELECT count(*)::int AS n FROM announcements WHERE status='approved'${cityClause} AND reviewed_at > $${off + 1}`, [now - 7 * DAY]),
    wishesToday: Number((await q(`SELECT count(*)::int AS n FROM wishes WHERE at >= $1 AND at < $2`, [ds, ds + DAY]))[0].n),
    wishesWeek: Number((await q(`SELECT count(*)::int AS n FROM wishes WHERE created_at > $1`, [now - 7 * DAY]))[0].n),
    newEnquiries: await n(`SELECT count(*)::int AS n FROM enquiries WHERE status='new'${cityClause}`),
    openReports: Number((await q(`SELECT count(*)::int AS n FROM reports WHERE resolved=false`))[0].n),
    sponsoredHoursToday: Number((await q(`SELECT coalesce(sum(least(ends_at,$2)-greatest(starts_at,$1)),0)::bigint AS n FROM sponsors WHERE ends_at > $1 AND starts_at < $2${slug ? ' AND city=$3' : ''}`, slug ? [ds, ds + DAY, slug] : [ds, ds + DAY]))[0].n) / 3600e3,
    watchingNow: Number((await q(`SELECT count(*)::int AS n FROM presence WHERE last_seen > $1`, [now - 30000]))[0].n),
    reactionsToday: Number((await q(`SELECT coalesce(sum(r.n),0)::int AS n FROM reactions r JOIN announcements a ON a.id=r.announcement_id WHERE a.at >= $1 AND a.at < $2`, [ds, ds + DAY]))[0].n),
    upcoming: (await q(`SELECT * FROM announcements WHERE status='approved'${cityClause} AND at >= $${off + 1} ORDER BY at ASC LIMIT 8`, [...p, now - LIVE_SPAN_MS])).map((r) => adminRow(r)),
  };
  send(res, 200, data);
}

const adminRow = (r) => ({
  id: r.id, city: r.city, business: r.business, title: r.title, cat: r.category, area: r.area, at: Number(r.at),
  offer: r.offer, code: r.code, phone: r.phone, status: r.status, rejectReason: r.reject_reason,
  createdAt: Number(r.created_at), reviewedAt: r.reviewed_at ? Number(r.reviewed_at) : null, reviewedBy: r.reviewed_by || '',
});

async function adminAnnouncements(req, res, admin, url) {
  const status = url.searchParams.get('status') || 'pending';
  const slug = url.searchParams.get('city') || '';
  if (!['pending', 'approved', 'rejected'].includes(status)) throw bad('Unknown status.');
  const order = status === 'pending' ? 'at ASC' : 'reviewed_at DESC NULLS LAST';
  const rows = slug
    ? await q(`SELECT * FROM announcements WHERE status=$1 AND city=$2 ORDER BY ${order} LIMIT 200`, [status, slug])
    : await q(`SELECT * FROM announcements WHERE status=$1 ORDER BY ${order} LIMIT 200`, [status]);
  // Flag likely duplicates and clashes so the reviewer sees them at a glance.
  const out = [];
  for (const r of rows) {
    const row = adminRow(r);
    if (status === 'pending') {
      const dup = await q(`SELECT id FROM announcements WHERE id<>$1 AND city=$2 AND lower(business)=lower($3) AND abs(at-$4) < $5 AND status<>'rejected' LIMIT 1`, [r.id, r.city, r.business, Number(r.at), DAY]);
      const prev = await q(`SELECT count(*)::int AS n FROM announcements WHERE phone=$1 AND status='approved'`, [r.phone]);
      row.checks = {
        duplicate: dup.length > 0,
        returningBusiness: Number(prev[0].n) > 0,
        inPast: Number(r.at) < Date.now(),
        phoneOk: r.phone.replace(/\D/g, '').length >= 10,
      };
    }
    out.push(row);
  }
  send(res, 200, { items: out });
}

async function adminReview(req, res, admin, id) {
  const b = await readBody(req);
  const [r] = await q(`SELECT * FROM announcements WHERE id=$1`, [id]);
  if (!r) throw new HttpError(404, 'Announcement not found.', 'not_found');
  const now = Date.now();
  if (b.action === 'approve') {
    await q(`UPDATE announcements SET status='approved', reject_reason='', reviewed_at=$2, reviewed_by=$3 WHERE id=$1`, [id, now, admin.who]);
    await audit(admin.who, 'announcement.approved', id, r.business);
  } else if (b.action === 'reject') {
    const reason = str(b.reason, 200, 'Reason');
    await q(`UPDATE announcements SET status='rejected', reject_reason=$2, reviewed_at=$3, reviewed_by=$4 WHERE id=$1`, [id, reason, now, admin.who]);
    await audit(admin.who, 'announcement.rejected', id, `${r.business}: ${reason}`);
  } else if (b.action === 'update') {
    const f = b.fields || {};
    const c = city(f.city || r.city);
    const vals = [
      str(f.business ?? r.business, 40, 'Business name'),
      str(f.title ?? r.title, 60, 'Announcement'),
      CATEGORIES.includes(f.cat) ? f.cat : r.category,
      c.areas.includes(f.area) ? f.area : r.area,
      f.at != null ? time(f.at, 'Time') : Number(r.at),
      str(f.offer ?? r.offer, 60, 'Offer', false),
      str(f.code ?? r.code, 16, 'Code', false).toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      c.slug,
    ];
    await q(`UPDATE announcements SET business=$2, title=$3, category=$4, area=$5, at=$6, offer=$7, code=$8, city=$9 WHERE id=$1`, [id, ...vals]);
    await audit(admin.who, 'announcement.edited', id, vals[0]);
  } else if (b.action === 'delete') {
    await q(`DELETE FROM reactions WHERE announcement_id=$1`, [id]);
    await q(`DELETE FROM announcements WHERE id=$1`, [id]);
    await audit(admin.who, 'announcement.deleted', id, r.business);
  } else throw bad('Unknown action.');
  send(res, 200, { ok: true });
}

async function adminSponsors(req, res, admin, url) {
  if (req.method === 'GET') {
    const slug = url.searchParams.get('city') || 'vizag';
    const from = Number(url.searchParams.get('from')) || istDayStart(Date.now());
    const to = Number(url.searchParams.get('to')) || from + DAY;
    const rows = await q(`SELECT * FROM sponsors WHERE city=$1 AND ends_at > $2 AND starts_at < $3 ORDER BY starts_at`, [slug, from, to]);
    return send(res, 200, { items: rows.map((s) => ({ id: s.id, city: s.city, brand: s.brand, color: s.color, startsAt: Number(s.starts_at), endsAt: Number(s.ends_at), price: Number(s.price), note: s.note })) });
  }
  const b = await readBody(req);
  const c = city(b.city);
  const brand = str(b.brand, 30, 'Brand');
  const color = /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : '#ffab3d';
  const startsAt = time(b.startsAt, 'Start');
  const endsAt = time(b.endsAt, 'End');
  if (endsAt <= startsAt) throw bad('The end must be after the start.');
  const clash = await q(`SELECT brand FROM sponsors WHERE city=$1 AND ends_at > $2 AND starts_at < $3 LIMIT 1`, [c.slug, startsAt, endsAt]);
  if (clash.length) throw new HttpError(409, `That time is already booked by ${clash[0].brand}.`, 'clash');
  const price = Math.max(0, Math.round(Number(b.price) || 0));
  const id = newId(8);
  await q(`INSERT INTO sponsors (id, city, brand, color, starts_at, ends_at, price, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, c.slug, brand, color, startsAt, endsAt, price, str(b.note, 200, 'Note', false), Date.now()]);
  await audit(admin.who, 'sponsor.booked', id, `${brand} · ${c.slug}`);
  send(res, 201, { id });
}

async function adminDeleteSponsor(req, res, admin, id) {
  const [s] = await q(`SELECT brand FROM sponsors WHERE id=$1`, [id]);
  if (!s) throw new HttpError(404, 'Booking not found.', 'not_found');
  await q(`DELETE FROM sponsors WHERE id=$1`, [id]);
  await audit(admin.who, 'sponsor.removed', id, s.brand);
  send(res, 200, { ok: true });
}

async function adminEnquiries(req, res, admin) {
  const rows = await q(`SELECT * FROM enquiries ORDER BY created_at DESC LIMIT 200`);
  send(res, 200, { items: rows.map((e) => ({ id: e.id, city: e.city, brand: e.brand, name: e.name, phone: e.phone, interest: e.interest, note: e.note, status: e.status, adminNote: e.admin_note, createdAt: Number(e.created_at) })) });
}

async function adminUpdateEnquiry(req, res, admin, id) {
  const b = await readBody(req);
  const status = ['new', 'contacted', 'won', 'lost'].includes(b.status) ? b.status : null;
  const [e] = await q(`SELECT * FROM enquiries WHERE id=$1`, [id]);
  if (!e) throw new HttpError(404, 'Enquiry not found.', 'not_found');
  await q(`UPDATE enquiries SET status=$2, admin_note=$3 WHERE id=$1`, [id, status || e.status, str(b.adminNote ?? e.admin_note, 500, 'Note', false)]);
  await audit(admin.who, 'enquiry.updated', id, `${e.brand} → ${status || e.status}`);
  send(res, 200, { ok: true });
}

async function adminReports(req, res, admin) {
  const rows = await q(`SELECT r.*, w.message, w.to_name, w.from_name, w.at AS wish_at FROM reports r LEFT JOIN wishes w ON w.id=r.target WHERE r.resolved=false ORDER BY r.created_at DESC LIMIT 100`);
  // A reported wish is the only case where an admin sees a private message.
  send(res, 200, { items: rows.map((r) => ({ id: r.id, kind: r.kind, target: r.target, reason: r.reason, createdAt: Number(r.created_at), wish: r.message != null ? { to: r.to_name, from: r.from_name, message: r.message, at: Number(r.wish_at) } : null })) });
}

async function adminResolveReport(req, res, admin, id) {
  const b = await readBody(req);
  const [r] = await q(`SELECT * FROM reports WHERE id=$1`, [id]);
  if (!r) throw new HttpError(404, 'Report not found.', 'not_found');
  if (b.action === 'remove' && r.kind === 'wish') {
    await q(`DELETE FROM wishes WHERE id=$1`, [r.target]);
    await audit(admin.who, 'wish.removed', r.target, r.reason);
  }
  await q(`UPDATE reports SET resolved=true WHERE id=$1 OR (kind=$2 AND target=$3)`, [id, r.kind, r.target]);
  await audit(admin.who, 'report.resolved', id, b.action || 'dismissed');
  send(res, 200, { ok: true });
}

async function adminAudit(req, res) {
  const rows = await q(`SELECT * FROM audit ORDER BY id DESC LIMIT 100`);
  send(res, 200, { items: rows.map((a) => ({ at: Number(a.at), actor: a.actor, action: a.action, target: a.target, detail: a.detail })) });
}

/* ---------------- dispatch ---------------- */

export async function handle(req, res) {
  const url = new URL(req.url, 'http://local');
  const path = (url.searchParams.get('__path') ? '/api/' + url.searchParams.get('__path') : url.pathname).replace(/\/+$/, '');
  const parts = path.split('/').filter(Boolean).slice(1); // drop "api"
  const m = req.method;
  try {
    if (parts[0] === 'health') return send(res, 200, { ok: true, database: hasDatabase(), admin: adminConfigured() });
    if (parts[0] === 'config' && m === 'GET') return send(res, 200, { cities: CITIES, serverNow: Date.now(), dayRate: DAY_RATE, hourRates: Array.from({ length: 24 }, (_, h) => hourRate(h)) });
    if (parts[0] === 'city' && parts[1] && m === 'GET') return await cityFeed(req, res, parts[1]);
    if (parts[0] === 'announcements' && m === 'POST' && parts.length === 1) return await createAnnouncement(req, res);
    if (parts[0] === 'react' && m === 'POST') return await react(req, res);
    if (parts[0] === 'presence' && m === 'POST') return await presence(req, res);
    if (parts[0] === 'wishes' && m === 'POST' && parts.length === 1) return await createWish(req, res);
    if (parts[0] === 'wishes' && parts[1] && parts[2] === 'report' && m === 'POST') return await reportWish(req, res, parts[1]);
    if (parts[0] === 'wishes' && parts[1] && m === 'GET') return await getWish(req, res, parts[1]);
    if (parts[0] === 'enquiries' && m === 'POST') return await createEnquiry(req, res);

    if (parts[0] === 'admin') {
      if (parts[1] === 'login' && m === 'POST') return await adminLogin(req, res);
      if (parts[1] === 'logout' && m === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
      if (parts[1] === 'me' && m === 'GET') {
        const a = currentAdmin(req);
        return send(res, 200, { signedIn: Boolean(a), name: a?.who || null, configured: adminConfigured(), database: hasDatabase() });
      }
      const admin = requireAdmin(req);
      if (parts[1] === 'dashboard' && m === 'GET') return await adminDashboard(req, res, admin, url);
      if (parts[1] === 'announcements' && !parts[2] && m === 'GET') return await adminAnnouncements(req, res, admin, url);
      if (parts[1] === 'announcements' && parts[2] && m === 'POST') return await adminReview(req, res, admin, parts[2]);
      if (parts[1] === 'sponsors' && !parts[2] && (m === 'GET' || m === 'POST')) return await adminSponsors(req, res, admin, url);
      if (parts[1] === 'sponsors' && parts[2] && m === 'DELETE') return await adminDeleteSponsor(req, res, admin, parts[2]);
      if (parts[1] === 'enquiries' && !parts[2] && m === 'GET') return await adminEnquiries(req, res, admin);
      if (parts[1] === 'enquiries' && parts[2] && m === 'POST') return await adminUpdateEnquiry(req, res, admin, parts[2]);
      if (parts[1] === 'reports' && !parts[2] && m === 'GET') return await adminReports(req, res, admin);
      if (parts[1] === 'reports' && parts[2] && m === 'POST') return await adminResolveReport(req, res, admin, parts[2]);
      if (parts[1] === 'audit' && m === 'GET') return await adminAudit(req, res, admin);
    }
    send(res, 404, { error: 'Not found.', code: 'not_found' });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500 && e.code !== 'no_database' && e.code !== 'not_configured') console.error(e);
    send(res, status, { error: status >= 500 && !e.code ? 'Something went wrong on our side. Try again.' : e.message, code: e.code || 'error' });
  }
}
