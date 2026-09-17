// Development-only static preview. Never imported by the SPFx production entry point.
import { mount } from './browser/mount';
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
mount(root, {
  tenantId: tenant,
  userId: user,
  userName: 'Demo',
  webUrl: 'https://customer.sharepoint.com/sites/circle',
  isTeams: false,
  settings: customerSettingsSchema.parse({}),
  sharepoint: sp.request,
  token: async () => {
    throw new Error('In der lokalen Demo sind keine Microsoft- oder KI-Dienste verbunden.');
  },
});
