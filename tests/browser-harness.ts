import { mount } from '../client/browser/mount';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest';
const sp = fakeSharePoint();
if (new URLSearchParams(location.search).has('onboarding')) sp.state.ready = false;
mount(document.getElementById('harness')!, {
  tenantId: tenant,
  userId: user,
  userName: 'Test Member',
  webUrl: 'https://customer.sharepoint.com/sites/circle',
  isTeams: false,
  sharepoint: sp.request,
  token: async () => {
    throw new Error('No live services in test harness');
  },
});
