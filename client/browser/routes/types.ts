import { z } from 'zod';
import { assert, type Actor, type Meeting } from '../../../shared/model';
import { loadMeeting, storeMeeting } from '../../../shared/meeting-store';
import type { Repository } from '../../../shared/storage/repository';
import { type BrowserHost, graph } from '../host';

export const rev = z.number().int().positive();

export type RouteContext = {
  host: BrowserHost;
  store: Repository;
  actor: Actor;
  /** Microsoft Graph request with the signed-in user's delegated token. */
  read: (path: string, init?: RequestInit) => Promise<Response>;
  get: (id: string, write?: boolean) => Promise<Meeting>;
  save: (m: Meeting) => Promise<Meeting>;
};

export type RouteRequest = { url: URL; body: Record<string, unknown> };

export type Route = {
  verb: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: RegExp;
  /** Workspace readers may call this non-GET route (it does not write workspace data). */
  allowReaders?: boolean;
  handle: (ctx: RouteContext, req: RouteRequest, params: string[]) => Promise<unknown> | unknown;
};

/** Meeting action on an already loaded meeting whose revision matches the request. */
export type MeetingAction = (ctx: RouteContext, req: RouteRequest, m: Meeting, id: string) => Promise<unknown>;

export function createContext(host: BrowserHost, store: Repository, actor: Actor): RouteContext {
  return {
    host,
    store,
    actor,
    read: (path, init) => graph(host, path, init),
    get: (id, write = false) => loadMeeting(store, actor, id, write),
    save: m => storeMeeting(store, actor, m),
  };
}

export function verifyRevision(m: Meeting, body: Record<string, unknown>) {
  assert(m.revision === rev.parse(body.revision), 'Meeting wurde inzwischen geändert. Bitte neu laden.', 409);
}
