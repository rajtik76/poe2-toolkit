import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // The library surface. `cli.ts` is a thin `main()` that only wires the CDN
      // source to the file system, so it is exercised end to end, not unit tested.
      include: ['src/**'],
      exclude: ['src/cli.ts'],
      thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
    },
  },
});
