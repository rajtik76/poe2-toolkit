import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's
// vite.config. Keeps the package extractable: nothing here references anything
// outside this directory.
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      // The library surface, minus type-only modules and the re-export barrel.
      // `cdnSource.ts` and `bc7.ts` are mostly covered by the gated integration
      // tests (real extract / real portraits), so the CI floor sits below them.
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/source.ts', 'src/image/types.ts'],
      thresholds: { statements: 65, branches: 80, functions: 75, lines: 65 },
    },
  },
});
