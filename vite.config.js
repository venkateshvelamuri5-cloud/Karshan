import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const pages = ['index', 'clock', 'create', 'wall', 'admin'];

// Mirror the vercel.json rewrites so clean URLs work in `npm run dev`.
const devRewrites = {
  name: 'karshan-dev-rewrites',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const [path, query = ''] = req.url.split('?');
      let to = null;
      if (/^\/[bw]\/[a-z0-9-]+\/?$/.test(path)) to = '/wall.html';
      else if (/^\/(vizag|vijayawada)\/?$/.test(path)) to = '/clock.html';
      else if (/^\/(create|admin|clock|wall)\/?$/.test(path)) to = path.replace(/\/$/, '') + '.html';
      if (to) req.url = to + (query ? '?' + query : '');
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), devRewrites],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/three/')) return 'three';
          if (/node_modules\/(@react-three|postprocessing|three-stdlib|troika|maath|camera-controls)/.test(id)) return 'r3f';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return undefined;
        },
      },
      input: Object.fromEntries(pages.map((p) => [p, resolve(import.meta.dirname, `${p}.html`)])),
    },
  },
  server: {
    // Run `vercel dev` for the API, or point this proxy at a deployed preview.
    proxy: process.env.API_ORIGIN ? { '/api': { target: process.env.API_ORIGIN, changeOrigin: true } } : undefined,
  },
});
