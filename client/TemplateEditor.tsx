import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Loader2, Trash2, GripVertical } from 'lucide-react';
import {
  outputLabels,
  outputTypes,
  stepKinds,
  stepLabels,
  type Template,
  type TemplateInput,
  type Step,
} from '../shared/model';
import { t as tr } from './i18n';
import { Button, Modal, Field } from './ui';
import { categoryLabels } from './labels';

const newStep = (kind: Step['kind']): Step => ({
  id: crypto.randomUUID(),
  kind,
  title: tr(stepLabels[kind]),
  description: '',
  minutes: 5,
  optional: false,
  outputs: [],
  phases: [],
});
export function TemplateEditor({
  template,
  save,
  close,
  busy,
}: {
  template?: Template;
  save: (input: TemplateInput, id?: string, version?: number) => void;
  close: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<TemplateInput>(() =>
    template
      ? structuredClone(template)
      : {
          name: '',
          description: '',
          category: 'custom',
          enabled: true,
          steps: [newStep('check-in'), newStep('agenda'), newStep('check-out')],
        },
  );
  const [active, setActive] = useState(draft.steps[0].id);
  const [drag, setDrag] = useState<number | null>(null);
  const step = draft.steps.find(s => s.id === active) ?? draft.steps[0];
  const update = (data: Partial<Step>) =>
    setDraft(d => ({ ...d, steps: d.steps.map(s => (s.id === step.id ? { ...s, ...data } : s)) }));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.steps.length) return;
    setDraft(d => {
      const steps = [...d.steps];
      const [s] = steps.splice(from, 1);
      steps.splice(to, 0, s);
      return { ...d, steps };
    });
  };
  return (
    <Modal title={template ? tr('templates.editTemplate') : tr('templates.newMeetingTemplate')} close={close} wide>
      <form
        onSubmit={e => {
          e.preventDefault();
          save(draft, template?.id, template?.version);
        }}
      >
        <div className="editor-meta">
          <Field label={tr('templates.name')}>
            <input
              required
              maxLength={200}
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder={tr('templates.eGMonthlyStrategy')}
            />
          </Field>
          <Field label={tr('templates.meetingType')}>
            <select
              value={draft.category}
              onChange={e => setDraft({ ...draft, category: e.target.value as TemplateInput['category'] })}
            >
              {Object.entries(categoryLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {tr(label)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={tr('templates.description')}>
          <textarea
            rows={2}
            maxLength={4000}
            value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        <div className="editor-grid">
          <section className="step-list">
            <div className="section-label">
              {tr('templates.flow')}
              <span>
                {draft.steps.length} {tr('app.steps')}
              </span>
            </div>
            {draft.steps.map((s, i) => (
              <div
                key={s.id}
                className={`edit-step ${step.id === s.id ? 'selected' : ''}`}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (drag !== null) move(drag, i);
                  setDrag(null);
                }}
              >
                <button type="button" className="step-select" onClick={() => setActive(s.id)}>
                  <GripVertical size={16} />
                  <span className="step-num">{i + 1}</span>
                  <span>{s.title}</span>
                </button>
                <div className="step-actions">
                  <button
                    type="button"
                    aria-label={`${s.title} ${tr('templates.moveUp')} `}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${s.title} ${tr('templates.moveDown')} `}
                    disabled={i === draft.steps.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              </div>
            ))}
            <Field label={tr('templates.addStep')}>
              <select
                value=""
                onChange={e => {
                  const s = newStep(e.target.value as Step['kind']);
                  setDraft(d => ({ ...d, steps: [...d.steps, s] }));
                  setActive(s.id);
                }}
              >
                <option value="" disabled>
                  {tr('templates.selectStepType')}
                </option>
                {stepKinds.map(k => (
                  <option key={k} value={k}>
                    {tr(stepLabels[k])}
                  </option>
                ))}
              </select>
            </Field>
          </section>
          <section className="step-detail">
            <div className="detail-heading">
              <span className="pill">{tr(stepLabels[step.kind])}</span>
              <Button
                type="button"
                className="icon danger"
                title={tr('templates.removeStep')}
                aria-label={tr('templates.removeStep')}
                disabled={draft.steps.length === 1}
                onClick={() => {
                  const steps = draft.steps.filter(s => s.id !== step.id);
                  setDraft({ ...draft, steps });
                  setActive(steps[0].id);
                }}
              >
                <Trash2 size={17} />
              </Button>
            </div>
            <Field label={tr('templates.stepName')}>
              <input required maxLength={200} value={step.title} onChange={e => update({ title: e.target.value })} />
            </Field>
            <Field label={tr('templates.facilitatorGuidance')}>
              <textarea
                rows={3}
                maxLength={4000}
                value={step.description}
                onChange={e => update({ description: e.target.value })}
                placeholder={tr('templates.whatShouldHappenStep')}
              />
            </Field>
            <div className="inline-fields">
              <Field label={tr('templates.timeboxMinutes')}>
                <input
                  type="number"
                  min={0}
                  max={480}
                  value={step.minutes}
                  onChange={e => update({ minutes: Number(e.target.value) })}
                />
              </Field>
              <label className="check">
                <input type="checkbox" checked={step.optional} onChange={e => update({ optional: e.target.checked })} />
                {tr('templates.optionalStep')}
              </label>
            </div>
            <div className="field">
              <span>{tr('templates.allowedOutcomes')}</span>
              <div className="output-choices">
                {outputTypes.map(type => (
                  <label className={`output-choice ${step.outputs.includes(type) ? 'checked' : ''}`} key={type}>
                    <input
                      type="checkbox"
                      checked={step.outputs.includes(type)}
                      onChange={e =>
                        update({
                          outputs: e.target.checked ? [...step.outputs, type] : step.outputs.filter(t => t !== type),
                        })
                      }
                    />
                    {tr(outputLabels[type])}
                  </label>
                ))}
              </div>
              <small>{tr('templates.withoutSelectionStepCaptures')}</small>
            </div>
            <Field label={tr('templates.phasesPerAgendaItem')}>
              <textarea
                rows={4}
                value={step.phases.join('\n')}
                onChange={e => update({ phases: e.target.value.split('\n') })}
                onBlur={() => update({ phases: step.phases.map(p => p.trim()).filter(Boolean) })}
                placeholder={tr('templates.presentProposalClarifyingQuestions')}
              />
            </Field>
          </section>
        </div>
        <div className="modal-footer">
          <label className="check">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={e => setDraft({ ...draft, enabled: e.target.checked })}
            />
            {tr('templates.availableNewMeetings')}
          </label>
          <Button type="submit" className="primary" disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
            {tr('templates.saveTemplate')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
