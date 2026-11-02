import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CITIES } from '../../shared/cities.js';
import { currentCity } from '../lib/header.js';
import { now, ist, p2 } from '../lib/time.js';
import { api } from '../lib/api.js';
import '../styles/app.css';

export function mount(App) {
  // Sync our clock with the server once, so every countdown agrees across phones.
  api('config').catch(() => {});
  createRoot(document.getElementById('root')).render(<App />);
}

export function Header({ active }) {
  const city = CITIES[currentCity()];
  const [open, setOpen] = useState(false);
  return (
    <header className="top gut">
      <div className="max">
        <a className="brand" href="/"><i aria-hidden="true"></i>Karshan <em>{city.short}</em></a>
        <button className="menu-btn" type="button" aria-expanded={open} aria-controls="mainnav" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="mainnav" className={'nav' + (open ? ' open' : '')} aria-label="Main">
          <a href={'/' + city.slug} aria-current={active === 'clock' ? 'page' : undefined}>Today in {city.short}</a>
          <a href="/create#promote" aria-current={active === 'promote' ? 'page' : undefined}>Promote</a>
          <a href="/create" className="cta" aria-current={active === 'create' ? 'page' : undefined}>Make a birthday wall</a>
        </nav>
      </div>
    </header>
  );
}

// Re-render every `ms` with the server-synced time.
export function useNow(ms = 250) {
  const [t, setT] = useState(now());
  useEffect(() => {
    const id = setInterval(() => setT(now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return t;
}

export function DigitalTime({ city = 'Vizag', big = false }) {
  const t = useNow(200);
  const d = ist(t);
  let h = d.getUTCHours();
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return (
    <div className={'digital' + (big ? ' big' : '')} aria-live="off">
      <span className="dt-time">{h}:{p2(d.getUTCMinutes())}<span className="dt-sec">:{p2(d.getUTCSeconds())}</span></span>
      <span className="dt-ap">{ap}</span>
      <span className="dt-zone">{city} · IST</span>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="foot gut">
      <div className="max">Karshan · starting in Visakhapatnam · <a href="/create">Make a birthday wall</a> · <a href="/create#promote">Promote your business</a> · <a href="/admin">Admin</a></div>
    </footer>
  );
}
