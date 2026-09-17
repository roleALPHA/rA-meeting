import { z } from 'zod';
import {
  assert,
  AppError,
  defaultWorkspaceSettings,
  teamsRecordingModes,
  type WorkspaceSettings,
} from '../../../shared/model';
import { workspaceAccess } from '../../../shared/storage/sharepoint-rest';
import { rev, type Route, type RouteContext } from './types';

const key = { kind: 'settings', id: 'workspace' };

export async function loadSettings({ store, actor }: RouteContext): Promise<WorkspaceSettings> {
  try {
    return { ...defaultWorkspaceSettings, ...(await store.get<WorkspaceSettings>(actor.tenantId, key.kind, key.id)) };
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return defaultWorkspaceSettings;
    throw error;
  }
}

export const settingsRoutes: Route[] = [
  {
    verb: 'PUT',
    path: /^\/settings$/,
    handle: async (ctx, { body }) => {
      const { host, store, actor } = ctx;
      assert((await workspaceAccess(host.sharepoint)).provision, 'error.settings.ownersOnly', 403);
      const expected = z.number().int().min(0).parse(body.version);
      const current = await loadSettings(ctx);
      assert(current.version === expected, 'error.sharepointRest.recordHasChangedPlease', 409);
      const next: WorkspaceSettings = {
        version: rev.parse(expected + 1),
        teamsRecording: z.enum(teamsRecordingModes).parse(body.teamsRecording),
        updatedAt: new Date().toISOString(),
        updatedBy: actor.id,
      };
      await store.save(actor.tenantId, key.kind, key.id, next.version, next, expected || undefined);
      return next;
    },
  },
];
