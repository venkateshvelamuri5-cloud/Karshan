import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const pages = ['index', 'clock', 'create', 'wish', 'admin'];

// Mirror the vercel.json rewrites so clean URLs work in `npm run dev`.
const devRewrites = {
  name: 'karshan-dev-rewrites',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?');
      let to = null;
      if (/^\/w\/[a-z0-9-]+\/?$/.test(path)) to = '/wish.html';
      else if (/^\/(vizag|vijayawada)\/?$/.test(path)) to = '/clock.html';
      else if (/^\/(create|admin|clock|wish)\/?$/.test(path)) to = path.replace(/\/$/, '') + '.html';
      if (to) req.url = to + (query ? '?' + query : '');
      next();
    });
  },
};

export default defineConfig({
  plugins: [devRewrites],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) },
      input: Object.fromEntries(pages.map((p) => [p, resolve(import.meta.dirname, `${p}.html`)])),
    },
  },
  server: {
    // Run `vercel dev` for the API, or point this proxy at a deployed preview.
    proxy: process.env.API_ORIGIN ? { '/api': { target: process.env.API_ORIGIN, changeOrigin: true } } : undefined,
  },
});
