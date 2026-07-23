import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // Sandbox port publishing requires binding to eth0, not just localhost.
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
