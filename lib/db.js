import { neon } from '@neondatabase/serverless';

// Times are stored as bigint milliseconds since epoch (UTC). The app shows them in IST.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS announcements (
    id text PRIMARY KEY,
    city text NOT NULL,
    business text NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    area text NOT NULL,
    at bigint NOT NULL,
    offer text NOT NULL DEFAULT '',
    code text NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'pending',
    reject_reason text NOT NULL DEFAULT '',
    ip text NOT NULL DEFAULT '',
    created_at bigint NOT NULL,
    reviewed_at bigint,
    reviewed_by text
  )`,
  `CREATE INDEX IF NOT EXISTS announcements_city_at ON announcements (city, at)`,
  `CREATE INDEX IF NOT EXISTS announcements_status ON announcements (status)`,
  `CREATE TABLE IF NOT EXISTS reactions (
    announcement_id text NOT NULL,
    emoji text NOT NULL,
    n integer NOT NULL DEFAULT 0,
    PRIMARY KEY (announcement_id, emoji)
  )`,
  `CREATE TABLE IF NOT EXISTS wishes (
    id text PRIMARY KEY,
    at bigint NOT NULL,
    to_name text NOT NULL,
    from_name text NOT NULL,
    message text NOT NULL,
    theme text NOT NULL DEFAULT 'marigold',
    city text NOT NULL DEFAULT '',
    ip text NOT NULL DEFAULT '',
    created_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS wishes_at ON wishes (at)`,
  `CREATE TABLE IF NOT EXISTS presence (
    room text NOT NULL,
    client_id text NOT NULL,
    hearts integer NOT NULL DEFAULT 0,
    last_seen bigint NOT NULL,
    PRIMARY KEY (room, client_id)
  )`,
  `CREATE TABLE IF NOT EXISTS enquiries (
    id text PRIMARY KEY,
    city text NOT NULL DEFAULT '',
    brand text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    interest text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'new',
    admin_note text NOT NULL DEFAULT '',
    created_at bigint NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sponsors (
    id text PRIMARY KEY,
    city text NOT NULL,
    brand text NOT NULL,
    color text NOT NULL DEFAULT '#ffab3d',
    starts_at bigint NOT NULL,
    ends_at bigint NOT NULL,
    price integer NOT NULL DEFAULT 0,
    note text NOT NULL DEFAULT '',
    created_at bigint NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sponsors_city_time ON sponsors (city, starts_at)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id text PRIMARY KEY,
    kind text NOT NULL,
    target text NOT NULL,
    reason text NOT NULL DEFAULT '',
    resolved boolean NOT NULL DEFAULT false,
    created_at bigint NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS audit (
    id bigserial PRIMARY KEY,
    at bigint NOT NULL,
    actor text NOT NULL,
    action text NOT NULL,
    target text NOT NULL DEFAULT '',
    detail text NOT NULL DEFAULT ''
  )`,
];

let runQuery = null;
let ready = null;

// Tests swap in an in-process Postgres through this.
export function useQuery(fn) {
  runQuery = fn;
  ready = null;
}

function connect() {
  if (runQuery) return runQuery;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  const sql = neon(url);
  runQuery = (text, params = []) => sql.query(text, params);
  return runQuery;
}

export function hasDatabase() {
  return Boolean(connect());
}

export async function q(text, params = []) {
  const run = connect();
  if (!run) {
    const err = new Error('The database is not connected yet. Add a Postgres database to the Vercel project.');
    err.status = 503;
    err.code = 'no_database';
    throw err;
  }
  if (!ready) {
    ready = (async () => {
      for (const stmt of SCHEMA) await run(stmt);
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  await ready;
  return run(text, params);
}

export async function audit(actor, action, target = '', detail = '') {
  try {
    await q('INSERT INTO audit (at, actor, action, target, detail) VALUES ($1,$2,$3,$4,$5)', [Date.now(), actor, action, target, String(detail).slice(0, 500)]);
  } catch {
    /* audit must never break a request */
  }
}
