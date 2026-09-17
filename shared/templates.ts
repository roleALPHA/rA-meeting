import { translate, parseLanguage, isMessageId } from './i18n.js';
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
      name: 'seed.tacticalMeeting',
      category: 'tactical',
      terminology: 'tensions',
      description: 'seed.createOperationalClarityAddress',
      steps: [
        step('check-in', 'seed.arrive', 'seed.shortRoundWhatDo'),
        step('checklist', 'labels.checklists', 'seed.reviewRecurringActivitiesDone', 5),
        step('metrics', 'labels.metrics', 'seed.shareCurrentFiguresClarifying', 8),
        step('projects', 'labels.projectUpdates', 'seed.whatHasChangedSince', 10),
        step('agenda', 'seed.addressTensions', 'seed.whatDoNeedRecord', 25, ['task', 'project', 'note']),
        step('check-out', 'seed.closingRound', 'seed.whatTakingAwayWhat', 5),
      ],
    },
    {
      ...base,
      id: randomUUID(),
      name: 'seed.governanceMeeting',
      category: 'governance',
      terminology: 'tensions',
      description: 'seed.developRolesCollaborationProcess',
      steps: [
        step('check-in', 'labels.checkIn', 'seed.becomePresentWithoutDiscussion'),
        step('custom', 'seed.practicalMatters', 'seed.clarifyTimingAttendanceGround', 3),
        step(
          'agenda',
          'seed.governanceProposals',
          'seed.recordTensionProposalReview',
          45,
          ['governance', 'policy', 'note'],
          [
            'seed.presentProposal',
            'seed.clarifyingQuestions',
            'seed.reactionRound',
            'seed.amendClarify',
            'seed.objectionRound',
            'seed.integration',
            'seed.recordOutcome',
          ],
        ),
        step('check-out', 'seed.closingRound', 'seed.reflectProcess', 5),
      ],
    },
    {
      ...base,
      id: randomUUID(),
      name: 'seed.teamReflection',
      category: 'custom',
      terminology: 'agenda',
      description: 'seed.spaceReflectionLearningShared',
      steps: [
        step('check-in', 'seed.howWeDoing', 'seed.oneWordShortSentence'),
        step('custom', 'seed.retrospective', 'seed.whatWorkedWellWhat', 15, ['note']),
        step('agenda', 'seed.agreeExperiments', 'seed.whatConcreteChangeWill', 20, ['task', 'project']),
        step('check-out', 'labels.checkOut', 'seed.howDoFeelLeave'),
      ],
    },
  ];
  // Starter content is defined as message IDs and stored as text in the selected language.
  const tr = (s: string) => (isMessageId(s) ? translate(s, parseLanguage(language)) : s);
  return templates.map(t => ({
    ...t,
    name: tr(t.name),
    description: tr(t.description),
    steps: t.steps.map(s => ({ ...s, title: tr(s.title), description: tr(s.description), phases: s.phases.map(tr) })),
  }));
}
