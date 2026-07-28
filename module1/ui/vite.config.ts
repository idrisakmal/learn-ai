import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config lives here rather than in a separate vitest.config.ts (unlike
// the service) because the tests need the same React plugin as the dev server.
export default defineConfig({
  plugins: [react()],
  server: {
    // Vite's default. Deliberately not 3000, and not 3999 — that is the service.
    port: 5173,
    proxy: {
      // The UI fetches same-origin `/api/v1/...` and this forwards it to the
      // service, so the service needs no CORS middleware. See
      // context/ARCHITECTURE.md — "Vite dev proxy over CORS".
      '/api': { target: 'http://localhost:3999', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});
