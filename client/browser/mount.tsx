import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { App } from '../App';
import { ApiProvider } from '../api-context';
import { createBrowserApi, type AppApi } from './runtime';
import type { BrowserHost } from './host';
import { Onboarding } from '../Onboarding';
import { AppError } from '../../shared/model';
import { errorText, t, usePreferences } from '../i18n';
import { Preferences } from '../Preferences';
import brandCss from '../brand.css?inline';
import css from '../style.css?inline';
import { installFonts, type Theme } from './brand';
function Start({ host: initialHost }: { host: BrowserHost }) {
  usePreferences();
  const [host, setHost] = useState(initialHost);
  const [api, setApi] = useState<AppApi | null>(null);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    setError('');
    setApi(null);
    void createBrowserApi(host)
      .then(api => {
        if (alive) setApi(api);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setError(errorText(error));
        if (error instanceof AppError && (error.status === 404 || error.status === 503)) setWizard(true);
      });
    return () => {
      alive = false;
    };
  }, [host, retry]);
  if (wizard)
    return (
      <Onboarding
        host={host}
        cancel={api ? () => setWizard(false) : undefined}
        complete={selected => {
          if (selected.webUrl !== host.webUrl) {
            const url = new URL(window.location.href);
            url.searchParams.set('raWorkspace', selected.webUrl);
            url.searchParams.delete('raMeeting');
            window.history.replaceState(null, '', url);
          }
          setHost(selected);
          setWizard(false);
          setRetry(n => n + 1);
        }}
      />
    );
  if (api)
    return (
      <ApiProvider value={{ ...api, openSetup: () => setWizard(true) }}>
        <App />
      </ApiProvider>
    );
  return (
    <section className="setup">
      <Preferences />
      <h1>roleALPHA Meetings</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button className="button" onClick={() => setRetry(n => n + 1)}>
            {t('startup.tryAgain')}
          </button>
          <button className="button" onClick={() => setWizard(true)}>
            {t('app.openSetupWizard')}
          </button>
        </>
      ) : (
        <p>{t('app.loadingWorkspace')}</p>
      )}
    </section>
  );
}
export type MountHandle = (() => void) & { setTheme: (theme: Theme) => void };
/**
 * Private React root and stylesheet; no document-wide CSS apart from the brand @font-face rules (see brand.ts),
 * no localhost or vendor API fallback.
 */
export function mount(element: HTMLElement, host: BrowserHost): MountHandle {
  installFonts(host.fonts);
  const setTheme = (theme: Theme) => element.setAttribute('data-theme', theme);
  setTheme(host.theme ?? 'light');
  const shadow = element.shadowRoot || element.attachShadow({ mode: 'open' });
  shadow.replaceChildren();
  const style = document.createElement('style');
  style.textContent = brandCss + '\n' + css;
  const root = document.createElement('div');
  shadow.append(style, root);
  ReactDOM.render(<Start host={host} />, root);
  const dispose = () => {
    ReactDOM.unmountComponentAtNode(root);
    shadow.replaceChildren();
  };
  return Object.assign(dispose, { setTheme });
}
