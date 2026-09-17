import { z } from 'zod';
import { assert, type Meeting } from '../../../shared/model';
import { event } from '../../../shared/domain';
import { calendarEntries, calendarEntry } from '../../../shared/calendar';
import type { MeetingAction, Route } from './types';

export const calendarRoutes: Route[] = [
  {
    verb: 'GET',
    path: /^\/calendar$/,
    handle: ({ actor, read }, { url }) => {
      const organizerId = url.searchParams.get('organizerId');
      assert(!organizerId || organizerId === actor.id, 'Kein Zugriff auf diesen Kalender.', 403);
      return calendarEntries(actor.id, read);
    },
  },
];

const link: MeetingAction = async ({ store, actor, read, save }, { body }, m) => {
  assert(m.status !== 'completed', 'Abgeschlossene Meetings behalten ihre Terminzuordnung.');
  assert(body.organizerId === actor.id, 'Kein Zugriff auf diesen Kalender.', 403);
  const eventId = z.string().min(1).max(2000).parse(body.eventId);
  assert(
    !m.calendar || (m.calendar.organizerId === actor.id && m.calendar.eventId === eventId),
    'Bestehende Terminzuordnung kann nicht umgebogen werden.',
    409,
  );
  const linked = await calendarEntry(actor.id, eventId, read);
  assert(!linked.cancelled || m.calendar, 'Ein abgesagter Termin kann nicht neu verbunden werden.');
  const others = await store.list<Meeting>(actor.tenantId, 'meeting');
  assert(
    !others.some(o => o.id !== m.id && o.calendar?.organizerId === actor.id && o.calendar.eventId === eventId),
    'Dieser Termin ist bereits mit einem Meeting verbunden.',
    409,
  );
  m.calendar = linked;
  m.scheduledAt = linked.start;
  event(m, actor, 'calendar.linked', linked.title);
  return save(m);
};

export const calendarActions: Record<string, MeetingAction> = { 'calendar-link': link };
