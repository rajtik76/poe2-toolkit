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
      // interaction.ts (both fully covered). TreeView.tsx is the Pixi execution
      // layer: TreeView.test.tsx covers its render-on-demand lifecycle (mocked
      // Pixi + jsdom), but the bulk of it — pointer interaction, scene-graph
      // building, overlay drawing — is exercised by the host app's browser
      // snapshot tests instead, so it's excluded from the coverage bar rather
      // than dragging the threshold down for the rest of the package.
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/types.ts', 'src/resources.ts', 'src/TreeView.tsx'],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
