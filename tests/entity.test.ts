import { test } from 'node:test';
import assert from 'node:assert/strict';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { entityPlan, meetingPlan, prepareExport } from '../client/browser/integrations.js';
import { tokenEndpoint } from '../client/browser/rolealpha.js';
import { addOutcome, command, createMeeting, saveTemplate } from '../shared/domain.js';
import { TestStore, actor, testHost } from './helpers/workspace.js';
import type { Template } from '../shared/model.js';

test('browser export requires approval, uses delegated roleALPHA contract and confirms a draft', async t => {
  const host = testHost();
  const servers: McpServer[] = [];
  let transport: WebStandardStreamableHTTPServerTransport;
  let writes = 0;
  let exchanges = 0;
  let compatible = true;
  const original = globalThis.fetch;
  t.after(async () => {
    globalThis.fetch = original;
    await Promise.all(servers.map(s => s.close()));
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(init?.redirect, 'error');
    // The delegated Microsoft token is exchanged for a roleALPHA token before the endpoint is called.
    if (url === tokenEndpoint(host.settings.roleAlpha!.url)) {
      exchanges++;
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:token-exchange');
      assert.equal(body.get('subject_token'), 'test-token');
      assert.equal(body.get('tenant_uuid'), actor.tenantId);
      assert.equal(body.get('resource'), host.settings.roleAlpha!.url);
      return Response.json({ access_token: 'rolealpha-token', token_type: 'Bearer', expires_in: 300 });
    }
    assert.equal(url, host.settings.roleAlpha!.url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer rolealpha-token');
    if (init?.method === 'POST' && JSON.parse(String(init.body)).method === 'initialize') {
      const server = new McpServer({ name: 'rolealpha-test', version: '1' });
      servers.push(server);
      {
        server.registerTool(
          'create_entity_draft',
          {
            inputSchema: compatible
              ? { entity_type: z.string(), name: z.string(), custom_id: z.string(), data: z.record(z.unknown()) }
              : { name: z.string() },
          },
          async (args: Record<string, unknown>) => {
            writes++;
            // roleALPHA takes the tenant from the token; the app must not send one.
            assert.equal(args.tenant_uuid, undefined);
            assert.ok(['risk', 'meeting'].includes(String(args.entity_type)));
            assert.ok(String(args.custom_id).startsWith('ra-meeting:'));
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({ draft_created: true, draftId: 'draft', entityUuid: 'risk', status: 'draft' }),
                },
              ],
            };
          },
        );
      }
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
      });
      await server.connect(transport);
    }
    return transport.handleRequest(new Request(url, init));
  };
  const store = new TestStore(actor.tenantId);
  await store.initialize();
  await store.seed(actor.tenantId);
  let template = (await store.list<Template>(actor.tenantId, 'template'))[0];
  const step = template.steps.find(s => s.kind === 'agenda')!;
  step.outputs = ['risk', 'okr', 'it_system'];
  template = await saveTemplate(store, actor, template, template.id, template.version);
  const meeting = await createMeeting(store, actor, { templateId: template.id, title: 'Weekly', circle: 'Team' });
  addOutcome(meeting, actor, { stepId: step.id, type: 'risk', title: 'Lieferausfall' });
  const output = meeting.outcomes[0];
  assert.throws(() => entityPlan(host, meeting, output), /bestätigte/);
  assert.throws(() => meetingPlan(host, meeting, [output]), /bestätigte/);
  command(meeting, actor, { type: 'outcome.review', id: output.id, status: 'approved' });
  assert.throws(() => entityPlan(host, meeting, { ...output, type: 'it_system' }), /kein MCP-Ziel/);
  const plan = entityPlan(host, meeting, output);
  const connection = await prepareExport(host, plan, host.settings.roleAlpha!);
  assert.equal(writes, 0, 'preview and contract validation never write');
  assert.equal((await connection.send()).entityUuid, 'risk');
  assert.equal(writes, 1);
  await connection.close();
  const meetingConnection = await prepareExport(host, meetingPlan(host, meeting, [output]), host.settings.roleAlpha!);
  assert.equal((await meetingConnection.send()).status, 'draft');
  assert.equal(writes, 2);
  await meetingConnection.close();
  compatible = false;
  await assert.rejects(prepareExport(host, plan, host.settings.roleAlpha!), /Erstellvertrag/);
  assert.equal(writes, 2);
  // One exchanged token serves every call until it expires.
  assert.equal(exchanges, 1);
  host.settings.roleAlpha = null;
  assert.throws(() => entityPlan(host, meeting, output), /kein MCP-Ziel/);
});
