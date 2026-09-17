import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestStore } from './helpers/workspace.js';
import { addOutcome, command, createMeeting, setTranscript } from '../shared/domain.js';
import { checkMeeting } from '../shared/integrity.js';
import type { Actor, Template } from '../shared/model.js';

const actor: Actor = { id: 'owner', name: 'Owner', tenantId: 'tenant', workspace: 'write' };

test('consistency check accepts app-made changes and reports manually edited meetings', async () => {
  const store = new TestStore(actor.tenantId);
  await store.initialize();
  await store.seed(actor.tenantId);
  const template = (await store.list<Template>(actor.tenantId, 'template')).find(t => t.category === 'tactical')!;
  const m = await createMeeting(store, actor, { templateId: template.id, title: 'Weekly', circle: 'Circle' });
  const step = template.steps.find(s => s.kind === 'agenda')!;
  setTranscript(m, actor, [{ id: 's1', start: '', end: '', speaker: 'Anna', text: 'We hire.' }]);
  addOutcome(m, actor, { stepId: step.id, type: 'task', title: 'Hire', evidence: ['s1'] }, 'ai');
  command(m, actor, { type: 'outcome.review', id: m.outcomes[0].id, status: 'approved' });
  assert.deepEqual(checkMeeting(m), []);

  const edited = structuredClone(m);
  edited.outcomes[0].export = { state: 'draft_created', draftId: 'forged' };
  edited.outcomes[0].evidence = ['missing'];
  edited.outcomes[0].type = 'okr';
  edited.currentStep = 99;
  const messages = checkMeeting(edited).map(i => i.message);
  assert.ok(messages.some(x => /aktuelle Schritt/.test(x)));
  assert.ok(messages.some(x => /nicht erlaubt/.test(x)));
  assert.ok(messages.some(x => /Transkriptstellen/.test(x)));
  assert.ok(messages.some(x => /Eintrag im Verlauf/.test(x)));

  const unapproved = structuredClone(m);
  unapproved.outcomes[0].approvedBy = undefined;
  assert.ok(checkMeeting(unapproved).some(i => /Bestätigungsangaben/.test(i.message)));

  const withoutSegments = structuredClone(m);
  withoutSegments.transcript = [];
  assert.deepEqual(checkMeeting(withoutSegments), [], 'evidence is only checked when segments are loaded');
});
