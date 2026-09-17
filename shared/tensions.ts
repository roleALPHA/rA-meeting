const randomUUID = () => crypto.randomUUID();
import { z } from 'zod';
import { AppError, assert, type Actor, type DraftLink, type Meeting, type Tension } from './model.js';
import type { Repository as Store } from './storage/repository.js';
import { getMeeting, event } from './domain.js';

const draftLink = z
  .object({
    draftId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    entityType: z.string().trim().min(1).max(100),
    url: z.string().url().max(2000),
  })
  .strict();
const input = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(12000).default(''),
  meetingId: z.string().uuid().nullable().default(null),
  stepId: z.string().uuid().nullable().default(null),
  draft: draftLink.nullable().default(null),
  status: z.enum(['open', 'resolved']).default('open'),
});

/** Only links into the administrator-configured roleALPHA application are stored; a draft URL is never trusted. */
export function checkDraftLink(draft: DraftLink, appUrl: string | null | undefined): DraftLink {
  assert(appUrl, 'error.tensions.draftsNotConfigured');
  const url = new URL(draft.url);
  const app = new URL(appUrl);
  assert(
    url.protocol === 'https:' && url.origin === app.origin && !url.username && !url.password,
    'error.tensions.draftLinkOutsideRolealpha',
  );
  return { ...draft, url: url.href };
}

const onOpenAgenda = (meeting: Meeting, tensionId: string) =>
  meeting.status !== 'completed' && meeting.agenda.some(a => a.tensionId === tensionId && a.status === 'open');

/**
 * Submits or edits a tension. Every tension belongs to a meeting that is not completed and is processed in one of
 * its agenda steps; the meeting's template decides whether it is called a tension or an agenda item.
 */
export async function saveTension(
  store: Store,
  actor: Actor,
  raw: unknown,
  id?: string,
  version?: number,
  options: { draftAppUrl?: string | null } = {},
) {
  assert(actor.workspace === 'write', 'error.runtime.permissionSharepointWorkspace', 403);
  const data = input.parse(raw);
  const old = id ? await store.get<Tension>(actor.tenantId, 'tension', id) : null;
  if (old) assert(version === old.version, 'error.tensions.backlogItemHasChanged', 409);
  // Tensions stored before submission required a meeting may stay without one until they are moved.
  assert(data.meetingId || (old && !old.meetingId), 'error.tensions.meetingRequired');
  const meeting = data.meetingId ? await getMeeting(store, actor, data.meetingId) : null;
  const moved = !!meeting && old?.meetingId !== meeting.id;
  // A completed meeting keeps its tensions for the record, but nothing new is submitted to it.
  if (meeting && moved) assert(meeting.status !== 'completed', 'error.tensions.meetingCompleted');
  let stepId: string | null = null;
  if (meeting) {
    const agendaSteps = meeting.template.steps.filter(s => s.kind === 'agenda');
    assert(agendaSteps.length, 'error.tensions.meetingHasNoAgendaStep');
    stepId = data.stepId ?? (moved ? null : (old?.stepId ?? null)) ?? agendaSteps[0].id;
    assert(
      agendaSteps.some(s => s.id === stepId),
      'error.domain.agendaStep',
    );
  }
  if (old?.meetingId && moved) {
    // Moving is for tensions a meeting did not get to; one under discussion stays where it is.
    const previous = await store.get<Meeting>(actor.tenantId, 'meeting', old.meetingId).catch((error: unknown) => {
      if (error instanceof AppError && error.status === 404) return null;
      throw error;
    });
    assert(!previous || !onOpenAgenda(previous, old.id), 'error.tensions.tensionOnOpenAgenda', 409);
  }
  const draft = data.draft
    ? old?.draft && old.draft.url === data.draft.url && old.draft.draftId === data.draft.draftId
      ? old.draft
      : checkDraftLink(data.draft, options.draftAppUrl)
    : null;
  const time = new Date().toISOString();
  const tension: Tension = {
    title: data.title,
    description: data.description,
    status: data.status,
    circle: meeting?.circle ?? old?.circle ?? '',
    meetingId: meeting?.id ?? null,
    stepId,
    draft,
    id: old?.id || randomUUID(),
    version: (old?.version || 0) + 1,
    createdBy: old?.createdBy || actor.id,
    createdByName: old ? old.createdByName : actor.name,
    createdAt: old?.createdAt || time,
    updatedAt: time,
  };
  await store.save(actor.tenantId, 'tension', tension.id, tension.version, tension, old?.version);
  return tension;
}

/** Open tensions submitted to this meeting that are not on its agenda yet. */
export const pendingTensions = (meeting: Pick<Meeting, 'id' | 'agenda'>, tensions: Tension[]) =>
  tensions
    .filter(t => t.meetingId === meeting.id && t.status === 'open' && !meeting.agenda.some(a => a.tensionId === t.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** Puts submitted tensions on the agenda, in the order they were submitted. Returns how many were added. */
export function importTensions(meeting: Meeting, actor: Actor, tensions: Tension[]) {
  assert(meeting.status !== 'completed', 'error.tensions.meetingCompleted');
  const agendaSteps = new Set(meeting.template.steps.filter(s => s.kind === 'agenda').map(s => s.id));
  const pending = pendingTensions(meeting, tensions);
  let added = 0;
  for (const tension of pending) {
    const stepId = tension.stepId && agendaSteps.has(tension.stepId) ? tension.stepId : [...agendaSteps][0];
    if (!stepId) continue;
    added++;
    meeting.agenda.push({
      id: randomUUID(),
      tensionId: tension.id,
      stepId,
      title: tension.title,
      owner: tension.createdByName ?? '',
      status: 'open',
      phase: 0,
    });
    event(meeting, actor, 'tension.attached', `Spannung aufgenommen: ${tension.title}`);
  }
  return added;
}

/** Marks the tension behind a finished agenda item as resolved. */
export async function resolveTension(store: Store, actor: Actor, id: string) {
  const tension = await store.get<Tension>(actor.tenantId, 'tension', id).catch((error: unknown) => {
    // A tension deleted in SharePoint leaves nothing to resolve.
    if (error instanceof AppError && error.status === 404) return null;
    throw error;
  });
  if (!tension || tension.status === 'resolved') return tension;
  const next: Tension = {
    ...tension,
    status: 'resolved',
    version: tension.version + 1,
    updatedAt: new Date().toISOString(),
  };
  await store.save(actor.tenantId, 'tension', id, next.version, next, tension.version);
  return next;
}
