import { defineConfig } from 'vitest/config';

// Self-contained config so vitest never walks up into the host app's vite.config (which pulls in Laravel-only plugins).
export default defineConfig({
  root: __dirname,
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/index.ts', 'src/types.ts'],
      thresholds: { statements: 85, branches: 78, functions: 85, lines: 85 },
    },
  },
});
