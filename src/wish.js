import './styles/app.css';
import { THREE, reduce, clamp, THEMES, glowSprite, starField, makeLightText, makePetals, makeLantern, startRenderer } from './lib/kit.js';
import { now as nowMs, tLabel, dLabel, fmtLeft } from './lib/time.js';
import { api, esc, clientId, copyText, toast } from './lib/api.js';
import { renderHeader } from './lib/header.js';

renderHeader('wish');
const $ = (id) => document.getElementById(id);
const cv = document.getElementById('gl');
let onTap = () => {};

/* ---------- the sky: ring of 60 seconds, the orb, a lantern per person waiting ---------- */
const W=(()=>{
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,500);scene.fog=new THREE.FogExp2(0x000000,.011);
  const stars=starField(1000,140,220,1.5);scene.add(stars);
  const ring=new THREE.Group();scene.add(ring);const tiles=[];
  for(let i=0;i<60;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.46,1.8,.35),new THREE.MeshBasicMaterial({color:0x333333,transparent:true}));const th=i/60*Math.PI*2;m.position.set(Math.sin(th)*11.5,Math.cos(th)*11.5,0);m.rotation.z=-th;ring.add(m);tiles.push(m);}
  const tunnel=[];for(let i=0;i<7;i++){const t=new THREE.Mesh(new THREE.TorusGeometry(11.5,.05,6,120),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.3,depthWrite:false}));t.position.z=-i*14;scene.add(t);tunnel.push(t);}
  const orbMat=new THREE.ShaderMaterial({uniforms:{c:{value:new THREE.Color()},t:{value:0}},
    vertexShader:'varying vec3 vN;varying vec3 vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 c;uniform float t;varying vec3 vN;varying vec3 vV;void main(){float d=max(dot(vN,vV),0.);float f=pow(1.-d,2.);float core=pow(d,4.);vec3 col=c*(f*1.7+.2)+vec3(1.)*core*(.35+.15*sin(t*3.));gl_FragColor=vec4(col,.5+f*.5);}',
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const orb=new THREE.Mesh(new THREE.SphereGeometry(2.1,48,32),orbMat);scene.add(orb);const halo=glowSprite(0xffffff,16,.5);scene.add(halo);
  const text=makeLightText(4200,30,.34);scene.add(text.pts);
  const petals=makePetals(420,THEMES.marigold.petals);scene.add(petals.mesh);
  const lanterns=new Map();let lanternColor=new THREE.Color(0xffa62b);
  const hashf=(s,k)=>{let h=2166136261^k;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return((h>>>0)%10000)/10000;};
  function addLantern(key,me){const g=makeLantern(lanternColor.clone(),me?5:3.6);
    let base;if(me)base=new THREE.Vector3(0,-8.5,9);else{const a=hashf(key,1)*Math.PI*2,r=15.5+hashf(key,2)*6,y=(hashf(key,3)-.5)*14;base=new THREE.Vector3(Math.sin(a)*r,Math.cos(a)*r*.62+y*.4,(hashf(key,4)-.5)*10);}
    if(me){const c=document.createElement('canvas');c.width=128;c.height=56;const x=c.getContext('2d');x.fillStyle='rgba(10,8,22,.75)';x.fillRect(4,6,120,44);x.fillStyle='#fff';x.font='700 30px Barlow, sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('you',64,30);
      const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));s.scale.set(2.2,1,1);s.position.y=1.7;g.add(s);}
    g.position.copy(base);scene.add(g);const o={g,base,me,ph:hashf(key,5)*6.28,hearts:0,rise:0};lanterns.set(key,o);return o;}
  function clearLanterns(){for(const o of lanterns.values())scene.remove(o.g);lanterns.clear();}
  function syncLanterns(keys){for(const[k,o]of lanterns)if(!o.me&&!keys.has(k)){scene.remove(o.g);lanterns.delete(k);}for(const k of keys)if(!lanterns.has(k))addLantern(k,false);}
  const sparks=[];for(let i=0;i<80;i++){const s=glowSprite(0xffffff,1.3,0);scene.add(s);sparks.push({s,on:false});}
  let energy=0,pulse=0,revealT=null,theme=THEMES.marigold,at=0,yaw=0,pitch=.06,tYaw=0,tPitch=.06,push=0,dragging=false,moved=0,lx=0,ly=0;
  function spark(o){const sp=sparks.find(x=>!x.on);if(!sp||!o)return;sp.on=true;sp.t0=performance.now();sp.dur=900+Math.random()*500;sp.a=o.g.position.clone();
    sp.c=sp.a.clone().multiplyScalar(.5).add(new THREE.Vector3((Math.random()-.5)*10,6+Math.random()*6,(Math.random()-.5)*6));sp.s.material.color.copy(lanternColor);}
  cv.addEventListener('pointerdown',e=>{dragging=true;moved=0;lx=e.clientX;ly=e.clientY;});
  addEventListener('pointermove',e=>{if(!dragging)return;const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;moved+=Math.abs(dx)+Math.abs(dy);tYaw-=dx*.005;tPitch=clamp(tPitch+dy*.004,-.6,.8);});
  addEventListener('pointerup',()=>{if(dragging&&moved<6)onTap();dragging=false;});
  const v=new THREE.Vector3();
  return{scene,cam,spark,lanterns,syncLanterns,
    setup(m){theme=THEMES[m&&m.theme]||THEMES.marigold;at=m?m.at:0;scene.background=new THREE.Color(theme.bg);scene.fog.color.set(theme.bg);orbMat.uniforms.c.value.set(theme.ring);halo.material.color.set(theme.ring);
      text.mat.color.set(theme.ring);tunnel.forEach(t=>t.material.color.set(theme.ring));lanternColor=new THREE.Color(theme.petals[1]);petals.colors(theme.petals);
      clearLanterns();addLantern('me',true);energy=0;pulse=0;revealT=null;text.pts.visible=false;text.mode='toggle';text.f=0;text.goal=0;petals.clear();ring.scale.setScalar(1);tiles.forEach(t=>t.material.opacity=1);orb.visible=true;tYaw=0;},
    reveal(m,instant){revealT=instant?performance.now()-12000:performance.now();text.set(m.message);text.burstNow();text.t0=revealT;if(!reduce&&!instant)petals.burst();else petals.gentle();},
    hasRevealed(){return revealT!==null;},
    update(dt,t){const VW=innerWidth,VH=innerHeight,sec=t/1000,now=nowMs(),left=at?at-now:1e12,rT=revealT?(t-revealT)/1000:-1;
      const lit=left>0&&left<=60000?60-Math.ceil(left/1000):-1,sweep=Math.floor(now/1000)%60;
      tiles.forEach((tl,i)=>{const on=lit>=0?i<lit:(rT<0&&i===sweep);tl.material.color.set(on||rT>=0?theme.ring:theme.glow);tl.position.z+=((lit>=0&&on?.8:0)-tl.position.z)*Math.min(1,dt*8);});
      if(rT>=0){const k=1-Math.pow(1-Math.min(1,rT/2.2),3);ring.scale.setScalar(1+k*1.9);tiles.forEach(tl=>tl.material.opacity=1-k*.75);}
      if(!reduce)ring.rotation.z-=dt*(lit>=0?.25:.05);
      const tsp=reduce?0:(lit>=0?22:rT>=0?4:7);tunnel.forEach(r=>{r.position.z+=tsp*dt;if(r.position.z>14)r.position.z-=98;r.material.opacity=Math.max(0,.35*(1-Math.abs(r.position.z+30)/60))*(rT>=0?.4:1);});
      pulse=Math.max(0,pulse-dt*2.5);const charge=1+.16*Math.log2(1+energy)+pulse*.25+(left>0&&left<=10000?(10000-left)/10000*.9:0);orbMat.uniforms.t.value=sec;
      if(rT>=0){const k=Math.min(1,rT/.5);orb.scale.setScalar(charge*(1+k*4));orb.visible=k<1;halo.material.opacity=Math.max(.12,1.4*(1-rT/1.5));halo.scale.setScalar(Math.min(60,16+rT*30));}
      else{orb.scale.setScalar(charge*(1+Math.sin(sec*2)*.03));halo.material.opacity=.35+pulse*.4;halo.scale.setScalar(13*charge);}
      for(const o of lanterns.values()){if(rT>=0)o.rise+=dt*(o.me?.6:1.4+((o.ph*7)%1));let y=o.base.y+Math.sin(sec*1.1+o.ph)*.35+o.rise;if(!o.me&&y>30)o.rise-=56;if(o.me&&o.rise>6)o.rise=6;
        o.g.position.set(o.base.x+Math.sin(sec*.6+o.ph)*.3,y,o.base.z);o.g.rotation.y=sec*.4+o.ph;}
      for(const sp of sparks){if(!sp.on)continue;const k=(t-sp.t0)/sp.dur;if(k>=1){sp.on=false;sp.s.material.opacity=0;energy++;pulse=1;continue;}
        const e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2,a=sp.a,c=sp.c;v.set((1-e)*(1-e)*a.x+2*(1-e)*e*c.x,(1-e)*(1-e)*a.y+2*(1-e)*e*c.y,(1-e)*(1-e)*a.z+2*(1-e)*e*c.z);sp.s.position.copy(v);sp.s.material.opacity=Math.min(1,k*4);sp.s.scale.setScalar(1.6-k*.8);}
      if(text.pts.visible)text.update(t,dt);petals.update(dt);
      const idle=reduce||dragging?0:Math.sin(sec*.18)*.22;yaw+=(tYaw+idle-yaw)*Math.min(1,dt*3);pitch+=(tPitch-pitch)*Math.min(1,dt*3);if(!dragging)tYaw*=Math.pow(.6,dt);
      const wantPush=left>0&&left<=10000?(10000-left)/10000*12:rT>=0&&rT<3?12*(1-rT/3):0;push+=(wantPush-push)*Math.min(1,dt*2);
      const asp=VW/VH,base=asp<.8?60:asp<1.2?48:40,d=base-push;cam.position.set(Math.sin(yaw)*Math.cos(pitch)*d,Math.sin(pitch)*d,Math.cos(yaw)*Math.cos(pitch)*d);cam.lookAt(0,0,0);
      if(!reduce)stars.rotation.y+=dt*.006;}};
})();

/* ---------- the wish ---------- */
const id = (location.pathname.match(/^\/w\/([a-z0-9-]+)/) || [])[1] || '';
const demo = id === 'demo';
let wish = null, phase = '', key = '', peers = 1, hearts = 0, myHearts = 0, peak = null, fetchingOpen = false;

function crowdHTML() {
  return `<div class="row" style="justify-content:center"><span class="pill" style="background:rgba(10,8,22,.65);border:1px solid var(--line);border-radius:999px;padding:5px 12px">🏮 ${peers} ${peers === 1 ? 'lantern' : 'lanterns'} lit${demo ? ' (demo)' : ''}</span><button class="heart" type="button" id="heartBtn">♥ ${hearts}</button></div>`;
}

async function fetchOpen() {
  // The message only comes from the server once its minute has arrived.
  if (fetchingOpen || demo) return;
  fetchingOpen = true;
  try {
    const r = await api('wishes/' + id);
    if (r.open) { wish = { ...wish, ...r }; key = ''; }
  } catch { /* retried on the next tick */ }
  setTimeout(() => (fetchingOpen = false), 1000);
}

function render() {
  const m = wish; if (!m) return;
  const n = nowMs(), left = m.at - n, th = THEMES[m.theme] || THEMES.marigold;
  const ph = left > 0 ? (left <= 10000 ? 'final' : 'wait') : n < m.at + 60000 ? 'live' : 'after';
  if (ph === 'live' || ph === 'after') {
    if (!m.message) { fetchOpen(); if (ph !== phase) { phase = ph; key = ''; } }
    else if (!W.hasRevealed()) { peak = peers; W.reveal(m, ph === 'after'); key = ''; $('reportWish').hidden = demo; }
  }
  if (ph !== phase) { phase = ph; key = ''; }
  const k = ph + '|' + (ph === 'wait' || ph === 'final' ? Math.ceil(left / 1000) : '') + '|' + peers + '|' + hearts + '|' + Boolean(m.message);
  if (k === key) return; key = k;
  if (ph === 'wait' || ph === 'final') {
    $('ovTop').innerHTML = `<div class="for">For ${esc(m.to)}</div><div class="from">from ${esc(m.from)} · <span style="color:${th.ring}">${esc(tLabel(m.at))} IST, ${esc(dLabel(m.at))}</span></div>`;
    $('ovBottom').innerHTML = `<div class="digits ${ph === 'final' ? 'final' : ''}">${ph === 'final' ? Math.ceil(left / 1000) : fmtLeft(left)}</div><div class="lock">🔒 Opens at the minute. Tap the sky to send a spark.</div>${crowdHTML()}`;
  } else if (!m.message) {
    $('ovBottom').innerHTML = '<div class="lock">Opening…</div>';
  } else {
    $('ovTop').innerHTML = `<div class="from" style="color:${th.ring};letter-spacing:.12em;text-transform:uppercase;font-size:.8rem">${ph === 'live' ? 'Right now' : 'Opened'} · ${esc(tLabel(m.at))} IST · ${esc(dLabel(m.at))}</div><div class="from">for ${esc(m.to)}, from ${esc(m.from)}</div>`;
    $('ovBottom').innerHTML = `<p class="caption">${esc(m.message)}</p>${ph === 'live' ? crowdHTML() : `<div class="lock">${peak ? peak + (peak === 1 ? ' lantern was' : ' lanterns were') + ' lit when it opened' : 'This wish has opened'}</div>`}`;
  }
  const hb = $('heartBtn'); if (hb) hb.onclick = heart;
}

function heart() {
  if (!wish) return;
  myHearts++;
  W.spark(W.lanterns.get('me'));
  if (demo) hearts++;
  key = '';
  if (!demo) beat();
}
onTap = heart;

async function beat() {
  try {
    const r = await api('presence', { method: 'POST', body: { room: 'w:' + id, clientId: clientId(), hearts: myHearts } });
    peers = Math.max(1, r.count);
    hearts = r.hearts;
    const keys = new Set(r.peers.filter((p) => !p.me).map((p) => p.id));
    W.syncLanterns(keys);
    for (const p of r.peers) {
      if (p.me) continue;
      const o = W.lanterns.get(p.id); if (!o) continue;
      if (p.hearts > o.hearts) for (let i = 0; i < Math.min(5, p.hearts - o.hearts); i++) setTimeout(() => W.spark(o), i * 120);
      o.hearts = p.hearts;
    }
    key = '';
  } catch { /* optional */ }
}

function share() {
  const link = location.origin + '/w/' + id;
  const text = `${wish.to}, I've left something for you ✨\nOpen this at ${tLabel(wish.at)} on ${dLabel(wish.at)}. Not a minute before 😉\n${link}`;
  $('wishLink').textContent = link;
  $('shareText').textContent = text;
  $('waShare').href = 'https://wa.me/?text=' + encodeURIComponent(text);
  $('smsShare').href = 'sms:?&body=' + encodeURIComponent(text);
  $('copyShare').onclick = () => copyText(text, $('copyShare'), $('shareText'));
}

async function start() {
  startRenderer({ scene: W.scene, cam: W.cam, update: (dt, t) => W.update(dt, t) });
  W.setup(null);
  $('ovTop').innerHTML = '<div class="from">Finding this wish…</div>';
  if (demo) {
    wish = { id: 'demo', to: 'Amma', from: 'Venky', message: 'Happy birthday, Amma. You are my whole world.', theme: 'marigold', at: nowMs() + 20000 };
    W.setup(wish);
    const keys = new Set(); for (let i = 0; i < 14; i++) keys.add('d' + i);
    W.syncLanterns(keys); peers = 15;
    setInterval(() => { if (phase === 'after') return; const ks = [...W.lanterns.keys()].filter((k) => k !== 'me'); W.spark(W.lanterns.get(ks[Math.floor(Math.random() * ks.length)])); hearts++; key = ''; }, 450);
    document.querySelector('.panels').hidden = true;
  } else {
    try {
      wish = await api('wishes/' + id);
    } catch (e) {
      $('ovTop').innerHTML = `<div class="for">We couldn't find this wish</div><div class="from">${esc(e.message)}</div>`;
      $('ovBottom').innerHTML = '<a class="btn primary" href="/create#wish">Write a wish</a>';
      document.querySelector('.panels').hidden = true;
      return;
    }
    W.setup(wish);
    let created = false; try { created = sessionStorage.getItem('created-' + id) === '1'; } catch { /* storage blocked */ }
    $('wishCreated').hidden = !created;
    share();
    beat(); setInterval(beat, 5000);
  }
  setInterval(render, 200);
  render();
}

$('reportWish').addEventListener('click', async () => {
  try { await api(`wishes/${id}/report`, { method: 'POST', body: { reason: 'Reported by a viewer' } }); toast('Thanks. We will review this wish.'); $('reportWish').hidden = true; }
  catch (e) { toast(e.message); }
});

document.fonts.load('800 40px Fraunces').catch(() => {}).finally(start);
