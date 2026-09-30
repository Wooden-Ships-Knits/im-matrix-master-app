import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Vite refuses requests for hostnames it does not know, so a
    // trycloudflare URL would be blocked outright. Allowing that one domain
    // lets the dev server be tunnelled for a quick look by someone else.
    allowedHosts: ['.trycloudflare.com'],
    // dist/ sits inside the project, so the dev server was watching its own
    // build output: every `npm run build` rewrote dist/index.html and vite
    // answered with a full page reload in whatever browser was open.
    watch: { ignored: ['**/dist/**'] },
    // In the dev container the backend is a sibling service, not localhost.
    // VITE_API_TARGET is set there; on a laptop running `npm run dev` the
    // default still points at the published port.
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:8085',
      '/uploads': process.env.VITE_API_TARGET || 'http://localhost:8085',
    },
  },
  build: { outDir: 'dist' },
});
