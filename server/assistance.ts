import { assert, type Meeting } from '../shared/model.js';
import { assistanceInput, assistanceResult, type AssistanceInput } from '../shared/assistance.js';
import { config } from './config.js';
export { assistanceMessages } from '../shared/assistance-messages.js';
import { assistanceMessages } from '../shared/assistance-messages.js';
export async function assist(meeting: Meeting, input: AssistanceInput, send: typeof fetch = fetch) {
  const messages = assistanceMessages(meeting, input);
  assert(config.aiUrl && config.aiModel, 'KI ist nicht konfiguriert. AI_COMPLETIONS_URL und AI_MODEL setzen.', 503);
  const response = await send(config.aiUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90_000), headers: { 'Content-Type': 'application/json', ...(config.aiKey ? { [config.aiAuthHeader]: config.aiAuthHeader === 'api-key' ? config.aiKey : `Bearer ${config.aiKey}` } : {}) }, body: JSON.stringify({ model: config.aiModel, messages, response_format: { type: 'json_object' } }) });
  assert(response.ok, `KI-Dienst nicht verfügbar (HTTP ${response.status}).`, 502);
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  let value: unknown;
  try { value = JSON.parse(body.choices?.[0]?.message?.content || ''); } catch { assert(false, 'Die KI-Antwort ist ungültig. Es wurde nichts übernommen.', 502); }
  const parsed = assistanceResult.safeParse(value);
  assert(parsed.success, 'Die KI-Antwort ist ungültig. Es wurde nichts übernommen.', 502);
  return parsed.data;
}
