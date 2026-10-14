// Runs pathofexile-dat's table exporter against config.json in the cwd (the extract dir, set by setup.mjs).
//
// Applies schema corrections first: a few columns the extractors read are unnamed upstream (poe-tool-dev/dat-schema),
// namely the QuestStaticRewards weapon-set passive-point grant and PassiveSkills ApplyToArmour. Drop a correction once
// its column is named upstream.
//
// The stock exporter also tells PoE1 from PoE2 by patch prefix (only "4." counts), but GGG renumbered PoE2 builds
// (4.5.5.4 -> 0.5.5.4). This script only reads PoE2, so it pins both: the fetch hook rewrites PoE1 CDN URLs to the PoE2
// CDN, and the export runs with a PoE2 marker instead of through `cli/run.js`.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { SCHEMA_URL } from 'pathofexile-dat-schema';

const QUEST_WEAPON_PASSIVES_INDEX = 1;

const PASSIVE_APPLY_TO_ARMOUR_INDEX = 51;

const POE2 = 2;

function patchSchema(schema) {
  for (const table of schema.tables) {
    if (table.name === 'QuestStaticRewards') {
      const column = table.columns[QUEST_WEAPON_PASSIVES_INDEX];

      if (column && !column.name) {
        column.name = 'WeaponPassives';
      }
    }

    if (table.name === 'PassiveSkills' && table.validFor & POE2) {
      const column = table.columns[PASSIVE_APPLY_TO_ARMOUR_INDEX];

      if (column && !column.name && column.type === 'bool') {
        column.name = 'ApplyToArmour';
      }
    }
  }
}

const POE1_CDN = 'https://patch.poecdn.com/';
const POE2_CDN = 'https://patch-poe2.poecdn.com/';

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  if (String(input).startsWith(POE1_CDN)) {
    return originalFetch(POE2_CDN + String(input).slice(POE1_CDN.length), init);
  }

  if (String(input) === SCHEMA_URL) {
    const schema = await (await originalFetch(input, init)).json();
    patchSchema(schema);

    return new Response(JSON.stringify(schema), { headers: { 'content-type': 'application/json' } });
  }

  return originalFetch(input, init);
};

// The CLI modules are unexported: resolve them via an exported sibling subpath. Mirrors `cli/run.js` (CDN loader only).
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('pathofexile-dat/bundles.js')), 'cli');
const cliModule = (file) => import(pathToFileURL(join(cli, file)).href);

const loaders = await cliModule('bundle-loaders.js');
const { exportFiles } = await cliModule('export-files.js');
const { exportTables } = await cliModule('export-tables.js');

const config = JSON.parse(await readFile(join(process.cwd(), 'config.json'), 'utf-8'));

console.log('Loading bundles index...');
const loader = await loaders.FileLoader.create(
  new loaders.CachingBundleLoader(await loaders.CdnBundleLoader.create(join(process.cwd(), '.cache'), config.patch)),
);

const poe2Config = { ...config, steam: 'Path of Exile 2' };

await exportFiles(poe2Config, join(process.cwd(), 'files'), loader);
await exportTables(poe2Config, join(process.cwd(), 'tables'), loader);
