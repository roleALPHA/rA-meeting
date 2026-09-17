import { AppError } from '../../../shared/model';
import type { AiProviderName } from '../host';

/** Unvalidated provider output plus provenance the UI shows before anything is accepted. */
export type AiCompletion = {
  output: unknown;
  provider: AiProviderName;
  /** Sensitivity label Microsoft 365 Copilot attached to its answer, if any. */
  sensitivityLabel: string | null;
  /** Tenant content the provider cited beyond the supplied data (Copilot grounding). */
  groundingReferences: string[];
};

/** Parses a JSON object from model text, tolerating a surrounding Markdown code fence. */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i.exec(trimmed);
  try {
    return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
  } catch {
    throw new AppError(502, 'Die KI-Antwort ist ungültig. Es wurde nichts übernommen.');
  }
}
