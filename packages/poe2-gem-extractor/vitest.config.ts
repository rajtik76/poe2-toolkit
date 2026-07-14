import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // The library surface. `cli.ts` is a thin `main()` that only wires the CDN
      // source to the file system, so it is exercised end to end, not unit tested.
      include: ['src/**'],
      exclude: ['src/cli.ts', 'src/index.ts'],
      thresholds: { statements: 97, branches: 75, functions: 100, lines: 97 },
    },
  },
});
