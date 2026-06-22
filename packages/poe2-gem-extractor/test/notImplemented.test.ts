import { describe, expect, it } from 'vitest';

import { buildGems } from '../src/index';

describe('@poe2-gem/extractor', () => {
  it('throws until the gem extractor is implemented', async () => {
    await expect(buildGems(undefined as never)).rejects.toThrow('not implemented yet');
  });
});
