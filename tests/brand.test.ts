import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Port of rA-app's tests/unit/brand-tokens.test.ts. The corporate design only holds if a new colour, font or logo
// cannot arrive quietly.

const read = (path: string) => readFileSync(path, 'utf8');
const brandCss = read('client/brand.css');
const styleCss = read('client/style.css');
const fontsCss = read('client/fonts.css');
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Rebranding 10/2026 (Figma "roleALPHA-Brand", styleguide pp. 09-11 and 22).
const BRAND = {
  tiefgruen: '#072a26',
  creme: '#fafbf2',
  anthrazit: '#292929',
  mint: '#86eec2',
  'mint-dunkel': '#0f7a55',
  apricot: '#efa784',
  braun: '#a9542f',
  warnung: '#8f6210',
  fehler: '#b23a2b',
  'erfolg-hell': '#e4faf0',
  'warnung-hell': '#fbf0d6',
  'fehler-hell': '#fbe6e1',
  'warnung-auf-dunkel': '#f2c35b',
  'fehler-auf-dunkel': '#f2907e',
};

test('the brand and function colours are defined once, in brand.css, with styleguide values', () => {
  for (const [name, hex] of Object.entries(BRAND)) {
    const declarations = withoutComments(brandCss).match(new RegExp(`--brand-${name}:\\s*${hex};`, 'gi')) ?? [];
    assert.equal(declarations.length, 1, `--brand-${name} must be ${hex}, exactly once`);
  }
});

test('style.css derives every colour from tokens and contains no raw colour value', () => {
  assert.deepEqual(withoutComments(styleCss).match(HEX) ?? [], []);
  assert.doesNotMatch(withoutComments(styleCss), /\brgba?\(|\bhsla?\(/);
});

test('Apricot and Braun never carry an action or a state', () => {
  // The styleguide reserves them for imagery and people; Mint is the only accent.
  assert.doesNotMatch(withoutComments(styleCss), /--brand-(apricot|braun)\b/);
});

test('function colours flow only into the status tokens', () => {
  const uses = [...withoutComments(styleCss).matchAll(/^\s*(--[\w-]+):[^;]*--brand-(warnung|fehler|erfolg)/gm)];
  assert.ok(uses.length > 0);
  for (const [, token] of uses) assert.match(token, /^--status-/, `${token} must not use a function colour`);
});

test('headings are set in the display face, titles never in bold', () => {
  const rule = (selector: string) =>
    withoutComments(styleCss).match(new RegExp(`\\n${selector} \\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(withoutComments(styleCss), /\nh1,\nh2,\nh3 \{\s*font-family: var\(--font-display\);/);
  assert.match(rule('h1'), /font-weight: 500;/);
  assert.match(rule('h2'), /font-weight: 500;/);
});

test('no brand colour is repeated in client code', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
    );
  const offenders = walk('client')
    .filter(path => /\.(tsx?|css)$/.test(path) && path !== join('client', 'brand.css'))
    .filter(path => Object.values(BRAND).some(hex => read(path).toLowerCase().includes(hex)));
  assert.deepEqual(offenders, []);
});

test('every @font-face file exists, every bundled font is used, and families match brand.css', () => {
  const faces = withoutComments(fontsCss).match(/@font-face\s*{[^}]*}/g) ?? [];
  assert.ok(faces.length > 0);
  const files = faces.map(face => face.match(/url\('([^']+)'\)/)?.[1]);
  const bundled = readdirSync('client/assets/fonts').filter(name => name.endsWith('.woff2'));
  assert.deepEqual([...new Set(files)].sort(), bundled.sort());
  const families = new Set(faces.map(face => face.match(/font-family:\s*'([^']+)'/)?.[1]));
  const declared = new Set([...brandCss.matchAll(/--brand-font-\w+:\s*'([^']+)'/g)].map(m => m[1]));
  assert.deepEqual([...families].sort(), [...declared].sort());
});

test('fonts never come from a font service or another origin', () => {
  for (const css of [brandCss, styleCss, fontsCss]) {
    assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com|@import|url\(['"]?(https?:)?\/\//);
  }
});

test('every bundled font family ships its licence text', () => {
  const licences = readdirSync('client/assets/fonts').filter(name => name.startsWith('OFL-'));
  assert.deepEqual(licences.sort(), ['OFL-IBM-Plex-Mono.txt', 'OFL-IBM-Plex-Sans.txt', 'OFL-Manrope.txt']);
});

test('the logo is vector outlines only, and the inline mark and app icon are the same drawing', () => {
  const svg = read('client/assets/brand/rolealpha-icon.svg');
  const appIcon = read('client/assets/brand/rolealpha-app-icon.svg');
  for (const source of [svg, appIcon]) assert.doesNotMatch(source, /<text|font-family|<image|data:image/);
  const paths = (source: string) => [...source.matchAll(/\sd="([^"]+)"/g)].map(m => m[1]);
  assert.equal(paths(svg).length, 1);
  assert.deepEqual(paths(read('client/BrandMark.tsx')), paths(svg));
  assert.deepEqual(paths(appIcon), paths(svg));
});

test('the web parts show the app icon in the SharePoint toolbox', () => {
  const dataUri = `data:image/svg+xml;base64,${readFileSync('client/assets/brand/rolealpha-app-icon.svg').toString('base64')}`;
  for (const name of ['meetings/MeetingsWebPart', 'meetingTab/MeetingTabWebPart']) {
    const manifest = JSON.parse(read(`spfx/src/webparts/${name}.manifest.json`));
    assert.equal(manifest.preconfiguredEntries[0].iconImageUrl, dataUri);
  }
});

test('Teams gets a 192px colour and a 32px outline icon for both components', () => {
  const size = (path: string) => {
    const png = readFileSync(path);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };
  for (const id of ['d7391660-3f52-4e4b-b95f-7a71e4c5092e', 'a1aef306-48f2-4238-928a-fffd021b4a1c']) {
    assert.deepEqual(size(`spfx/teams/${id}_color.png`), [192, 192]);
    assert.deepEqual(size(`spfx/teams/${id}_outline.png`), [32, 32]);
  }
});
