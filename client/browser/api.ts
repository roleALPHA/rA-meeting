import { z } from 'zod';
import type { Language, MessageId } from '../../shared/i18n';
import { AppError, assert } from '../../shared/model';
import {
  draftReceipt,
  entityDetails,
  entityHit,
  entitySearch,
  entityTypeSchema,
  myScenarios,
  noScenario,
  scenario as scenarioSchema,
  outcomeNote,
  ralphQuestion,
  submission,
  type Circle,
  type EntityHit,
  type EntityTypeSchema,
  type ExistingEntity,
  type Proposal,
  type RalphReply,
  type Scenario,
  type Submission,
} from '../../shared/meeting';
import { searchCircles, type CircleResult } from './circles';
import { connect, forgetOrganisation, type ConnectionState } from './connection';
import { adminConsentUrl } from './consent';
import type { BrowserHost } from './host';
import { currentMeeting, participants, postToMeetingChat, type MeetingInfo } from './meeting';
import { askRalph, meetingContext, proposalQuestion } from './ralph';
import { RoleAlphaSession } from './tools';

export const tools = {
  open: 'open_meeting_scenario',
  mine: 'list_my_meeting_scenarios',
  describe: 'describe_entity_type',
  search: 'search_entities',
  details: 'get_entity_details',
  createEntity: 'create_entity_draft',
  updateEntity: 'update_entity_draft',
  createRelationship: 'create_relationship_draft',
  submit: 'submit_meeting_scenario',
} as const;

export type Bootstrap = {
  userName: string;
  isTeams: boolean;
  meeting: MeetingInfo | null;
  connection: ConnectionState;
  /** The meeting's open scenario in roleALPHA, if somebody started one. */
  scenario: Scenario | null;
  /** Outside a meeting: the user's own open meeting scenarios. */
  myScenarios: Scenario[];
};

/** Outcome of adopting proposals: one entry per proposal, in order. */
export type Adoption = { results: ({ draftId: string } | { error: MessageId })[]; scenario: Scenario };

export type PanelApi = {
  tenantId: string;
  bootstrap: () => Promise<Bootstrap>;
  chooseOrganisation: (uuid: string) => Promise<Bootstrap>;
  switchOrganisation: () => Promise<Bootstrap>;
  searchCircles: (query: string) => Promise<CircleResult[]>;
  /** Starts the meeting's scenario with a circle, or changes the circle of the open one. */
  openScenario: (circle: Circle) => Promise<Scenario>;
  refreshScenario: () => Promise<Scenario | null>;
  ask: (question: string, language: Language) => Promise<RalphReply>;
  propose: (input: { topic: string; note: string }, language: Language) => Promise<RalphReply>;
  describe: (entityType: string) => Promise<EntityTypeSchema>;
  /** Finds existing entries in roleALPHA by name — the ones the user may see. */
  searchEntities: (query: string) => Promise<EntityHit[]>;
  /** Loads an existing entry with its current field values, to change it. */
  loadEntity: (uuid: string) => Promise<ExistingEntity>;
  /** Creates drafts for the confirmed proposals in the meeting's scenario. */
  adopt: (proposals: Proposal[]) => Promise<Adoption>;
  /** Submits the scenario: liberal drafts are published, the rest goes to a vote with the meeting's participants. */
  submit: () => Promise<Submission>;
  /** Posts a message into the meeting chat; a link must point into the roleALPHA application. */
  share: (text: string, link?: { label: string; url: string } | null) => Promise<void>;
  adminConsent: (resource: string, scopes: readonly string[]) => string | null;
};

const ADOPT_MAX = 20;
const SEARCH_LIMIT = 20;

export function createPanelApi(host: BrowserHost): PanelApi {
  let meeting: MeetingInfo | null = null;
  let current: Scenario | null = null;
  let resolved = false;

  const withRoleAlpha = <T>(work: (session: RoleAlphaSession) => Promise<T>) => {
    assert(host.roleAlpha, 'error.rolealpha.notConnected', 503);
    return RoleAlphaSession.run(host, work);
  };
  const needMeeting = () => {
    assert(meeting, 'error.meeting.notInMeeting', 409);
    return meeting;
  };
  const needScenario = () => {
    needMeeting();
    assert(current, 'error.meeting.noScenario', 409);
    return current;
  };

  async function open(session: RoleAlphaSession, create: boolean, circle?: Circle): Promise<Scenario | null> {
    const m = needMeeting();
    const raw = await session.call(
      tools.open,
      {
        meeting_ref: m.ref,
        title: m.title || undefined,
        start: new Date().toISOString(),
        circle_uuid: circle?.uuid,
        create,
      },
      { read: false, optional: ['title', 'start'] },
    );
    const found = scenarioSchema.safeParse(raw);
    assert(found.success || noScenario.safeParse(raw).success, 'error.rolealpha.toolIncompatible', 502);
    current = found.success ? found.data : null;
    return current;
  }

  async function bootstrap(): Promise<Bootstrap> {
    if (!resolved) {
      meeting = await currentMeeting(host);
      resolved = true;
    }
    const connection = host.roleAlpha ? ({ status: 'connected', organisation: null } as const) : await connect(host);
    let mine: Scenario[] = [];
    current = null;
    if (connection.status === 'connected') {
      await withRoleAlpha(async session => {
        if (meeting) {
          if (await session.offers(tools.open)) await open(session, false);
        } else if (await session.offers(tools.mine)) {
          const parsed = myScenarios.safeParse(await session.call(tools.mine, {}, { read: true }));
          mine = parsed.success ? parsed.data.scenarios : [];
        }
      });
    }
    return {
      userName: host.userName,
      isTeams: host.isTeams,
      meeting,
      connection,
      scenario: current,
      myScenarios: mine,
    };
  }

  /** Creates one draft and returns its receipt; refs of planned entities resolve to the drafts created before. */
  async function createDraft(
    session: RoleAlphaSession,
    scenarioId: string,
    item: Proposal,
    planned: Map<string, string>,
  ): Promise<{ draftId: string }> {
    const customId = `ra-sessions:${needMeeting().ref}:${crypto.randomUUID()}`;
    let raw: unknown;
    if (item.kind === 'entity' && item.action === 'update') {
      assert(item.entityUuid, 'error.meeting.proposalIncomplete');
      raw = await session.call(
        tools.updateEntity,
        { entity_uuid: item.entityUuid, name: item.name, fields: item.fields, scenario_id: scenarioId },
        { read: false },
      );
    } else if (item.kind === 'entity') {
      raw = await session.call(
        tools.createEntity,
        {
          entity_type: item.entityType,
          name: item.name,
          data: item.fields,
          custom_id: customId,
          scenario_id: scenarioId,
        },
        { read: false },
      );
    } else {
      const source = item.sourceUuid ?? (item.sourceRef ? planned.get(item.sourceRef) : undefined);
      const target = item.targetUuid ?? (item.targetRef ? planned.get(item.targetRef) : undefined);
      assert(source && target, 'error.meeting.relationshipEndpointMissing');
      raw = await session.call(
        tools.createRelationship,
        { source_uuid: source, target_uuid: target, rel_type_id: item.relTypeId, scenario_id: scenarioId },
        { read: false },
      );
    }
    const receipt = draftReceipt.safeParse(raw);
    assert(receipt.success, 'error.rolealpha.toolIncompatible', 502);
    if (item.kind === 'entity' && item.action === 'create' && item.ref && receipt.data.entityUuid)
      planned.set(item.ref, receipt.data.entityUuid);
    return { draftId: receipt.data.draftId };
  }

  return {
    tenantId: host.tenantId,
    bootstrap,
    async chooseOrganisation(uuid) {
      const state = await connect(host, z.guid().parse(uuid));
      assert(state.status === 'connected', 'error.rolealpha.notConnected', 503);
      return bootstrap();
    },
    async switchOrganisation() {
      await forgetOrganisation(host);
      return bootstrap();
    },
    searchCircles: async query => withRoleAlpha(session => searchCircles(session, { query })),
    async openScenario(circle) {
      return withRoleAlpha(async session => {
        const opened = await open(session, true, circle);
        assert(opened, 'error.rolealpha.toolIncompatible', 502);
        return opened;
      });
    },
    async refreshScenario() {
      if (!meeting) return null;
      return withRoleAlpha(session => open(session, false));
    },
    async ask(question, language) {
      const input = ralphQuestion.parse({ question });
      return withRoleAlpha(session =>
        askRalph(session, host, {
          question: input.question,
          context: meetingContext(language, meeting?.title ?? '', current?.circle),
          language,
        }),
      );
    },
    async propose(raw, language) {
      const input = outcomeNote.parse(raw);
      needScenario();
      return withRoleAlpha(session =>
        askRalph(session, host, {
          question: proposalQuestion(language, input.topic, input.note, current?.circle),
          context: meetingContext(language, meeting?.title ?? '', current?.circle),
          language,
          proposals: true,
        }),
      );
    },
    async describe(entityType) {
      const name = z.string().trim().min(1).max(100).parse(entityType);
      return withRoleAlpha(async session => {
        const parsed = entityTypeSchema.safeParse(
          await session.call(tools.describe, { entity_type: name }, { read: true }),
        );
        assert(parsed.success, 'error.rolealpha.toolIncompatible', 502);
        return parsed.data;
      });
    },
    async searchEntities(raw) {
      const query = z.string().trim().max(200).parse(raw);
      if (query.length < 2) return [];
      return withRoleAlpha(async session => {
        const parsed = entitySearch.safeParse(
          await session.call(tools.search, { query, limit: SEARCH_LIMIT }, { read: true, optional: ['limit'] }),
        );
        assert(parsed.success, 'error.rolealpha.toolIncompatible', 502);
        // An entry that does not look like one is left out rather than failing the whole list.
        const hits: EntityHit[] = [];
        for (const item of parsed.data.entities) {
          const hit = entityHit.safeParse(item);
          if (hit.success && !hits.some(h => h.uuid === hit.data.uuid)) hits.push(hit.data);
        }
        return hits.slice(0, SEARCH_LIMIT);
      });
    },
    async loadEntity(raw) {
      const uuid = z.guid().parse(raw);
      return withRoleAlpha(async session => {
        const parsed = entityDetails.safeParse(await session.call(tools.details, { entityUuid: uuid }, { read: true }));
        // roleALPHA answers with only the UUID when the data node cannot be read: nothing to edit then.
        assert(parsed.success && parsed.data.uuid === uuid, 'error.meeting.entityUnavailable', 502);
        return {
          uuid,
          name: parsed.data.name ?? '',
          entityType: parsed.data.entityTypeName,
          values: parsed.data.descJsonb ?? {},
        };
      });
    },
    async adopt(proposals) {
      assert(proposals.length > 0 && proposals.length <= ADOPT_MAX, 'error.meeting.proposalIncomplete');
      const { scenarioId } = needScenario();
      return withRoleAlpha(async session => {
        // Planned entities first, so relationships in the same batch can point at them.
        const order = proposals.map((item, index) => ({ item, index }));
        order.sort((a, b) => Number(a.item.kind === 'relationship') - Number(b.item.kind === 'relationship'));
        const planned = new Map<string, string>();
        const results: Adoption['results'] = new Array(proposals.length);
        for (const { item, index } of order) {
          try {
            results[index] = await createDraft(session, scenarioId, item, planned);
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            results[index] = { error: error.id };
          }
        }
        const refreshed = await open(session, false);
        return { results, scenario: refreshed ?? needScenario() };
      });
    },
    async submit() {
      const m = needMeeting();
      const { scenarioId } = needScenario();
      const people = await participants(host, m);
      return withRoleAlpha(async session => {
        const parsed = submission.safeParse(
          await session.call(tools.submit, { scenario_id: scenarioId, participants: people }, { read: false }),
        );
        assert(parsed.success, 'error.rolealpha.toolIncompatible', 502);
        current = null;
        return parsed.data;
      });
    },
    async share(text, link) {
      const m = needMeeting();
      if (link) {
        const app = new URL(host.roleAlpha?.appUrl ?? 'https://invalid.invalid');
        assert(new URL(link.url).origin === app.origin, 'error.meeting.chatMessageInvalid');
      }
      await postToMeetingChat(host, m, { text, link });
    },
    adminConsent: (resource, scopes) => adminConsentUrl(host.consent, host.tenantId, host.webUrl, resource, scopes),
  };
}
