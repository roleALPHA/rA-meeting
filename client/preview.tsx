/// <reference types="vite/client" />
// Development-only static preview. Never imported by the SPFx production entry point.
import { mount } from './browser/mount';
import { teamsTheme } from './browser/brand';
import { chatId, fakeServices, tenant, user } from '../tests/helpers/fake-services';
const root = document.getElementById('root')!;
const notice = document.createElement('p');
notice.textContent =
  'Lokale Browser-Demo · Teams, Microsoft Graph und roleALPHA werden simuliert · keine Kundendienste verbunden.';
notice.style.cssText = 'font:14px system-ui;background:Mark;color:MarkText;padding:12px;margin:0';
root.before(notice);
document.body.style.margin = '0';
const params = new URLSearchParams(location.search);
// ?width=320 shows the meeting side panel at the width Teams gives it.
const width = Number(params.get('width'));
if (width > 0) root.style.cssText = `width:${width}px;border-right:1px dashed GrayText`;
const services = fakeServices({ delay: 250, liberal: ['relationship'] });
// Everything the app sends goes to the simulation; nothing leaves the browser.
window.fetch = services.fetch as typeof fetch;
// Bundled fonts as Vite serves them, keyed by file name like the SPFx host does.
const fonts = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('./assets/fonts/*.woff2', { query: '?url', import: 'default', eager: true }),
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
);
// ?theme=dark or ?theme=contrast shows the Teams themes; otherwise the preview follows the operating system.
// ?meeting=0 shows the app outside a meeting.
const requested = params.get('theme');
const scheme = matchMedia('(prefers-color-scheme: dark)');
const handle = mount(root, {
  tenantId: tenant,
  userId: user,
  userName: 'Demo',
  webUrl: 'https://customer.sharepoint.com/sites/circle',
  isTeams: true,
  teams: params.get('meeting') === '0' ? null : { chatId, frameContext: 'sidePanel' },
  theme: requested ? teamsTheme(requested) : scheme.matches ? 'dark' : 'light',
  fonts,
  sharepoint: services.sharepoint,
  token: async () => 'preview-token',
  // Shows the consent links; the preview tenant does not exist, so Microsoft rejects them.
  consent: { authority: 'https://login.microsoftonline.com' },
});
if (!requested) scheme.addEventListener('change', event => handle.setTheme(event.matches ? 'dark' : 'light'));
