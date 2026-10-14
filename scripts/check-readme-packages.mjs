#!/usr/bin/env node
// Fails loud if a package under packages/* has no row in the root README's Packages table. Only checks that a link exists,
// the table's wording is intentionally shorter than package.json's.
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
