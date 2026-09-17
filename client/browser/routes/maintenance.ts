import { z } from 'zod';
import { assert } from '../../../shared/model';
import { SharePointRestStore, workspaceAccess } from '../../../shared/storage/sharepoint-rest';
import type { Route, RouteContext } from './types';

/** Storage maintenance is reserved for site owners, like the initial provisioning. */
async function ownerStore({ host, store }: RouteContext) {
  assert((await workspaceAccess(host.sharepoint)).provision, 'error.maintenance.onlySiteOwnersCan', 403);
  assert(store instanceof SharePointRestStore, 'error.maintenance.storageCleanupAvailableStorage', 501);
  return store;
}

export const maintenanceRoutes: Route[] = [
  {
    verb: 'GET',
    path: /^\/maintenance\/orphans$/,
    handle: async ctx => (await ownerStore(ctx)).findOrphans(ctx.actor.tenantId),
  },
  {
    verb: 'POST',
    path: /^\/maintenance\/orphans$/,
    handle: async (ctx, { body }) => {
      const ids = z.array(z.string().uuid()).min(1).max(5000).parse(body.ids);
      return { recycled: await (await ownerStore(ctx)).recycleOrphans(ctx.actor.tenantId, ids) };
    },
  },
];
