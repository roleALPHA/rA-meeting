import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { TestStore } from './helpers/workspace.js';
import { fakeSharePoint, tenant, user } from './helpers/sharepoint-rest.js';
import { checkDraftLink, saveTension } from '../shared/tensions.js';
import { createMeeting } from '../shared/domain.js';
import {
  templateInput,
  terminologyOf,
  type Bootstrap,
  type Meeting,
  type Template,
  type Tension,
} from '../shared/model.js';
import { seedTemplates } from '../shared/templates.js';
import { createBrowserApi } from '../client/browser/runtime.js';
import { customerSettingsSchema, type BrowserHost } from '../client/browser/host.js';

const owner = { id: 'owner', name: 'Owner', tenantId: 'tenant', workspace: 'write' as const };
async function workspace() {
  const store = new TestStore('tenant');
  await store.initialize();
  await store.seed('tenant');
  const templates = await store.list<Template>('tenant', 'template');
  const tactical = templates.find(t => t.category === 'tactical')!;
  const meeting = await createMeeting(store, owner, { templateId: tactical.id, title: 'Weekly', circle: 'Product' });
  return { store, templates, tactical, meeting };
}

test('a tension is submitted to a meeting, takes its circle and defaults to its agenda step', async () => {
  const { store, tactical, meeting } = await workspace();
  const tension = await saveTension(store, owner, { title: 'Unclear ownership', meetingId: meeting.id });
  assert.equal(tension.meetingId, meeting.id);
  assert.equal(tension.circle, 'Product');
  assert.equal(tension.stepId, tactical.steps.find(s => s.kind === 'agenda')!.id);
  assert.equal(tension.createdBy, 'owner');
  assert.equal(tension.createdByName, 'Owner');
  await assert.rejects(saveTension(store, owner, { title: 'No meeting' }), /Meeting auswählen/);
  await assert.rejects(
    saveTension(store, owner, { title: 'Wrong step', meetingId: meeting.id, stepId: tactical.steps[0].id }),
    /Agenda/,
  );
  await assert.rejects(
    saveTension(store, { ...owner, workspace: 'read' }, { title: 'Reader', meetingId: meeting.id }),
    /Berechtigung/,
  );
  await assert.rejects(saveTension(store, owner, { ...tension, title: 'Stale' }, tension.id, 0), /inzwischen/);
  await assert.rejects(
    saveTension(store, { ...owner, tenantId: 'other' }, { title: 'Foreign', meetingId: meeting.id }),
    /Mandant/,
  );
});

test('meetings without an agenda step or already completed take no submissions', async () => {
  const { store, templates } = await workspace();
  const template = templates[0];
  const noAgenda = {
    ...template,
    version: template.version + 1,
    steps: template.steps.filter(s => s.kind !== 'agenda'),
  };
  await store.save('tenant', 'template', template.id, noAgenda.version, noAgenda, template.version);
  const plain = await createMeeting(store, owner, { templateId: noAgenda.id, title: 'No agenda', circle: 'Team' });
  await assert.rejects(saveTension(store, owner, { title: 'Topic', meetingId: plain.id }), /keinen Agendaschritt/);
  const done = { ...plain, id: crypto.randomUUID(), status: 'completed' as const, revision: 1 };
  await store.save('tenant', 'meeting', done.id, 1, done);
  await assert.rejects(saveTension(store, owner, { title: 'Late', meetingId: done.id }), /abgeschlossen/);
});

test('tensions stored before submission required a meeting can still be edited and then moved', async () => {
  const { store, meeting } = await workspace();
  const legacy = {
    id: crypto.randomUUID(),
    version: 1,
    title: 'Old tension',
    description: '',
    circle: 'Product',
    createdBy: 'owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    status: 'open' as const,
  };
  await store.save('tenant', 'tension', legacy.id, 1, legacy);
  const edited = await saveTension(store, owner, { ...legacy, status: 'resolved' }, legacy.id, 1);
  assert.equal(edited.meetingId, null);
  assert.equal(edited.circle, 'Product');
  const moved = await saveTension(store, owner, { ...edited, status: 'open', meetingId: meeting.id }, legacy.id, 2);
  assert.equal(moved.meetingId, meeting.id);
});

test('the template decides the terminology; stored templates without it mean tensions', () => {
  const [tactical, governance, reflection] = seedTemplates('en');
  assert.deepEqual([tactical, governance, reflection].map(terminologyOf), ['tensions', 'tensions', 'agenda']);
  const { terminology: _, ...legacy } = tactical;
  assert.equal(terminologyOf(legacy as Template), 'tensions');
  assert.equal(templateInput.parse(legacy).terminology, 'tensions');
  assert.equal(templateInput.parse({ ...legacy, terminology: 'agenda' }).terminology, 'agenda');
});

test('submitted items join the agenda at the start, later ones on request, and finishing one resolves it', async () => {
  const sp = fakeSharePoint();
  const host: BrowserHost = {
    tenantId: tenant,
    userId: user,
    userName: 'Facilitator',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    settings: customerSettingsSchema.parse({}),
    sharepoint: sp.request,
    token: async () => {
      throw new Error('no token expected');
    },
  };
  const api = await createBrowserApi(host);
  let data = await api.request<Bootstrap>('/bootstrap');
  const template = data.templates.find(t => t.category === 'tactical')!;
  let m = await api.request<Meeting>('/meetings', { title: 'Weekly', circle: 'Product', templateId: template.id });
  const next = await api.request<Meeting>('/meetings', {
    title: 'Next weekly',
    circle: 'Product',
    templateId: template.id,
  });
  const first = await api.request<Tension>('/tensions', { title: 'First', meetingId: m.id });
  const second = await api.request<Tension>('/tensions', { title: 'Second', meetingId: m.id });
  const command = async (body: Record<string, unknown>) =>
    (m = await api.request<Meeting>(`/meetings/${m.id}/command`, { ...body, revision: m.revision }));

  await command({ type: 'start' });
  assert.deepEqual(
    m.agenda.map(a => [a.title, a.tensionId, a.owner]),
    [
      ['First', first.id, 'Facilitator'],
      ['Second', second.id, 'Facilitator'],
    ],
  );
  const late = await api.request<Tension>('/tensions', { title: 'Late', meetingId: m.id });
  await command({ type: 'agenda.import' });
  assert.equal(m.agenda.at(-1)!.tensionId, late.id);
  await assert.rejects(command({ type: 'agenda.import' }), /keine neu eingereichten/);

  await command({ type: 'agenda.move', id: m.agenda[2].id, offset: -1 });
  assert.deepEqual(
    m.agenda.map(a => a.title),
    ['First', 'Late', 'Second'],
  );
  await assert.rejects(
    api.request(`/tensions/${second.id}`, { ...second, meetingId: next.id }, 'PUT'),
    /laufenden Meeting/,
  );

  while (m.template.steps[m.currentStep].kind !== 'agenda') await command({ type: 'next' });
  await command({ type: 'agenda.resolve', id: m.agenda[0].id });
  while (m.status !== 'completed') await command({ type: 'next' });
  data = await api.request<Bootstrap>('/bootstrap');
  const status = (id: string) => data.tensions.find(t => t.id === id)!.status;
  assert.equal(status(first.id), 'resolved');
  assert.equal(status(second.id), 'open');

  // The meeting did not get to "Second": it is moved to the next one and joins that agenda when it starts.
  const current = data.tensions.find(t => t.id === second.id)!;
  const moved = await api.request<Tension>(`/tensions/${second.id}`, { ...current, meetingId: next.id }, 'PUT');
  assert.equal(moved.meetingId, next.id);
  const started = await api.request<Meeting>(`/meetings/${next.id}/command`, {
    type: 'start',
    revision: next.revision,
  });
  assert.deepEqual(
    started.agenda.map(a => a.title),
    ['Second'],
  );
  await assert.rejects(api.request('/tensions', { title: 'Too late', meetingId: m.id }), /abgeschlossen/);
});

test('draft links are only stored for the configured roleALPHA application', () => {
  const draft = {
    draftId: 'd1',
    title: 'Role change',
    entityType: 'role',
    url: 'https://app.rolealpha.example/drafts?draft=d1',
  };
  assert.equal(checkDraftLink(draft, 'https://app.rolealpha.example').url, draft.url);
  assert.throws(() => checkDraftLink(draft, null), /nicht eingerichtet/);
  for (const url of [
    'https://evil.example/drafts?draft=d1',
    'http://app.rolealpha.example/drafts?draft=d1',
    'https://user:pass@app.rolealpha.example/drafts',
  ])
    assert.throws(() => checkDraftLink({ ...draft, url }, 'https://app.rolealpha.example'), /roleALPHA-Anwendung/);
});

test('own drafts are searched with the approved read-only tool and attached as links', async t => {
  const servers: McpServer[] = [];
  let transport: WebStandardStreamableHTTPServerTransport;
  let readOnly = true;
  let withTenant = false;
  let failure: string | null = null;
  let results: unknown[] = [
    {
      draftId: 'd-1',
      title: 'Finance role change',
      entityType: 'role',
      status: 'draft',
      url: 'https://app.rolealpha.example/drafts?draft=d-1',
    },
  ];
  const calls: Record<string, unknown>[] = [];
  async function connect() {
    const server = new McpServer({ name: 'rolealpha-test', version: '1.0.0' });
    servers.push(server);
    server.registerTool(
      'search_my_drafts',
      {
        inputSchema: withTenant
          ? { tenant_uuid: z.string(), query: z.string(), limit: z.number().int() }
          : { query: z.string(), limit: z.number().int() },
        annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly },
      },
      async (args: Record<string, unknown>) => {
        calls.push(args);
        // roleALPHA answers with JSON in a text block, including its errors.
        const payload = failure ? { error: failure } : { drafts: results };
        return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
      },
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
  const tokens: string[] = [];
  const host: BrowserHost = {
    tenantId: tenant,
    userId: user,
    userName: 'Member',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: false,
    sharepoint: fakeSharePoint().request,
    token: async resource => {
      tokens.push(resource);
      return 'delegated';
    },
    settings: customerSettingsSchema.parse({
      roleAlpha: {
        url: 'https://rolealpha.example/mcp',
        resource: 'api://rolealpha',
        permissionResource: 'roleALPHA',
        scope: 'access_as_user',
        tenant,
        drafts: { searchTool: 'search_my_drafts', appUrl: 'https://app.rolealpha.example' },
      },
    }),
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(url, host.settings.roleAlpha!.url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer delegated');
    if (init?.method === 'POST' && JSON.parse(String(init.body)).method === 'initialize') await connect();
    return transport.handleRequest(new Request(url, init));
  };
  const api = await createBrowserApi(host);
  const data = await api.request<Bootstrap>('/bootstrap');
  assert.equal(data.integrations.drafts, true);
  const found = await api.request<(Tension['draft'] & { status: string })[]>('/drafts/search', { query: 'finance' });
  assert.deepEqual(found, results);
  assert.deepEqual(calls.at(-1), { query: 'finance', limit: 20 });

  withTenant = true;
  await api.request('/drafts/search', { query: '' });
  assert.deepEqual(calls.at(-1), { query: '', limit: 20, tenant_uuid: tenant });

  const template = data.templates[0];
  const meeting = await api.request<Meeting>('/meetings', { title: 'Weekly', circle: 'Team', templateId: template.id });
  const tension = await api.request<Tension>('/tensions', {
    title: 'Needs a role change',
    meetingId: meeting.id,
    draft: { draftId: 'd-1', title: 'Finance role change', entityType: 'role', url: found[0]!.url },
  });
  assert.equal(tension.draft?.url, 'https://app.rolealpha.example/drafts?draft=d-1');
  await assert.rejects(
    api.request('/tensions', {
      title: 'Forged link',
      meetingId: meeting.id,
      draft: { draftId: 'x', title: 'x', entityType: 'role', url: 'https://evil.example/drafts?draft=x' },
    }),
    /roleALPHA-Anwendung/,
  );

  failure = 'Keine Berechtigung';
  await assert.rejects(api.request('/drafts/search', { query: 'x' }), /nicht aus roleALPHA gelesen/);
  failure = null;
  results = [{ ...(results[0] as object), url: 'https://evil.example/phish' }];
  await assert.rejects(api.request('/drafts/search', { query: 'x' }), /roleALPHA-Anwendung/);
  results = [{ draftId: 'd', title: 't', entityType: 'role', url: 'https://app.rolealpha.example/d', extra: 1 }];
  await assert.rejects(api.request('/drafts/search', { query: 'x' }), /nicht kompatibel/);
  readOnly = false;
  const before = calls.length;
  await assert.rejects(api.request('/drafts/search', { query: 'x' }), /nicht kompatibel/);
  assert.equal(calls.length, before, 'a tool that is not read-only is never called');
  assert.ok(tokens.every(r => r === 'api://rolealpha'));

  const withDrafts = (drafts: unknown) =>
    customerSettingsSchema.parse({ roleAlpha: { ...host.settings.roleAlpha, drafts } });
  assert.ok(withDrafts({ searchTool: 'search_drafts', appUrl: 'https://a.example' }).roleAlpha?.drafts);
  assert.throws(() => withDrafts({ searchTool: 'create_draft', appUrl: 'https://a.example' }));
  assert.throws(() => withDrafts({ searchTool: 'search_drafts', appUrl: 'http://a.example' }));
});
