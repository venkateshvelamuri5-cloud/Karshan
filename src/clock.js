import './styles/app.css';
import { THREE, reduce, CAT_COL, glowSprite, skyDome, starField, makeSea, makeLightText, makePetals, makeLantern, startRenderer } from './lib/kit.js';
import { CITIES, REACTIONS, LIVE_SPAN_MS } from '../shared/cities.js';
import { ist, now as nowMs, p2, dayStart, tLabel, hhmm, hhmmss, dLabel, fmtLeft, shortLeft, MIN } from './lib/time.js';
import { api, esc, clientId, copyText, toast } from './lib/api.js';
import { renderHeader, currentCity, rememberCity } from './lib/header.js';

renderHeader('clock');
const $ = (id) => document.getElementById(id);
const cv = document.getElementById('gl');
const CITY = CITIES[currentCity()];

/* ---------- data ---------- */
let feed = null;           // last response from /api/city/:slug
let usingSamples = false;
let selectedId = null;
let areaFilter = 'All';
const seenLive = new Set();
let firstFeed = true;

// Clearly-labelled sample lanterns, shown until the city has its first real announcement.
let SAMPLES = null;
function samples() {
  if (SAMPLES) return SAMPLES;
  const n = nowMs(), soon = Math.ceil((n + 40000) / MIN) * MIN, ds = dayStart(n), at = (d, h, m) => ds + d * 86400e3 + (h * 60 + m) * MIN;
  const r5 = (x) => Math.round(x / (5 * MIN)) * 5 * MIN;
  SAMPLES = [
    { id: 's1', business: 'Beach Road Book Café', title: 'Opens its doors', cat: 'Opening', area: CITY.areas[0], at: Math.round((n - 95 * MIN) / MIN) * MIN, offer: 'First 30 coffees free', code: 'BOOKS30' },
    { id: 's2', business: 'Monsoon Mart', title: 'One-hour flash sale', cat: 'Offer', area: CITY.areas[2], at: soon, offer: 'Flat ₹150 off on ₹999', code: 'FLASH150' },
    { id: 's3', business: 'Dosa District', title: 'Grand opening', cat: 'Opening', area: CITY.areas[1], at: r5(n + 125 * MIN), offer: '20% off till 8 PM', code: 'DOSA20' },
    { id: 's4', business: 'Kailasa Fitness', title: 'Open house night', cat: 'Event', area: CITY.areas[4], at: r5(n + 270 * MIN), offer: 'Free trial week', code: '' },
    { id: 's5', business: 'Andhra Spice Kitchen', title: 'Biryani launch night', cat: 'Launch', area: CITY.areas[3], at: at(1, 19, 30), offer: 'Free dessert with every biryani', code: 'SPICE' },
  ].map((x) => ({ ...x, sample: true, reactions: {} }));
  return SAMPLES;
}
const SAMPLE_SPONSORS = [{ n: 'Raftaar EV', c: '#14b8a6' }, { n: 'Kesar & Co.', c: '#f59e0b' }, { n: 'Tara Telecom', c: '#4f46e5' }, { n: 'Saffron Threads', c: '#be123c' }, { n: 'Monsoon Mart', c: '#059669' }];

function visibleList() {
  const real = feed?.announcements || [];
  if (real.length || !CITY.samples) { usingSamples = false; return real; }
  usingSamples = true;
  return samples();
}
// Sponsor for a given hour of today (IST), from bookings, or a labelled sample.
function sponsorForHour(h) {
  const ds = dayStart(nowMs()), t = ds + h * 3600e3 + 1;
  const real = (feed?.sponsors || []).find((s) => s.startsAt <= t && s.endsAt > t);
  if (real) return { n: real.brand, c: real.color, sample: false };
  if (usingSamples && h >= 7 && h <= 23 && h !== 15) return { ...SAMPLE_SPONSORS[Math.floor(h / 3) % SAMPLE_SPONSORS.length], sample: true };
  return null;
}

/* ---------- the dial ---------- */
const C=(()=>{
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,900);
  scene.add(skyDome('#050817','#1d1d4a',.8));const stars=starField(700,250,380,1.4);scene.add(stars);
  const sea=makeSea(500,120,'#040d1c','#123a52','#ffd9a0');sea.position.set(0,-17,-100);sea.material.uniforms.fogC.value.set('#141838');sea.material.uniforms.fogD.value=.008;scene.add(sea);
  scene.add(new THREE.AmbientLight(0xffffff,.6));const kl=new THREE.PointLight(0xffd29a,1.1,160);kl.position.set(-18,22,30);scene.add(kl);
  const dial=new THREE.Group();scene.add(dial);
  const brass=new THREE.MeshStandardMaterial({color:0xd4a94f,metalness:.85,roughness:.3});
  const back=new THREE.Mesh(new THREE.CylinderGeometry(11,11,.8,96),new THREE.MeshStandardMaterial({color:0x10163a,metalness:.2,roughness:.7}));back.rotation.x=Math.PI/2;back.position.z=-.6;dial.add(back);
  dial.add(new THREE.Mesh(new THREE.TorusGeometry(11,.38,20,140),brass));
  const track=new THREE.Mesh(new THREE.TorusGeometry(13.2,.05,8,180),new THREE.MeshBasicMaterial({color:0x5a6aa8,transparent:true,opacity:.6}));dial.add(track);
  for(let i=0;i<24;i++){const th=i/24*Math.PI*2,tk=new THREE.Mesh(new THREE.BoxGeometry(.08,i%6===0?.9:.45,.05),new THREE.MeshBasicMaterial({color:0x8a96c8}));tk.position.set(Math.sin(th)*13.2,Math.cos(th)*13.2,0);tk.rotation.z=-th;dial.add(tk);
    if(i%6===0){const c=document.createElement('canvas');c.width=96;c.height=48;const x=c.getContext('2d');x.fillStyle='#a1aacb';x.font='700 34px "Barlow Condensed", sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(p2(i),48,26);
      const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));s.scale.set(2,1,1);s.position.set(Math.sin(th)*14.8,Math.cos(th)*14.8,0);dial.add(s);}}
  // 24 hour tiles = sponsor slots
  const tiles=[];
  for(let i=0;i<24;i++){const c=document.createElement('canvas');c.width=160;c.height=200;const t=new THREE.CanvasTexture(c);const mat=new THREE.MeshBasicMaterial({map:t});
    const side=new THREE.MeshBasicMaterial({color:0x1a2250});const m=new THREE.Mesh(new THREE.BoxGeometry(2.05,2.5,.3),[side,side,side,side,mat,side]);
    const th=(i+.5)/24*Math.PI*2;m.position.set(Math.sin(th)*8.9,Math.cos(th)*8.9,0);m.rotation.z=-th;m.userData={c,t,th,i,z:0};dial.add(m);tiles.push(m);}
  function paintTiles(){tiles.forEach(m=>{const {c,t,th,i}=m.userData;
    const x=c.getContext('2d'),sp=sponsorForHour(i);x.fillStyle=sp?sp.c:'#1b2453';x.fillRect(0,0,160,200);
    x.save();x.translate(80,100);if(th>Math.PI/2&&th<Math.PI*1.5)x.rotate(Math.PI);x.fillStyle='#fff';x.textAlign='center';x.textBaseline='middle';
    x.font='700 70px "Barlow Condensed", sans-serif';x.fillText(p2(i),0,-26);x.font='700 26px "Barlow Condensed", sans-serif';
    const lab=(sp?sp.n:'OPEN').toUpperCase();let fs=26;while(x.measureText(lab).width>146&&fs>12){fs-=2;x.font=`700 ${fs}px "Barlow Condensed", sans-serif`;}x.globalAlpha=sp?1:.6;x.fillText(lab,0,44);x.restore();t.needsUpdate=true;});}
  paintTiles();
  // centre face
  const faceC=document.createElement('canvas');faceC.width=faceC.height=1024;const faceT=new THREE.CanvasTexture(faceC);
  const face=new THREE.Mesh(new THREE.CircleGeometry(7.6,96),new THREE.MeshBasicMaterial({map:faceT}));face.position.z=.05;dial.add(face);
  const hand=new THREE.Mesh(new THREE.BoxGeometry(.32,12.6,.16),brass);hand.geometry.translate(0,6.3,0);hand.position.z=.8;dial.add(hand);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.5,24),brass);hub.rotation.x=Math.PI/2;hub.position.z=.9;dial.add(hub);
  const halo=glowSprite(0xffab3d,30,.12);halo.position.z=-1;dial.add(halo);
  // lantern markers for moments
  const markers=new Map(),hitObjs=[];
  const selRing=new THREE.Mesh(new THREE.TorusGeometry(1.5,.08,8,48),new THREE.MeshBasicMaterial({color:0xffffff}));selRing.visible=false;dial.add(selRing);
  const text=makeLightText(4200,26,.3);dial.add(text.pts);text.pts.position.z=3;
  const petals=makePetals(320,['#ff9f1c','#ffbf3c','#35c2b0','#ef8fb3']);petals.colors(['#ff9f1c','#ffbf3c','#35c2b0','#ef8fb3']);dial.add(petals.mesh);
  // emoji sprites for reactions
  const emoTex={};REACTIONS.forEach(e=>{const c=document.createElement('canvas');c.width=c.height=96;const x=c.getContext('2d');x.font='72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(e,48,54);emoTex[e]=new THREE.CanvasTexture(c);});
  const emos=[];for(let i=0;i<70;i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false}));s.visible=false;dial.add(s);emos.push({s,on:false});}
  function emoji(e,from){const o=emos.find(x=>!x.on);if(!o)return;o.on=true;o.s.material.map=emoTex[e];o.s.material.needsUpdate=true;o.s.visible=true;o.t0=performance.now();
    o.p=(from||new THREE.Vector3(0,0,2)).clone();o.v=new THREE.Vector3((Math.random()-.5)*5,5+Math.random()*4,2+Math.random()*2);}
  let faceKey='',revealUntil=0;
  function syncMarkers(list){
    const keep=new Set();const ds=dayStart(nowMs());
    list.forEach(m=>{if(m.at<ds||m.at>=ds+86400e3)return;keep.add(m.id);let mk=markers.get(m.id);const col=CAT_COL[m.cat]||'#ffab3d';
      if(!mk){const g=makeLantern(col,3.2);g.scale.setScalar(.8);const hit=new THREE.Mesh(new THREE.SphereGeometry(1.4,10,8),new THREE.MeshBasicMaterial({visible:false}));hit.userData.id=m.id;g.add(hit);dial.add(g);hitObjs.push(hit);mk={g,hit,ph:Math.random()*6.28};markers.set(m.id,mk);}
      const d=ist(m.at),th=(d.getUTCHours()+d.getUTCMinutes()/60)/24*Math.PI*2;mk.th=th;mk.at=m.at;mk.g.userData.mat.color.set(col);mk.g.userData.glow.material.color.set(col);});
    for(const[id,mk]of markers)if(!keep.has(id)){dial.remove(mk.g);const k=hitObjs.indexOf(mk.hit);if(k>=0)hitObjs.splice(k,1);markers.delete(id);}}
  function paintFace(info){
    const key=JSON.stringify(info);if(key===faceKey)return;faceKey=key;const x=faceC.getContext('2d'),S=1024;
    const g=x.createRadialGradient(512,430,40,512,512,520);g.addColorStop(0,'#1f2a62');g.addColorStop(1,'#0b1030');x.fillStyle=g;x.fillRect(0,0,S,S);
    x.textAlign='center';x.textBaseline='middle';
    const fit=(txt,maxW,size,weight,fam)=>{x.font=`${weight} ${size}px ${fam}`;const w=x.measureText(txt).width;if(w>maxW){size*=maxW/w;x.font=`${weight} ${size}px ${fam}`;}};
    x.fillStyle=info.badgeCol||'#ffab3d';fit(info.badge,520,44,700,'Barlow, sans-serif');x.fillText(info.badge,512,250);
    x.fillStyle='#eef2ee';fit(info.title,760,info.small?84:120,800,'Fraunces, Georgia, serif');x.fillText(info.title,512,410);
    x.fillStyle='#c9d0ea';fit(info.sub,700,48,600,'Barlow, sans-serif');x.fillText(info.sub,512,530);
    if(info.meta){x.fillStyle='#ffab3d';fit(info.meta,620,56,700,'"Barlow Condensed", sans-serif');x.fillText(info.meta,512,630);}
    x.fillStyle='rgba(255,255,255,.55)';fit(info.sponsor,620,36,600,'Barlow, sans-serif');x.fillText(info.sponsor,512,790);
    faceT.needsUpdate=true;}
  const ray=new THREE.Raycaster(),mv=new THREE.Vector2();let mx=0,my=0,hover=null;
  cv.addEventListener('pointermove',e=>{const VW=innerWidth,VH=innerHeight;mx=e.clientX/VW-.5;my=e.clientY/VH-.5;mv.set(e.clientX/VW*2-1,-(e.clientY/VH)*2+1);ray.setFromCamera(mv,cam);const h=ray.intersectObjects(hitObjs)[0];hover=h?h.object.userData.id:null;cv.style.cursor=hover?'pointer':'default';});
  cv.addEventListener('click',e=>{const VW=innerWidth,VH=innerHeight;mv.set(e.clientX/VW*2-1,-(e.clientY/VH)*2+1);ray.setFromCamera(mv,cam);const h=ray.intersectObjects(hitObjs)[0];if(h)selectMoment(h.object.userData.id);});
  return{scene,cam,emoji,syncMarkers,paintFace,markers,paintTiles,refreshFace(){faceKey='';},
    reveal(m){text.set(m.business);text.f=1;text.mat.color.set(CAT_COL[m.cat]||'#ffab3d');text.burstNow();revealUntil=performance.now()+9000;if(!reduce)petals.burst(new THREE.Vector3(0,0,2));setTimeout(()=>petals.stop(),2500);},
    markerPos(id){const mk=markers.get(id);if(!mk)return null;return mk.g.position.clone();},
    update(dt,t){const VW=innerWidth,VH=innerHeight,sec=t/1000,now=nowMs(),d=ist(now),hrs=d.getUTCHours()+d.getUTCMinutes()/60+d.getUTCSeconds()/3600;
      const port=VW/VH;cam.position.set(reduce?0:mx*3,(reduce?0:-my*2)-1.5,port<1?Math.min(110,47/port):48);cam.lookAt(0,-1.2,0);
      dial.position.y=VW/VH<.75?2:1.2;
      hand.rotation.z=-hrs/24*Math.PI*2;sea.material.uniforms.t.value=sec;
      const curH=Math.floor(hrs);tiles.forEach(tl=>{const on=tl.userData.i===curH;tl.userData.z+=((on?.7:0)-tl.userData.z)*Math.min(1,dt*5);const r=8.9+tl.userData.z*.4;tl.position.set(Math.sin(tl.userData.th)*r,Math.cos(tl.userData.th)*r,tl.userData.z);});
      for(const[id,mk]of markers){const live=now>=mk.at&&now<mk.at+LIVE_SPAN_MS,past=now>=mk.at+LIVE_SPAN_MS,sel=id===selectedId;
        const r=13.2+Math.sin(sec*1.4+mk.ph)*.15;mk.g.position.set(Math.sin(mk.th)*r,Math.cos(mk.th)*r,1+(sel?1:0));
        mk.g.scale.setScalar((live?1.15:past?.55:.8)*(id===hover||sel?1.25:1)*(live?1+Math.sin(sec*4)*.06:1));mk.g.userData.glow.material.opacity=past?.25:live?1:.75;mk.g.rotation.y=sec*.6+mk.ph;}
      const sm=selectedId&&markers.get(selectedId);selRing.visible=!!sm;if(sm){selRing.position.copy(sm.g.position);selRing.rotation.z+=dt;}
      if(text.pts.visible){if(performance.now()>revealUntil){text.mode='toggle';text.goal=0;}text.update(t,dt);}
      face.visible=!text.pts.visible||text.mat.opacity<.5;
      petals.update(dt);
      for(const o of emos){if(!o.on)continue;const k=(performance.now()-o.t0)/1800;if(k>=1){o.on=false;o.s.visible=false;continue;}o.v.y-=3*dt;o.p.addScaledVector(o.v,dt);o.s.position.copy(o.p);o.s.scale.setScalar(1.6+k);o.s.material.opacity=1-k*k;}
      halo.material.opacity=.12+Math.sin(sec*1.5)*.04;stars.rotation.y+=dt*.004;}};
})();


/* ---------- UI ---------- */
function selectMoment(id) { selectedId = id; renderDetail(); }
function findMoment(id) { return visibleList().find((m) => m.id === id); }

function renderChips() {
  $('areaChips').innerHTML = ['All', ...CITY.areas].map((a) => `<button type="button" class="chip" aria-pressed="${a === areaFilter}" data-a="${esc(a)}">${esc(a)}</button>`).join('');
}
$('areaChips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; areaFilter = b.dataset.a; renderChips(); renderLists(); });

function itemHTML(m, n) {
  const live = n >= m.at && n < m.at + LIVE_SPAN_MS, past = n >= m.at + LIVE_SPAN_MS, today = m.at < dayStart(n) + 86400e3;
  return `<button type="button" class="item${past ? ' past' : ''}" data-id="${esc(m.id)}"><span class="tm">${hhmm(m.at)}<small>${today ? esc(m.area) : esc(dLabel(m.at))}</small></span>
  <span class="w"><strong>${esc(m.business)} · ${esc(m.title)}</strong><small>${esc(m.cat)}${m.offer ? ' · ' + esc(m.offer) : ''}${today ? '' : ' · ' + esc(m.area)}${m.sample ? ' · sample' : ''}</small></span>
  <span class="lf" data-at="${m.at}">${live ? '● Live' : past ? 'Done' : shortLeft(m.at - n)}</span></button>`;
}
function renderLists() {
  const n = nowMs(), ds = dayStart(n), list = visibleList(), f = (m) => areaFilter === 'All' || m.area === areaFilter;
  $('sampleBanner').hidden = !usingSamples;
  const today = list.filter((m) => m.at >= ds && m.at < ds + 86400e3 && f(m)), later = list.filter((m) => m.at >= ds + 86400e3 && f(m));
  $('listTitle').textContent = `Today in ${CITY.short} · ${dLabel(n)}`;
  $('todayList').innerHTML = today.length ? today.map((m) => itemHTML(m, n)).join('') : `<p class="empty">Nothing on the clock${areaFilter === 'All' ? '' : ' in ' + esc(areaFilter)} today yet.</p>`;
  $('laterList').innerHTML = later.length ? later.slice(0, 8).map((m) => itemHTML(m, n)).join('') : '<p class="empty">Nothing announced yet.</p>';
  C.syncMarkers(list);
  if (selectedId) { const m = findMoment(selectedId); renderDetail(!(m && (m.code || '') !== $('detail').dataset.code)); }
}
document.addEventListener('click', (e) => {
  const it = e.target.closest('#todayList .item,#laterList .item');
  if (it) { selectMoment(it.dataset.id); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }
});

/* reactions */
const myRx = {};
function rxCounts(m) {
  const t = {};
  REACTIONS.forEach((e) => (t[e] = (m.reactions?.[e] || 0) + (m.sample ? myRx[m.id]?.[e] || 0 : 0)));
  return t;
}
async function react(e) {
  const m = selectedId && findMoment(selectedId);
  if (!m) return;
  C.emoji(e, C.markerPos(m.id));
  if (m.sample) { (myRx[m.id] ||= {})[e] = (myRx[m.id][e] || 0) + 1; renderDetail(true); return; }
  m.reactions = { ...m.reactions, [e]: (m.reactions?.[e] || 0) + 1 };
  renderDetail(true);
  try { const r = await api('react', { method: 'POST', body: { id: m.id, emoji: e } }); m.reactions = r.reactions; renderDetail(true); } catch { /* the count catches up on the next refresh */ }
}

function renderDetail(onlyCounts) {
  const box = $('detail'), m = selectedId && findMoment(selectedId);
  if (!m) { box.hidden = true; selectedId = null; $('clkNext').style.visibility = ''; return; }
  const t = rxCounts(m);
  if (onlyCounts && !box.hidden && box.dataset.id === m.id) {
    REACTIONS.forEach((e) => { const s = box.querySelector(`[data-e="${e}"] span`); if (s) s.textContent = t[e]; });
    return;
  }
  const n = nowMs(), live = n >= m.at && n < m.at + LIVE_SPAN_MS, past = n >= m.at + LIVE_SPAN_MS;
  box.dataset.id = m.id; box.dataset.liveState = n >= m.at ? '1' : '0'; box.dataset.code = m.code || '';
  const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.business + ' ' + m.area + ' ' + CITY.name);
  const code = m.code;
  box.innerHTML = `<button class="x" type="button" aria-label="Close" id="detX">×</button>
    <div class="meta"><span class="tag" style="color:${CAT_COL[m.cat] || '#ffab3d'}">${esc(m.cat)}</span><span class="tag">${esc(m.area)}</span><span class="tag">${esc(dLabel(m.at))} · ${esc(tLabel(m.at))}</span>${live ? '<span class="tag live">● Live now</span>' : ''}${m.sample ? '<span class="tag sample">Sample</span>' : ''}</div>
    <h3>${esc(m.business)}: ${esc(m.title)}</h3>
    ${live || past ? '' : `<div class="note" style="color:var(--foam)">Opens ${esc(shortLeft(m.at - n))}.${m.hasCode || m.code ? ' The offer code appears here the moment it goes live.' : ''}</div>`}
    ${m.offer ? `<div class="offer"><span>${esc(m.offer)}</span>${code && (live || past) ? `<b id="ofCode">${esc(code)}</b><button class="btn small" type="button" id="ofCopy">Copy code</button>` : ''}</div>` : ''}
    <div class="reacts">${REACTIONS.map((e) => `<button class="react" type="button" data-e="${e}" aria-label="React ${e}">${e}<span>${t[e]}</span></button>`).join('')}</div>
    <div class="row"><a class="btn small" href="${maps}" target="_blank" rel="noopener">Directions</a><button class="btn small" type="button" id="shareMoment">Share</button></div>`;
  box.hidden = false;
  $('clkNext').style.visibility = 'hidden';
  $('detX').onclick = () => { selectedId = null; box.hidden = true; $('clkNext').style.visibility = ''; };
  box.querySelectorAll('.react').forEach((b) => (b.onclick = () => react(b.dataset.e)));
  const oc = $('ofCopy'); if (oc) oc.onclick = () => copyText(code, oc, $('ofCode'));
  $('shareMoment').onclick = () => {
    const text = `${m.business}: ${m.title} · ${dLabel(m.at)}, ${tLabel(m.at)} · ${m.area}, ${CITY.short}\n${location.origin}/${CITY.slug}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else copyText(text, $('shareMoment'));
  };
}

/* the once-a-second heartbeat for the HUD, the dial face and list countdowns */
function tick() {
  const n = nowMs();
  $('clkNow').textContent = `${CITY.short} · ${hhmmss(n)} IST`;
  const H = ist(n).getUTCHours(), sp = sponsorForHour(H);
  $('clkSponsor').textContent = sp ? `This hour: ${sp.n}${sp.sample ? ' (sample sponsor)' : ''}` : 'This hour is open to sponsor';
  const list = visibleList(), ds = dayStart(n), today = list.filter((m) => m.at >= ds && m.at < ds + 86400e3);
  const live = today.filter((m) => n >= m.at && n < m.at + LIVE_SPAN_MS).sort((a, b) => b.at - a.at);
  const next = today.filter((m) => m.at > n).sort((a, b) => a.at - b.at)[0];
  for (const m of live) if (!seenLive.has(m.id)) {
    seenLive.add(m.id); C.reveal(m); selectMoment(m.id);
    if (!m.sample && m.hasCode && !m.code) refresh(); // fetch the code that just unlocked
  }
  for (const m of today) if (m.at > n) seenLive.delete(m.id);
  const sponsorLine = sp ? 'This hour by ' + sp.n : 'Karshan ' + CITY.short;
  let info, hud;
  if (live.length) {
    const m = live[0];
    info = { badge: '● NOW OPEN · ' + m.area.toUpperCase(), badgeCol: CAT_COL[m.cat], title: m.business, sub: m.title + (m.offer ? ' · ' + m.offer : ''), meta: m.code ? 'CODE ' + m.code : '', sponsor: sponsorLine, small: m.business.length > 16 };
    hud = `<div class="next"><span class="pill">● Live now in ${esc(m.area)}</span><div class="t">${esc(m.business)}: ${esc(m.title)}</div><div class="s">Tap its lantern for the offer and directions</div></div>`;
  } else if (next) {
    const left = next.at - n;
    info = { badge: 'NEXT · ' + hhmm(next.at) + ' · ' + next.area.toUpperCase(), title: next.business, sub: next.title, meta: left < 3600e3 ? fmtLeft(left).replace(/^00:/, '') : shortLeft(left), sponsor: sponsorLine, small: next.business.length > 16 };
    hud = `<div class="next"><span class="pill">Next lantern ${esc(shortLeft(left))}</span><div class="t">${esc(next.business)}: ${esc(next.title)}</div><div class="s">${esc(next.area)} · ${esc(tLabel(next.at))}. Tap a lantern on the ring.</div></div>`;
  } else {
    info = { badge: CITY.short.toUpperCase(), title: 'Quiet hour', sub: 'No more lanterns today', meta: '', sponsor: sponsorLine };
    hud = `<div class="next"><div class="t">That's everything on the clock today</div><div class="s"><a class="btn small primary" href="/create">Light the next lantern</a></div></div>`;
  }
  C.paintFace(info);
  if ($('clkNext').dataset.k !== hud) { $('clkNext').innerHTML = hud; $('clkNext').dataset.k = hud; }
  document.querySelectorAll('#todayList .lf,#laterList .lf').forEach((el) => {
    const at = +el.dataset.at;
    el.textContent = n >= at && n < at + LIVE_SPAN_MS ? '● Live' : n >= at + LIVE_SPAN_MS ? 'Done' : shortLeft(at - n);
  });
  if (selectedId && !$('detail').hidden) {
    const m = findMoment(selectedId);
    if (m && (n >= m.at) !== ($('detail').dataset.liveState === '1')) renderDetail();
  }
}

/* data refresh: announcements, sponsors, reaction counts and the wish counter */
let lastSponsorKey = '';
async function refresh() {
  try {
    const prev = feed;
    feed = await api('city/' + CITY.slug);
    $('wishCount').textContent = feed.wishesToday;
    if (firstFeed) { feed.announcements.forEach((m) => { if (nowMs() >= m.at) seenLive.add(m.id); }); firstFeed = false; }
    // reactions from other people float up from their lantern
    if (prev) for (const m of feed.announcements) {
      const old = prev.announcements.find((x) => x.id === m.id);
      if (!old) continue;
      for (const e of REACTIONS) { const d = Math.min(6, (m.reactions[e] || 0) - (old.reactions[e] || 0)); for (let i = 0; i < d; i++) setTimeout(() => C.emoji(e, C.markerPos(m.id)), i * 140); }
    }
  } catch (e) {
    if (e.code === 'no_database') $('sampleText').textContent = 'Showing sample lanterns. The database is not connected yet.';
    feed = feed || { announcements: [], sponsors: [], wishesToday: 0 };
  }
  const key = JSON.stringify(feed.sponsors || []) + usingSamples;
  visibleList();
  if (key !== lastSponsorKey) { lastSponsorKey = key; C.paintTiles(); }
  renderLists();
}

/* people watching right now */
async function heartbeat() {
  try {
    const r = await api('presence', { method: 'POST', body: { room: 'c:' + CITY.slug, clientId: clientId(), hearts: 0 } });
    $('clkWatch').hidden = r.count < 2;
    $('clkWatch').textContent = `👀 ${r.count} watching`;
  } catch { /* optional */ }
}

/* ---------- start ---------- */
if (!CITY.enabled) {
  $('vClock').hidden = true;
  $('vSoon').hidden = false;
  $('soonTitle').textContent = `Karshan is coming to ${CITY.name}`;
} else {
  rememberCity(CITY.slug);
  document.title = `Today in ${CITY.short} · Karshan`;
  renderChips();
  visibleList();
  document.fonts.load('800 40px Fraunces').catch(() => {}).finally(() => { C.paintTiles(); C.refreshFace(); });
  startRenderer({ scene: C.scene, cam: C.cam, update: (dt, t) => C.update(dt, t) });
  refresh();
  setInterval(refresh, 15000);
  heartbeat();
  setInterval(heartbeat, 10000);
  tick();
  setInterval(tick, 250);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}
