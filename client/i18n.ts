import { useEffect, useState } from 'react';
import type { languages } from '../shared/assistance';
import { isMessageId, translate, type MessageId, type MessageParams } from '../shared/i18n';
import { AppError } from '../shared/model';
export type Language = (typeof languages)[number];
export type Terminology = 'tensions' | 'agenda';
const supported = ['de', 'en', 'fr', 'es'];
const listeners = new Set<() => void>();
let lang: Language = 'de';
let term: Terminology = 'tensions';
try {
  const saved = localStorage.getItem('ra-meetings-preferences');
  const prefs = saved ? JSON.parse(saved) : {};
  const candidate = prefs.language || navigator.language.split('-')[0];
  lang = supported.includes(candidate) ? candidate : 'de';
  term = prefs.terminology === 'agenda' ? 'agenda' : 'tensions';
} catch {
  /* Browser storage may be disabled. */
}
if (typeof document !== 'undefined') document.documentElement.lang = lang;
export const language = () => lang;
export const terminology = () => term;
export function setPreferences(next: { language?: Language; terminology?: Terminology }) {
  if (next.language && supported.includes(next.language)) lang = next.language;
  if (next.terminology) term = next.terminology;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem('ra-meetings-preferences', JSON.stringify({ language: lang, terminology: term }));
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
  return `${lang}:${term}`;
}
/** Translates a message ID, preferring its `@agenda` variant when the "Agenda" terminology is selected. */
export function t(id: MessageId, params?: MessageParams): string {
  const variant = `${id}@agenda`;
  return translate(term === 'agenda' && isMessageId(variant) ? variant : id, lang, params);
}

/** User-facing text for any error: translated for app errors, generic with the original message otherwise. */
export function errorText(error: unknown): string {
  if (error instanceof AppError) return t(error.id, error.params);
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  return t('error.common.unexpected') + detail;
}

export const terminologyLabel = () => translate('app.tensions', lang);
