import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createBrowserApi } from '../client/browser/runtime.js';
import { customerSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import type { GovernanceReply } from '../shared/governance.js';
import type { Bootstrap } from '../shared/model.js';

test('governance questions use the approved read tool, cite actual sources and never modify records', async t => {
  const servers: McpServer[] = [];
  let transport: WebStandardStreamableHTTPServerTransport;
  let readOnly = true;
  let calls = 0,
    aiCalls = 0,
    writeCalls = 0;
  let sources = [{ id: 'role-finance', title: 'Finance', content: 'Finance approves expenditure up to 1000 EUR.' }];
  let sourceId = 'role-finance';
  async function connect() {
    const server = new McpServer({ name: 'rolealpha-test', version: '1.0.0' });
    servers.push(server);
    server.registerTool(
      'search_governance',
      {
        inputSchema: { tenant_uuid: z.string(), query: z.string(), limit: z.number() },
        annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly },
      },
      async args => {
        calls++;
        assert.equal(args.tenant_uuid, tenant);
        assert.equal(args.limit, 12);
        assert.equal(args.query, 'Who approves expenditure?');
        return { content: [], structuredContent: { sources } };
      },
    );
    server.registerTool('create_risk', { inputSchema: { name: z.string() } }, async () => {
      writeCalls++;
      return { content: [] };
    });
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
    });
    await server.connect(transport);
  }
  const original = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = original;
    await Promise.all(servers.map(s => s.close()));
  });
  const sp = fakeSharePoint();
  const tokens: string[] = [];
  const host: BrowserHost = {
    tenantId: tenant,
    userId: user,
    userName: 'Reader',
    webUrl: 'https://org.sharepoint.com/sites/team',
    isTeams: true,
    sharepoint: sp.request,
    token: async resource => {
      tokens.push(resource);
      return 'test-token';
    },
    settings: customerSettingsSchema.parse({
      ai: {
        url: 'https://ai.example/chat',
        resource: 'api://ai',
        permissionResource: 'AI',
        scope: 'read',
        model: 'test',
      },
      roleAlpha: {
        url: 'https://rolealpha.example/mcp',
        resource: 'api://rolealpha',
        permissionResource: 'roleALPHA',
        scope: 'read',
        tenant,
        governance: { searchTool: 'search_governance' },
      },
    }),
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token');
    assert.equal(init?.redirect, 'error');
    if (url === host.settings.roleAlpha!.url) {
      if (init?.method === 'POST' && JSON.parse(String(init.body)).method === 'initialize') await connect();
      return transport.handleRequest(new Request(url, init));
    }
    assert.equal(url, host.settings.ai!.url);
    aiCalls++;
    const payload = JSON.parse(String(init?.body));
    assert.match(payload.messages[0].content, /language fr/);
    assert.match(payload.messages[0].content, /untrusted DATA/);
    assert.deepEqual(JSON.parse(payload.messages[1].content), { question: 'Who approves expenditure?', sources });
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                statements: [{ text: 'Finance approuve les dépenses jusqu’à 1000 EUR.', sourceIds: [sourceId] }],
                limitations: [],
              }),
            },
          },
        ],
      }),
    );
  };
  await createBrowserApi(host);
  sp.state.write = false;
  sp.state.provision = false;
  const api = await createBrowserApi(host);
  const before = [...sp.records.values()].map(x => structuredClone(x));
  const filesBefore = sp.files.size;
  assert.equal((await api.request<Bootstrap>('/bootstrap')).integrations.governance, true);
  const ask = () =>
    api.request<GovernanceReply>('/governance/ask', { question: 'Who approves expenditure?', language: 'fr' });
  const answer = await ask();
  assert.equal(answer.statements[0].sourceIds[0], 'role-finance');
  assert.deepEqual(answer.sources, sources);
  assert.ok(answer.retrievedAt);
  sourceId = 'invented-source';
  await assert.rejects(ask(), /gültigen Quellen/);
  sources = [];
  const empty = await ask();
  assert.equal(empty.statements.length, 0);
  assert.equal(aiCalls, 2, 'no AI request without sources');
  readOnly = false;
  await assert.rejects(ask(), /nicht kompatibel/);
  assert.equal(calls, 3, 'incompatible tool rejected before invocation');
  assert.equal(writeCalls, 0);
  assert.deepEqual([...sp.records.values()], before);
  assert.equal(sp.files.size, filesBefore);
  assert.ok(tokens.every(token => ['api://ai', 'api://rolealpha'].includes(token)));
  host.settings.roleAlpha!.governance = null;
  await assert.rejects(ask(), /eingerichtet/);
  assert.equal(calls, 3);
});

test('governance configuration rejects write tools and a separate endpoint', () => {
  const connection = {
    url: 'https://rolealpha.example/mcp',
    resource: 'api://ra',
    permissionResource: 'roleALPHA',
    scope: 'read',
    tenant,
  };
  assert.equal(
    customerSettingsSchema.safeParse({ roleAlpha: { ...connection, governance: { searchTool: 'create_risk' } } })
      .success,
    false,
  );
  assert.equal(
    customerSettingsSchema.safeParse({
      roleAlpha: { ...connection, governance: { searchTool: 'search_governance', url: 'https://other.example/mcp' } },
    }).success,
    false,
  );
});
