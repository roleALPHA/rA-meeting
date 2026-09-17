import { saveTemplate } from '../../../shared/domain';
import { rev, type Route } from './types';

export const templateRoutes: Route[] = [
  {
    verb: 'POST',
    path: /^\/templates$/,
    handle: ({ store, actor }, { body }) => saveTemplate(store, actor, body),
  },
  {
    verb: 'PUT',
    path: /^\/templates\/([^/]+)$/,
    handle: ({ store, actor }, { body }, [id]) => saveTemplate(store, actor, body, id, rev.parse(body.version)),
  },
  {
    verb: 'DELETE',
    path: /^\/templates\/([^/]+)$/,
    handle: async ({ store, actor }, { body }, [id]) => {
      await store.delete(actor.tenantId, 'template', id, rev.parse(body.version));
    },
  },
];
