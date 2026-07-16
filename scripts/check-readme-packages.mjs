#!/usr/bin/env node
// Fail loud if a package under packages/* has no row in the root README's
// Packages table. Catches the exact gap that let mod-extractor go unlisted:
// a new package added without a README update. Descriptions are intentionally
// paraphrased shorter in the table than in package.json, so this only checks
// that a link to the package exists - not that the wording matches.
import { readFileSync, readdirSync } from 'node:fs';

const rootUrl = new URL('..', import.meta.url);
const readme = readFileSync(new URL('README.md', rootUrl), 'utf8');
const packagesUrl = new URL('packages/', rootUrl);

const dirs = readdirSync(packagesUrl, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const missing = dirs.filter((dir) => !readme.includes(`](./packages/${dir})`));

if (missing.length > 0) {
  console.error('README Packages table is missing:\n');
  console.error(missing.map((dir) => `  packages/${dir}`).join('\n'));
  console.error('\nAdd a row linking to it in the "## Packages" table in README.md.');
  process.exit(1);
}

console.log(`README Packages table links all ${dirs.length} package(s).`);
