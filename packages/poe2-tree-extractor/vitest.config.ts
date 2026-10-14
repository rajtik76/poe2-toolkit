import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's vite.config (which pulls in Laravel-only plugins).
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/cli.ts'],
      thresholds: { statements: 25, branches: 80, functions: 55, lines: 25 },
    },
  },
});
