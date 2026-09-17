import { z } from 'zod';
import { assert, AppError, type Actor } from '../../shared/model';
import { SharePointRestStore, workspaceAccess } from '../../shared/storage/sharepoint-rest';
import type { Repository } from '../../shared/storage/repository';
import type { BrowserHost } from './host';
import { createContext, verifyRevision, type MeetingAction, type Route } from './routes/types';
import { workspaceRoutes } from './routes/workspace';
import { calendarActions, calendarRoutes } from './routes/calendar';
import { templateRoutes } from './routes/templates';
import { tensionRoutes } from './routes/tensions';
import { meetingActions, meetingRoutes } from './routes/meetings';
import { exportActions } from './routes/export';

export type AppApi = {
  openSetup?: () => void;
  initialMeeting?: string;
  initializeTeams: () => Promise<boolean>;
  request: <T>(path: string, body?: unknown, method?: string) => Promise<T>;
};

const requestBody = z.record(z.unknown());
const actions: Record<string, MeetingAction> = { ...meetingActions, ...calendarActions, ...exportActions };

/** Meeting reads and meeting actions. Actions load the meeting for writing and require a matching revision. */
const meetingItemRoutes: Route[] = [
  {
    verb: 'GET',
    path: /^\/meetings\/([^/]+)$/,
    handle: ({ get }, _req, [id]) => get(id),
  },
  {
    verb: 'POST',
    path: /^\/meetings\/([^/]+)\/([^/]+)$/,
    handle: async (ctx, req, [id, action]) => {
      const handler = Object.prototype.hasOwnProperty.call(actions, action) ? actions[action] : undefined;
      assert(handler, 'API-Endpunkt nicht gefunden.', 404);
      const m = await ctx.get(id, true);
      verifyRevision(m, req.body);
      return handler(ctx, req, m, id);
    },
  },
];

const routes: Route[] = [
  ...workspaceRoutes,
  ...calendarRoutes,
  ...templateRoutes,
  ...tensionRoutes,
  ...meetingRoutes,
  ...meetingItemRoutes,
];

export async function createBrowserApi(host: BrowserHost): Promise<AppApi> {
  const access = await workspaceAccess(host.sharepoint);
  const actor: Actor = {
    id: z.string().uuid().parse(host.userId),
    name: host.userName,
    tenantId: host.tenantId,
    workspace: access.write ? 'write' : 'read',
  };
  const store = new SharePointRestStore(host.tenantId, host.webUrl, host.sharepoint);
  await store.initialize();
  if (access.write) await store.seed(host.tenantId, host.settings.language);
  return browserApi(host, store, actor);
}

export function browserApi(host: BrowserHost, store: Repository, actor: Actor): AppApi {
  const ctx = createContext(host, store, actor);
  async function dispatch(path: string, raw?: unknown, method = 'POST'): Promise<unknown> {
    const url = new URL(path, 'https://local.invalid');
    assert(url.origin === 'https://local.invalid', 'Invalid local route');
    const body = raw === undefined ? {} : requestBody.parse(raw);
    const verb = raw === undefined ? 'GET' : method;
    for (const route of routes) {
      if (route.verb !== verb) continue;
      const match = route.path.exec(url.pathname);
      if (!match) continue;
      if (verb !== 'GET' && !route.allowReaders)
        assert(actor.workspace === 'write', 'Keine Berechtigung für diesen SharePoint-Arbeitsbereich.', 403);
      return route.handle(ctx, { url, body }, match.slice(1));
    }
    throw new AppError(404, 'API-Endpunkt nicht gefunden.');
  }
  return {
    initialMeeting: host.initialMeeting,
    initializeTeams: async () => host.isTeams,
    request: async <T>(path: string, body?: unknown, method?: string) => {
      try {
        return (await dispatch(path, body, method)) as T;
      } catch (error) {
        if (error instanceof z.ZodError) throw new AppError(400, 'Bitte die markierten Eingaben prüfen.');
        throw error;
      }
    },
  };
}
