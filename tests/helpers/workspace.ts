import { SharePointRestStore } from '../../shared/storage/sharepoint-rest.js';
import { fakeSharePoint, tenant, user } from './sharepoint-rest.js';
import { customerSettingsSchema, type BrowserHost } from '../../client/browser/host.js';
import type { Actor } from '../../shared/model.js';
export class TestStore extends SharePointRestStore {
  constructor(tenantId: string) {
    super(tenantId, 'https://customer.sharepoint.com/sites/circle', fakeSharePoint().request);
  }
}
export const actor: Actor = { id: user, name: 'Owner', tenantId: tenant, workspace: 'write' };
export function testHost(): BrowserHost {
  return {
    tenantId: tenant,
    userId: user,
    userName: 'Owner',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    sharepoint: fakeSharePoint().request,
    token: async () => 'test-token',
    settings: customerSettingsSchema.parse({
      roleAlpha: {
        url: 'https://rolealpha.example/mcp',
        resource: 'api://rolealpha',
        permissionResource: 'roleALPHA',
        scope: 'access_as_user',
        tenant,
        meeting: true,
        entities: { risk: { entityType: 'risk', label: 'Risiko' } },
      },
    }),
  };
}
