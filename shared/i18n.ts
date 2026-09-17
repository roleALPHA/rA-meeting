import { catalog } from './locales/catalog.js';
export type Language = 'de' | 'en' | 'fr' | 'es';
export function parseLanguage(value?: string): Language {
  const lang = value?.split(/[-,;]/)[0]?.toLowerCase();
  return lang === 'en' || lang === 'fr' || lang === 'es' ? lang : 'de';
}
export function translate(key: string, lang: Language): string {
  if (lang === 'de') return key;
  if (catalog[key]) return catalog[key][lang];
  for (const pattern of ['KI-Dienst nicht verfügbar (HTTP {status}).', 'Microsoft Graph: HTTP {status}']) {
    const [before, after] = pattern.split('{status}');
    if (key.startsWith(before) && key.endsWith(after)) {
      const status = key.slice(before.length, after.length ? -after.length : undefined);
      if (/^\d{3}$/.test(status)) return catalog[pattern][lang].replace('{status}', status);
    }
  }
  return key;
}
