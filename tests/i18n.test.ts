import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { de, type MessageId } from '../shared/locales/de.js';
import { en } from '../shared/locales/en.js';
import { fr } from '../shared/locales/fr.js';
import { es } from '../shared/locales/es.js';
import { isMessageId, parseLanguage, translate } from '../shared/i18n.js';
import { AppError } from '../shared/model.js';
import { seedTemplates } from '../shared/templates.js';

const ids = Object.keys(de) as MessageId[];

function sourceLiterals() {
  const literals = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const name = entry.name;
      const path = join(dir, name);
      if (entry.isDirectory()) {
        if (!path.endsWith('locales')) walk(path);
      } else if (/\.tsx?$/.test(name)) {
        const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node) => {
          if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text);
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    }
  };
  walk('client');
  walk('shared');
  return literals;
}

test('all languages use the same placeholders for every message', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
  for (const id of ids)
    for (const [lang, catalog] of Object.entries({ en, fr, es }))
      assert.deepEqual(placeholders(catalog[id]), placeholders(de[id]), `${lang}: placeholders differ for ${id}`);
});

test('every message ID is used in the sources and every terminology variant has a base message', () => {
  const literals = sourceLiterals();
  const unused = ids.filter(id => !id.endsWith('@agenda') && !literals.has(id));
  assert.deepEqual(unused, [], 'unused message IDs');
  for (const id of ids.filter(id => id.endsWith('@agenda')))
    assert.ok(isMessageId(id.slice(0, -'@agenda'.length)), `${id} has no base message`);
});

test('messages translate with parameters; errors keep a German message for diagnostics', () => {
  assert.equal(
    translate('error.ai.serviceUnavailableHttp', 'es', { status: 429 }),
    'Servicio de IA no disponible (HTTP 429).',
  );
  assert.equal(translate('tensions.kind@agenda', 'en'), 'Agenda item');
  assert.equal(isMessageId('Customer-created title'), false);
  assert.equal(parseLanguage('es-ES,es;q=0.9'), 'es');
  const error = new AppError(502, 'error.ai.serviceUnavailableHttp', { status: 503 });
  assert.equal(error.id, 'error.ai.serviceUnavailableHttp');
  assert.equal(error.message, 'KI-Dienst nicht verfügbar (HTTP 503).');
});

test('default template content is localized when seeded', () => {
  for (const lang of ['en', 'fr', 'es'] as const) {
    const localized = seedTemplates(lang);
    const german = seedTemplates();
    assert.notEqual(localized[0].steps[0].title, german[0].steps[0].title);
    assert.equal(localized[1].steps[2].phases.length, 7);
    assert.ok(localized.every(t => !isMessageId(t.name) && t.steps.every(s => !isMessageId(s.title))));
  }
  assert.equal(seedTemplates()[0].name, 'Tactical Meeting');
});
