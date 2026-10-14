#!/usr/bin/env node
// Publish on npm every package whose current version is not yet on the registry,
// in dependency order. Already-published versions are skipped, so a release that
// only bumped some packages publishes only those. Run by the Release workflow;
// assumes `npm run build` already ran and npm trusted publishing (OIDC) is saved
// for each package with Allow npm publish enabled.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REGISTRY = 'https://registry.npmjs.org';
const { values } = parseArgs({
  options: {
    package: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

// Dependency order: a package is published only after everything it depends on.
const ORDER = [
  'poe2-ggpk', // no internal deps
  'poe2-tree-core', // no internal deps
  'poe2-tree-react', // -> tree-core
  'poe2-tree-extractor', // -> ggpk
  'poe2-item-extractor', // -> ggpk
  'poe2-gem-extractor', // -> ggpk
  'poe2-rune-extractor', // -> ggpk
  'poe2-mod-extractor', // -> ggpk
];

const selected = values.package && values.package !== 'all' ? `poe2-${values.package}` : null;

if (selected && !ORDER.includes(selected)) {
  throw new Error(`Unknown release package: ${values.package}`);
}

/** The version of `name` already on npm, or null if that exact version is absent. */
function publishedVersion(name, version) {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version', '--json', '--registry', REGISTRY], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return JSON.parse(out.toString());
  } catch (error) {
    // Only an absent package/version means it needs publishing. Authentication
    // or registry outages must fail instead of being treated as new versions.
    let code;

    try {
      code = JSON.parse(error.stdout?.toString() || '{}').error?.code;
    } catch {
      // A response that is not npm's JSON error remains a real lookup failure.
    }

    if (code === 'E404') {
      return null;
    }

    throw new Error(`Could not check ${name}@${version} on npm.`, { cause: error });
  }
}

let published = 0;

for (const dir of ORDER) {
  if (selected && dir !== selected) {
    continue;
  }

  const manifestUrl = new URL(`../packages/${dir}/package.json`, import.meta.url);
  const { name, version } = JSON.parse(readFileSync(manifestUrl, 'utf8'));

  if (publishedVersion(name, version) === version) {
    console.log(`skip   ${name}@${version} (already on npm)`);
    continue;
  }

  console.log(`${values['dry-run'] ? 'dry-run' : 'publish'} ${name}@${version}`);

  try {
    const args = ['publish', `./packages/${dir}`, '--access', 'public', '--registry', REGISTRY];

    if (values['dry-run']) {
      args.push('--dry-run');
    }

    execFileSync('npm', args, {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      stdio: 'inherit',
    });
    published++;
  } catch (error) {
    // The check above is best-effort: a sibling release run (or a manual re-run)
    // can publish this exact version between the check and this publish, and npm
    // answers that with a fatal E403 "cannot publish over previously published
    // version". Re-query the registry - if the version is now there the publish
    // is effectively done, so treat it as a skip rather than failing the whole
    // release. Anything else is a real error and rethrows.
    if (publishedVersion(name, version) === version) {
      console.log(`skip   ${name}@${version} (published concurrently)`);
      continue;
    }

    console.error(`If npm reports an OIDC authentication error, verify the saved Trusted Publisher at https://www.npmjs.com/package/${name}/access: owner rajtik76, repository poe2-toolkit, workflow release.yml, empty environment, Allow npm publish enabled.`);
    throw error;
  }
}

console.log(published === 0 ? 'Nothing to publish - all versions current.' : `${values['dry-run'] ? 'Validated' : 'Published'} ${published} package(s).`);
