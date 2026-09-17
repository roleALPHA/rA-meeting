import { z } from 'zod';
import { assert, type Meeting } from '../../../shared/model';
import { addOutcome, command, createMeeting, event, setTranscript } from '../../../shared/domain';
import { parseTranscript } from '../../../shared/transcript';
import { assistanceInput } from '../../../shared/assistance';
import { parseLanguage } from '../../../shared/i18n';
import { analyzeBrowser, assistBrowser } from '../integrations';
import type { MeetingAction, Route, RouteContext } from './types';

export const meetingRoutes: Route[] = [
  {
    verb: 'POST',
    path: /^\/meetings$/,
    handle: ({ store, actor }, { body }) => createMeeting(store, actor, body),
  },
];

/** Retrieves the Teams transcript of a linked, non-recurring meeting with the user's delegated permissions. */
async function teamsTranscript({ read }: RouteContext, m: Meeting) {
  assert(
    !m.calendar?.occurrence,
    'Bei Serienterminen das Transkript dieser Durchführung manuell importieren; automatische Zuordnung wird noch nicht unterstützt.',
  );
  assert(m.calendar?.joinUrl, 'Meeting ist nicht mit Teams verknüpft.');
  const filter = encodeURIComponent(`JoinWebUrl eq '${m.calendar.joinUrl.replaceAll("'", "''")}'`);
  const meetings = (await (await read(`/me/onlineMeetings?$filter=${filter}`)).json()) as {
    value: { id: string }[];
  };
  assert(meetings.value.length === 1, 'Meeting ist nicht mit Teams verknüpft.');
  const prefix = `/me/onlineMeetings/${encodeURIComponent(meetings.value[0].id)}/transcripts`;
  let path: string | undefined = prefix;
  const parts: { id: string; createdDateTime: string }[] = [];
  const pages = new Set<string>();
  while (path) {
    assert(!pages.has(path) && pages.size < 20, 'Ungültige Graph-Folgeseite.');
    pages.add(path);
    const result: { value: typeof parts; '@odata.nextLink'?: string } = await (await read(path)).json();
    parts.push(...result.value);
    assert(parts.length <= 100, 'Zu viele Transkriptteile.');
    if (!result['@odata.nextLink']) break;
    const u = new URL(result['@odata.nextLink']);
    assert(
      u.origin === 'https://graph.microsoft.com' && u.pathname === `/v1.0${prefix}`,
      'Ungültige Graph-Folgeseite.',
    );
    path = u.pathname.slice(5) + u.search;
  }
  assert(parts.length, 'Noch kein Transkript verfügbar.');
  let raw = '';
  for (const part of parts.sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime))) {
    raw += '\n\n' + (await (await read(`${prefix}/${encodeURIComponent(part.id)}/content?$format=text/vtt`)).text());
    assert(raw.length <= 1_000_000, 'Transkript ist zu groß (max. 1 MB).', 413);
  }
  return parseTranscript(raw);
}

export const meetingActions: Record<string, MeetingAction> = {
  command: async ({ actor, save }, { body }, m) => {
    command(m, actor, body);
    return save(m);
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
  'graph-fetch': async (ctx, _req, m) => {
    const segments = await teamsTranscript(ctx, m);
    return setTranscript(m, ctx.actor, segments) ? ctx.save(m) : m;
  },
};
