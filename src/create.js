import './styles/app.css';
import { THREE, reduce, THEMES, CAT_COL, glowSprite, skyDome, starField, makeSea, startRenderer } from './lib/kit.js';
import { CITIES, CATEGORIES } from '../shared/cities.js';
import { now, dayStart, dateInput, readInputs, dLabel, tLabel, fmtLeft, ist, p2 } from './lib/time.js';
import { api, esc } from './lib/api.js';
import { renderHeader, currentCity } from './lib/header.js';

renderHeader('create');
const $ = (id) => document.getElementById(id);
const enabledCities = Object.values(CITIES).filter((c) => c.enabled);

/* ---------- a calm sky behind the forms ---------- */
(function sky() {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 900);
  scene.fog = new THREE.Fog(0x1a1640, 60, 320);
  scene.add(skyDome('#070b22', '#7a3f5a', 0.6));
  const stars = starField(700, 250, 380, 1.4); scene.add(stars);
  const sea = makeSea(600, 120, '#06182a', '#1d5a6e', '#ffe7b8'); sea.position.set(0, -6, -150); sea.material.uniforms.fogC.value.set('#2a2050'); scene.add(sea);
  const lanterns = [];
  for (let i = 0; i < 90; i++) {
    const s = glowSprite(i % 4 ? 0xffa53a : 0xffd38a, 1 + Math.random() * 1.6, 0.8);
    s.position.set((Math.random() - 0.5) * 200, Math.random() * 70 - 6, -30 - Math.random() * 150);
    s.userData.v = 0.8 + Math.random() * 1.6; scene.add(s); lanterns.push(s);
  }
  cam.position.set(0, 8, 40); cam.lookAt(0, 14, -40);
  startRenderer({ scene, cam, update: (dt, t) => {
    sea.material.uniforms.t.value = t / 1000;
    for (const s of lanterns) { s.position.y += s.userData.v * dt * (reduce ? 0.3 : 1); if (s.position.y > 75) s.position.y = -6; }
    stars.rotation.y += dt * 0.004;
  } });
})();

/* ---------- tabs ---------- */
function setTab(t) {
  [['biz', 'tabBiz', 'paneBiz'], ['wish', 'tabWish', 'paneWish'], ['sponsor', 'tabSp', 'paneSp']].forEach(([k, tb, pn]) => {
    $(tb).setAttribute('aria-selected', String(k === t));
    $(pn).hidden = k !== t;
  });
  renderBizPv(); renderWishPv();
}
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab'); if (!b) return;
  history.replaceState(null, '', b.dataset.tab === 'biz' ? '/create' : '/create#' + b.dataset.tab);
  setTab(b.dataset.tab);
});

/* ---------- business announcement ---------- */
$('bCity').innerHTML = enabledCities.map((c) => `<option value="${c.slug}">${esc(c.name)}</option>`).join('');
$('bCity').value = CITIES[currentCity()]?.enabled ? currentCity() : enabledCities[0].slug;
$('bCat').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
function fillAreas() { $('bArea').innerHTML = CITIES[$('bCity').value].areas.map((a) => `<option>${esc(a)}</option>`).join(''); }
fillAreas();
$('bCity').addEventListener('change', () => { fillAreas(); renderBizPv(); });

function defaults() {
  const n = now(), b = n + 3 * 3600e3;
  $('bDate').value = dateInput(b); $('bTime').value = p2(ist(b).getUTCHours()) + ':00'; $('bDate').min = dateInput(n);
  const midnight = dayStart(n) + 86400e3;
  $('wDate').value = dateInput(midnight); $('wTime').value = '00:00'; $('wDate').min = dateInput(n);
}
defaults();

function renderBizPv() {
  const at = readInputs($('bDate').value, $('bTime').value), cat = $('bCat').value;
  $('bizPv').innerHTML = `<span class="tag" style="color:${CAT_COL[cat]}">${esc(cat)} · ${esc($('bArea').value)}</span>
    <div class="t">${esc($('bName').value.trim() || 'Dosa District')}: ${esc($('bTitle').value.trim() || 'Grand opening')}</div>
    <div class="when">${at ? esc(dLabel(at)) + ' · ' + esc(tLabel(at)) : 'Pick a time'}</div>
    ${$('bOffer').value.trim() ? `<div class="offer"><span>${esc($('bOffer').value.trim())}</span>${$('bCode').value.trim() ? `<b>${esc($('bCode').value.trim().toUpperCase())}</b>` : ''}</div>` : ''}
    <p class="note">A lantern appears on the ring at this time. When it opens, the name bursts onto the dial for everyone watching, and the code appears.</p>`;
}
['bName', 'bTitle', 'bCat', 'bArea', 'bDate', 'bTime', 'bOffer', 'bCode'].forEach((id) => $(id).addEventListener('input', renderBizPv));

$('bizForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('bizErr'); err.className = 'err'; err.textContent = '';
  const at = readInputs($('bDate').value, $('bTime').value);
  if (!$('bName').value.trim() || !$('bTitle').value.trim()) { err.textContent = 'Add the business name and what you are announcing.'; return; }
  if (!at || at < now()) { err.textContent = 'Pick a time in the future.'; return; }
  const btn = $('bizBtn'); btn.disabled = true; btn.textContent = 'Sending…';
  try {
    await api('announcements', { method: 'POST', body: { city: $('bCity').value, business: $('bName').value, title: $('bTitle').value, category: $('bCat').value, area: $('bArea').value, at, offer: $('bOffer').value, code: $('bCode').value, phone: $('bPhone').value } });
    err.className = 'ok';
    err.textContent = 'Sent for approval. Once approved, your lantern appears on the clock. We may call to verify.';
    const city = $('bCity').value;
    $('bizForm').reset(); $('bCity').value = city; fillAreas(); defaults(); renderBizPv();
  } catch (x) {
    err.textContent = x.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Submit for approval';
  }
});

/* ---------- private wish ---------- */
const swb = $('swatches');
Object.entries(THEMES).forEach(([k, t], i) => {
  const l = document.createElement('label'); l.className = 'swatch';
  l.innerHTML = `<input type="radio" name="theme" value="${k}" ${i === 0 ? 'checked' : ''} aria-label="${t.name}"><span><i style="background:${t.ring}"></i>${t.name}</span>`;
  swb.appendChild(l);
});
const wishTheme = () => document.querySelector('input[name=theme]:checked')?.value || 'marigold';
function renderWishPv() {
  const at = readInputs($('wDate').value, $('wTime').value), th = THEMES[wishTheme()], pv = $('wishPv');
  pv.style.background = `radial-gradient(circle at 50% 0%,${th.glow},${th.bg})`;
  pv.innerHTML = `<div class="t" style="font-style:italic;font-weight:600">For ${esc($('wTo').value.trim() || 'Amma')}</div><div class="note">from ${esc($('wFrom').value.trim() || 'you')}</div>
    <div class="when" style="color:${th.ring}">${at ? esc(dLabel(at)) + ' · ' + esc(tLabel(at)) + ' IST' : 'Pick a time'}</div>
    <div class="when" style="font-size:2rem;color:var(--foam)" id="wpvLeft">${at ? fmtLeft(at - now()) : ''}</div><div class="note">🔒 Opens at the minute</div>`;
}
['wTo', 'wFrom', 'wMsg', 'wDate', 'wTime'].forEach((id) => $(id).addEventListener('input', renderWishPv));
swb.addEventListener('change', renderWishPv);
setInterval(() => { const el = $('wpvLeft'), at = readInputs($('wDate').value, $('wTime').value); if (el && at) el.textContent = fmtLeft(at - now()); }, 1000);

$('wishForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('wishErr'); err.textContent = '';
  const at = readInputs($('wDate').value, $('wTime').value);
  if (!$('wTo').value.trim() || !$('wFrom').value.trim() || !$('wMsg').value.trim()) { err.textContent = 'Fill in who it is for, who it is from, and your wish.'; return; }
  if (!at || at < now() + 60000) { err.textContent = 'Pick a time at least a couple of minutes from now.'; return; }
  const btn = $('wishBtn'); btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const r = await api('wishes', { method: 'POST', body: { to: $('wTo').value, from: $('wFrom').value, message: $('wMsg').value, at, theme: wishTheme(), city: currentCity() } });
    try { sessionStorage.setItem('created-' + r.id, '1'); } catch { /* storage blocked */ }
    location.href = '/w/' + r.id;
  } catch (x) {
    err.textContent = x.message;
    btn.disabled = false; btn.textContent = 'Create my private link';
  }
});

/* ---------- sponsor enquiry ---------- */
$('spForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('spErr'); err.className = 'err'; err.textContent = '';
  if (!$('sBiz').value.trim() || !$('sName').value.trim() || !$('sPhone').value.trim()) { err.textContent = 'Add the brand, your name and a phone number.'; return; }
  const btn = $('spBtn'); btn.disabled = true;
  try {
    await api('enquiries', { method: 'POST', body: { brand: $('sBiz').value, name: $('sName').value, phone: $('sPhone').value, interest: $('sWhat').value, note: $('sNote').value, city: currentCity() } });
    err.className = 'ok'; err.textContent = 'Thanks. We will call you within a day.';
    $('spForm').reset();
  } catch (x) {
    err.textContent = x.message;
  } finally {
    btn.disabled = false;
  }
});

const initial = location.hash.slice(1);
setTab(initial === 'wish' || initial === 'sponsor' ? initial : 'biz');
