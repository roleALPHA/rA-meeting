import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import type { Bootstrap, Meeting } from '../shared/model.js';
import { createBrowserApi } from '../client/browser/runtime.js';
import { connectionSettingsSchema, type BrowserHost } from '../client/browser/host.js';
import { tokenEndpoint } from '../client/browser/rolealpha.js';
import type { CircleResult } from '../client/browser/circles.js';

const finance = { uuid: 'a3731bd7-c586-43a4-9e16-92d0eed82106', name: 'Finance', customerId: 'finance:kreis' };
const lead = { uuid: '9b8d1414-1a55-47d4-8bcb-1321bd3684df', name: 'Finance Lead' };
const board = { uuid: '8da474a2-6677-41fd-a8d6-b713528c92c0', name: 'Geschäftsführung' };

function host(roleAlpha: boolean): BrowserHost {
  return {
    tenantId: tenant,
    userId: user,
    userName: 'Member',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    sharepoint: fakeSharePoint().request,
    token: async () => 'delegated',
    settings: connectionSettingsSchema.parse(
      roleAlpha
        ? {
            roleAlpha: {
              url: 'https://rolealpha.example/mcp',
              resource: 'api://rolealpha',
              scope: 'access_as_user',
              tenant,
            },
          }
        : {},
    ),
  };
}

test('circles and teams for a new meeting are suggested from roleALPHA with read-only tools', async t => {
  const servers: McpServer[] = [];
  let transport: WebStandardStreamableHTTPServerTransport;
  let unitsReadOnly = true;
  let roles: unknown = { roles: [finance, lead], returned: 2 };
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  async function connect() {
    const server = new McpServer({ name: 'rolealpha-test', version: '1.0.0' });
    servers.push(server);
    const answer = (tool: string, payload: () => unknown) => async (args: Record<string, unknown>) => {
      calls.push({ tool, args });
      // roleALPHA answers with JSON in a text block, including its errors.
      return { content: [{ type: 'text' as const, text: JSON.stringify(payload()) }] };
    };
    server.registerTool(
      'search_roles',
      {
        inputSchema: { query: z.string(), limit: z.number().optional() },
        annotations: { readOnlyHint: true, destructiveHint: false },
      },
      answer('search_roles', () => roles),
    );
    server.registerTool(
      'search_organigramms',
      {
        inputSchema: { query: z.string(), limit: z.number().optional(), tenant_uuid: z.string() },
        annotations: unitsReadOnly ? { readOnlyHint: true, destructiveHint: false } : { readOnlyHint: false },
      },
      answer('search_organigramms', () => ({ organigramms: [board, { uuid: 'not-a-uuid', name: 'Broken' }] })),
    );
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
  const connected = host(true);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === tokenEndpoint(connected.settings.roleAlpha!.url))
      return Response.json({ access_token: 'rolealpha-token', expires_in: 300 });
    assert.equal(url, connected.settings.roleAlpha!.url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer rolealpha-token');
    if (init?.method === 'POST' && JSON.parse(String(init.body)).method === 'initialize') await connect();
    return transport.handleRequest(new Request(url, init));
  };

  const api = await createBrowserApi(connected);
  const data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.integrations.circles, true);

  const found = await api.request<CircleResult[]>('/circles/search', { query: ' fin ' });
  assert.deepEqual(found, [
    { id: finance.uuid, name: 'Finance', kind: 'role' },
    { id: lead.uuid, name: 'Finance Lead', kind: 'role' },
    // An entry that is not an entity is left out; the rest of the list stays.
    { id: board.uuid, name: 'Geschäftsführung', kind: 'unit' },
  ]);
  assert.deepEqual(calls, [
    { tool: 'search_roles', args: { query: 'fin', limit: 20 } },
    { tool: 'search_organigramms', args: { query: 'fin', limit: 20, tenant_uuid: tenant } },
  ]);

  // The chosen circle is stored with its roleALPHA ID.
  const meeting = await api.request<Meeting>('/meetings', {
    title: 'Finance tactical',
    circle: 'Finance',
    circleId: finance.uuid,
    templateId: data.templates[0].id,
  });
  assert.equal(meeting.circleId, finance.uuid);

  // A tool that is not read-only is never called; an error answer contributes nothing.
  unitsReadOnly = false;
  roles = { error: 'Keine Berechtigung' };
  calls.length = 0;
  assert.deepEqual(await api.request('/circles/search', {}), []);
  assert.deepEqual(
    calls.map(c => c.tool),
    ['search_roles'],
  );
});

test('without a roleALPHA connection circles stay free text', async () => {
  const api = await createBrowserApi(host(false));
  const data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.integrations.circles, false);
  await assert.rejects(api.request('/circles/search', { query: 'x' }), /roleALPHA/);
});
