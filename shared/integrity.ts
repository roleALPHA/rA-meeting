import type { Meeting } from './model.js';

export type IntegrityIssue = { outcomeId?: string; message: string };

/**
 * Consistency check of a stored meeting against the rules the app applies when it changes one.
 * Anyone with write access to the SharePoint site can edit stored content directly, so this can
 * reveal inconsistent or manually edited data. It is not tamper protection.
 */
export function checkMeeting(m: Meeting): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const steps = m.template.steps;
  if (!Number.isInteger(m.currentStep) || m.currentStep < 0 || m.currentStep >= steps.length)
    issues.push({ message: 'Der aktuelle Schritt passt nicht zum Template.' });
  const eventTypes = new Set(m.events.map(e => e.type));
  // Evidence can only be checked when the transcript segments are loaded.
  const segments = m.transcript.length ? new Set(m.transcript.map(s => s.id)) : null;
  for (const o of m.outcomes) {
    const step = steps.find(s => s.id === o.stepId);
    if (!step || !step.outputs.includes(o.type))
      issues.push({ outcomeId: o.id, message: 'Ein Ergebnis hat einen Typ, der in seinem Schritt nicht erlaubt ist.' });
    if (o.agendaId && !m.agenda.some(a => a.id === o.agendaId && a.stepId === o.stepId))
      issues.push({ outcomeId: o.id, message: 'Ein Ergebnis verweist auf einen Agendapunkt eines anderen Schritts.' });
    if (segments && o.evidence.some(id => !segments.has(id)))
      issues.push({ outcomeId: o.id, message: 'Ein Ergebnis verweist auf Transkriptstellen, die es nicht gibt.' });
    if (o.status === 'approved' && (!o.approvedBy || !o.approvedAt))
      issues.push({ outcomeId: o.id, message: 'Ein bestätigtes Ergebnis hat keine Bestätigungsangaben.' });
    if (o.export) {
      if (o.status !== 'approved')
        issues.push({ outcomeId: o.id, message: 'Ein übertragenes Ergebnis ist nicht bestätigt.' });
      const expected =
        o.export.state === 'draft_created'
          ? ['export.completed', 'export.reconciled']
          : o.export.state === 'uncertain'
            ? ['export.uncertain']
            : ['export.started'];
      if (!expected.some(type => eventTypes.has(type)))
        issues.push({ outcomeId: o.id, message: 'Für eine Übertragung fehlt der Eintrag im Verlauf.' });
    }
  }
  return issues;
}
