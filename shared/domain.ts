import { sha256 } from '@noble/hashes/sha2.js';
const randomUUID = () => crypto.randomUUID();
import { z } from 'zod';
import { assert, outcomeInput, templateInput, type Actor, type Meeting, type OutcomeInput, type Segment, type Template } from './model.js';
import type { Repository as Store } from './storage/repository.js';
export const now = () => new Date().toISOString();
export function event(m: Meeting, actor: Actor, type: string, detail: string) { m.events.push({ id: randomUUID(), at: now(), actor: actor.name, type, detail }); }
export function canRead(m: Meeting, actor: Actor) { return Boolean(actor.workspace) || actor.admin || m.createdBy === actor.id || m.members.includes(actor.id); }
export async function getMeeting(store: Store, actor: Actor, id: string, write = false): Promise<Meeting> {
  const m = await store.get<Meeting>(actor.tenantId, 'meeting', id);
  assert(canRead(m, actor), 'Kein Zugriff auf dieses Meeting.', 403);
  if (write) assert(actor.workspace ? actor.workspace === 'write' : actor.admin || m.createdBy === actor.id, 'Nur die Meeting-Leitung kann das Meeting bearbeiten.', 403);
  return m;
}
export async function saveMeeting(store: Store, actor: Actor, m: Meeting, revision: number) {
  m.revision = revision + 1; m.updatedAt = now();
  await store.save(actor.tenantId, 'meeting', m.id, m.revision, m, revision); return m;
}
export async function saveTemplate(store: Store, actor: Actor, body: unknown, id?: string, version?: number) {
  assert(actor.admin, 'Nur Administratoren können Templates bearbeiten.', 403);
  const input = templateInput.parse(body); const existing = id ? await store.get<Template>(actor.tenantId, 'template', id) : null;
  if (existing) assert(existing.version === version, 'Das Template wurde inzwischen geändert.', 409);
  const t: Template = { ...input, id: existing?.id ?? randomUUID(), version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? now(), updatedAt: now() };
  await store.save(actor.tenantId, 'template', t.id, t.version, t, existing?.version); return t;
}
export const createMeetingInput = z.object({ templateId: z.string().uuid(), title: z.string().trim().min(1).max(200), circle: z.string().trim().min(1).max(200), circleId: z.string().uuid().nullable().default(null), scheduledAt: z.string().datetime().nullable().default(null), members: z.array(z.string().uuid()).max(100).default([]) });
export async function createMeeting(store: Store, actor: Actor, body: unknown) {
  const input = createMeetingInput.parse(body); const template = await store.get<Template>(actor.tenantId, 'template', input.templateId);
  assert(template.enabled, 'Dieses Template ist deaktiviert.');
  const m: Meeting = { id: randomUUID(), revision: 1, title: input.title, circle: input.circle, circleId: input.circleId, scheduledAt: input.scheduledAt, members: input.members, createdBy: actor.id, createdAt: now(), updatedAt: now(), template: structuredClone(template), status: 'scheduled', currentStep: 0, stepStartedAt: null, completedSteps: [], notes: {}, agenda: [], outcomes: [], transcript: [], events: [] };
  event(m, actor, 'created', `Meeting mit ${template.name} · Version ${template.version} angelegt.`);
  await store.save(actor.tenantId, 'meeting', m.id, 1, m); return m;
}
export function addOutcome(m: Meeting, actor: Actor, raw: unknown, source: 'manual' | 'ai' = 'manual') {
  const input = outcomeInput.parse(raw); const step = m.template.steps.find(s => s.id === input.stepId);
  assert(step?.outputs.includes(input.type), 'Dieser Ergebnistyp ist in diesem Schritt nicht erlaubt.');
  if (input.agendaId) assert(m.agenda.some(a => a.id === input.agendaId && a.stepId === input.stepId), 'Agendaelement gehört nicht zu diesem Schritt.');
  const ids = new Set(m.transcript.map(s => s.id)); assert(input.evidence.every(id => ids.has(id)), 'Ungültige Transkriptreferenz.');
  if (source === 'ai') assert(input.evidence.length > 0, 'KI-Ergebnisse benötigen eine Quelle.');
  m.outcomes.push({ ...input, id: randomUUID(), source, status: 'proposed' });
  event(m, actor, 'outcome.proposed', input.title);
}
export function setTranscript(m: Meeting, actor: Actor, segments: Segment[]) {
  assert(segments.length > 0, 'Das Transkript enthält keinen Text.');
  const hash = Array.from(sha256(new TextEncoder().encode(JSON.stringify(segments))), n => n.toString(16).padStart(2, '0')).join('');
  if (m.transcriptHash === hash) return false;
  assert(!m.outcomes.some(o => o.source === 'ai' && (o.status === 'approved' || o.export)), 'Bestätigte KI-Ergebnisse referenzieren dieses Transkript. Neues Meeting für eine andere Transkriptversion anlegen.', 409);
  m.outcomes = m.outcomes.filter(o => o.source !== 'ai');
  // Manual evidence must not silently point to a different transcript version.
  assert(!m.outcomes.some(o => o.evidence.length), 'Ergebnisse referenzieren das bestehende Transkript.', 409);
  m.transcript = segments; m.transcriptHash = hash; m.analyzedHash = undefined;
  event(m, actor, 'transcript.imported', `${segments.length} Transkriptsegmente importiert.`); return true;
}
export function command(m: Meeting, actor: Actor, body: Record<string, unknown>) {
  const type = z.string().parse(body.type);
  const step = m.template.steps[m.currentStep];
  if (['start', 'next', 'skip', 'agenda.add', 'agenda.phase', 'agenda.resolve', 'note'].includes(type)) assert(m.status !== 'completed', 'Das Meeting ist abgeschlossen.');
  switch (type) {
    case 'start': assert(m.status === 'scheduled', 'Meeting wurde bereits gestartet.'); m.status = 'active'; m.stepStartedAt = now(); event(m, actor, 'started', 'Meeting gestartet.'); break;
    case 'next': case 'skip': {
      assert(m.status === 'active', 'Meeting zuerst starten.');
      if (type === 'skip') assert(step.optional, 'Dieser Schritt ist nicht optional.');
      if (type === 'next') m.completedSteps.push(step.id);
      event(m, actor, type === 'skip' ? 'step.skipped' : 'step.completed', step.title);
      if (m.currentStep === m.template.steps.length - 1) { m.status = 'completed'; m.stepStartedAt = null; event(m, actor, 'completed', 'Meeting abgeschlossen.'); }
      else { m.currentStep++; m.stepStartedAt = now(); }
      break;
    }
    case 'note': m.notes[step.id] = z.string().max(20000).parse(body.text); event(m, actor, 'note.updated', step.title); break;
    case 'agenda.add': {
      const stepId = z.string().parse(body.stepId); assert(m.template.steps.some(s => s.id === stepId && s.kind === 'agenda'), 'Kein Agenda-Schritt.');
      m.agenda.push({ id: randomUUID(), stepId, title: z.string().trim().min(1).max(500).parse(body.title), owner: z.string().max(200).parse(body.owner ?? ''), phase: 0, status: 'open' }); event(m, actor, 'agenda.added', String(body.title)); break;
    }
    case 'agenda.proposal': {
      const a = m.agenda.find(a => a.id === body.id); assert(a, 'Agendaelement fehlt.');
      assert(m.status !== 'completed' && a.status === 'open', 'Das Meeting oder der Agendapunkt ist abgeschlossen.');
      a.proposal = z.string().trim().min(1).max(12000).parse(body.proposal);
      a.objections = z.string().max(12000).parse(body.objections ?? '');
      event(m, actor, 'agenda.proposal.saved', `Vorschlagsentwurf gespeichert: ${a.title}`); break;
    }
    case 'agenda.phase': case 'agenda.resolve': {
      const a = m.agenda.find(a => a.id === body.id); assert(a, 'Agendaelement fehlt.');
      assert(m.status === 'active' && a.stepId === step.id, 'Agendaelement ist nicht im aktiven Schritt.'); assert(a.status === 'open', 'Agendaelement bereits abgeschlossen.');
      if (type === 'agenda.phase') { const p = z.number().int().min(0).max(Math.max(0, step.phases.length - 1)).parse(body.phase); a.phase = p; event(m, actor, type, `${a.title}: ${step.phases[p]}`); }
      else { a.status = 'resolved'; event(m, actor, type, a.title); } break;
    }
    case 'outcome.add': addOutcome(m, actor, body.outcome); break;
    case 'outcome.review': {
      const o = m.outcomes.find(o => o.id === body.id); assert(o, 'Ergebnis fehlt.'); assert(!o.export, 'Exportierte Ergebnisse sind unveränderlich.', 409);
      const status = z.enum(['approved', 'rejected', 'proposed']).parse(body.status);
      o.status = status; o.approvedBy = status === 'approved' ? actor.id : undefined; o.approvedAt = status === 'approved' ? now() : undefined;
      event(m, actor, `outcome.${status}`, o.title); break;
    }
    case 'outcome.edit': {
      const o = m.outcomes.find(o => o.id === body.id); assert(o && !o.export, 'Ergebnis kann nicht bearbeitet werden.', 409);
      const input = outcomeInput.parse(body.outcome); const temp = structuredClone(m); addOutcome(temp, actor, input, o.source);
      Object.assign(o, input, { status: 'proposed', approvedBy: undefined, approvedAt: undefined }); event(m, actor, 'outcome.edited', o.title); break;
    }
    default: assert(false, 'Unbekannte Aktion.');
  }
}
