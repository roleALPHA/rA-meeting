import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  roleAlphaFetch,
  roleAlphaToken,
  setupRoleAlpha,
  tokenEndpoint,
  type RoleAlphaSetup,
} from '../client/browser/rolealpha.js';
import { roleAlphaEnvironment } from '../client/browser/rolealpha-environment.js';
import { connectionSettingsSchema, noConnections, type BrowserHost } from '../client/browser/host.js';
import { createBrowserApi } from '../client/browser/runtime.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';

const url = 'https://rolealpha.example/api/mcp';
/** A fresh tenant per test, because an exchanged token is cached per user, workspace and endpoint. */
function fixture(workspace = crypto.randomUUID()) {
  const tokens: string[] = [];
  const host: BrowserHost = {
    tenantId: workspace,
    userId: user,
    userName: 'Member',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    sharepoint: fakeSharePoint().request,
    token: async resource => {
      tokens.push(resource);
      return 'entra-token';
    },
    settings: connectionSettingsSchema.parse({
      roleAlpha: {
        url,
        resource: 'api://rolealpha',
        scope: 'access_as_user',
        tenant,
      },
    }),
  };
  return { host, tokens };
}

test('the delegated Microsoft token is exchanged at the endpoint of the same origin', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host, tokens } = fixture();
  const bodies: URLSearchParams[] = [];
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://rolealpha.example/api/auth/oauth/token');
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    bodies.push(new URLSearchParams(String(init?.body)));
    return Response.json({ access_token: `token-${bodies.length}`, token_type: 'Bearer', expires_in: 300 });
  };
  assert.equal(tokenEndpoint(url), 'https://rolealpha.example/api/auth/oauth/token');
  assert.equal(await roleAlphaToken(host), 'token-1');
  // A valid token is reused; only `force` asks for a new one.
  assert.equal(await roleAlphaToken(host), 'token-1');
  assert.equal(await roleAlphaToken(host, true), 'token-2');
  assert.deepEqual(
    bodies.map(b => [b.get('grant_type'), b.get('subject_token'), b.get('tenant_uuid'), b.get('resource')]),
    [
      ['urn:ietf:params:oauth:grant-type:token-exchange', 'entra-token', tenant, url],
      ['urn:ietf:params:oauth:grant-type:token-exchange', 'entra-token', tenant, url],
    ],
  );
  assert.deepEqual(tokens, ['api://rolealpha', 'api://rolealpha']);
});

test('an expired exchange is repeated once; other destinations are refused', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const { host } = fixture();
  let exchanges = 0;
  const seen: string[] = [];
  globalThis.fetch = async (input, init) => {
    const target = String(input);
    if (target === tokenEndpoint(url)) {
      exchanges++;
      return Response.json({ access_token: `token-${exchanges}`, expires_in: 300 });
    }
    seen.push(String(new Headers(init?.headers).get('Authorization')));
    return new Response(null, { status: seen.length === 1 ? 401 : 204 });
  };
  const call = roleAlphaFetch(host);
  assert.equal((await call(url, { method: 'POST' })).status, 204);
  assert.deepEqual(seen, ['Bearer token-1', 'Bearer token-2']);
  assert.equal(exchanges, 2);
  await assert.rejects(call('https://attacker.example/api/mcp'), /roleALPHA/);
  assert.equal(seen.length, 2);
});

test('roleALPHA’s refusals are shown as what an administrator can act on', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const cases: [number, string, RegExp][] = [
    [403, 'access_denied', /widerrufen|freigeschaltet/],
    [400, 'invalid_grant', /Mit Microsoft anmelden/],
    [400, 'invalid_target', /MCP-Adresse/],
    [400, 'invalid_request', /Anmeldung bei roleALPHA/],
    [500, 'server_error', /Anmeldung bei roleALPHA/],
  ];
  for (const [status, code, expected] of cases) {
    globalThis.fetch = async () => Response.json({ error: code }, { status });
    await assert.rejects(roleAlphaToken(fixture().host), expected);
  }
  // A malformed answer is not a token either.
  globalThis.fetch = async () => Response.json({ token_type: 'Bearer' });
  await assert.rejects(roleAlphaToken(fixture().host), /Anmeldung bei roleALPHA/);
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  await assert.rejects(roleAlphaToken(fixture().host), /Anmeldung bei roleALPHA/);
});

test('the shipped roleALPHA installation is the default; only the tenant has to be set', () => {
  const { roleAlpha } = connectionSettingsSchema.parse({
    roleAlpha: { tenant, drafts: { searchTool: 'search_my_drafts' } },
  });
  assert.equal(roleAlpha?.url, 'https://rolealpha.app/api/mcp');
  assert.equal(roleAlpha?.resource, 'api://4bd22250-d811-4905-97a4-cb2bf69f98fa');
  assert.equal(roleAlpha?.scope, 'access_as_user');
  assert.equal(roleAlpha?.drafts?.appUrl, 'https://rolealpha.app');
  assert.equal(tokenEndpoint(roleAlpha!.url), 'https://rolealpha.app/api/auth/oauth/token');
  assert.equal(connectionSettingsSchema.safeParse({ roleAlpha: {} }).success, false, 'the tenant is not guessed');
});

const other = '33333333-3333-4333-8333-333333333333';
type Exchanged = { body: URLSearchParams; token: string };

/**
 * roleALPHA as the contract describes it: the token endpoint answers `exchange`, and the MCP endpoint lists tools by
 * token. A selection token sees only list_my_organisations.
 */
function fakeRoleAlpha(
  t: { after: (fn: () => Promise<void> | void) => void },
  exchange: (body: URLSearchParams) => Response,
  organisations = [{ uuid: tenant, name: 'fifty1 GmbH' }],
) {
  const original = globalThis.fetch;
  const servers: McpServer[] = [];
  const exchanges: Exchanged[] = [];
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
  t.after(async () => {
    globalThis.fetch = original;
    await Promise.all(servers.map(s => s.close()));
  });
  async function session(token: string) {
    const server = new McpServer({ name: 'rolealpha-test', version: '1.0.0' });
    servers.push(server);
    server.registerTool('list_my_organisations', { inputSchema: {} }, async () => ({
      content: [{ type: 'text', text: JSON.stringify({ organisationen: organisations, angabeNoetig: false }) }],
    }));
    if (token !== 'select-token') {
      server.registerTool('create_entity_draft', { inputSchema: { name: z.string() } }, async () => ({ content: [] }));
      server.registerTool('search_my_drafts', { inputSchema: { query: z.string() } }, async () => ({ content: [] }));
      server.registerTool('ask_ralph', { inputSchema: { question: z.string() } }, async () => ({ content: [] }));
    }
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
    });
    await server.connect(transport);
    transports.set(token, transport);
  }
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.credentials, 'omit');
    if (url === tokenEndpoint(roleAlphaEnvironment.mcpUrl)) {
      const body = new URLSearchParams(String(init?.body));
      const response = exchange(body);
      const json = response.ok ? ((await response.clone().json()) as { access_token: string }) : null;
      exchanges.push({ body, token: json?.access_token ?? '' });
      return response;
    }
    assert.equal(url, roleAlphaEnvironment.mcpUrl);
    const token = String(new Headers(init?.headers).get('Authorization')).replace('Bearer ', '');
    if (init?.method === 'POST' && JSON.parse(String(init.body)).method === 'initialize') await session(token);
    return transports.get(token)!.handleRequest(new Request(url, init));
  };
  return exchanges;
}

const endpoint = { url: roleAlphaEnvironment.mcpUrl, resource: roleAlphaEnvironment.resource };

test('before roleALPHA finds the organisation itself, setup asks for the tenant ID and then fills the tools', async t => {
  const exchanges = fakeRoleAlpha(t, body =>
    body.get('tenant_uuid')
      ? Response.json({ access_token: 'work-token', expires_in: 3600, scope: 'rolealpha:full' })
      : Response.json(
          { error: 'invalid_request', error_description: 'tenant_uuid ist erforderlich.' },
          { status: 400 },
        ),
  );
  const { host, tokens } = fixture();
  assert.deepEqual(await setupRoleAlpha(host, endpoint), { status: 'tenantRequired' });
  const connected = await setupRoleAlpha(host, endpoint, tenant);
  assert.deepEqual(connected, {
    status: 'connected',
    organisation: { uuid: tenant, name: 'fifty1 GmbH' },
    tools: { createTool: 'create_entity_draft', drafts: 'search_my_drafts', governance: 'ask_ralph' },
  } satisfies RoleAlphaSetup);
  assert.deepEqual(
    exchanges.map(e => [e.body.get('tenant_uuid'), e.body.get('resource'), e.body.get('subject_token')]),
    [
      [null, roleAlphaEnvironment.mcpUrl, 'entra-token'],
      [tenant, roleAlphaEnvironment.mcpUrl, 'entra-token'],
    ],
  );
  assert.deepEqual(tokens, [roleAlphaEnvironment.resource, roleAlphaEnvironment.resource]);
});

test('with one organisation the first exchange already connects', async t => {
  const exchanges = fakeRoleAlpha(t, () =>
    Response.json({ access_token: 'work-token', expires_in: 3600, scope: 'rolealpha:full', tenant_uuid: tenant }),
  );
  const connected = await setupRoleAlpha(fixture().host, endpoint);
  assert.equal(connected.status, 'connected');
  assert.deepEqual(connected.status === 'connected' && connected.organisation, { uuid: tenant, name: 'fifty1 GmbH' });
  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].body.has('tenant_uuid'), false);
});

test('with several organisations the owner chooses, and the chosen one is exchanged again', async t => {
  const organisations = [
    { uuid: tenant, name: 'fifty1 GmbH' },
    { uuid: other, name: 'Merkur Gaming' },
  ];
  const exchanges = fakeRoleAlpha(
    t,
    body =>
      body.get('tenant_uuid')
        ? Response.json({ access_token: 'work-token', expires_in: 3600, scope: 'rolealpha:full' })
        : Response.json({ access_token: 'select-token', expires_in: 3600, scope: 'rolealpha:organisation-select' }),
    organisations,
  );
  const { host } = fixture();
  assert.deepEqual(await setupRoleAlpha(host, endpoint), { status: 'choose', organisations });
  const connected = await setupRoleAlpha(host, endpoint, other);
  assert.deepEqual(connected.status === 'connected' && connected.organisation, { uuid: other, name: 'Merkur Gaming' });
  assert.deepEqual(
    exchanges.map(e => [e.body.get('tenant_uuid'), e.token]),
    [
      [null, 'select-token'],
      [other, 'work-token'],
    ],
  );
});

test('a token for an organisation the app did not ask for is refused', async t => {
  fakeRoleAlpha(t, () => Response.json({ access_token: 'work-token', tenant_uuid: other }));
  await assert.rejects(setupRoleAlpha(fixture().host, endpoint, tenant), /Anmeldung bei roleALPHA/);
});

test('site owners connect through the app with the shipped values', async t => {
  fakeRoleAlpha(t, () => Response.json({ access_token: 'work-token', expires_in: 3600, tenant_uuid: tenant }));
  const sp = fakeSharePoint();
  const { host } = fixture();
  const api = await createBrowserApi({ ...host, sharepoint: sp.request, settings: noConnections });
  const result = await api.request<RoleAlphaSetup>('/connections/rolealpha', {});
  assert.equal(result.status, 'connected');
  sp.state.owner = false;
  await assert.rejects(api.request('/connections/rolealpha', {}), /Websitebesitzer/);
});
