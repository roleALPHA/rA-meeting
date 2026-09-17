import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { AppError, assert, type DraftLink } from '../../shared/model';
import { checkDraftLink } from '../../shared/tensions';
import { endpointFetch, type BrowserHost } from './host';

export const draftQuery = z.object({ query: z.string().trim().max(200).default('') });
const draftResults = z
  .object({
    drafts: z
      .array(
        z
          .object({
            draftId: z.string().min(1).max(200),
            title: z.string().min(1).max(500),
            entityType: z.string().min(1).max(100),
            status: z.string().max(50).optional(),
            url: z.string().url().max(2000),
          })
          .strict(),
      )
      .max(20),
  })
  .strict();
export type DraftResult = DraftLink & { status?: string };

/**
 * Searches the signed-in user's own roleALPHA drafts with the administrator-approved read-only tool. roleALPHA
 * decides whose drafts these are from the delegated token; the app never passes a user ID.
 */
export async function searchDrafts(host: BrowserHost, raw: unknown): Promise<DraftResult[]> {
  const { query } = draftQuery.parse(raw);
  const target = host.settings.roleAlpha;
  const drafts = target?.drafts;
  assert(target && drafts, 'error.tensions.draftsNotConfigured', 503);
  const client = new Client({ name: 'ra-meetings-drafts', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(target.url), { fetch: endpointFetch(host, target) }),
      { timeout: 15_000 },
    );
    let cursor: string | undefined;
    let tool;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const response = await client.listTools(cursor ? { cursor } : {});
      tool = response.tools.find(t => t.name === drafts.searchTool);
      if (tool || !response.nextCursor) break;
      assert(!seen.has(response.nextCursor), 'error.tensions.draftSearchIncompatible', 502);
      seen.add(response.nextCursor);
      cursor = response.nextCursor;
    }
    const properties = tool?.inputSchema.properties as Record<string, { type?: string }> | undefined;
    const args: Record<string, unknown> = { query, limit: 20 };
    // The tenant is passed only to a tool that declares it; a tool that takes it from the token does not need it.
    if (properties?.tenant_uuid) args.tenant_uuid = target.tenant;
    assert(
      tool &&
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint === false &&
        properties?.query?.type === 'string' &&
        ['integer', 'number'].includes(properties?.limit?.type || '') &&
        (!properties.tenant_uuid || properties.tenant_uuid.type === 'string') &&
        (tool.inputSchema.required || []).every(k => k in args),
      'error.tensions.draftSearchIncompatible',
      502,
    );
    const result = await client.callTool({ name: drafts.searchTool, arguments: args }, undefined, {
      timeout: 30_000,
    });
    assert(!result.isError, 'error.tensions.draftSearchFailed', 502);
    const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
    const serialized = result.structuredContent
      ? JSON.stringify(result.structuredContent)
      : text && 'text' in text
        ? String(text.text)
        : '';
    assert(serialized.length <= 100_000, 'error.tensions.draftSearchIncompatible', 502);
    let parsed;
    try {
      parsed = draftResults.parse(JSON.parse(serialized)).drafts;
    } catch {
      throw new AppError(502, 'error.tensions.draftSearchIncompatible');
    }
    // A result pointing anywhere but the configured roleALPHA application is rejected as a whole.
    return parsed.map(d => ({ ...checkDraftLink(d, drafts.appUrl), ...(d.status ? { status: d.status } : {}) }));
  } finally {
    await client.close().catch(() => {});
  }
}
