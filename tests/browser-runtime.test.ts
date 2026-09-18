import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserApi } from '../client/browser/runtime.js';
import { customerSettingsSchema, endpointFetch, type BrowserHost } from '../client/browser/host.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import { SharePointRestStore } from '../shared/storage/sharepoint-rest.js';
import type { Bootstrap, Meeting } from '../shared/model.js';
const webUrl = 'https://customer.sharepoint.com/sites/circle';
function fixture() {
  const sp = fakeSharePoint();
  const tokens: string[] = [];
  const host: BrowserHost = {
    tenantId: tenant,
    userId: user,
    userName: 'Member',
    webUrl,
    isTeams: true,
    settings: customerSettingsSchema.parse({}),
    sharepoint: sp.request,
    token: async resource => {
      tokens.push(resource);
      return 'delegated-test';
    },
  };
  return { sp, tokens, host };
}
test('browser workspace creates, edits and reloads meetings directly in SharePoint without server, Graph identity or tokens', async () => {
  const { host, sp, tokens } = fixture();
  const api = await createBrowserApi(host);
  let data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.actor.workspace, 'write');
  assert.equal(data.templates.length, 3);
  assert.equal(data.integrations.mcp, false);
  const template = data.templates.find(t => t.category === 'governance')!;
  let m = await api.request<Meeting>('/meetings', {
    title: 'Browser meeting',
    circle: 'Circle',
    templateId: template.id,
  });
  m = await api.request<Meeting>(`/meetings/${m.id}/command`, {
    revision: m.revision,
    type: 'agenda.add',
    stepId: template.steps[2].id,
    title: 'Need a decision',
  });
  m = await api.request<Meeting>(`/meetings/${m.id}/command`, {
    revision: m.revision,
    type: 'agenda.proposal',
    id: m.agenda[0].id,
    proposal: 'Reviewed proposal',
    objections: 'Concern',
  });
  const reopened = await createBrowserApi(host);
  assert.deepEqual(await reopened.request(`/meetings/${m.id}`), m);
  await assert.rejects(api.request(`/meetings/${m.id}/command`, { revision: 1, type: 'start' }), /geändert/);
  await assert.rejects(
    api.request(`/meetings/${m.id}/assist`, {
      revision: m.revision,
      input: { mode: 'proposal', agendaId: m.agenda[0].id },
    }),
    /nicht konfiguriert/,
  );
  assert.equal(tokens.length, 0);
  assert.ok(sp.calls.every(c => c.path.startsWith('/web/')));
  const other = await createBrowserApi({ ...host, userId: '55555555-5555-4555-8555-555555555555' });
  data = await other.request('/bootstrap');
  assert.equal(
    data.meetings.length,
    1,
    'SharePoint workspace is the access boundary, not a fake client-side private membership list',
  );
  sp.state.write = false;
  sp.state.provision = false;
  const reader = await createBrowserApi(host);
  assert.equal((await reader.request<Bootstrap>('/bootstrap')).actor.workspace, 'read');
  await assert.rejects(
    reader.request(`/meetings/${m.id}/command`, { revision: m.revision, type: 'start' }),
    /Berechtigung/,
  );
  // Revocation is also enforced by the backing Microsoft API, even for an existing editor instance.
  await assert.rejects(
    api.request(`/meetings/${m.id}/command`, { revision: m.revision, type: 'start' }),
    /Berechtigung/,
  );
  await assert.rejects(api.request('https://attacker.invalid/bootstrap'), /interne Anfrage/);
});
test('SharePoint REST snapshots and ETags reject concurrent writes and foreign tenants', async () => {
  const { host, sp } = fixture();
  const store = new SharePointRestStore(tenant, webUrl, host.sharepoint);
  await store.initialize();
  await store.save(tenant, 'meeting', 'one', 1, { text: 'x'.repeat(100_000) });
  const writes = await Promise.allSettled([
    store.save(tenant, 'meeting', 'one', 2, { text: 'A' }, 1),
    store.save(tenant, 'meeting', 'one', 2, { text: 'B' }, 1),
  ]);
  assert.equal(writes.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(writes.filter(r => r.status === 'rejected').length, 1);
  await assert.rejects(store.get('other', 'meeting', 'one'), /Mandant/);
  assert.ok(
    [...sp.records.values()].every(r => !('text' in r)),
    'index contains no transcript payload',
  );
  await store.delete(tenant, 'meeting', 'one', 2);
  await assert.rejects(store.get(tenant, 'meeting', 'one'), /nicht gefunden/);
  assert.equal(sp.files.size, 2, 'old snapshots stay under customer retention');
  assert.equal(sp.recycled.length, 1, 'the rejected concurrent upload goes to the recycle bin');
});
test('browser integration configuration rejects secrets; delegated tokens go only to the exact approved endpoint', async t => {
  const { host, tokens } = fixture();
  const target = {
    url: 'https://ai.customer.example/completions',
    resource: 'api://customer-ai',
    permissionResource: 'Customer AI',
    scope: 'access_as_user',
  };
  assert.equal(
    customerSettingsSchema.safeParse({ ai: { ...target, model: 'model', apiKey: 'secret' } }).success,
    false,
  );
  assert.equal(
    customerSettingsSchema.safeParse({
      ai: { ...target, url: 'https://ai.customer.example/?api-key=secret', model: 'model' },
    }).success,
    false,
  );
  let sent: RequestInit | undefined;
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), target.url);
    sent = init;
    return new Response('{}');
  };
  const send = endpointFetch(host, target);
  await assert.rejects(send('https://attacker.invalid'), /destination/);
  assert.equal(tokens.length, 0);
  await send(target.url, { method: 'POST', body: '{}' });
  assert.deepEqual(tokens, [target.resource]);
  assert.equal(new Headers(sent?.headers).get('Authorization'), 'Bearer delegated-test');
  assert.equal(sent?.redirect, 'error');
  assert.equal(sent?.credentials, 'omit');
});

test('browser AI uses delegated identity, produces reviewable drafts and does not export or approve', async t => {
  const { host, tokens } = fixture();
  host.settings = customerSettingsSchema.parse({
    ai: {
      url: 'https://ai.customer.example/chat',
      resource: 'api://customer-ai',
      permissionResource: 'Customer AI',
      scope: 'access_as_user',
      model: 'model',
    },
  });
  const api = await createBrowserApi(host);
  const data = await api.request<Bootstrap>('/bootstrap');
  const template = data.templates.find(t => t.category === 'governance')!;
  let m = await api.request<Meeting>('/meetings', { title: 'AI meeting', circle: 'Circle', templateId: template.id });
  const path = `/meetings/${m.id}`;
  const step = template.steps.find(s => s.kind === 'agenda')!;
  m = await api.request(path + '/command', {
    revision: m.revision,
    type: 'agenda.add',
    stepId: step.id,
    title: 'Need',
  });
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  let mode = 'assist';
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), host.settings.ai!.url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer delegated-test');
    const input = JSON.parse(String(init?.body));
    assert.match(input.messages[0].content, /fr/);
    const result =
      mode === 'assist'
        ? { proposal: 'Proposition', rationale: 'Pourquoi', questions: ['Qui ?'], objectionResponses: [] }
        : {
            outcomes: [
              {
                stepId: step.id,
                agendaId: m.agenda[0].id,
                type: 'note',
                title: 'Note',
                description: 'Recorded',
                evidence: ['s1'],
              },
            ],
          };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  };
  const before = structuredClone(m);
  const response = await api.request<{ suggestion: { proposal: string } }>(path + '/assist', {
    revision: m.revision,
    input: { mode: 'proposal', agendaId: m.agenda[0].id, language: 'fr' },
  });
  assert.equal(response.suggestion.proposal, 'Proposition');
  assert.deepEqual(await api.request(path), before);
  m = await api.request(path + '/transcript', { revision: m.revision, text: '[00:01 - 00:02] A: Record this note.' });
  mode = 'analysis';
  m = await api.request(path + '/analyze', { revision: m.revision, language: 'fr' });
  assert.equal(m.outcomes[0].status, 'proposed');
  assert.equal(m.outcomes[0].export, undefined);
  assert.deepEqual(tokens, ['api://customer-ai', 'api://customer-ai']);
});

test('governance configuration has one roleALPHA connection and rejects generic MCP or per-entity endpoints', async () => {
  const connection = {
    url: 'https://rolealpha.customer.example/mcp',
    resource: 'api://rolealpha',
    permissionResource: 'roleALPHA Governance',
    scope: 'access_as_user',
    tenant,
    meeting: true,
    entities: { risk: { entityType: 'risk', label: 'Risk' } },
  };
  const settings = customerSettingsSchema.parse({ roleAlpha: connection });
  assert.equal(settings.roleAlpha?.url, connection.url);
  assert.equal(customerSettingsSchema.safeParse({ mcp: connection }).success, false);
  assert.equal(
    customerSettingsSchema.safeParse({
      roleAlpha: {
        ...connection,
        entities: { risk: { ...connection.entities.risk, url: 'https://other.example/mcp' } },
      },
    }).success,
    false,
  );
  const { host } = fixture();
  host.settings = settings;
  const api = await createBrowserApi(host);
  const data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.integrations.mcp, true);
  assert.deepEqual(data.integrations.entityTypes, ['risk']);
  const { prepareExport } = await import('../client/browser/integrations.js');
  await assert.rejects(
    prepareExport(
      host,
      {
        destination: 'https://other.example/mcp',
        tool: 'create_entity_draft',
        label: 'Risk',
        arguments: { entity_type: 'risk', name: 'x', custom_id: 'x', data: {} },
      },
      { ...connection, url: 'https://other.example/mcp' },
    ),
    /roleALPHA/,
  );
});
