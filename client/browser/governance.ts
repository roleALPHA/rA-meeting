import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { assert, AppError } from '../../shared/model';
import {
  governanceQuestion,
  governanceSources,
  governanceAnswer,
  governanceTask,
  type GovernanceReply,
} from '../../shared/governance';
import type { BrowserHost } from './host';
import { connectRoleAlpha, findTool, toolProperties } from './rolealpha';
import { completeTask } from './ai/provider';

/** Fixed administrator-approved read tool; the model never selects or executes tools. */
export async function askGovernance(host: BrowserHost, raw: unknown): Promise<GovernanceReply> {
  const input = governanceQuestion.parse(raw);
  const target = host.settings.roleAlpha;
  assert(target?.governance && host.settings.ai, 'governance.governanceQuestionsRequireAi', 503);
  const client = new Client({ name: 'ra-meetings-governance', version: '1.0.0' });
  let sources: GovernanceReply['sources'];
  try {
    await connectRoleAlpha(host, client);
    const tool = await findTool(
      client,
      target.governance.searchTool,
      'error.governance.governanceReadAccessCompatible',
    );
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
    const result = await client.callTool({ name: target.governance!.searchTool, arguments: args }, undefined, {
      timeout: 30_000,
    });
    assert(!result.isError, 'governance.couldReadGovernanceRolealpha', 502);
    // Bound returned context before parsing or sending any content to the AI service.
    const text = Array.isArray(result.content) ? result.content.find(c => c.type === 'text') : undefined;
    const serialized = result.structuredContent
      ? JSON.stringify(result.structuredContent)
      : text && 'text' in text
        ? String(text.text)
        : '';
    assert(serialized.length <= 180_000, 'error.governance.governanceReadAccessCompatible', 502);
    try {
      sources = governanceSources.parse(JSON.parse(serialized)).sources;
    } catch {
      throw new AppError(502, 'error.governance.governanceReadAccessCompatible');
    }
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
  if (!sources.length) return { statements: [], limitations: [], sources, retrievedAt };
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
    ...answer,
    sources,
    retrievedAt,
    aiProvider: completion.provider,
    sensitivityLabel: completion.sensitivityLabel,
  };
}
