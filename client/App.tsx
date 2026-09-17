import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  LayoutTemplate,
  ListChecks,
  Loader2,
  Plus,
  Settings2,
  Trash2,
  Video,
  X,
  WandSparkles,
  Send,
  Circle,
} from 'lucide-react';
import { type Bootstrap, type Template, type Meeting, type MeetingSummary } from '../shared/model';
import { summarize } from '../shared/meeting-store';
import { useApi } from './api-context';
import { Tensions } from './Tensions';
import { GovernanceAssistant } from './GovernanceAssistant';
import { Preferences } from './Preferences';
import { t as tr, errorText, language, usePreferences } from './i18n';
import type { MessageId } from '../shared/i18n';

type SettingsCard = {
  title: MessageId;
  icon: React.ReactNode;
  ready: boolean;
  value: MessageId;
  description: MessageId;
};
import { Button, Modal } from './ui';
import { aiProviderLabels, categoryLabels } from './labels';
import { statusLabels } from './labels';
import { TemplateEditor } from './TemplateEditor';
import { CreateMeeting } from './CreateMeeting';
import { MeetingRoom } from './MeetingRoom';
import { StorageMaintenance } from './StorageMaintenance';
import { TeamsRecordingSettings } from './TeamsRecordingSettings';

export function App() {
  const api = useApi();
  const { request, initializeTeams } = api;
  usePreferences();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [view, setView] = useState('meetings');
  const [selected, setSelected] = useState<string | null>(
    api.initialMeeting || new URLSearchParams(location.search).get('raMeeting'),
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Template | 'new' | null>(null);
  const [create, setCreate] = useState(false);
  const [remove, setRemove] = useState<Template | null>(null);
  const [teams, setTeams] = useState(false);
  const busyRef = useRef(false);
  const load = async () => {
    const d = await request<Bootstrap>('/bootstrap');
    setData(d);
    return d;
  };
  useEffect(() => {
    void (async () => {
      setTeams(await initializeTeams());
      await load();
    })().catch(e => setError(errorText(e)));
  }, []);
  const run = (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    void task()
      .catch(async e => {
        setError(errorText(e));
        try {
          await load();
        } catch {
          /* Keep original error. */
        }
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  };
  // The overview holds summaries; the open meeting is loaded with its transcript.
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const update = (m: Meeting) => {
    setData(d => (d ? { ...d, meetings: d.meetings.map(old => (old.id === m.id ? summarize(m) : old)) } : d));
    setMeeting(current => (current && current.id !== m.id ? current : m));
  };
  useEffect(() => {
    setMeeting(null);
    if (!selected) return;
    let alive = true;
    void request<Meeting>(`/meetings/${selected}`)
      .then(m => {
        if (alive) update(m);
      })
      .catch(e => {
        if (alive) setError(errorText(e));
      });
    return () => {
      alive = false;
    };
  }, [selected]);
  // Refresh the shared SharePoint meeting while this view is open.
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => {
      if (!busyRef.current)
        void request<Meeting>(`/meetings/${selected}`)
          .then(update)
          .catch(() => {});
    }, 10_000);
    return () => clearInterval(timer);
  }, [selected]);
  const back = () => {
    setSelected(null);
    const u = new URL(location.href);
    u.searchParams.delete('raMeeting');
    history.replaceState(null, '', u);
  };
  const open = (m: MeetingSummary) => {
    setSelected(m.id);
    setView('meetings');
    const u = new URL(location.href);
    u.searchParams.set('raMeeting', m.id);
    history.replaceState(null, '', u);
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            r<span>A</span>
          </div>
          <div>
            role<span>ALPHA</span>
            <small>{tr('app.meetings')}</small>
          </div>
        </div>
        <nav>
          <button
            className={view === 'meetings' ? 'active' : ''}
            onClick={() => {
              back();
              setView('meetings');
            }}
          >
            <Video size={19} />
            {tr('app.meetings2')}
          </button>
          <button
            className={view === 'tensions' ? 'active' : ''}
            onClick={() => {
              back();
              setView('tensions');
            }}
          >
            <ListChecks size={19} />
            {tr('app.tensions')}
          </button>
          <button
            className={view === 'templates' ? 'active' : ''}
            onClick={() => {
              back();
              setView('templates');
            }}
          >
            <LayoutTemplate size={19} />
            {tr('app.templates')}
          </button>
          <button
            className={view === 'governance' ? 'active' : ''}
            onClick={() => {
              back();
              setView('governance');
            }}
          >
            <WandSparkles size={19} />
            {tr('app.askGovernance')}
          </button>
          <button
            className={view === 'settings' ? 'active' : ''}
            onClick={() => {
              back();
              setView('settings');
            }}
          >
            <Settings2 size={19} />
            {tr('app.connections')}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-label">{tr('app.movingForwardTogether')}</div>
          <p>
            {tr('app.clearProcesses')}
            <br />
            {tr('app.agreedOutcomes')}
          </p>
          <div className="user">
            <div className="avatar">{data?.actor.name.slice(0, 1) || '…'}</div>
            <div>
              <strong>{data?.actor.name || tr('app.sign')}</strong>
              <small>{tr(data?.actor.workspace === 'write' ? 'app.editor' : 'app.readAccess')}</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            {tr('app.workspace')}
            <ChevronRight size={14} />
            <span>
              {view === 'tensions'
                ? tr('app.tensionBacklog')
                : view === 'templates'
                  ? tr('app.meetingTemplates')
                  : view === 'settings'
                    ? tr('app.connections')
                    : view === 'governance'
                      ? tr('app.askGovernance')
                      : tr('app.meetings2')}
            </span>
          </div>
          <div className="topbar-right">
            <Preferences />
            {busy && <Loader2 size={17} className="spin" />}
            {teams && (
              <span className="pill">
                <Video size={14} />
                {tr('app.microsoftTeams')}
              </span>
            )}
          </div>
        </header>
        <div className="page">
          {data?.actor.workspace && <p className="notice">{tr('app.workspaceVisibleAllAuthorized')}</p>}
          {error && (
            <div role="alert" className="error">
              <span>{error}</span>
              <Button className="icon" aria-label={tr('app.dismissError')} onClick={() => setError('')}>
                <X size={18} />
              </Button>
            </div>
          )}
          {!data && (
            <div className="empty">
              {!error && <Loader2 className="spin" size={26} />}
              <h2>{error ? tr('app.connectionRequired') : tr('app.loadingWorkspace')}</h2>
              {error && <p>{tr('app.entraSignOpenApp')}</p>}
            </div>
          )}
          {data && selected && !meeting && view === 'meetings' && (
            <>
              <button className="back" onClick={back}>
                {tr('app.allMeetings')}
              </button>
              <p>
                <Loader2 size={16} className="spin" /> {tr('app.loadingMeeting')}
              </p>
            </>
          )}
          {data && meeting && view === 'meetings' && (
            <>
              <button className="back" onClick={back}>
                {tr('app.allMeetings')}
              </button>
              <MeetingRoom
                key={meeting.id}
                meeting={meeting}
                actor={data.actor}
                integrations={data.integrations}
                update={update}
                busy={busy}
                run={run}
              />
            </>
          )}
          {data && !selected && view === 'meetings' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{tr('app.spaceCollaboration')}</div>
                  <h1>{tr('app.ourMeetings')}</h1>
                  <p>{tr('app.addressTensionsRecordDecisions')}</p>
                </div>
                <Button
                  className="primary"
                  onClick={() => setCreate(true)}
                  disabled={data.actor.workspace === 'read' || !data.templates.some(t => t.enabled)}
                >
                  <Plus size={18} />
                  {tr('app.createMeeting')}
                </Button>
              </div>
              <div className="stats">
                <div>
                  <span>
                    {data.meetings
                      .filter(m => m.status === 'active')
                      .length.toString()
                      .padStart(2, '0')}
                  </span>
                  <p>{tr('app.activeMeetings')}</p>
                </div>
                <div>
                  <span>
                    {data.meetings
                      .filter(m => m.status === 'scheduled')
                      .length.toString()
                      .padStart(2, '0')}
                  </span>
                  <p>{tr('app.scheduledMeetings')}</p>
                </div>
                <div>
                  <span>
                    {data.meetings
                      .reduce((n, m) => n + m.outcomes.filter(o => o.status === 'proposed').length, 0)
                      .toString()
                      .padStart(2, '0')}
                  </span>
                  <p>{tr('app.outcomesReview')}</p>
                </div>
              </div>
              <div className="section-heading">
                <h2>{tr('app.meetingOverview')}</h2>
                <span className="small muted">
                  {data.meetings.length} {tr('app.meetings2')}
                </span>
              </div>
              {!data.meetings.length && (
                <div className="empty first-meeting">
                  <div className="empty-symbol">
                    <Video size={30} />
                  </div>
                  <h2>{tr('app.goodProcessMakesDifference')}</h2>
                  <p>
                    {tr('app.startTacticalGovernanceOwn')}
                    <br />
                    {tr('app.teamProvidesContent')}
                  </p>
                  <Button
                    className="primary"
                    onClick={() => setCreate(true)}
                    disabled={data.actor.workspace === 'read' || !data.templates.some(t => t.enabled)}
                  >
                    <Plus size={17} />
                    {tr('app.createFirstMeeting')}
                  </Button>
                  <button className="text-button" onClick={() => setView('templates')}>
                    {tr('app.exploreTemplatesFirst')}
                    <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <div className="meeting-list">
                {[...data.meetings]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map(m => (
                    <button className="meeting-row" key={m.id} onClick={() => open(m)}>
                      <div className={`meeting-icon ${m.template.category}`}>
                        <Video size={22} />
                      </div>
                      <div className="meeting-title">
                        <strong>{m.title}</strong>
                        <span>
                          {m.circle} · {m.template.name}
                        </span>
                      </div>
                      <span className="meeting-date">
                        {new Date(m.scheduledAt || m.createdAt).toLocaleDateString(language(), {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                      <span className={`pill ${m.status === 'active' ? 'green' : ''}`}>
                        {tr(statusLabels[m.status])}
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
              </div>
            </>
          )}
          {data && view === 'tensions' && <Tensions data={data} run={run} refresh={load} />}
          {data && view === 'templates' && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{tr('app.structureFitsTeam')}</div>
                  <h1>{tr('app.meetingTemplates')}</h1>
                  <p>{tr('app.provenStartingPointAdapt')}</p>
                </div>
                {data.actor.workspace === 'write' && (
                  <Button className="primary" onClick={() => setEditor('new')}>
                    <Plus size={18} />
                    {tr('app.newTemplate')}
                  </Button>
                )}
              </div>
              <div className="template-grid">
                {data.templates.map(t => (
                  <article className={`template-card ${!t.enabled ? 'disabled-template' : ''}`} key={t.id}>
                    <div className="template-card-top">
                      <span className={`template-icon ${t.category}`}>
                        <LayoutTemplate size={22} />
                      </span>
                      <span className="pill">{tr(categoryLabels[t.category])}</span>
                      <span className={`availability ${t.enabled ? 'enabled' : ''}`}>
                        {t.enabled ? tr('app.active') : tr('app.inactive')}
                      </span>
                    </div>
                    <h2>{t.name}</h2>
                    <p>{t.description}</p>
                    <div className="template-metrics">
                      <span>
                        <ListChecks size={15} />
                        {t.steps.length} {tr('app.steps')}
                      </span>
                      <span>
                        <Clock3 size={15} />
                        {t.steps.reduce((n, s) => n + s.minutes, 0)} {tr('app.min')}
                      </span>
                      <span>v{t.version}</span>
                    </div>
                    <ol className="template-steps">
                      {t.steps.map(s => (
                        <li key={s.id}>
                          {s.title}
                          <span>{s.minutes}′</span>
                        </li>
                      ))}
                    </ol>
                    {data.actor.workspace === 'write' && (
                      <div className="template-footer">
                        <Button onClick={() => setEditor(t)}>
                          <Settings2 size={15} />
                          {tr('app.edit')}
                        </Button>
                        <Button
                          className="icon"
                          aria-label={`${t.name} ${tr('app.duplicate')} `}
                          onClick={() =>
                            run(async () => {
                              await request('/templates', { ...t, name: `${t.name} (${tr('app.copy')})` });
                              await load();
                            })
                          }
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          className="icon"
                          aria-label={`${t.name} ${t.enabled ? tr('app.disable') : tr('app.enable')}`}
                          onClick={() =>
                            run(async () => {
                              await request(`/templates/${t.id}`, { ...t, enabled: !t.enabled }, 'PUT');
                              await load();
                            })
                          }
                        >
                          {t.enabled ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                        </Button>
                        <Button
                          className="icon danger"
                          aria-label={`${t.name} ${tr('app.delete')} `}
                          onClick={() => setRemove(t)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
          {data && view === 'governance' && <GovernanceAssistant enabled={!!data.integrations.governance} />}
          {data && view === 'settings' && (
            <>
              {api.openSetup && (
                <button className="button" onClick={api.openSetup}>
                  {tr('app.openSetupWizard')}
                </button>
              )}
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{tr('app.dataIntegrations')}</div>
                  <h1>{tr('app.connections')}</h1>
                  <p>{tr('app.signThroughMicrosoft365')}</p>
                </div>
              </div>
              <div className="settings-grid">
                {(
                  [
                    {
                      title: 'app.dataStorage',
                      icon: <FileText size={22} />,
                      ready: data.integrations.storage === 'sharepoint',
                      value: 'app.sharepointMicrosoft365',
                      description: 'app.templatesTensionsMeetingsOutcomes',
                    },
                    {
                      title: 'app.microsoftTeams',
                      icon: <Video size={22} />,
                      ready: data.integrations.graph,
                      value: data.integrations.graph ? 'app.graphConfigured' : 'app.connectedYet',
                      description: 'app.linkCalendarEventsFetch',
                    },
                    {
                      title: 'app.aiAnalysis',
                      icon: <WandSparkles size={22} />,
                      ready: data.integrations.ai,
                      value: data.integrations.aiProvider
                        ? aiProviderLabels[data.integrations.aiProvider]
                        : data.integrations.ai
                          ? 'app.endpointConfigured'
                          : 'app.connectedYet',
                      description: 'app.outcomeSuggestionsTranscriptSources',
                    },
                    {
                      title: 'app.rolealphaOptional',
                      icon: <Send size={22} />,
                      ready:
                        data.integrations.mcp ||
                        data.integrations.entityTypes.length > 0 ||
                        !!data.integrations.governance,
                      value:
                        data.integrations.mcp ||
                        data.integrations.entityTypes.length > 0 ||
                        !!data.integrations.governance
                          ? 'app.mcpConfigured'
                          : 'app.setUpOptional',
                      description: 'app.optionallySendConfirmedOutcomes',
                    },
                  ] satisfies SettingsCard[]
                ).map(s => (
                  <section className="integration-card" key={s.title}>
                    <div className="connection-icon">{s.icon}</div>
                    <h2>{tr(s.title)}</h2>
                    <div className="connection-status">
                      <span className={`dot ${s.ready ? 'on' : ''}`} />
                      {tr(s.value)}
                    </div>
                    <p>{tr(s.description)}</p>
                  </section>
                ))}
              </div>
              <p className="notice">{tr('app.configuredMeansRequiredSettings')}</p>
              <div className="settings-grid">
                <TeamsRecordingSettings
                  key={data.settings.version}
                  settings={data.settings}
                  canManage={data.canManageWorkspace}
                  busy={busy}
                  run={run}
                  reload={load}
                />
                {data.actor.workspace === 'write' && <StorageMaintenance busy={busy} run={run} />}
              </div>
            </>
          )}
        </div>
      </main>
      {editor && (
        <TemplateEditor
          template={editor === 'new' ? undefined : editor}
          close={() => setEditor(null)}
          busy={busy}
          save={(input, id, version) =>
            run(async () => {
              await request(id ? `/templates/${id}` : '/templates', { ...input, version }, id ? 'PUT' : 'POST');
              await load();
              setEditor(null);
            })
          }
        />
      )}
      {create && data && (
        <CreateMeeting
          templates={data.templates}
          busy={busy}
          close={() => setCreate(false)}
          save={body =>
            run(async () => {
              const m = await request<Meeting>('/meetings', body);
              await load();
              setCreate(false);
              open(summarize(m));
            })
          }
        />
      )}
      {remove && (
        <Modal title={tr('app.deleteTemplate')} close={() => setRemove(null)}>
          <p>
            „{remove.name}
            {tr('app.willRemovedTemplateLibrary')}
          </p>
          <div className="modal-footer">
            <Button onClick={() => setRemove(null)}>{tr('app.cancel')}</Button>
            <Button
              className="danger-solid"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await request(`/templates/${remove.id}`, { version: remove.version }, 'DELETE');
                  await load();
                  setRemove(null);
                })
              }
            >
              {tr('app.deleteTemplate2')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
