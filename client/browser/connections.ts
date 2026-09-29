import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { AppError, assert } from '../../shared/model';
import type { MessageId } from '../../shared/i18n';
import {
  editItems,
  hasPermission,
  managePermissions,
  spJson,
  workspaceAccess,
  type SPRequest,
} from '../../shared/storage/sharepoint-rest';
import { connectionSettingsSchema, noConnections, type BrowserHost, type ConnectionSettings } from './host';
import { completeTask } from './ai/provider';
import { connectRoleAlpha, findTool } from './rolealpha';

/**
 * AI and roleALPHA connections of a workspace.
 *
 * Whoever sets the AI or roleALPHA address decides where transcripts and meeting content go. Workspace records can be
 * changed by every site member directly in SharePoint, so the connections live in a list of their own whose
 * permissions are narrowed when it is created: everyone keeps read access, only site owners (Manage Permissions) can
 * write. If that protection is gone, the connections are off until an owner saves them again.
 */
export const connectionsListTitle = 'rA Meetings Connections';
const itemTitle = 'connections';

export type ConnectionsState = {
  settings: ConnectionSettings;
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
  /** `missing`: nothing saved yet. `unprotected`: someone restored inherited permissions; connections are off. */
  protection: 'missing' | 'protected' | 'unprotected';
  /** The stored value could not be read; connections are off until an owner saves them again. */
  invalid: boolean;
};

const stored = z
  .object({
    version: z.number().int().min(1),
    settings: connectionSettingsSchema,
    updatedAt: z.string(),
    updatedBy: z.string(),
  })
  .strict();

const empty = (protection: ConnectionsState['protection'], invalid = false, version = 0): ConnectionsState => ({
  settings: noConnections,
  version,
  updatedAt: null,
  updatedBy: null,
  protection,
  invalid,
});

type ListInfo = { Id: string; HasUniqueRoleAssignments: boolean };
type Item = { Id: number; Settings?: string | null };

async function findList(request: SPRequest): Promise<ListInfo | null> {
  try {
    return await spJson<ListInfo>(
      request,
      `/web/lists/getbytitle('${connectionsListTitle}')?$select=Id,HasUniqueRoleAssignments`,
    );
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

const listPath = (id: string) => {
  assert(/^[0-9a-f-]{36}$/i.test(id), 'error.connections.invalidStoredValue', 502);
  return `/web/lists(guid'${id}')`;
};

async function findItem(request: SPRequest, list: ListInfo): Promise<Item | undefined> {
  const items = await spJson<{ value: Item[] }>(
    request,
    `${listPath(list.Id)}/items?$select=Id,Settings&$filter=Title eq '${itemTitle}'&$orderby=Id&$top=1`,
  );
  return items.value[0];
}

export async function loadConnections(request: SPRequest): Promise<ConnectionsState> {
  const list = await findList(request);
  if (!list) return empty('missing');
  const protection = list.HasUniqueRoleAssignments ? 'protected' : 'unprotected';
  const item = await findItem(request, list);
  if (!item?.Settings) return empty(protection);
  let raw: unknown;
  try {
    raw = JSON.parse(item.Settings);
  } catch {
    return empty(protection, true);
  }
  const parsed = stored.safeParse(raw);
  // The version is still reported, so an owner can overwrite the value and restore the protection.
  if (!parsed.success || protection === 'unprotected') {
    const version = z.object({ version: z.number().int().min(0) }).safeParse(raw);
    return empty(protection, !parsed.success, version.success ? version.data.version : 0);
  }
  return { ...parsed.data, protection, invalid: false };
}

/**
 * Loads the workspace's connections into the host. Without the list the host keeps what it was given, which is
 * no connections in SharePoint and Teams.
 */
export async function applyConnections(host: BrowserHost): Promise<ConnectionsState> {
  const state = await loadConnections(host.sharepoint);
  if (state.protection !== 'missing') host.settings = state.settings;
  return state;
}

async function createList(request: SPRequest): Promise<ListInfo> {
  const list = await spJson<{ Id: string }>(request, '/web/lists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;odata=nometadata' },
    body: JSON.stringify({
      Title: connectionsListTitle,
      BaseTemplate: 100,
      Description: 'roleALPHA Meetings – KI- und roleALPHA-Verbindungen (nur Websitebesitzer)',
    }),
  });
  await spJson(request, `${listPath(list.Id)}/fields/createfieldasxml`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json;odata=nometadata' },
    body: JSON.stringify({
      parameters: {
        SchemaXml:
          '<Field Type="Note" Name="Settings" StaticName="Settings" DisplayName="Settings" NumLines="6" RichText="FALSE" />',
        Options: 0,
      },
    }),
  });
  return { Id: list.Id, HasUniqueRoleAssignments: false };
}

type Binding = { Id: number; BasePermissions: { Low: string | number } };
type Assignment = { PrincipalId: number; RoleDefinitionBindings: Binding[] };

/**
 * Stops inheriting the site's permissions and turns every assignment that could change items into Read, except for
 * site owners. Nobody loses read access and nobody gains anything.
 */
export async function protectConnections(request: SPRequest, listId: string) {
  const path = listPath(listId);
  await spJson(request, `${path}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)`, {
    method: 'POST',
  });
  const read = await spJson<{ Id: number }>(request, '/web/roledefinitions/getbytype(2)?$select=Id');
  const assignments = await spJson<{ value: Assignment[] }>(
    request,
    `${path}/roleassignments?$select=PrincipalId,RoleDefinitionBindings/Id,RoleDefinitionBindings/BasePermissions&$expand=RoleDefinitionBindings`,
  );
  for (const assignment of assignments.value) {
    const bindings = assignment.RoleDefinitionBindings;
    if (bindings.some(b => hasPermission(b.BasePermissions.Low, managePermissions))) continue;
    const writing = bindings.filter(b => hasPermission(b.BasePermissions.Low, editItems));
    if (!writing.length) continue;
    const principal = z.number().int().parse(assignment.PrincipalId);
    // Read first, so the principal never loses access in between.
    if (!bindings.some(b => b.Id === read.Id))
      await spJson(
        request,
        `${path}/roleassignments/addroleassignment(principalid=${principal},roledefid=${read.Id})`,
        {
          method: 'POST',
        },
      );
    for (const binding of writing)
      await spJson(
        request,
        `${path}/roleassignments/removeroleassignment(principalid=${principal},roledefid=${z.number().int().parse(binding.Id)})`,
        { method: 'POST' },
      );
  }
}

/** Site owners only. Saving also restores the list's protection if someone removed it. */
export async function saveConnections(
  host: BrowserHost,
  input: { settings: unknown; version: number },
  actorId: string,
): Promise<ConnectionsState> {
  const request = host.sharepoint;
  assert((await workspaceAccess(request)).owner, 'error.connections.ownersOnly', 403);
  const settings = connectionSettingsSchema.parse(input.settings);
  const current = await loadConnections(request);
  assert(current.version === input.version, 'error.sharepointRest.recordHasChangedPlease', 409);
  const list = (await findList(request)) ?? (await createList(request));
  if (!list.HasUniqueRoleAssignments) await protectConnections(request, list.Id);
  const next = {
    version: current.version + 1,
    settings,
    updatedAt: new Date().toISOString(),
    updatedBy: actorId,
  };
  const fields = { Title: itemTitle, Settings: JSON.stringify(next) };
  const item = await findItem(request, list);
  const path = listPath(list.Id);
  if (item) {
    const r = await request(`${path}/items(${z.number().int().parse(item.Id)})?$select=Id`);
    assert(r.ok, 'error.sharepointRest.sharepointUnavailablePleaseTry', 502);
    const etag = r.headers.get('ETag') || ((await r.json()) as { 'odata.etag'?: string })['odata.etag'];
    assert(etag, 'error.sharepointRest.sharepointReturnedVersionIdentifier', 502);
    await spJson(request, `${path}/items(${item.Id})`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;odata=nometadata',
        'X-HTTP-Method': 'MERGE',
        'IF-MATCH': etag,
      },
      body: JSON.stringify(fields),
    });
  } else
    await spJson(request, `${path}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;odata=nometadata' },
      body: JSON.stringify(fields),
    });
  host.settings = settings;
  return { ...next, protection: 'protected', invalid: false };
}

export type ConnectionPart = 'ai' | 'roleAlpha';

/** The browser could not reach the service at all: network, CORS or a blocked address. */
const unreachable = () => new AppError(502, 'error.connections.unreachable');

async function delegatedToken(host: BrowserHost, resource: string) {
  try {
    await host.token(resource);
  } catch {
    throw new AppError(403, 'error.connections.tokenFailed', { resource });
  }
}

async function reachable<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw unreachable();
  }
}

/**
 * Tries a configuration before it is saved: a delegated token for the service, then one harmless call. For AI that
 * is a tiny structured request; for roleALPHA the token exchange and the list of offered tools.
 */
export async function testConnection(host: BrowserHost, part: ConnectionPart, raw: unknown): Promise<MessageId> {
  const settings = connectionSettingsSchema.parse(raw);
  const probe: BrowserHost = { ...host, settings };
  if (part === 'ai') {
    assert(settings.ai, 'error.provider.aiConfigured', 400);
    await delegatedToken(host, settings.ai.resource);
    const completion = await reachable(() =>
      completeTask(probe, {
        name: 'check',
        instructions: 'Connection test. Answer with the JSON object {"ok": true} and nothing else.',
        data: {},
        outputSchema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
          additionalProperties: false,
        },
      }),
    );
    assert(
      z.object({ ok: z.literal(true) }).safeParse(completion.output).success,
      'error.connections.unexpectedAnswer',
      502,
    );
    return 'connections.aiTestPassed';
  }
  const roleAlpha = settings.roleAlpha;
  assert(roleAlpha, 'error.integrations.rolealphaConnected', 400);
  await delegatedToken(host, roleAlpha.resource);
  const client = new Client({ name: 'ra-meetings-connection-test', version: '1.0.0' });
  try {
    await reachable(() => connectRoleAlpha(probe, client));
    const tools = [
      ...(roleAlpha.meeting || Object.keys(roleAlpha.entities).length ? [roleAlpha.createTool] : []),
      ...(roleAlpha.governance ? [roleAlpha.governance.searchTool] : []),
      ...(roleAlpha.drafts ? [roleAlpha.drafts.searchTool] : []),
    ];
    for (const tool of tools)
      assert(
        await reachable(() => findTool(client, tool, 'error.connections.toolMissing')),
        'error.connections.toolMissing',
        502,
        { tool },
      );
  } finally {
    await client.close().catch(() => {});
  }
  return 'connections.rolealphaTestPassed';
}
