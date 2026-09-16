import { assert, type CalendarEntry } from './model.js';

import { z } from 'zod';
const eventSchema = z.object({ id: z.string(), subject: z.string().nullable().optional(), isCancelled: z.boolean().optional(), type: z.string().optional(), seriesMasterId: z.string().nullable().optional(), start: z.object({ dateTime: z.string(), timeZone: z.string() }), end: z.object({ dateTime: z.string(), timeZone: z.string() }), onlineMeeting: z.object({ joinUrl: z.string().url() }).nullable().optional(), webLink: z.string().url().optional() });
const fields = 'id,subject,start,end,isCancelled,type,seriesMasterId,onlineMeeting,webLink';
function entry(raw: unknown, organizerId: string): CalendarEntry {
  const e = eventSchema.parse(raw);
  const utc = (date: { dateTime: string; timeZone: string }) => {
    assert(date.timeZone === 'UTC', 'Kalenderantwort muss UTC-Zeitstempel liefern.', 502);
    return new Date(/[Zz]$|[+-]\d\d:\d\d$/.test(date.dateTime) ? date.dateTime : `${date.dateTime}Z`).toISOString();
  };
  return { eventId: e.id, organizerId, title: e.subject || 'Ohne Titel', start: utc(e.start), end: utc(e.end), cancelled: e.isCancelled || false, occurrence: e.type === 'occurrence' || e.type === 'exception', seriesMasterId: e.seriesMasterId ?? null, joinUrl: e.onlineMeeting?.joinUrl ?? null, webUrl: e.webLink ?? null, syncedAt: new Date().toISOString() };
}
export async function calendarEntries(organizerId: string, read: (path: string, init?: RequestInit) => Promise<Response>) {
  const from = new Date(); from.setDate(from.getDate() - 1);
  const to = new Date(); to.setDate(to.getDate() + 30);
  const query = new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), '$select': fields, '$top': '200', '$orderby': 'start/dateTime' });
  const data = await (await read(`/users/${encodeURIComponent(organizerId)}/calendarView?${query}`, { headers: { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } })).json() as { value: unknown[]; '@odata.nextLink'?: string };
  return { entries: data.value.map(e => entry(e, organizerId)).filter(e => !e.cancelled), truncated: Boolean(data['@odata.nextLink']) };
}
export async function calendarEntry(organizerId: string, eventId: string, read: (path: string, init?: RequestInit) => Promise<Response>) {
  const data = await (await read(`/users/${encodeURIComponent(organizerId)}/events/${encodeURIComponent(eventId)}?$select=${fields}`, { headers: { Prefer: 'outlook.timezone="UTC", IdType="ImmutableId"' } })).json();
  return entry(data, organizerId);
}
