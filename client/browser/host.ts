import { z } from 'zod';
import { outputTypes } from '../../shared/model';
const https = z.string().url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.hash && ![...u.searchParams.keys()].some(k => /key|token|secret|sig/i.test(k)); }, 'HTTPS endpoint without credentials required');
const endpoint = z.object({ url: https, resource: z.string().min(1), permissionResource: z.string().min(1), scope: z.string().min(1) }).strict();
export const customerSettingsSchema = z.object({
  language: z.enum(['de','en','fr','es']).default('de'),
  ai: endpoint.extend({ model: z.string().min(1) }).nullable().default(null),
  roleAlpha: endpoint.extend({ tenant: z.string().uuid(), governance: z.object({ searchTool: z.string().regex(/^search_[a-z0-9_]+$/) }).strict().nullable().default(null), meeting: z.boolean().default(false), entities: z.record(z.enum(outputTypes), z.object({ tool: z.string().regex(/^create_[a-z0-9_]+$/), label: z.string().min(1) }).strict()).default({}) }).strict().nullable().default(null),
}).strict();
export type CustomerSettings = z.infer<typeof customerSettingsSchema>;
export type Endpoint = z.infer<typeof endpoint>;
export type BrowserHost = {
  tenantId: string; userId: string; userName: string; webUrl: string; isTeams: boolean; initialMeeting?: string;
  settings: CustomerSettings;
  sharepointAt?: (webUrl: string, path: string, init?: RequestInit) => Promise<Response>;
  onMeetingsChanged?: (meetings: { id: string; title: string }[]) => void;
  // Provided by SPFx: same-site SPHttpClient and AadTokenProvider. No app secrets.
  sharepoint: (path: string, init?: RequestInit) => Promise<Response>;
  token: (resource: string) => Promise<string>;
};
export function endpointFetch(host: BrowserHost, target: Endpoint): typeof fetch {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== target.url) throw new Error('Integration request destination does not match the administrator configuration.');
    const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${await host.token(target.resource)}`);
    return fetch(url, { ...init, credentials: 'omit', redirect: 'error', headers, signal: init.signal || AbortSignal.timeout(90_000) });
  };
}
export async function graph(host: BrowserHost, path: string, init: RequestInit = {}): Promise<Response> {
  if(!path.startsWith('/') || path.startsWith('//') || path.includes('\\'))throw new Error('Invalid Graph path');
  const headers = new Headers(init.headers); headers.set('Authorization', `Bearer ${await host.token('https://graph.microsoft.com')}`);
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, { ...init, headers, redirect:'error',credentials:'omit',signal:AbortSignal.timeout(30_000) });
  if(!r.ok)throw new Error(`Microsoft Graph: HTTP ${r.status}`);
  return r;
}
