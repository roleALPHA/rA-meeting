import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { MeetingPanel } from '../MeetingPanel';
import { ApiProvider } from '../api-context';
import { createPanelApi } from './api';
import type { BrowserHost } from './host';
import brandCss from '../brand.css?inline';
import css from '../style.css?inline';
import { installFonts, type Theme } from './brand';
import { applyHostLanguage } from '../i18n';

function Start({ host }: { host: BrowserHost }) {
  const [api] = useState(() => createPanelApi(host));
  return (
    <ApiProvider value={api}>
      <MeetingPanel />
    </ApiProvider>
  );
}

/** Browser storage for per-user conveniences; null where the browser refuses it. */
function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export type MountHandle = (() => void) & { setTheme: (theme: Theme) => void };
/**
 * Private React root and stylesheet; no document-wide CSS apart from the brand @font-face rules (see brand.ts),
 * no localhost or vendor API fallback.
 */
export function mount(element: HTMLElement, hostInput: Omit<BrowserHost, 'roleAlpha' | 'storage'>): MountHandle {
  // roleALPHA is found at start (client/browser/connection.ts), never configured in the package.
  const host: BrowserHost = { ...hostInput, roleAlpha: null, storage: browserStorage() };
  applyHostLanguage(host.language);
  installFonts(host.fonts);
  const setTheme = (theme: Theme) => element.setAttribute('data-theme', theme);
  setTheme(host.theme ?? 'light');
  const shadow = element.shadowRoot || element.attachShadow({ mode: 'open' });
  shadow.replaceChildren();
  const style = document.createElement('style');
  style.textContent = brandCss + '\n' + css;
  const root = document.createElement('div');
  root.className = 'root';
  shadow.append(style, root);
  ReactDOM.render(<Start host={host} />, root);
  const dispose = () => {
    ReactDOM.unmountComponentAtNode(root);
    shadow.replaceChildren();
  };
  return Object.assign(dispose, { setTheme });
}
