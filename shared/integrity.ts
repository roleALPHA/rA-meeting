import type { Meeting } from './model.js';
import type { MessageId } from './i18n.js';

export type IntegrityIssue = { outcomeId?: string; message: MessageId };

/**
 * Consistency check of a stored meeting against the rules the app applies when it changes one.
 * Anyone with write access to the SharePoint site can edit stored content directly, so this can
 * reveal inconsistent or manually edited data. It is not tamper protection.
 */
export function checkMeeting(m: Meeting): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const steps = m.template.steps;
  if (!Number.isInteger(m.currentStep) || m.currentStep < 0 || m.currentStep >= steps.length)
    issues.push({ message: 'integrity.currentStepDoesMatch' });
  const eventTypes = new Set(m.events.map(e => e.type));
  // Evidence can only be checked when the transcript segments are loaded.
  const segments = m.transcript.length ? new Set(m.transcript.map(s => s.id)) : null;
  for (const o of m.outcomes) {
    const step = steps.find(s => s.id === o.stepId);
    if (!step || !step.outputs.includes(o.type))
      issues.push({ outcomeId: o.id, message: 'integrity.outcomeHasTypeAllowed' });
    if (o.agendaId && !m.agenda.some(a => a.id === o.agendaId && a.stepId === o.stepId))
      issues.push({ outcomeId: o.id, message: 'integrity.outcomeRefersAgendaItem' });
    if (segments && o.evidence.some(id => !segments.has(id)))
      issues.push({ outcomeId: o.id, message: 'integrity.outcomeRefersTranscriptPassages' });
    if (o.status === 'approved' && (!o.approvedBy || !o.approvedAt))
      issues.push({ outcomeId: o.id, message: 'integrity.approvedOutcomeHasApproval' });
    if (o.export) {
      if (o.status !== 'approved') issues.push({ outcomeId: o.id, message: 'integrity.transferredOutcomeApproved' });
      const expected =
        o.export.state === 'draft_created'
          ? ['export.completed', 'export.reconciled']
          : o.export.state === 'uncertain'
            ? ['export.uncertain']
            : ['export.started'];
      if (!expected.some(type => eventTypes.has(type)))
        issues.push({ outcomeId: o.id, message: 'integrity.transferHasEntryHistory' });
    }
  }
  return issues;
}
