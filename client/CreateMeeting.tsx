import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { type Template } from '../shared/model';
import { t as tr } from './i18n';
import { Button, Modal, Field } from './ui';

export function CreateMeeting({
  templates,
  save,
  close,
  busy,
}: {
  templates: Template[];
  save: (body: unknown) => void;
  close: () => void;
  busy: boolean;
}) {
  const enabled = templates.filter(t => t.enabled);
  const [selected, setSelected] = useState(enabled[0]?.id || '');
  const [title, setTitle] = useState('');
  const [circle, setCircle] = useState('');
  const [date, setDate] = useState('');
  const template = enabled.find(t => t.id === selected);
  return (
    <Modal title={tr('app.createMeeting')} close={close}>
      <form
        onSubmit={e => {
          e.preventDefault();
          save({ title, circle, templateId: selected, scheduledAt: date ? new Date(date).toISOString() : null });
        }}
      >
        <Field label={tr('meetings.meetingName')}>
          <input
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={tr('meetings.eGProductCircle')}
          />
        </Field>
        <Field label={tr('meetings.circleTeam')}>
          <input
            required
            value={circle}
            onChange={e => setCircle(e.target.value)}
            placeholder={tr('meetings.productCircle')}
          />
        </Field>
        <Field label={tr('meetings.meetingTemplate')}>
          <select required value={selected} onChange={e => setSelected(e.target.value)}>
            {enabled.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {template && (
          <div className="template-preview">
            <p>{template.description}</p>
            <div className="mini-flow">
              {template.steps.map(s => (
                <span key={s.id}>
                  {s.title}
                  <ChevronRight size={13} />
                </span>
              ))}
            </div>
          </div>
        )}
        <Field label={tr('meetings.dateOptional')}>
          <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <div className="modal-footer">
          <span />
          <Button className="primary" disabled={busy || !selected}>
            <Plus size={16} />
            {tr('app.createMeeting')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
