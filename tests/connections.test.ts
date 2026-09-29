import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApi } from '../client/browser/runtime.js';
import { noConnections, type BrowserHost, type ConnectionSettings } from '../client/browser/host.js';
import { loadConnections, testConnection, type ConnectionsState } from '../client/browser/connections.js';
import { fakeSharePoint, roles, tenant, user } from './helpers/sharepoint-rest.js';
import type { Bootstrap } from '../shared/model.js';

const ai = {
  provider: 'openai-compatible',
  url: 'https://ai.customer.example/v1/chat/completions',
  resource: 'api://customer-ai',
  model: 'customer-model',
};
const roleAlpha = {
  url: 'https://rolealpha.customer.example/api/mcp',
  resource: 'api://rolealpha',
  tenant,
  meeting: true,
  entities: { risk: { entityType: 'risk', label: 'Risiko' } },
};

function hostFor(
  sp: ReturnType<typeof fakeSharePoint>,
  token: BrowserHost['token'] = async () => 'delegated',
): BrowserHost {
  return {
    tenantId: tenant,
    userId: user,
    userName: 'Owner',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    settings: noConnections,
    sharepoint: sp.request,
    token,
  };
}

function mockFetch(t: { after: (fn: () => void) => void }, handler: (url: string, init: RequestInit) => Response) {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (input, init = {}) =>
    handler(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init);
}

test('site owners save connections; they apply at once and to every later start of the app', async () => {
  const sp = fakeSharePoint();
  const host = hostFor(sp);
  const api = await createBrowserApi(host);
  let data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.canManageConnections, true);
  assert.equal(data.integrations.ai, false);
  assert.equal((await api.request<ConnectionsState>('/connections')).protection, 'missing');

  const saved = await api.request<ConnectionsState>('/connections', { settings: { ai, roleAlpha }, version: 0 }, 'PUT');
  assert.equal(saved.version, 1);
  assert.equal(saved.settings.ai?.scope, 'access_as_user', 'schema defaults apply');
  data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.integrations.ai, true);
  assert.equal(data.integrations.mcp, true);
  assert.deepEqual(data.integrations.entityTypes, ['risk']);

  const later = hostFor(sp);
  await createBrowserApi(later);
  assert.equal(later.settings.ai?.url, ai.url);

  await assert.rejects(
    api.request('/connections', { settings: { ai: null, roleAlpha: null }, version: 0 }, 'PUT'),
    /geändert/,
  );
  await api.request('/connections', { settings: { ai: null, roleAlpha: null }, version: 1 }, 'PUT');
  assert.equal(host.settings.ai, null);
});

test('the connections list is narrowed on creation: members keep reading, only owners keep writing', async () => {
  const sp = fakeSharePoint();
  const api = await createBrowserApi(hostFor(sp));
  await api.request('/connections', { settings: { ai, roleAlpha: null }, version: 0 }, 'PUT');
  const bindings = new Map(
    sp.connections.assignments.map(a => [a.PrincipalId, a.RoleDefinitionBindings.map(b => b.Id)]),
  );
  assert.deepEqual(bindings.get(3), [roles.fullControl.Id], 'owners unchanged');
  assert.deepEqual(bindings.get(5), [roles.read.Id], 'members: Edit becomes Read');
  assert.deepEqual(bindings.get(4), [roles.read.Id], 'visitors unchanged');
  assert.deepEqual(bindings.get(7), [roles.limitedAccess.Id], 'limited access untouched');
  assert.equal(sp.connections.unique, true);
});

test('members, even with Manage Lists, cannot change connections or run the connection test', async () => {
  const sp = fakeSharePoint();
  const owner = await createBrowserApi(hostFor(sp));
  await owner.request('/connections', { settings: { ai, roleAlpha: null }, version: 0 }, 'PUT');
  sp.state.owner = false; // SharePoint's Edit level: ManageLists, but not ManagePermissions
  const member = await createBrowserApi(hostFor(sp));
  const data = await member.request<Bootstrap>('/bootstrap');
  assert.equal(data.canManageWorkspace, true);
  assert.equal(data.canManageConnections, false);
  assert.equal(data.integrations.ai, true, 'members use the connections');
  await assert.rejects(
    member.request('/connections', { settings: { ai: null, roleAlpha: null }, version: 1 }, 'PUT'),
    /Websitebesitzer/,
  );
  await assert.rejects(member.request('/connections'), /Websitebesitzer/);
  await assert.rejects(member.request('/connections/test', { part: 'ai', settings: { ai } }), /Websitebesitzer/);
});

test('connections are off when the protection is gone or the stored value is invalid, until an owner saves', async () => {
  const sp = fakeSharePoint();
  const owner = hostFor(sp);
  const api = await createBrowserApi(owner);
  await api.request('/connections', { settings: { ai, roleAlpha }, version: 0 }, 'PUT');

  sp.connections.unique = false; // someone restored inherited permissions
  const reader = hostFor(sp);
  reader.settings = { ai: null, roleAlpha: null } as ConnectionSettings;
  await createBrowserApi(reader);
  assert.deepEqual(reader.settings, noConnections);
  assert.equal((await loadConnections(sp.request)).protection, 'unprotected');
  await api.request('/connections', { settings: { ai, roleAlpha }, version: 1 }, 'PUT');
  assert.equal(sp.connections.unique, true, 'saving protects again');
  assert.equal((await loadConnections(sp.request)).settings.ai?.url, ai.url);

  // An edited item with a key in the configuration is not used.
  const item = sp.connections.items.get(1)!;
  const stored = JSON.parse(item.Settings);
  stored.settings.ai.apiKey = 'secret';
  item.Settings = JSON.stringify(stored);
  const state = await loadConnections(sp.request);
  assert.equal(state.invalid, true);
  assert.deepEqual(state.settings, noConnections);
  await api.request('/connections', { settings: { ai, roleAlpha: null }, version: state.version }, 'PUT');
  assert.equal((await loadConnections(sp.request)).invalid, false);

  sp.connections.items.get(1)!.Settings = '{not json';
  assert.equal((await loadConnections(sp.request)).invalid, true);
});

test('the schema still rejects secrets and foreign tool names in the form', async () => {
  const api = await createBrowserApi(hostFor(fakeSharePoint()));
  for (const settings of [
    { ai: { ...ai, apiKey: 'secret' }, roleAlpha: null },
    { ai: { ...ai, url: 'https://ai.customer.example/chat?api-key=x' }, roleAlpha: null },
    { ai: null, roleAlpha: { ...roleAlpha, governance: { searchTool: 'delete_everything' } } },
    { ai: null, roleAlpha: { ...roleAlpha, tenant: 'not-a-uuid' } },
  ])
    await assert.rejects(api.request('/connections', { settings, version: 0 }, 'PUT'), /Eingaben/);
});

test('the connection test tells a missing permission from an unreachable service and a working one', async t => {
  const sp = fakeSharePoint();
  let reachable = true;
  mockFetch(t, url => {
    if (!reachable) throw new TypeError('Failed to fetch');
    assert.equal(url, ai.url);
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  });
  const settings = { ai, roleAlpha: null };
  assert.equal(await testConnection(hostFor(sp), 'ai', settings), 'connections.aiTestPassed');

  const denied = hostFor(sp, async () => {
    throw new Error('AADSTS65001: consent required');
  });
  await assert.rejects(testConnection(denied, 'ai', settings), /api:\/\/customer-ai.*Berechtigung/);

  reachable = false;
  await assert.rejects(testConnection(hostFor(sp), 'ai', settings), /CORS/);
});

test('the roleALPHA test checks the token exchange and that the configured tools are offered', async t => {
  const sp = fakeSharePoint();
  let tools = ['create_entity_draft'];
  mockFetch(t, (url, init) => {
    if (url.endsWith('/api/auth/oauth/token')) return Response.json({ access_token: 'ra', expires_in: 300 });
    const body = JSON.parse(String(init.body)) as { id?: number; method: string };
    const reply = (result: unknown) =>
      Response.json({ jsonrpc: '2.0', id: body.id, result }, { headers: { 'Content-Type': 'application/json' } });
    if (body.method === 'initialize')
      return reply({
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'ra', version: '1' },
      });
    if (body.method === 'tools/list')
      return reply({ tools: tools.map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) });
    return new Response(null, { status: 202 });
  });
  const settings = { ai: null, roleAlpha: { ...roleAlpha, governance: { searchTool: 'search_governance' } } };
  await assert.rejects(testConnection(hostFor(sp), 'roleAlpha', settings), /search_governance/);
  tools = ['create_entity_draft', 'search_governance'];
  assert.equal(await testConnection(hostFor(sp), 'roleAlpha', settings), 'connections.rolealphaTestPassed');
});
