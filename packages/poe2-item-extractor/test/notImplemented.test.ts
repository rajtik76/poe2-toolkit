import { describe, expect, it } from 'vitest';

import { buildItems } from '../src/index';

describe('@poe2-item/extractor', () => {
  it('throws until the item extractor is implemented', async () => {
    await expect(buildItems(undefined as never)).rejects.toThrow('not implemented yet');
  });
});
