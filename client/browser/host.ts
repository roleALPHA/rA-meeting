import { z } from 'zod';
import { AppError } from '../../shared/model';
import type { Theme } from './brand';
import type { Language } from '../../shared/i18n';
import type { ConsentClient } from './consent';
import { roleAlphaEnvironment } from './rolealpha-environment';

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

/**
 * roleALPHA's MCP address and Entra app. The package ships roleALPHA's own installation; a tenant administrator can
 * point the app at another one with a SharePoint tenant property (client/browser/connection.ts). `resource` is the
 * token audience, `scope` the delegated permission granted to the SPFx app, `appUrl` the web application that links
 * open in.
 */
export const roleAlphaEndpoint = z
  .object({
    url: https.default(roleAlphaEnvironment.mcpUrl),
    resource: z.string().trim().min(1).default(roleAlphaEnvironment.resource),
    scope: z.string().trim().min(1).default(roleAlphaEnvironment.scope),
    appUrl: https.default(roleAlphaEnvironment.appUrl),
  })
  .strict();
export type Endpoint = z.infer<typeof roleAlphaEndpoint>;
/** The endpoint plus the roleALPHA organisation (tenant UUID) the signed-in user works in. */
export type RoleAlphaTarget = Endpoint & { tenant: string };

/** What Teams tells the app about where it runs; absent outside Teams. */
export type TeamsContext = {
  /** The meeting chat (or any chat) the tab belongs to. */
  chatId?: string;
  /** `sidePanel`, `content`, `meetingStage` … */
  frameContext?: string;
};

export type BrowserHost = {
  tenantId: string;
  userId: string;
  userName: string;
  /** The SharePoint site the app runs on; only used for consent links and the tenant property. */
  webUrl: string;
  isTeams: boolean;
  language?: Language;
  /** Teams context, read once when the app starts. */
  teams?: TeamsContext | null;
  /** Filled in at start (client/browser/connection.ts); null until the organisation is known. */
  roleAlpha: RoleAlphaTarget | null;
  /** Same-site SharePoint REST of the host page; the app only reads the tenant property with it. */
  sharepoint: (path: string, init?: RequestInit) => Promise<Response>;
  /** Delegated Entra token for a resource (SPFx AadTokenProvider). No app secrets. */
  token: (resource: string) => Promise<string>;
  /** Sign-in authority for the admin consent links (client/browser/consent.ts). */
  consent?: ConsentClient;
  /** Initial colour theme; the host follows changes through the handle mount() returns. */
  theme?: Theme;
  /** Bundled font file name -> URL the host serves it from (SPFx ClientSideAssets, Vite in the preview). */
  fonts?: Record<string, string>;
  /** Per-user browser storage for conveniences such as the chosen organisation; may be missing or throw. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
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

/** Microsoft Graph with the signed-in user's delegated token. */
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
  if (!r.ok)
    throw new AppError(
      r.status === 401 || r.status === 403 ? 403 : 502,
      r.status === 401 || r.status === 403
        ? 'error.graph.permission'
        : r.status === 404
          ? 'error.graph.notFound'
          : 'error.graph.http',
      { status: r.status },
    );
  return r;
}
