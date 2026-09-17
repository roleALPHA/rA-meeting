import { assert } from '../../../shared/model';
import type { AiTask } from '../../../shared/ai';
import type { BrowserHost } from '../host';
import type { AiCompletion } from './types';
import { copilotComplete } from './copilot';
import { claudeFoundryComplete } from './claude-foundry';
import { openAiCompatibleComplete } from './openai-compatible';

export type { AiCompletion } from './types';

export async function completeTask(host: BrowserHost, task: AiTask): Promise<AiCompletion> {
  const ai = host.settings.ai;
  assert(ai, 'KI ist nicht konfiguriert.', 503);
  switch (ai.provider) {
    case 'copilot':
      return copilotComplete(host, ai, task);
    case 'claude-foundry':
      return claudeFoundryComplete(host, ai, task);
    case 'openai-compatible':
      return openAiCompatibleComplete(host, ai, task);
  }
}
