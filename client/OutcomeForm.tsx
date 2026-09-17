import { useState } from 'react';
import { Check } from 'lucide-react';
import { outputLabels, type Meeting, type Outcome, type OutcomeInput } from '../shared/model';
import { t as tr } from './i18n';
import { Button, Modal, Field } from './ui';

export function OutcomeForm({
  meeting,
  stepId,
  initial,
  close,
  save,
  busy,
}: {
  meeting: Meeting;
  stepId: string;
  initial?: Outcome;
  close: () => void;
  save: (o: OutcomeInput) => void;
  busy: boolean;
}) {
  const step = meeting.template.steps.find(s => s.id === stepId)!;
  const [value, setValue] = useState<OutcomeInput>(
    initial
      ? { ...initial }
      : {
          stepId,
          agendaId: null,
          type: step.outputs[0],
          title: '',
          description: '',
          owner: null,
          dueDate: null,
          targetId: null,
          data: {},
          evidence: [],
        },
  );
  return (
    <Modal title={initial ? tr('outcomes.editOutcome') : tr('meeting.recordOutcome')} close={close}>
      <form
        onSubmit={e => {
          e.preventDefault();
          save(value);
        }}
      >
        <Field label={tr('outcomes.outcomeType')}>
          <select
            value={value.type}
            onChange={e => setValue({ ...value, type: e.target.value as OutcomeInput['type'] })}
          >
            {step.outputs.map(t => (
              <option key={t} value={t}>
                {tr(outputLabels[t])}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr('outcomes.title')}>
          <input required value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} />
        </Field>
        <Field label={tr('outcomes.contentExactWording')}>
          <textarea
            rows={5}
            value={value.description}
            onChange={e => setValue({ ...value, description: e.target.value })}
          />
        </Field>
        <Field label={tr('outcomes.agendaItem')}>
          <select value={value.agendaId || ''} onChange={e => setValue({ ...value, agendaId: e.target.value || null })}>
            <option value="">{tr('outcomes.link')}</option>
            {meeting.agenda
              .filter(a => a.stepId === stepId)
              .map(a => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
          </select>
        </Field>
        <div className="inline-fields">
          <Field label={tr('outcomes.owner')}>
            <input
              value={value.owner || ''}
              onChange={e => setValue({ ...value, owner: e.target.value || null })}
              placeholder={tr('meeting.open2')}
            />
          </Field>
          <Field label={tr('outcomes.dueDate')}>
            <input
              type="date"
              value={value.dueDate || ''}
              onChange={e => setValue({ ...value, dueDate: e.target.value || null })}
            />
          </Field>
        </div>
        <p className="muted">{tr('outcomes.reviewSavedProposalEditing')}</p>
        <div className="modal-footer">
          <span />
          <Button className="primary" disabled={busy}>
            <Check size={16} />
            {tr('outcomes.saveProposal')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
