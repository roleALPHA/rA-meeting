import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { App } from '../App';
import { ApiProvider } from '../api-context';
import { createBrowserApi, type AppApi } from './runtime';
import type { BrowserHost } from './host';
import { Onboarding } from '../Onboarding';
import { AppError } from '../../shared/model';
import { t, usePreferences } from '../i18n';
import { Preferences } from '../Preferences';
import css from '../style.css?inline';
function Start({host:initialHost}:{host:BrowserHost}){
 usePreferences();const [host,setHost]=useState(initialHost);const [api,setApi]=useState<AppApi|null>(null);const [error,setError]=useState('');const [wizard,setWizard]=useState(false);const [retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;setError('');setApi(null);void createBrowserApi(host).then(api=>{if(alive)setApi(api);}).catch((error:unknown)=>{if(!alive)return;setError(error instanceof Error?t(error.message):t('Verbindung erforderlich'));if(error instanceof AppError&&(error.status===404||error.status===503))setWizard(true);});return()=>{alive=false;};},[host,retry]);
 if(wizard)return <Onboarding host={host} cancel={api?()=>setWizard(false):undefined} complete={selected=>{if(selected.webUrl!==host.webUrl){const url=new URL(window.location.href);url.searchParams.set('raWorkspace',selected.webUrl);url.searchParams.delete('raMeeting');window.history.replaceState(null,'',url);}setHost(selected);setWizard(false);setRetry(n=>n+1);}}/>;
 if(api)return <ApiProvider value={{...api,openSetup:()=>setWizard(true)}}><App/></ApiProvider>;
 return <section className="setup"><Preferences/><h1>roleALPHA Meetings</h1>{error?<><p role="alert">{error}</p><button className="button" onClick={()=>setRetry(n=>n+1)}>{t('Erneut versuchen')}</button><button className="button" onClick={()=>setWizard(true)}>{t('Einrichtungsassistent öffnen')}</button></>:<p>{t('Arbeitsbereich wird geladen')}</p>}</section>;
}
/** Private React root and stylesheet; no document-wide CSS, no localhost or vendor API fallback. */
export function mount(element:HTMLElement,host:BrowserHost):()=>void {
 const shadow=element.shadowRoot||element.attachShadow({mode:'open'});shadow.replaceChildren();
 const style=document.createElement('style');style.textContent=css.replace(':root',':host')+'\n:host{display:block;min-width:0}.app{min-height:720px}.sidebar{position:sticky;inset:auto;top:0;align-self:flex-start;flex-shrink:0;height:720px}.app main{margin-left:0;min-width:0;flex:1}.setup{padding:28px}.setup .button{margin:8px 8px 8px 0}@media(max-width:760px){.sidebar{height:auto;position:static}.app{display:block}}';
 const root=document.createElement('div');shadow.append(style,root);ReactDOM.render(<Start host={host}/>,root);
 return()=>{ReactDOM.unmountComponentAtNode(root);shadow.replaceChildren();};
}
