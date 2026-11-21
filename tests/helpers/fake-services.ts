import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

/**
 * roleALPHA, Microsoft Graph and the SharePoint tenant property as the side panel sees them, for the tests and the
 * local preview. It runs in Node and in the browser: everything goes through one `fetch` function.
 *
 * roleALPHA follows the contract in shared/meeting.ts and rA-app: a token endpoint that exchanges the Entra token,
 * and an MCP endpoint whose read tools are annotated read-only.
 */
export const tenant = '11111111-1111-4111-8111-111111111111';
export const user = '22222222-2222-4222-8222-222222222222';
export const mcpUrl = 'https://rolealpha.example/api/mcp';
export const tokenUrl = 'https://rolealpha.example/api/auth/oauth/token';
export const appUrl = 'https://app.rolealpha.example';
export const chatId = '19:meeting_abc@thread.v2';
/** The tenant property that points the app at the fake roleALPHA. */
export const fakeProperty = JSON.stringify({
  url: mcpUrl,
  resource: 'api://rolealpha',
  scope: 'access_as_user',
  appUrl,
});

export const circles = [
  { uuid: 'a3731bd7-c586-43a4-9e16-92d0eed82106', name: 'Finance' },
  { uuid: '5d92105c-fa4a-4363-9b4a-a5ebe209ad11', name: 'IT' },
];
export const units = [{ uuid: '8da474a2-6677-41fd-a8d6-b713528c92c0', name: 'Geschäftsführung' }];
const financeLead = '9b8d1414-1a55-47d4-8bcb-1321bd3684df';

type Draft = { draftId: string; entityType: string; action: string; status: string; entityUuid: string; name: string };
type Scenario = {
  scenarioId: string;
  name: string;
  status: string;
  meetingRef: string;
  start: string;
  circle: { uuid: string; name: string } | null;
  drafts: Draft[];
};

export type FakeOptions = {
  organisations?: { uuid: string; name: string }[];
  /** Tools that are offered but not annotated read-only, to test that the app refuses them. */
  notReadOnly?: string[];
  /** Tools the endpoint does not offer, like an older roleALPHA release. */
  missing?: string[];
  /** Modules whose drafts are published directly on submit (approval mode "Liberal"). */
  liberal?: string[];
  /** Answers of roleALPHA's directory, by e-mail. */
  accounts?: string[];
  /** An older roleALPHA whose ask_ralph has no `proposals` parameter. */
  oldRalph?: boolean;
  /** Overrides rALPH's answer. */
  ralph?: (args: Record<string, unknown>) => unknown;
  /** No Teams meeting chat behind the context. */
  chatType?: string;
  /** Value of the SharePoint tenant property; null means not set. Default: the fake roleALPHA. */
  tenantProperty?: string | null;
  /** Simulated latency in milliseconds, for the preview. */
  delay?: number;
};

export function fakeServices(options: FakeOptions = {}) {
  const organisations = options.organisations ?? [{ uuid: tenant, name: 'Larkfield Consulting' }];
  const state = {
    scenarios: [] as Scenario[],
    calls: [] as { tool: string; args: Record<string, unknown> }[],
    exchanges: [] as URLSearchParams[],
    messages: [] as string[],
    members: ['anna@customer.example', 'ben@customer.example', 'gast@extern.example'],
    topic: 'Finance · Governance-Meeting',
  };
  const servers: McpServer[] = [];
  const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();
  const sessionTokens = new Map<string, string>();
  const read = { readOnlyHint: true, destructiveHint: false };
  const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] });
  const scenarioOut = (s: Scenario) => ({ ...s, url: `${appUrl}/scenarios/${s.scenarioId}` });

  async function session(token: string) {
    const server = new McpServer({ name: 'rolealpha-fake', version: '1.0.0' });
    servers.push(server);
    const tool = (
      name: string,
      inputSchema: z.ZodRawShape,
      readOnly: boolean,
      handle: (args: Record<string, unknown>) => unknown,
    ) => {
      if (options.missing?.includes(name)) return;
      const annotations =
        readOnly && !options.notReadOnly?.includes(name) ? read : { readOnlyHint: false, destructiveHint: false };
      server.registerTool(name, { inputSchema, annotations }, async (args: Record<string, unknown>) => {
        state.calls.push({ tool: name, args });
        return json(handle(args));
      });
    };
    tool('list_my_organisations', {}, true, () => ({ organisationen: organisations }));
    if (token === 'select-token') return connectServer(server, token);
    tool('search_roles', { query: z.string(), limit: z.number().optional() }, true, args => ({
      roles: circles.filter(c => c.name.toLowerCase().includes(String(args.query).toLowerCase())),
    }));
    tool('search_organigramms', { query: z.string(), limit: z.number().optional() }, true, args => ({
      organigramms: units.filter(c => c.name.toLowerCase().includes(String(args.query).toLowerCase())),
    }));
    tool(
      'ask_ralph',
      {
        question: z.string(),
        context: z.string().optional(),
        locale: z.enum(['de', 'en']).optional(),
        ...(options.oldRalph ? {} : { proposals: z.boolean().optional() }),
      },
      true,
      args =>
        options.ralph?.(args) ??
        (args.proposals
          ? {
              answer: 'Daraus folgen eine neue Rolle und eine geänderte Verantwortung.',
              skills_used: ['governance'],
              entities: [{ name: 'Finance Lead', uuid: financeLead }],
              proposals: [
                {
                  kind: 'entity',
                  action: 'create',
                  entityType: 'role',
                  name: 'Lieferantenverträge',
                  fields: { purpose: 'Verträge mit Lieferanten sauber führen', accountabilities: ['Verträge prüfen'] },
                  ref: 'role-lieferanten',
                  rationale: 'Die Notiz nennt eine neue Verantwortung.',
                },
                {
                  kind: 'relationship',
                  relTypeId: 7,
                  relTypeName: 'IS_IMPLEMENTED_BY',
                  sourceUuid: circles[0].uuid,
                  targetRef: 'role-lieferanten',
                  sourceLabel: 'Finance',
                  targetLabel: 'Lieferantenverträge',
                  rationale: 'Die Rolle gehört in den Kreis Finance.',
                },
                {
                  kind: 'entity',
                  action: 'update',
                  entityType: 'role',
                  entityUuid: financeLead,
                  name: 'Finance Lead',
                  fields: { accountabilities: ['Finance-Kreis führen', 'Lieferantenverträge freigeben'] },
                  rationale: 'Die Freigabe wandert zum Lead.',
                },
                { kind: 'entity', action: 'create', name: 'kaputt' },
              ],
            }
          : {
              answer: 'Der Kreis Finance verantwortet Belege und Zahlungen.',
              skills_used: [],
              entities: [{ name: 'Finance', uuid: circles[0].uuid }, { name: 'ohne uuid' }],
            }),
    );
    tool('describe_entity_type', { entity_type: z.string() }, true, args => ({
      entityType: args.entity_type,
      requiredFields: ['purpose', 'subtype', 'accountabilities'],
      fields: [
        { name: 'purpose', type: 'string', required: true, label: 'Purpose' },
        { name: 'subtype', type: 'string', required: true, allowedValues: ['role', 'circle', 'guild'] },
        { name: 'accountabilities', type: 'array', required: true, label: 'Accountabilities' },
        { name: 'scope', type: 'string', required: false, allowedValues: ['company_wide', 'team'] },
      ],
    }));
    tool(
      'open_meeting_scenario',
      {
        meeting_ref: z.string(),
        title: z.string().optional(),
        start: z.string().optional(),
        circle_uuid: z.string().optional(),
        create: z.boolean().optional(),
      },
      false,
      args => {
        let found = state.scenarios.find(s => s.meetingRef === args.meeting_ref && s.status === 'draft');
        if (!found && args.create === false) return { scenario: null };
        if (!found) {
          found = {
            scenarioId: `scenario-${state.scenarios.length + 1}`,
            name: String(args.title ?? ''),
            status: 'draft',
            meetingRef: String(args.meeting_ref),
            start: String(args.start ?? ''),
            circle: null,
            drafts: [],
          };
          state.scenarios.push(found);
        }
        if (args.circle_uuid)
          found.circle = [...circles, ...units].find(c => c.uuid === args.circle_uuid) ?? found.circle;
        return scenarioOut(found);
      },
    );
    tool('list_my_meeting_scenarios', {}, true, () => ({
      scenarios: state.scenarios.filter(s => s.status === 'draft').map(scenarioOut),
    }));
    const addDraft = (scenarioId: unknown, draft: Omit<Draft, 'draftId' | 'status'>) => {
      const s = state.scenarios.find(x => x.scenarioId === scenarioId);
      if (!s) return { error: 'Szenario nicht gefunden' };
      const created = { ...draft, draftId: `draft-${s.drafts.length + 1}`, status: 'draft' };
      s.drafts.push(created);
      return { draft_created: true, draftId: created.draftId, entityUuid: created.entityUuid, status: 'draft' };
    };
    tool(
      'create_entity_draft',
      {
        entity_type: z.string(),
        name: z.string(),
        custom_id: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
        scenario_id: z.string().optional(),
      },
      false,
      args =>
        addDraft(args.scenario_id, {
          entityType: String(args.entity_type),
          action: 'create',
          entityUuid: crypto.randomUUID(),
          name: String(args.name),
        }),
    );
    tool(
      'update_entity_draft',
      {
        entity_uuid: z.string(),
        name: z.string().optional(),
        fields: z.record(z.string(), z.unknown()).optional(),
        scenario_id: z.string().optional(),
      },
      false,
      args =>
        addDraft(args.scenario_id, {
          entityType: 'role',
          action: 'update',
          entityUuid: String(args.entity_uuid),
          name: String(args.name ?? ''),
        }),
    );
    tool(
      'create_relationship_draft',
      { source_uuid: z.string(), target_uuid: z.string(), rel_type_id: z.number(), scenario_id: z.string().optional() },
      false,
      args =>
        addDraft(args.scenario_id, {
          entityType: 'relationship',
          action: 'create',
          entityUuid: crypto.randomUUID(),
          name: `${args.source_uuid} → ${args.target_uuid}`,
        }),
    );
    tool('submit_meeting_scenario', { scenario_id: z.string(), participants: z.array(z.string()) }, false, args => {
      const s = state.scenarios.find(x => x.scenarioId === args.scenario_id);
      if (!s) return { error: 'Szenario nicht gefunden' };
      const liberal = s.drafts.filter(d => options.liberal?.includes(d.entityType));
      const vote = s.drafts.filter(d => !liberal.includes(d));
      const people = args.participants as string[];
      const accounts = options.accounts ?? ['anna@customer.example', 'ben@customer.example'];
      s.status = vote.length ? 'submitted' : 'published';
      return {
        published: liberal.map(d => ({ draftId: d.draftId, name: d.name, entityType: d.entityType })),
        submitted: vote.length
          ? {
              scenarioId: s.scenarioId,
              approvalMode: 'konsent',
              voters: people.filter(p => accounts.includes(p)).map(p => ({ name: p.split('@')[0] })),
            }
          : null,
        unmatchedParticipants: people.filter(p => !accounts.includes(p)),
        url: `${appUrl}/scenarios/${s.scenarioId}`,
      };
    });
    return connectServer(server, token);
  }

  /** One MCP session per initialize, addressed by its session ID like roleALPHA's endpoint; the token decides tools. */
  async function connectServer(server: McpServer, token: string) {
    const id = crypto.randomUUID();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    transports.set(id, transport);
    sessionTokens.set(id, token);
    return transport;
  }

  async function graph(url: URL, init?: RequestInit) {
    const path = decodeURIComponent(url.pathname.replace('/v1.0', ''));
    if (path === `/chats/${chatId}`)
      return Response.json({ id: chatId, topic: state.topic, chatType: options.chatType ?? 'meeting' });
    if (path === `/chats/${chatId}/members`)
      return Response.json({ value: [...state.members.map(email => ({ email })), { email: null }] });
    if (path === `/chats/${chatId}/messages` && init?.method === 'POST') {
      state.messages.push(JSON.parse(String(init.body)).body.content);
      return Response.json({ id: 'message-1' }, { status: 201 });
    }
    return new Response(null, { status: 404 });
  }

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.origin === 'https://graph.microsoft.com') return graph(url, init);
    if (url.href === tokenUrl) {
      const body = new URLSearchParams(String(init?.body));
      state.exchanges.push(body);
      if (organisations.length > 1 && !body.get('tenant_uuid'))
        return Response.json({
          access_token: 'select-token',
          expires_in: 3600,
          scope: 'rolealpha:organisation-select',
        });
      return Response.json({
        access_token: `work-token-${body.get('tenant_uuid') ?? organisations[0].uuid}`,
        expires_in: 3600,
        tenant_uuid: body.get('tenant_uuid') ?? organisations[0].uuid,
      });
    }
    if (url.href !== mcpUrl) return new Response(null, { status: 404 });
    const headers = new Headers(init?.headers);
    const token = String(headers.get('Authorization')).replace('Bearer ', '');
    if (init?.method === 'POST' && JSON.parse(String(init.body)).method === 'initialize')
      return (await session(token)).handleRequest(new Request(url, init));
    const id = headers.get('mcp-session-id') ?? '';
    const transport = transports.get(id);
    // A session belongs to the token that opened it, as the real endpoint checks.
    if (!transport || sessionTokens.get(id) !== token) return new Response(null, { status: 401 });
    return transport.handleRequest(new Request(url, init));
  };

  /** SharePoint REST of the host page: only the tenant property is read. */
  const sharepoint = async (path: string) => {
    if (path !== "/web/GetStorageEntity('rolealphaSessions')") return new Response(null, { status: 404 });
    const value = options.tenantProperty === undefined ? fakeProperty : options.tenantProperty;
    return Response.json(value === null ? { 'odata.null': true } : { Value: value });
  };

  return { state, fetch, sharepoint, close: () => Promise.all(servers.map(s => s.close())) };
}
