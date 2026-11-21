import { z } from 'zod';
import { AppError } from '../../shared/model';
import type { RoleAlphaSession } from './tools';

export const circleQuery = z.object({ query: z.string().trim().max(200).default('') });

/**
 * Where circles and teams live in roleALPHA: circles (and guilds) are roles with a subtype, teams of a classic
 * organisation are org units. Both are searched with roleALPHA's read-only search tools; an endpoint that does not
 * offer one of them, or answers with something else, simply contributes nothing.
 */
const sources = [
  { tool: 'search_roles', key: 'roles', kind: 'role' },
  { tool: 'search_organigramms', key: 'organigramms', kind: 'unit' },
] as const;
export type CircleKind = (typeof sources)[number]['kind'];
export type CircleResult = { id: string; name: string; kind: CircleKind };

const LIMIT = 20;
const entry = z.looseObject({ uuid: z.guid(), name: z.string().trim().min(1).max(200) });

/** Suggests circles and teams from the connected organisation; roleALPHA decides what the user may see. */
export async function searchCircles(session: RoleAlphaSession, raw: unknown): Promise<CircleResult[]> {
  const { query } = circleQuery.parse(raw);
  const found: CircleResult[] = [];
  for (const source of sources) {
    if (!(await session.offers(source.tool))) continue;
    let json: unknown;
    try {
      json = await session.call(source.tool, { query, limit: LIMIT }, { read: true });
    } catch (error) {
      // A tool that is not read-only or refuses the search contributes nothing; a lost connection still fails.
      if (error instanceof AppError && error.status === 502) continue;
      throw error;
    }
    const list = json && typeof json === 'object' ? (json as Record<string, unknown>)[source.key] : undefined;
    if (!Array.isArray(list)) continue;
    // An entry that does not look like an entity is left out rather than failing the whole suggestion list.
    for (const item of list.slice(0, LIMIT)) {
      const parsed = entry.safeParse(item);
      if (parsed.success) found.push({ id: parsed.data.uuid, name: parsed.data.name, kind: source.kind });
    }
  }
  const seen = new Set<string>();
  return found.filter(c => !seen.has(c.id) && !!seen.add(c.id));
}
