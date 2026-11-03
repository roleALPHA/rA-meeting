import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { assert, AppError } from '../../shared/model';
import {
  governanceQuestion,
  governanceSources,
  governanceAnswer,
  governanceTask,
  answersInRoleAlpha,
  ralphAnswer,
  ralphEntity,
  type GovernanceReply,
  type RalphGovernanceReply,
  type SourcedGovernanceReply,
} from '../../shared/governance';
import type { BrowserHost } from './host';
import { connectRoleAlpha, findTool, toolProperties } from './rolealpha';
import { roleAlphaEnvironment } from './rolealpha-environment';
import { completeTask } from './ai/provider';

type ToolResult = Awaited<ReturnType<Client['callTool']>>;

/** The JSON a tool returned, bounded before anything is parsed. */
function resultJson(result: ToolResult, limit: number) {
  const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
  const serialized = result.structuredContent
    ? JSON.stringify(result.structuredContent)
    : text && 'text' in text
      ? String(text.text)
      : '';
  assert(serialized.length <= limit, 'error.governance.governanceReadAccessCompatible', 502);
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new AppError(502, 'error.governance.governanceReadAccessCompatible');
  }
}

/**
 * rALPH answers on roleALPHA's server with roleALPHA's model, skills and the organisation's data, and the user's
 * roleALPHA permissions. Nothing goes to the AI service configured here. The answer is not bound to sources
 * statement by statement; the entities it names link back to roleALPHA for checking.
 */
async function askRalph(
  host: BrowserHost,
  input: { question: string; language: string },
  name: string,
): Promise<RalphGovernanceReply> {
  const target = host.settings.roleAlpha!;
  const client = new Client({ name: 'ra-meetings-governance', version: '1.0.0' });
  try {
    await connectRoleAlpha(host, client);
    const tool = await findTool(client, name, 'error.governance.governanceReadAccessCompatible');
    const properties = toolProperties(tool);
    const args: Record<string, unknown> = { question: input.question };
    // rALPH answers in German or English; the other interface languages get English.
    if (properties?.locale) args.locale = input.language === 'de' ? 'de' : 'en';
    if (properties?.tenant_uuid) args.tenant_uuid = target.tenant;
    assert(
      tool &&
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint === false &&
        properties?.question?.type === 'string' &&
        (!properties.locale || properties.locale.type === 'string') &&
        (!properties.tenant_uuid || properties.tenant_uuid.type === 'string') &&
        (tool.inputSchema.required || []).every(k => k in args),
      'error.governance.governanceReadAccessCompatible',
      502,
    );
    // rALPH stops its own turn after 120 seconds.
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 130_000 });
    assert(!result.isError, 'error.governance.ralphCouldNotAnswer', 502);
    const parsed = ralphAnswer.safeParse(resultJson(result, 100_000));
    assert(parsed.success, 'error.governance.governanceReadAccessCompatible', 502);
    const app = target.drafts?.appUrl ?? roleAlphaEnvironment.appUrl;
    const entities = parsed.data.entities.flatMap(raw => {
      const entity = ralphEntity.safeParse(raw);
      if (!entity.success) return [];
      const url = new URL('/graph', app);
      url.searchParams.set('anchor', entity.data.uuid);
      return [{ name: entity.data.name, url: url.href }];
    });
    return { kind: 'ralph', answer: parsed.data.answer, entities, retrievedAt: new Date().toISOString() };
  } finally {
    await client.close().catch(() => {});
  }
}

/** rALPH needs only roleALPHA; a search tool needs the AI service as well. */
export function governanceReady(host: BrowserHost) {
  const tool = host.settings.roleAlpha?.governance?.searchTool;
  return !!tool && (answersInRoleAlpha(tool) || !!host.settings.ai);
}

/** Fixed administrator-approved read tool; the model never selects or executes tools. */
export async function askGovernance(host: BrowserHost, raw: unknown): Promise<GovernanceReply> {
  const input = governanceQuestion.parse(raw);
  const target = host.settings.roleAlpha;
  const name = target?.governance?.searchTool;
  assert(target && name && governanceReady(host), 'governance.governanceQuestionsRequireSetup', 503);
  if (answersInRoleAlpha(name)) return askRalph(host, input, name);
  const client = new Client({ name: 'ra-meetings-governance', version: '1.0.0' });
  let sources: SourcedGovernanceReply['sources'];
  try {
    await connectRoleAlpha(host, client);
    const tool = await findTool(client, name, 'error.governance.governanceReadAccessCompatible');
    const properties = toolProperties(tool);
    // The tenant is passed only to a tool that declares it; roleALPHA's public endpoint takes it from the token.
    const args: Record<string, unknown> = { query: input.question, limit: 12 };
    if (properties?.tenant_uuid) args.tenant_uuid = target.tenant;
    assert(
      tool &&
        tool.annotations?.readOnlyHint === true &&
        tool.annotations?.destructiveHint === false &&
        properties?.query?.type === 'string' &&
        ['integer', 'number'].includes(properties?.limit?.type || '') &&
        (!properties.tenant_uuid || properties.tenant_uuid.type === 'string') &&
        (tool.inputSchema.required || []).every(k => k in args),
      'error.governance.governanceReadAccessCompatible',
      502,
    );
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 });
    assert(!result.isError, 'governance.couldReadGovernanceRolealpha', 502);
    // Bound returned context before parsing or sending any content to the AI service.
    const parsed = governanceSources.safeParse(resultJson(result, 180_000));
    assert(parsed.success, 'error.governance.governanceReadAccessCompatible', 502);
    sources = parsed.data.sources;
    assert(
      new Set(sources.map(s => s.id)).size === sources.length,
      'error.governance.governanceReadAccessCompatible',
      502,
    );
  } finally {
    await client.close().catch(() => {});
  }
  const retrievedAt = new Date().toISOString();
  // No sources means no speculative answer and no AI request.
  if (!sources.length) return { kind: 'sources', statements: [], limitations: [], sources, retrievedAt };
  const completion = await completeTask(host, governanceTask(input, sources));
  // Copilot may add tenant content beyond the retrieved governance; such an answer is not source-bound.
  assert(!completion.groundingReferences.length, 'error.governance.microsoft365CopilotUsed', 502);
  const rawAnswer = completion.output;
  let answer;
  try {
    answer = governanceAnswer.parse(rawAnswer);
  } catch {
    throw new AppError(502, 'error.governance.governanceAnswerContainsInvalid');
  }
  const ids = new Set(sources.map(s => s.id));
  assert(
    answer.statements.every(s => s.sourceIds.every(id => ids.has(id))),
    'error.governance.governanceAnswerContainsInvalid',
    502,
  );
  return {
    kind: 'sources',
    ...answer,
    sources,
    retrievedAt,
    aiProvider: completion.provider,
    sensitivityLabel: completion.sensitivityLabel,
  };
}
