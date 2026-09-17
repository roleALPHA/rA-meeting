/// <reference types="vite/client" />
// Development-only static preview. Never imported by the SPFx production entry point.
import { mount } from './browser/mount';
import { teamsTheme } from './browser/brand';
import { customerSettingsSchema } from './browser/host';
import { fakeSharePoint, tenant, user } from '../tests/helpers/sharepoint-rest';
const root = document.getElementById('root')!;
const notice = document.createElement('p');
notice.textContent =
  'Lokale Browser-Demo · SharePoint wird simuliert · keine Kundendienste verbunden · Änderungen gelten bis zum Neuladen.';
notice.style.cssText = 'font:14px system-ui;background:Mark;color:MarkText;padding:12px;margin:0';
root.before(notice);
document.body.style.margin = '0';
const sp = fakeSharePoint();
// Bundled fonts as Vite serves them, keyed by file name like the SPFx host does.
const fonts = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./assets/fonts/*.woff2', { query: '?url', import: 'default', eager: true }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);
// ?theme=dark or ?theme=contrast shows the Teams themes; otherwise the preview follows the operating system.
const requested = new URLSearchParams(location.search).get('theme');
const scheme = matchMedia('(prefers-color-scheme: dark)');
const handle = mount(root, {
  tenantId: tenant,
  userId: user,
  userName: 'Demo',
  webUrl: 'https://customer.sharepoint.com/sites/circle',
  isTeams: false,
  theme: requested ? teamsTheme(requested) : scheme.matches ? 'dark' : 'light',
  fonts,
  settings: customerSettingsSchema.parse({}),
  sharepoint: sp.request,
  token: async () => {
    throw new Error('In der lokalen Demo sind keine Microsoft- oder KI-Dienste verbunden.');
  },
});
if (!requested) scheme.addEventListener('change', event => handle.setTheme(event.matches ? 'dark' : 'light'));
