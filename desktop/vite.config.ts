import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      // Multi-page build: dashboard-loading.html (06-08, DASH-01's sandboxed
      // dashboard interstitial) is a second, wholly static entry alongside
      // the app's index.html -- it has no <script>/<link> tags of its own,
      // so vite emits it to dist/renderer/dashboard-loading.html unchanged
      // aside from HTML minification, never pulled into the React bundle.
      input: {
        index: path.resolve(__dirname, 'src/renderer/index.html'),
        'dashboard-loading': path.resolve(__dirname, 'src/renderer/dashboard-loading.html'),
      },
    },
  },
});
