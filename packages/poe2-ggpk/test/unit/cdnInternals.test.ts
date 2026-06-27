import { describe, expect, it } from 'vitest';
import { validateDatInternals } from '../../src/cdnSource.js';

// pathofexile-dat's internal module types aren't exported; derive the parameter
// shapes from the function so the stubs stay honest without naming them.
type Loaders = Parameters<typeof validateDatInternals>[0];
type Layout = Parameters<typeof validateDatInternals>[1];

// Stand-ins for pathofexile-dat's internal modules: only the exports the toolkit
// calls need to be present and callable (return values are never used here).
const goodLoaders = {
  CdnBundleLoader: { create: async () => ({}) },
  FileLoader: { create: async () => ({}) },
} as unknown as Loaders;
const goodLayout = { parseFile: () => [] } as unknown as Layout;

describe('validateDatInternals', () => {
  it('returns the modules unchanged when every expected export is present', () => {
    const result = validateDatInternals(goodLoaders, goodLayout, '15.1.0');
    expect(result.loaders).toBe(goodLoaders);
    expect(result.layout).toBe(goodLayout);
  });

  it('throws an actionable error naming the version when CdnBundleLoader is gone', () => {
    // Simulates a pathofexile-dat release that renamed/removed the loader export.
    const broken = { FileLoader: { create: async () => ({}) } } as unknown as Loaders;
    expect(() => validateDatInternals(broken, goodLayout, '16.0.0')).toThrow(
      /pathofexile-dat@16\.0\.0.*CdnBundleLoader\/FileLoader/s,
    );
  });

  it('throws when FileLoader.create is no longer a function', () => {
    const broken = { CdnBundleLoader: { create: async () => ({}) }, FileLoader: {} } as unknown as Loaders;
    expect(() => validateDatInternals(broken, goodLayout, '15.2.0')).toThrow(/bundle-loaders\.js/);
  });

  it('throws naming the sprite layout module when parseFile is gone', () => {
    const broken = {} as unknown as Layout;
    expect(() => validateDatInternals(goodLoaders, broken, '15.1.0')).toThrow(/parseFile.*sprites\/layout-parser\.js/s);
  });

  it('points the user at pinning the dependency as the fix', () => {
    const broken = {} as unknown as Loaders;
    expect(() => validateDatInternals(broken, goodLayout, 'unknown')).toThrow(/Pin pathofexile-dat/);
  });
});
