import { t as tr } from './i18n';
import { useState } from 'react';
import { Plus, Check, ArrowRight } from 'lucide-react';
import type { Bootstrap, Meeting, Tension } from '../shared/model';
import { useApi } from './api-context';
export function Tensions({
  data,
  run,
  refresh,
}: {
  data: Bootstrap;
  run: (f: () => Promise<void>) => void;
  refresh: () => Promise<unknown>;
}) {
  const { request } = useApi();
  const [editing, setEditing] = useState<Tension | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [circle, setCircle] = useState('');
  const [attachment, setAttachment] = useState<Tension | null>(null);
  const [meetingId, setMeetingId] = useState('');
  const [stepId, setStepId] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const open = (t: Tension | 'new') => {
    setEditing(t);
    setTitle(t === 'new' ? '' : t.title);
    setDescription(t === 'new' ? '' : t.description);
    setCircle(t === 'new' ? '' : t.circle);
  };
  const meetings = data.meetings.filter(m => m.status !== 'completed');
  const selected = meetings.find(m => m.id === meetingId);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{tr('tensions.impulseChange')}</div>
          <h1>{tr('app.tensionBacklog')}</h1>
          <p>{tr('tensions.collectTensionsAddressThem')}</p>
        </div>
        <button className="button primary" disabled={data.actor.workspace === 'read'} onClick={() => open('new')}>
          <Plus size={17} />
          {tr('tensions.addTension')}
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
        {tr('tensions.showResolvedTensions')}
      </label>
      {editing && (
        <form
          className="result-card"
          style={{ marginTop: 20 }}
          onSubmit={e => {
            e.preventDefault();
            run(async () => {
              const prior = editing === 'new' ? null : editing;
              await request(
                prior ? `/tensions/${prior.id}` : '/tensions',
                { title, description, circle, version: prior?.version, status: prior?.status || 'open' },
                prior ? 'PUT' : 'POST',
              );
              await refresh();
              setEditing(null);
            });
          }}
        >
          <h2>{editing === 'new' ? tr('tensions.newTension') : tr('tensions.editTension')}</h2>
          <label className="field">
            <span>{tr('outcomes.title')}</span>
            <input required value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>{tr('meetings.circleTeam')}</span>
            <input required value={circle} onChange={e => setCircle(e.target.value)} />
          </label>
          <label className="field">
            <span>{tr('tensions.whatTension')}</span>
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <div className="row">
            <button className="button primary">{tr('tensions.save')}</button>
            <button className="button" type="button" onClick={() => setEditing(null)}>
              {tr('app.cancel')}
            </button>
          </div>
        </form>
      )}
      {data.tensions
        .filter(t => showResolved || t.status === 'open')
        .map(t => (
          <article className="result-card" style={{ marginTop: 20 }} key={t.id}>
            <div className="result-top">
              <span className="pill">{t.circle}</span>
              <span className="pill">{t.status === 'open' ? tr('meeting.open2') : tr('tensions.resolved')}</span>
            </div>
            <h2>{t.title}</h2>
            <p className="preserve">{t.description}</p>
            <p className="small muted">
              {data.meetings
                .filter(m => m.agenda.some(a => a.tensionId === t.id))
                .map(m => m.title)
                .join(' · ') || tr('tensions.linkedAnyVisibleMeeting')}
            </p>
            <div className="row">
              {data.actor.workspace === 'write' && (
                <>
                  <button className="button" onClick={() => open(t)}>
                    {tr('app.edit')}
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      run(async () => {
                        await request(
                          `/tensions/${t.id}`,
                          { ...t, status: t.status === 'open' ? 'resolved' : 'open' },
                          'PUT',
                        );
                        await refresh();
                      })
                    }
                  >
                    <Check size={16} />
                    {t.status === 'open' ? tr('tensions.markResolved') : tr('tensions.reopen')}
                  </button>
                </>
              )}
              {t.status === 'open' && (
                <button
                  className="button primary"
                  disabled={data.actor.workspace === 'read' || !meetings.length}
                  onClick={() => {
                    setAttachment(t);
                    setMeetingId('');
                    setStepId('');
                  }}
                >
                  {tr('tensions.addMeeting')}
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          </article>
        ))}
      {!data.tensions.length && (
        <div className="empty">
          <h2>{tr('tensions.spaceTensions')}</h2>
          <p>{tr('tensions.tensionBacklogBelongsMeeting')}</p>
        </div>
      )}
      {attachment && (
        <div className="result-card">
          <h2>
            „{attachment.title}
            {tr('tensions.addMeeting2')}
          </h2>
          <p className="muted">{tr('tensions.titleBecomesVisibleAll')}</p>
          <label className="field">
            <span>{tr('tensions.meeting')}</span>
            <select
              value={meetingId}
              onChange={e => {
                setMeetingId(e.target.value);
                setStepId('');
              }}
            >
              <option value="">{tr('tensions.selectMeeting')}</option>
              {meetings.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{tr('tensions.agendaStep')}</span>
            <select value={stepId} onChange={e => setStepId(e.target.value)}>
              <option value="">{tr('tensions.selectStep')}</option>
              {selected?.template.steps
                .filter(s => s.kind === 'agenda')
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </label>
          <div className="row">
            <button
              className="button primary"
              disabled={!selected || !stepId}
              onClick={() =>
                run(async () => {
                  await request<Meeting>(`/tensions/${attachment.id}/attach`, {
                    meetingId,
                    stepId,
                    revision: selected!.revision,
                  });
                  await refresh();
                  setAttachment(null);
                })
              }
            >
              {tr('tensions.add')}
            </button>
            <button className="button" onClick={() => setAttachment(null)}>
              {tr('app.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
