import { z } from 'zod';
import { outputTypes } from '../../shared/model';
const https = z
  .string()
  .url()
  .refine(value => {
    const u = new URL(value);
    return (
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      !u.hash &&
      ![...u.searchParams.keys()].some(k => /key|token|secret|sig/i.test(k))
    );
  }, 'HTTPS endpoint without credentials required');
const endpoint = z
  .object({ url: https, resource: z.string().min(1), permissionResource: z.string().min(1), scope: z.string().min(1) })
  .strict();
/** Microsoft 365 Copilot Chat API (Work IQ) with the signed-in user's delegated permission. */
const copilotSettings = endpoint
  .extend({
    provider: z.literal('copilot'),
    url: https.default('https://workiq.svc.cloud.microsoft/rest'),
    scope: z.string().min(1).default('WorkIQAgent.Ask'),
    /** Upper bound for instructions plus context sent in one request; verify against the tenant's limits. */
    maxInputChars: z.number().int().min(1_000).max(1_000_000).default(200_000),
  })
  .strict();
/** Claude through a Microsoft Foundry deployment, authenticated with Microsoft Entra ID. */
const claudeFoundrySettings = endpoint
  .extend({
    provider: z.literal('claude-foundry'),
    resource: z.string().min(1).default('https://ai.azure.com'),
    /** Foundry deployment name, passed as the model parameter. */
    model: z.string().min(1).default('claude-opus-5'),
    /** Optional deployment that retries requests the primary model declines. */
    fallbackModel: z.string().min(1).nullable().default(null),
  })
  .strict();
const openAiCompatibleSettings = endpoint
  .extend({ provider: z.literal('openai-compatible'), model: z.string().min(1) })
  .strict();
export const customerSettingsSchema = z
  .object({
    language: z.enum(['de', 'en', 'fr', 'es']).default('de'),
    ai: z
      .preprocess(
        // Configurations from before provider selection existed use the OpenAI-compatible adapter.
        value =>
          value && typeof value === 'object' && !('provider' in value)
            ? { ...value, provider: 'openai-compatible' }
            : value,
        z.discriminatedUnion('provider', [copilotSettings, claudeFoundrySettings, openAiCompatibleSettings]),
      )
      .nullable()
      .default(null),
    roleAlpha: endpoint
      .extend({
        tenant: z.string().uuid(),
        governance: z
          .object({ searchTool: z.string().regex(/^search_[a-z0-9_]+$/) })
          .strict()
          .nullable()
          .default(null),
        meeting: z.boolean().default(false),
        entities: z
          .record(
            z.enum(outputTypes),
            z.object({ tool: z.string().regex(/^create_[a-z0-9_]+$/), label: z.string().min(1) }).strict(),
          )
          .default({}),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type CustomerSettings = z.infer<typeof customerSettingsSchema>;
export type Endpoint = z.infer<typeof endpoint>;
export type AiSettings = NonNullable<CustomerSettings['ai']>;
export type AiProviderName = AiSettings['provider'];
export type BrowserHost = {
  tenantId: string;
  userId: string;
  userName: string;
  webUrl: string;
  isTeams: boolean;
  initialMeeting?: string;
  settings: CustomerSettings;
  sharepointAt?: (webUrl: string, path: string, init?: RequestInit) => Promise<Response>;
  onMeetingsChanged?: (meetings: { id: string; title: string }[]) => void;
  // Provided by SPFx: same-site SPHttpClient and AadTokenProvider. No app secrets.
  sharepoint: (path: string, init?: RequestInit) => Promise<Response>;
  token: (resource: string) => Promise<string>;
};
/** True when url is the configured endpoint or, for 'prefix', a path below it on the same origin. */
export function allowedDestination(url: string, configured: string, match: 'exact' | 'prefix') {
  if (url === configured) return true;
  if (match === 'exact') return false;
  let actual: URL, base: URL;
  try {
    actual = new URL(url);
    base = new URL(configured);
  } catch {
    return false;
  }
  const root = base.pathname.replace(/\/$/, '');
  return (
    actual.origin === base.origin &&
    !actual.username &&
    !actual.password &&
    !actual.hash &&
    !actual.pathname.includes('..') &&
    (actual.pathname === root || actual.pathname.startsWith(root + '/'))
  );
}
export function endpointFetch(host: BrowserHost, target: Endpoint, match: 'exact' | 'prefix' = 'exact'): typeof fetch {
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!allowedDestination(url, target.url, match))
      throw new Error('Integration request destination does not match the administrator configuration.');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await host.token(target.resource)}`);
    return fetch(url, {
      ...init,
      credentials: 'omit',
      redirect: 'error',
      headers,
      signal: init.signal || AbortSignal.timeout(90_000),
    });
  };
}
export async function graph(host: BrowserHost, path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) throw new Error('Invalid Graph path');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await host.token('https://graph.microsoft.com')}`);
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers,
    redirect: 'error',
    credentials: 'omit',
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Microsoft Graph: HTTP ${r.status}`);
  return r;
}
