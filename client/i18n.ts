import { useEffect, useState } from 'react';
import type { languages } from '../shared/assistance';
import { isMessageId, translate, type MessageId, type MessageParams } from '../shared/i18n';
import { AppError, type Terminology } from '../shared/model';
export type Language = (typeof languages)[number];
const supported = ['de', 'en', 'fr', 'es'];
const listeners = new Set<() => void>();
let lang: Language = 'de';
try {
  const saved = localStorage.getItem('ra-meetings-preferences');
  const prefs = saved ? JSON.parse(saved) : {};
  const candidate = prefs.language || navigator.language.split('-')[0];
  lang = supported.includes(candidate) ? candidate : 'de';
} catch {
  /* Browser storage may be disabled. */
}
if (typeof document !== 'undefined') document.documentElement.lang = lang;
export const language = () => lang;
export function setPreferences(next: { language?: Language }) {
  if (next.language && supported.includes(next.language)) lang = next.language;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('ra-meetings-preferences', JSON.stringify({ language: lang }));
  } catch {
    /* In-memory preferences remain available. */
  }
  listeners.forEach(l => l());
}
export function usePreferences() {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update(n => n + 1);
    listeners.add(refresh);
    return () => {
      listeners.delete(refresh);
    };
  }, []);
  return lang;
}
/**
 * Translates a message ID. With `term`, the wording follows a meeting template: "agenda" prefers the ID's `@agenda`
 * variant, so the same screen says "Tension" for one meeting and "Agenda item" for another.
 */
export function t(id: MessageId, params?: MessageParams, term: Terminology = 'tensions'): string {
  const variant = `${id}@agenda`;
  return translate(term === 'agenda' && isMessageId(variant) ? variant : id, lang, params);
}

/** User-facing text for any error: translated for app errors, generic with the original message otherwise. */
export function errorText(error: unknown): string {
  if (error instanceof AppError) return t(error.id, error.params);
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  return t('error.common.unexpected') + detail;
}
