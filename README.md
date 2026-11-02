# Karshan

Vizag's live clock for celebrations and offers.

- **Celebrate: birthday walls.** Make a wall for someone and share the link in your group. Anyone with the link adds a wish and a photo. Everything stays sealed on the server until the minute you pick; then fireworks burst and each photo and wish appears under the lights, one after another.
- **Promote: businesses.** Any time-based moment (sale, offer, happy hour, launch, event, opening) glows on the city clock at its time. When it starts, fireworks go off in its colour and the offer code appears for everyone watching.
- **Brands** sponsor hours: their colour on the rim of the clock.
- **You** run it all from the admin console at `/admin`: approvals, sponsorship calendar, enquiries, reports and an activity log.

## Pages

| URL | What it is |
| --- | --- |
| `/` | Landing page: a 3D scroll story over the Bay of Bengal |
| `/vizag` | The live city clock (one per city: `/vijayawada` and so on) |
| `/create` | Make a birthday wall, promote a business (`/create#promote`) or ask about sponsoring (`/create#sponsor`) |
| `/b/<id>` | A birthday wall: add wishes and photos, countdown, then the fireworks show. `/b/demo` is a 20-second demo |
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

- **Front end:** React with React Three Fiber, drei, postprocessing (bloom) and GSAP ScrollTrigger, built with Vite. One fixed 3D canvas sits behind each public page.
  - `src/pages/landing.jsx`: the bay at dusk, the floating clock, scroll-driven camera, tap-to-launch fireworks
  - `src/pages/clock.jsx`: the readable 12-hour city clock, glowing moments on the rim, live fireworks, reactions
  - `src/pages/wall.jsx`: the birthday wall: signer lanterns, photo upload, sealed countdown, the fireworks show and gallery
  - `src/pages/create.jsx`: the three forms
  - `src/admin.js`: the admin console (plain JavaScript)
  - `src/three/`: shared 3D pieces: `Clock3D`, GPU `Fireworks` (thousands of sparks computed in a shader), `WallShow` (photo cards), `World` (sky, sea, coast, lanterns, bloom)
- **API:** one Vercel function (`api/index.js` → `lib/router.js`) serves every `/api/*` route.
- **Database:** Postgres through Neon's serverless driver (`lib/db.js`). Times are stored as milliseconds and shown in IST.
- **Photos:** resized in the browser (max 1080px JPEG, about 150 KB) and stored in Postgres, served from `/api/photos/<id>` with long caching. Move them to Vercel Blob once there are thousands.
- **Live features:** "people watching", lanterns in a wish room and reactions use short polling, so there is no extra realtime service to pay for.
- **Admin auth:** a password from `ADMIN_PASSWORD`, then a signed, HTTP-only session cookie.

### Privacy rules built in

- A wall's wishes and photos are never sent to a browser before the reveal, except to the wall's creator (who holds a private manage link) so they can hide anything unkind.
- Admins see counts of walls and wishes, not their content. A wish appears in the console only if someone reports it.
- Offer codes are hidden until the announcement goes live.

## Next steps

- Payments with Razorpay (UPI and cards) for announcements, wishes and sponsorships
- WhatsApp or email alerts to admins when something is waiting for approval
- Phone OTP verification for businesses
- Telugu translations
- City partner accounts that only see their own city
