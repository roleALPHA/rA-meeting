import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPanelApi } from '../client/browser/api.js';
import { roleAlphaEndpointFor } from '../client/browser/connection.js';
import type { BrowserHost } from '../client/browser/host.js';
import type { Proposal } from '../shared/meeting.js';
import {
  appUrl,
  chatId,
  circles,
  existing,
  fakeServices,
  mcpUrl,
  tenant,
  user,
  type FakeOptions,
} from './helpers/fake-services.js';

type T = { after: (fn: () => Promise<unknown> | unknown) => void };

/** A side panel in a Teams meeting, with roleALPHA and Graph simulated. A fresh tenant keeps token caches apart. */
function setup(t: T, options: FakeOptions = {}, teams: BrowserHost['teams'] = { chatId, frameContext: 'sidePanel' }) {
  const services = fakeServices(options);
  const original = globalThis.fetch;
  globalThis.fetch = services.fetch as typeof fetch;
  t.after(async () => {
    globalThis.fetch = original;
    await services.close();
  });
  const stored = new Map<string, string>();
  const tokens: string[] = [];
  const host: BrowserHost = {
    tenantId: crypto.randomUUID(),
    userId: user,
    userName: 'Anna',
    webUrl: 'https://customer.sharepoint.com/sites/circle',
    isTeams: true,
    teams,
    roleAlpha: null,
    sharepoint: services.sharepoint,
    token: async resource => {
      tokens.push(resource);
      return 'entra-token';
    },
    storage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
      removeItem: key => void stored.delete(key),
    },
  };
  return { services, host, api: createPanelApi(host), stored, tokens };
}

test('in a meeting the panel finds the organisation and the meeting, without a scenario yet', async t => {
  const { api, services, stored, host } = setup(t);
  const state = await api.bootstrap();
  assert.deepEqual(state.connection, {
    status: 'connected',
    organisation: { uuid: tenant, name: 'Larkfield Consulting' },
  });
  assert.deepEqual(state.meeting, { ref: `teams-chat:${chatId}`, chatId, title: 'Finance · Governance-Meeting' });
  assert.equal(state.scenario, null);
  assert.deepEqual(host.roleAlpha, {
    url: mcpUrl,
    resource: 'api://rolealpha',
    scope: 'access_as_user',
    appUrl,
    tenant,
  });
  // The first exchange carries no tenant; roleALPHA names it, and the choice is remembered for this user.
  assert.equal(services.state.exchanges[0].get('tenant_uuid'), null);
  assert.deepEqual([...stored.values()], [tenant]);
  // Looking is not starting: the scenario is only read, never created on open.
  const open = services.state.calls.find(c => c.tool === 'open_meeting_scenario');
  assert.equal(open?.args.create, false);
  assert.equal(services.state.scenarios.length, 0);
});

test('a circle starts the scenario, rALPH proposes, and adopted proposals become drafts in it', async t => {
  const { api, services } = setup(t);
  await api.bootstrap();
  const found = await api.searchCircles('fin');
  assert.deepEqual(found, [{ id: circles[0].uuid, name: 'Finance', kind: 'role' }]);
  const scenario = await api.openScenario({ uuid: circles[0].uuid, name: 'Finance' });
  assert.equal(scenario.circle?.name, 'Finance');
  assert.equal(scenario.meetingRef, `teams-chat:${chatId}`);

  const reply = await api.propose({ topic: 'Lieferanten', note: 'Anna übernimmt die Lieferantenverträge.' }, 'de');
  const ask = services.state.calls.filter(c => c.tool === 'ask_ralph').at(-1)!;
  assert.equal(ask.args.proposals, true);
  assert.equal(ask.args.locale, 'de');
  assert.match(String(ask.args.question), /Lieferantenverträge/);
  assert.match(String(ask.args.context), /Kreis: Finance/);
  // The circle is named in the question too, or rALPH leaves new entries outside it.
  assert.match(String(ask.args.question), new RegExp(`in den Kreis des Meetings, Finance \\(${circles[0].uuid}\\)`));
  // The malformed fourth proposal is left out; the rest keep their order.
  assert.deepEqual(
    reply.proposals.map(p => [p.kind, p.kind === 'entity' ? p.action : p.relTypeId]),
    [
      ['entity', 'create'],
      ['relationship', 7],
      ['entity', 'update'],
    ],
  );
  assert.equal(reply.entities[0].url, `${appUrl}/graph?anchor=9b8d1414-1a55-47d4-8bcb-1321bd3684df`);

  // Relationship first in the batch: the planned role is still created before it, and its ref resolves.
  const batch: Proposal[] = [reply.proposals[1], reply.proposals[0], reply.proposals[2]];
  const adopted = await api.adopt(batch);
  assert.ok(adopted.results.every(r => 'draftId' in r));
  assert.equal(adopted.scenario.drafts.length, 3);
  const role = services.state.calls.find(c => c.tool === 'create_entity_draft')!;
  const relationship = services.state.calls.find(c => c.tool === 'create_relationship_draft')!;
  const update = services.state.calls.find(c => c.tool === 'update_entity_draft')!;
  assert.equal(role.args.scenario_id, scenario.scenarioId);
  assert.match(String(role.args.custom_id), /^ra-sessions:teams-chat:/);
  assert.deepEqual(role.args.data, {
    purpose: 'Verträge mit Lieferanten sauber führen',
    accountabilities: ['Verträge prüfen'],
  });
  const roleDraft = adopted.scenario.drafts.find(d => d.action === 'create' && d.entityType === 'role')!;
  assert.equal(relationship.args.target_uuid, roleDraft.entityUuid);
  assert.equal(relationship.args.source_uuid, circles[0].uuid);
  assert.equal(update.args.entity_uuid, '9b8d1414-1a55-47d4-8bcb-1321bd3684df');
  assert.equal(update.args.scenario_id, scenario.scenarioId);

  // A relationship to an entity nobody planned fails on its own; the others are unaffected.
  const orphan = { ...reply.proposals[1], targetRef: 'unknown' } as Proposal;
  const partly = await api.adopt([orphan]);
  assert.deepEqual(partly.results, [{ error: 'error.meeting.relationshipEndpointMissing' }]);
});

test('submitting sends the meeting chat members, and the result goes to the chat as the user', async t => {
  const { api, services } = setup(t, { liberal: ['relationship'] });
  await api.bootstrap();
  await api.openScenario({ uuid: circles[0].uuid, name: 'Finance' });
  const reply = await api.propose({ topic: '', note: 'Anna übernimmt die Lieferantenverträge.' }, 'en');
  await api.adopt(reply.proposals.slice(0, 2));
  const result = await api.submit();
  const submit = services.state.calls.find(c => c.tool === 'submit_meeting_scenario')!;
  assert.deepEqual(submit.args.participants, ['anna@customer.example', 'ben@customer.example', 'gast@extern.example']);
  assert.equal(result.published.length, 1, 'the liberal relationship is published directly');
  assert.equal(result.submitted?.approvalMode, 'konsent');
  assert.equal(result.submitted?.voters.length, 2);
  assert.deepEqual(result.unmatchedParticipants, ['gast@extern.example']);

  await api.share('Ergebnis <b>Finance</b>\nzweite Zeile', { label: 'Öffnen', url: result.url! });
  assert.deepEqual(services.state.messages, [
    `<p>Ergebnis &lt;b&gt;Finance&lt;/b&gt;<br>zweite Zeile<br><a href="${result.url}">Öffnen</a></p>`,
  ]);
  await assert.rejects(api.share('x', { label: 'Phish', url: 'https://evil.example/x' }), /Nachricht/);
  // After the submission the next occurrence of the series starts a new scenario.
  const next = await api.openScenario({ uuid: circles[0].uuid, name: 'Finance' });
  assert.notEqual(next.scenarioId, submit.args.scenario_id);
});

test('with several organisations the user picks one, and can switch later', async t => {
  const other = '33333333-3333-4333-8333-333333333333';
  const { api, stored } = setup(t, {
    organisations: [
      { uuid: tenant, name: 'Larkfield Consulting' },
      { uuid: other, name: 'Merkur Gaming' },
    ],
  });
  const first = await api.bootstrap();
  assert.equal(first.connection.status, 'choose');
  const chosen = await api.chooseOrganisation(other);
  assert.equal(chosen.connection.status, 'connected');
  assert.deepEqual([...stored.values()], [other]);
  const switched = await api.switchOrganisation();
  assert.equal(switched.connection.status, 'choose');
  assert.equal(stored.size, 0);
  await assert.rejects(api.chooseOrganisation('not-a-uuid'));
});

test('outside a meeting the panel lists the user’s open meeting scenarios', async t => {
  const { api, host } = setup(t);
  await api.bootstrap();
  await api.openScenario({ uuid: circles[0].uuid, name: 'Finance' });
  // The same user on a SharePoint page or in the personal app: no meeting chat.
  const elsewhere = createPanelApi({ ...host, teams: null, roleAlpha: null });
  const state = await elsewhere.bootstrap();
  assert.equal(state.meeting, null);
  assert.equal(state.myScenarios.length, 1);
  await assert.rejects(elsewhere.propose({ topic: '', note: 'abc' }, 'de'), /Teams-Meeting/);
});

test('a chat that is not a meeting is no meeting', async t => {
  const { api } = setup(t, { chatType: 'group' });
  assert.equal((await api.bootstrap()).meeting, null);
});

test('a read tool that is not annotated read-only is never called', async t => {
  const { api, services } = setup(t, { notReadOnly: ['ask_ralph', 'search_roles'] });
  await api.bootstrap();
  await api.openScenario({ uuid: circles[0].uuid, name: 'Finance' });
  await assert.rejects(api.ask('Wer verantwortet Belege?', 'de'), /nicht kompatibel/);
  // The circle search drops the unsafe source and still offers org units.
  assert.deepEqual(
    (await api.searchCircles('')).map(c => c.kind),
    ['unit'],
  );
  assert.ok(!services.state.calls.some(c => c.tool === 'ask_ralph' || c.tool === 'search_roles'));
});

test('an older roleALPHA without proposals says so instead of answering in text only', async t => {
  const { api } = setup(t, { oldRalph: true });
  await api.bootstrap();
  await api.openScenario({ uuid: circles[0].uuid, name: 'Finance' });
  await assert.rejects(api.propose({ topic: '', note: 'Anna übernimmt.' }, 'de'), /Vorschläge/);
  const reply = await api.ask('Wer verantwortet Belege?', 'fr');
  assert.match(reply.answer, /Finance/);
  assert.deepEqual(reply.entities, [{ name: 'Finance', url: `${appUrl}/graph?anchor=${circles[0].uuid}` }]);
});

test('an existing entry can be found, loaded with its values and changed as a draft of the meeting', async t => {
  const { api, services } = setup(t);
  await api.bootstrap();
  await api.openScenario({ uuid: circles[0].uuid, name: 'Finance' });

  // One letter is no search: roleALPHA is not asked.
  assert.deepEqual(await api.searchEntities('f'), []);
  assert.equal(services.state.calls.filter(c => c.tool === 'search_entities').length, 0);
  const hits = await api.searchEntities('finan');
  assert.deepEqual(
    hits.map(h => [h.name, h.entityTypeName]),
    [
      ['Finance Lead', 'Rolle'],
      ['Finanzrichtlinie', 'Richtlinie'],
    ],
  );

  const role = existing[0]!;
  const loaded = await api.loadEntity(role.uuid);
  assert.deepEqual(loaded, { uuid: role.uuid, name: 'Finance Lead', entityType: 'Rolle', values: role.descJsonb });

  const change: Proposal = {
    kind: 'entity',
    action: 'update',
    entityType: loaded.entityType,
    entityUuid: loaded.uuid,
    name: loaded.name,
    fields: { purpose: 'Finanzen und Einkauf steuern' },
    rationale: '',
  };
  const outcome = await api.adopt([change]);
  assert.ok('draftId' in outcome.results[0]!);
  assert.deepEqual(
    outcome.scenario.drafts.map(d => [d.action, d.entityUuid]),
    [['update', role.uuid]],
  );
  // Only the changed field goes to roleALPHA, into the meeting's scenario; the rest stays as it is.
  const call = services.state.calls.find(c => c.tool === 'update_entity_draft')!;
  assert.deepEqual(call.args.fields, { purpose: 'Finanzen und Einkauf steuern' });
  assert.equal(call.args.scenario_id, outcome.scenario.scenarioId);

  await assert.rejects(api.loadEntity(crypto.randomUUID()), /Entity not found/);
});

test('roleALPHA’s refusals reach the user with roleALPHA’s reason', async t => {
  const { api } = setup(t, { ralph: () => ({ error: 'Zu viele Fragen an rALPH.' }) });
  await api.bootstrap();
  await assert.rejects(api.ask('Wer verantwortet Belege?', 'de'), /Zu viele Fragen an rALPH/);
});

test('without the meeting scenario tools the panel still opens and says what is missing', async t => {
  const { api } = setup(t, { missing: ['open_meeting_scenario'] });
  const state = await api.bootstrap();
  assert.equal(state.scenario, null);
  await assert.rejects(api.openScenario({ uuid: circles[0].uuid, name: 'Finance' }), /open_meeting_scenario/);
});

test('the tenant property points the app at another installation; a broken one is an error', async t => {
  const { host } = setup(t, { tenantProperty: null });
  assert.equal((await roleAlphaEndpointFor(host)).url, 'https://rolealpha.app/api/mcp');
  const broken = setup(t, { tenantProperty: '{"url":"http://insecure.example"}' });
  await assert.rejects(roleAlphaEndpointFor(broken.host), /rolealphaSessions/);
  const unreadable = setup(t);
  unreadable.host.sharepoint = async () => {
    throw new Error('offline');
  };
  assert.equal((await roleAlphaEndpointFor(unreadable.host)).url, 'https://rolealpha.app/api/mcp');
});
