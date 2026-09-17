import { assert } from '../../../shared/model';
import type { AiTask } from '../../../shared/ai';
import { endpointFetch, type AiSettings, type BrowserHost } from '../host';
import { parseJsonText, type AiCompletion } from './types';

type Settings = Extract<AiSettings, { provider: 'openai-compatible' }>;

/** Chat Completions compatible endpoint (for example Azure OpenAI) with delegated Entra ID authentication. */
export async function openAiCompatibleComplete(host: BrowserHost, ai: Settings, task: AiTask): Promise<AiCompletion> {
  const r = await endpointFetch(host, ai)(ai.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ai.model,
      messages: [
        { role: 'system', content: task.instructions },
        { role: 'user', content: JSON.stringify(task.data) },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  assert(r.ok, 'error.ai.serviceUnavailableHttp', 502, { status: r.status });
  const body = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return {
    output: parseJsonText(body.choices?.[0]?.message?.content || ''),
    provider: ai.provider,
    sensitivityLabel: null,
    groundingReferences: [],
  };
}
