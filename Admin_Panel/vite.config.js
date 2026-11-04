import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // `npm run dev`: the browser talks only to localhost:5173 and Vite forwards /api and /media to the
  // backend, so no CORS setup is needed on the server for local development.
  const target = env.DEV_PROXY_TARGET || 'https://adda.skillinnovex.in';
  const proxy = { target, changeOrigin: true, secure: true };
  return {
  plugins: [react()],
  server: { port: 5174, strictPort: true, host: 'localhost', proxy: { '/api': proxy, '/media': proxy, '/health': proxy } },
  preview: { port: 4174, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/unit/setup.js'],
    include: ['tests/unit/**/*.test.{js,jsx}'],
    css: false,
  },
  };
});
