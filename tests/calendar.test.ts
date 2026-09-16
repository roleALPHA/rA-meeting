import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarEntries, calendarEntry } from '../shared/calendar.js';
const event = { id: 'occurrence-id', subject: 'Weekly', type: 'occurrence', seriesMasterId: 'series-id', start: { dateTime: '2026-09-16T09:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-09-16T10:00:00.0000000', timeZone: 'UTC' }, onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/test' }, webLink: 'https://outlook.office.com/calendar/item/test' };
test('calendar uses expanded occurrences and immutable IDs, normalizes UTC, exposes truncation', async () => {
  const result = await calendarEntries('organizer', async (path, init) => {
    assert(path.includes('/calendarView?')); assert(path.includes('%24orderby=start%2FdateTime'));
    assert(String((init?.headers as Record<string, string>).Prefer).includes('ImmutableId'));
    return Response.json({ value: [event, { ...event, id: 'cancelled', isCancelled: true }], '@odata.nextLink': 'next' });
  });
  assert.equal(result.entries.length, 1); assert.equal(result.entries[0].eventId, 'occurrence-id'); assert.equal(result.entries[0].occurrence, true); assert.equal(result.entries[0].start, '2026-09-16T09:00:00.000Z'); assert(result.truncated);
});
test('calendar refresh preserves cancelled occurrence so users see cancellation', async () => {
  const result = await calendarEntry('organizer', 'id/escaped', async path => { assert(path.includes('id%2Fescaped')); return Response.json({ ...event, isCancelled: true }); });
  assert(result.cancelled); assert.equal(result.seriesMasterId, 'series-id');
});
