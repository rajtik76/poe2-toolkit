import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's vite.config (which pulls in Laravel-only plugins).
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      // The visual decisions and pan/zoom arithmetic live in sceneStyle.ts and interaction.ts (both fully covered).
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/types.ts', 'src/resources.ts', 'src/TreeView.tsx'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
