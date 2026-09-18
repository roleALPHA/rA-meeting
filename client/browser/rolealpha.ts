import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { AppError, assert } from '../../shared/model';
import type { MessageId } from '../../shared/i18n';
import { allowedDestination, type BrowserHost } from './host';

/**
 * One way into roleALPHA for all three integrations (governance search, own drafts, writing drafts).
 *
 * roleALPHA's MCP endpoint does not accept Microsoft tokens. The signed-in user's delegated Entra token is
 * exchanged for a short-lived roleALPHA token (RFC 8693) at the token endpoint of the SAME origin, and that token
 * addresses the MCP endpoint. This is the only second address of the roleALPHA integration, and it is
 * derived from the endpoint's origin rather than configured separately.
 *
 * roleALPHA deliberately issues no refresh token: the app holds a valid Entra token anyway and exchanges again.
 * A long-lived key in a SharePoint page would outlive every revocation.
 */
const TOKEN_PATH = '/api/auth/oauth/token';
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const TOKEN_TYPE_ACCESS = 'urn:ietf:params:oauth:token-type:access_token';
const exchanged = z.object({
  access_token: z.string().min(1).max(8000),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().max(86_400).optional(),
});
type Issued = { token: string; expires: number };
/** Per signed-in user, workspace and endpoint; never persisted, so it dies with the tab. */
const issued = new Map<string, Issued>();

export const tokenEndpoint = (mcpUrl: string) => new URL(TOKEN_PATH, mcpUrl).href;

function target(host: BrowserHost) {
  const roleAlpha = host.settings.roleAlpha;
  assert(roleAlpha, 'error.integrations.rolealphaConnected', 503);
  return roleAlpha;
}

/** Exchanges the delegated Entra token; `force` discards a token roleALPHA has just rejected. */
export async function roleAlphaToken(host: BrowserHost, force = false): Promise<string> {
  const settings = target(host);
  const key = `${host.tenantId}:${host.userId}:${settings.url}:${settings.tenant}`;
  const cached = issued.get(key);
  // 30 seconds of slack: a token that expires mid-request is a failed meeting export.
  if (!force && cached && cached.expires > Date.now() + 30_000) return cached.token;
  issued.delete(key);
  const subject = await host.token(settings.resource);
  const body = new URLSearchParams({
    grant_type: GRANT_TYPE,
    subject_token: subject,
    subject_token_type: TOKEN_TYPE_ACCESS,
    tenant_uuid: settings.tenant,
    resource: settings.url,
  });
  let response: Response;
  try {
    response = await fetch(tokenEndpoint(settings.url), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AppError(502, 'error.integrations.rolealphaTokenExchangeFailed');
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    // roleALPHA keeps its reasons short on purpose; these three are the ones an administrator can act on.
    const id: MessageId =
      response.status === 403
        ? 'error.integrations.rolealphaAccessNotEnabled'
        : detail?.error === 'invalid_grant'
          ? 'error.integrations.rolealphaAccountNotLinked'
          : 'error.integrations.rolealphaTokenExchangeFailed';
    throw new AppError(response.status === 403 ? 403 : 502, id);
  }
  const parsed = exchanged.safeParse(await response.json().catch(() => null));
  assert(parsed.success, 'error.integrations.rolealphaTokenExchangeFailed', 502);
  issued.set(key, { token: parsed.data.access_token, expires: Date.now() + (parsed.data.expires_in ?? 300) * 1000 });
  return parsed.data.access_token;
}

/** Sends the exchanged token to the configured MCP endpoint only, and exchanges again once if it is rejected. */
export function roleAlphaFetch(host: BrowserHost): typeof fetch {
  const settings = target(host);
  return async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    assert(allowedDestination(url, settings.url, 'exact'), 'error.integrations.rolealphaConnected', 502);
    const call = async (force: boolean) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${await roleAlphaToken(host, force)}`);
      return fetch(url, {
        ...init,
        credentials: 'omit',
        redirect: 'error',
        headers,
        signal: init.signal || AbortSignal.timeout(90_000),
      });
    };
    const response = await call(false);
    // A revoked or expired exchange shows up here, not at the token endpoint.
    return response.status === 401 ? call(true) : response;
  };
}

/** Connects to roleALPHA's MCP endpoint with an exchanged token. */
export async function connectRoleAlpha(host: BrowserHost, client: Client) {
  const settings = target(host);
  await client.connect(new StreamableHTTPClientTransport(new URL(settings.url), { fetch: roleAlphaFetch(host) }), {
    timeout: 15_000,
  });
}

/** Finds one advertised tool by name, following pagination without looping. */
export async function findTool(client: Client, name: string, incompatible: MessageId) {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const response = await client.listTools(cursor ? { cursor } : {});
    const tool = response.tools.find(t => t.name === name);
    if (tool || !response.nextCursor) return tool;
    assert(!seen.has(response.nextCursor), incompatible, 502);
    seen.add(response.nextCursor);
    cursor = response.nextCursor;
  }
  return undefined;
}

/** The declared input properties of a tool, for contract checks. */
export const toolProperties = (tool: { inputSchema: { properties?: unknown } } | undefined) =>
  tool?.inputSchema.properties as Record<string, { type?: string }> | undefined;
