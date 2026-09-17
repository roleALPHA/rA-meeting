import { saveTension } from '../../../shared/tensions';
import { searchDrafts } from '../drafts';
import { rev, type Route } from './types';

export const tensionRoutes: Route[] = [
  {
    verb: 'POST',
    path: /^\/drafts\/search$/,
    handle: ({ host }, { body }) => searchDrafts(host, body),
  },
  {
    verb: 'POST',
    path: /^\/tensions$/,
    handle: ({ host, store, actor }, { body }) =>
      saveTension(store, actor, body, undefined, undefined, { draftAppUrl: host.settings.roleAlpha?.drafts?.appUrl }),
  },
  {
    verb: 'PUT',
    path: /^\/tensions\/([^/]+)$/,
    handle: ({ host, store, actor }, { body }, [id]) =>
      saveTension(store, actor, body, id, rev.parse(body.version), {
        draftAppUrl: host.settings.roleAlpha?.drafts?.appUrl,
      }),
  },
];
