import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

function plannerOfflineShell(): Plugin {
  return {
    name: 'planner-offline-shell',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_output, bundle) {
        const assets = Object.keys(bundle).filter(name => name.startsWith('assets/')).sort();
        const entry = bundle['index.html'];
        if (entry?.type !== 'asset') throw new Error('Missing Planner HTML entry.');
        const worker = readFileSync(new URL('./service-worker.mjs', import.meta.url), 'utf8');
        const version = createHash('sha256').update(worker).update(entry.source).update(JSON.stringify(assets)).digest('hex');
        this.emitFile({
          type: 'asset', fileName: 'planner-worker.js',
          source: worker.replace('__PLANNER_VERSION__', JSON.stringify(version))
            .replace('__PLANNER_ASSETS__', JSON.stringify([...assets, 'planner-192.png', 'planner-512.png', 'planner.webmanifest'])),
        });
      },
    },
  };
}
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), plannerOfflineShell()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/health': 'http://localhost:3001',
    },
  },
})
