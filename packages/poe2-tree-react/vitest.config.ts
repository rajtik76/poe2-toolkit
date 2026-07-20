import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's
// vite.config (which pulls in Laravel-only plugins). Keeps the package
// extractable: nothing here references anything outside this directory.
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      // The visual decisions and pan/zoom arithmetic live in sceneStyle.ts and
      // interaction.ts (both fully covered); TreeView.tsx is the pixi execution
      // layer, exercised by the host app's browser snapshot tests instead, so
      // the line floor sits low while branches/functions stay strict.
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/types.ts', 'src/resources.ts'],
      thresholds: { statements: 25, branches: 90, functions: 90, lines: 25 },
    },
  },
});
