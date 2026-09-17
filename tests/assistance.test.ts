import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestStore } from './helpers/workspace.js';
import { createMeeting, command, getMeeting } from '../shared/domain.js';
import { assistanceMessages } from '../shared/assistance-messages.js';
import { assistanceInput, assistanceResult } from '../shared/assistance.js';
import type { Actor, Template } from '../shared/model.js';
const actor: Actor = { id: 'owner', name: 'Owner', tenantId: 'tenant', admin: true, workspace: 'write' };
test('proposal forming uses scoped context; generation never changes meeting or validates objections', async () => {
  const store = new TestStore(actor.tenantId);
  await store.initialize();
  await store.seed(actor.tenantId);
  const template = (await store.list<Template>(actor.tenantId, 'template')).find(t => t.category === 'governance')!;
  const m = await createMeeting(store, actor, { templateId: template.id, title: 'Governance', circle: 'Circle' });
  const step = m.template.steps.find(s => s.kind === 'agenda')!;
  command(m, actor, { type: 'agenda.add', stepId: step.id, title: 'Clear responsibilities' });
  m.transcript = [{ id: 'secret', start: '', end: '', speaker: '', text: 'PRIVATE TRANSCRIPT' }];
  const input = assistanceInput.parse({
    mode: 'proposal',
    agendaId: m.agenda[0].id,
    context: 'Need an owner',
    language: 'fr',
  });
  const messages = assistanceMessages(m, input);
  assert.match(messages[0].content, /Respond in fr/);
  assert.match(messages[0].content, /never claim approval/);
  assert.ok(!JSON.stringify(messages).includes('PRIVATE TRANSCRIPT'));
  assert.throws(() => assistanceMessages(m, { ...input, mode: 'integration' }), /Einwände/);
  command(m, actor, { type: 'agenda.proposal', id: m.agenda[0].id, proposal: 'Reviewed wording', objections: 'Cost' });
  assert.equal(m.agenda[0].proposal, 'Reviewed wording');
  assert.equal(m.agenda[0].phase, 0);
  assert.equal(m.agenda[0].status, 'open');
  assert.equal(m.outcomes.length, 0);
  await assert.rejects(
    getMeeting(store, { ...actor, id: 'reader', admin: false, workspace: 'read' }, m.id, true),
    /Berechtigung/,
  );
  m.status = 'completed';
  assert.throws(
    () => command(m, actor, { type: 'agenda.proposal', id: m.agenda[0].id, proposal: 'Late' }),
    /abgeschlossen/,
  );
  assert.equal(
    assistanceResult.safeParse({ proposal: '', rationale: '', questions: [], objectionResponses: [] }).success,
    false,
  );
});
