import AnthropicFoundry from '@anthropic-ai/foundry-sdk';
import { APIError, betaRefusalFallbackMiddleware } from '@anthropic-ai/sdk';
import { AppError } from '../../../shared/model';
import type { AiTask } from '../../../shared/ai';
import { endpointFetch, type AiSettings, type BrowserHost } from '../host';
import { parseJsonText, type AiCompletion } from './types';

type Settings = Extract<AiSettings, { provider: 'claude-foundry' }>;

/**
 * Claude through a Microsoft Foundry deployment. Authentication uses the signed-in user's Entra ID
 * token for the Foundry resource; requests may only go below the configured endpoint.
 */
export async function claudeFoundryComplete(host: BrowserHost, ai: Settings, task: AiTask): Promise<AiCompletion> {
  const client = new AnthropicFoundry({
    baseURL: ai.url,
    azureADTokenProvider: () => host.token(ai.resource),
    fetch: endpointFetch(host, ai, 'prefix'),
    // Foundry has no server-side fallbacks; the SDK middleware retries declined requests on the fallback deployment.
    middleware: ai.fallbackModel ? [betaRefusalFallbackMiddleware([{ model: ai.fallbackModel }])] : [],
  });
  const params = {
    model: ai.model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' as const },
    system: task.instructions,
    messages: [{ role: 'user' as const, content: JSON.stringify(task.data) }],
    output_config: { format: { type: 'json_schema' as const, schema: task.outputSchema } },
  };
  let message;
  try {
    // Streaming avoids request timeouts for long transcripts. The refusal fallback middleware
    // handles beta message requests, so only that configuration uses the beta namespace.
    message = ai.fallbackModel
      ? await client.beta.messages.stream(params).finalMessage()
      : await client.messages.stream(params).finalMessage();
  } catch (error) {
    if (error instanceof APIError && error.status)
      throw new AppError(502, 'error.ai.serviceUnavailableHttp', { status: error.status });
    throw error;
  }
  if (message.stop_reason === 'refusal') throw new AppError(502, 'error.claudeFoundry.claudeDeclinedRequestNothing');
  if (message.stop_reason === 'max_tokens') throw new AppError(502, 'error.claudeFoundry.aiResponseWasToo');
  let text = '';
  for (const block of message.content as { type: string; text?: string }[])
    if (block.type === 'text') text += block.text ?? '';
  return { output: parseJsonText(text), provider: ai.provider, sensitivityLabel: null, groundingReferences: [] };
}
