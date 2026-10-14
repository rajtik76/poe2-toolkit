import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's vite.config.
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      // The library surface, minus type-only modules and the re-export barrel.
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/source.ts', 'src/image/types.ts'],
      thresholds: { statements: 65, branches: 80, functions: 75, lines: 65 },
    },
  },
});
