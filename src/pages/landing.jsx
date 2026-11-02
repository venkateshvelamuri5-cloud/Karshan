import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { mount, Header, DigitalTime, Footer } from '../ui/common.jsx';
import { Scene, Sky, Sea, Coast, Moon, RisingLanterns } from '../three/World.jsx';
import { Clock3D, dialAngle } from '../three/Clock3D.jsx';
import { Fireworks } from '../three/Fireworks.jsx';
import { cardTexture, demoPhoto } from '../three/cards.js';
import { THEMES, CAT_COL, reduceMotion } from '../three/palette.js';
import { now, dayStart } from '../lib/time.js';

gsap.registerPlugin(ScrollTrigger);

// Shared between GSAP (which writes) and the 3D scene (which reads every frame).
const rig = { px: 0, py: 10, pz: 34, lx: -8, ly: 13.5, lz: -10, chapter: 0 };
const CLOCK_POS = [0, 14, -10];

function CameraRig() {
  const { camera, pointer } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const k = 0.08;
    const mx = reduceMotion ? 0 : pointer.x * 2.2, my = reduceMotion ? 0 : pointer.y * 1.2;
    camera.position.x += (rig.px + mx - camera.position.x) * k;
    camera.position.y += (rig.py + my - camera.position.y) * k;
    camera.position.z += (rig.pz - camera.position.z) * k;
    look.set(rig.lx, rig.ly, rig.lz);
    camera.lookAt(look);
  });
  return null;
}

// Sample moments on the landing clock, placed at real times later today.
function useDemoMarkers() {
  return useMemo(() => {
    const ds = dayStart(now());
    const at = (h, m) => ds + (h * 60 + m) * 60000;
    return [
      { id: 'a', at: at(18, 0), label: 'Dosa District · 20% off till 8', color: CAT_COL.Offer },
      { id: 'b', at: at(19, 30), label: 'Live music at the Book Café', color: CAT_COL.Event },
      { id: 'c', at: at(0, 0), label: "Sneha's birthday wall opens", color: '#ff8fb8' },
      { id: 'd', at: at(21, 0), label: 'Monsoon Mart flash sale', color: CAT_COL.Sale },
      { id: 'e', at: at(12, 0), label: 'Haldi Health lunch offer', color: CAT_COL['Happy hour'] },
      { id: 'f', at: at(8, 0), label: 'Sunrise surf session', color: CAT_COL.Launch },
    ].map((m) => ({ ...m, angle: dialAngle(m.at), timeLabel: new Date(m.at + 5.5 * 3600e3).toISOString().slice(11, 16) }));
  }, []);
}

function WishCards() {
  const group = useRef();
  const [tex, setTex] = useState([]);
  useEffect(() => {
    const wishes = [
      { from: 'Ravi', message: 'Happy birthday Sneha! Best roommate ever.', photo: demoPhoto(1) },
      { from: 'Anu', message: 'May this year be your brightest yet ✨', photo: null },
      { from: 'Kiran', message: 'Remember RK Beach at 5 AM? Here is to more of those!', photo: demoPhoto(4) },
    ];
    Promise.all(wishes.map((w) => cardTexture({ ...w, accent: '#e2537e' }))).then(setTex);
  }, []);
  useFrame((st) => {
    if (!group.current) return;
    const want = rig.chapter === 1 ? 1.45 : 0;
    group.current.children.forEach((c, i) => {
      const s = THREE.MathUtils.lerp(c.scale.x, want, 0.06);
      c.scale.setScalar(Math.max(0.0001, s));
      c.position.y = c.userData.y + Math.sin(st.clock.elapsedTime * 0.8 + i) * 0.25;
      c.rotation.z = c.userData.rz + Math.sin(st.clock.elapsedTime * 0.5 + i * 2) * 0.03;
    });
  });
  const spots = [[-15, 7.5, 6, 0.12], [-9.5, 9, 8, -0.05], [-4, 7.2, 6, -0.1]];
  return (
    <group ref={group}>
      {tex.map((t, i) => (
        <mesh key={i} position={[spots[i][0], spots[i][1], spots[i][2]]} rotation-z={spots[i][3]} userData={{ y: spots[i][1], rz: spots[i][3] }} scale={0.0001}>
          <planeGeometry args={[4, 5]} />
          <meshBasicMaterial map={t} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Show({ fw }) {
  // Fireworks over the bay: on their own during the "celebrate" chapter, and whenever you tap the sky.
  const last = useRef(0);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    const busy = rig.chapter === 1 || (rig.chapter === 4 && t % 6 < 3);
    if (!fw.current || reduceMotion) return;
    if (busy && t - last.current > 0.9) {
      last.current = t;
      const th = Object.values(THEMES)[Math.floor(Math.random() * 4)];
      fw.current.launch({
        from: new THREE.Vector3(-22 + Math.random() * 30, -1, -6 - Math.random() * 10),
        to: new THREE.Vector3(-24 + Math.random() * 34, 13 + Math.random() * 10, -4 - Math.random() * 10),
        colors: th.burst,
        shape: Math.random() < 0.25 ? 'heart' : Math.random() < 0.4 ? 'ring' : 'sphere',
        count: 480,
        speed: 11,
      });
    }
  });
  return null;
}

function TapToLaunch({ fw }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const el = gl.domElement.parentElement;
    const ray = new THREE.Raycaster(), v = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 2);
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('a,button,input,textarea,select,.card')) return;
      v.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(v, camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return;
      hit.y = Math.max(hit.y, 6);
      const th = Object.values(THEMES)[Math.floor(Math.random() * 4)];
      fw.current?.launch({ from: new THREE.Vector3(hit.x * 0.7, -1, hit.z), to: hit, colors: th.burst, count: 480, speed: 11 });
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [camera, gl, fw]);
  return null;
}

function World() {
  const fw = useRef();
  const markers = useDemoMarkers();
  const [rim, setRim] = useState(null);
  return (
    <>
      <Sky />
      <Moon />
      <Sea />
      <Coast />
      <RisingLanterns />
      <CameraRig />
      <BrandWatcher onChange={setRim} />
      <Clock3D position={CLOCK_POS} markers={markers} rimColors={rim} label="KARSHAN" sub="VIZAG · IST" />
      <WishCards />
      <Fireworks ref={fw} />
      <Show fw={fw} />
      <TapToLaunch fw={fw} />
    </>
  );
}

function BrandWatcher({ onChange }) {
  const was = useRef(false);
  useFrame(() => {
    const on = rig.chapter === 3;
    if (on !== was.current) { was.current = on; onChange(on ? ['#14b8a6', '#f59e0b', '#4f46e5', '#be123c', '#059669', '#1e40af', '#ea580c', '#a21caf', '#14b8a6', '#f59e0b', '#4f46e5', '#be123c'] : null); }
  });
  return null;
}

function useScrollStory() {
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add({ wide: '(min-aspect-ratio: 23/20)', tall: '(max-aspect-ratio: 4/5)', mid: '(min-aspect-ratio: 4/5) and (max-aspect-ratio: 23/20)' }, (ctx) => {
      const { wide, tall } = ctx.conditions;
      // where the camera sits and looks for each chapter: [px,py,pz, lx,ly,lz]
      const shots = wide ? [
        [0, 10, 34, -8, 13.5, -10], // hero: clock beside the headline
        [-4, 9, 34, 0, 9, -4],      // celebrate: wish cards on the left, fireworks above
        [16, 15, 18, 6, 14, -10],   // promote: card right, clock left
        [0, 14, 14, 7, 14, -10],    // brands: rim of sponsor colours
        [0, 32, 48, -8, 12, -20],   // finale
      ] : tall ? [
        [0, 9, 62, 0, 2, -10],
        [-9, 9, 52, -9, 4, -6],
        [0, 15, 38, 0, 7, -10],
        [0, 14, 34, 0, 9, -10],
        [0, 34, 66, 0, 6, -20],
      ] : [
        [0, 9, 52, -4, 12, -10],
        [-6, 9, 44, -6, 7, -4],
        [12, 15, 26, 3, 13, -10],
        [0, 14, 22, 4, 13, -10],
        [0, 32, 54, -4, 10, -20],
      ];
      const set = (s) => { rig.px = s[0]; rig.py = s[1]; rig.pz = s[2]; rig.lx = s[3]; rig.ly = s[4]; rig.lz = s[5]; };
      set(shots[0]);
      const tl = gsap.timeline({
        defaults: { ease: 'power1.inOut' },
        scrollTrigger: {
          trigger: '#story', start: 'top top', end: 'bottom bottom', scrub: 1.2,
          onUpdate: (st) => { rig.chapter = Math.round(st.progress * (shots.length - 1)); },
        },
      });
      shots.slice(1).forEach((s) => tl.to(rig, { px: s[0], py: s[1], pz: s[2], lx: s[3], ly: s[4], lz: s[5], duration: 1 }));
      // text cards rise into place as they arrive
      gsap.utils.toArray('.story .card').forEach((el, i) => {
        if (i === 0) return;
        gsap.fromTo(el, { y: 50, autoAlpha: 0.15 }, { y: 0, autoAlpha: 1, duration: 0.9, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 80%' } });
      });
      return () => tl.kill();
    });
    return () => mm.revert();
  }, []);
}

function App() {
  useScrollStory();
  return (
    <>
      <Scene camera={{ position: [0, 10, 34], fov: 45 }}><World /></Scene>
      <Header active="home" />
      <main id="story" className="view">
        <section className="story hero gut">
          <div className="max"><div className="card">
            <DigitalTime city="Vizag" />
            <h1 className="big">Vizag's live clock for <em>celebrations</em> and <em>offers</em>.</h1>
            <p className="lead">Gather everyone's wishes and photos for someone you love, and set them off as fireworks at midnight. Shops put their offers on the clock at the exact time they start.</p>
            <div className="row">
              <a className="btn primary" href="/create">Make a birthday wall</a>
              <a className="btn ghost" href="/vizag">See what's on today</a>
            </div>
            <p className="hint">Tap the sky to launch a firework.</p>
          </div></div>
        </section>

        <section className="story gut right">
          <div className="max"><div className="card">
            <div className="eyebrow">Celebrate · birthday walls</div>
            <h2 className="ch">Everyone's wishes. <em>One sky. Midnight.</em></h2>
            <ol className="steps">
              <li>Make a wall for Sneha and share the link in your WhatsApp group.</li>
              <li>Anyone with the link adds a wish and a photo before midnight.</li>
              <li>At 12:00:00 fireworks burst, and each photo and wish appears under the lights.</li>
            </ol>
            <div className="row"><a className="btn primary" href="/b/demo">Watch a 20-second demo</a><a className="btn ghost" href="/create">Make one</a></div>
          </div></div>
        </section>

        <section className="story gut">
          <div className="max"><div className="card">
            <div className="eyebrow">Promote · for businesses</div>
            <h2 className="ch">Got something at 6? <em>Put it on the clock.</em></h2>
            <p className="lead">Flash sales, happy hours, new menus, live music, launches. Your moment glows on the clock at its time, and people get the offer code and directions the second it starts.</p>
            <div className="mini">
              <div><b>18:00</b><span>Dosa District · 20% off till 8 PM<small>Offer · Siripuram</small></span></div>
              <div><b>19:30</b><span>Live music at the Book Café<small>Event · RK Beach</small></span></div>
              <div><b>21:00</b><span>Monsoon Mart flash sale<small>Sale · MVP Colony</small></span></div>
            </div>
            <div className="row"><a className="btn primary" href="/create#promote">Promote your business</a></div>
            <p className="note">Examples. Every listing is checked before it goes live.</p>
          </div></div>
        </section>

        <section className="story gut right">
          <div className="max"><div className="card">
            <div className="eyebrow">For brands</div>
            <h2 className="ch">Own <em>the hour</em> the city is watching.</h2>
            <p className="lead">Your colour on the rim of the clock for the hour you sponsor, beside every celebration and offer in it.</p>
            <div className="rates">
              <div><b>₹2,999</b><span>Evening hour</span></div>
              <div><b>₹19,999</b><span>A whole day</span></div>
              <div><b>Custom</b><span>Diwali, Sankranti weeks</span></div>
            </div>
            <div className="row"><a className="btn" href="/create#sponsor">Ask about sponsoring</a></div>
          </div></div>
        </section>

        <section className="story gut">
          <div className="max"><div className="card">
            <h2 className="ch">Make tonight <em>unforgettable.</em></h2>
            <p className="lead">Starting in Visakhapatnam. RK Beach to Rushikonda, Gajuwaka to Madhurawada.</p>
            <div className="row"><a className="btn primary" href="/create">Make a birthday wall</a><a className="btn ghost" href="/vizag">Open today's clock</a></div>
          </div></div>
        </section>
      </main>
      <Footer />
    </>
  );
}

mount(App);
