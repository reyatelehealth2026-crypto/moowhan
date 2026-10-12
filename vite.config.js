import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    chunkSizeWarningLimit: 700, // xlsx alone is ~600 kB but it is loaded lazily
    rollupOptions: {
      output: {
        // long-lived vendor chunks; xlsx/jszip are only fetched on first file read
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('node_modules/xlsx')) return 'xlsx';
          if (id.includes('node_modules/jszip')) return 'jszip';
          return undefined;
        },
      },
    },
  },
  // Test speed (spec target: npm test < 15 s). Worker start-up + module graph per file dominated the run, so the
  // pure-Node tests share workers (isolate:false) while the jsdom/UI files keep a clean worker each.
  // Checked with --sequence.shuffle (3 runs, all green): no Node test relies on module state left by another file.
  // A test that needs a clean module graph belongs in the 'ui' project (*.test.jsx) below.
  test: {
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'node', include: ['tests/**/*.test.js'], pool: 'threads', isolate: false } },
      { extends: true, test: { name: 'ui', include: ['tests/**/*.test.jsx'], pool: 'forks', isolate: true } },
    ],
  },
});
