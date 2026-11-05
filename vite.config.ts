import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In dev, /api is forwarded to `npm run dev:api` (wrangler on :8788). If that isn't running the app falls back to demo mode.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'http://localhost:8788', changeOrigin: false } } },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
