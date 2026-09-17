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
    <Modal title={initial ? tr('Ergebnis bearbeiten') : tr('Ergebnis festhalten')} close={close}>
      <form
        onSubmit={e => {
          e.preventDefault();
          save(value);
        }}
      >
        <Field label={tr('Ergebnistyp')}>
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
        <Field label={tr('Titel')}>
          <input required value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} />
        </Field>
        <Field label={tr('Inhalt / genauer Wortlaut')}>
          <textarea
            rows={5}
            value={value.description}
            onChange={e => setValue({ ...value, description: e.target.value })}
          />
        </Field>
        <Field label={tr('Agendaelement')}>
          <select value={value.agendaId || ''} onChange={e => setValue({ ...value, agendaId: e.target.value || null })}>
            <option value="">{tr('Keine Zuordnung')}</option>
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
          <Field label={tr('Verantwortlich')}>
            <input
              value={value.owner || ''}
              onChange={e => setValue({ ...value, owner: e.target.value || null })}
              placeholder={tr('Offen')}
            />
          </Field>
          <Field label={tr('Fällig am')}>
            <input
              type="date"
              value={value.dueDate || ''}
              onChange={e => setValue({ ...value, dueDate: e.target.value || null })}
            />
          </Field>
        </div>
        <p className="muted">
          {tr('Nach dem Speichern als Vorschlag prüfen. Eine Änderung hebt eine frühere Bestätigung auf.')}
        </p>
        <div className="modal-footer">
          <span />
          <Button className="primary" disabled={busy}>
            <Check size={16} />
            {tr('Vorschlag speichern')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
