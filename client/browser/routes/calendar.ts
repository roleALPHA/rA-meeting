import { z } from 'zod';
import { assert, AppError, calendarLinker, type Meeting, type MeetingSummary } from '../../../shared/model';
import { event } from '../../../shared/domain';
import { calendarEntries, calendarEntry, findCalendarEntry } from '../../../shared/calendar';
import { sha256Hex } from '../../../shared/hash';
import type { MeetingAction, Route, RouteContext } from './types';
import { applyTeamsRecording } from './teams';

/** Marks the workspace once no calendar link without iCalUId remains. */
const claimsComplete = { kind: 'initialized', id: 'migration-calendar-claims' };

type CalendarClaim = { meetingId: string; iCalUId: string };

export const calendarRoutes: Route[] = [
  {
    verb: 'GET',
    path: /^\/calendar$/,
    handle: ({ actor, read }, { url }) => {
      const organizerId = url.searchParams.get('organizerId');
      assert(!organizerId || organizerId === actor.id, 'error.calendar.accessCalendar', 403);
      return calendarEntries(actor.id, read);
    },
  },
];

/**
 * Reserves an event for one meeting. The index enforces unique record keys, so two meetings cannot
 * claim the same event, even when different attendees link it from their own calendars.
 */
async function claim({ store, actor }: RouteContext, meetingId: string, iCalUId: string) {
  const id = sha256Hex(iCalUId);
  try {
    await store.save(actor.tenantId, 'calendar-claim', id, 1, { meetingId, iCalUId } satisfies CalendarClaim);
  } catch (error) {
    if (!(error instanceof AppError && error.status === 409)) throw error;
    const existing = await store.get<CalendarClaim>(actor.tenantId, 'calendar-claim', id);
    assert(existing.meetingId === meetingId, 'error.calendar.eventAlreadyLinkedMeeting', 409);
  }
}

async function exists(ctx: RouteContext, kind: string, id: string) {
  try {
    await ctx.store.get(ctx.actor.tenantId, kind, id);
    return true;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return false;
    throw error;
  }
}

const link: MeetingAction = async (ctx, { body }, m) => {
  const { store, actor, read, save } = ctx;
  assert(m.status !== 'completed', 'error.calendar.completedMeetingsRetainTheir');
  if (m.calendar && calendarLinker(m.calendar) !== actor.id) {
    // Another editor refreshes the link from the copy of the event in their own calendar.
    assert(m.calendar.iCalUId, 'error.calendar.eventCanRefreshedOnce', 409);
    const own = await findCalendarEntry(
      actor.id,
      m.calendar.iCalUId,
      m.calendar.originalStart ?? m.calendar.start,
      read,
    );
    assert(own, 'error.calendar.eventCalendarAskPerson', 404);
    const { eventId: _ownEventId, linkedBy: _ownLinkedBy, ...details } = own;
    m.calendar = { ...m.calendar, ...details, linkedBy: calendarLinker(m.calendar)! };
    m.scheduledAt = own.start;
    event(m, actor, 'calendar.refreshed', own.title);
    await applyTeamsRecording(ctx, m);
    return save(m);
  }
  const eventId = z.string().min(1).max(2000).parse(body.eventId);
  assert(!m.calendar || m.calendar.eventId === eventId, 'error.calendar.existingEventLinkCannot', 409);
  const linked = await calendarEntry(actor.id, eventId, read);
  assert(!linked.cancelled || m.calendar, 'error.calendar.cancelledEventCannotNewly');
  assert(linked.iCalUId, 'error.calendar.calendarDidReturnUnique', 502);
  if (!(await exists(ctx, claimsComplete.kind, claimsComplete.id))) {
    // Links from earlier versions have no claim yet; keep checking them directly until backfilled.
    const others = await store.list<Meeting>(actor.tenantId, 'meeting');
    assert(
      !others.some(
        o =>
          o.id !== m.id &&
          o.calendar &&
          (o.calendar.iCalUId === linked.iCalUId ||
            (calendarLinker(o.calendar) === actor.id && o.calendar.eventId === eventId)),
      ),
      'error.calendar.eventAlreadyLinkedMeeting',
      409,
    );
  }
  await claim(ctx, m.id, linked.iCalUId);
  m.calendar = linked;
  m.scheduledAt = linked.start;
  event(m, actor, 'calendar.linked', linked.title);
  await applyTeamsRecording(ctx, m);
  return save(m);
};

export const calendarActions: Record<string, MeetingAction> = { 'calendar-link': link };

/**
 * Adds iCalUId and a claim to calendar links made by earlier versions. Only the person who linked
 * an event can read it by its mailbox-specific ID, so each person's links are completed when they
 * open the app. Failures are ignored and retried on the next start.
 */
export async function backfillCalendarClaims(ctx: RouteContext, meetings: MeetingSummary[]): Promise<boolean> {
  const { actor, read, store, get, save } = ctx;
  if (actor.workspace !== 'write' || (await exists(ctx, claimsComplete.kind, claimsComplete.id))) return false;
  let changed = false;
  const legacy = meetings.filter(m => m.calendar && !m.calendar.iCalUId);
  for (const summary of legacy.filter(m => calendarLinker(m.calendar!) === actor.id)) {
    try {
      const m = await get(summary.id, true);
      if (!m.calendar || m.calendar.iCalUId) continue;
      const refreshed = await calendarEntry(actor.id, m.calendar.eventId, read);
      if (!refreshed.iCalUId) continue;
      await claim(ctx, m.id, refreshed.iCalUId);
      m.calendar = {
        ...m.calendar,
        iCalUId: refreshed.iCalUId,
        originalStart: refreshed.originalStart,
        linkedBy: actor.id,
      };
      await save(m);
      summary.calendar = m.calendar;
      changed = true;
    } catch {
      /* Retried on the next start. */
    }
  }
  if (meetings.every(m => !m.calendar || m.calendar.iCalUId)) {
    try {
      await store.save(actor.tenantId, claimsComplete.kind, claimsComplete.id, 1, {});
    } catch (error) {
      if (!(error instanceof AppError && error.status === 409)) throw error;
    }
  }
  return changed;
}
