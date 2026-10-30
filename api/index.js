import { handle } from '../lib/router.js';

// One function serves every /api route (see the rewrite in vercel.json),
// which keeps the project inside the Hobby plan's function limit.
export default function handler(req, res) {
  return handle(req, res);
}
