import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { mount, Header, Footer, useNow } from '../ui/common.jsx';
import { Scene, Sky, Sea, Coast, Moon } from '../three/World.jsx';
import { Fireworks } from '../three/Fireworks.jsx';
import { WallCards, SignerLanterns } from '../three/WallShow.jsx';
import { THEMES, reduceMotion } from '../three/palette.js';
import { shrinkPhoto, demoPhoto } from '../three/cards.js';
import { now, tLabel, dLabel, fmtLeft } from '../lib/time.js';
import { api, copyText, toast } from '../lib/api.js';

const ID = (location.pathname.match(/^\/[bw]\/([a-z0-9-]+)/) || [])[1] || '';
const DEMO = ID === 'demo';
const SHOW_GAP = 3.4; // seconds each wish holds the spotlight

// The manage key arrives once in the link after creating; keep it on this device and tidy the address bar.
function useManageKey() {
  return useMemo(() => {
    const u = new URL(location.href);
    let key = u.searchParams.get('key') || '';
    try {
      if (key) localStorage.setItem('wall-key-' + ID, key);
      else key = localStorage.getItem('wall-key-' + ID) || '';
    } catch { /* storage blocked */ }
    const created = u.searchParams.get('created') === '1';
    if (u.search) history.replaceState(null, '', '/b/' + ID);
    return { key, created };
  }, []);
}

function demoWall() {
  const at = now() + 16000;
  const wishes = [
    ['Ravi', 'Happy birthday Sneha! Best roommate ever. Biryani is on me 🍗', 1],
    ['Anu', 'May this year be your brightest yet ✨', 0],
    ['Kiran', 'Remember RK Beach at 5 AM? Here is to many more sunrises.', 4],
    ['Amma', 'My dearest, you light up our home every single day.', 2],
    ['Priya', 'Twenty-five looks good on you! Party at Rushikonda?', 5],
    ['Team Pixel', 'From all of us at work: have the best birthday!', 0],
  ].map(([from, message, seed], i) => ({ id: 'd' + i, from, message, photo: seed ? demoPhoto(seed) : null }));
  return { id: 'demo', forName: 'Sneha', occasion: 'Birthday', title: 'Sneha turns 25!', at, theme: 'rose', open: false, count: wishes.length, photoCount: 4, signers: wishes.map((w) => w.from), wishes, demo: true };
}

function Rig({ push }) {
  const { camera, pointer } = useThree();
  const look = useMemo(() => new THREE.Vector3(0, 4.5, 0), []);
  useFrame(() => {
    const narrow = innerWidth / innerHeight < 0.8;
    const z = (narrow ? 40 : 27) - push.current * (narrow ? 8 : 6);
    camera.position.x += ((reduceMotion ? 0 : pointer.x * 2) - camera.position.x) * 0.05;
    camera.position.y += (3.5 + (reduceMotion ? 0 : pointer.y) - camera.position.y) * 0.05;
    camera.position.z += (z - camera.position.z) * 0.05;
    camera.lookAt(look);
  });
  return null;
}

function TapFireworks({ fw, theme }) {
  const { camera } = useThree();
  useEffect(() => {
    const ray = new THREE.Raycaster(), v = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 6);
    const onDown = (e) => {
      if (e.target.closest && e.target.closest('a,button,input,textarea,select,label,.panel,.ov-card')) return;
      v.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(v, camera);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return;
      hit.y = Math.max(hit.y, 3);
      fw.current?.launch({ from: new THREE.Vector3(hit.x * 0.6, -8, hit.z), to: hit, colors: theme.burst, count: 360, speed: 8 });
    };
    addEventListener('pointerdown', onDown);
    return () => removeEventListener('pointerdown', onDown);
  }, [camera, fw, theme]);
  return null;
}

function App() {
  const { key, created } = useManageKey();
  const [wall, setWall] = useState(null);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState('wait'); // wait | final | show | after
  const [current, setCurrent] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const fw = useRef(), cards = useRef(), push = useRef(0), tl = useRef(null), fetching = useRef(false);
  const t = useNow(200);
  const theme = THEMES[wall?.theme] || THEMES.marigold;

  const load = useCallback(async () => {
    if (DEMO) return;
    try { setWall(await api(`walls/${ID}${key ? '?key=' + encodeURIComponent(key) : ''}`)); }
    catch (e) { setError(e.message); }
  }, [key]);

  useEffect(() => {
    if (DEMO) setWall(demoWall()); else load();
  }, [load]);

  // refresh signers every 20 s while waiting
  useEffect(() => {
    if (DEMO || !wall || wall.open) return;
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [wall?.open, load]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (wall) document.title = `${wall.title || wall.forName + "'s wall"} · Karshan`; }, [wall?.title, wall?.forName]); // eslint-disable-line react-hooks/exhaustive-deps

  // phase from the clock
  useEffect(() => {
    if (!wall) return;
    const left = wall.at - t;
    if (left > 10000 && phase !== 'wait' && phase !== 'show' && phase !== 'after') setPhase('wait');
    else if (left > 0 && left <= 10000 && phase === 'wait') setPhase('final');
    else if (left <= 0 && (phase === 'wait' || phase === 'final') && (DEMO || wall.open)) {
      // opened, and the sealed wishes have arrived from the server
      if (t - wall.at < 10 * 60000) startShow(); else setPhase('after');
    }
    push.current = left > 0 && left <= 10000 ? (10000 - left) / 10000 : phase === 'show' ? 0.6 : 0;
  });

  // when it opens, fetch the sealed wishes from the server
  useEffect(() => {
    if (!wall || DEMO || wall.open || t < wall.at || fetching.current) return;
    fetching.current = true;
    load().finally(() => setTimeout(() => (fetching.current = false), 1500));
  });

  const visibleWishes = useMemo(() => (wall?.wishes || []).filter((w) => !w.hidden), [wall?.wishes]);

  function grandBurst(n = 8, delay = 0) {
    for (let i = 0; i < n; i++) {
      fw.current?.launch({
        from: new THREE.Vector3((Math.random() - 0.5) * 30, -10, -4 - Math.random() * 6),
        to: new THREE.Vector3((Math.random() - 0.5) * 34, 8 + Math.random() * 12, -6 - Math.random() * 8),
        colors: theme.burst, count: 420, speed: 10, delay: delay + i * 0.22,
        shape: i % 4 === 1 ? 'heart' : i % 4 === 3 ? 'ring' : 'sphere', size: 1.1,
      });
    }
  }

  function startShow() {
    setPhase('show');
    setShowDone(false);
    tl.current?.kill();
    cards.current?.reset();
    const list = visibleWishes.length ? visibleWishes : [];
    const q = gsap.timeline();
    q.call(() => grandBurst(10), null, 0);
    q.call(() => setCurrent({ title: true }), null, 0.3);
    list.forEach((w, i) => {
      const at = 2.6 + i * SHOW_GAP;
      q.call(() => {
        fw.current?.launch({ from: new THREE.Vector3(-8, -10, 0), to: new THREE.Vector3(-7 + Math.random() * 3, 11, -2), colors: theme.burst, count: 320, speed: 8 });
        fw.current?.launch({ from: new THREE.Vector3(8, -10, 0), to: new THREE.Vector3(5 + Math.random() * 3, 12, -2), colors: theme.burst, count: 320, speed: 8, delay: 0.15, shape: i % 2 ? 'heart' : 'sphere' });
        if (i > 0) cards.current?.place(list[i - 1].id);
        cards.current?.spotlight(w.id);
        setCurrent(w);
      }, null, at);
    });
    const end = 2.6 + list.length * SHOW_GAP;
    q.call(() => { cards.current?.placeAll(); setCurrent({ finale: true }); grandBurst(14); }, null, end);
    q.call(() => { setCurrent(null); setShowDone(true); setPhase('after'); }, null, end + 4.5);
    tl.current = q;
  }

  // demo wall: pretend the server unlocked it
  useEffect(() => {
    if (DEMO && wall && t >= wall.at && !wall.open) setWall((w) => ({ ...w, open: true }));
  });

  // the show needs the wishes; if they arrive after it started, restart once they're in
  const startedEmpty = useRef(false);
  useEffect(() => {
    if (phase === 'show' && !visibleWishes.length) startedEmpty.current = true;
    if (startedEmpty.current && visibleWishes.length && (phase === 'show' || phase === 'after')) { startedEmpty.current = false; startShow(); }
  }, [visibleWishes.length, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (<>
      <Header />
      <main className="soon gut"><div className="card">
        <h1 className="ch">We couldn't find this wall</h1>
        <p className="lead">{error} Check the link, or make a new one.</p>
        <div className="row" style={{ justifyContent: 'center' }}><a className="btn primary" href="/create">Make a birthday wall</a></div>
      </div></main>
    </>);
  }

  const left = wall ? wall.at - t : 0;
  const opened = wall && left <= 0;
  const accent = theme.ring;

  return (
    <>
      <Scene camera={{ position: [0, 3.5, 27], fov: 50 }} bloom={0.95} background={theme.bg}>
        <Sky top={theme.bg} bottom={theme.glow} power={0.7} />
        <Moon position={[50, 60, -240]} />
        <Sea y={-9} deep="#050a18" shallow={theme.glow} glint={theme.ring} fog={theme.glow} moonX={50} />
        <Coast z={-260} />
        <Rig push={push} />
        {wall && <SignerLanterns names={wall.signers || []} color={theme.burst[0]} rising={opened} />}
        {wall && <WallCards ref={cards} wishes={visibleWishes} accent={accent} />}
        <Fireworks ref={fw} />
        <TapFireworks fw={fw} theme={theme} />
      </Scene>
      <Header />
      <main className="view passthrough">
        <section className="wallstage">
          {!wall ? (
            <div className="ov top gut"><div className="from">Opening the wall…</div></div>
          ) : (
            <>
              <div className="ov top gut">
                <div className="occ" style={{ color: accent }}>{wall.occasion} · {tLabel(wall.at)} IST, {dLabel(wall.at)}</div>
                <h1 className="walltitle">{wall.title || `For ${wall.forName}`}</h1>
              </div>
              <div className="ov bottom gut">
                {!opened && (
                  <>
                    <div className={'digits' + (left <= 10000 ? ' final' : '')}>{left <= 10000 ? Math.ceil(left / 1000) : fmtLeft(left)}</div>
                    <div className="lock">🔒 {wall.count} {wall.count === 1 ? 'wish' : 'wishes'}{wall.photoCount ? ` and ${wall.photoCount} ${wall.photoCount === 1 ? 'photo' : 'photos'}` : ''} sealed until the fireworks</div>
                    <div className="signers">{(wall.signers || []).slice(-12).map((n, i) => <span key={i} className="signer">🏮 {n}</span>)}</div>
                    <p className="hint">Tap the sky to try a firework</p>
                  </>
                )}
                {opened && !wall.open && <div className="ov-card"><p className="msg small">Opening the wishes…</p></div>}
                {opened && current?.title && <div className="ov-card big-wish" key="title"><span className="hb" style={{ color: accent }}>Happy {wall.occasion === 'Birthday' ? 'Birthday' : wall.occasion},</span><span className="nm">{wall.forName}!</span></div>}
                {opened && current && current.id && <div className="ov-card" key={current.id}><p className="msg">“{current.message}”</p><p className="by" style={{ color: accent }}>— {current.from}</p></div>}
                {opened && current?.finale && <div className="ov-card big-wish"><span className="nm">With love from {visibleWishes.length} {visibleWishes.length === 1 ? 'person' : 'people'}</span></div>}
                {opened && wall.open && !current && (
                  <div className="ov-card">
                    <p className="msg small">{visibleWishes.length ? `${visibleWishes.length} wishes for ${wall.forName}` : `The wall for ${wall.forName} is open`}</p>
                    <div className="row" style={{ justifyContent: 'center' }}>
                      {visibleWishes.length > 0 && <button className="btn primary" type="button" onClick={startShow}>{showDone ? 'Replay the fireworks' : 'Play the fireworks show'}</button>}
                      <a className="btn ghost" href="#wishes">See all wishes</a>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {wall && (
          <section className="panels gut">
            <div className="max">
              <div className="side-panels">
                <AddWish wall={wall} onAdded={(w) => { if (DEMO) setWall((x) => ({ ...x, count: x.count + 1, signers: [...x.signers, w.from], wishes: [...x.wishes, { ...w, id: 'm' + Date.now() }] })); else load(); }} />
              </div>
              <div className="side-panels">
                <SharePanel wall={wall} />
                {wall.manager && <ManagePanel wall={wall} manageKey={key} created={created} onChange={load} />}
              </div>
            </div>
            {opened && visibleWishes.length > 0 && (
              <div className="max gallery" id="wishes">
                <h2 className="ph">All the wishes for {wall.forName}</h2>
                <div className="grid">
                  {visibleWishes.map((w) => (
                    <figure key={w.id} className="wishcard">
                      {w.photo && <img src={w.photo} alt={`Photo from ${w.from}`} loading="lazy" />}
                      <figcaption><p>{w.message}</p><b style={{ color: accent }}>— {w.from}</b></figcaption>
                      {!DEMO && <ReportButton wallId={wall.id} wishId={w.id} />}
                    </figure>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

function AddWish({ wall, onAdded }) {
  const [f, setF] = useState({ from: '', message: '' });
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const opened = now() >= wall.at;

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return setMsg({ text: 'Choose a photo (JPEG or PNG).' });
    try { setPhoto(await shrinkPhoto(file)); setMsg({ text: '' }); } catch { setMsg({ text: 'That photo could not be read. Try another.' }); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.from.trim() || !f.message.trim()) return setMsg({ text: 'Add your name and your wish.' });
    setBusy(true);
    try {
      if (!wall.demo) await api(`walls/${wall.id}/wishes`, { method: 'POST', body: { from: f.from, message: f.message, photo: photo ? { mime: photo.mime, data: photo.data } : undefined } });
      onAdded({ from: f.from, message: f.message, photo: photo?.preview || null });
      setDone(true);
      setMsg({ text: opened ? 'Added to the wall.' : `Sealed! ${wall.forName} sees it at ${tLabel(wall.at)}.`, ok: true });
      setF({ from: f.from, message: '' }); setPhoto(null);
    } catch (x) { setMsg({ text: x.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="panel">
      <div className="eyebrow">{done ? 'Thank you' : 'Add your wish'}</div>
      <h2 className="ph">{done ? 'Your lantern is lit 🏮' : `Wish ${wall.forName} well`}</h2>
      <form onSubmit={submit} noValidate>
        <label className="f" htmlFor="aFrom">Your name<input id="aFrom" type="text" maxLength={30} placeholder="Ravi" value={f.from} onChange={set('from')} /></label>
        <label className="f" htmlFor="aMsg">Your wish<textarea id="aMsg" maxLength={280} placeholder={`Happy birthday ${wall.forName}!`} value={f.message} onChange={set('message')} /></label>
        <div className="photo-pick">
          {photo ? (
            <div className="photo-prev"><img src={photo.preview} alt="Your photo" /><button type="button" className="btn small" onClick={() => setPhoto(null)}>Remove photo</button></div>
          ) : (
            <label className="btn upload" htmlFor="aPhoto">📷 Add a photo (optional)<input id="aPhoto" type="file" accept="image/*" onChange={pick} /></label>
          )}
        </div>
        <button className="btn primary wide" type="submit" disabled={busy}>{busy ? 'Sending…' : done ? 'Add another wish' : 'Light my lantern'}</button>
        <p className={msg.ok ? 'ok' : 'err'} role="alert">{msg.text}</p>
      </form>
    </div>
  );
}

function SharePanel({ wall }) {
  const link = location.origin + '/b/' + wall.id;
  const text = `🎆 ${wall.title || wall.forName + "'s " + wall.occasion.toLowerCase()} wall: add your wish and a photo! Fireworks open it at ${tLabel(wall.at)} on ${dLabel(wall.at)}.\n${link}`;
  return (
    <div className="panel">
      <div className="eyebrow">Invite everyone</div>
      <p style={{ margin: 0 }}>Anyone with this link can add a wish and a photo. Share it in your group, but not with {wall.forName}, so it stays a surprise.</p>
      <div className="sharebox"><span className="code">{link}</span></div>
      <div className="row">
        <a className="btn primary" href={'https://wa.me/?text=' + encodeURIComponent(text)} target="_blank" rel="noopener">Share on WhatsApp</a>
        <button className="btn" type="button" onClick={(e) => copyText(text, e.currentTarget)}>Copy invite</button>
      </div>
    </div>
  );
}

function ManagePanel({ wall, manageKey, created, onChange }) {
  const manageLink = location.origin + '/b/' + wall.id + '?key=' + manageKey;
  async function toggle(w) {
    try { await api(`walls/${wall.id}/manage`, { method: 'POST', body: { key: manageKey, action: w.hidden ? 'show' : 'hide', wishId: w.id } }); onChange(); }
    catch (e) { toast(e.message); }
  }
  return (
    <div className="panel">
      {created && <div className="successbar">Your wall is ready. Invite everyone with the link above.</div>}
      <div className="eyebrow">Only you see this · manage the wall</div>
      <p className="note fg">Keep this private link to manage the wall from another phone:</p>
      <div className="sharebox"><span className="code small">{manageLink}</span></div>
      <button className="btn small" type="button" onClick={(e) => copyText(manageLink, e.currentTarget)}>Copy manage link</button>
      <div className="eyebrow" style={{ marginTop: 6 }}>Wishes so far ({wall.wishes.length})</div>
      <div className="list">
        {wall.wishes.length ? wall.wishes.map((w) => (
          <div key={w.id} className={'item static' + (w.hidden ? ' past' : '')}>
            {w.photo ? <img className="thumb" src={w.photo} alt="" /> : <span className="thumb">✉️</span>}
            <span className="w"><strong>{w.from}</strong><small>{w.message}</small></span>
            <button className="btn small" type="button" onClick={() => toggle(w)}>{w.hidden ? 'Show' : 'Hide'}</button>
          </div>
        )) : <p className="empty">No wishes yet. Share the link to get started.</p>}
      </div>
    </div>
  );
}

function ReportButton({ wallId, wishId }) {
  const [sent, setSent] = useState(false);
  if (sent) return <span className="note">Reported</span>;
  return (
    <button className="report" type="button" onClick={async () => {
      try { await api(`walls/${wallId}/report`, { method: 'POST', body: { wishId, reason: 'Reported by a viewer' } }); setSent(true); }
      catch (e) { toast(e.message); }
    }}>Report</button>
  );
}

mount(App);
