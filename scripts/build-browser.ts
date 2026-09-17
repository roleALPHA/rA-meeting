import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { customerSettingsSchema } from '../client/browser/host.js';
const pkg = JSON.parse(await readFile('spfx/package.json', 'utf8')) as { version: string };
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('SPFx version must have three numeric parts');
const root = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
if (root.version !== pkg.version)
  throw new Error(`Version mismatch: package.json ${root.version} and spfx/package.json ${pkg.version} must be equal`);
const settings = customerSettingsSchema.parse(JSON.parse(await readFile('spfx/customer.config.json', 'utf8')));
await mkdir('spfx/src/generated', { recursive: true });
await writeFile(
  'spfx/src/generated/entry.ts',
  `export { mount } from '../../../client/browser/mount';\nexport const settings = ${JSON.stringify(settings)};\n`,
);
const result = await build({
  entryPoints: ['spfx/src/generated/entry.ts'],
  outfile: 'spfx/src/generated/app.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  minify: true,
  metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'inline-css',
      setup(b) {
        b.onResolve({ filter: /\.css\?inline$/ }, args => ({
          path: new URL(args.path.replace('?inline', ''), `file://${args.resolveDir}/`).pathname,
          namespace: 'inline-css',
        }));
        b.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({
          contents: await readFile(args.path, 'utf8'),
          loader: 'text',
        }));
      },
    },
  ],
});
const unsafe = Object.keys(result.metafile!.inputs).filter(
  p =>
    p.startsWith('server/') ||
    p.startsWith('tests/') ||
    p === 'client/preview.tsx' ||
    /node_modules\/(express|pg|jose)\//.test(p),
);
if (unsafe.length) throw new Error('Server dependency in browser package: ' + unsafe.join(', '));
await writeFile(
  'spfx/src/generated/app.d.ts',
  `export declare const settings: unknown;\nexport declare function mount(element: HTMLElement, host: { tenantId: string; userId: string; userName: string; webUrl: string; isTeams: boolean; initialMeeting?: string; settings: unknown; sharepointAt?: (webUrl: string, path: string, init?: RequestInit) => Promise<Response>; onMeetingsChanged?: (meetings: { id: string; title: string }[]) => void; sharepoint: (path: string, init?: RequestInit) => Promise<Response>; token: (resource: string) => Promise<string> }): () => void;\n`,
);
// Entry was used only for esbuild; keep the SPFx compiler inside its own project.
await writeFile('spfx/src/generated/entry.ts', 'export {};\n');
const targets = [settings.ai, settings.roleAlpha].filter(Boolean);
const permissions = [
  { resource: 'Microsoft Graph', scope: 'Calendars.Read' },
  { resource: 'Microsoft Graph', scope: 'OnlineMeetings.ReadWrite' },
  { resource: 'Microsoft Graph', scope: 'OnlineMeetingTranscript.Read.All' },
  ...targets.map(t => ({ resource: t!.permissionResource, scope: t!.scope })),
];
const unique = permissions.filter(
  (p, i, all) => all.findIndex(q => q.resource === p.resource && q.scope === p.scope) === i,
);
await writeFile(
  'spfx/config/package-solution.json',
  JSON.stringify(
    {
      $schema: 'https://developer.microsoft.com/json-schemas/spfx-build/package-solution.schema.json',
      solution: {
        name: 'rolealpha-meetings-client-side-solution',
        id: 'b905596d-a4a5-4dfe-8571-5d1e0631b43d',
        version: pkg.version + '.0',
        includeClientSideAssets: true,
        skipFeatureDeployment: true,
        isDomainIsolated: false,
        webApiPermissionRequests: unique,
      },
      paths: { zippedPackage: 'solution/rolealpha-meetings.sppkg' },
    },
    null,
    2,
  ) + '\n',
);
await mkdir('work', { recursive: true });
await writeFile('work/browser-bundle-inputs.json', JSON.stringify(Object.keys(result.metafile!.inputs), null, 2));
console.log('Browser-only bundle built. No server, SQL, client secret or /api fallback dependency.');
console.log('Requested API permissions (after approval available to all SPFx solutions in the tenant):');
for (const permission of unique) console.log(`  - ${permission.resource}: ${permission.scope}`);
