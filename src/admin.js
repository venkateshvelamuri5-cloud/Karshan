import './styles/app.css';
import { CITIES, CATEGORIES, hourRate, DAY_RATE } from '../shared/cities.js';
import { api, esc, toast } from './lib/api.js';
import { now, dayStart, dLabel, tLabel, hhmm, dateInput, readInputs, ist, p2, shortLeft } from './lib/time.js';

const $ = (id) => document.getElementById(id);
const content = $('content');
const state = { view: 'dash', city: '', queueStatus: 'pending', sponsorCity: 'vizag', sponsorDay: dayStart(Date.now()) };
const REJECT_REASONS = ['Could not verify the business', 'Details are incomplete', 'Looks like spam', 'Not allowed on Karshan'];
const ago = (ms) => { const m = Math.round((now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

/* ---------- sign in ---------- */
async function boot() {
  let me;
  try { me = await api('admin/me'); } catch (e) { return showLogin(e.message); }
  if (!me.configured) return showLogin('', setupHelp(me));
  if (!me.signedIn) return showLogin();
  showConsole(me);
}
function setupHelp(me) {
  return `<div class="setup"><strong>Finish setting up</strong>
    <span>${me.configured ? '' : 'Add an <code>ADMIN_PASSWORD</code> environment variable in your Vercel project, then redeploy.'}</span>
    <span>${me.database ? '' : 'Connect a Postgres database (Vercel → Storage → Neon) so it adds <code>DATABASE_URL</code>.'}</span></div>`;
}
function showLogin(msg = '', extra = '') {
  $('login').hidden = false; $('console').hidden = true; $('adminBar').hidden = true;
  $('loginErr').textContent = msg;
  if (extra) $('loginNote').insertAdjacentHTML('afterend', extra);
  try { $('lName').value = localStorage.getItem('karshan-admin-name') || ''; } catch { /* storage blocked */ }
  ($('lName').value ? $('lPass') : $('lName')).focus();
}
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').textContent = '';
  const btn = $('loginBtn'); btn.disabled = true;
  try {
    const r = await api('admin/login', { method: 'POST', body: { name: $('lName').value, password: $('lPass').value } });
    try { localStorage.setItem('karshan-admin-name', $('lName').value); } catch { /* storage blocked */ }
    $('lPass').value = '';
    showConsole({ name: r.name, database: true });
  } catch (x) { $('loginErr').textContent = x.message; }
  finally { btn.disabled = false; }
});
$('logout').addEventListener('click', async () => { await api('admin/logout', { method: 'POST' }).catch(() => {}); location.reload(); });

function showConsole(me) {
  $('login').hidden = true; $('console').hidden = false; $('adminBar').hidden = false;
  $('whoami').textContent = 'Signed in as ' + (me.name || 'admin');
  $('cityFilter').innerHTML = '<option value="">All cities</option>' + Object.values(CITIES).map((c) => `<option value="${c.slug}">${esc(c.name)}${c.enabled ? '' : ' (off)'}</option>`).join('');
  $('cityFilter').value = state.city;
  const v = location.hash.slice(1);
  go(['dash', 'queue', 'sponsors', 'enquiries', 'reports', 'audit'].includes(v) ? v : 'dash');
  refreshBadges();
  setInterval(refreshBadges, 30000);
}
$('cityFilter').addEventListener('change', () => { state.city = $('cityFilter').value; if (state.city) state.sponsorCity = state.city; go(state.view); });
document.querySelector('.side').addEventListener('click', (e) => { const b = e.target.closest('.sidebtn'); if (b) go(b.dataset.view); });

function go(view) {
  state.view = view;
  history.replaceState(null, '', '#' + view);
  document.querySelectorAll('.sidebtn').forEach((b) => (b.dataset.view === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  ({ dash, queue, sponsors, enquiries, reports, audit })[view]();
}
function fail(e) {
  if (e.status === 401) return showLogin('Your session ended. Sign in again.');
  content.innerHTML = `<div class="setup"><strong>Couldn't load this</strong><span>${esc(e.message)}</span></div>`;
}

async function refreshBadges() {
  try {
    const d = await api('admin/dashboard' + (state.city ? '?city=' + state.city : ''));
    const set = (id, n) => { $(id).hidden = !n; $(id).textContent = n; };
    set('pendBadge', d.pending); set('enqBadge', d.newEnquiries); set('repBadge', d.openReports);
    document.title = (d.pending ? `(${d.pending}) ` : '') + 'Karshan Admin';
  } catch { /* shown when the view loads */ }
}

/* ---------- dashboard ---------- */
async function dash() {
  content.innerHTML = '<h2>Today</h2><p class="note">Loading…</p>';
  let d;
  try { d = await api('admin/dashboard' + (state.city ? '?city=' + state.city : '')); } catch (e) { return fail(e); }
  const k = (n, label, attn, view) => `<button type="button" class="kpi${attn && n ? ' attn' : ''}" ${view ? `data-go="${view}" style="cursor:pointer;text-align:left;color:inherit;font:inherit"` : ''}><b>${n}</b><span>${label}</span></button>`;
  content.innerHTML = `<h2>Today · ${esc(dLabel(now()))}</h2>
    <div class="kpis">
      ${k(d.pending, 'waiting for approval', true, 'queue')}
      ${k(d.liveToday, 'announcements on the clock today')}
      ${k(d.approvedWeek, 'approved this week')}
      ${k(d.wallsToday, 'birthday walls opening today')}
      ${k(d.wallsWeek, 'walls created this week')}
      ${k(d.wallWishesWeek, 'wishes added to walls this week')}
      ${k(d.photosWeek, 'photos uploaded this week')}
      ${k(d.newEnquiries, 'new sponsor enquiries', true, 'enquiries')}
      ${k(d.openReports, 'open reports', true, 'reports')}
      ${k(Math.round(d.sponsoredHoursToday * 10) / 10, 'sponsored hours today', false, 'sponsors')}
      ${k(d.watchingNow, 'people on the site now')}
      ${k(d.reactionsToday, 'reactions today')}
    </div>
    <div class="panel"><h3>Coming up on the clock</h3>
      <div class="list">${d.upcoming.length ? d.upcoming.map((a) => `<div class="item" style="cursor:default"><span class="tm">${hhmm(a.at)}<small>${esc(dLabel(a.at))}</small></span><span class="w"><strong>${esc(a.business)} · ${esc(a.title)}</strong><small>${esc(CITIES[a.city]?.short || a.city)} · ${esc(a.area)} · ${esc(a.cat)}</small></span><span class="lf">${shortLeft(a.at - now())}</span></div>`).join('') : '<p class="empty">Nothing approved yet. New announcements appear under Approvals.</p>'}</div>
    </div>`;
  content.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
}

/* ---------- approvals ---------- */
async function queue() {
  const s = state.queueStatus;
  content.innerHTML = `<h2>Approvals</h2>
    <div class="seg" role="group" aria-label="Status">${['pending', 'approved', 'rejected'].map((x) => `<button type="button" aria-pressed="${x === s}" data-s="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
    <div class="list" id="reqs"><p class="note">Loading…</p></div>`;
  content.querySelector('.seg').onclick = (e) => { const b = e.target.closest('button'); if (b) { state.queueStatus = b.dataset.s; queue(); } };
  let items;
  try { items = (await api(`admin/announcements?status=${s}${state.city ? '&city=' + state.city : ''}`)).items; } catch (e) { return fail(e); }
  const box = $('reqs');
  if (!items.length) { box.innerHTML = `<p class="empty">${s === 'pending' ? 'All caught up. Nothing waiting.' : 'Nothing here yet.'}</p>`; return; }
  box.innerHTML = items.map(reqCard).join('');
  box.onclick = onReqClick;
}
function reqCard(a) {
  const c = a.checks || {};
  const checks = a.status === 'pending' ? [
    c.phoneOk ? '<span class="chk good">Phone looks valid</span>' : '<span class="chk warn">Phone looks wrong</span>',
    c.returningBusiness ? '<span class="chk good">Approved before</span>' : '<span class="chk">First time</span>',
    c.duplicate ? '<span class="chk warn">Possible duplicate</span>' : '',
    c.inPast ? '<span class="chk warn">Time has passed</span>' : '',
  ].join('') : '';
  return `<article class="req" data-id="${a.id}">
    <div class="meta"><span class="tag">${esc(CITIES[a.city]?.short || a.city)}</span><span class="tag">${esc(a.cat)}</span><span class="tag">${esc(a.area)}</span><span class="tag">${esc(dLabel(a.at))} · ${esc(tLabel(a.at))}</span>${checks}</div>
    <h3>${esc(a.business)}: ${esc(a.title)}</h3>
    ${a.offer ? `<div class="offer"><span>${esc(a.offer)}</span>${a.code ? `<b>${esc(a.code)}</b>` : ''}</div>` : ''}
    <div class="note">☎ <a href="tel:${esc(a.phone)}">${esc(a.phone)}</a> · submitted ${ago(a.createdAt)}${a.reviewedBy ? ` · reviewed by ${esc(a.reviewedBy)}` : ''}${a.rejectReason ? ` · “${esc(a.rejectReason)}”` : ''}</div>
    <div class="actions">
      ${a.status !== 'approved' ? '<button class="btn small primary" type="button" data-act="approve">Approve</button>' : ''}
      <button class="btn small" type="button" data-act="edit">Edit</button>
      ${a.status !== 'rejected' ? `<button class="btn small" type="button" data-act="reject">${a.status === 'approved' ? 'Take down' : 'Reject'}</button>` : ''}
      ${a.status !== 'pending' ? '<button class="btn small" type="button" data-act="delete">Delete</button>' : ''}
    </div>
    <div class="slotfor"></div>
  </article>`;
}
async function review(id, body, okMsg) {
  try { await api('admin/announcements/' + id, { method: 'POST', body }); toast(okMsg); refreshBadges(); queue(); }
  catch (e) { if (e.status === 401) return fail(e); toast(e.message); }
}
let editing = null;
async function onReqClick(e) {
  const card = e.target.closest('.req'); if (!card) return;
  const id = card.dataset.id, act = e.target.dataset.act, slot = card.querySelector('.slotfor');
  if (act === 'approve') return review(id, { action: 'approve' }, 'Approved. It is on the clock.');
  if (act === 'delete') {
    slot.innerHTML = `<div class="actions"><span class="note">Delete this for good?</span><button class="btn small" type="button" data-act="confirmDelete">Yes, delete</button><button class="btn small" type="button" data-act="cancel">Keep it</button></div>`;
    return;
  }
  if (act === 'confirmDelete') return review(id, { action: 'delete' }, 'Deleted.');
  if (act === 'cancel') { slot.innerHTML = ''; return; }
  if (act === 'reject') {
    slot.innerHTML = `<div class="edit"><span class="note">Why? The business sees this reason.</span>
      <div class="reasons">${REJECT_REASONS.map((r) => `<button class="chip" type="button" data-reason="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <label class="f">Or write your own<input type="text" maxlength="200" class="rr"></label>
      <div class="actions"><button class="btn small" type="button" data-act="sendReject">Reject</button><button class="btn small" type="button" data-act="cancel">Cancel</button></div></div>`;
    return;
  }
  if (e.target.dataset.reason) { slot.querySelector('.rr').value = e.target.dataset.reason; return; }
  if (act === 'sendReject') {
    const reason = slot.querySelector('.rr').value.trim();
    if (!reason) { toast('Pick or write a reason first.'); return; }
    return review(id, { action: 'reject', reason }, 'Rejected.');
  }
  if (act === 'edit') {
    let items;
    try { items = (await api(`admin/announcements?status=${state.queueStatus}${state.city ? '&city=' + state.city : ''}`)).items; } catch (x) { return fail(x); }
    const a = items.find((x) => x.id === id); if (!a) return;
    editing = a;
    const city = CITIES[a.city];
    slot.innerHTML = `<form class="edit" data-edit="${id}">
      <div class="two"><label class="f">Business<input type="text" name="business" maxlength="40" value="${esc(a.business)}"></label><label class="f">Announcement<input type="text" name="title" maxlength="60" value="${esc(a.title)}"></label></div>
      <div class="two"><label class="f">Type<select name="cat">${CATEGORIES.map((c) => `<option ${c === a.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label class="f">Area<select name="area">${city.areas.map((x) => `<option ${x === a.area ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label></div>
      <div class="two"><label class="f">Date<input type="date" name="date" value="${dateInput(a.at)}"></label><label class="f">Time (IST)<input type="time" name="time" step="60" value="${hhmm(a.at)}"></label></div>
      <div class="two"><label class="f">Offer<input type="text" name="offer" maxlength="60" value="${esc(a.offer)}"></label><label class="f">Code<input type="text" name="code" maxlength="16" value="${esc(a.code)}"></label></div>
      <div class="actions"><button class="btn small primary" type="submit">Save changes</button><button class="btn small" type="button" data-act="cancel">Cancel</button></div></form>`;
    slot.querySelector('form').onsubmit = (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      const at = readInputs(f.get('date'), f.get('time'));
      review(id, { action: 'update', fields: { business: f.get('business'), title: f.get('title'), cat: f.get('cat'), area: f.get('area'), at, offer: f.get('offer'), code: f.get('code') } }, 'Saved.');
    };
  }
}

/* ---------- sponsors calendar ---------- */
async function sponsors() {
  const cityOpts = Object.values(CITIES).map((c) => `<option value="${c.slug}" ${c.slug === state.sponsorCity ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  content.innerHTML = `<h2>Sponsorship calendar</h2>
    <div class="row">
      <label class="cityswitch" for="spCity">City <select id="spCity">${cityOpts}</select></label>
      <button class="btn small" type="button" id="dPrev" aria-label="Previous day">◀</button>
      <input type="date" id="spDay" value="${dateInput(state.sponsorDay)}" style="max-width:180px">
      <button class="btn small" type="button" id="dNext" aria-label="Next day">▶</button>
      <button class="btn small" type="button" id="bookDay">Book the whole day · ${inr(DAY_RATE)}</button>
    </div>
    <div id="bookBox"></div>
    <div class="cal" id="cal"><p class="note">Loading…</p></div>`;
  $('spCity').onchange = () => { state.sponsorCity = $('spCity').value; sponsors(); };
  $('spDay').onchange = () => { const t = readInputs($('spDay').value, '00:00'); if (t) { state.sponsorDay = t; sponsors(); } };
  $('dPrev').onclick = () => { state.sponsorDay -= 86400e3; sponsors(); };
  $('dNext').onclick = () => { state.sponsorDay += 86400e3; sponsors(); };
  $('bookDay').onclick = () => openBook(0, 24);
  let items;
  try { items = (await api(`admin/sponsors?city=${state.sponsorCity}&from=${state.sponsorDay}&to=${state.sponsorDay + 86400e3}`)).items; } catch (e) { return fail(e); }
  const nowH = dayStart(now()) === state.sponsorDay ? ist(now()).getUTCHours() : -1;
  let html = '';
  for (let h = 0; h < 24; h++) {
    const t = state.sponsorDay + h * 3600e3 + 1;
    const b = items.find((s) => s.startsAt <= t && s.endsAt > t);
    const first = b && Math.abs(b.startsAt - (state.sponsorDay + h * 3600e3)) < 1000 || (b && h === 0);
    html += `<div class="slot${b ? ' booked' : ''}${h === nowH ? ' now' : ''}"><span class="h">${p2(h)}:00</span>
      <span class="b">${b ? `<i style="background:${esc(b.color)}"></i><strong>${esc(b.brand)}</strong>${first && b.price ? `<small>${inr(b.price)}</small>` : ''}` : `<small>Open · ${inr(hourRate(h))}</small>`}</span>
      ${b ? (first ? `<button class="btn small" type="button" data-del="${b.id}">Remove</button>` : '<small>continued</small>') : `<button class="btn small" type="button" data-book="${h}">Book</button>`}</div>`;
  }
  $('cal').innerHTML = html;
  $('cal').onclick = async (e) => {
    const bk = e.target.dataset.book, del = e.target.dataset.del;
    if (bk != null) openBook(+bk, 1);
    if (del) {
      try { await api('admin/sponsors/' + del, { method: 'DELETE' }); toast('Booking removed.'); sponsors(); } catch (x) { toast(x.message); }
    }
  };
}
function openBook(h, hours) {
  const price = hours >= 24 ? DAY_RATE : hourRate(h) * hours;
  $('bookBox').innerHTML = `<form class="bookform" id="bookForm">
    <label class="f">Brand<input type="text" name="brand" maxlength="30" required></label>
    <label class="f">Colour<input type="color" name="color" value="#ffab3d"></label>
    <label class="f">From<input type="time" name="from" step="3600" value="${p2(h)}:00"></label>
    <label class="f">Hours<input type="number" name="hours" min="1" max="24" value="${hours}"></label>
    <label class="f">Price (₹)<input type="number" name="price" min="0" value="${price}"></label>
    <label class="f">Note<input type="text" name="note" maxlength="200" placeholder="Paid by UPI, invoice #"></label>
    <div class="actions"><button class="btn small primary" type="submit">Book</button><button class="btn small" type="button" id="bookCancel">Cancel</button></div>
  </form>`;
  const f = $('bookForm');
  f.brand.focus();
  $('bookCancel').onclick = () => ($('bookBox').innerHTML = '');
  f.hours.oninput = f.from.oninput = () => {
    const hh = +(f.from.value.split(':')[0] || 0), n = Math.max(1, Math.min(24, +f.hours.value || 1));
    f.price.value = n >= 24 ? DAY_RATE : Array.from({ length: n }, (_, i) => hourRate((hh + i) % 24)).reduce((a, b) => a + b, 0);
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const startH = +(f.from.value.split(':')[0] || 0), n = Math.max(1, Math.min(24, +f.hours.value || 1));
    const startsAt = state.sponsorDay + startH * 3600e3;
    try {
      await api('admin/sponsors', { method: 'POST', body: { city: state.sponsorCity, brand: f.brand.value, color: f.color.value, startsAt, endsAt: startsAt + n * 3600e3, price: +f.price.value, note: f.note.value } });
      toast('Booked. It shows on the clock for that time.');
      sponsors();
    } catch (x) { toast(x.message); }
  };
}

/* ---------- enquiries ---------- */
async function enquiries() {
  content.innerHTML = '<h2>Sponsor enquiries</h2><div class="list" id="enq"><p class="note">Loading…</p></div>';
  let items;
  try { items = (await api('admin/enquiries')).items; } catch (e) { return fail(e); }
  if (state.city) items = items.filter((x) => !x.city || x.city === state.city);
  const box = $('enq');
  if (!items.length) { box.innerHTML = '<p class="empty">No enquiries yet. They arrive from the “Sponsor an hour” form.</p>'; return; }
  box.innerHTML = items.map((q) => `<article class="req" data-id="${q.id}">
    <div class="meta"><span class="tag">${esc(q.interest || 'Sponsorship')}</span>${q.city ? `<span class="tag">${esc(CITIES[q.city]?.short || q.city)}</span>` : ''}<span class="tag">${ago(q.createdAt)}</span></div>
    <h3>${esc(q.brand)}</h3>
    <div class="note">${esc(q.name)} · ☎ <a href="tel:${esc(q.phone)}">${esc(q.phone)}</a>${q.note ? ` · “${esc(q.note)}”` : ''}</div>
    <div class="two"><label class="f">Status<select data-k="status">${['new', 'contacted', 'won', 'lost'].map((s) => `<option value="${s}" ${s === q.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
    <label class="f">Your notes<input type="text" data-k="note" maxlength="500" value="${esc(q.adminNote)}" placeholder="Call back Monday"></label></div>
    <div class="actions"><button class="btn small" type="button" data-save>Save</button></div></article>`).join('');
  box.onclick = async (e) => {
    if (!e.target.hasAttribute('data-save')) return;
    const card = e.target.closest('.req');
    try {
      await api('admin/enquiries/' + card.dataset.id, { method: 'POST', body: { status: card.querySelector('[data-k=status]').value, adminNote: card.querySelector('[data-k=note]').value } });
      toast('Saved.'); refreshBadges();
    } catch (x) { toast(x.message); }
  };
}

/* ---------- reports ---------- */
async function reports() {
  content.innerHTML = '<h2>Reports</h2><p class="note">Wishes and photos stay private. You only see one here if someone reported it.</p><div class="list" id="reps"><p class="note">Loading…</p></div>';
  let items;
  try { items = (await api('admin/reports')).items; } catch (e) { return fail(e); }
  const box = $('reps');
  if (!items.length) { box.innerHTML = '<p class="empty">No open reports.</p>'; return; }
  box.innerHTML = items.map((r) => {
    const ww = r.wallWish, w = r.wish;
    const body = ww
      ? `${ww.photo ? `<img src="${esc(ww.photo)}" alt="Reported photo" style="max-width:220px;border-radius:10px">` : ''}<h3>“${esc(ww.message)}”</h3><div class="note">From ${esc(ww.from)} on ${esc(ww.forName)}'s wall · <a href="/b/${esc(ww.wallId)}" target="_blank" rel="noopener">open wall</a>${ww.hidden ? ' · already hidden' : ''}</div>`
      : w ? `<h3>“${esc(w.message)}”</h3><div class="note">For ${esc(w.to)} from ${esc(w.from)} · opens ${esc(dLabel(w.at))} ${esc(tLabel(w.at))}</div>`
      : '<div class="note">This was already removed.</div>';
    const canRemove = (ww && !ww.hidden) || w;
    return `<article class="req" data-id="${r.id}">
    <div class="meta"><span class="tag">${ww ? 'Reported wall wish' : 'Reported wish'}</span><span class="tag">${ago(r.createdAt)}</span></div>
    ${body}
    <div class="note">Reason: ${esc(r.reason || 'none given')}</div>
    <div class="actions">${canRemove ? `<button class="btn small" type="button" data-a="remove">${ww ? 'Hide it' : 'Remove the wish'}</button>` : ''}<button class="btn small" type="button" data-a="dismiss">Dismiss</button></div></article>`;
  }).join('');
  box.onclick = async (e) => {
    const a = e.target.dataset.a; if (!a) return;
    try { await api('admin/reports/' + e.target.closest('.req').dataset.id, { method: 'POST', body: { action: a } }); toast(a === 'remove' ? 'Hidden from the wall.' : 'Dismissed.'); refreshBadges(); reports(); }
    catch (x) { toast(x.message); }
  };
}

/* ---------- activity ---------- */
async function audit() {
  content.innerHTML = '<h2>Activity</h2><div class="tbl" id="aud"><p class="note" style="padding:12px">Loading…</p></div>';
  let items;
  try { items = (await api('admin/audit')).items; } catch (e) { return fail(e); }
  $('aud').innerHTML = `<table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead><tbody>${items.map((a) => `<tr><td class="t">${esc(dLabel(a.at))} ${esc(hhmm(a.at))}</td><td>${esc(a.actor)}</td><td>${esc(a.action.replace('.', ' · '))}</td><td>${esc(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4">Nothing yet.</td></tr>'}</tbody></table>`;
}

boot();
