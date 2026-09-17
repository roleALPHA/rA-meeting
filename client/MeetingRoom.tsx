import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
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
} from 'lucide-react';
import { outputLabels, type Bootstrap, type Meeting, type Outcome } from '../shared/model';
import { useApi } from './api-context';
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
  update,
  busy,
  run,
}: {
  meeting: Meeting;
  actor: Bootstrap['actor'];
  integrations: Bootstrap['integrations'];
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
  useEffect(() => {
    setNote(m.notes[step.id] || '');
  }, [m.id, step.id]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = m.stepStartedAt ? Math.max(0, Math.floor((clock - Date.parse(m.stepStartedAt)) / 1000)) : 0;
  const remaining = step.minutes * 60 - elapsed;
  const act = (body: Record<string, unknown>) =>
    run(async () => update(await request<Meeting>(`/meetings/${m.id}/command`, { ...body, revision: m.revision })));
  const post = (path: string, body: Record<string, unknown> = {}) =>
    request<Meeting>(`/meetings/${m.id}/${path}`, { ...body, revision: m.revision });
  const approved = m.outcomes.filter(o => o.status === 'approved' && !o.export);
  return (
    <>
      <div className="meeting-heading">
        <div>
          <div className="eyebrow">
            {m.circle} <span> / </span> {m.template.name} {tr('· v')}
            {m.template.version}
          </div>
          <h1>{m.title}</h1>
        </div>
        <span className={`pill ${m.status === 'active' ? 'green' : ''}`}>
          {m.status === 'active' && <span className="live-dot" />}
          {tr(statusLabels[m.status])}
        </span>
      </div>
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
            ['flow', tr('Meetingablauf')],
            ['results', `${tr('Ergebnisse')} (${m.outcomes.length})`],
            ['transcript', tr('Transkript & Analyse')],
            ['history', tr('Verlauf')],
            ['governance', tr('Governance fragen')],
          ] as const
        ).map(([key, label]) => (
          <button role="tab" aria-selected={tab === key} key={key} onClick={() => setTab(key)}>
            {tr(label)}
          </button>
        ))}
      </div>
      {tab === 'flow' && (
        <div className="room-grid">
          <aside className="flow-sidebar">
            <div className="section-label">{tr('UNSER ABLAUF')}</div>
            {m.template.steps.map((s, i) => (
              <div
                className={`flow-step ${i === m.currentStep && m.status !== 'completed' ? 'active' : ''}`}
                key={s.id}
              >
                <span className="step-circle">{m.completedSteps.includes(s.id) ? <Check size={15} /> : i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <small>
                    {s.minutes ? `${s.minutes} ${tr('Min.')}` : tr('Ohne Zeitbox')}
                    {s.optional ? tr(' · Optional') : ''}
                  </small>
                </div>
              </div>
            ))}
            <p className="small muted">
              {tr('Vorlage v')}
              {m.template.version} {tr('· Änderungen am Template beeinflussen dieses Meeting nicht.')}
            </p>
          </aside>
          <section className="meeting-work">
            <div className="active-step-heading">
              <span className="eyebrow">
                {tr('SCHRITT')} {m.currentStep + 1} {tr('VON')} {m.template.steps.length}
              </span>
              <span className={`timer ${remaining < 0 ? 'overtime' : ''}`}>
                <Clock3 size={17} />
                {step.minutes
                  ? `${remaining < 0 ? '+' : ''}${Math.floor(Math.abs(remaining) / 60)
                      .toString()
                      .padStart(2, '0')}:${(Math.abs(remaining) % 60).toString().padStart(2, '0')}`
                  : tr('Offene Zeitbox')}
              </span>
            </div>
            <h2>{m.status === 'completed' ? tr('Meeting abgeschlossen') : step.title}</h2>
            <p className="step-description">
              {m.status === 'completed'
                ? tr('Prüfe die Ergebnisse und halte die vereinbarten nächsten Schritte fest.')
                : step.description}
            </p>
            {m.status === 'scheduled' && (
              <div className="start-banner">
                <div>
                  <strong>{tr('Bereit, gemeinsam Klarheit zu schaffen?')}</strong>
                  <p>{tr('Die Vorlage ist vorbereitet. Mit dem Start beginnt die erste Zeitbox.')}</p>
                </div>
                {editable && (
                  <Button className="primary" disabled={busy} onClick={() => act({ type: 'start' })}>
                    {tr('Meeting starten')}
                    <ArrowRight size={17} />
                  </Button>
                )}
              </div>
            )}
            {step.kind === 'agenda' && (
              <section>
                <div className="section-heading">
                  <h3>{tr('Spannungen & Themen')}</h3>
                  <span className="muted">
                    {m.agenda.filter(a => a.stepId === step.id && a.status === 'open').length} {tr('offen')}
                  </span>
                </div>
                {m.agenda
                  .filter(a => a.stepId === step.id)
                  .map(a => (
                    <article className={`agenda-card ${a.status === 'resolved' ? 'resolved' : ''}`} key={a.id}>
                      <div className="row">
                        <strong>{a.title}</strong>
                        {a.status === 'resolved' && <CheckCircle2 size={18} />}
                      </div>
                      {a.owner && (
                        <p className="small muted">
                          {tr('Eingebracht von')} {a.owner}
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
                          <strong>{tr('Vorschlagsentwurf')}: </strong>
                          {a.proposal}
                        </p>
                      )}
                      {a.objections && (
                        <details>
                          <summary>{tr('Einwände (einer pro Absatz)')}</summary>
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
                          {tr('Bearbeitung abschließen')}
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
                      aria-label={tr('Spannung oder Thema')}
                      placeholder={tr('Welche Spannung möchtest du bearbeiten?')}
                      required
                      value={agendaTitle}
                      onChange={e => setAgendaTitle(e.target.value)}
                    />
                    <input
                      aria-label={tr('Eingebracht von')}
                      placeholder={tr('Eingebracht von')}
                      value={agendaOwner}
                      onChange={e => setAgendaOwner(e.target.value)}
                    />
                    <Button disabled={busy} aria-label={tr('Thema hinzufügen')}>
                      <Plus size={18} />
                    </Button>
                  </form>
                )}
              </section>
            )}
            <Field label={tr('Notizen zu diesem Schritt')}>
              <textarea
                rows={6}
                readOnly={!editable || m.status === 'completed'}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={tr('Beobachtungen, Antworten und wichtige Punkte festhalten …')}
              />
            </Field>
            <div className="row wrap">
              {editable && m.status !== 'completed' && (
                <Button
                  disabled={busy || note === (m.notes[step.id] || '')}
                  onClick={() => act({ type: 'note', text: note })}
                >
                  <Check size={15} />
                  {tr('Notizen speichern')}
                </Button>
              )}
              {step.outputs.length > 0 && editable && (
                <Button disabled={busy} onClick={() => setOutcome({ stepId: step.id })}>
                  <Plus size={15} />
                  {tr('Ergebnis festhalten')}
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
                      {tr('Überspringen')}
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
                  {m.currentStep === m.template.steps.length - 1 ? tr('Meeting abschließen') : tr('Nächster Schritt')}
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
              <h2>{tr('Vom Gespräch zum nächsten Schritt')}</h2>
              <p className="muted">
                {tr(
                  'Vorschläge prüfen und verbindliche Ergebnisse festhalten. Eine Übertragung nach roleALPHA ist optional.',
                )}
              </p>
            </div>
            {editable && integrations.mcp && (
              <Button className="primary" disabled={busy || !approved.length} onClick={() => setConfirmExport(true)}>
                <Send size={16} />
                {approved.length} {tr('als Protokoll')}
              </Button>
            )}
          </div>
          {!m.outcomes.length && (
            <div className="empty">
              <ListChecks size={32} />
              <h3>{tr('Noch keine Ergebnisse')}</h3>
              <p>{tr('Halte Ergebnisse im Meetingablauf fest oder werte ein Transkript aus.')}</p>
              <Button onClick={() => setTab('transcript')}>
                {tr('Transkript öffnen')}
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
                    ? tr('Entwurf in roleALPHA')
                    : o.export?.state === 'uncertain'
                      ? tr('Export prüfen')
                      : o.export?.state === 'sending'
                        ? tr('Wird übertragen')
                        : o.status === 'approved'
                          ? tr('Bestätigt')
                          : o.status === 'rejected'
                            ? tr('Verworfen')
                            : tr('Zur Prüfung')}
                </span>
                <span className="small muted">{o.source === 'ai' ? tr('KI-Vorschlag') : tr('Manuell erfasst')}</span>
              </div>
              <h3>{o.title}</h3>
              <p className="preserve">{o.description}</p>
              {Object.keys(o.data).length > 0 && (
                <details>
                  <summary>{tr('Weitere Entitätsfelder')}</summary>
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
                  {o.owner || tr('Verantwortung offen')}
                </span>
                <span>
                  <Clock3 size={14} />
                  {o.dueDate || tr('Kein Termin')}
                </span>
              </div>
              {o.evidence.length > 0 && (
                <details>
                  <summary>
                    {o.evidence.length} {tr('Transkriptbelege')}
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
                  {tr('Entwurf-ID:')}
                  {o.export.draftId} {tr('· Freigabe in roleALPHA ausstehend.')}
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
                  {tr(outputLabels[o.type])} {tr('in roleALPHA anlegen')}
                </Button>
              )}
              {editable && !o.export && (
                <div className="row">
                  <Button disabled={busy} onClick={() => setOutcome({ stepId: o.stepId, initial: o })}>
                    {tr('Bearbeiten')}
                  </Button>
                  {o.status !== 'rejected' && (
                    <Button
                      disabled={busy}
                      onClick={() => act({ type: 'outcome.review', id: o.id, status: 'rejected' })}
                    >
                      {tr('Verwerfen')}
                    </Button>
                  )}
                  {o.status !== 'approved' && (
                    <Button
                      className="approve"
                      disabled={busy}
                      onClick={() => act({ type: 'outcome.review', id: o.id, status: 'approved' })}
                    >
                      <Check size={16} />
                      {tr('Wortlaut bestätigen')}
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
                    {tr('Export mit roleALPHA abgleichen')}
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
              <h2>{tr('Transkript')}</h2>
              <span className="pill">
                {m.transcript.length} {tr('Segmente')}
              </span>
            </div>
            <p className="muted">
              {tr('Teams-VTT, TXT oder Text mit Zeitmarken. Die Originalaufnahme bleibt bei Microsoft.')}
            </p>
            {editable && (
              <>
                <label className="upload">
                  <Upload size={18} />
                  <span>{tr('Datei auswählen (.vtt / .txt)')}</span>
                  <input
                    type="file"
                    accept=".vtt,.txt,text/plain,text/vtt"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f)
                        run(async () => {
                          if (f.size > 1_000_000) throw new Error(tr('Maximal 1 MB pro Transkript.'));
                          setRaw(await f.text());
                        });
                    }}
                  />
                </label>
                <textarea
                  aria-label={tr('Transkripttext')}
                  rows={8}
                  value={raw}
                  onChange={e => setRaw(e.target.value)}
                  placeholder={tr('Transkript hier einfügen …')}
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
                    {tr('Importieren')}
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
                      ? tr('Bereits ausgewertet')
                      : tr('Ergebnisse analysieren')}
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
              {tr('Teams-Verknüpfung')}
            </h3>
            <>
              <p>
                {tr(
                  'Transkripte werden auf Knopfdruck über dein Microsoft-Konto geladen. Alternativ eine VTT- oder Textdatei importieren.',
                )}
              </p>
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
                  {tr('Transkript jetzt abrufen')}
                </Button>
              )}
            </>
            <div className="connection-status">
              <span className={`dot ${integrations.ai ? 'on' : ''}`} />
              {tr('KI')} {integrations.ai ? tr('konfiguriert') : tr('nicht konfiguriert')}
            </div>
            <div className="connection-status">
              <span className={`dot ${integrations.graph ? 'on' : ''}`} />
              {tr('Microsoft Graph')} {integrations.graph ? tr('konfiguriert') : tr('nicht konfiguriert')}
            </div>
          </aside>
        </div>
      )}
      {tab === 'history' && (
        <section className="history">
          <h2>{tr('Nachvollziehbarer Verlauf')}</h2>
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
        <Modal title={`${entityPreview.plan.label} ${tr('in roleALPHA anlegen')}`} close={() => setEntityPreview(null)}>
          <p>
            {tr(
              'Der bestätigte Wortlaut wird als neuer Entwurf angelegt. Die bestehende Spannung bleibt in der Meeting-App.',
            )}
          </p>
          <h3>{m.outcomes.find(o => o.id === entityPreview.outcomeId)?.title}</h3>
          <p className="preserve">{m.outcomes.find(o => o.id === entityPreview.outcomeId)?.description}</p>
          <p>
            {tr('Verantwortlich:')} {m.outcomes.find(o => o.id === entityPreview.outcomeId)?.owner || tr('Offen')}
          </p>
          <p className="small muted">
            {tr('Zugehörige Transkriptbelege und der Bestätigungsnachweis werden mit übertragen.')}
          </p>
          <div className="modal-footer">
            <Button onClick={() => setEntityPreview(null)}>{tr('Abbrechen')}</Button>
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
              {tr('Geprüften Entwurf anlegen')}
            </Button>
          </div>
        </Modal>
      )}
      {confirmExport && (
        <Modal title={tr('Bestätigte Ergebnisse übertragen')} close={() => setConfirmExport(false)}>
          <p>
            {tr('Diese')} {approved.length} {tr('Ergebnisse werden einschließlich ihrer Transkriptbelege als')}{' '}
            <strong>{tr('Meeting-Entwurf')}</strong> {tr('nach roleALPHA übertragen.')}
          </p>
          <ul>
            {approved.map(o => (
              <li key={o.id}>{o.title}</li>
            ))}
          </ul>
          <p>
            {tr(
              'Rollen und Policies werden dadurch noch nicht verändert. Der Entwurf wird in roleALPHA weiterbearbeitet und freigegeben.',
            )}
          </p>
          <div className="modal-footer">
            <Button onClick={() => setConfirmExport(false)}>{tr('Abbrechen')}</Button>
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
              {tr('Entwurf übertragen')}
            </Button>
          </div>
        </Modal>
      )}
      {reconcile && (
        <Modal title={tr('Export abgleichen')} close={() => setReconcile(null)}>
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
            <p>
              {tr(
                'Prüfe zuerst den Entwurfsbereich in roleALPHA. Nur wenn dort kein Entwurf angelegt wurde, darf die Übertragung erneut freigegeben werden.',
              )}
            </p>
            <Field label={tr('Prüfergebnis')}>
              <select value={resolution} onChange={e => setResolution(e.target.value)}>
                <option value="created">{tr('Entwurf existiert')}</option>
                <option value="not-created">{tr('Kein Entwurf angelegt – erneut erlauben')}</option>
              </select>
            </Field>
            {resolution === 'created' && (
              <Field label={tr('Entwurf-ID')}>
                <input required value={draftId} onChange={e => setDraftId(e.target.value)} />
              </Field>
            )}
            <Field label={tr('Prüfnotiz')}>
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
                {tr('Abgleich dokumentieren')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {transcriptPreview && (
        <Modal title={tr('Transkript aus Teams importieren')} close={() => setTranscriptPreview(null)}>
          {transcriptPreview.parts.length ? (
            <>
              <p>
                {tr(
                  'Diese Transkriptteile wurden während dieses Termins aufgezeichnet. Bei Serienterminen werden Teile anderer Durchführungen ausgeschlossen.',
                )}
              </p>
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
            <p className="notice">
              {tr(
                'Für diesen Termin wurde kein Transkript gefunden. Du kannst eine VTT- oder Textdatei manuell importieren.',
              )}
            </p>
          )}
          {transcriptPreview.excluded > 0 && (
            <p className="small muted">
              {transcriptPreview.excluded} {tr('Transkriptteile anderer Termine wurden ausgeschlossen.')}
            </p>
          )}
          <div className="modal-footer">
            <Button onClick={() => setTranscriptPreview(null)}>{tr('Abbrechen')}</Button>
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
              {tr('Importieren')}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
