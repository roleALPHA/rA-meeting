const randomUUID = () => crypto.randomUUID();
import { z } from 'zod';
import { assert, type Actor, type Tension } from './model.js';
import type { Repository as Store } from './storage/repository.js';
import { getMeeting, saveMeeting, event } from './domain.js';
const input = z.object({ title: z.string().trim().min(1).max(200), description: z.string().max(12000).default(''), circle: z.string().trim().min(1).max(200), status: z.enum(['open', 'resolved']).default('open') });
export async function saveTension(store: Store, actor: Actor, raw: unknown, id?: string, version?: number) {
  assert(actor.workspace === 'write', 'Keine Berechtigung für diesen SharePoint-Arbeitsbereich.',403);
  const data = input.parse(raw); const old = id ? await store.get<Tension>(actor.tenantId, 'tension', id) : null;
  if (old) { assert(version === old.version, 'Spannung wurde inzwischen geändert.', 409); }
  const time = new Date().toISOString();
  const tension: Tension = { ...data, id: old?.id || randomUUID(), version: (old?.version || 0) + 1, createdBy: old?.createdBy || actor.id, createdAt: old?.createdAt || time, updatedAt: time };
  await store.save(actor.tenantId, 'tension', tension.id, tension.version, tension, old?.version); return tension;
}
export async function attachTension(store: Store, actor: Actor, id: string, meetingId: string, stepId: string, revision: number) {
  const tension = await store.get<Tension>(actor.tenantId, 'tension', id);
  assert(actor.workspace === 'write', 'Keine Berechtigung für diesen SharePoint-Arbeitsbereich.',403);
  assert(tension.status === 'open', 'Diese Spannung ist bereits gelöst.');
  const meeting = await getMeeting(store, actor, meetingId);
  assert(meeting.revision === revision, 'Meeting wurde inzwischen geändert.', 409);
  assert(meeting.status !== 'completed', 'Meeting ist abgeschlossen.');
  assert(meeting.template.steps.some(s => s.id === stepId && s.kind === 'agenda'), 'Kein Agenda-Schritt.');
  assert(!meeting.agenda.some(a => a.tensionId === id), 'Diese Spannung ist bereits im Meeting.');
  meeting.agenda.push({ id: randomUUID(), tensionId: id, stepId, title: tension.title, owner: tension.createdBy, status: 'open', phase: 0 });
  event(meeting, actor, 'tension.attached', `Spannung aufgenommen: ${tension.title}`);
  // Only meeting write: no cross-record partial update. Links are derived from agenda.tensionId.
  return saveMeeting(store, actor, meeting, revision);
}
