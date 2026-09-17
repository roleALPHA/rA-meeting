import { translate, parseLanguage } from './i18n.js';
const randomUUID = () => crypto.randomUUID();
import type { Step, Template } from './model.js';
const step = (
  kind: Step['kind'],
  title: string,
  description: string,
  minutes = 5,
  outputs: Step['outputs'] = [],
  phases: string[] = [],
): Step => ({ id: randomUUID(), kind, title, description, minutes, outputs, optional: false, phases });
export function seedTemplates(language = 'de'): Template[] {
  const now = new Date().toISOString();
  const base = { enabled: true, version: 1, createdAt: now, updatedAt: now };
  const templates: Template[] = [
    {
      ...base,
      id: randomUUID(),
      name: 'Tactical Meeting',
      category: 'tactical',
      description: 'Operative Klarheit schaffen. Spannungen bearbeiten und nächste Schritte festhalten.',
      steps: [
        step('check-in', 'Ankommen', 'Eine kurze Runde: Was brauchst du, um präsent zu sein?'),
        step('checklist', 'Checklisten', 'Wiederkehrende Aktivitäten durchgehen. Erledigt oder nicht erledigt?', 5),
        step('metrics', 'Kennzahlen', 'Aktuelle Zahlen teilen. Verständnisfragen sind willkommen.', 8),
        step('projects', 'Projektupdates', 'Was hat sich seit dem letzten Meeting verändert?', 10),
        step('agenda', 'Spannungen bearbeiten', 'Was brauchst du? Halte konkrete nächste Schritte fest.', 25, [
          'task',
          'project',
          'note',
        ]),
        step('check-out', 'Abschlussrunde', 'Was nimmst du mit? Was können wir verbessern?', 5),
      ],
    },
    {
      ...base,
      id: randomUUID(),
      name: 'Governance Meeting',
      category: 'governance',
      description: 'Rollen und Zusammenarbeit weiterentwickeln. Vorschläge strukturiert bearbeiten.',
      steps: [
        step('check-in', 'Check-in', 'Präsent werden, ohne Diskussion.'),
        step('custom', 'Organisatorisches', 'Zeit, Teilnahme und Rahmen klären.', 3),
        step(
          'agenda',
          'Governance-Vorschläge',
          'Spannung und Vorschlag erfassen. Den endgültigen Wortlaut gemeinsam prüfen.',
          45,
          ['governance', 'policy', 'note'],
          [
            'Vorschlag vorstellen',
            'Verständnisfragen',
            'Reaktionsrunde',
            'Anpassen & klären',
            'Einwandrunde',
            'Integration',
            'Ergebnis dokumentieren',
          ],
        ),
        step('check-out', 'Abschlussrunde', 'Reflexion des Prozesses.', 5),
      ],
    },
    {
      ...base,
      id: randomUUID(),
      name: 'Team-Reflexion',
      category: 'custom',
      description: 'Raum für Rückblick, Lernen und gemeinsame Vereinbarungen.',
      steps: [
        step('check-in', 'Wie geht es uns?', 'Ein Wort oder ein kurzer Satz.'),
        step('custom', 'Rückblick', 'Was hat gut funktioniert? Was hat uns gebremst?', 15, ['note']),
        step(
          'agenda',
          'Experimente vereinbaren',
          'Welche konkrete Veränderung probieren wir bis zum nächsten Mal aus?',
          20,
          ['task', 'project'],
        ),
        step('check-out', 'Check-out', 'Mit welchem Gefühl gehst du?'),
      ],
    },
  ];
  const tr = (s: string) => translate(s, parseLanguage(language));
  return templates.map(t => ({
    ...t,
    name: tr(t.name),
    description: tr(t.description),
    steps: t.steps.map(s => ({ ...s, title: tr(s.title), description: tr(s.description), phases: s.phases.map(tr) })),
  }));
}
