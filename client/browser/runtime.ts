import { askGovernance } from './governance';
import { z } from 'zod';
import {
  assert,
  AppError,
  outputTypes,
  type Actor,
  type Meeting,
  type Template,
  type Tension,
  type Bootstrap,
} from '../../shared/model';
import { SharePointRestStore, workspaceAccess } from '../../shared/storage/sharepoint-rest';
import type { Repository } from '../../shared/storage/repository';
import {
  addOutcome,
  command,
  createMeeting,
  event,
  getMeeting,
  saveMeeting,
  saveTemplate,
  setTranscript,
} from '../../shared/domain';
import { saveTension, attachTension } from '../../shared/tensions';
import { parseTranscript } from '../../shared/transcript';
import { calendarEntries, calendarEntry } from '../../shared/calendar';
import { assistanceInput } from '../../shared/assistance';
import { parseLanguage } from '../../shared/i18n';
import { type BrowserHost, graph } from './host';
import { analyzeBrowser, assistBrowser, entityPlan, meetingPlan, prepareExport } from './integrations';
export type AppApi = {
  openSetup?: () => void;
  initialMeeting?: string;
  initializeTeams: () => Promise<boolean>;
  request: <T>(path: string, body?: unknown, method?: string) => Promise<T>;
};
const rev = z.number().int().positive();
const requestBody = z.record(z.unknown());
export async function createBrowserApi(host: BrowserHost): Promise<AppApi> {
  const access = await workspaceAccess(host.sharepoint);
  const actor: Actor = {
    id: z.string().uuid().parse(host.userId),
    name: host.userName,
    tenantId: host.tenantId,
    admin: access.write,
    workspace: access.write ? 'write' : 'read',
  };
  const store = new SharePointRestStore(host.tenantId, host.webUrl, host.sharepoint);
  await store.initialize();
  if (access.write) await store.seed(host.tenantId, host.settings.language);
  return browserApi(host, store, actor);
}
export function browserApi(host: BrowserHost, store: Repository, actor: Actor): AppApi {
  const read = (path: string, init?: RequestInit) => graph(host, path, init);
  const get = (id: string, write = false) => getMeeting(store, actor, id, write);
  const save = (m: Meeting) => saveMeeting(store, actor, m, m.revision);
  const verify = (m: Meeting, body: Record<string, unknown>) =>
    assert(m.revision === rev.parse(body.revision), 'Meeting wurde inzwischen geändert. Bitte neu laden.', 409);
  const write = () =>
    assert(actor.workspace === 'write', 'Keine Berechtigung für diesen SharePoint-Arbeitsbereich.', 403);
  async function transcript(m: Meeting) {
    assert(
      !m.calendar?.occurrence,
      'Bei Serienterminen das Transkript dieser Durchführung manuell importieren; automatische Zuordnung wird noch nicht unterstützt.',
    );
    let id: string | undefined;
    if (!id && m.calendar?.joinUrl) {
      const filter = encodeURIComponent(`JoinWebUrl eq '${m.calendar.joinUrl.replaceAll("'", "''")}'`);
      const meetings = (await (await read(`/me/onlineMeetings?$filter=${filter}`)).json()) as {
        value: { id: string }[];
      };
      assert(meetings.value.length === 1, 'Meeting ist nicht mit Teams verknüpft.');
      id = meetings.value[0].id;
    }
    assert(id, 'Meeting ist nicht mit Teams verknüpft.');
    const prefix = `/me/onlineMeetings/${encodeURIComponent(id)}/transcripts`;
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
  async function dispatch(path: string, raw?: unknown, method = 'POST'): Promise<unknown> {
    const url = new URL(path, 'https://local.invalid');
    assert(url.origin === 'https://local.invalid', 'Invalid local route');
    const route = url.pathname;
    const body = raw === undefined ? {} : requestBody.parse(raw);
    const verb = raw === undefined ? 'GET' : method;
    if (route === '/governance/ask' && verb === 'POST') return askGovernance(host, body);
    if (verb !== 'GET') write();
    if (route === '/bootstrap' && verb === 'GET') {
      const meetings = await store.list<Meeting>(actor.tenantId, 'meeting');
      host.onMeetingsChanged?.(meetings.map(m => ({ id: m.id, title: m.title })));
      return {
        actor,
        templates: await store.list<Template>(actor.tenantId, 'template'),
        meetings,
        tensions: await store.list<Tension>(actor.tenantId, 'tension'),
        integrations: {
          storage: 'sharepoint',
          governance: !!host.settings.ai && !!host.settings.roleAlpha?.governance,
          ai: !!host.settings.ai,
          mcp: !!host.settings.roleAlpha?.meeting,
          entityTypes: outputTypes.filter(type => host.settings.roleAlpha?.entities[type]),
          graph: true,
        },
      } satisfies Bootstrap;
    }
    if (route === '/calendar' && verb === 'GET') {
      assert(
        !url.searchParams.get('organizerId') || url.searchParams.get('organizerId') === actor.id,
        'Kein Zugriff auf diesen Kalender.',
        403,
      );
      return calendarEntries(actor.id, read);
    }
    if (route === '/templates' && verb === 'POST') return saveTemplate(store, actor, body);
    const template = /^\/templates\/([^/]+)$/.exec(route);
    if (template && verb === 'PUT') return saveTemplate(store, actor, body, template[1], rev.parse(body.version));
    if (template && verb === 'DELETE') {
      await store.delete(actor.tenantId, 'template', template[1], rev.parse(body.version));
      return;
    }
    if (route === '/tensions' && verb === 'POST') return saveTension(store, actor, body);
    const tension = /^\/tensions\/([^/]+)(\/attach)?$/.exec(route);
    if (tension && verb === 'PUT') return saveTension(store, actor, body, tension[1], rev.parse(body.version));
    if (tension?.[2] && verb === 'POST')
      return attachTension(
        store,
        actor,
        tension[1],
        z.string().uuid().parse(body.meetingId),
        z.string().uuid().parse(body.stepId),
        rev.parse(body.revision),
      );
    if (route === '/meetings' && verb === 'POST') return createMeeting(store, actor, body);
    const match = /^\/meetings\/([^/]+)(?:\/([^/]+))?$/.exec(route);
    assert(match, 'API-Endpunkt nicht gefunden.', 404);
    const [, id, action] = match;
    const m = await get(id, verb !== 'GET');
    if (!action && verb === 'GET') return m;
    assert(verb === 'POST', 'API-Endpunkt nicht gefunden.', 404);
    verify(m, body);
    switch (action) {
      case 'command':
        command(m, actor, body);
        return save(m);
      case 'assist':
        return { revision: m.revision, suggestion: await assistBrowser(host, m, assistanceInput.parse(body.input)) };
      case 'transcript':
        return setTranscript(m, actor, parseTranscript(z.string().max(1_000_000).parse(body.text))) ? save(m) : m;
      case 'analyze': {
        const results = await analyzeBrowser(
          host,
          m,
          parseLanguage(typeof body.language === 'string' ? body.language : host.settings.language),
        );
        for (const output of results) addOutcome(m, actor, output, 'ai');
        m.analyzedHash = m.transcriptHash;
        event(m, actor, 'analysis.completed', `${results.length} Ergebnisvorschläge extrahiert.`);
        return save(m);
      }
      case 'calendar-link': {
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
      }
      case 'graph-fetch': {
        const segments = await transcript(m);
        return setTranscript(m, actor, segments) ? save(m) : m;
      }
      case 'entity-preview': {
        const output = m.outcomes.find(o => o.id === body.outcomeId);
        assert(output, 'Ergebnis fehlt.');
        return entityPlan(host, m, output);
      }
      case 'export':
      case 'export-entity': {
        const ids =
          action === 'export'
            ? z.array(z.string().uuid()).min(1).max(100).parse(body.ids)
            : [z.string().uuid().parse(body.outcomeId)];
        assert(new Set(ids).size === ids.length, 'Doppelte Ergebnis-IDs.');
        const outputs = m.outcomes.filter(o => ids.includes(o.id));
        assert(outputs.length === ids.length, 'Ergebnis fehlt.');
        const plan = action === 'export' ? meetingPlan(host, m, outputs) : entityPlan(host, m, outputs[0]);
        if (action === 'export-entity')
          assert(
            JSON.stringify(body.plan) === JSON.stringify(plan),
            'Exportvorschau hat sich geändert. Erneut prüfen.',
            409,
          );
        const target = host.settings.roleAlpha;
        assert(target, 'roleALPHA ist nicht verbunden.', 503);
        const connection = await prepareExport(host, plan, target);
        try {
          outputs.forEach(o => {
            o.export = { state: 'sending', startedAt: new Date().toISOString() };
          });
          event(m, actor, 'export.started', plan.label);
          await save(m);
          try {
            const receipt = await connection.send();
            const current = await get(id, true);
            current.outcomes
              .filter(o => ids.includes(o.id))
              .forEach(o => {
                o.export = { state: 'draft_created', draftId: receipt.draftId, entityUuid: receipt.entityUuid };
              });
            event(current, actor, 'export.completed', receipt.draftId);
            return await save(current);
          } catch {
            const current = await get(id, true);
            current.outcomes
              .filter(o => ids.includes(o.id))
              .forEach(o => {
                o.export = { state: 'uncertain' };
              });
            event(current, actor, 'export.uncertain', 'Exportantwort unklar; automatische Wiederholung gesperrt.');
            await save(current);
            throw new AppError(502, 'Export nicht eindeutig bestätigt. Prüfe den Entwurfsbereich in roleALPHA.');
          }
        } finally {
          await connection.close().catch(() => {});
        }
      }
      case 'export-reconcile': {
        const ids = z.array(z.string().uuid()).min(1).parse(body.ids);
        const note = z.string().trim().min(10).max(1000).parse(body.note);
        const resolution = z.enum(['created', 'not-created']).parse(body.resolution);
        const outputs = m.outcomes.filter(o => ids.includes(o.id));
        assert(
          outputs.length === ids.length &&
            outputs.every(
              o =>
                o.export?.state === 'uncertain' ||
                (o.export?.state === 'sending' && Date.now() - Date.parse(o.export.startedAt || '') > 300_000),
            ),
          'Nur unklare Exporte können abgeglichen werden.',
        );
        outputs.forEach(o => {
          o.export =
            resolution === 'created'
              ? { state: 'draft_created', draftId: z.string().min(1).max(200).parse(body.draftId) }
              : undefined;
        });
        event(m, actor, 'export.reconciled', `${resolution}: ${note}`);
        return save(m);
      }
      default:
        throw new AppError(404, 'API-Endpunkt nicht gefunden.');
    }
  }
  return {
    initialMeeting: host.initialMeeting,
    initializeTeams: async () => host.isTeams,
    request: async <T>(path: string, body?: unknown, method?: string) => {
      try {
        return (await dispatch(path, body, method)) as T;
      } catch (error) {
        if (error instanceof z.ZodError) throw new AppError(400, 'Bitte die markierten Eingaben prüfen.');
        throw error;
      }
    },
  };
}
