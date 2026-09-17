import { useEffect, useState } from 'react';
import type { languages } from '../shared/assistance';
import { translate } from '../shared/i18n';
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
const agendaTerms: Record<string, string> = {
  Spannungen: 'Agenda',
  Spannungsspeicher: 'Agenda',
  'Spannungen & Themen': 'Agenda & Themen',
  'Spannung erfassen': 'Agendapunkt erfassen',
  'Neue Spannung': 'Neuer Agendapunkt',
  'Spannung bearbeiten': 'Agendapunkt bearbeiten',
  'Was ist die Spannung?': 'Worum geht es?',
  'Spannung oder Thema': 'Agendapunkt oder Thema',
  'Welche Spannung möchtest du bearbeiten?': 'Welchen Agendapunkt möchtest du bearbeiten?',
  'Auch gelöste Spannungen anzeigen': 'Auch abgeschlossene Agendapunkte anzeigen',
  'Platz für eure Spannungen': 'Platz für eure Agenda',
  'Spannungen sammeln, im Meeting bearbeiten und bewusst abschließen.':
    'Agendapunkte sammeln, im Meeting bearbeiten und bewusst abschließen.',
  'Spannungen bearbeiten. Entscheidungen festhalten. Gemeinsam handeln.':
    'Agenda bearbeiten. Entscheidungen festhalten. Gemeinsam handeln.',
  'Der Spannungsspeicher gehört zur Meeting-App. Eine Spannung kann in mehreren Meetings bearbeitet werden und mehrere Ergebnisse auslösen.':
    'Die Agenda gehört zur Meeting-App. Ein Agendapunkt kann in mehreren Meetings bearbeitet werden und mehrere Ergebnisse auslösen.',
  'Der Titel wird für alle Mitglieder des ausgewählten Meetings sichtbar. Die Spannung bleibt offen, bis sie bewusst als gelöst markiert wird.':
    'Der Titel wird für alle Mitglieder des ausgewählten Meetings sichtbar. Der Agendapunkt bleibt offen, bis er bewusst abgeschlossen wird.',
  'Der bestätigte Wortlaut wird als neuer Entwurf angelegt. Die bestehende Spannung bleibt in der Meeting-App.':
    'Der bestätigte Wortlaut wird als neuer Entwurf angelegt. Der bestehende Agendapunkt bleibt in der Meeting-App.',
};
export function t(source: string): string {
  const key = term === 'agenda' ? agendaTerms[source] || source : source;
  return translate(key, lang);
}

export const terminologyLabel = () => translate('Spannungen', lang);
