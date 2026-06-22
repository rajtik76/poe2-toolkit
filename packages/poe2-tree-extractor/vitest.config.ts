import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's
// vite.config (which pulls in Laravel-only plugins). Keeps the package
// extractable: nothing here references anything outside this directory.
//
// The characterization suite regenerates artifacts from a local GGPK extract
// and can take a minute, so the default per-test timeout is raised here.
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
