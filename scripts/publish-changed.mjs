#!/usr/bin/env node
// Publishes every package whose current version is not yet on npm, in dependency order. Run by the Release workflow after
// `npm run build`; assumes npm trusted publishing (OIDC) is set up for each package.
import { execFileSync, spawnSync } from 'node:child_process';
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

function publishedVersion(name, version) {
  try {
    const out = execFileSync('npm', ['view', `${name}@${version}`, 'version', '--json', '--registry', REGISTRY], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // npm 12 returns a JSON array even for an exact version, older CLIs a scalar.
    const result = JSON.parse(out.toString());
    const versions = Array.isArray(result) ? result : [result];

    if (!versions.every(item => typeof item === 'string')) {
      throw new Error(`Unexpected npm version response for ${name}@${version}`);
    }

    return versions.includes(version) ? version : null;
  } catch (error) {
    // Only an absent package/version means publish. Auth or registry outages must fail.
    let code;

    try {
      code = JSON.parse(error.stdout?.toString() || '{}').error?.code;
    } catch {
      // not npm's JSON error: a real lookup failure
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

  const args = ['publish', `./packages/${dir}`, '--access', 'public', '--registry', REGISTRY];

  if (values['dry-run']) {
    args.push('--dry-run');
  }

  // stderr is captured (and echoed) so a failed publish can be told apart below.
  const result = spawnSync('npm', args, {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: ['ignore', 'inherit', 'pipe'],
  });
  const stderr = result.stderr?.toString() ?? '';
  process.stderr.write(stderr);

  if (result.status === 0) {
    published++;
    continue;
  }

  // The check above is best-effort: a sibling run can publish this version in between, and npm answers with a fatal E403.
  // That proves the version exists (a re-query may still 404, the read side lags), so skip rather than fail the release.
  if (/cannot publish over the previously published version/i.test(stderr) || publishedVersion(name, version) === version) {
    console.log(`skip   ${name}@${version} (published concurrently)`);
    continue;
  }

  console.error(`If npm reports an OIDC authentication error, verify the saved Trusted Publisher at https://www.npmjs.com/package/${name}/access: owner rajtik76, repository poe2-toolkit, workflow release.yml, empty environment, Allow npm publish enabled.`);

  throw new Error(`npm publish failed for ${name}@${version}.`, { cause: result.error });
}

console.log(published === 0 ? 'Nothing to publish - all versions current.' : `${values['dry-run'] ? 'Validated' : 'Published'} ${published} package(s).`);
