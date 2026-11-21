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

test('every message ID is used in the sources', () => {
  const literals = sourceLiterals();
  const unused = ids.filter(id => !literals.has(id));
  assert.deepEqual(unused, [], 'unused message IDs');
});

test('messages translate with parameters; errors keep a German message for diagnostics', () => {
  assert.equal(translate('error.rolealpha.toolMissing', 'es', { tool: 'ask_ralph' }).includes('«ask_ralph»'), true);
  assert.equal(translate('panel.draftCount', 'en', { count: 3 }), '3 drafts');
  assert.equal(isMessageId('Customer-created title'), false);
  assert.equal(parseLanguage('es-ES,es;q=0.9'), 'es');
  const error = new AppError(502, 'error.rolealpha.toolFailed', { detail: 'Keine Berechtigung' });
  assert.equal(error.id, 'error.rolealpha.toolFailed');
  assert.equal(error.message, 'roleALPHA hat abgelehnt: Keine Berechtigung');
});
