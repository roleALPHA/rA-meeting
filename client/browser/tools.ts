import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { AppError, assert } from '../../shared/model';
import type { BrowserHost } from './host';
import { connectRoleAlpha } from './rolealpha';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;
type Properties = Record<string, { type?: string }>;

/** roleALPHA reports some failures as `{"error": "..."}` in the result instead of `isError`. */
function failure(json: unknown): string | null {
  if (!json || typeof json !== 'object' || !('error' in json)) return null;
  const error = (json as { error: unknown }).error;
  return typeof error === 'string' ? error : JSON.stringify(error);
}

/** The JSON a tool returned, bounded before anything is parsed. */
export function resultJson(result: ToolResult, limit = 200_000): unknown {
  const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
  const serialized = result.structuredContent
    ? JSON.stringify(result.structuredContent)
    : text && 'text' in text
      ? String(text.text)
      : '';
  assert(serialized.length <= limit, 'error.rolealpha.toolIncompatible', 502);
  if (result.isError) throw new AppError(502, 'error.rolealpha.toolFailed', { detail: serialized.slice(0, 300) });
  let json: unknown;
  try {
    json = JSON.parse(serialized);
  } catch {
    throw new AppError(502, 'error.rolealpha.toolIncompatible');
  }
  const refused = failure(json);
  if (refused) throw new AppError(502, 'error.rolealpha.toolFailed', { detail: refused.slice(0, 300) });
  return json;
}

/**
 * One MCP session with roleALPHA for one user action. Tools are looked up by name in `tools/list`; a tool meant to
 * read must declare itself read-only and non-destructive, or it is never called. The organisation is passed only to
 * a tool that declares a parameter for it; roleALPHA's public endpoint takes it from the token.
 */
export class RoleAlphaSession {
  private tools: Map<string, Tool> | null = null;
  private constructor(
    private host: BrowserHost,
    private client: Client,
  ) {}

  static async run<T>(host: BrowserHost, work: (session: RoleAlphaSession) => Promise<T>): Promise<T> {
    const client = new Client({ name: 'ra-sessions', version: '2.0.0' });
    try {
      await connectRoleAlpha(host, client);
      return await work(new RoleAlphaSession(host, client));
    } finally {
      await client.close().catch(() => {});
    }
  }

  async tool(name: string): Promise<Tool | undefined> {
    if (!this.tools) {
      const tools = new Map<string, Tool>();
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const response = await this.client.listTools(cursor ? { cursor } : {});
        for (const tool of response.tools) tools.set(tool.name, tool);
        if (!response.nextCursor || response.nextCursor === cursor) break;
        cursor = response.nextCursor;
      }
      this.tools = tools;
    }
    return this.tools.get(name);
  }

  /** Whether roleALPHA offers a tool; for features that older releases do not have yet. */
  async offers(name: string) {
    return !!(await this.tool(name));
  }

  /**
   * Calls a tool and returns its JSON. `read` tools must be annotated read-only. Every argument must be declared by
   * the tool, except those listed in `optional`, which are left out when the tool does not know them; every argument
   * the tool requires must be present. So a changed contract fails before anything is sent.
   */
  async call(
    name: string,
    args: Record<string, unknown>,
    options: { read: boolean; optional?: string[]; timeout?: number; limit?: number },
  ): Promise<unknown> {
    const tool = await this.tool(name);
    assert(tool, 'error.rolealpha.toolMissing', 502, { tool: name });
    const properties = (tool.inputSchema.properties ?? {}) as Properties;
    const sent: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined) continue;
      if (key in properties) sent[key] = value;
      else assert(options.optional?.includes(key), 'error.rolealpha.toolIncompatible', 502);
    }
    const tenant = this.host.roleAlpha?.tenant;
    if (tenant && properties.tenant_uuid) sent.tenant_uuid = tenant;
    if (tenant && properties.organisation) sent.organisation = tenant;
    assert(
      (!options.read || (tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false)) &&
        (tool.inputSchema.required || []).every(k => k in sent),
      'error.rolealpha.toolIncompatible',
      502,
    );
    const result = await this.client.callTool({ name, arguments: sent }, undefined, {
      timeout: options.timeout ?? 30_000,
    });
    return resultJson(result, options.limit);
  }
}
