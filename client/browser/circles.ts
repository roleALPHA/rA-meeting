import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { z } from 'zod';
import { assert } from '../../shared/model';
import type { BrowserHost } from './host';
import { connectRoleAlpha, findTool, toolProperties } from './rolealpha';

export const circleQuery = z.object({ query: z.string().trim().max(200).default('') });

/**
 * Where circles and teams live in roleALPHA: circles (and guilds) are roles with a subtype, teams of a classic
 * organisation are org units. Both are searched with roleALPHA's read-only search tools; an endpoint that does not
 * offer one of them simply contributes nothing.
 */
const sources = [
  { tool: 'search_roles', key: 'roles', kind: 'role' },
  { tool: 'search_organigramms', key: 'organigramms', kind: 'unit' },
] as const;
export type CircleKind = (typeof sources)[number]['kind'];
export type CircleResult = { id: string; name: string; kind: CircleKind };

const LIMIT = 20;
const entry = z.looseObject({ uuid: z.guid(), name: z.string().trim().min(1).max(200) });

/** Reads one search result; roleALPHA answers with JSON in a text block and reports failures as {"error": "..."}. */
function entries(result: Awaited<ReturnType<Client['callTool']>>, key: string) {
  if (result.isError) return [];
  const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
  let json: unknown = result.structuredContent;
  try {
    json ??= text && 'text' in text && String(text.text).length <= 200_000 ? JSON.parse(String(text.text)) : null;
  } catch {
    json = null;
  }
  const list = json && typeof json === 'object' ? (json as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(list)) return [];
  // An entry that does not look like an entity is left out rather than failing the whole suggestion list.
  return list.slice(0, LIMIT).flatMap(e => {
    const parsed = entry.safeParse(e);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Suggests circles and teams from the connected roleALPHA organisation for a new meeting. Only tools that declare
 * themselves read-only are called; roleALPHA decides from the delegated token what the user may see.
 */
export async function searchCircles(host: BrowserHost, raw: unknown): Promise<CircleResult[]> {
  const { query } = circleQuery.parse(raw);
  const target = host.settings.roleAlpha;
  assert(target, 'error.integrations.rolealphaConnected', 503);
  const client = new Client({ name: 'ra-meetings-circles', version: '1.0.0' });
  try {
    await connectRoleAlpha(host, client);
    const found: CircleResult[] = [];
    for (const source of sources) {
      const tool = await findTool(client, source.tool, 'error.meetings.circleSearchFailed');
      const properties = toolProperties(tool);
      const args: Record<string, unknown> = { query, limit: LIMIT };
      // The tenant is passed only to a tool that declares it; a tool that takes it from the token does not need it.
      if (properties?.tenant_uuid) args.tenant_uuid = target.tenant;
      if (properties?.organisation) args.organisation = target.tenant;
      if (
        !tool ||
        tool.annotations?.readOnlyHint !== true ||
        tool.annotations?.destructiveHint !== false ||
        properties?.query?.type !== 'string' ||
        !(tool.inputSchema.required || []).every(k => k in args)
      )
        continue;
      const result = await client.callTool({ name: source.tool, arguments: args }, undefined, { timeout: 30_000 });
      for (const e of entries(result, source.key)) found.push({ id: e.uuid, name: e.name, kind: source.kind });
    }
    const seen = new Set<string>();
    return found.filter(c => !seen.has(c.id) && !!seen.add(c.id));
  } finally {
    await client.close().catch(() => {});
  }
}
