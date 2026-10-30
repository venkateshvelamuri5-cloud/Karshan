import { CITIES, DEFAULT_CITY } from '../../shared/cities.js';

export function currentCity() {
  const slug = location.pathname.replace(/^\/|\/$/g, '').split('/')[0];
  if (CITIES[slug]) return slug;
  try { const saved = localStorage.getItem('karshan-city'); if (saved && CITIES[saved]?.enabled) return saved; } catch { /* storage blocked */ }
  return DEFAULT_CITY;
}

export function rememberCity(slug) {
  try { localStorage.setItem('karshan-city', slug); } catch { /* storage blocked */ }
}

export function renderHeader(active) {
  const city = currentCity();
  const el = document.getElementById('top');
  el.className = 'top gut';
  el.innerHTML = `<div class="max">
    <a class="brand" href="/"><i></i>Karshan <em>${CITIES[city].short}</em></a>
    <nav class="nav" aria-label="Main">
      <a href="/" ${active === 'home' ? 'aria-current="page"' : ''}>Home</a>
      <a href="/${city}" ${active === 'clock' ? 'aria-current="page"' : ''}>Today in ${CITIES[city].short}</a>
      <a href="/create" class="cta" ${active === 'create' ? 'aria-current="page"' : ''}>Light a lantern</a>
    </nav>
  </div>`;
}
