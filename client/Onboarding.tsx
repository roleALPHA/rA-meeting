import { AppError } from '../shared/model';
import { useState } from 'react';
import { Preferences } from './Preferences';
import { errorText, language, t as tr, usePreferences } from './i18n';
import type { MessageId } from '../shared/i18n';
import type { BrowserHost } from './browser/host';
import {
  createWorkspaceSite,
  hostForWorkspace,
  inspectWorkspace,
  newSiteStatus,
  setupWorkspace,
  workspaceUrl,
} from './browser/onboarding';
import { graph } from './browser/host';

export function Onboarding({
  host,
  complete,
  cancel,
}: {
  host: BrowserHost;
  complete: (host: BrowserHost) => void;
  cancel?: () => void;
}) {
  usePreferences();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState('existing');
  const [url, setUrl] = useState(host.webUrl);
  const [slug, setSlug] = useState('ra-meetings');
  const [title, setTitle] = useState('rA Meetings');
  const [selected, setSelected] = useState<BrowserHost | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(true);
  const [ack, setAck] = useState(false);
  const [progress, setProgress] = useState<MessageId | ''>('');
  const [pageUrl, setPageUrl] = useState('');
  const [calendar, setCalendar] = useState<MessageId | ''>('');
  const target = mode === 'existing' ? url : new URL(host.webUrl).origin + '/sites/' + slug;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const choose = () =>
    run(async () => {
      const destination = hostForWorkspace(host, workspaceUrl(target, host.webUrl));
      if (mode === 'new') {
        const result = pending
          ? await newSiteStatus(host, destination.webUrl)
          : await createWorkspaceSite(host, { url: destination.webUrl, title, language: language() });
        setPending(true);
        if (result.SiteStatus !== 2) {
          if (result.SiteStatus === 3) throw new AppError(502, 'error.onboarding.sharepointCouldCreateSite');
          setProgress('onboarding.siteBeingCreatedCheck');
          return;
        }
      }
      await inspectWorkspace(destination);
      setSelected(destination);
      setProgress('');
      setStep(1);
    });
  return (
    <section className="onboarding">
      <div className="row">
        <h1>{tr('onboarding.welcomeRaMeetings')}</h1>
        <Preferences />
      </div>
      <p>{tr('onboarding.wizardSetsUpWorkspace')}</p>
      <ol className="onboarding-steps">
        {(
          [
            'onboarding.selectSite',
            'onboarding.reviewAccessSettings',
            'onboarding.setUpWorkspace',
            'onboarding.completeSetup',
          ] as const
        ).map((label, i) => (
          <li key={label} aria-current={step === i ? 'step' : undefined} className={step === i ? 'active' : ''}>
            {i + 1}. {tr(label)}
          </li>
        ))}
      </ol>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {progress && <p role="status">{tr(progress)}</p>}
      {step === 0 && (
        <>
          <label className="field">
            <span>{tr('app.workspace')}</span>
            <select
              disabled={busy || pending}
              value={mode}
              onChange={e => {
                setMode(e.target.value);
                setError('');
              }}
            >
              <option value="existing">{tr('onboarding.useExistingSharepointSite')}</option>
              {host.sharepointAt && <option value="new">{tr('onboarding.createNewSharepointSite')}</option>}
            </select>
          </label>
          {mode === 'existing' ? (
            <>
              <label className="field">
                <span>{tr('onboarding.sharepointSiteAddress')}</span>
                <input type="url" value={url} disabled={busy} onChange={e => setUrl(e.target.value)} />
              </label>
              <p className="small muted">{tr('onboarding.existingTeamChooseOpen')}</p>
            </>
          ) : (
            <>
              <label className="field">
                <span>{tr('onboarding.newSiteName')}</span>
                <input
                  maxLength={100}
                  value={title}
                  disabled={busy || pending}
                  onChange={e => setTitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{tr('onboarding.shortNameAddress')}</span>
                <input maxLength={63} value={slug} disabled={busy || pending} onChange={e => setSlug(e.target.value)} />
              </label>
              <p className="preserve">{target}</p>
              <p className="notice">{tr('onboarding.standaloneTeamSiteCreated')}</p>
            </>
          )}
          <button className="button primary" disabled={busy} onClick={choose}>
            {tr(pending ? 'onboarding.checkStatus' : mode === 'new' ? 'onboarding.createSite' : 'onboarding.checkSite')}
          </button>
          {pending && (
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setMode('existing');
                setUrl(target);
                setPending(false);
                setProgress('');
              }}
            >
              {tr('onboarding.openExistingSite')}
            </button>
          )}
        </>
      )}
      {step === 1 && selected && (
        <>
          <h2>{tr('onboarding.reviewAccessSettings')}</h2>
          <p className="preserve">{selected.webUrl}</p>
          <p className="notice">{tr('onboarding.everyoneReadAccessCan')}</p>
          <a className="button" href={selected.webUrl + '/_layouts/15/user.aspx'} target="_blank" rel="noreferrer">
            {tr('onboarding.openSitePermissions')}
          </a>
          <p>{tr('onboarding.selectedLanguageAppliesNew')}</p>
          <label className="check">
            <input type="checkbox" checked={page} onChange={e => setPage(e.target.checked)} />
            {tr('onboarding.prepareDedicatedRaMeetings')}
          </label>
          <p className="small muted">{tr('onboarding.entryPageCreatedDraft')}</p>
          <label className="check">
            <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
            {tr('onboarding.iHaveReviewedWho')}
          </label>
          <div className="row">
            <button
              className="button"
              onClick={() => {
                setStep(0);
                setAck(false);
              }}
            >
              {tr('onboarding.back')}
            </button>
            <button
              className="button primary"
              disabled={!ack}
              onClick={() => {
                setStep(2);
                void run(async () => {
                  const result = await setupWorkspace(selected, language(), page, setProgress);
                  setPageUrl(result.pageUrl || '');
                  setProgress('');
                  setStep(3);
                });
              }}
            >
              {tr('onboarding.setUpWorkspace')}
            </button>
          </div>
        </>
      )}
      {step === 2 && !busy && (
        <>
          <p>{tr('onboarding.componentsAlreadyCreatedRetained')}</p>
          <button className="button" onClick={() => setStep(1)}>
            {tr('onboarding.back')}
          </button>
        </>
      )}
      {step === 3 && selected && (
        <>
          <h2>{tr('onboarding.workspaceReady')}</h2>
          <p>{tr('onboarding.storageStarterTemplatesStorage')}</p>
          {pageUrl && (
            <>
              <a className="button" href={pageUrl + '?Mode=Edit'} target="_blank" rel="noreferrer">
                {tr('onboarding.reviewPublishEntryPage')}
              </a>
              <p className="small muted">{tr('onboarding.openPageReviewIts')}</p>
            </>
          )}
          <h3>{tr('onboarding.optionalConnections')}</h3>
          <p>{tr('onboarding.calendarAccessRequiresMicrosoft')}</p>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await graph(selected, '/me/calendar/events?$top=1&$select=id');
                setCalendar('onboarding.calendarAccessVerifiedSuccessfully');
              })
            }
          >
            {tr('onboarding.testCalendarAccess')}
          </button>
          {calendar && <p role="status">{tr(calendar)}</p>}
          <p>{tr(selected.settings.ai ? 'onboarding.aiConfiguredFunctionalTest' : 'onboarding.aiConfigured')}</p>
          <p>
            {tr(
              selected.settings.roleAlpha
                ? 'onboarding.rolealphaConfiguredFunctionalTest'
                : 'onboarding.rolealphaConfigured',
            )}
          </p>
          <p>{tr('onboarding.teamsAdministratorMustAdd')}</p>
          <button className="button primary" disabled={busy} onClick={() => complete(selected)}>
            {tr('onboarding.openWorkspace')}
          </button>
        </>
      )}
      {cancel && step !== 2 && (
        <button className="button" disabled={busy} onClick={cancel}>
          {tr('assistant.close')}
        </button>
      )}
    </section>
  );
}
