import { z } from 'zod';
import { attachTension, saveTension } from '../../../shared/tensions';
import { rev, type Route } from './types';

export const tensionRoutes: Route[] = [
  {
    verb: 'POST',
    path: /^\/tensions$/,
    handle: ({ store, actor }, { body }) => saveTension(store, actor, body),
  },
  {
    verb: 'PUT',
    path: /^\/tensions\/([^/]+)$/,
    handle: ({ store, actor }, { body }, [id]) => saveTension(store, actor, body, id, rev.parse(body.version)),
  },
  {
    verb: 'POST',
    path: /^\/tensions\/([^/]+)\/attach$/,
    handle: ({ store, actor }, { body }, [id]) =>
      attachTension(
        store,
        actor,
        id,
        z.string().uuid().parse(body.meetingId),
        z.string().uuid().parse(body.stepId),
        rev.parse(body.revision),
      ),
  },
];
