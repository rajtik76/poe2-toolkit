// Runs pathofexile-dat's table exporter against config.json in the current
// working directory. Spawned with cwd = the extract dir (setup.mjs's job) so its
// `tables/`, `files/` and `.cache/` output land there.
//
// Applies one schema correction first: the QuestStaticRewards column holding a
// quest's weapon-set passive-point grant is unnamed upstream
// (poe-tool-dev/dat-schema), so the stock exporter can't select it. Ported from
// exile2exile's tools/poe-data-extract/extract.mjs, which carries the same shim.
// Drop this once the column is named upstream.

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { SCHEMA_URL } from 'pathofexile-dat-schema';

const QUEST_WEAPON_PASSIVES_INDEX = 1;

function patchSchema(schema) {
  for (const table of schema.tables) {
    if (table.name === 'QuestStaticRewards') {
      const column = table.columns[QUEST_WEAPON_PASSIVES_INDEX];

      if (column && !column.name) {
        column.name = 'WeaponPassives';
      }
    }
  }
}

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input) === SCHEMA_URL) {
    const schema = await (await originalFetch(input, init)).json();
    patchSchema(schema);

    return new Response(JSON.stringify(schema), { headers: { 'content-type': 'application/json' } });
  }

  return originalFetch(input, init);
};

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve('pathofexile-dat/bundles.js'));

await import(pathToFileURL(join(dist, 'cli/run.js')).href);
