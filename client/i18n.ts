import { useEffect, useState } from 'react';
import { translate, type Language, type MessageId, type MessageParams } from '../shared/i18n';
import { AppError } from '../shared/model';
export type { Language };
const supported = ['de', 'en', 'fr', 'es'];
const listeners = new Set<() => void>();
let lang: Language = 'de';
let chosen = false;
try {
  const saved = localStorage.getItem('ra-meetings-preferences');
  const prefs = saved ? JSON.parse(saved) : {};
  chosen = supported.includes(prefs.language);
  const candidate = prefs.language || navigator.language.split('-')[0];
  lang = supported.includes(candidate) ? candidate : 'de';
} catch {
  /* Browser storage may be disabled. */
}
/** The host's language (SharePoint UI language) applies until the user picks one. */
export function applyHostLanguage(host?: Language) {
  if (host && !chosen && supported.includes(host)) lang = host;
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
/** Translates a message ID into the chosen interface language. */
export function t(id: MessageId, params?: MessageParams): string {
  return translate(id, lang, params);
}

/** User-facing text for any error: translated for app errors, generic with the original message otherwise. */
export function errorText(error: unknown): string {
  if (error instanceof AppError) return t(error.id, error.params);
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  return t('error.common.unexpected') + detail;
}
