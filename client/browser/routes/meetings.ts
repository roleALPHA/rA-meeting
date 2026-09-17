import { z } from 'zod';
import { assert, calendarLinker, type Meeting, type Tension } from '../../../shared/model';
import { importTensions, resolveTension } from '../../../shared/tensions';
import { calendarEntry, findCalendarEntry } from '../../../shared/calendar';
import { addOutcome, command, createMeeting, event, setTranscript } from '../../../shared/domain';
import { parseTranscript } from '../../../shared/transcript';
import { assistanceInput } from '../../../shared/assistance';
import { parseLanguage } from '../../../shared/i18n';
import { analyzeBrowser, assistBrowser } from '../integrations';
import type { MeetingAction, Route, RouteContext } from './types';
import { findOnlineMeeting } from './teams';

export const meetingRoutes: Route[] = [
  {
    verb: 'POST',
    path: /^\/meetings$/,
    handle: ({ store, actor }, { body }) => createMeeting(store, actor, body),
  },
];

type TranscriptPart = { id: string; createdDateTime: string; endDateTime?: string | null };
/** Transcript parts count for an event when they start between 30 minutes before and after its scheduled time. */
const windowMargin = 30 * 60 * 1000;

/**
 * Lists the Teams transcript parts of the linked online meeting and selects those recorded during
 * this event. Recurring series share one online meeting, so the time window attributes parts to the
 * linked occurrence. Times come from a fresh calendar read.
 */
async function transcriptParts(ctx: RouteContext, m: Meeting) {
  const { read, actor } = ctx;
  assert(m.calendar?.joinUrl, 'error.meetings.meetingLinkedTeams');
  const linker = calendarLinker(m.calendar);
  const current =
    linker === actor.id
      ? await calendarEntry(actor.id, m.calendar.eventId, read)
      : m.calendar.iCalUId
        ? await findCalendarEntry(actor.id, m.calendar.iCalUId, m.calendar.originalStart ?? m.calendar.start, read)
        : null;
  const { start, end, joinUrl } = current ?? m.calendar;
  assert(joinUrl, 'error.meetings.meetingLinkedTeams');
  const online = await findOnlineMeeting(ctx, joinUrl);
  assert(online, 'error.meetings.meetingLinkedTeams');
  const prefix = `/me/onlineMeetings/${encodeURIComponent(online.id)}/transcripts`;
  let path: string | undefined = prefix;
  const parts: TranscriptPart[] = [];
  const pages = new Set<string>();
  while (path) {
    assert(!pages.has(path) && pages.size < 20, 'error.meetings.invalidGraphContinuationPage');
    pages.add(path);
    const result: { value: TranscriptPart[]; '@odata.nextLink'?: string } = await (await read(path)).json();
    parts.push(...result.value);
    assert(parts.length <= 100, 'error.meetings.tooManyTranscriptParts');
    if (!result['@odata.nextLink']) break;
    const u = new URL(result['@odata.nextLink']);
    assert(
      u.origin === 'https://graph.microsoft.com' && u.pathname === `/v1.0${prefix}`,
      'error.meetings.invalidGraphContinuationPage',
    );
    path = u.pathname.slice(5) + u.search;
  }
  const from = Date.parse(start) - windowMargin;
  const to = Date.parse(end) + windowMargin;
  const matching = parts
    .filter(p => {
      const created = Date.parse(p.createdDateTime);
      return created >= from && created <= to;
    })
    .sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));
  return {
    prefix,
    matching,
    excluded: parts.length - matching.length,
    window: { start: new Date(from).toISOString(), end: new Date(to).toISOString() },
  };
}

export const meetingActions: Record<string, MeetingAction> = {
  command: async ({ actor, save, store }, { body }, m) => {
    const tensions = () => store.list<Tension>(actor.tenantId, 'tension');
    if (body.type === 'agenda.import') {
      // Brings tensions submitted while the meeting is already running onto its agenda.
      assert(importTensions(m, actor, await tensions()), 'error.tensions.nothingToImport');
    } else {
      command(m, actor, body);
      // Starting the meeting puts everything submitted to it onto the agenda.
      if (body.type === 'start') importTensions(m, actor, await tensions());
    }
    const saved = await save(m);
    // A finished agenda item resolves the tension behind it; unfinished ones stay open for another meeting.
    const item = body.type === 'agenda.resolve' ? saved.agenda.find(a => a.id === body.id) : undefined;
    if (item?.tensionId) await resolveTension(store, actor, item.tensionId);
    return saved;
  },
  assist: async ({ host }, { body }, m) => {
    const { suggestion, completion } = await assistBrowser(host, m, assistanceInput.parse(body.input));
    return {
      revision: m.revision,
      suggestion,
      ai: { provider: completion.provider, sensitivityLabel: completion.sensitivityLabel },
    };
  },
  transcript: async ({ actor, save }, { body }, m) =>
    setTranscript(m, actor, parseTranscript(z.string().max(1_000_000).parse(body.text))) ? save(m) : m,
  analyze: async ({ host, actor, save }, { body }, m) => {
    const { outcomes, completion } = await analyzeBrowser(
      host,
      m,
      parseLanguage(typeof body.language === 'string' ? body.language : host.settings.language),
    );
    for (const output of outcomes) addOutcome(m, actor, output, 'ai');
    m.analyzedHash = m.transcriptHash;
    event(m, actor, 'analysis.completed', `${outcomes.length} Ergebnisvorschläge extrahiert.`);
    // Proposals stay unapproved; the label is kept in the history so reviewers see it before approving.
    if (completion.sensitivityLabel)
      event(
        m,
        actor,
        'analysis.sensitivity',
        `Vertraulichkeitsbezeichnung der KI-Antwort: ${completion.sensitivityLabel}`,
      );
    return save(m);
  },
  /** Shows which Teams transcript parts belong to this event before anything is imported. */
  'graph-preview': async (ctx, _req, m) => {
    const { matching, excluded, window } = await transcriptParts(ctx, m);
    return {
      revision: m.revision,
      parts: matching.map(p => ({ id: p.id, createdDateTime: p.createdDateTime, endDateTime: p.endDateTime ?? null })),
      excluded,
      window,
    };
  },
  /** Imports the confirmed parts; each must still fall into the event's time window. */
  'graph-fetch': async (ctx, { body }, m) => {
    const partIds = z.array(z.string().min(1).max(500)).min(1).max(100).parse(body.partIds);
    const { prefix, matching } = await transcriptParts(ctx, m);
    const selected = matching.filter(p => partIds.includes(p.id));
    assert(selected.length === new Set(partIds).size, 'error.meetings.transcriptSelectionHasChanged', 409);
    let raw = '';
    for (const part of selected) {
      raw +=
        '\n\n' + (await (await ctx.read(`${prefix}/${encodeURIComponent(part.id)}/content?$format=text/vtt`)).text());
      assert(raw.length <= 1_000_000, 'error.meetings.transcriptTooLargeMax', 413);
    }
    return setTranscript(m, ctx.actor, parseTranscript(raw)) ? ctx.save(m) : m;
  },
};
