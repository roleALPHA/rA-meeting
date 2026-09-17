import { t as tr } from './i18n';
import { useState } from 'react';
import { Plus, Check, ExternalLink, Search, X } from 'lucide-react';
import { terminologyOf, type Bootstrap, type DraftLink, type MeetingSummary, type Tension } from '../shared/model';
import { useApi } from './api-context';
import { Button } from './ui';

type DraftResult = DraftLink & { status?: string };
const agendaSteps = (m: MeetingSummary) => m.template.steps.filter(s => s.kind === 'agenda');

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
  const [meetingId, setMeetingId] = useState('');
  const [stepId, setStepId] = useState('');
  const [draft, setDraft] = useState<DraftLink | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DraftResult[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const writer = data.actor.workspace === 'write';
  // Submissions go to meetings that can still process them.
  const targets = data.meetings.filter(m => m.status !== 'completed' && agendaSteps(m).length);
  const meetingOf = (id?: string | null) => data.meetings.find(m => m.id === id);
  const selected = targets.find(m => m.id === meetingId);
  const term = selected ? terminologyOf(selected.template) : 'tensions';
  const open = (t: Tension | 'new') => {
    const current = t === 'new' ? null : t;
    const meeting = meetingOf(current?.meetingId);
    setEditing(t);
    setTitle(current?.title ?? '');
    setDescription(current?.description ?? '');
    // A tension whose meeting is over is edited in order to move it to another one.
    setMeetingId(meeting && meeting.status !== 'completed' ? meeting.id : targets.length === 1 ? targets[0].id : '');
    setStepId(meeting && meeting.status !== 'completed' ? (current?.stepId ?? '') : '');
    setDraft(current?.draft ?? null);
    setQuery('');
    setResults(null);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{tr('tensions.impulseChange')}</div>
          <h1>{tr('app.topics')}</h1>
          <p>{tr('tensions.topicsIntro')}</p>
        </div>
        <button className="button primary" disabled={!writer || !targets.length} onClick={() => open('new')}>
          <Plus size={17} />
          {tr('tensions.submit')}
        </button>
      </div>
      {writer && !targets.length && <p className="notice">{tr('tensions.noOpenMeeting')}</p>}
      <label className="check">
        <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
        {tr('tensions.showResolved')}
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
                {
                  title,
                  description,
                  meetingId,
                  stepId: stepId || null,
                  draft,
                  version: prior?.version,
                  status: prior?.status || 'open',
                },
                prior ? 'PUT' : 'POST',
              );
              await refresh();
              setEditing(null);
            });
          }}
        >
          <h2>{tr(editing === 'new' ? 'tensions.newTension' : 'tensions.editTension', undefined, term)}</h2>
          <label className="field">
            <span>{tr('tensions.meeting')}</span>
            <select
              required
              value={meetingId}
              onChange={e => {
                setMeetingId(e.target.value);
                setStepId('');
              }}
            >
              <option value="">{tr('tensions.selectMeeting')}</option>
              {targets.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title} · {m.circle}
                  {m.scheduledAt ? ` · ${new Date(m.scheduledAt).toLocaleDateString()}` : ''}
                </option>
              ))}
            </select>
          </label>
          {selected && agendaSteps(selected).length > 1 && (
            <label className="field">
              <span>{tr('tensions.agendaStep')}</span>
              <select value={stepId} onChange={e => setStepId(e.target.value)}>
                {agendaSteps(selected).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>{tr('outcomes.title')}</span>
            <input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>{tr('tensions.whatTension', undefined, term)}</span>
            <textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          {(data.integrations.drafts || draft) && (
            <div className="field">
              <span>{tr('tensions.draft')}</span>
              {draft ? (
                <div className="row">
                  <a className="text-button" href={draft.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={15} />
                    {draft.title}
                  </a>
                  <span className="pill">{draft.entityType}</span>
                  <Button
                    type="button"
                    className="icon"
                    aria-label={tr('tensions.removeDraft')}
                    onClick={() => setDraft(null)}
                  >
                    <X size={16} />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="row">
                    <input
                      aria-label={tr('tensions.searchOwnDrafts')}
                      placeholder={tr('tensions.searchOwnDrafts')}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        run(async () => setResults(await request<DraftResult[]>('/drafts/search', { query })));
                      }}
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        run(async () => setResults(await request<DraftResult[]>('/drafts/search', { query })))
                      }
                    >
                      <Search size={16} />
                      {tr('tensions.search')}
                    </Button>
                  </div>
                  {results && !results.length && <small>{tr('tensions.noDraftsFound')}</small>}
                  {results?.map(r => (
                    <div className="row" key={r.draftId}>
                      <span>{r.title}</span>
                      <span className="pill">{r.entityType}</span>
                      <Button
                        type="button"
                        onClick={() => {
                          setDraft({ draftId: r.draftId, title: r.title, entityType: r.entityType, url: r.url });
                          setResults(null);
                        }}
                      >
                        {tr('tensions.attachDraft')}
                      </Button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
          <p className="small muted">{tr('tensions.titleBecomesVisibleAll', undefined, term)}</p>
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
        .map(t => {
          const meeting = meetingOf(t.meetingId);
          const itemTerm = meeting ? terminologyOf(meeting.template) : 'tensions';
          const onAgenda = meeting?.agenda.find(a => a.tensionId === t.id);
          const missed = t.status === 'open' && (!meeting || meeting.status === 'completed');
          return (
            <article className="result-card" style={{ marginTop: 20 }} key={t.id}>
              <div className="result-top">
                <span className="pill">{tr('tensions.kind', undefined, itemTerm)}</span>
                <span className={`pill ${t.status === 'open' ? '' : 'green'}`}>
                  {t.status === 'open' ? tr('meeting.open2') : tr('tensions.resolved')}
                </span>
                {t.circle && <span className="pill">{t.circle}</span>}
              </div>
              <h2>{t.title}</h2>
              {t.description && <p className="preserve">{t.description}</p>}
              {t.draft && (
                <p>
                  <a className="text-button" href={t.draft.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink size={15} />
                    {tr('tensions.openDraft')}: {t.draft.title}
                  </a>
                </p>
              )}
              <p className="small muted">
                {meeting
                  ? `${meeting.title}${onAgenda ? ` · ${tr('tensions.onAgenda')}` : ''}`
                  : tr('tensions.noMeeting')}
                {missed && meeting && ` · ${tr('tensions.notProcessed')}`}
              </p>
              {writer && (
                <div className="row">
                  <button className="button" onClick={() => open(t)}>
                    {missed ? tr('tensions.moveToMeeting') : tr('app.edit')}
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
                </div>
              )}
            </article>
          );
        })}
      {!data.tensions.length && (
        <div className="empty">
          <h2>{tr('tensions.emptyTitle')}</h2>
          <p>{tr('tensions.emptyText')}</p>
        </div>
      )}
    </>
  );
}
