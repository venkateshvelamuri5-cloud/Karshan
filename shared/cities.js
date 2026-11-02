// Every city is configuration, not code. To open a new city: add it here,
// set `enabled: true`, and add its slug to the rewrite in vercel.json.
export const CITIES = {
  vizag: {
    slug: 'vizag',
    name: 'Visakhapatnam',
    short: 'Vizag',
    enabled: true,
    // Show clearly-marked sample lanterns until the first real announcement is approved.
    samples: true,
    areas: ['RK Beach', 'Siripuram', 'MVP Colony', 'Dwaraka Nagar', 'Seethammadhara', 'Gajuwaka', 'Madhurawada', 'Rushikonda', 'Jagadamba', 'Akkayapalem'],
    tagline: 'RK Beach to Rushikonda, Gajuwaka to Madhurawada.',
  },
  vijayawada: {
    slug: 'vijayawada',
    name: 'Vijayawada',
    short: 'Vijayawada',
    enabled: false,
    samples: true,
    areas: ['Benz Circle', 'Governorpet', 'Labbipet', 'Patamata', 'Gunadala', 'Bhavanipuram', 'One Town', 'Moghalrajpuram'],
    tagline: 'Benz Circle to Bhavanipuram.',
  },
};

export const DEFAULT_CITY = 'vizag';
// Anything a business wants people to show up for, at a time.
export const CATEGORIES = ['Offer', 'Sale', 'Event', 'Launch', 'Opening', 'Happy hour'];
export const OCCASIONS = ['Birthday', 'Anniversary', 'Congratulations', 'Farewell', 'Welcome', 'Just because'];
export const REACTIONS = ['❤️', '🎉', '🔥', '👏', '😋'];
export const THEMES = ['marigold', 'peacock', 'rose', 'night'];

// How long an announcement counts as "live" after its start time.
export const LIVE_SPAN_MS = 30 * 60 * 1000;

// Indian Standard Time helpers (shared by the browser and the API).
export const IST_OFFSET = 5.5 * 3600e3;
export function istDayStart(ms) {
  const d = new Date(ms + IST_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET;
}
export function istHour(ms) {
  return new Date(ms + IST_OFFSET).getUTCHours();
}

// Sponsor rate card, used by the admin console and the public pages.
export function hourRate(hour) {
  if (hour >= 17 && hour <= 22) return 2999;
  if (hour >= 7 && hour <= 16) return 1499;
  return 499;
}
export const DAY_RATE = 19999;
