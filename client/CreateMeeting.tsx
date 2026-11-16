import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { type Template } from '../shared/model';
import type { CircleResult } from './browser/circles';
import { useApi } from './api-context';
import { t as tr } from './i18n';
import { Button, Modal, Field } from './ui';

/**
 * Circles and teams from the connected roleALPHA organisation, searched as the user types. The suggestions are
 * optional: free text stays possible, and a failed search only says so below the field.
 */
function useCircleSuggestions(enabled: boolean, query: string) {
  const { request } = useApi();
  const [results, setResults] = useState<CircleResult[]>([]);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const call = ++latest.current;
    const timer = setTimeout(() => {
      request<CircleResult[]>('/circles/search', { query: query.trim() }).then(
        found => {
          if (call !== latest.current) return;
          setResults(found);
          setFailed(false);
        },
        () => call === latest.current && setFailed(true),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [enabled, query, request]);
  return { results, failed };
}

export function CreateMeeting({
  templates,
  save,
  close,
  busy,
  circles = false,
}: {
  templates: Template[];
  /** roleALPHA is connected, so circles and teams are suggested from there. */
  circles?: boolean;
  save: (body: unknown) => void;
  close: () => void;
  busy: boolean;
}) {
  const enabled = templates.filter(t => t.enabled);
  const [selected, setSelected] = useState(enabled[0]?.id || '');
  const [title, setTitle] = useState('');
  const [circle, setCircle] = useState('');
  const [circleId, setCircleId] = useState<string | null>(null);
  const suggestions = useCircleSuggestions(circles, circle);
  const [date, setDate] = useState('');
  const template = enabled.find(t => t.id === selected);
  return (
    <Modal title={tr('app.createMeeting')} close={close}>
      <form
        onSubmit={e => {
          e.preventDefault();
          save({
            title,
            circle,
            circleId,
            templateId: selected,
            scheduledAt: date ? new Date(date).toISOString() : null,
          });
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
            list={circles ? 'rolealpha-circles' : undefined}
            autoComplete="off"
            onChange={e => {
              const value = e.target.value;
              setCircle(value);
              // Linked only while the name is exactly one roleALPHA suggestion; edited text is a free name again.
              setCircleId(suggestions.results.find(c => c.name === value)?.id ?? null);
            }}
            placeholder={tr('meetings.productCircle')}
          />
          {circles && (
            <>
              <datalist id="rolealpha-circles">
                {suggestions.results.map(c => (
                  <option
                    key={c.id}
                    value={c.name}
                    label={tr(c.kind === 'unit' ? 'meetings.circleKindUnit' : 'meetings.circleKindRole')}
                  />
                ))}
              </datalist>
              <small>
                {tr(
                  suggestions.failed
                    ? 'meetings.circleSuggestionsUnavailable'
                    : circleId
                      ? 'meetings.circleLinkedRolealpha'
                      : 'meetings.circleSuggestionsRolealpha',
                )}
              </small>
            </>
          )}
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
