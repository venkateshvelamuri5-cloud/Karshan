import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { mount, Header, DigitalTime, Footer, useNow } from '../ui/common.jsx';
import { Scene, Sky, Sea, Coast, RisingLanterns } from '../three/World.jsx';
import { Clock3D, dialAngle } from '../three/Clock3D.jsx';
import { Fireworks } from '../three/Fireworks.jsx';
import { CAT_COL, THEMES } from '../three/palette.js';
import { CITIES, REACTIONS, LIVE_SPAN_MS } from '../../shared/cities.js';
import { now, ist, dayStart, tLabel, hhmm, dLabel, fmtLeft, shortLeft, MIN } from '../lib/time.js';
import { api, clientId, copyText } from '../lib/api.js';
import { currentCity, rememberCity } from '../lib/header.js';

const CITY = CITIES[currentCity()];
// On phones a finger on the clock should scroll the page, not tilt it.
const COARSE = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const SAMPLE_SPONSORS = [{ n: 'Raftaar EV', c: '#14b8a6' }, { n: 'Kesar & Co.', c: '#f59e0b' }, { n: 'Tara Telecom', c: '#6366f1' }, { n: 'Saffron Threads', c: '#e11d48' }, { n: 'Monsoon Mart', c: '#10b981' }];

// Clearly-labelled samples, shown until the city has its first approved listing.
function makeSamples() {
  const n = now(), ds = dayStart(n), r5 = (x) => Math.round(x / (5 * MIN)) * 5 * MIN;
  return [
    { id: 's1', business: 'Beach Road Book Café', title: 'Live music night', cat: 'Event', area: CITY.areas[0], at: Math.round((n - 20 * MIN) / MIN) * MIN, offer: 'Free coffee with every dessert', code: 'MUSIC' },
    { id: 's2', business: 'Monsoon Mart', title: 'One-hour flash sale', cat: 'Sale', area: CITY.areas[2], at: Math.ceil((n + 45000) / MIN) * MIN, offer: 'Flat ₹150 off on ₹999', code: 'FLASH150' },
    { id: 's3', business: 'Dosa District', title: 'Happy hour', cat: 'Happy hour', area: CITY.areas[1], at: r5(n + 125 * MIN), offer: '2 dosas for the price of 1', code: 'DOSA2' },
    { id: 's4', business: 'Kailasa Fitness', title: 'Open house', cat: 'Event', area: CITY.areas[4], at: r5(n + 270 * MIN), offer: 'Free trial week', code: '' },
    { id: 's5', business: 'Andhra Spice Kitchen', title: 'New biryani menu', cat: 'Launch', area: CITY.areas[3], at: r5(n + 9 * 60 * MIN), offer: 'Free dessert with every biryani', code: 'SPICE' },
    { id: 's6', business: 'Saffron Threads', title: 'Festive sale', cat: 'Sale', area: CITY.areas[8], at: ds + 86400e3 + 11 * 3600e3, offer: 'Up to 40% off handloom', code: '' },
  ].map((x) => ({ ...x, sample: true, hasCode: Boolean(x.code), reactions: {} }));
}

function useFeed() {
  const [feed, setFeed] = useState({ announcements: [], sponsors: [], celebrationsToday: 0, wallWishesToday: 0, loaded: false });
  const [watching, setWatching] = useState(0);
  const refresh = useCallback(async () => {
    try { const f = await api('city/' + CITY.slug); setFeed({ ...f, loaded: true }); }
    catch (e) { setFeed((f) => ({ ...f, loaded: true, offline: e.code })); }
  }, []);
  useEffect(() => {
    refresh();
    const a = setInterval(refresh, 15000);
    const beat = () => api('presence', { method: 'POST', body: { room: 'c:' + CITY.slug, clientId: clientId(), hearts: 0 } }).then((r) => setWatching(r.count)).catch(() => {});
    beat();
    const b = setInterval(beat, 10000);
    const vis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener('visibilitychange', vis); };
  }, [refresh]);
  return { feed, setFeed, watching, refresh };
}

function World({ markers, selectedId, onSelect, rim, fwRef }) {
  return (
    <>
      <Sky top="#050817" bottom="#28214f" power={0.8} />
      <Sea y={-16} deep="#040d1c" shallow="#123a52" fog="#141838" moonX={0} />
      <Coast z={-260} />
      <RisingLanterns count={60} />
      <Clock3D position={[0, 1.2, 0]} markers={markers} selectedId={selectedId} onSelect={onSelect} rimColors={rim} label="KARSHAN" sub={CITY.short.toUpperCase() + ' · IST'} />
      <Fireworks ref={fwRef} />
      <OrbitControls enabled={!COARSE} enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 2 - 0.35} maxPolarAngle={Math.PI / 2 + 0.25} minAzimuthAngle={-0.6} maxAzimuthAngle={0.6} rotateSpeed={0.5} target={[0, camY, 0]} />
    </>
  );
}

function App() {
  const { feed, setFeed, watching, refresh } = useFeed();
  const samples = useMemo(makeSamples, []);
  const usingSamples = CITY.samples && feed.loaded && !(feed.announcements || []).length;
  const list = usingSamples ? samples : feed.announcements || [];
  const [selectedId, setSelectedId] = useState(null);
  const [area, setArea] = useState('All');
  const [floaters, setFloaters] = useState([]);
  const fw = useRef();
  const seenLive = useRef(null);
  const t = useNow(500);
  const NARROW = typeof innerWidth !== 'undefined' && innerWidth / innerHeight < 0.8;
const camZ = NARROW ? 50 : 35;
const camY = NARROW ? -0.6 : -2.6;

  useEffect(() => { rememberCity(CITY.slug); document.title = `Today in ${CITY.short} · Karshan`; }, []);

  // sponsor for an hour of today (IST)
  const sponsorAt = useCallback((h24) => {
    const ds = dayStart(now()), ms = ds + h24 * 3600e3 + 1;
    const real = (feed.sponsors || []).find((s) => s.startsAt <= ms && s.endsAt > ms);
    if (real) return { n: real.brand, c: real.color, sample: false };
    if (usingSamples && h24 >= 7 && h24 <= 23 && h24 !== 15) return { ...SAMPLE_SPONSORS[Math.floor(h24 / 3) % SAMPLE_SPONSORS.length], sample: true };
    return null;
  }, [feed.sponsors, usingSamples]);

  const curH = ist(t).getUTCHours();
  const sp = sponsorAt(curH);
  // the next 12 hours, laid on the 12-hour rim
  const rim = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const h24 = [i, i + 12].find((h) => ((h - curH + 24) % 24) < 12);
    return sponsorAt(h24)?.c || null;
  }), [curH, sponsorAt]);

  const markers = useMemo(() => list
    .filter((m) => m.at > t - LIVE_SPAN_MS && m.at < t + 12 * 3600e3)
    .map((m) => ({
      id: m.id, angle: dialAngle(m.at), color: CAT_COL[m.cat] || '#ffab3d',
      live: t >= m.at && t < m.at + LIVE_SPAN_MS, past: false,
      timeLabel: tLabel(m.at), label: `${m.business} · ${m.title}`,
    })), [list, Math.floor(t / 5000)]); // eslint-disable-line react-hooks/exhaustive-deps

  // when a moment goes live while you watch: fireworks in its colour
  useEffect(() => {
    if (!feed.loaded) return;
    const live = list.filter((m) => t >= m.at && t < m.at + LIVE_SPAN_MS);
    if (!seenLive.current) { seenLive.current = new Set(live.map((m) => m.id)); return; }
    for (const m of live) {
      if (seenLive.current.has(m.id)) continue;
      seenLive.current.add(m.id);
      setSelectedId(m.id);
      celebrate(m, 5);
      if (!m.sample && m.hasCode && !m.code) setTimeout(refresh, 1200);
    }
  });

  function celebrate(m, n = 1) {
    const col = CAT_COL[m.cat] || '#ffab3d';
    const a = dialAngle(m.at), r = 7;
    for (let i = 0; i < n; i++) {
      fw.current?.launch({
        from: new THREE.Vector3(Math.sin(a) * r * 0.6 + (Math.random() - 0.5) * 8, -10, -6),
        to: new THREE.Vector3(Math.sin(a) * r + (Math.random() - 0.5) * 10, 1.2 + Math.cos(a) * r + Math.random() * 6, -4 + Math.random() * 3),
        colors: [col, '#fff1c9', ...THEMES.marigold.burst.slice(0, 2)], count: 360, speed: 8, delay: i * 0.45,
        shape: i % 3 === 2 ? 'ring' : 'sphere',
      });
    }
  }

  const selected = list.find((m) => m.id === selectedId);
  const ds = dayStart(t);
  const inArea = (m) => area === 'All' || m.area === area;
  const today = list.filter((m) => m.at >= ds && m.at < ds + 86400e3 && inArea(m)).sort((a, b) => a.at - b.at);
  const later = list.filter((m) => m.at >= ds + 86400e3 && inArea(m)).sort((a, b) => a.at - b.at);
  const live = list.filter((m) => t >= m.at && t < m.at + LIVE_SPAN_MS);
  const next = list.filter((m) => m.at > t).sort((a, b) => a.at - b.at)[0];

  async function react(e, ev) {
    if (!selected) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const id = Math.random();
    setFloaters((f) => [...f, { id, e, x: rect.left + rect.width / 2, y: rect.top }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.id !== id)), 1400);
    if (e === '🎉' || e === '🔥') celebrate(selected, 1);
    const bump = (m) => (m.id === selected.id ? { ...m, reactions: { ...m.reactions, [e]: (m.reactions?.[e] || 0) + 1 } } : m);
    if (selected.sample) { samples.forEach((m, i) => { if (m.id === selected.id) samples[i] = bump(m); }); setFeed((f) => ({ ...f })); return; }
    setFeed((f) => ({ ...f, announcements: f.announcements.map(bump) }));
    try { const r = await api('react', { method: 'POST', body: { id: selected.id, emoji: e } }); setFeed((f) => ({ ...f, announcements: f.announcements.map((m) => (m.id === selected.id ? { ...m, reactions: r.reactions } : m)) })); } catch { /* catches up on refresh */ }
  }

  if (!CITY.enabled) {
    return (<>
      <Header active="clock" />
      <main className="soon gut"><div className="card">
        <div className="eyebrow">Coming soon</div>
        <h1 className="ch">Karshan is coming to {CITY.name}</h1>
        <p className="lead">We're opening one city at a time. Businesses there can already ask to be among the first.</p>
        <div className="row" style={{ justifyContent: 'center' }}><a className="btn primary" href="/create#sponsor">Tell us you're interested</a><a className="btn" href="/vizag">See Vizag's clock</a></div>
      </div></main>
    </>);
  }

  return (
    <>
      <Scene camera={{ position: [0, camY, camZ], fov: 45 }} bloom={1.2} background="#050817" onPointerMissed={() => setSelectedId(null)}>
        <World markers={markers} selectedId={selectedId} onSelect={setSelectedId} rim={rim} fwRef={fw} />
      </Scene>
      <Header active="clock" />
      <main className="view passthrough">
        <section className="clockhero">
          <div className="hud top gut">
            <DigitalTime city={CITY.short} big />
            <div className="hud-pills">
              {watching > 1 && <span className="pill">👀 {watching} watching</span>}
              <span className="pill">{sp ? <><i className="dot" style={{ background: sp.c }}></i>This hour: {sp.n}{sp.sample ? ' (sample)' : ''}</> : 'This hour is open to sponsor'}</span>
            </div>
          </div>
          {selected ? (
            <Detail m={selected} t={t} onClose={() => setSelectedId(null)} onReact={react} />
          ) : (
            <div className="hud bottom gut">
              {live[0] ? (
                <button type="button" className="next" onClick={() => setSelectedId(live[0].id)}>
                  <span className="pill live-pill">● Live now in {live[0].area}</span>
                  <span className="t">{live[0].business}: {live[0].title}</span>
                  <span className="s">Tap for the offer and directions</span>
                </button>
              ) : next ? (
                <button type="button" className="next" onClick={() => setSelectedId(next.id)}>
                  <span className="pill">Next {shortLeft(next.at - t)}</span>
                  <span className="t">{next.business}: {next.title}</span>
                  <span className="s">{next.area} · {tLabel(next.at)}. Tap a glowing dot on the clock.</span>
                </button>
              ) : (
                <div className="next"><span className="t">Nothing else on the clock today</span><a className="btn small primary" href="/create#promote">Put your offer on it</a></div>
              )}
              {!COARSE && <p className="hint">Drag to tilt the clock</p>}
            </div>
          )}
        </section>

        <section className="panels gut">
          <div className="max">
            <div className="panel">
              <h2 className="ph">Today in {CITY.short} · {dLabel(t)}</h2>
              <div className="chips" role="group" aria-label="Filter by area">
                {['All', ...CITY.areas].map((a) => <button key={a} type="button" className="chip" aria-pressed={a === area} onClick={() => setArea(a)}>{a}</button>)}
              </div>
              {usingSamples && <div className="banner">{feed.offline === 'no_database' ? 'Showing samples. The database is not connected yet.' : 'Showing sample listings until the first real one is approved.'}</div>}
              <div className="list">
                {today.length ? today.map((m) => <Item key={m.id} m={m} t={t} onPick={setSelectedId} />) : <p className="empty">Nothing on the clock{area === 'All' ? '' : ' in ' + area} today yet.</p>}
              </div>
              <div className="eyebrow" style={{ marginTop: 8 }}>Coming up</div>
              <div className="list">
                {later.length ? later.slice(0, 8).map((m) => <Item key={m.id} m={m} t={t} onPick={setSelectedId} />) : <p className="empty">Nothing announced yet.</p>}
              </div>
            </div>
            <div className="side-panels">
              <div className="panel">
                <div className="eyebrow">Celebrations today</div>
                <div className="stat">{feed.celebrationsToday || 0}</div>
                <p className="note fg">birthday walls and wishes open in {CITY.short} today. Only the people they're for can see them.</p>
                <a className="btn primary" href="/create">Make a birthday wall</a>
              </div>
              <div className="panel">
                <div className="eyebrow">Promote your business</div>
                <p style={{ margin: 0 }}>A sale, happy hour, launch or event? Put it on the clock at the exact time it starts.</p>
                <a className="btn" href="/create#promote">Promote in {CITY.short}</a>
              </div>
            </div>
          </div>
        </section>
      </main>
      {floaters.map((f) => <span key={f.id} className="floater" style={{ left: f.x, top: f.y }}>{f.e}</span>)}
      <Footer />
    </>
  );
}

function Item({ m, t, onPick }) {
  const live = t >= m.at && t < m.at + LIVE_SPAN_MS, past = t >= m.at + LIVE_SPAN_MS, today = m.at < dayStart(t) + 86400e3;
  return (
    <button type="button" className={'item' + (past ? ' past' : '')} onClick={() => { onPick(m.id); scrollTo({ top: 0, behavior: 'smooth' }); }}>
      <span className="tm">{hhmm(m.at)}<small>{today ? m.area : dLabel(m.at)}</small></span>
      <span className="w"><strong>{m.business} · {m.title}</strong><small><i className="dot" style={{ background: CAT_COL[m.cat] }}></i>{m.cat}{m.offer ? ' · ' + m.offer : ''}{today ? '' : ' · ' + m.area}{m.sample ? ' · sample' : ''}</small></span>
      <span className="lf">{live ? '● Live' : past ? 'Done' : shortLeft(m.at - t)}</span>
    </button>
  );
}

function Detail({ m, t, onClose, onReact }) {
  const live = t >= m.at && t < m.at + LIVE_SPAN_MS, started = t >= m.at;
  const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${m.business} ${m.area} ${CITY.name}`);
  const codeRef = useRef();
  const share = (ev) => {
    const text = `${m.business}: ${m.title} · ${dLabel(m.at)}, ${tLabel(m.at)} · ${m.area}, ${CITY.short}\n${location.origin}/${CITY.slug}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else copyText(text, ev.currentTarget);
  };
  return (
    <div className="detail" role="dialog" aria-label={m.business}>
      <button className="x" type="button" aria-label="Close" onClick={onClose}>×</button>
      <div className="meta">
        <span className="tag" style={{ color: CAT_COL[m.cat] }}>{m.cat}</span>
        <span className="tag">{m.area}</span>
        <span className="tag">{dLabel(m.at)} · {tLabel(m.at)}</span>
        {live && <span className="tag live">● Live now</span>}
        {m.sample && <span className="tag sample">Sample</span>}
      </div>
      <h3>{m.business}: {m.title}</h3>
      {!started && <div className="countdown">Starts in <b>{fmtLeft(m.at - t)}</b>{m.hasCode ? '. The code appears here the moment it starts.' : ''}</div>}
      {m.offer && (
        <div className="offer"><span>{m.offer}</span>
          {m.code && started && <><b ref={codeRef}>{m.code}</b><button className="btn small" type="button" onClick={(e) => copyText(m.code, e.currentTarget, codeRef.current)}>Copy code</button></>}
        </div>
      )}
      <div className="reacts">
        {REACTIONS.map((e) => <button key={e} className="react" type="button" aria-label={'React ' + e} onClick={(ev) => onReact(e, ev)}>{e}<span>{m.reactions?.[e] || 0}</span></button>)}
      </div>
      <div className="row"><a className="btn small" href={maps} target="_blank" rel="noopener">Directions</a><button className="btn small" type="button" onClick={share}>Share</button></div>
    </div>
  );
}

mount(App);
