import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestStore, testHost } from './helpers/workspace.js';
import { addOutcome, command, createMeeting, getMeeting, saveMeeting, saveTemplate, setTranscript } from '../shared/domain.js';
import { parseTranscript } from '../shared/transcript.js';
import { validateAnalysis } from '../shared/analysis.js';
import { meetingPlan } from '../client/browser/integrations.js';
const exportPayload=(m: import('../shared/model.js').Meeting,o: import('../shared/model.js').Outcome[]) => meetingPlan(testHost(),m,o).arguments as {data:{outcomes:import('../shared/model.js').Outcome[]}};
import type { Actor, Template } from '../shared/model.js';
const actor: Actor = { id: 'owner', name: 'Owner', tenantId: 'tenant-a', admin: true, workspace:'write' };
async function fixture() {
  const store = new TestStore(actor.tenantId); await store.initialize(); await store.seed(actor.tenantId);
  const templates = await store.list<Template>(actor.tenantId, 'template');
  const template = templates.find(t => t.category === 'tactical')!;
  const meeting = await createMeeting(store, actor, { templateId: template.id, title: 'Weekly', circle: 'Product' });
  return { store, template, meeting };
}
test('template snapshots survive edits, disabling and deletion', async () => {
  const { store, template, meeting } = await fixture();
  const edited = await saveTemplate(store, actor, { ...template, name: 'Changed', enabled: false, steps: [...template.steps].reverse() }, template.id, template.version);
  assert.equal(edited.version, 2); assert.equal((await getMeeting(store, actor, meeting.id)).template.name, 'Tactical Meeting');
  await assert.rejects(createMeeting(store, actor, { templateId: template.id, title: 'No', circle: 'No' }), /deaktiviert/);
  await store.delete(actor.tenantId, 'template', template.id, 2); await store.seed(actor.tenantId);
  assert.equal((await store.list(actor.tenantId, 'template')).length, 2); assert.equal((await getMeeting(store, actor, meeting.id)).template.steps[0].kind, 'check-in');
});
test('optimistic concurrency prevents overwriting meeting and template changes', async () => {
  const { store, meeting, template } = await fixture(); const second = structuredClone(meeting);
  command(meeting, actor, { type: 'start' }); await saveMeeting(store, actor, meeting, 1);
  await assert.rejects(saveMeeting(store, actor, second, 1), /inzwischen geändert/);
  await saveTemplate(store, actor, template, template.id, 1);
  await assert.rejects(saveTemplate(store, actor, template, template.id, 1), /inzwischen geändert/);
});
test('workspace readers cannot edit and tenant isolation is enforced',async()=>{
 const {store,meeting,template}=await fixture();
 await assert.rejects(getMeeting(store,{...actor,tenantId:'other'},meeting.id),/Mandant/);
 const reader:Actor={...actor,id:'reader',admin:false,workspace:'read'};
 assert.equal((await getMeeting(store,reader,meeting.id)).id,meeting.id);
 await assert.rejects(getMeeting(store,reader,meeting.id,true),/Berechtigung/);
 await assert.rejects(saveTemplate(store,reader,template),/Berechtigung/);
});
test('step output allowlists and active phase boundaries cannot be bypassed', async () => {
  const { store, meeting } = await fixture(); const agenda = meeting.template.steps.find(s => s.kind === 'agenda')!;
  assert.throws(() => addOutcome(meeting, actor, { stepId: meeting.template.steps[0].id, title: 'No', type: 'task' }), /nicht erlaubt/);
  assert.throws(() => addOutcome(meeting, actor, { stepId: agenda.id, title: 'No', type: 'governance' }), /nicht erlaubt/);
  command(meeting, actor, { type: 'agenda.add', stepId: agenda.id, title: 'Topic' });
  assert.throws(() => command(meeting, actor, { type: 'agenda.resolve', id: meeting.agenda[0].id }), /aktiven Schritt/);
  command(meeting, actor, { type: 'start' }); assert.throws(() => command(meeting, actor, { type: 'skip' }), /nicht optional/);

});
test('VTT import preserves speaker and source timestamps; repeated import is idempotent', async () => {
  const { store, meeting } = await fixture();
  const segments = parseTranscript('WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\n<v Anna>Ich übernehme den Entwurf.</v>\n\n2\n00:00:04.000 --> 00:00:06.000\n<v Ben>Danke &amp; bis morgen.</v>');
  assert.equal(segments.length, 2); assert.equal(segments[0].speaker, 'Anna'); assert.equal(segments[1].text, 'Danke & bis morgen.');
  assert.equal(setTranscript(meeting, actor, segments), true); assert.equal(setTranscript(meeting, actor, segments), false);
  assert.equal(parseTranscript('[01:00 - 01:05] Alex: Hallo')[0].start, '01:00');
});
test('AI results need real references and cannot invent target UUIDs or allowed outputs', async () => {
  const { store, meeting } = await fixture(); const step = meeting.template.steps.find(s => s.kind === 'agenda')!;
  setTranscript(meeting, actor, parseTranscript('Anna übernimmt den Entwurf.'));
  const outcome = { stepId: step.id, type: 'task', title: 'Entwurf erstellen', evidence: ['s1'], targetId: 'f2856428-f2f8-4d72-b74d-8a3d1a970765' };
  assert.equal(validateAnalysis({ outcomes: [outcome] }, meeting)[0].targetId, null);
  assert.throws(() => validateAnalysis({ outcomes: [{ ...outcome, evidence: ['invented'] }] }, meeting), /Quellen/);
  assert.throws(() => validateAnalysis({ outcomes: [{ ...outcome, type: 'governance' }] }, meeting), /nicht erlaubten/);
  addOutcome(meeting, actor, outcome, 'ai'); command(meeting, actor, { type: 'outcome.review', id: meeting.outcomes[0].id, status: 'approved' });
  assert.throws(() => setTranscript(meeting, actor, parseTranscript('Anderer Inhalt')), /Bestätigte/);
});
test('editing invalidates approval and exported results cannot be edited', async () => {
  const { store, meeting } = await fixture(); const step = meeting.template.steps.find(s => s.kind === 'agenda')!;
  addOutcome(meeting, actor, { stepId: step.id, type: 'task', title: 'Original' }); const outcome = meeting.outcomes[0];
  assert.throws(() => exportPayload(meeting, [outcome]), /bestätigte/);
  command(meeting, actor, { type: 'outcome.review', id: outcome.id, status: 'approved' }); assert.equal(outcome.approvedBy, actor.id);
  command(meeting, actor, { type: 'outcome.edit', id: outcome.id, outcome: { ...outcome, title: 'Changed' } }); assert.equal(outcome.status, 'proposed'); assert.equal(outcome.approvedBy, undefined);
  command(meeting, actor, { type: 'outcome.review', id: outcome.id, status: 'approved' });
  const payload = exportPayload(meeting, [outcome]); assert.equal(payload.data.outcomes[0].title, 'Changed');
  outcome.export = { state: 'draft_created', draftId: 'abc' };
  assert.throws(() => command(meeting, actor, { type: 'outcome.edit', id: outcome.id, outcome }), /nicht bearbeitet/);
});
