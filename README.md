# Karshan

A live clock for the city, starting with Visakhapatnam.

- **Businesses** light a lantern on the city clock for an opening, offer, event or launch. It appears on the dial at its time and bursts onto the face for everyone watching when it goes live, along with the offer code and directions.
- **Brands** sponsor hours on the dial.
- **People** send private wishes that unlock at the exact minute, so you can be the first to wish someone even if you fall asleep. The message is locked on the server until then.
- **You** run it all from the admin console at `/admin`: approvals, sponsorship calendar, enquiries, reports and an activity log.

## Pages

| URL | What it is |
| --- | --- |
| `/` | Landing page: a 3D scroll story over the Bay of Bengal |
| `/vizag` | The live city clock (one per city: `/vijayawada` and so on) |
| `/create` | Announce in the city, write a private wish, or ask about sponsoring (`/create#wish`, `/create#sponsor`) |
| `/w/<id>` | A private wish: countdown, a lantern for each person waiting, and the reveal. `/w/demo` is a 20-second preview |
| `/admin` | Admin console |

## Run it on your computer

Needs Node.js 20 or newer.

```bash
npm install
npm run local
```

Open http://localhost:8787. This runs the whole app with an in-memory database, so nothing is saved when you stop it. The admin password is `local-admin`.

For front-end work with hot reload, `npm run dev` serves the pages; point it at a deployed API with `API_ORIGIN=https://your-app.vercel.app npm run dev`.

Run the API tests with `npm test`.

## Deploy on Vercel

1. Import this repository in Vercel. The settings come from `vercel.json`, so keep the defaults.
2. In the project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project. This adds `DATABASE_URL`. The tables are created automatically on first use.
3. In **Settings → Environment Variables**, add `ADMIN_PASSWORD` (long and private). Optionally add `ADMIN_SECRET`, a random string used to sign admin sessions.
4. Redeploy. Visit `/admin`, sign in, and approve the first announcement.

Until a database is connected, the public pages still load and the city clock shows clearly-labelled sample lanterns.

## Adding a city

1. Add it to `shared/cities.js` with its areas, and set `enabled: true`.
2. Add its slug to the city rewrite in `vercel.json` (`/:city(vizag|vijayawada|newcity)`) and in `vite.config.js` and `scripts/local-server.js`.

Cities with `enabled: false` show a "coming soon" page.

## How it is built

- **Front end:** Vite, plain JavaScript modules and three.js (`src/`). One fixed WebGL canvas sits behind each public page.
  - `src/landing.js`: the bay, the floating clock and the five scroll chapters
  - `src/clock.js`: the city dial, lanterns, live reveals and reactions
  - `src/wish.js`: the private wish countdown and reveal
  - `src/create.js`: the three forms
  - `src/admin.js`: the admin console
  - `src/lib/kit.js`: shared 3D pieces (sky, sea, lanterns, petals, text written in light)
- **API:** one Vercel function (`api/index.js` → `lib/router.js`) serves every `/api/*` route.
- **Database:** Postgres through Neon's serverless driver (`lib/db.js`). Times are stored as milliseconds and shown in IST.
- **Live features:** "people watching", lanterns in a wish room and reactions use short polling, so there is no extra realtime service to pay for.
- **Admin auth:** a password from `ADMIN_PASSWORD`, then a signed, HTTP-only session cookie.

### Privacy rules built in

- A wish's message is never sent to a browser before its minute (`GET /api/wishes/:id` returns it only once open).
- Admins see counts of private wishes, not their messages. A message appears in the console only if someone reports it.
- Offer codes are hidden until the announcement goes live.

## Next steps

- Payments with Razorpay (UPI and cards) for announcements, wishes and sponsorships
- WhatsApp or email alerts to admins when something is waiting for approval
- Phone OTP verification for businesses
- Telugu translations
- City partner accounts that only see their own city
