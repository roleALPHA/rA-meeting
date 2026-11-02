import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { AppError, assert } from '../../shared/model';
import type { MessageId } from '../../shared/i18n';
import { allowedDestination, type BrowserHost, type Endpoint } from './host';

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
/** An exchange without `tenant_uuid` across several organisations: the token can only list them. */
const SCOPE_ORGANISATION_SELECT = 'rolealpha:organisation-select';
const exchanged = z.object({
  access_token: z.string().min(1).max(8000),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().max(86_400).optional(),
  scope: z.string().max(500).optional(),
  tenant_uuid: z.guid().optional(),
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

type Exchange = Issued & { tenant?: string; select: boolean };

/**
 * One RFC 8693 exchange. Without `tenant`, roleALPHA looks for the organisations itself: one answers with a working
 * token and its `tenant_uuid`, several with a token that can only list them. Before roleALPHA offered this, the
 * request was refused as incomplete; that refusal says "ask for the tenant ID".
 */
async function exchange(host: BrowserHost, endpoint: Pick<Endpoint, 'url' | 'resource'>, tenant?: string) {
  const subject = await host.token(endpoint.resource);
  const body = new URLSearchParams({
    grant_type: GRANT_TYPE,
    subject_token: subject,
    subject_token_type: TOKEN_TYPE_ACCESS,
    resource: endpoint.url,
  });
  if (tenant) body.set('tenant_uuid', tenant);
  let response: Response;
  try {
    response = await fetch(tokenEndpoint(endpoint.url), {
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
    // roleALPHA keeps its reasons short on purpose (`error_description` is German and for display only); these are
    // the ones an administrator or the person can act on.
    const id: MessageId =
      response.status === 403
        ? 'error.integrations.rolealphaAccessNotEnabled'
        : detail?.error === 'invalid_grant'
          ? 'error.integrations.rolealphaAccountNotLinked'
          : detail?.error === 'invalid_target'
            ? 'error.integrations.rolealphaInvalidTarget'
            : detail?.error === 'invalid_request' && !tenant
              ? 'error.integrations.rolealphaTenantRequired'
              : 'error.integrations.rolealphaTokenExchangeFailed';
    throw new AppError(response.status === 403 ? 403 : 502, id);
  }
  const parsed = exchanged.safeParse(await response.json().catch(() => null));
  assert(parsed.success, 'error.integrations.rolealphaTokenExchangeFailed', 502);
  const select = parsed.data.scope === SCOPE_ORGANISATION_SELECT;
  // A token for a tenant the app did not ask for is not one it may use.
  assert(
    !tenant || (!select && (parsed.data.tenant_uuid ?? tenant) === tenant),
    'error.integrations.rolealphaTokenExchangeFailed',
    502,
  );
  return {
    token: parsed.data.access_token,
    expires: Date.now() + (parsed.data.expires_in ?? 300) * 1000,
    tenant: tenant ?? parsed.data.tenant_uuid,
    select,
  } satisfies Exchange;
}

/** Exchanges the delegated Entra token; `force` discards a token roleALPHA has just rejected. */
export async function roleAlphaToken(host: BrowserHost, force = false): Promise<string> {
  const settings = target(host);
  const key = `${host.tenantId}:${host.userId}:${settings.url}:${settings.tenant}`;
  const cached = issued.get(key);
  // 30 seconds of slack: a token that expires mid-request is a failed meeting export.
  if (!force && cached && cached.expires > Date.now() + 30_000) return cached.token;
  issued.delete(key);
  const { token, expires } = await exchange(host, settings, settings.tenant);
  issued.set(key, { token, expires });
  return token;
}

/** Sends a roleALPHA token to one MCP address only, and asks for a new token once if it is rejected. */
function mcpFetch(url: string, token: (force: boolean) => Promise<string>): typeof fetch {
  return async (input, init = {}) => {
    const destination = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    assert(allowedDestination(destination, url, 'exact'), 'error.integrations.rolealphaConnected', 502);
    const call = async (force: boolean) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${await token(force)}`);
      return fetch(destination, {
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

/** Sends the exchanged token to the configured MCP endpoint only, and exchanges again once if it is rejected. */
export function roleAlphaFetch(host: BrowserHost): typeof fetch {
  return mcpFetch(target(host).url, force => roleAlphaToken(host, force));
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

/** The tool names roleALPHA offers rA Meetings; setup fills in those its endpoint advertises. */
export const roleAlphaTools = {
  createTool: 'create_entity_draft',
  drafts: 'search_my_drafts',
  governance: 'search_governance',
} as const;
const LIST_ORGANISATIONS = 'list_my_organisations';

const organisationList = z.looseObject({
  organisationen: z.array(z.looseObject({ uuid: z.guid(), name: z.string().trim().min(1).max(300) })).max(500),
});
export type RoleAlphaOrganisation = { uuid: string; name: string };
export type RoleAlphaSetup =
  /** roleALPHA does not find the organisations itself yet; the owner enters the tenant ID. */
  | { status: 'tenantRequired' }
  | { status: 'choose'; organisations: RoleAlphaOrganisation[] }
  | {
      status: 'connected';
      organisation: RoleAlphaOrganisation;
      tools: Partial<Record<keyof typeof roleAlphaTools, string>>;
    };

/** Every advertised tool name, following pagination without looping. */
async function toolNames(client: Client) {
  const names = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const response = await client.listTools(cursor ? { cursor } : {});
    for (const tool of response.tools) names.add(tool.name);
    if (!response.nextCursor || response.nextCursor === cursor) break;
    cursor = response.nextCursor;
  }
  return names;
}

async function organisations(client: Client): Promise<RoleAlphaOrganisation[]> {
  const result = await client.callTool({ name: LIST_ORGANISATIONS, arguments: {} }, undefined, { timeout: 30_000 });
  assert(!result.isError, 'error.integrations.rolealphaOrganisationsUnreadable', 502);
  const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
  let json: unknown = result.structuredContent;
  try {
    json ??= text && 'text' in text ? JSON.parse(String(text.text)) : null;
  } catch {
    json = null;
  }
  const parsed = organisationList.safeParse(json);
  assert(parsed.success, 'error.integrations.rolealphaOrganisationsUnreadable', 502);
  return parsed.data.organisationen.map(({ uuid, name }) => ({ uuid, name }));
}

/** Runs one MCP session with a token that is already exchanged. */
async function withClient<T>(url: string, token: (force: boolean) => Promise<string>, run: (c: Client) => Promise<T>) {
  const client = new Client({ name: 'ra-meetings-setup', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { fetch: mcpFetch(url, token) }), {
      timeout: 15_000,
    });
    return await run(client);
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Setting up the connection: exchange without a tenant and let the owner pick the organisation if there are several
 * (rA-app `doc/ENTRA-TAUSCH.md`), then read `tools/list` with a working token to find the tools rA Meetings uses.
 * Nothing is cached or stored; the owner saves the result.
 */
export async function setupRoleAlpha(
  host: BrowserHost,
  endpoint: Pick<Endpoint, 'url' | 'resource'>,
  tenant?: string,
): Promise<RoleAlphaSetup> {
  let first: Exchange | undefined;
  if (!tenant) {
    try {
      first = await exchange(host, endpoint);
    } catch (e) {
      if (e instanceof AppError && e.id === 'error.integrations.rolealphaTenantRequired')
        return { status: 'tenantRequired' };
      throw e;
    }
    if (first.select) {
      const selection = first;
      const offered = await withClient(endpoint.url, async () => selection.token, organisations);
      assert(offered.length, 'error.integrations.rolealphaAccountNotLinked', 400);
      if (offered.length > 1) return { status: 'choose', organisations: offered };
      first = undefined;
      tenant = offered[0].uuid;
    } else tenant = first.tenant;
    assert(tenant, 'error.integrations.rolealphaTenantRequired', 400);
  }
  const chosen = tenant;
  let work = first;
  const token = async (force: boolean) => {
    if (force || !work) work = await exchange(host, endpoint, chosen);
    return work.token;
  };
  return withClient(endpoint.url, token, async client => {
    const names = await toolNames(client);
    const tools = Object.fromEntries(Object.entries(roleAlphaTools).filter(([, name]) => names.has(name)));
    // The name is for the confirmation only; an endpoint without the tool still connects.
    const named = names.has(LIST_ORGANISATIONS)
      ? (await organisations(client).catch(() => [])).find(o => o.uuid === chosen)
      : undefined;
    return { status: 'connected', organisation: named ?? { uuid: chosen, name: chosen }, tools };
  });
}
