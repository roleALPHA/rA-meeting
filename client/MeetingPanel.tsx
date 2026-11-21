import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Send, Sparkles } from 'lucide-react';
import type {
  Circle,
  EntityHit,
  EntityProposal,
  EntityTypeSchema,
  ExistingEntity,
  Proposal,
  RalphReply,
  Scenario,
  Submission,
} from '../shared/meeting';
import type { Bootstrap } from './browser/api';
import type { CircleResult } from './browser/circles';
import { graphResource, graphScopes } from './browser/consent';
import { roleAlphaEnvironment } from './browser/rolealpha-environment';
import { useApi } from './api-context';
import { BrandMark } from './BrandMark';
import { errorText, language, t, usePreferences } from './i18n';
import { Preferences } from './Preferences';
import { Button, Field, Modal, ReportAiContent } from './ui';

/** Runs one user action at a time and turns its failure into a message. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // An action may end by replacing the component that started it, for example on submit.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);
  return { busy, error, run, setError };
}

function ErrorLine({ text }: { text: string }) {
  return text ? (
    <p className="error" role="alert">
      {text}
    </p>
  ) : null;
}

export function MeetingPanel() {
  usePreferences();
  const api = useApi();
  const [state, setState] = useState<Bootstrap | null>(null);
  const { busy, error, run } = useAction();
  const load = useCallback(() => run(async () => setState(await api.bootstrap())), [api, run]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="panel">
      <header className="panel-head">
        <div className="brand">
          <BrandMark className="brand-mark" label="roleALPHA" />
          <strong>roleALPHA Sessions</strong>
        </div>
        <Preferences />
      </header>
      <ErrorLine text={error} />
      {!state && busy && <p className="muted">{t('panel.loading')}</p>}
      {!state && !busy && error && <Button onClick={() => void load()}>{t('startup.tryAgain')}</Button>}
      {state && <Content state={state} setState={setState} reload={load} />}
    </main>
  );
}

function Content({
  state,
  setState,
  reload,
}: {
  state: Bootstrap;
  setState: (s: Bootstrap) => void;
  reload: () => Promise<void>;
}) {
  const api = useApi();
  const { busy, error, run } = useAction();
  const { connection } = state;
  if (connection.status === 'unavailable') {
    const consent =
      connection.error === 'error.integrations.rolealphaAccessNotEnabled'
        ? api.adminConsent(roleAlphaEnvironment.resource, [roleAlphaEnvironment.scope])
        : null;
    return (
      <section className="block">
        <h2>{t('panel.connectionTitle')}</h2>
        <p>{t(connection.error)}</p>
        {consent && (
          <p className="small">
            {t('panel.adminConsentHint')}{' '}
            <a href={consent} target="_blank" rel="noreferrer">
              {t('panel.adminConsentLink')}
            </a>
          </p>
        )}
        <Button onClick={() => void reload()}>{t('startup.tryAgain')}</Button>
      </section>
    );
  }
  if (connection.status === 'choose')
    return (
      <section className="block">
        <h2>{t('panel.chooseOrganisation')}</h2>
        <ErrorLine text={error} />
        <ul className="list">
          {connection.organisations.map(o => (
            <li key={o.uuid}>
              <span>{o.name}</span>
              <Button disabled={busy} onClick={() => run(async () => setState(await api.chooseOrganisation(o.uuid)))}>
                {t('panel.choose')}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    );
  if (!state.meeting) return <OutsideMeeting state={state} />;
  if (!state.scenario)
    return (
      <>
        <MeetingHeading title={state.meeting.title} />
        <CirclePicker onOpened={scenario => setState({ ...state, scenario })} />
      </>
    );
  return (
    <Workspace
      title={state.meeting.title}
      scenario={state.scenario}
      setScenario={scenario => setState({ ...state, scenario })}
    />
  );
}

function MeetingHeading({ title }: { title: string }) {
  return <h1 className="meeting-title">{title || t('panel.untitledMeeting')}</h1>;
}

function OutsideMeeting({ state }: { state: Bootstrap }) {
  const graphConsent = useApi().adminConsent(graphResource, graphScopes);
  return (
    <>
      <section className="block">
        <h2>{t('panel.openInMeetingTitle')}</h2>
        <p>{t(state.isTeams ? 'panel.openInMeetingTeams' : 'panel.openInMeeting')}</p>
        {graphConsent && (
          <p className="small muted">
            {t('panel.graphConsentHint')}{' '}
            <a href={graphConsent} target="_blank" rel="noreferrer">
              {t('panel.adminConsentLink')}
            </a>
          </p>
        )}
      </section>
      {state.myScenarios.length > 0 && (
        <section className="block">
          <h2>{t('panel.myOpenMeetings')}</h2>
          <ul className="list">
            {state.myScenarios.map(s => (
              <li key={s.scenarioId}>
                <span>
                  {s.name || t('panel.untitledMeeting')}
                  <br />
                  <span className="small muted">
                    {t('panel.draftCount', { count: s.drafts.length })}
                    {s.circle ? ` · ${s.circle.name}` : ''}
                  </span>
                </span>
                {s.url && <RoleAlphaLink url={s.url} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function RoleAlphaLink({ url, label }: { url: string; label?: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="small">
      {label ?? t('panel.openInRolealpha')} <ExternalLink size={12} aria-hidden />
    </a>
  );
}

/** Searches circles and teams in roleALPHA as the user types and starts the meeting's scenario with the choice. */
function CirclePicker({ onOpened, cancel }: { onOpened: (s: Scenario) => void; cancel?: () => void }) {
  const api = useApi();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CircleResult[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);
  const latest = useRef(0);
  const { busy, error, run } = useAction();
  useEffect(() => {
    const call = ++latest.current;
    const timer = setTimeout(() => {
      api.searchCircles(query.trim()).then(
        found => {
          if (call !== latest.current) return;
          setResults(found);
          setSearchFailed(false);
        },
        () => call === latest.current && setSearchFailed(true),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [api, query]);
  const choose = (circle: Circle) => run(async () => onOpened(await api.openScenario(circle)));
  return (
    <section className="block">
      <h2>{t('panel.whichCircle')}</h2>
      <p className="small muted">{t('panel.whichCircleHint')}</p>
      <Field label={t('meetings.circleTeam')}>
        <input
          type="search"
          value={query}
          autoComplete="off"
          placeholder={t('meetings.productCircle')}
          onChange={e => setQuery(e.target.value)}
        />
      </Field>
      {searchFailed && <p className="small muted">{t('meetings.circleSuggestionsUnavailable')}</p>}
      <ErrorLine text={error} />
      <ul className="list">
        {results.map(c => (
          <li key={c.id}>
            <span>
              {c.name}
              <br />
              <span className="small muted">
                {t(c.kind === 'unit' ? 'meetings.circleKindUnit' : 'meetings.circleKindRole')}
              </span>
            </span>
            <Button disabled={busy} onClick={() => void choose({ uuid: c.id, name: c.name })}>
              {t('panel.choose')}
            </Button>
          </li>
        ))}
      </ul>
      {cancel && (
        <div className="actions">
          <Button onClick={cancel}>{t('panel.cancel')}</Button>
        </div>
      )}
    </section>
  );
}

function Workspace({
  title,
  scenario,
  setScenario,
}: {
  title: string;
  scenario: Scenario;
  setScenario: (s: Scenario | null) => void;
}) {
  const [changingCircle, setChangingCircle] = useState(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  if (submitted) return <Submitted result={submitted} title={title} />;
  return (
    <>
      <MeetingHeading title={title} />
      <div className="circle-line">
        <span className="pill">{scenario.circle?.name ?? t('panel.noCircle')}</span>
        <button className="text-button" onClick={() => setChangingCircle(true)}>
          {t('panel.changeCircle')}
        </button>
      </div>
      {changingCircle && (
        <CirclePicker
          onOpened={s => {
            setScenario(s);
            setChangingCircle(false);
          }}
          cancel={() => setChangingCircle(false)}
        />
      )}
      <Capture setScenario={setScenario} />
      <EditExisting setScenario={setScenario} />
      <AskRalph />
      <Drafts scenario={scenario} setScenario={setScenario} onSubmitted={setSubmitted} />
    </>
  );
}

/** rALPH's text, the entries it named and the note that this is AI output. */
function RalphText({ reply }: { reply: RalphReply }) {
  return (
    <>
      {reply.answer && <p className="answer">{reply.answer}</p>}
      {reply.entities.length > 0 && (
        <div className="links">
          {reply.entities.map(e => (
            <RoleAlphaLink key={e.url} url={e.url} label={e.name} />
          ))}
        </div>
      )}
      <p className="small muted">
        {t('panel.ralphGenerated')} <ReportAiContent />
      </p>
    </>
  );
}

/** One agenda item: a short note, rALPH's proposals, and the ones the user adopts as drafts. */
function Capture({ setScenario }: { setScenario: (s: Scenario) => void }) {
  const api = useApi();
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [reply, setReply] = useState<RalphReply | null>(null);
  const [items, setItems] = useState<{ proposal: Proposal; selected: boolean; result?: string }[]>([]);
  const [adopted, setAdopted] = useState('');
  const { busy, error, run } = useAction();
  const propose = () =>
    run(async () => {
      setAdopted('');
      const answer = await api.propose({ topic, note }, language());
      setReply(answer);
      setItems(answer.proposals.map(proposal => ({ proposal, selected: true })));
    });
  const adopt = () =>
    run(async () => {
      const chosen = items.filter(i => i.selected && !i.result);
      const outcome = await api.adopt(chosen.map(i => i.proposal));
      setScenario(outcome.scenario);
      let failed = 0;
      const results = new Map(chosen.map((item, index) => [item, outcome.results[index]]));
      setItems(
        items.map(item => {
          const result = results.get(item);
          if (!result) return item;
          if ('error' in result) {
            failed++;
            return { ...item, result: t(result.error) };
          }
          return { ...item, result: 'done', selected: false };
        }),
      );
      setAdopted(failed ? t('panel.adoptedPartly', { failed }) : t('panel.adopted'));
      if (!failed) {
        setTopic('');
        setNote('');
      }
    });
  const open = items.filter(i => i.selected && !i.result).length;
  return (
    <section className="block">
      <h2>{t('panel.captureTitle')}</h2>
      <Field label={t('panel.topic')}>
        <input value={topic} maxLength={200} onChange={e => setTopic(e.target.value)} />
      </Field>
      <Field label={t('panel.note')}>
        <textarea
          value={note}
          maxLength={3500}
          placeholder={t('panel.notePlaceholder')}
          onChange={e => setNote(e.target.value)}
        />
      </Field>
      <div className="actions">
        <Button className="primary" disabled={busy || note.trim().length < 3} onClick={() => void propose()}>
          {busy ? <Loader2 className="spin" aria-hidden /> : <Sparkles aria-hidden />}
          {t('panel.proposeWithRalph')}
        </Button>
      </div>
      <ErrorLine text={error} />
      {reply && (
        <div>
          <RalphText reply={reply} />
          {items.length === 0 && <p className="small muted">{t('panel.noProposals')}</p>}
          {items.map((item, index) => (
            <ProposalCard
              key={index}
              item={item}
              toggle={() => setItems(items.map((it, i) => (i === index ? { ...it, selected: !it.selected } : it)))}
              change={proposal => setItems(items.map((it, i) => (i === index ? { ...it, proposal } : it)))}
            />
          ))}
          {(open > 0 || adopted) && (
            <div className="actions">
              {open > 0 && (
                <Button className="primary" disabled={busy} onClick={() => void adopt()}>
                  {t('panel.adoptSelected', { count: open })}
                </Button>
              )}
              {adopted && <span className="small">{adopted}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ProposalCard({
  item,
  toggle,
  change,
}: {
  item: { proposal: Proposal; selected: boolean; result?: string };
  toggle: () => void;
  change: (p: Proposal) => void;
}) {
  const { proposal, selected, result } = item;
  const done = result === 'done';
  const locked = !!result;
  const kind =
    proposal.kind === 'relationship'
      ? t('panel.kindRelationship')
      : proposal.action === 'update'
        ? t('panel.kindChange')
        : t('panel.kindNew');
  return (
    <div className={`proposal${selected && !locked ? ' selected' : ''}`}>
      <div className="proposal-head">
        <input
          type="checkbox"
          checked={selected && !locked}
          disabled={locked}
          aria-label={t('panel.adoptThis')}
          onChange={toggle}
        />
        <strong>
          {proposal.kind === 'entity'
            ? proposal.name
            : `${proposal.sourceLabel ?? proposal.sourceRef ?? '?'} → ${proposal.targetLabel ?? proposal.targetRef ?? '?'}`}
        </strong>
        <span className="pill">{kind}</span>
      </div>
      {proposal.kind === 'relationship' && proposal.relTypeName && (
        <p className="small muted">{proposal.relTypeName}</p>
      )}
      {proposal.rationale && <p className="small muted">{proposal.rationale}</p>}
      {proposal.kind === 'entity' && !locked && <EntityFields proposal={proposal} change={change} />}
      {result && (
        <p className={`small status ${done ? 'done' : 'failed'}`} role="status">
          {done ? t('panel.draftCreated') : result}
        </p>
      )}
    </div>
  );
}

const schemaCache = new Map<string, Promise<EntityTypeSchema>>();

/**
 * The proposal's fields, editable as the entity type's schema describes them. With `current` (an existing entry the
 * user picked) every field shows its current value, and only the values that differ from it end up in the proposal.
 */
function EntityFields({
  proposal,
  change,
  current,
}: {
  proposal: EntityProposal;
  change: (p: Proposal) => void;
  current?: Record<string, unknown>;
}) {
  const api = useApi();
  const [schema, setSchema] = useState<EntityTypeSchema | null>(null);
  useEffect(() => {
    let alive = true;
    let pending = schemaCache.get(proposal.entityType);
    if (!pending) {
      pending = api.describe(proposal.entityType);
      schemaCache.set(proposal.entityType, pending);
      pending.catch(() => schemaCache.delete(proposal.entityType));
    }
    pending.then(
      s => alive && setSchema(s),
      () => alive && setSchema(null),
    );
    return () => {
      alive = false;
    };
  }, [api, proposal.entityType]);
  const set = (name: string, value: unknown) => {
    const fields = { ...proposal.fields, [name]: value };
    // Back to the current value: no change for this field.
    if (current && sameValue(value, current[name])) delete fields[name];
    change({ ...proposal, fields });
  };
  // A new entry shows every required field; a proposed change shows only what it changes, the rest stays as it is;
  // an existing entry the user picked shows everything it has.
  const creating = proposal.action === 'create';
  const required = (name: string, flag: boolean) => creating && (flag || !!schema?.requiredFields.includes(name));
  const fields: EntityTypeSchema['fields'] = schema
    ? schema.fields.filter(f => !!current || required(f.name, f.required) || f.name in proposal.fields)
    : Object.keys({ ...current, ...proposal.fields }).map(name => ({ name, type: 'string', required: false }));
  return (
    <>
      <Field label={t('panel.name')}>
        <input value={proposal.name} maxLength={300} onChange={e => change({ ...proposal, name: e.target.value })} />
      </Field>
      {fields.map(field => {
        const value = field.name in proposal.fields ? proposal.fields[field.name] : current?.[field.name];
        const label = field.label || field.name;
        const allowed = field.allowedValues;
        const mark = required(field.name, field.required) ? ' *' : '';
        if (allowed?.length)
          return (
            <Field key={field.name} label={label + mark}>
              <select value={value == null ? '' : String(value)} onChange={e => set(field.name, e.target.value)}>
                <option value="" />
                {allowed.map(v => (
                  <option key={String(v)} value={String(v)}>
                    {String(v)}
                  </option>
                ))}
              </select>
            </Field>
          );
        if (field.type === 'array' || Array.isArray(value))
          return (
            <Field key={field.name} label={label + mark}>
              <textarea
                value={Array.isArray(value) ? value.map(String).join('\n') : ''}
                onChange={e =>
                  set(
                    field.name,
                    e.target.value.split('\n').filter(line => line.trim()),
                  )
                }
              />
              <small>{t('panel.onePerLine')}</small>
            </Field>
          );
        if (field.type === 'boolean')
          return (
            <label key={field.name} className="check">
              <input type="checkbox" checked={value === true} onChange={e => set(field.name, e.target.checked)} />
              {label}
            </label>
          );
        if (field.type === 'number' || field.type === 'integer')
          return (
            <Field key={field.name} label={label + mark}>
              <input
                type="number"
                value={typeof value === 'number' ? value : ''}
                onChange={e => set(field.name, e.target.value === '' ? null : Number(e.target.value))}
              />
            </Field>
          );
        if (value !== undefined && typeof value === 'object' && value !== null)
          return (
            <Field key={field.name} label={label}>
              <textarea readOnly value={JSON.stringify(value, null, 2)} />
            </Field>
          );
        return (
          <Field key={field.name} label={label + mark}>
            <textarea
              value={value == null ? '' : String(value)}
              rows={2}
              onChange={e => set(field.name, e.target.value)}
            />
          </Field>
        );
      })}
    </>
  );
}

function sameValue(a: unknown, b: unknown) {
  const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
  return (empty(a) && empty(b)) || JSON.stringify(a) === JSON.stringify(b);
}

/** Pick an existing entry in roleALPHA, change its fields and adopt the change as a draft of the meeting. */
function EditExisting({ setScenario }: { setScenario: (s: Scenario) => void }) {
  const api = useApi();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<EntityHit[] | null>(null);
  const [entity, setEntity] = useState<ExistingEntity | null>(null);
  const [proposal, setProposal] = useState<EntityProposal | null>(null);
  const [saved, setSaved] = useState('');
  const latest = useRef(0);
  const { busy, error, run, setError } = useAction();
  useEffect(() => {
    if (entity) return;
    const call = ++latest.current;
    if (query.trim().length < 2) {
      setHits(null);
      return;
    }
    const timer = setTimeout(() => {
      api.searchEntities(query).then(
        found => call === latest.current && (setHits(found), setError('')),
        e => call === latest.current && setError(errorText(e)),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [api, query, entity, setError]);
  const pick = (hit: EntityHit) =>
    run(async () => {
      setSaved('');
      const loaded = await api.loadEntity(hit.uuid);
      setEntity(loaded);
      setProposal({
        kind: 'entity',
        action: 'update',
        entityType: loaded.entityType,
        entityUuid: loaded.uuid,
        name: loaded.name || hit.name,
        fields: {},
        rationale: '',
      });
    });
  const close = () => {
    setEntity(null);
    setProposal(null);
  };
  const changed =
    !!entity && !!proposal && (Object.keys(proposal.fields).length > 0 || proposal.name.trim() !== entity.name);
  const save = () =>
    run(async () => {
      if (!proposal || !entity) return;
      const outcome = await api.adopt([{ ...proposal, name: proposal.name.trim() || entity.name }]);
      setScenario(outcome.scenario);
      const result = outcome.results[0];
      if (result && 'error' in result) {
        setError(t(result.error));
        return;
      }
      setSaved(t('panel.editSaved', { name: proposal.name.trim() || entity.name }));
      close();
      setQuery('');
    });
  return (
    <section className="block">
      <h2>{t('panel.editTitle')}</h2>
      {!entity || !proposal ? (
        <>
          <p className="small muted">{t('panel.editHint')}</p>
          <Field label={t('panel.editSearch')}>
            <input
              type="search"
              value={query}
              autoComplete="off"
              maxLength={200}
              onChange={e => setQuery(e.target.value)}
            />
          </Field>
          {saved && (
            <p className="small status done" role="status">
              {saved}
            </p>
          )}
          <ErrorLine text={error} />
          {hits && hits.length === 0 && <p className="small muted">{t('panel.editNoHits')}</p>}
          {hits && hits.length > 0 && (
            <ul className="list">
              {hits.map(hit => (
                <li key={hit.uuid}>
                  <span>
                    {hit.name}
                    <br />
                    <span className="small muted">{hit.entityTypeName}</span>
                  </span>
                  <Button disabled={busy} onClick={() => void pick(hit)}>
                    {t('panel.edit')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="proposal selected">
          <div className="proposal-head">
            <strong>{entity.name}</strong>
            <span className="pill">{t('panel.kindChange')}</span>
          </div>
          <p className="small muted">{entity.entityType}</p>
          <EntityFields proposal={proposal} change={p => setProposal(p as EntityProposal)} current={entity.values} />
          {!changed && <p className="small muted">{t('panel.editNothingChanged')}</p>}
          <ErrorLine text={error} />
          <div className="actions">
            <Button className="primary" disabled={busy || !changed} onClick={() => void save()}>
              {busy && <Loader2 className="spin" aria-hidden />}
              {t('panel.editSave')}
            </Button>
            <Button disabled={busy} onClick={close}>
              {t('panel.cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function AskRalph() {
  const api = useApi();
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<RalphReply | null>(null);
  const { busy, error, run } = useAction();
  return (
    <section className="block">
      <h2>{t('panel.askTitle')}</h2>
      <Field label={t('panel.question')}>
        <textarea value={question} maxLength={3500} rows={2} onChange={e => setQuestion(e.target.value)} />
      </Field>
      <div className="actions">
        <Button
          disabled={busy || question.trim().length < 3}
          onClick={() => void run(async () => setReply(await api.ask(question, language())))}
        >
          {busy ? <Loader2 className="spin" aria-hidden /> : <Sparkles aria-hidden />}
          {t('panel.ask')}
        </Button>
      </div>
      <ErrorLine text={error} />
      {reply && <RalphText reply={reply} />}
    </section>
  );
}

function Drafts({
  scenario,
  setScenario,
  onSubmitted,
}: {
  scenario: Scenario;
  setScenario: (s: Scenario | null) => void;
  onSubmitted: (s: Submission) => void;
}) {
  const api = useApi();
  const [confirming, setConfirming] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <section className="block">
      <h2>{t('panel.draftsTitle')}</h2>
      {scenario.drafts.length === 0 ? (
        <p className="small muted">{t('panel.noDrafts')}</p>
      ) : (
        <ul className="list">
          {scenario.drafts.map(d => (
            <li key={d.draftId}>
              <span>{d.entityType === 'relationship' ? t('panel.kindRelationship') : d.name || d.entityType}</span>
              <span className="small status">{d.status ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
      <ErrorLine text={error} />
      <div className="actions">
        <Button className="primary" disabled={busy || scenario.drafts.length === 0} onClick={() => setConfirming(true)}>
          {t('panel.submit')}
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const fresh = await api.refreshScenario();
              if (fresh) setScenario(fresh);
            })
          }
        >
          {t('panel.refresh')}
        </Button>
        {scenario.url && <RoleAlphaLink url={scenario.url} />}
      </div>
      {confirming && (
        <Modal title={t('panel.submitTitle')} close={() => setConfirming(false)}>
          <p>{t('panel.submitExplain')}</p>
          <div className="modal-footer">
            <Button onClick={() => setConfirming(false)}>{t('panel.cancel')}</Button>
            <Button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api.submit();
                  setConfirming(false);
                  onSubmitted(result);
                })
              }
            >
              {t('panel.submitConfirm')}
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** What happened on submit, and the message for the meeting chat, shown before it is sent. */
function Submitted({ result, title }: { result: Submission; title: string }) {
  const api = useApi();
  const voters = result.submitted?.voters.length ?? 0;
  const lines = [t('panel.chatIntro', { title: title || t('panel.untitledMeeting') })];
  if (result.published.length) lines.push(t('panel.chatPublished', { count: result.published.length }));
  if (result.submitted) lines.push(t('panel.chatVote', { count: voters }));
  const [text, setText] = useState(lines.join('\n'));
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();
  return (
    <section className="block">
      <h2>{t('panel.submittedTitle')}</h2>
      <ul className="list">
        <li>
          <span>{t('panel.publishedDirectly')}</span>
          <strong>{result.published.length}</strong>
        </li>
        <li>
          <span>{t('panel.inVote')}</span>
          <strong>{result.submitted ? t('panel.votersCount', { count: voters }) : '–'}</strong>
        </li>
      </ul>
      {result.unmatchedParticipants.length > 0 && (
        <p className="notice">{t('panel.unmatchedParticipants', { list: result.unmatchedParticipants.join(', ') })}</p>
      )}
      {result.url && (
        <p>
          <RoleAlphaLink url={result.url} />
        </p>
      )}
      <Field label={t('panel.chatMessage')}>
        <textarea value={text} maxLength={4000} onChange={e => setText(e.target.value)} />
      </Field>
      <ErrorLine text={error} />
      <div className="actions">
        <Button
          className="primary"
          disabled={busy || sent || !text.trim()}
          onClick={() =>
            void run(async () => {
              await api.share(text, result.url ? { label: t('panel.openInRolealpha'), url: result.url } : null);
              setSent(true);
            })
          }
        >
          <Send aria-hidden />
          {t('panel.shareInChat')}
        </Button>
        {sent && <span className="small status done">{t('panel.shared')}</span>}
      </div>
    </section>
  );
}
