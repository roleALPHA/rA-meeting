import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closure, merge, renderIndex, renderSbom, violations } from './licenses.mjs';

/** A lockfile trimmed to what the script reads. */
const lock = {
  packages: {
    '': {
      dependencies: { app: '^1.0.0', '@microsoft/sp-core-library': '1.0.0' },
      optionalDependencies: { 'not-installed': '^1.0.0' },
    },
    'node_modules/app': { version: '1.0.0', license: 'MIT', dependencies: { shared: '^2.0.0', nested: '^1.0.0' } },
    'node_modules/app/node_modules/nested': { version: '1.1.0', license: 'ISC', dependencies: { shared: '^2.0.0' } },
    'node_modules/shared': { version: '2.0.0', license: 'BSD-3-Clause' },
    'node_modules/@microsoft/sp-core-library': { version: '1.0.0', license: 'https://aka.ms/spfx/license' },
    'node_modules/dev-only': { version: '9.9.9', license: 'GPL-3.0-only', dev: true },
  },
};

const hostProvided = name => name.startsWith('@microsoft/sp-');

test('walks the production closure through nested node_modules, once per installed copy', () => {
  const rows = closure(lock, { hostProvided });
  assert.deepEqual(rows.map(r => r.path).sort(), [
    'node_modules/app',
    'node_modules/app/node_modules/nested',
    'node_modules/shared',
  ]);
});

test('leaves out packages SharePoint provides at runtime and dev dependencies', () => {
  const names = closure(lock, { hostProvided }).map(r => r.name);
  assert.ok(!names.includes('@microsoft/sp-core-library'));
  assert.ok(!names.includes('dev-only'));
});

test('an optional dependency that is not installed is skipped, a missing required one is an error', () => {
  const broken = structuredClone(lock);
  delete broken.packages['node_modules/shared'];
  assert.throws(() => closure(broken, { hostProvided }), /shared/);
});

test('paths of a nested workspace are prefixed, so notices can find the installed files', () => {
  const rows = closure(lock, { dir: 'spfx', hostProvided });
  assert.ok(rows.every(r => r.path.startsWith('spfx/node_modules/')));
});

test('merges roots to one row per name and licence, sorted by licence then name', () => {
  const rows = merge([
    [{ name: 'b', version: '1.0.0', license: 'MIT', path: 'node_modules/b' }],
    [
      { name: 'b', version: '2.0.0', license: 'MIT', path: 'spfx/node_modules/b' },
      { name: 'a', version: '1.0.0', license: 'ISC', path: 'spfx/node_modules/a' },
    ],
  ]);
  assert.deepEqual(
    rows.map(r => [r.name, r.versions]),
    [
      ['a', ['1.0.0']],
      ['b', ['1.0.0', '2.0.0']],
    ],
  );
});

test('passes permissive licences and names why strong copyleft cannot ship', () => {
  assert.deepEqual(violations(merge([closure(lock, { hostProvided })])), []);
  const [gpl] = violations([{ name: 'x', license: 'GPL-3.0-only', versions: [], paths: [] }]);
  assert.match(gpl.reason, /copyleft/);
});

test('refuses a licence nobody has decided about, and a missing declaration', () => {
  assert.equal(violations([{ name: 'x', license: 'Weird-1.0', versions: [], paths: [] }]).length, 1);
  const rows = closure({ packages: { '': { dependencies: { x: '1' } }, 'node_modules/x': { version: '1.0.0' } } });
  assert.equal(rows[0].license, 'UNKNOWN');
  assert.equal(violations(rows).length, 1);
});

test('the index carries no versions, so a dependency bump does not change it', () => {
  const before = renderIndex(merge([closure(lock, { hostProvided })]));
  const bumped = structuredClone(lock);
  bumped.packages['node_modules/shared'].version = '2.0.1';
  assert.equal(renderIndex(merge([closure(bumped, { hostProvided })])), before);
  assert.doesNotMatch(before, /2\.0\.0/);
});

test('the SBOM is CycloneDX 1.6 and identical for identical input', () => {
  const rows = merge([closure(lock, { hostProvided })]);
  const meta = { name: '@rolealpha/meeting', version: '1.1.0', timestamp: '2026-01-01T00:00:00Z' };
  const first = renderSbom(rows, meta);
  assert.equal(first.bomFormat, 'CycloneDX');
  assert.equal(first.specVersion, '1.6');
  assert.deepEqual(first, renderSbom(rows, meta));
  assert.equal(first.metadata.component.purl, 'pkg:npm/%40rolealpha/meeting@1.1.0');
  assert.deepEqual(first.metadata.component.licenses, [
    { expression: 'LicenseRef-rA-Meetings-Internal-Collaboration-License-1.0' },
  ]);
});
