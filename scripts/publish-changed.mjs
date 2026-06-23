#!/usr/bin/env node
// Publish to npm every package whose current version is not yet on the registry,
// in dependency order. Already-published versions are skipped, so a release that
// only bumped some packages publishes only those — no "version already exists"
// failures. Run by the Release workflow; assumes `npm run build` already ran and
// that npm auth is configured (NODE_AUTH_TOKEN via setup-node's .npmrc).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Dependency order: a package is published only after everything it depends on.
const ORDER = [
  'poe2-ggpk', // no internal deps
  'poe2-tree-core', // no internal deps
  'poe2-tree-react', // -> tree-core
  'poe2-tree-extractor', // -> ggpk
  'poe2-item-extractor', // -> ggpk
  'poe2-gem-extractor', // -> ggpk
];

/** The version of `name` already on npm, or null if that exact version is absent. */
function publishedVersion(name, version) {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return out.toString().trim() || null;
  } catch {
    // `npm view` exits non-zero when the version (or package) does not exist.
    return null;
  }
}

let published = 0;

for (const dir of ORDER) {
  const manifestUrl = new URL(`../packages/${dir}/package.json`, import.meta.url);
  const { name, version } = JSON.parse(readFileSync(manifestUrl, 'utf8'));

  if (publishedVersion(name, version) === version) {
    console.log(`skip   ${name}@${version} (already on npm)`);
    continue;
  }

  console.log(`publish ${name}@${version}`);
  execFileSync('npm', ['publish', '-w', `packages/${dir}`], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
  });
  published++;
}

console.log(published === 0 ? 'Nothing to publish — all versions current.' : `Published ${published} package(s).`);
