import { useEffect, useState } from 'react';
import { mount, Header, Footer, useNow } from '../ui/common.jsx';
import { Scene, Sky, Sea, RisingLanterns, Moon } from '../three/World.jsx';
import { THEMES, CAT_COL } from '../three/palette.js';
import { CITIES, CATEGORIES, OCCASIONS, hourRate, DAY_RATE } from '../../shared/cities.js';
import { now, dayStart, dateInput, readInputs, dLabel, tLabel, fmtLeft, ist, p2 } from '../lib/time.js';
import { api } from '../lib/api.js';
import { currentCity } from '../lib/header.js';

const TABS = [['wall', 'Birthday wall'], ['promote', 'Promote your business'], ['sponsor', 'Sponsor an hour']];
const enabled = Object.values(CITIES).filter((c) => c.enabled);

function useTab() {
  const read = () => { const h = location.hash.slice(1); return TABS.some(([k]) => k === h) ? h : 'wall'; };
  const [tab, setTab] = useState(read);
  useEffect(() => { const f = () => setTab(read()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const go = (k) => { history.replaceState(null, '', k === 'wall' ? '/create' : '/create#' + k); setTab(k); };
  return [tab, go];
}

function App() {
  const [tab, go] = useTab();
  useEffect(() => { document.querySelector('.tab[aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [tab]);
  return (
    <>
      <Scene camera={{ position: [0, 8, 40], fov: 50 }} bloom={0.9}>
        <Sky top="#070b22" bottom="#7a3f5a" power={0.6} />
        <Moon />
        <Sea y={-6} />
        <RisingLanterns count={90} />
      </Scene>
      <Header active={tab === 'wall' ? 'create' : 'promote'} />
      <main className="view formwrap gut">
        <div className="max">
          <div><div className="eyebrow">Light a lantern</div><h1 className="ch" style={{ marginTop: 6 }}>What are you lighting?</h1></div>
          <div className="tabs" role="tablist" aria-label="What to create">
            {TABS.map(([k, label]) => <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => go(k)}>{label}</button>)}
          </div>
          {tab === 'wall' && <WallForm />}
          {tab === 'promote' && <PromoteForm />}
          {tab === 'sponsor' && <SponsorForm />}
        </div>
      </main>
      <Footer />
    </>
  );
}

function WallForm() {
  const t = useNow(1000);
  const midnight = dayStart(now()) + 86400e3;
  const [f, setF] = useState({ forName: '', occasion: 'Birthday', title: '', date: dateInput(midnight), time: '00:00', theme: 'marigold' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const at = readInputs(f.date, f.time);
  const th = THEMES[f.theme];

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!f.forName.trim()) return setErr('Who is the wall for?');
    if (!at || at < now() + 60000) return setErr('Pick a reveal time at least a couple of minutes from now.');
    setBusy(true);
    try {
      const r = await api('walls', { method: 'POST', body: { forName: f.forName, occasion: f.occasion, title: f.title, at, theme: f.theme, city: currentCity() } });
      try { localStorage.setItem('wall-key-' + r.id, r.manageKey); } catch { /* storage blocked: the key is also in the link */ }
      location.href = `/b/${r.id}?created=1&key=${r.manageKey}`;
    } catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <div className="fgrid">
      <div className="panel">
        <form onSubmit={submit} noValidate>
          <div className="two">
            <label className="f" htmlFor="wFor">Who is it for?<input id="wFor" type="text" maxLength={30} placeholder="Sneha" value={f.forName} onChange={set('forName')} /></label>
            <label className="f" htmlFor="wOcc">Occasion<select id="wOcc" value={f.occasion} onChange={set('occasion')}>{OCCASIONS.map((o) => <option key={o}>{o}</option>)}</select></label>
          </div>
          <label className="f" htmlFor="wTitle">Title (optional)<input id="wTitle" type="text" maxLength={60} placeholder="Sneha turns 25!" value={f.title} onChange={set('title')} /></label>
          <div className="two">
            <label className="f" htmlFor="wDate">Fireworks on<input id="wDate" type="date" min={dateInput(now())} value={f.date} onChange={set('date')} /></label>
            <label className="f" htmlFor="wTime">At (IST)<input id="wTime" type="time" step={60} value={f.time} onChange={set('time')} /></label>
          </div>
          <div className="f">Colours
            <div className="swatches">
              {Object.entries(THEMES).map(([k, v]) => (
                <label key={k} className="swatch"><input type="radio" name="theme" value={k} checked={f.theme === k} onChange={set('theme')} aria-label={v.name} /><span><i style={{ background: v.ring }}></i>{v.name}</span></label>
              ))}
            </div>
          </div>
          <p className="note">Free during the launch. You'll get a link to share in your WhatsApp group: anyone with it can add a wish and a photo. Wishes stay sealed until the fireworks.</p>
          <button className="btn primary wide" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create the wall'}</button>
          <p className="err" role="alert">{err}</p>
        </form>
      </div>
      <div className="panel">
        <div className="eyebrow">What everyone sees before the fireworks</div>
        <div className="pv" style={{ background: `radial-gradient(circle at 50% 0%, ${th.glow}, ${th.bg})` }}>
          <div className="pv-occ" style={{ color: th.ring }}>{f.occasion}</div>
          <div className="t">{f.title.trim() || `${f.forName.trim() || 'Sneha'}'s wall`}</div>
          <div className="when" style={{ color: th.ring }}>{at ? `${dLabel(at)} · ${tLabel(at)} IST` : 'Pick a time'}</div>
          <div className="when big-digits">{at ? fmtLeft(at - t) : ''}</div>
          <div className="note">🎆 Fireworks and every wish open at the minute</div>
        </div>
        <a className="btn" href="/b/demo">Watch a 20-second demo</a>
      </div>
    </div>
  );
}

function PromoteForm() {
  const n = now(), b = n + 3 * 3600e3;
  const defCity = CITIES[currentCity()]?.enabled ? currentCity() : enabled[0].slug;
  const [f, setF] = useState({ city: defCity, business: '', title: '', category: 'Offer', area: CITIES[defCity].areas[0], phone: '', date: dateInput(b), time: p2(ist(b).getUTCHours()) + ':00', offer: '', code: '' });
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => (k === 'city' ? { ...x, city: v, area: CITIES[v].areas[0] } : { ...x, [k]: v }));
  };
  const at = readInputs(f.date, f.time);

  async function submit(e) {
    e.preventDefault();
    setMsg({ text: '', ok: false });
    if (!f.business.trim() || !f.title.trim()) return setMsg({ text: 'Add the business name and what you are promoting.' });
    if (!at || at < now()) return setMsg({ text: 'Pick a time in the future.' });
    setBusy(true);
    try {
      await api('announcements', { method: 'POST', body: { ...f, at } });
      setMsg({ text: 'Sent for approval. Once approved, it glows on the clock at its time. We may call to verify.', ok: true });
      setF((x) => ({ ...x, business: '', title: '', offer: '', code: '' }));
    } catch (x) { setMsg({ text: x.message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="fgrid">
      <div className="panel">
        <form onSubmit={submit} noValidate>
          <div className="two">
            <label className="f" htmlFor="pCity">City<select id="pCity" value={f.city} onChange={set('city')}>{enabled.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></label>
            <label className="f" htmlFor="pArea">Area<select id="pArea" value={f.area} onChange={set('area')}>{CITIES[f.city].areas.map((a) => <option key={a}>{a}</option>)}</select></label>
          </div>
          <div className="two">
            <label className="f" htmlFor="pBiz">Business name<input id="pBiz" type="text" maxLength={40} placeholder="Dosa District" value={f.business} onChange={set('business')} /></label>
            <label className="f" htmlFor="pCat">Type<select id="pCat" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <label className="f" htmlFor="pTitle">What's happening<input id="pTitle" type="text" maxLength={60} placeholder="Happy hour, 2 dosas for 1" value={f.title} onChange={set('title')} /></label>
          <div className="two">
            <label className="f" htmlFor="pDate">Date<input id="pDate" type="date" min={dateInput(n)} value={f.date} onChange={set('date')} /></label>
            <label className="f" htmlFor="pTime">Starts at (IST)<input id="pTime" type="time" step={60} value={f.time} onChange={set('time')} /></label>
          </div>
          <div className="two">
            <label className="f" htmlFor="pOffer">Offer (optional)<input id="pOffer" type="text" maxLength={60} placeholder="20% off till 8 PM" value={f.offer} onChange={set('offer')} /></label>
            <label className="f" htmlFor="pCode">Code (optional)<input id="pCode" type="text" maxLength={16} placeholder="DOSA20" value={f.code} onChange={set('code')} /></label>
          </div>
          <label className="f" htmlFor="pPhone">Phone (for verification, not shown)<input id="pPhone" type="tel" maxLength={14} placeholder="98xxxxxx10" value={f.phone} onChange={set('phone')} /></label>
          <p className="note">Free during the launch. We check every listing before it goes on the clock, usually within a few hours.</p>
          <button className="btn primary wide" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Submit for approval'}</button>
          <p className={msg.ok ? 'ok' : 'err'} role="alert">{msg.text}</p>
        </form>
      </div>
      <div className="panel">
        <div className="eyebrow">On the city clock</div>
        <div className="pv">
          <span className="tag" style={{ color: CAT_COL[f.category] }}>{f.category} · {f.area}</span>
          <div className="t">{f.business.trim() || 'Dosa District'}: {f.title.trim() || 'Happy hour'}</div>
          <div className="when">{at ? `${dLabel(at)} · ${tLabel(at)}` : 'Pick a time'}</div>
          {f.offer.trim() && <div className="offer"><span>{f.offer}</span>{f.code.trim() && <b>{f.code.toUpperCase()}</b>}</div>}
          <p className="note">A glowing dot appears on the clock. At your start time, fireworks go off in its colour and the code appears for everyone watching.</p>
        </div>
      </div>
    </div>
  );
}

function SponsorForm() {
  const [f, setF] = useState({ brand: '', name: '', phone: '', interest: 'One hour', note: '' });
  const [msg, setMsg] = useState({ text: '', ok: false });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (!f.brand.trim() || !f.name.trim() || !f.phone.trim()) return setMsg({ text: 'Add the brand, your name and a phone number.' });
    try { await api('enquiries', { method: 'POST', body: { ...f, city: currentCity() } }); setMsg({ text: 'Thanks. We will call you within a day.', ok: true }); setF({ brand: '', name: '', phone: '', interest: 'One hour', note: '' }); }
    catch (x) { setMsg({ text: x.message }); }
  }
  return (
    <div className="fgrid">
      <div className="panel">
        <form onSubmit={submit} noValidate>
          <div className="two">
            <label className="f" htmlFor="sBrand">Brand<input id="sBrand" type="text" maxLength={40} value={f.brand} onChange={set('brand')} /></label>
            <label className="f" htmlFor="sName">Your name<input id="sName" type="text" maxLength={40} value={f.name} onChange={set('name')} /></label>
          </div>
          <div className="two">
            <label className="f" htmlFor="sPhone">Phone<input id="sPhone" type="tel" maxLength={14} value={f.phone} onChange={set('phone')} /></label>
            <label className="f" htmlFor="sWhat">Interested in<select id="sWhat" value={f.interest} onChange={set('interest')}><option>One hour</option><option>A whole day</option><option>A festival week</option></select></label>
          </div>
          <label className="f" htmlFor="sNote">Anything else<textarea id="sNote" maxLength={240} placeholder="Preferred dates, areas, budget" value={f.note} onChange={set('note')} /></label>
          <button className="btn primary wide" type="submit">Send enquiry</button>
          <p className={msg.ok ? 'ok' : 'err'} role="alert">{msg.text}</p>
        </form>
      </div>
      <div className="panel">
        <div className="eyebrow">Rate card</div>
        <div className="rates one">
          <div><b>₹{hourRate(19).toLocaleString('en-IN')}</b><span>Evening hour (5–11 PM)</span></div>
          <div><b>₹{hourRate(10).toLocaleString('en-IN')}</b><span>Daytime hour (7 AM–5 PM)</span></div>
          <div><b>₹{DAY_RATE.toLocaleString('en-IN')}</b><span>A whole day on the clock</span></div>
        </div>
        <p className="note">Your colour glows on the rim of the clock for the hours you sponsor, and your name shows as "This hour".</p>
      </div>
    </div>
  );
}

mount(App);
