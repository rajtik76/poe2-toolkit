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
    coverage: {
      provider: 'v8',
      // The build pipeline (buildTree/buildGraphics/buildCentre) regenerates
      // from a real extract and is covered by the gated characterization suite,
      // so the CI floor reflects only what synthetic inputs can reach (psg,
      // atlas). Raise it as more of the pipeline gains fixture-free tests.
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/cli.ts'],
      thresholds: { statements: 25, branches: 80, functions: 55, lines: 25 },
    },
  },
});
