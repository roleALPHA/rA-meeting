#!/usr/bin/env node
/**
 * Whose code ships inside the SharePoint package, and whether it may.
 *
 * Two obligations meet here:
 *
 *   1. ATTRIBUTION. MIT, BSD and Apache require the copyright notice and licence text to travel with the
 *      code. The .sppkg handed to a customer IS distribution, and the browser bundle inside it contains these
 *      packages verbatim. `--notices` writes the texts that are attached to each GitHub release.
 *   2. COMPATIBILITY. rA Meetings is released under the rA Meetings Internal Collaboration License, which is
 *      not an open-source licence. Permissive licences combine with it freely. Strong copyleft does not: GPL
 *      and AGPL require the combined work under their own terms. Licences with service restrictions of their
 *      own (SSPL, BUSL, Elastic) would bind customers beyond our terms. That is what the policy decides.
 *
 * The data source is the lockfiles, not node_modules: the check needs no install (the SPFx toolchain alone is
 * several hundred megabytes), and it gives the same answer on every platform.
 *
 * Only the production closure counts, because only that reaches the browser bundle:
 *   - `package.json` dependencies, bundled by esbuild into `spfx/src/generated/app.js`;
 *   - `spfx/package.json` dependencies, except `@microsoft/sp-*`, which SharePoint loads at runtime and which
 *     are therefore not part of the package.
 * The root closure is wider than what esbuild actually keeps (the MCP SDK declares server packages the browser
 * build never imports). Attributing more than required is safe; attributing less is not.
 *
 * The committed index (THIRD-PARTY-LICENSES.md) is the reviewable half. It carries no version numbers, so a
 * Dependabot bump does not rewrite it; versions belong in the SBOM generated per release.
 *
 * Usage:
 *   node scripts/licenses.mjs                 check policy + index freshness
 *   node scripts/licenses.mjs --write         regenerate the committed index
 *   node scripts/licenses.mjs --notices FILE  write the full notice file (needs installed node_modules)
 *   node scripts/licenses.mjs --sbom FILE     write a CycloneDX 1.6 SBOM
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Licences that may ship inside the package. Every entry carries a reason: adding a licence here has to be a
 * decision somebody made, not a line appended to make the build green.
 */
export const ALLOWED = {
  MIT: 'Permissive. Requires the notice to travel with the code -- see --notices.',
  'MIT-0': 'MIT without the attribution requirement.',
  ISC: 'Permissive, functionally MIT.',
  '0BSD': 'Permissive, no attribution required.',
  'BSD-2-Clause': 'Permissive.',
  'BSD-3-Clause': 'Permissive, plus a no-endorsement clause we do not violate.',
  'Apache-2.0': 'Permissive with a patent grant. The NOTICE file, where a package has one, travels in --notices.',
  'BlueOak-1.0.0': 'Permissive, plainly worded.',
  'Python-2.0': 'Permissive.',
  'CC0-1.0': 'Public-domain dedication.',
  Unlicense: 'Public-domain dedication.',
  'CC-BY-4.0': 'Attribution required and nothing else. The notice file carries the attribution.',
  'MPL-2.0':
    'File-scoped copyleft. Section 3.3 lets MPL files sit inside a larger work under other terms; changes to the MPL files themselves stay MPL.',
  'OFL-1.1':
    'Font licence. Fonts may be bundled with software under any terms as long as they are not sold on their own and the licence text travels with them.',
  '(MIT OR Apache-2.0)': 'Either half is allowed above.',
  '(MIT OR CC0-1.0)': 'Either half is allowed above.',
  'Apache-2.0 AND MIT': 'Both halves are allowed above.',
};

/**
 * Licences with a named refusal, so the error says what is actually wrong. Anything in neither table is refused
 * too: an unknown licence is a decision nobody has made yet.
 */
export const REFUSED = {
  'GPL-2.0': 'Strong copyleft. The combined work would have to be GPL, which the rA Meetings licence is not.',
  'GPL-2.0-only': 'Strong copyleft. The combined work would have to be GPL, which the rA Meetings licence is not.',
  'GPL-2.0-or-later': 'Strong copyleft, same conflict as GPL-2.0-only.',
  'GPL-3.0-only': 'Strong copyleft. The combined work would have to be GPL, which the rA Meetings licence is not.',
  'GPL-3.0-or-later': 'Strong copyleft, same conflict as GPL-3.0-only.',
  'AGPL-3.0-only': 'Strong network copyleft, same conflict as GPL-3.0-only.',
  'AGPL-3.0-or-later': 'Strong network copyleft, same conflict as GPL-3.0-only.',
  'LGPL-2.1-only':
    'Library copyleft that requires the library to stay replaceable. Minified into one browser bundle it is not.',
  'LGPL-2.1-or-later': 'Same as LGPL-2.1-only.',
  'LGPL-3.0-only': 'Same as LGPL-2.1-only.',
  'LGPL-3.0-or-later': 'Same as LGPL-2.1-only.',
  'SSPL-1.0': 'Service restrictions of its own that would bind customers beyond our terms.',
  'BUSL-1.1': 'Source-available with use restrictions of its own -- not ours to pass on.',
  'Elastic-2.0': 'Source-available with a restriction on offering the software as a service -- not ours to pass on.',
  UNLICENSED: 'Explicitly reserves all rights. Shipping it would be infringement.',
  UNKNOWN: 'The package declares no licence. Treat as all rights reserved until proven otherwise.',
};

/** SPDX has no identifier for our licence, so it is a LicenseRef, the mechanism SPDX provides for exactly that. */
export const PROJECT_LICENSE = 'LicenseRef-rA-Meetings-Internal-Collaboration-License-1.0';

const INDEX_FILE = 'THIRD-PARTY-LICENSES.md';

/**
 * Files bundled into the package that do not arrive through a lockfile. The fonts were copied from their Fontsource
 * npm packages (client/assets/fonts/README.md), so they are named and versioned as those packages.
 */
export const BUNDLED = [
  {
    name: '@fontsource-variable/ibm-plex-sans',
    version: '5.3.0',
    license: 'OFL-1.1',
    path: 'client/assets/fonts',
    notice: 'client/assets/fonts/OFL-IBM-Plex-Sans.txt',
  },
  {
    name: '@fontsource/ibm-plex-mono',
    version: '5.3.0',
    license: 'OFL-1.1',
    path: 'client/assets/fonts',
    notice: 'client/assets/fonts/OFL-IBM-Plex-Mono.txt',
  },
  {
    name: '@fontsource/instrument-serif',
    version: '5.3.0',
    license: 'OFL-1.1',
    path: 'client/assets/fonts',
    notice: 'client/assets/fonts/OFL-Instrument-Serif.txt',
  },
];

/** Workspaces whose production closure ends up in the package, and the dependencies each provides at runtime. */
const ROOTS = [
  { dir: '.', hostProvided: () => false },
  { dir: 'spfx', hostProvided: name => name.startsWith('@microsoft/sp-') },
];

const PREAMBLE = `<!-- Generated by scripts/licenses.mjs -- do not edit by hand.
     Regenerate with \`npm run licenses:write\` and commit the result. -->

# Third-party licences

rA Meetings is licensed under the rA Meetings Internal Collaboration License (see LICENSE.md). Its SharePoint
package contains other people's code, which carries its own terms.

This file is the reviewable index: which packages, under which licence. It deliberately carries no version
numbers, so that a dependency bump does not rewrite it -- versions are in the SBOM attached to each release.

The notices themselves -- the copyright lines and licence texts that MIT, BSD and Apache require to travel with
the code -- are attached to each GitHub release as \`THIRD-PARTY-LICENSES.txt\`.

The set below is the production dependency closure of \`package.json\` and \`spfx/package.json\`, without the
\`@microsoft/sp-*\` packages SharePoint provides at runtime, plus the bundled brand fonts.
`;

/** The package name a lockfile key refers to: the part after the last `node_modules/`. */
export function packageName(key) {
  return key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
}

/** Resolve `name` as Node would from the package at `from`: nearest `node_modules` first, then upwards. */
function resolve(packages, from, name) {
  let base = from;
  for (;;) {
    const key = (base ? base + '/' : '') + 'node_modules/' + name;
    if (packages[key]) return key;
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i === -1 ? '' : base.slice(0, i);
  }
}

/**
 * The production closure of one lockfile as rows, one per installed copy.
 *
 * Walked from the root's dependencies rather than filtered by `dev: false`: npm marks a package as production
 * when ANY path reaches it, which includes the framework packages this project excludes.
 */
export function closure(lock, { dir = '.', hostProvided = () => false } = {}) {
  const { packages } = lock;
  const rows = [];
  const seen = new Set();
  const queue = [];
  const enqueue = (from, deps, optional) => {
    for (const name of Object.keys(deps ?? {})) {
      if (hostProvided(name)) continue;
      const key = resolve(packages, from, name);
      if (!key) {
        if (optional) continue;
        throw new Error(`${dir}: ${name} (required from ${from || 'the root'}) is not in the lockfile`);
      }
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(key);
    }
  };
  const root = packages[''];
  enqueue('', root.dependencies, false);
  enqueue('', root.optionalDependencies, true);
  while (queue.length) {
    const key = queue.shift();
    const entry = packages[key];
    rows.push({
      name: packageName(key),
      version: entry.version ?? '0.0.0',
      license: normaliseLicense(entry.license),
      path: dir === '.' ? key : `${dir}/${key}`,
    });
    enqueue(key, entry.dependencies, false);
    enqueue(key, entry.optionalDependencies, true);
    enqueue(key, entry.peerDependencies, true);
  }
  return rows;
}

function normaliseLicense(license) {
  if (!license) return 'UNKNOWN';
  if (typeof license === 'object') return license.type ?? 'UNKNOWN';
  return license;
}

/** All roots, merged to one row per name and licence with every version seen, sorted for a stable diff. */
export function merge(rowSets) {
  const byKey = new Map();
  for (const row of rowSets.flat()) {
    const key = `${row.license} ${row.name}`;
    const existing = byKey.get(key);
    if (!existing)
      byKey.set(key, {
        name: row.name,
        license: row.license,
        versions: [row.version],
        paths: [row.path],
        ...(row.notice ? { notice: row.notice } : {}),
      });
    else {
      if (!existing.versions.includes(row.version)) existing.versions.push(row.version);
      existing.paths.push(row.path);
    }
  }
  const rows = [...byKey.values()];
  for (const row of rows) row.versions.sort();
  rows.sort((a, b) => a.license.localeCompare(b.license) || a.name.localeCompare(b.name));
  return rows;
}

/** Every row whose licence the policy does not allow, with the reason. */
export function violations(rows) {
  return rows
    .filter(row => !(row.license in ALLOWED))
    .map(row => ({
      ...row,
      reason:
        REFUSED[row.license] ??
        'Not in the policy in scripts/licenses.mjs. Decide whether it may ship inside the rA Meetings package, then add it there WITH the reason.',
    }));
}

export function renderIndex(rows) {
  const byLicense = new Map();
  for (const row of rows) {
    if (!byLicense.has(row.license)) byLicense.set(row.license, []);
    byLicense.get(row.license).push(row.name);
  }
  const sections = [...byLicense.entries()].map(
    ([license, names]) => `## ${license}\n\n${ALLOWED[license] ?? ''}\n\n${names.map(n => `- ${n}`).join('\n')}\n`,
  );
  return `${PREAMBLE}\n${sections.join('\n')}`;
}

const NOTICE_NAMES = /^(licen[cs]e|copying|notice)(\.|$)/i;

/** The licence and notice texts a package actually ships, if it ships any. */
function noticeTexts(paths) {
  for (const dir of paths) {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    const files = entries.filter(name => NOTICE_NAMES.test(name)).sort();
    if (files.length) return files.map(file => readFileSync(join(dir, file), 'utf8').trim()).join('\n\n');
  }
  return null;
}

export function renderNotices(rows) {
  const rule = '='.repeat(78);
  const parts = [
    'THIRD-PARTY NOTICES',
    '',
    'rA Meetings (rA Meetings Internal Collaboration License; see LICENSE.md)',
    'is distributed with the following components.',
    'Each is provided under its own licence, reproduced below.',
    '',
    'The index without licence texts is THIRD-PARTY-LICENSES.md in the source repository.',
    '',
  ];
  const silent = [];
  for (const row of rows) {
    const text = row.notice ? readFileSync(row.notice, 'utf8').trim() : noticeTexts(row.paths);
    if (!text) silent.push(row.name);
    parts.push(
      rule,
      `${row.name}  --  ${row.license}`,
      rule,
      '',
      // Not silently skipped: the declared licence still binds, and a reader must see that the text is missing.
      text ?? `[No licence file in the published package. Declared licence: ${row.license}.]`,
      '',
    );
  }
  return { text: parts.join('\n') + '\n', silent };
}

/**
 * A CycloneDX 1.6 document over the production closure. `serialNumber` is derived from the content, so building
 * the same release twice produces the same document.
 */
export function renderSbom(rows, { name, version, timestamp }) {
  const components = [];
  for (const row of rows) {
    for (const v of row.versions) {
      components.push({
        type: 'library',
        'bom-ref': purl(row.name, v),
        name: row.name,
        version: v,
        purl: purl(row.name, v),
        licenses: [licenseEntry(row.license)],
      });
    }
  }
  components.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']));
  const body = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      timestamp,
      tools: { components: [{ type: 'application', name: 'scripts/licenses.mjs', group: name }] },
      component: {
        type: 'application',
        'bom-ref': purl(name, version),
        name,
        version,
        purl: purl(name, version),
        licenses: [licenseEntry(PROJECT_LICENSE)],
      },
    },
    components,
  };
  const digest = createHash('sha256').update(JSON.stringify(body.components)).digest('hex');
  return {
    serialNumber: `urn:uuid:${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`,
    ...body,
  };
}

/** A package URL. Scoped names keep their slash as the namespace separator. */
function purl(name, version) {
  return `pkg:npm/${name.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(version)}`;
}

/** CycloneDX wants `id` for a plain SPDX identifier and `expression` for anything else. */
function licenseEntry(license) {
  return /[()]|\sAND\s|\sOR\s|^LicenseRef-/.test(license) || license === 'UNKNOWN'
    ? { expression: license }
    : { license: { id: license } };
}

export function readRows(cwd = '.') {
  return merge([
    ...ROOTS.map(root =>
      closure(JSON.parse(readFileSync(join(cwd, root.dir, 'package-lock.json'), 'utf8')), {
        dir: root.dir,
        hostProvided: root.hostProvided,
      }),
    ),
    BUNDLED,
  ]);
}

// --- command line ------------------------------------------------------------

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  const flag = name => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : (argv[i + 1] ?? true);
  };
  const rows = readRows();

  const bad = violations(rows);
  if (bad.length > 0) {
    console.error(`\n${bad.length} dependency/-ies may not ship under this project's licence:\n`);
    for (const row of bad) console.error(`  ${row.name}  (${row.license})\n    ${row.reason}\n`);
    process.exit(1);
  }

  const sbom = flag('--sbom');
  const notices = flag('--notices');
  if (typeof sbom === 'string') {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const doc = renderSbom(rows, {
      name: pkg.name,
      version: process.env.RELEASE_VERSION?.replace(/^v/, '') || pkg.version,
      timestamp: new Date().toISOString(),
    });
    writeFileSync(sbom, JSON.stringify(doc, null, 2) + '\n');
    console.log(`${doc.components.length} components written to ${sbom}.`);
  } else if (typeof notices === 'string') {
    const { text, silent } = renderNotices(rows);
    writeFileSync(notices, text);
    console.log(`${rows.length} components written to ${notices}.`);
    if (silent.length > 0) console.log(`No licence file shipped by: ${silent.join(', ')}`);
  } else if (flag('--write')) {
    writeFileSync(INDEX_FILE, renderIndex(rows));
    console.log(`${rows.length} components written to ${INDEX_FILE}.`);
  } else {
    let actual = null;
    try {
      actual = readFileSync(INDEX_FILE, 'utf8');
    } catch {
      // A missing index is reported like a stale one.
    }
    if (actual !== renderIndex(rows)) {
      console.error(
        `${INDEX_FILE} no longer matches the lockfiles.\n` +
          'A dependency was added or removed. Run `npm run licenses:write` and commit the result -- the diff is the review.',
      );
      process.exit(1);
    }
    console.log(`${rows.length} components, every licence allowed, ${INDEX_FILE} current.`);
  }
}
