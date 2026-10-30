// Shared three.js building blocks for every Karshan scene.
import * as THREE from 'three';
export { THREE };
export const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const THEMES = {
  marigold: { name: 'Marigold', bg: '#1c1206', glow: '#4a2a0c', ring: '#ffa62b', petals: ['#ff9f1c', '#ffbf3c', '#f26a1b', '#ffd166'] },
  peacock: { name: 'Peacock', bg: '#061a1f', glow: '#0f3d3f', ring: '#2fc4b2', petals: ['#1fb5a8', '#2f6fd6', '#7bd389', '#e7c85a'] },
  rose: { name: 'Rose', bg: '#1f0a12', glow: '#4a1a2c', ring: '#ef8fb3', petals: ['#ef8fb3', '#ff5c8a', '#ffd1dc', '#f7a072'] },
  night: { name: 'Starlight', bg: '#0b0f22', glow: '#1d2550', ring: '#c9d1ff', petals: ['#ffffff', '#c9d1ff', '#ffd98a', '#8fa3ff'] },
};
export const CAT_COL = { Opening: '#ffab3d', Offer: '#35c2b0', Event: '#ef8fb3', Launch: '#8fa3ff' };

// One full-screen renderer on the fixed #gl canvas. The page passes in a scene,
// a camera and an update function; this runs the loop and keeps it sized.
export function startRenderer({ scene, cam, update }) {
  const cv = document.getElementById('gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  } catch {
    document.body.classList.add('no-webgl');
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const size = { w: innerWidth, h: innerHeight };
  const resize = () => {
    size.w = innerWidth; size.h = innerHeight;
    renderer.setSize(size.w, size.h, false);
    cam.aspect = size.w / size.h;
    cam.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  let last = performance.now();
  const loop = (t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!document.hidden) {
      update(dt, t, size);
      renderer.render(scene, cam);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return { renderer, size, canvas: cv };
}

export function softTex(inner){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(inner,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
export const dotTex=softTex(.35),glowTex=softTex(.18);
export function glowSprite(color,scale,opacity){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity}));s.scale.set(scale,scale,1);return s;}
export function skyDome(top,bot,horizonPow){const m=new THREE.ShaderMaterial({uniforms:{top:{value:new THREE.Color(top)},bot:{value:new THREE.Color(bot)}},
  vertexShader:'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`uniform vec3 top;uniform vec3 bot;varying vec3 vP;void main(){float h=clamp(vP.y*1.6+.08,0.,1.);gl_FragColor=vec4(mix(bot,top,pow(h,${horizonPow.toFixed(2)})),1.);}`,
  side:THREE.BackSide,depthWrite:false,fog:false});return new THREE.Mesh(new THREE.SphereGeometry(400,32,16),m);}
export function starField(n,r0,r1,size){const pos=new Float32Array(n*3);for(let i=0;i<n;i++){const u=Math.random()*.95+.05,a=Math.random()*6.283,q=Math.sqrt(1-u*u),r=r0+Math.random()*(r1-r0);pos[i*3]=Math.cos(a)*q*r;pos[i*3+1]=u*r;pos[i*3+2]=Math.sin(a)*q*r;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));return new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size,sizeAttenuation:false,transparent:true,opacity:.8,fog:false,depthWrite:false}));}
export function makeSea(size,seg,deep,shallow,glint,moonX=0){
  const g=new THREE.PlaneGeometry(size,size,seg,seg);g.rotateX(-Math.PI/2);
  const m=new THREE.ShaderMaterial({uniforms:{t:{value:0},deep:{value:new THREE.Color(deep)},shallow:{value:new THREE.Color(shallow)},glint:{value:new THREE.Color(glint)},fogC:{value:new THREE.Color(0)},fogD:{value:0.006},moonX:{value:moonX}},
    vertexShader:`uniform float t;varying float vH;varying vec3 vW;void main(){vec3 p=position;float h=sin(p.x*.08+t*.9)*.7+sin(p.z*.11+t*1.3)*.5+sin((p.x+p.z)*.21+t*1.9)*.22;p.y+=h;vH=h;vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform vec3 deep;uniform vec3 shallow;uniform vec3 glint;uniform vec3 fogC;uniform float fogD;uniform float t;uniform float moonX;varying float vH;varying vec3 vW;
    void main(){vec3 c=mix(deep,shallow,clamp(vH*.4+.45,0.,1.));
      float lane=exp(-abs(vW.x-moonX*(1.-clamp((vW.z+300.)/300.,0.,1.)))*.09)*smoothstep(-320.,-40.,vW.z);
      float sparkle=pow(max(0.,sin(vW.x*1.7+vH*3.+t*2.1)*sin(vW.z*1.3-t*1.6)*sin((vW.x-vW.z)*.53+t*.7)),9.);
      c+=glint*lane*(.12+sparkle*1.4);
      float d=length(vW.xz-cameraPosition.xz);float f=1.-exp(-d*d*fogD*fogD);gl_FragColor=vec4(mix(c,fogC,f),1.);}`});
  return new THREE.Mesh(g,m);}

/* text written in light */
export function wrapLines(x,words,maxW){const lines=[];let line='';for(const w of words){const t=line?line+' '+w:w;if(x.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}if(line)lines.push(line);return lines;}
export function makeLightText(N,width,size){
  const pos=new Float32Array(N*3),target=new Float32Array(N*3),burst=new Float32Array(N*3),delay=new Float32Array(N);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({size,map:dotTex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,color:0xffffff});
  const pts=new THREE.Points(geo,mat);pts.visible=false;pts.frustumCulled=false;
  const ctl={pts,mat,f:0,goal:0,mode:'toggle',t0:0,
    set(msg){const Wc=1400,Hc=700,c=document.createElement('canvas');c.width=Wc;c.height=Hc;const x=c.getContext('2d');let fs=170,lines;const words=String(msg).split(/\s+/);
      do{x.font=`800 ${fs}px Fraunces, Georgia, serif`;lines=wrapLines(x,words,Wc*.9);fs-=8;}while((lines.length>3||lines.some(l=>x.measureText(l).width>Wc*.92))&&fs>40);
      fs+=8;x.font=`800 ${fs}px Fraunces, Georgia, serif`;x.fillStyle='#fff';x.textAlign='center';x.textBaseline='middle';const lh=fs*1.08,y0=Hc/2-(lines.length-1)*lh/2;lines.forEach((l,i)=>x.fillText(l,Wc/2,y0+i*lh));
      const d=x.getImageData(0,0,Wc,Hc).data,p=[];for(let py=0;py<Hc;py+=4)for(let px=0;px<Wc;px+=4)if(d[(py*Wc+px)*4+3]>130)p.push(px,py);
      const n=p.length/2,sc=width/Wc;
      for(let i=0;i<N;i++){const j=n?Math.floor(Math.random()*n):0,px=n?p[j*2]:Wc/2,py=n?p[j*2+1]:Hc/2;
        target[i*3]=(px-Wc/2)*sc+(Math.random()-.5)*.05;target[i*3+1]=-(py-Hc/2)*sc+(Math.random()-.5)*.05;target[i*3+2]=(Math.random()-.5)*.35;
        const u=Math.random()*2-1,a=Math.random()*6.283,q=Math.sqrt(1-u*u),r=width*(.25+Math.random()*.5);burst[i*3]=Math.cos(a)*q*r;burst[i*3+1]=u*r;burst[i*3+2]=Math.sin(a)*q*r;delay[i]=Math.random()*.7;}},
    burstNow(){this.mode='burst';this.t0=performance.now();pts.visible=true;},
    update(t,dt){
      if(this.mode==='burst'){const rT=(t-this.t0)/1000;
        for(let i=0;i<N;i++){const k=i*3;if(rT<.6){const e=1-Math.pow(1-Math.max(0,rT)/.6,3);pos[k]=burst[k]*e;pos[k+1]=burst[k+1]*e;pos[k+2]=burst[k+2]*e;}
          else{const u=clamp((rT-.6-delay[i])/1.8,0,1),e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2,sh=u>=1&&!reduce?width*.0016:0;
            pos[k]=burst[k]+(target[k]-burst[k])*e+Math.sin(t/500+i)*sh;pos[k+1]=burst[k+1]+(target[k+1]-burst[k+1])*e+Math.cos(t/590+i)*sh;pos[k+2]=burst[k+2]+(target[k+2]-burst[k+2])*e;}}
        mat.opacity=1;}
      else{this.f+=(this.goal-this.f)*Math.min(1,dt*2.2);pts.visible=this.f>.01;if(!pts.visible)return;
        for(let i=0;i<N;i++){const k=i*3,u=clamp((this.f*1.7-delay[i])/1,0,1),e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
          pos[k]=burst[k]+(target[k]-burst[k])*e;pos[k+1]=burst[k+1]+(target[k+1]-burst[k+1])*e+Math.sin(t/700+i)*(1-e)*.3;pos[k+2]=burst[k+2]+(target[k+2]-burst[k+2])*e;}
        mat.opacity=Math.min(1,this.f*1.5);}
      geo.attributes.position.needsUpdate=true;}};
  return ctl;}

/* petals */
export function makePetals(N,colors){
  const g=new THREE.CircleGeometry(.34,10);g.scale(1,.5,1);
  const mesh=new THREE.InstancedMesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),N);
  // allocate per-petal colours up front: setColorAt sizes the buffer from the live count, which starts at 0
  mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(N*3).fill(1),3);mesh.count=0;mesh.frustumCulled=false;
  const P={pos:new Float32Array(N*3),vel:new Float32Array(N*3),rot:new Float32Array(N*3),spin:new Float32Array(N*3)},dm=new THREE.Object3D(),tc=new THREE.Color();
  let ambient=false,spread=50;
  function seed(i,b,o){const k=i*3;if(b){const u=Math.random()*2-1,a=Math.random()*6.283,q=Math.sqrt(1-u*u),sp=10+Math.random()*18;P.pos[k]=o.x;P.pos[k+1]=o.y;P.pos[k+2]=o.z;
      P.vel[k]=Math.cos(a)*q*sp;P.vel[k+1]=u*sp+5;P.vel[k+2]=Math.sin(a)*q*sp;}
    else{P.pos[k]=(Math.random()-.5)*spread;P.pos[k+1]=18+Math.random()*16;P.pos[k+2]=(Math.random()-.5)*20;P.vel[k]=(Math.random()-.5)*1.5;P.vel[k+1]=-1.5-Math.random()*2;P.vel[k+2]=0;}
    for(let j=0;j<3;j++){P.rot[k+j]=Math.random()*6.28;P.spin[k+j]=(Math.random()-.5)*6;}}
  const O=new THREE.Vector3();
  return{mesh,
    colors(cs){for(let i=0;i<N;i++){tc.set(cs[i%cs.length]);mesh.setColorAt(i,tc);}if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;},
    burst(o){o=o||O;mesh.count=N;for(let i=0;i<N;i++)seed(i,true,o);ambient=true;},
    gentle(){mesh.count=Math.floor(N*.5);for(let i=0;i<N;i++){seed(i,false);P.pos[i*3+1]=-18+Math.random()*36;}ambient=true;},
    stop(){ambient=false;},clear(){mesh.count=0;ambient=false;},
    update(dt){if(!mesh.count)return;for(let i=0;i<mesh.count;i++){const k=i*3;P.vel[k+1]-=4*dt;P.vel[k]*=.985;P.vel[k+1]*=.985;P.vel[k+2]*=.985;if(P.vel[k+1]<-3)P.vel[k+1]=-3;
        P.pos[k]+=P.vel[k]*dt;P.pos[k+1]+=P.vel[k+1]*dt;P.pos[k+2]+=P.vel[k+2]*dt;if(P.pos[k+1]<-24){if(ambient)seed(i,false);else P.pos[k+1]=-999;}
        for(let j=0;j<3;j++)P.rot[k+j]+=P.spin[k+j]*dt;dm.position.set(P.pos[k],P.pos[k+1],P.pos[k+2]);dm.rotation.set(P.rot[k],P.rot[k+1],P.rot[k+2]);dm.updateMatrix();mesh.setMatrixAt(i,dm.matrix);}
      mesh.instanceMatrix.needsUpdate=true;}};}

/* paper lantern mesh */
export const lanternGeo=new THREE.CylinderGeometry(.55,.42,1,12,1,true),capGeo=new THREE.CylinderGeometry(.62,.62,.12,12);
export function makeLantern(color,glowScale){const g=new THREE.Group();const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92,side:THREE.DoubleSide});
  g.add(new THREE.Mesh(lanternGeo,mat));const cap=new THREE.Mesh(capGeo,new THREE.MeshBasicMaterial({color:0x2a1a10}));cap.position.y=.55;g.add(cap);
  const glow=glowSprite(color,glowScale,.75);g.add(glow);const fl=glowSprite(0xffffff,.9,1);fl.position.y=-.2;g.add(fl);g.userData={mat,glow};return g;}

