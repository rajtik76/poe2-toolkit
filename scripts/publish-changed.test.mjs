import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function runRelease(t, scenario = {}, args = []) {
  const dir = mkdtempSync(join(tmpdir(), 'poe2-release-'));
  const callsFile = join(dir, 'calls.jsonl');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(callsFile, '');
  // Fake only the npm executable. No registry access, credentials, or uploads.
  writeFileSync(join(dir, 'npm'), String.raw`#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
const scenario = JSON.parse(process.env.RELEASE_TEST_SCENARIO);
const file = process.env.RELEASE_TEST_CALLS;
const previous = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
appendFileSync(file, JSON.stringify(args) + '\n');
if (args[0] === 'view') {
  const spec = args[1];
  const at = spec.lastIndexOf('@');
  const name = spec.slice(0, at);
  const version = spec.slice(at + 1);
  const slug = name.slice(name.indexOf('/') + 1);
  const published = scenario.allPublished || (scenario.published || []).includes(slug)
    || (scenario.concurrent && previous.some(call => call[0] === 'publish' && call[1].endsWith('poe2-' + slug)));
  if (scenario.lookupError || !published) {
    console.log(JSON.stringify({ error: { code: scenario.lookupError || 'E404' } }));
    process.exit(1);
  }
  console.log(JSON.stringify(scenario.scalarVersion ? version : [version]));
} else if (args[0] === 'publish') {
  if (scenario.publishError) {
    console.error('npm error code ' + scenario.publishError);
    if (scenario.publishMessage) {
      console.error('npm error ' + scenario.publishMessage);
    }
    process.exit(1);
  }
} else {
  console.error('Unexpected npm command: ' + JSON.stringify(args));
  process.exit(1);
}
`, { mode: 0o755 });

  const result = spawnSync(process.execPath, ['scripts/publish-changed.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RELEASE_TEST_SCENARIO: JSON.stringify(scenario),
      RELEASE_TEST_CALLS: callsFile,
    },
  });
  const calls = readFileSync(callsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  return { ...result, calls, publishes: calls.filter(call => call[0] === 'publish') };
}

test('publishes directly in dependency order and skips existing versions', (t) => {
  const result = runRelease(t, { published: ['tree-react', 'item-extractor'] });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.publishes.map(call => call[1]), [
    './packages/poe2-ggpk',
    './packages/poe2-tree-core',
    './packages/poe2-tree-extractor',
    './packages/poe2-gem-extractor',
    './packages/poe2-rune-extractor',
    './packages/poe2-mod-extractor',
  ]);
  assert.ok(result.publishes.every(call => call.includes('public') && call.includes('https://registry.npmjs.org')));
  assert.match(result.stdout, /Published 6 package\(s\)/);
});

test('npm 12 version arrays skip already published versions', (t) => {
  const result = runRelease(t, { allPublished: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.publishes.length, 0);
});

test('older npm scalar versions also skip already published versions', (t) => {
  const result = runRelease(t, { allPublished: true, scalarVersion: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.publishes.length, 0);
});

test('a registry failure is not mistaken for an unpublished version', (t) => {
  const result = runRelease(t, { lookupError: 'E503' });
  assert.notEqual(result.status, 0);
  assert.equal(result.publishes.length, 0);
  assert.match(result.stderr, /Could not check @poe2-toolkit\/ggpk@/);
});

test('authentication failures stop the release', (t) => {
  const result = runRelease(t, { publishError: 'E401' });
  assert.notEqual(result.status, 0);
  assert.equal(result.publishes.length, 1);
  assert.match(result.stderr, /Allow npm publish enabled/);
});

test('a concurrent publish is safely skipped after checking the registry', (t) => {
  const result = runRelease(t, { publishError: 'E403', concurrent: true }, ['--package', 'ggpk']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.publishes.length, 1);
  assert.match(result.stdout, /published concurrently/);
});

test('a concurrent publish the registry does not show yet is still skipped', (t) => {
  const result = runRelease(t, {
    publishError: 'E403',
    publishMessage: '403 Forbidden - You cannot publish over the previously published versions: 1.2.0.',
  }, ['--package', 'ggpk']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.publishes.length, 1);
  assert.match(result.stdout, /published concurrently/);
});

test('a single-package dry run never requests a real publish', (t) => {
  const result = runRelease(t, {}, ['--package', 'ggpk', '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.publishes.length, 1);
  assert.equal(result.publishes[0][1], './packages/poe2-ggpk');
  assert.ok(result.publishes[0].includes('--dry-run'));
  assert.match(result.stdout, /Validated 1 package\(s\)/);
});

test('an unknown package is rejected before any npm command', (t) => {
  const result = runRelease(t, {}, ['--package', 'unknown']);
  assert.notEqual(result.status, 0);
  assert.equal(result.calls.length, 0);
});
