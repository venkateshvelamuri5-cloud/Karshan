// Colours shared by the 3D scenes and the page styles.
export const THEMES = {
  marigold: { name: 'Marigold', bg: '#140d05', glow: '#4a2a0c', ring: '#ffa62b', burst: ['#ffb347', '#ffd166', '#ff7b2e', '#fff1c9'] },
  peacock: { name: 'Peacock', bg: '#04161b', glow: '#0f3d3f', ring: '#2fc4b2', burst: ['#35e0c8', '#4d8dff', '#9cf2a8', '#f6e27a'] },
  rose: { name: 'Rose', bg: '#1a0710', glow: '#4a1a2c', ring: '#ef8fb3', burst: ['#ff8fb8', '#ff4f86', '#ffd6e2', '#ffb38a'] },
  night: { name: 'Starlight', bg: '#070a1c', glow: '#1d2550', ring: '#c9d1ff', burst: ['#ffffff', '#c9d1ff', '#ffd98a', '#8fa3ff'] },
};

export const CAT_COL = {
  Offer: '#35c2b0',
  Sale: '#ff7b54',
  Event: '#ef8fb3',
  Launch: '#8fa3ff',
  Opening: '#ffab3d',
  'Happy hour': '#f7d35c',
};

export const reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
