import { z } from 'zod';
import { assert, outcomeInput, type Meeting, type OutcomeInput } from '../shared/model.js';
import { config } from './config.js';

export { validateAnalysis, analysisSchema } from '../shared/analysis.js';
import { validateAnalysis, analysisMessages } from '../shared/analysis.js';
export async function analyze(meeting: Meeting, language: 'de' | 'en' | 'fr' | 'es' = 'de'): Promise<OutcomeInput[]> {
  assert(config.aiUrl && config.aiModel, 'KI ist nicht konfiguriert. AI_COMPLETIONS_URL und AI_MODEL setzen.', 503);
  const messages = analysisMessages(meeting, language);
  const response = await fetch(config.aiUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90_000), headers: { 'Content-Type': 'application/json', ...(config.aiKey ? { [config.aiAuthHeader]: config.aiAuthHeader === 'api-key' ? config.aiKey : `Bearer ${config.aiKey}` } : {}) }, body: JSON.stringify({ model: config.aiModel, messages, response_format: { type: 'json_object' } }) });
  assert(response.ok, `KI-Dienst nicht verfügbar (HTTP ${response.status}).`, 502);
  const body = await response.json() as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content; assert(content, 'KI-Dienst hat keine Antwort geliefert.', 502);
  try { return validateAnalysis(JSON.parse(content), meeting); } catch { throw new Error('Die KI-Antwort entspricht nicht dem Ergebnisschema. Es wurde nichts übernommen.'); }
}
