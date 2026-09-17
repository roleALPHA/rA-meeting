import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestStore } from './helpers/workspace.js';
import { saveTension, attachTension } from '../shared/tensions.js';
import { createMeeting, command, saveMeeting } from '../shared/domain.js';
import type { Template, Tension } from '../shared/model.js';
test('tensions live independently; resolving an agenda does not resolve the tension', async () => {
  const store = new TestStore('tenant');
  await store.initialize();
  await store.seed('tenant');
  const actor = { id: 'owner', name: 'Owner', tenantId: 'tenant', admin: true, workspace: 'write' as const };
  const template = (await store.list<Template>('tenant', 'template')).find(t => t.category === 'tactical')!;
  const tension = await saveTension(store, actor, {
    title: 'Unklare Verantwortung',
    circle: 'Produkt',
    description: 'Eine Beobachtung',
  });
  const meeting = await createMeeting(store, actor, { templateId: template.id, title: 'Weekly', circle: 'Produkt' });
  const step = template.steps.find(s => s.kind === 'agenda')!;
  const linked = await attachTension(store, actor, tension.id, meeting.id, step.id, meeting.revision);
  assert.equal(linked.agenda[0].tensionId, tension.id);
  await assert.rejects(attachTension(store, actor, tension.id, meeting.id, step.id, linked.revision), /bereits/);
  command(linked, actor, { type: 'start' });
  while (linked.template.steps[linked.currentStep].kind !== 'agenda') command(linked, actor, { type: 'next' });
  command(linked, actor, { type: 'agenda.resolve', id: linked.agenda[0].id });
  await saveMeeting(store, actor, linked, linked.revision);
  assert.equal((await store.get<Tension>('tenant', 'tension', tension.id)).status, 'open');
  const second = await createMeeting(store, actor, {
    templateId: template.id,
    title: 'Next weekly',
    circle: 'Produkt',
  });
  await attachTension(store, actor, tension.id, second.id, step.id, second.revision);
  await assert.rejects(
    saveTension(store, { ...actor, id: 'stranger', admin: false, workspace: 'read' }, tension, tension.id, 1),
    /Berechtigung/,
  );
  const resolved = await saveTension(store, actor, { ...tension, status: 'resolved' }, tension.id, 1);
  assert.equal(resolved.version, 2);
  await assert.rejects(saveTension(store, actor, tension, tension.id, 1), /inzwischen/);
  await assert.rejects(
    attachTension(store, { ...actor, tenantId: 'other' }, tension.id, second.id, step.id, 1),
    /Mandant/,
  );
});

test('workspace readers cannot contribute tensions or attach them to meetings', async () => {
  const store = new TestStore('tenant');
  await store.initialize();
  await store.seed('tenant');
  const owner = { id: 'owner', name: 'Owner', tenantId: 'tenant', admin: true, workspace: 'write' as const };
  const reader = { ...owner, id: 'reader', admin: false, workspace: 'read' as const };
  const template = (await store.list<Template>('tenant', 'template'))[0];
  const meeting = await createMeeting(store, owner, { templateId: template.id, title: 'Meeting', circle: 'Team' });
  const tension = await saveTension(store, owner, { title: 'Topic', circle: 'Team' });
  await assert.rejects(saveTension(store, reader, { title: 'No', circle: 'Team' }), /Berechtigung/);
  await assert.rejects(
    attachTension(store, reader, tension.id, meeting.id, template.steps[2].id, meeting.revision),
    /Berechtigung/,
  );
});
