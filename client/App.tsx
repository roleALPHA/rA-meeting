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
import { t as tr, language, usePreferences } from './i18n';
import { Button, Modal } from './ui';
import { categoryLabels } from './labels';
import { statusLabels } from './labels';
import { TemplateEditor } from './TemplateEditor';
import { CreateMeeting } from './CreateMeeting';
import { MeetingRoom } from './MeetingRoom';

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
    })().catch(e => setError(tr(e.message)));
  }, []);
  const run = (task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    void task()
      .catch(async e => {
        setError(tr(e.message));
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
        if (alive) setError(tr(e.message));
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
            <small>{tr('MEETINGS')}</small>
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
            {tr('Meetings')}
          </button>
          <button
            className={view === 'tensions' ? 'active' : ''}
            onClick={() => {
              back();
              setView('tensions');
            }}
          >
            <ListChecks size={19} />
            {tr('Spannungen')}
          </button>
          <button
            className={view === 'templates' ? 'active' : ''}
            onClick={() => {
              back();
              setView('templates');
            }}
          >
            <LayoutTemplate size={19} />
            {tr('Templates')}
          </button>
          <button
            className={view === 'governance' ? 'active' : ''}
            onClick={() => {
              back();
              setView('governance');
            }}
          >
            <WandSparkles size={19} />
            {tr('Governance fragen')}
          </button>
          <button
            className={view === 'settings' ? 'active' : ''}
            onClick={() => {
              back();
              setView('settings');
            }}
          >
            <Settings2 size={19} />
            {tr('Verbindungen')}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-label">{tr('GEMEINSAM WEITERKOMMEN')}</div>
          <p>
            {tr('Klare Abläufe.')}
            <br />
            {tr('Verbindliche Ergebnisse.')}
          </p>
          <div className="user">
            <div className="avatar">{data?.actor.name.slice(0, 1) || '…'}</div>
            <div>
              <strong>{data?.actor.name || tr('Anmeldung')}</strong>
              <small>{tr(data?.actor.workspace === 'write' ? 'Bearbeitung' : 'Lesezugriff')}</small>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            {tr('Arbeitsbereich')}
            <ChevronRight size={14} />
            <span>
              {view === 'tensions'
                ? tr('Spannungsspeicher')
                : view === 'templates'
                  ? tr('Meeting-Templates')
                  : view === 'settings'
                    ? tr('Verbindungen')
                    : view === 'governance'
                      ? tr('Governance fragen')
                      : tr('Meetings')}
            </span>
          </div>
          <div className="topbar-right">
            <Preferences />
            {busy && <Loader2 size={17} className="spin" />}
            {teams && (
              <span className="pill">
                <Video size={14} />
                {tr('Microsoft Teams')}
              </span>
            )}
          </div>
        </header>
        <div className="page">
          {data?.actor.workspace && (
            <p className="notice">
              {tr(
                'Dieser Arbeitsbereich ist für alle berechtigten Teammitglieder sichtbar. SharePoint steuert Lesen und Bearbeiten.',
              )}
            </p>
          )}
          {error && (
            <div role="alert" className="error">
              <span>{error}</span>
              <Button className="icon" aria-label={tr('Fehlermeldung schließen')} onClick={() => setError('')}>
                <X size={18} />
              </Button>
            </div>
          )}
          {!data && (
            <div className="empty">
              {!error && <Loader2 className="spin" size={26} />}
              <h2>{error ? tr('Verbindung erforderlich') : tr('Arbeitsbereich wird geladen')}</h2>
              {error && (
                <p>{tr('Bei Entra-Anmeldung die App in Microsoft Teams öffnen und die Konfiguration prüfen.')}</p>
              )}
            </div>
          )}
          {data && selected && !meeting && view === 'meetings' && (
            <>
              <button className="back" onClick={back}>
                {tr('← Alle Meetings')}
              </button>
              <p>
                <Loader2 size={16} className="spin" /> {tr('Meeting wird geladen …')}
              </p>
            </>
          )}
          {data && meeting && view === 'meetings' && (
            <>
              <button className="back" onClick={back}>
                {tr('← Alle Meetings')}
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
                  <div className="eyebrow">{tr('RAUM FÜR ZUSAMMENARBEIT')}</div>
                  <h1>{tr('Unsere Meetings')}</h1>
                  <p>{tr('Spannungen bearbeiten. Entscheidungen festhalten. Gemeinsam handeln.')}</p>
                </div>
                <Button
                  className="primary"
                  onClick={() => setCreate(true)}
                  disabled={data.actor.workspace === 'read' || !data.templates.some(t => t.enabled)}
                >
                  <Plus size={18} />
                  {tr('Meeting anlegen')}
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
                  <p>{tr('Laufende Meetings')}</p>
                </div>
                <div>
                  <span>
                    {data.meetings
                      .filter(m => m.status === 'scheduled')
                      .length.toString()
                      .padStart(2, '0')}
                  </span>
                  <p>{tr('Geplante Meetings')}</p>
                </div>
                <div>
                  <span>
                    {data.meetings
                      .reduce((n, m) => n + m.outcomes.filter(o => o.status === 'proposed').length, 0)
                      .toString()
                      .padStart(2, '0')}
                  </span>
                  <p>{tr('Ergebnisse zur Prüfung')}</p>
                </div>
              </div>
              <div className="section-heading">
                <h2>{tr('Meetingübersicht')}</h2>
                <span className="small muted">
                  {data.meetings.length} {tr('Meetings')}
                </span>
              </div>
              {!data.meetings.length && (
                <div className="empty first-meeting">
                  <div className="empty-symbol">
                    <Video size={30} />
                  </div>
                  <h2>{tr('Ein guter Ablauf macht den Unterschied.')}</h2>
                  <p>
                    {tr('Starte mit einem Tactical, Governance oder einem eigenen Template.')}
                    <br />
                    {tr('Dein Team gibt den Inhalt vor.')}
                  </p>
                  <Button
                    className="primary"
                    onClick={() => setCreate(true)}
                    disabled={data.actor.workspace === 'read' || !data.templates.some(t => t.enabled)}
                  >
                    <Plus size={17} />
                    {tr('Erstes Meeting anlegen')}
                  </Button>
                  <button className="text-button" onClick={() => setView('templates')}>
                    {tr('Zuerst Templates entdecken')}
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
                  <div className="eyebrow">{tr('STRUKTUR, DIE ZU EUCH PASST')}</div>
                  <h1>{tr('Meeting-Templates')}</h1>
                  <p>{tr('Ein bewährter Anfang. Frei anpassbar an eure Zusammenarbeit.')}</p>
                </div>
                {data.actor.workspace === 'write' && (
                  <Button className="primary" onClick={() => setEditor('new')}>
                    <Plus size={18} />
                    {tr('Neues Template')}
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
                        {t.enabled ? tr('Aktiv') : tr('Inaktiv')}
                      </span>
                    </div>
                    <h2>{t.name}</h2>
                    <p>{t.description}</p>
                    <div className="template-metrics">
                      <span>
                        <ListChecks size={15} />
                        {t.steps.length} {tr('Schritte')}
                      </span>
                      <span>
                        <Clock3 size={15} />
                        {t.steps.reduce((n, s) => n + s.minutes, 0)} {tr('Min.')}
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
                          {tr('Bearbeiten')}
                        </Button>
                        <Button
                          className="icon"
                          aria-label={`${t.name} ${tr('duplizieren')} `}
                          onClick={() =>
                            run(async () => {
                              await request('/templates', { ...t, name: `${t.name} (${tr('Kopie')})` });
                              await load();
                            })
                          }
                        >
                          <Copy size={16} />
                        </Button>
                        <Button
                          className="icon"
                          aria-label={`${t.name} ${t.enabled ? tr('deaktivieren') : tr('aktivieren')}`}
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
                          aria-label={`${t.name} ${tr('löschen')} `}
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
                  {tr('Einrichtungsassistent öffnen')}
                </button>
              )}
              <div className="page-heading">
                <div>
                  <div className="eyebrow">{tr('DATEN & INTEGRATIONEN')}</div>
                  <h1>{tr('Verbindungen')}</h1>
                  <p>
                    {tr('Anmeldung über Microsoft 365. Optionale Dienste werden durch die Administration freigegeben.')}
                  </p>
                </div>
              </div>
              <div className="settings-grid">
                {[
                  {
                    title: 'Datenspeicherung',
                    icon: <FileText size={22} />,
                    ready: data.integrations.storage === 'sharepoint',
                    value: tr('SharePoint · Microsoft 365'),
                    description:
                      'Templates, Spannungen, Meetings und Ergebnisse liegen im SharePoint des Kunden. Aufnahmen bleiben bei Microsoft.',
                  },
                  {
                    title: 'Microsoft Teams',
                    icon: <Video size={22} />,
                    ready: data.integrations.graph,
                    value: data.integrations.graph ? tr('Graph konfiguriert') : tr('Noch nicht verbunden'),
                    description:
                      'Kalendertermine verbinden und Transkripte nach dem Meeting abrufen. Auswertung standardmäßig auf Knopfdruck.',
                  },
                  {
                    title: 'KI-Analyse',
                    icon: <WandSparkles size={22} />,
                    ready: data.integrations.ai,
                    value: data.integrations.ai ? tr('Endpunkt konfiguriert') : tr('Noch nicht verbunden'),
                    description:
                      'Ergebnisvorschläge mit Quellen aus dem Transkript. Jede Übernahme bleibt nachvollziehbar.',
                  },
                  {
                    title: 'roleALPHA · optional',
                    icon: <Send size={22} />,
                    ready:
                      data.integrations.mcp ||
                      data.integrations.entityTypes.length > 0 ||
                      !!data.integrations.governance,
                    value:
                      data.integrations.mcp ||
                      data.integrations.entityTypes.length > 0 ||
                      !!data.integrations.governance
                        ? tr('MCP konfiguriert')
                        : tr('Nicht eingerichtet · optional'),
                    description:
                      'Optional bestätigte Ergebnisse nach roleALPHA übertragen. Spannungsspeicher, Meetings und Ergebnisprüfung funktionieren auch ohne diese Verbindung.',
                  },
                ].map(s => (
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
              <p className="notice">
                {tr(
                  '„Konfiguriert“ bedeutet, dass die erforderlichen Einstellungen vorhanden sind. Die Verbindung wird bei der jeweiligen Aktion geprüft.',
                )}
              </p>
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
        <Modal title={tr('Template löschen?')} close={() => setRemove(null)}>
          <p>
            „{remove.name}
            {tr('“ wird aus der Vorlagenbibliothek entfernt. Bereits angelegte Meetings behalten ihre Vorlage.')}
          </p>
          <div className="modal-footer">
            <Button onClick={() => setRemove(null)}>{tr('Abbrechen')}</Button>
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
              {tr('Template löschen')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
