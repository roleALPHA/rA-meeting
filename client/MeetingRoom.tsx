import { AppError } from '../shared/model';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Clock3,
  ListChecks,
  Plus,
  Users,
  Video,
  Upload,
  WandSparkles,
  Send,
  ExternalLink,
} from 'lucide-react';
import { outputLabels, terminologyOf, type Bootstrap, type Meeting, type Outcome } from '../shared/model';
import { pendingTensions } from '../shared/tensions';
import { useApi } from './api-context';
import { checkMeeting } from '../shared/integrity';
import { GovernanceAssistant } from './GovernanceAssistant';
import { Assistant } from './Assistant';
import { t as tr, language } from './i18n';
import { CalendarLink } from './CalendarLink';
import { Button, Modal, Field } from './ui';
import { statusLabels } from './labels';
import { OutcomeForm } from './OutcomeForm';

export function MeetingRoom({
  meeting: m,
  actor,
  integrations,
  tensions,
  refresh,
  update,
  busy,
  run,
}: {
  meeting: Meeting;
  actor: Bootstrap['actor'];
  integrations: Bootstrap['integrations'];
  tensions: Bootstrap['tensions'];
  /** Reloads the workspace overview; submitted tensions change when the meeting takes them over or resolves them. */
  refresh: () => Promise<unknown>;
  update: (m: Meeting) => void;
  busy: boolean;
  run: (task: () => Promise<void>) => void;
}) {
  const { request } = useApi();
  const [tab, setTab] = useState<'flow' | 'results' | 'transcript' | 'history' | 'governance'>('flow');
  const [note, setNote] = useState(m.notes[m.template.steps[m.currentStep].id] || '');
  const [agendaTitle, setAgendaTitle] = useState('');
  const [agendaOwner, setAgendaOwner] = useState('');
  const [outcome, setOutcome] = useState<{ stepId: string; initial?: Outcome } | null>(null);
  const [raw, setRaw] = useState('');
  const [entityPreview, setEntityPreview] = useState<{
    outcomeId: string;
    revision: number;
    plan: { label: string; destination: string; tool: string; arguments: unknown };
  } | null>(null);
  const [confirmExport, setConfirmExport] = useState(false);
  const [transcriptPreview, setTranscriptPreview] = useState<{
    parts: { id: string; createdDateTime: string; endDateTime: string | null }[];
    excluded: number;
  } | null>(null);
  const [reconcile, setReconcile] = useState<Outcome | null>(null);
  const [resolution, setResolution] = useState('created');
  const [draftId, setDraftId] = useState('');
  const [reconcileNote, setReconcileNote] = useState('');
  const [clock, setClock] = useState(Date.now());
  const step = m.template.steps[m.currentStep];
  const editable = actor.workspace === 'write';
  // Reset the draft only when another meeting or step opens. Following m.notes would overwrite what the user is
  // typing whenever the 10-second refresh brings in the shared meeting.
  useEffect(() => {
    setNote(m.notes[step.id] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id, step.id]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = m.stepStartedAt ? Math.max(0, Math.floor((clock - Date.parse(m.stepStartedAt)) / 1000)) : 0;
  const remaining = step.minutes * 60 - elapsed;
  const act = (body: Record<string, unknown>) =>
    run(async () => {
      update(await request<Meeting>(`/meetings/${m.id}/command`, { ...body, revision: m.revision }));
      if (['start', 'agenda.import', 'agenda.resolve'].includes(String(body.type))) await refresh();
    });
  const term = terminologyOf(m.template);
  const pending = pendingTensions(m, tensions);
  const draftOf = (tensionId?: string) => tensions.find(t => t.id === tensionId)?.draft;
  const post = (path: string, body: Record<string, unknown> = {}) =>
    request<Meeting>(`/meetings/${m.id}/${path}`, { ...body, revision: m.revision });
  const approved = m.outcomes.filter(o => o.status === 'approved' && !o.export);
  const issues = useMemo(() => checkMeeting(m), [m]);
  return (
    <>
      <div className="meeting-heading">
        <div>
          <div className="eyebrow">
            {m.circle} <span> / </span> {m.template.name} {tr('meeting.v')}
            {m.template.version}
          </div>
          <h1>{m.title}</h1>
        </div>
        <span className={`pill ${m.status === 'active' ? 'green' : ''}`}>
          {m.status === 'active' && <span className="live-dot" />}
          {tr(statusLabels[m.status])}
        </span>
      </div>
      {issues.length > 0 && (
        <div className="notice" role="status">
          <strong>{tr('meeting.dataConsistencyNotice')}</strong>
          <ul>
            {[...new Set(issues.map(i => i.message))].map(message => (
              <li key={message}>{tr(message)}</li>
            ))}
          </ul>
          <p className="small">{tr('meeting.checkDetectsDeviationsApp')}</p>
        </div>
      )}
      <CalendarLink
        meeting={m}
        editable={editable}
        enabled={integrations.graph}
        actorId={actor.id}
        run={run}
        update={update}
      />
      <div className="tabs" role="tablist">
        {(
          [
            ['flow', tr('meeting.meetingFlow')],
            ['results', `${tr('meeting.outcomes')} (${m.outcomes.length})`],
            ['transcript', tr('meeting.transcriptAnalysis')],
            ['history', tr('meeting.history')],
            ['governance', tr('app.askGovernance')],
          ] as const
        ).map(([key, label]) => (
          <button role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'flow' && (
        <div className="room-grid">
          <aside className="flow-sidebar">
            <div className="section-label">{tr('meeting.ourFlow')}</div>
            {m.template.steps.map((s, i) => (
              <div
                className={`flow-step ${i === m.currentStep && m.status !== 'completed' ? 'active' : ''}`}
                key={s.id}
              >
                <span className="step-circle">{m.completedSteps.includes(s.id) ? <Check size={15} /> : i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <small>
                    {s.minutes ? `${s.minutes} ${tr('app.min')}` : tr('meeting.timebox')}
                    {s.optional ? tr('meeting.optional') : ''}
                  </small>
                </div>
              </div>
            ))}
            <p className="small muted">
              {tr('meeting.templateV')}
              {m.template.version} {tr('meeting.templateChangesDoAffect')}
            </p>
          </aside>
          <section className="meeting-work">
            <div className="active-step-heading">
              <span className="eyebrow">
                {tr('meeting.step')} {m.currentStep + 1} {tr('meeting.text')} {m.template.steps.length}
              </span>
              <span className={`timer ${remaining < 0 ? 'overtime' : ''}`}>
                <Clock3 size={17} />
                {step.minutes
                  ? `${remaining < 0 ? '+' : ''}${Math.floor(Math.abs(remaining) / 60)
                      .toString()
                      .padStart(2, '0')}:${(Math.abs(remaining) % 60).toString().padStart(2, '0')}`
                  : tr('meeting.timeLimit')}
              </span>
            </div>
            <h2>{m.status === 'completed' ? tr('meeting.meetingCompleted') : step.title}</h2>
            <p className="step-description">
              {m.status === 'completed' ? tr('meeting.reviewOutcomesRecordAgreed') : step.description}
            </p>
            {m.status === 'scheduled' && (
              <div className="start-banner">
                <div>
                  <strong>{tr('meeting.readyFindClarityTogether')}</strong>
                  <p>{tr('meeting.templateReadyStartingBegins')}</p>
                </div>
                {editable && (
                  <Button className="primary" disabled={busy} onClick={() => act({ type: 'start' })}>
                    {tr('meeting.startMeeting')}
                    <ArrowRight size={17} />
                  </Button>
                )}
              </div>
            )}
            {m.status === 'scheduled' && m.template.steps.some(s => s.kind === 'agenda') && (
              <section className="submitted">
                <div className="section-heading">
                  <h3>{tr('meeting.submittedItems', { count: pending.length }, term)}</h3>
                </div>
                {pending.length ? (
                  <ul>
                    {pending.map(t => (
                      <li key={t.id}>
                        <strong>{t.title}</strong>
                        {t.createdByName && <span className="muted"> · {t.createdByName}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">{tr('meeting.nothingSubmitted', undefined, term)}</p>
                )}
                <p className="small muted">{tr('meeting.submittedJoinOnStart', undefined, term)}</p>
              </section>
            )}
            {step.kind === 'agenda' && (
              <section>
                <div className="section-heading">
                  <h3>{tr('meeting.tensionsTopics', undefined, term)}</h3>
                  <span className="muted">
                    {m.agenda.filter(a => a.stepId === step.id && a.status === 'open').length} {tr('meeting.open')}
                  </span>
                </div>
                {m.status === 'active' && pending.length > 0 && (
                  <div className="notice">
                    <span>{tr('meeting.newlySubmitted', { count: pending.length }, term)}</span>
                    {editable && (
                      <Button disabled={busy} onClick={() => act({ type: 'agenda.import' })}>
                        <Plus size={15} />
                        {tr('meeting.takeOver')}
                      </Button>
                    )}
                  </div>
                )}
                {m.agenda
                  .filter(a => a.stepId === step.id)
                  .map((a, index, items) => (
                    <article className={`agenda-card ${a.status === 'resolved' ? 'resolved' : ''}`} key={a.id}>
                      <div className="row">
                        <strong>{a.title}</strong>
                        {a.status === 'resolved' && <CheckCircle2 size={18} />}
                        {editable && m.status !== 'completed' && items.length > 1 && (
                          <span className="agenda-order">
                            <Button
                              className="icon"
                              aria-label={tr('meeting.moveUp')}
                              disabled={busy || index === 0}
                              onClick={() => act({ type: 'agenda.move', id: a.id, offset: -1 })}
                            >
                              <ArrowUp size={15} />
                            </Button>
                            <Button
                              className="icon"
                              aria-label={tr('meeting.moveDown')}
                              disabled={busy || index === items.length - 1}
                              onClick={() => act({ type: 'agenda.move', id: a.id, offset: 1 })}
                            >
                              <ArrowDown size={15} />
                            </Button>
                          </span>
                        )}
                      </div>
                      {draftOf(a.tensionId) && (
                        <p>
                          <a
                            className="text-button"
                            href={draftOf(a.tensionId)!.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={15} />
                            {tr('tensions.openDraft')}: {draftOf(a.tensionId)!.title}
                          </a>
                        </p>
                      )}
                      {a.owner && (
                        <p className="small muted">
                          {tr('meeting.raised')} {a.owner}
                        </p>
                      )}
                      {step.phases.length > 0 && (
                        <div className="phases">
                          {step.phases.map((phase, index) => (
                            <button
                              key={index}
                              className={a.phase === index ? 'selected' : ''}
                              disabled={!editable || busy || m.status !== 'active' || a.status !== 'open'}
                              onClick={() => act({ type: 'agenda.phase', id: a.id, phase: index })}
                            >
                              {index + 1}. {phase}
                            </button>
                          ))}
                        </div>
                      )}
                      {a.proposal && (
                        <p className="preserve">
                          <strong>{tr('assistant.proposalDraft')}: </strong>
                          {a.proposal}
                        </p>
                      )}
                      {a.objections && (
                        <details>
                          <summary>{tr('assistant.objectionsOnePerParagraph')}</summary>
                          <p className="preserve">{a.objections}</p>
                        </details>
                      )}
                      {editable && a.status === 'open' && m.status !== 'completed' && (
                        <Assistant
                          meeting={m}
                          item={a}
                          enabled={integrations.ai}
                          busy={busy}
                          run={run}
                          update={update}
                        />
                      )}
                      {editable && a.status === 'open' && m.status === 'active' && (
                        <Button disabled={busy} onClick={() => act({ type: 'agenda.resolve', id: a.id })}>
                          <Check size={15} />
                          {tr('meeting.finishDiscussion')}
                        </Button>
                      )}
                    </article>
                  ))}
                {editable && m.status !== 'completed' && (
                  <form
                    className="agenda-add"
                    onSubmit={e => {
                      e.preventDefault();
                      run(async () => {
                        update(
                          await post('command', {
                            type: 'agenda.add',
                            stepId: step.id,
                            title: agendaTitle,
                            owner: agendaOwner,
                          }),
                        );
                        setAgendaTitle('');
                        setAgendaOwner('');
                      });
                    }}
                  >
                    <input
                      aria-label={tr('meeting.tensionTopic', undefined, term)}
                      placeholder={tr('meeting.whichTensionWouldLike', undefined, term)}
                      required
                      value={agendaTitle}
                      onChange={e => setAgendaTitle(e.target.value)}
                    />
                    <input
                      aria-label={tr('meeting.raised')}
                      placeholder={tr('meeting.raised')}
                      value={agendaOwner}
                      onChange={e => setAgendaOwner(e.target.value)}
                    />
                    <Button disabled={busy} aria-label={tr('meeting.addTopic')}>
                      <Plus size={18} />
                    </Button>
                  </form>
                )}
              </section>
            )}
            <Field label={tr('meeting.notesStep')}>
              <textarea
                rows={6}
                readOnly={!editable || m.status === 'completed'}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={tr('meeting.recordObservationsAnswersKey')}
              />
            </Field>
            <div className="row wrap">
              {editable && m.status !== 'completed' && (
                <Button
                  disabled={busy || note === (m.notes[step.id] || '')}
                  onClick={() => act({ type: 'note', text: note })}
                >
                  <Check size={15} />
                  {tr('meeting.saveNotes')}
                </Button>
              )}
              {step.outputs.length > 0 && editable && (
                <Button disabled={busy} onClick={() => setOutcome({ stepId: step.id })}>
                  <Plus size={15} />
                  {tr('meeting.recordOutcome')}
                </Button>
              )}
              <div className="output-tags">
                {step.outputs.map(t => (
                  <span key={t}>{tr(outputLabels[t])}</span>
                ))}
              </div>
            </div>
            {editable && m.status === 'active' && (
              <div className="next-step">
                <span>
                  {step.optional && (
                    <Button disabled={busy} onClick={() => act({ type: 'skip' })}>
                      {tr('meeting.skip')}
                    </Button>
                  )}
                </span>
                <Button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      let current = m;
                      if (note !== (m.notes[step.id] || ''))
                        current = await post('command', { type: 'note', text: note });
                      update(
                        await request<Meeting>(`/meetings/${m.id}/command`, {
                          type: 'next',
                          revision: current.revision,
                        }),
                      );
                    })
                  }
                >
                  {m.currentStep === m.template.steps.length - 1 ? tr('meeting.finishMeeting') : tr('meeting.nextStep')}
                  <ArrowRight size={17} />
                </Button>
              </div>
            )}
          </section>
        </div>
      )}
      {tab === 'results' && (
        <section className="results-view">
          <div className="section-heading">
            <div>
              <h2>{tr('meeting.discussionNextSteps')}</h2>
              <p className="muted">{tr('meeting.reviewProposalsRecordAgreed')}</p>
            </div>
            {editable && integrations.mcp && (
              <Button className="primary" disabled={busy || !approved.length} onClick={() => setConfirmExport(true)}>
                <Send size={16} />
                {approved.length} {tr('meeting.minutes')}
              </Button>
            )}
          </div>
          {!m.outcomes.length && (
            <div className="empty">
              <ListChecks size={32} />
              <h3>{tr('meeting.outcomesYet')}</h3>
              <p>{tr('meeting.recordOutcomesDuringMeeting')}</p>
              <Button onClick={() => setTab('transcript')}>
                {tr('meeting.openTranscript')}
                <ArrowRight size={15} />
              </Button>
            </div>
          )}
          {m.outcomes.map(o => (
            <article className="result-card" key={o.id}>
              <div className="result-top">
                <span className="pill">{tr(outputLabels[o.type])}</span>
                <span className={`pill ${o.status === 'approved' ? 'green' : ''}`}>
                  {o.export?.state === 'draft_created'
                    ? tr('meeting.draftRolealpha')
                    : o.export?.state === 'uncertain'
                      ? tr('meeting.checkExport')
                      : o.export?.state === 'sending'
                        ? tr('meeting.sending')
                        : o.status === 'approved'
                          ? tr('meeting.confirmed')
                          : o.status === 'rejected'
                            ? tr('meeting.rejected')
                            : tr('meeting.review')}
                </span>
                <span className="small muted">
                  {o.source === 'ai' ? tr('meeting.aiSuggestion') : tr('meeting.enteredManually')}
                </span>
              </div>
              <h3>{o.title}</h3>
              <p className="preserve">{o.description}</p>
              {Object.keys(o.data).length > 0 && (
                <details>
                  <summary>{tr('meeting.additionalEntityFields')}</summary>
                  <dl>
                    {Object.entries(o.data).map(([key, value]) => (
                      <React.Fragment key={key}>
                        <dt>{key}</dt>
                        <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </details>
              )}
              <div className="result-meta">
                <span>
                  <Users size={14} />
                  {o.owner || tr('meeting.ownerUnassigned')}
                </span>
                <span>
                  <Clock3 size={14} />
                  {o.dueDate || tr('meeting.date')}
                </span>
              </div>
              {o.evidence.length > 0 && (
                <details>
                  <summary>
                    {o.evidence.length} {tr('meeting.transcriptEvidence')}
                  </summary>
                  {m.transcript
                    .filter(s => o.evidence.includes(s.id))
                    .map(s => (
                      <blockquote key={s.id}>
                        <small>
                          {s.start || s.id} {s.speaker}
                        </small>
                        {s.text}
                      </blockquote>
                    ))}
                </details>
              )}
              {o.export?.draftId && (
                <p className="small muted">
                  {tr('meeting.draftId')}
                  {o.export.draftId} {tr('meeting.approvalRolealphaPending')}
                </p>
              )}
              {editable && o.status === 'approved' && !o.export && integrations.entityTypes.includes(o.type) && (
                <Button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const plan = await request<{
                        label: string;
                        destination: string;
                        tool: string;
                        arguments: unknown;
                      }>(`/meetings/${m.id}/entity-preview`, { revision: m.revision, outcomeId: o.id });
                      setEntityPreview({ outcomeId: o.id, revision: m.revision, plan });
                    })
                  }
                >
                  {tr(outputLabels[o.type])} {tr('meeting.createRolealpha')}
                </Button>
              )}
              {editable && !o.export && (
                <div className="row">
                  <Button disabled={busy} onClick={() => setOutcome({ stepId: o.stepId, initial: o })}>
                    {tr('app.edit')}
                  </Button>
                  {o.status !== 'rejected' && (
                    <Button
                      disabled={busy}
                      onClick={() => act({ type: 'outcome.review', id: o.id, status: 'rejected' })}
                    >
                      {tr('meeting.reject')}
                    </Button>
                  )}
                  {o.status !== 'approved' && (
                    <Button
                      className="approve"
                      disabled={busy}
                      onClick={() => act({ type: 'outcome.review', id: o.id, status: 'approved' })}
                    >
                      <Check size={16} />
                      {tr('meeting.confirmWording')}
                    </Button>
                  )}
                </div>
              )}
              {editable &&
                (o.export?.state === 'uncertain' ||
                  (o.export?.state === 'sending' && clock - Date.parse(o.export.startedAt || '') > 300_000)) && (
                  <Button
                    onClick={() => {
                      setReconcile(o);
                      setReconcileNote('');
                      setDraftId('');
                    }}
                  >
                    {tr('meeting.reconcileExportRolealpha')}
                  </Button>
                )}
            </article>
          ))}
        </section>
      )}
      {tab === 'governance' && <GovernanceAssistant enabled={!!integrations.governance} />}
      {tab === 'transcript' && (
        <div className="transcript-grid">
          <section>
            <div className="section-heading">
              <h2>{tr('meeting.transcript')}</h2>
              <span className="pill">
                {m.transcript.length} {tr('meeting.segments')}
              </span>
            </div>
            <p className="muted">{tr('meeting.teamsVttTxtTimestamped')}</p>
            {editable && (
              <>
                <label className="upload">
                  <Upload size={18} />
                  <span>{tr('meeting.chooseFileVttTxt')}</span>
                  <input
                    type="file"
                    accept=".vtt,.txt,text/plain,text/vtt"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f)
                        run(async () => {
                          if (f.size > 1_000_000) throw new AppError(413, 'meeting.maximum1MbPer');
                          setRaw(await f.text());
                        });
                    }}
                  />
                </label>
                <textarea
                  aria-label={tr('meeting.transcriptText')}
                  rows={8}
                  value={raw}
                  onChange={e => setRaw(e.target.value)}
                  placeholder={tr('meeting.pasteTranscriptHere')}
                />
                <div className="row">
                  <Button
                    disabled={busy || !raw.trim()}
                    onClick={() =>
                      run(async () => {
                        update(await post('transcript', { text: raw }));
                        setRaw('');
                      })
                    }
                  >
                    <Upload size={15} />
                    {tr('meeting.import')}
                  </Button>
                  <Button
                    className="primary"
                    disabled={busy || !m.transcript.length || !integrations.ai || m.analyzedHash === m.transcriptHash}
                    onClick={() =>
                      run(async () => {
                        update(await post('analyze', { language: language() }));
                        setTab('results');
                      })
                    }
                  >
                    <WandSparkles size={16} />
                    {m.analyzedHash && m.analyzedHash === m.transcriptHash
                      ? tr('meeting.alreadyAnalyzed')
                      : tr('meeting.analyzeOutcomes')}
                  </Button>
                </div>
              </>
            )}
            {m.transcript.length > 0 && (
              <div className="transcript-segments">
                {m.transcript.map(s => (
                  <div className="segment" key={s.id}>
                    <span>{s.start || s.id}</span>
                    <p>
                      <strong>{s.speaker}</strong>
                      {s.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
          <aside className="integration-card">
            <h3>
              <Video size={19} />
              {tr('meeting.teamsLink')}
            </h3>
            <>
              <p>{tr('meeting.loadTranscriptsDemandThrough')}</p>
              {editable && (
                <Button
                  disabled={busy || !m.calendar?.joinUrl}
                  onClick={() =>
                    run(async () =>
                      setTranscriptPreview(
                        await request<NonNullable<typeof transcriptPreview>>(`/meetings/${m.id}/graph-preview`, {
                          revision: m.revision,
                        }),
                      ),
                    )
                  }
                >
                  {tr('meeting.fetchTranscriptNow')}
                </Button>
              )}
            </>
            <div className="connection-status">
              <span className={`dot ${integrations.ai ? 'on' : ''}`} />
              {tr('meeting.ai')} {integrations.ai ? tr('meeting.configured') : tr('meeting.configured2')}
            </div>
            <div className="connection-status">
              <span className={`dot ${integrations.graph ? 'on' : ''}`} />
              {tr('meeting.microsoftGraph')} {integrations.graph ? tr('meeting.configured') : tr('meeting.configured2')}
            </div>
          </aside>
        </div>
      )}
      {tab === 'history' && (
        <section className="history">
          <h2>{tr('meeting.traceableHistory')}</h2>
          {[...m.events].reverse().map(e => (
            <div className="history-row" key={e.id}>
              <span className="history-dot" />
              <div>
                <strong>{e.detail}</strong>
                <p>
                  {e.actor} · {new Date(e.at).toLocaleString(language())}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}
      {outcome && (
        <OutcomeForm
          meeting={m}
          stepId={outcome.stepId}
          initial={outcome.initial}
          close={() => setOutcome(null)}
          busy={busy}
          save={value =>
            run(async () => {
              update(
                await post('command', {
                  type: outcome.initial ? 'outcome.edit' : 'outcome.add',
                  id: outcome.initial?.id,
                  outcome: value,
                }),
              );
              setOutcome(null);
            })
          }
        />
      )}
      {entityPreview && (
        <Modal
          title={`${entityPreview.plan.label} ${tr('meeting.createRolealpha')}`}
          close={() => setEntityPreview(null)}
        >
          <p>{tr('meeting.confirmedWordingBecomesNew', undefined, term)}</p>
          <h3>{m.outcomes.find(o => o.id === entityPreview.outcomeId)?.title}</h3>
          <p className="preserve">{m.outcomes.find(o => o.id === entityPreview.outcomeId)?.description}</p>
          <p>
            {tr('meeting.owner')} {m.outcomes.find(o => o.id === entityPreview.outcomeId)?.owner || tr('meeting.open2')}
          </p>
          <p className="small muted">{tr('meeting.relatedTranscriptEvidenceConfirmation')}</p>
          <div className="modal-footer">
            <Button onClick={() => setEntityPreview(null)}>{tr('app.cancel')}</Button>
            <Button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  update(
                    await request<Meeting>(`/meetings/${m.id}/export-entity`, {
                      revision: entityPreview.revision,
                      outcomeId: entityPreview.outcomeId,
                      plan: entityPreview.plan,
                    }),
                  );
                  setEntityPreview(null);
                })
              }
            >
              {tr('meeting.createReviewedDraft')}
            </Button>
          </div>
        </Modal>
      )}
      {confirmExport && (
        <Modal title={tr('meeting.sendConfirmedOutcomes')} close={() => setConfirmExport(false)}>
          <p>
            {tr('meeting.these')} {approved.length} {tr('meeting.outcomesIncludingTranscriptEvidence')}{' '}
            <strong>{tr('meeting.meetingDraft')}</strong> {tr('meeting.rolealpha')}
          </p>
          <ul>
            {approved.map(o => (
              <li key={o.id}>{o.title}</li>
            ))}
          </ul>
          <p>{tr('meeting.doesYetChangeRoles')}</p>
          <div className="modal-footer">
            <Button onClick={() => setConfirmExport(false)}>{tr('app.cancel')}</Button>
            <Button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  update(await post('export', { ids: approved.map(o => o.id) }));
                  setConfirmExport(false);
                })
              }
            >
              <Send size={16} />
              {tr('meeting.sendDraft')}
            </Button>
          </div>
        </Modal>
      )}
      {reconcile && (
        <Modal title={tr('meeting.reconcileExport')} close={() => setReconcile(null)}>
          <form
            onSubmit={e => {
              e.preventDefault();
              run(async () => {
                update(
                  await post('export-reconcile', { ids: [reconcile.id], resolution, draftId, note: reconcileNote }),
                );
                setReconcile(null);
              });
            }}
          >
            <p>{tr('meeting.firstCheckDraftsRolealpha')}</p>
            <Field label={tr('meeting.checkResult')}>
              <select value={resolution} onChange={e => setResolution(e.target.value)}>
                <option value="created">{tr('meeting.draftExists')}</option>
                <option value="not-created">{tr('meeting.draftCreatedAllowRetry')}</option>
              </select>
            </Field>
            {resolution === 'created' && (
              <Field label={tr('meeting.draftId2')}>
                <input required value={draftId} onChange={e => setDraftId(e.target.value)} />
              </Field>
            )}
            <Field label={tr('meeting.verificationNote')}>
              <textarea
                required
                minLength={10}
                value={reconcileNote}
                onChange={e => setReconcileNote(e.target.value)}
              />
            </Field>
            <div className="modal-footer">
              <span />
              <Button className="primary" disabled={busy}>
                {tr('meeting.recordVerification')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {transcriptPreview && (
        <Modal title={tr('meeting.importTranscriptTeams')} close={() => setTranscriptPreview(null)}>
          {transcriptPreview.parts.length ? (
            <>
              <p>{tr('meeting.theseTranscriptPartsWere')}</p>
              <ul>
                {transcriptPreview.parts.map(part => (
                  <li key={part.id}>
                    {new Date(part.createdDateTime).toLocaleString(language())}
                    {part.endDateTime &&
                      ` – ${new Date(part.endDateTime).toLocaleTimeString(language(), { hour: '2-digit', minute: '2-digit' })}`}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="notice">{tr('meeting.transcriptWasFoundEvent')}</p>
          )}
          {transcriptPreview.excluded > 0 && (
            <p className="small muted">
              {transcriptPreview.excluded} {tr('meeting.transcriptPartsOtherEvents')}
            </p>
          )}
          <div className="modal-footer">
            <Button onClick={() => setTranscriptPreview(null)}>{tr('app.cancel')}</Button>
            <Button
              className="primary"
              disabled={busy || !transcriptPreview.parts.length}
              onClick={() =>
                run(async () => {
                  update(await post('graph-fetch', { partIds: transcriptPreview.parts.map(p => p.id) }));
                  setTranscriptPreview(null);
                })
              }
            >
              {tr('meeting.import')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
