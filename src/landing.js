import './styles/app.css';
import { THREE, reduce, clamp, THEMES, glowSprite, skyDome, starField, makeSea, makeLightText, makePetals, makeLantern, startRenderer } from './lib/kit.js';
import { ist, now, p2 } from './lib/time.js';
import { renderHeader } from './lib/header.js';

renderHeader('home');

// Brand colours used to tint the dial when the "brands" chapter is on screen.
const SPONSORS = [{ c: '#14b8a6' }, { c: '#f59e0b' }, { c: '#4f46e5' }, { c: '#be123c' }, { c: '#059669' }, { c: '#1e40af' }, { c: '#ea580c' }];

/* The bay at dusk: sea, Kailasagiri hills, Beach Road lights, a floating clock,
   and lanterns rising. Scrolling flies the camera through five chapters. */
const L=(()=>{
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.1,900);
  scene.fog=new THREE.Fog(0x1a1640,60,320);
  scene.add(skyDome('#070b22','#c8614a',.55));
  const stars=starField(900,250,380,1.5);scene.add(stars);
  const moon=glowSprite(0xfff1d6,46,.9);moon.position.set(-60,70,-260);scene.add(moon);
  const moonCore=new THREE.Mesh(new THREE.CircleGeometry(5,40),new THREE.MeshBasicMaterial({color:0xfff6e4,fog:false}));moonCore.position.set(-60,70,-262);scene.add(moonCore);
  const sea=makeSea(700,160,'#06182a','#1d5a6e','#ffe7b8',-60);sea.position.z=-150;sea.material.uniforms.fogC.value.set('#2a2050');scene.add(sea);
  // hills (Kailasagiri, Yarada) and the city lights along the beach road
  const hillMat=new THREE.MeshBasicMaterial({color:0x0b0d22,fog:false});
  // Kailasagiri, Yarada and the Eastern Ghats: soft rounded ridges behind the city.
  [[-210,-250,70,30],[-150,-235,60,40],[-95,-262,90,26],[-30,-250,60,18],[45,-258,80,24],[120,-240,55,36],[175,-250,75,44],[250,-262,90,28]].forEach(([x,z,r,h])=>{const m=new THREE.Mesh(new THREE.SphereGeometry(1,28,14,0,Math.PI*2,0,Math.PI/2),hillMat);m.scale.set(r,h,r*.35);m.position.set(x,-1,z);scene.add(m);});
  {const n=700,pos=new Float32Array(n*3),col=new Float32Array(n*3),c=new THREE.Color();
    for(let i=0;i<n;i++){pos[i*3]=(Math.random()-.5)*480;pos[i*3+1]=Math.random()*Math.random()*16+.5;pos[i*3+2]=-205-Math.random()*25;c.set(Math.random()<.75?'#ffc77a':'#cfe6ff');col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
    scene.add(new THREE.Points(g,new THREE.PointsMaterial({size:1.8,vertexColors:true,sizeAttenuation:false,transparent:true,opacity:.9,fog:false,depthWrite:false})));}
  // the floating clock
  scene.add(new THREE.AmbientLight(0xffffff,.55));const kl=new THREE.PointLight(0xffd29a,1.2,120);kl.position.set(-10,30,20);scene.add(kl);
  const clock=new THREE.Group();clock.position.set(0,14,-10);scene.add(clock);
  const brass=new THREE.MeshStandardMaterial({color:0xd4a94f,metalness:.8,roughness:.35});
  clock.add(new THREE.Mesh(new THREE.TorusGeometry(8.4,.32,20,120),brass));
  const disc=new THREE.Mesh(new THREE.CircleGeometry(8.1,80),new THREE.MeshBasicMaterial({color:0x10163a,transparent:true,opacity:.75}));disc.position.z=-.3;clock.add(disc);
  const tiles=[];
  for(let i=0;i<24;i++){const th=(i+.5)/24*Math.PI*2,m=new THREE.Mesh(new THREE.BoxGeometry(1.5,1.6,.3),new THREE.MeshBasicMaterial({color:0x2a3366}));
    m.position.set(Math.sin(th)*6.6,Math.cos(th)*6.6,0);m.rotation.z=-th;clock.add(m);tiles.push(m);}
  const hand=new THREE.Mesh(new THREE.BoxGeometry(.28,6,.15),brass);hand.geometry.translate(0,3,0);hand.position.z=.4;clock.add(hand);
  const orb=glowSprite(0xffab3d,7,.85);orb.position.z=.6;clock.add(orb);
  const marks=[];const markTimes=[[11,0,'#ffab3d'],[13,30,'#35c2b0'],[18,0,'#ffab3d'],[19,30,'#ef8fb3'],[21,0,'#8fa3ff'],[8,0,'#35c2b0']];
  markTimes.forEach(([h,m,c])=>{const th=(h+m/60)/24*Math.PI*2,lt=makeLantern(c,2.6);lt.scale.setScalar(.7);lt.position.set(Math.sin(th)*10,Math.cos(th)*10,.5);clock.add(lt);marks.push(lt);});
  // lanterns rising over the bay
  const RN=150,rising=[];
  for(let i=0;i<RN;i++){const s=glowSprite(i%5===0?0xffd38a:0xffa53a,1+Math.random()*1.6,.85);s.position.set((Math.random()-.5)*220,Math.random()*70,-30-Math.random()*170);s.userData={v:1+Math.random()*2,ph:Math.random()*6.28};scene.add(s);rising.push(s);}
  // the private wish written in light
  const text=makeLightText(3800,innerWidth/innerHeight>1.15?13:12,.24);text.set('Happy birthday, Amma');text.pts.position.set(0,6.5,4);text.mat.color.set('#ffc46b');scene.add(text.pts);
  const petals=makePetals(260,THEMES.marigold.petals);petals.colors(THEMES.marigold.petals);petals.mesh.position.set(0,6,4);scene.add(petals.mesh);
  const brandCols=SPONSORS.map(s=>new THREE.Color(s.c)),base=new THREE.Color(0x2a3366),tmp=new THREE.Color();
  const K=[
    {p:[0,8,48],l:[0,13,-10],wide:[-17,13,-10],tall:[0,1,-10]},   // hero: clock beside the headline
    {p:[17,15,16],l:[0,14,-10],wide:[7,14,-10],tall:[0,8,-10]},   // businesses: card on the right, clock on the left
    {p:[-3,5,24],l:[0,6.5,3],wide:[-6.5,6.5,3],tall:[0,1,3]},       // private wishes: the words form beside the card
    {p:[0,14,12],l:[0,14,-10],wide:[8,14,-10],tall:[0,9,-10]},    // brands: card right, dial left
    {p:[0,34,46],l:[0,12,-20],wide:[-10,12,-20],tall:[0,8,-20]}]; // finale
  const vp=new THREE.Vector3(),vl=new THREE.Vector3();let prog=0,lastCh=-1,mx=0,my=0;
  addEventListener('pointermove',e=>{mx=e.clientX/innerWidth-.5;my=e.clientY/innerHeight-.5;});
  function chapterProgress(){const els=document.querySelectorAll('#vHome [data-ch]'),vc=innerHeight/2;let cs=[];els.forEach(el=>{const r=el.getBoundingClientRect();cs.push(r.top+r.height/2);});
    if(vc<=cs[0])return 0;for(let i=0;i<cs.length-1;i++)if(vc<cs[i+1])return i+(vc-cs[i])/(cs[i+1]-cs[i]);return cs.length-1;}
  return{scene,cam,retext(){text.set('Happy birthday, Amma');},update(dt,t){
    const sec=t/1000,target=chapterProgress();if(Number.isFinite(target))prog+=(target-prog)*Math.min(1,dt*3);if(!Number.isFinite(prog))prog=0;
    const i=Math.max(0,Math.min(K.length-2,Math.floor(prog))),f=prog-i,e=f*f*(3-2*f),a=K[i],b=K[i+1],port=innerWidth/innerHeight<.8?1.35:1;
    const asp=innerWidth/innerHeight,la=(k)=>k.wide&&asp>1.15?k.wide:k.tall&&asp<.8?k.tall:k.l,A=la(a),B=la(b);
    vp.set(a.p[0]+(b.p[0]-a.p[0])*e,a.p[1]+(b.p[1]-a.p[1])*e,a.p[2]+(b.p[2]-a.p[2])*e);vl.set(A[0]+(B[0]-A[0])*e,A[1]+(B[1]-A[1])*e,A[2]+(B[2]-A[2])*e);
    vp.sub(vl).multiplyScalar(port).add(vl);
    if(!reduce){vp.x+=mx*2.5;vp.y-=my*1.5;}
    cam.position.copy(vp);cam.lookAt(vl);
    sea.material.uniforms.t.value=sec;
    const d=ist(now()),hrs=d.getUTCHours()+d.getUTCMinutes()/60;hand.rotation.z=-hrs/24*Math.PI*2;
    const w2=clamp(1-Math.abs(prog-2)*1.4,0,1);clock.position.y=14+w2*16+(reduce?0:Math.sin(sec*.7)*.4);clock.position.z=-10-w2*20;clock.rotation.y=reduce?0:Math.sin(sec*.25)*.12;
    const w1=clamp(1-Math.abs(prog-1),0,1),w3=clamp(1-Math.abs(prog-3),0,1);
    marks.forEach((m,k)=>{m.scale.setScalar(.6+w1*.6+Math.sin(sec*2+k)*.04);m.userData.glow.material.opacity=.5+w1*.5;});
    const curH=Math.floor(hrs);tiles.forEach((tl,k)=>{tmp.copy(base).lerp(brandCols[k%brandCols.length],w3);if(k===curH)tmp.lerp(new THREE.Color(0xffab3d),.6);tl.material.color.copy(tmp);tl.position.z=k===curH?.5:0;});
    orb.material.opacity=.6+Math.sin(sec*2)*.15;
    rising.forEach(s=>{s.position.y+=s.userData.v*dt*(reduce?.3:1);s.position.x+=Math.sin(sec*.5+s.userData.ph)*dt*.4;if(s.position.y>80){s.position.y=-2;}s.material.opacity=.85*clamp(1-(s.position.y-55)/25,0,1);});
    const ch=Math.round(prog);
    text.goal=Math.abs(prog-2)<.55?1:0;text.update(t,dt);
    if(ch===2&&lastCh!==2&&!reduce)petals.burst(new THREE.Vector3(0,0,0));if(ch!==2&&lastCh===2)petals.stop();lastCh=ch;petals.update(dt);
    stars.rotation.y+=dt*.004;}};
})();


document.fonts.load('800 40px Fraunces').catch(() => {}).finally(() => L.retext());
startRenderer({ scene: L.scene, cam: L.cam, update: (dt, t) => L.update(dt, t) });

const live = document.getElementById('liveNow');
setInterval(() => {
  const d = ist(now());
  live.textContent = 'Vizag · ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' IST';
}, 500);
