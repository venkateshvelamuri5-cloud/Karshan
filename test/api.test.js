// API tests against an in-process Postgres (PGlite). Run: npm test
import { PGlite } from '@electric-sql/pglite';
import { useQuery } from '../lib/db.js';
import { handle } from '../lib/router.js';
import assert from 'node:assert/strict';

const pg = new PGlite();
useQuery(async (text, params = []) => (await pg.query(text, params)).rows);
process.env.ADMIN_PASSWORD = 'test-password-123';

let cookie = '';
async function call(method, path, body, headers = {}) {
  const req = { method, url: path, headers: { cookie, 'x-forwarded-for': headers.ip || '1.1.1.1' }, body };
  let status = 0, out = '', hdrs = {};
  const res = { setHeader: (k, v) => (hdrs[k.toLowerCase()] = v), end: (s) => (out = s), set statusCode(v) { status = v; } };
  await handle(req, res);
  if (hdrs['set-cookie']) cookie = hdrs['set-cookie'].split(';')[0];
  return { status, body: JSON.parse(out || '{}') };
}

const now = Date.now();
let r;
r = await call('GET', '/api/health'); assert.equal(r.status, 200);
r = await call('GET', '/api/city/vizag'); assert.equal(r.status, 200); assert.deepEqual(r.body.announcements, []);
r = await call('GET', '/api/city/nowhere'); assert.equal(r.status, 400);

// business submits; it stays off the clock until approved
r = await call('POST', '/api/announcements', { city: 'vizag', business: 'Dosa District', title: 'Grand opening', category: 'Opening', area: 'Siripuram', at: now + 3600e3, offer: '20% off', code: 'dosa20', phone: '9876543210' });
assert.equal(r.status, 201, JSON.stringify(r.body)); const annId = r.body.id;
r = await call('POST', '/api/announcements', { city: 'vizag', business: 'X', title: 'Y', at: now - 3600e3, phone: '9876543210' }); assert.equal(r.status, 400);
r = await call('POST', '/api/announcements', { city: 'vizag', business: 'X', title: 'Y', at: now + 3600e3, phone: '12' }); assert.equal(r.status, 400);
r = await call('GET', '/api/city/vizag'); assert.equal(r.body.announcements.length, 0);

// admin
r = await call('GET', '/api/admin/dashboard'); assert.equal(r.status, 401);
r = await call('POST', '/api/admin/login', { password: 'nope' }); assert.equal(r.status, 401);
r = await call('POST', '/api/admin/login', { password: 'test-password-123', name: 'Venky' }); assert.equal(r.status, 200); assert.ok(cookie);
r = await call('GET', '/api/admin/announcements?status=pending'); assert.equal(r.status, 200); assert.equal(r.body.items.length, 1); assert.equal(r.body.items[0].checks.phoneOk, true);
r = await call('POST', `/api/admin/announcements/${annId}`, { action: 'update', fields: { title: 'Grand opening night' } }); assert.equal(r.status, 200);
r = await call('POST', `/api/admin/announcements/${annId}`, { action: 'approve' }); assert.equal(r.status, 200);
r = await call('GET', '/api/admin/dashboard?city=vizag'); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.pending, 0); assert.equal(r.body.upcoming.length, 1);
r = await call('GET', '/api/admin/dashboard'); assert.equal(r.status, 200, JSON.stringify(r.body));

// public sees it, code hidden until live
r = await call('GET', '/api/city/vizag'); assert.equal(r.body.announcements.length, 1); assert.equal(r.body.announcements[0].title, 'Grand opening night'); assert.equal(r.body.announcements[0].code, ''); assert.equal(r.body.announcements[0].hasCode, true);
r = await call('POST', '/api/react', { id: annId, emoji: '🎉' }); assert.equal(r.status, 200); assert.equal(r.body.reactions['🎉'], 1);
r = await call('POST', '/api/react', { id: annId, emoji: '💩' }); assert.equal(r.status, 400);

// sponsors
r = await call('POST', '/api/admin/sponsors', { city: 'vizag', brand: 'Raftaar EV', color: '#14b8a6', startsAt: now, endsAt: now + 3600e3, price: 2999 }); assert.equal(r.status, 201);
r = await call('POST', '/api/admin/sponsors', { city: 'vizag', brand: 'Other', startsAt: now + 1000, endsAt: now + 2000 }); assert.equal(r.status, 409);
r = await call('GET', '/api/city/vizag'); assert.equal(r.body.sponsors.length, 1);

// wishes: message locked until the minute
r = await call('POST', '/api/wishes', { to: 'Amma', from: 'Venky', message: 'Happy birthday', at: now + 5 * 60e3, theme: 'rose', city: 'vizag' }); assert.equal(r.status, 201); const wid = r.body.id;
r = await call('GET', `/api/wishes/${wid}`); assert.equal(r.status, 200); assert.equal(r.body.open, false); assert.equal(r.body.message, null);
r = await call('POST', '/api/wishes', { to: 'A', from: 'B', message: 'too soon', at: now + 1000 }); assert.equal(r.status, 400);
await pg.query('UPDATE wishes SET at=$1 WHERE id=$2', [now - 1000, wid]);
r = await call('GET', `/api/wishes/${wid}`); assert.equal(r.body.open, true); assert.equal(r.body.message, 'Happy birthday');
r = await call('POST', `/api/wishes/${wid}/report`, { reason: 'test' }); assert.equal(r.status, 201);
r = await call('GET', '/api/admin/reports'); assert.equal(r.body.items.length, 1); assert.equal(r.body.items[0].wish.message, 'Happy birthday');
r = await call('POST', `/api/admin/reports/${r.body.items[0].id}`, { action: 'dismiss' }); assert.equal(r.status, 200);

// presence
r = await call('POST', '/api/presence', { room: 'w:' + wid, clientId: 'abc123', hearts: 3 }); assert.equal(r.status, 200); assert.equal(r.body.count, 1); assert.equal(r.body.hearts, 3);
r = await call('POST', '/api/presence', { room: 'bad room', clientId: 'x' }); assert.equal(r.status, 400);

// enquiries
r = await call('POST', '/api/enquiries', { brand: 'Kesar & Co.', name: 'Ravi', phone: '98765 43210', interest: 'One hour', city: 'vizag' }); assert.equal(r.status, 201); const eq = r.body.id;
r = await call('POST', `/api/admin/enquiries/${eq}`, { status: 'contacted', adminNote: 'Call back Monday' }); assert.equal(r.status, 200);
r = await call('GET', '/api/admin/enquiries'); assert.equal(r.body.items[0].status, 'contacted');
r = await call('GET', '/api/admin/audit'); assert.ok(r.body.items.length >= 5);

// reject flow + rate limit
for (let i = 0; i < 6; i++) r = await call('POST', '/api/announcements', { city: 'vizag', business: 'Spam ' + i, title: 'x', at: now + 7200e3, phone: '9999999999' }, { ip: '9.9.9.9' });
assert.equal(r.status, 429);
r = await call('GET', '/api/admin/announcements?status=pending'); const pend = r.body.items[0];
r = await call('POST', `/api/admin/announcements/${pend.id}`, { action: 'reject', reason: 'Could not verify the business' }); assert.equal(r.status, 200);
r = await call('POST', '/api/admin/logout'); r = await call('GET', '/api/admin/me'); assert.equal(r.body.signedIn, false);

// birthday walls: anyone with the link adds wishes and photos; content locked until the reveal
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await call('POST', '/api/walls', { forName: 'Sneha', occasion: 'Birthday', title: 'Sneha turns 25', at: now + 10 * 60e3, theme: 'rose', city: 'vizag' });
assert.equal(r.status, 201, JSON.stringify(r.body)); const wall = r.body.id, key = r.body.manageKey;
r = await call('POST', `/api/walls/${wall}/wishes`, { from: 'Ravi', message: 'Happy birthday Sneha!', photo: { mime: 'image/png', data: tinyPng } }); assert.equal(r.status, 201, JSON.stringify(r.body)); const ww1 = r.body.id;
r = await call('POST', `/api/walls/${wall}/wishes`, { from: 'Anu', message: 'Have the best year' }); assert.equal(r.status, 201);
r = await call('POST', `/api/walls/${wall}/wishes`, { from: 'X', message: 'y', photo: { mime: 'image/gif', data: tinyPng } }); assert.equal(r.status, 400);
r = await call('GET', `/api/walls/${wall}`); assert.equal(r.body.open, false); assert.equal(r.body.wishes.length, 0); assert.equal(r.body.count, 2); assert.equal(r.body.photoCount, 1); assert.deepEqual(r.body.signers, ['Ravi', 'Anu']);
r = await call('GET', `/api/walls/${wall}?key=${key}`); assert.equal(r.body.manager, true); assert.equal(r.body.wishes.length, 2);
r = await call('POST', `/api/walls/${wall}/manage`, { key: 'wrong', action: 'hide', wishId: ww1 }); assert.equal(r.status, 403);
r = await call('POST', `/api/walls/${wall}/manage`, { key, action: 'hide', wishId: ww1 }); assert.equal(r.status, 200);
await pg.query('UPDATE walls SET at=$1 WHERE id=$2', [now - 1000, wall]);
r = await call('GET', `/api/walls/${wall}`); assert.equal(r.body.open, true); assert.equal(r.body.wishes.length, 1); assert.equal(r.body.wishes[0].from, 'Anu');
r = await call('POST', `/api/walls/${wall}/manage`, { key, action: 'show', wishId: ww1 });
r = await call('GET', `/api/walls/${wall}`); const photoUrl = r.body.wishes.find((w) => w.photo).photo; assert.ok(photoUrl.startsWith('/api/photos/'));
{ let st = 0, ctype = '', bodyLen = 0; const res = { setHeader: (k, v) => { if (k === 'Content-Type') ctype = v; }, end: (b) => (bodyLen = b ? b.length : 0), set statusCode(v) { st = v; } };
  await handle({ method: 'GET', url: photoUrl, headers: {} }, res); assert.equal(st, 200); assert.equal(ctype, 'image/png'); assert.ok(bodyLen > 50); }
r = await call('POST', `/api/walls/${wall}/report`, { wishId: ww1, reason: 'test' }); assert.equal(r.status, 201);
r = await call('POST', '/api/admin/login', { password: 'test-password-123', name: 'Venky' });
r = await call('GET', '/api/admin/reports'); const rep = r.body.items.find((x) => x.kind === 'wallwish'); assert.ok(rep.wallWish.photo);
r = await call('POST', `/api/admin/reports/${rep.id}`, { action: 'remove' }); assert.equal(r.status, 200);
r = await call('GET', `/api/walls/${wall}`); assert.equal(r.body.wishes.length, 1);
r = await call('GET', '/api/admin/dashboard'); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.wallsWeek >= 1);
r = await call('GET', '/api/city/vizag'); assert.equal(r.status, 200); assert.ok(r.body.celebrationsToday >= 0);
console.log('All API tests passed.');
