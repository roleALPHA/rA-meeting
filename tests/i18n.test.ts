import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readdirSync, readFileSync } from 'node:fs';
import { catalog } from '../shared/locales/catalog.js';
import { translate, parseLanguage } from '../shared/i18n.js';
import { seedTemplates } from '../shared/templates.js';
test('all explicit UI translation keys have English, French and Spanish text', () => {
  const files = readdirSync('client')
    .filter(f => f.endsWith('.tsx'))
    .map(f => f.replace(/\.tsx$/, ''));
  assert.ok(files.includes('App') && files.includes('MeetingRoom'));
  for (const file of files) {
    const ast = ts.createSourceFile(
      file,
      readFileSync(`client/${file}.tsx`, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function walk(n: ts.Node) {
      if (ts.isCallExpression(n) && n.expression.getText(ast) === 'tr' && ts.isStringLiteral(n.arguments[0])) {
        const key = n.arguments[0].text;
        for (const l of ['en', 'fr', 'es'] as const)
          assert.ok(catalog[key]?.[l], `${file}: missing ${l} translation for ${key}`);
      }
      ts.forEachChild(n, walk);
    }
    walk(ast);
  }
});
test('default template content is localized without translating user text', () => {
  for (const lang of ['en', 'fr', 'es'] as const) {
    const localized = seedTemplates(lang);
    const de = seedTemplates();
    assert.notEqual(localized[0].steps[0].title, de[0].steps[0].title);
    assert.equal(localized[1].steps[2].phases.length, 7);
  }
  assert.equal(translate('Customer-created title', 'fr'), 'Customer-created title');
  assert.equal(parseLanguage('es-ES,es;q=0.9'), 'es');
  assert.equal(translate('KI-Dienst nicht verfügbar (HTTP 429).', 'es'), 'Servicio de IA no disponible (HTTP 429).');
});
