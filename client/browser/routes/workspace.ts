import { outputTypes, type Bootstrap, type Meeting, type Template, type Tension } from '../../../shared/model';
import { summarize } from '../../../shared/meeting-store';
import { askGovernance } from '../governance';
import { backfillCalendarClaims } from './calendar';
import type { Route } from './types';

export const workspaceRoutes: Route[] = [
  {
    verb: 'GET',
    path: /^\/bootstrap$/,
    handle: async ctx => {
      const { host, store, actor } = ctx;
      // Overview data only: transcript segments are loaded when a meeting is opened.
      const list = async () => (await store.list<Meeting>(actor.tenantId, 'meeting')).map(summarize);
      let meetings = await list();
      if (await backfillCalendarClaims(ctx, meetings)) meetings = await list();
      host.onMeetingsChanged?.(meetings.map(m => ({ id: m.id, title: m.title })));
      return {
        actor,
        templates: await store.list<Template>(actor.tenantId, 'template'),
        meetings,
        tensions: await store.list<Tension>(actor.tenantId, 'tension'),
        integrations: {
          storage: 'sharepoint',
          governance: !!host.settings.ai && !!host.settings.roleAlpha?.governance,
          ai: !!host.settings.ai,
          aiProvider: host.settings.ai?.provider ?? null,
          mcp: !!host.settings.roleAlpha?.meeting,
          entityTypes: outputTypes.filter(type => host.settings.roleAlpha?.entities[type]),
          graph: true,
        },
      } satisfies Bootstrap;
    },
  },
  {
    verb: 'POST',
    path: /^\/governance\/ask$/,
    allowReaders: true,
    handle: ({ host }, { body }) => askGovernance(host, body),
  },
];
