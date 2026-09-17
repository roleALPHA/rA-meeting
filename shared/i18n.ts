import { de, type MessageId } from './locales/de.js';
import { en } from './locales/en.js';
import { fr } from './locales/fr.js';
import { es } from './locales/es.js';

export type { MessageId };
export type Language = 'de' | 'en' | 'fr' | 'es';
export type MessageParams = Record<string, string | number>;
const catalogs: Record<Language, Record<MessageId, string>> = { de, en, fr, es };

export function parseLanguage(value?: string): Language {
  const lang = value?.split(/[-,;]/)[0]?.toLowerCase();
  return lang === 'en' || lang === 'fr' || lang === 'es' ? lang : 'de';
}
export function isMessageId(value: unknown): value is MessageId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(de, value);
}
/** Text for a message ID; `{name}` placeholders are replaced from params. */
export function translate(id: MessageId, lang: Language, params?: MessageParams): string {
  const text = catalogs[lang][id] ?? de[id];
  return params
    ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
    : text;
}
