import { useState } from 'react';
import { Preferences } from './Preferences';
import { language, t as tr, usePreferences } from './i18n';
import type { BrowserHost } from './browser/host';
import { createWorkspaceSite, hostForWorkspace, inspectWorkspace, newSiteStatus, setupWorkspace, workspaceUrl } from './browser/onboarding';
import { graph } from './browser/host';

export function Onboarding({host,complete,cancel}:{host:BrowserHost;complete:(host:BrowserHost)=>void;cancel?:()=>void}){
 usePreferences();const [step,setStep]=useState(0);const [mode,setMode]=useState('existing');const [url,setUrl]=useState(host.webUrl);const [slug,setSlug]=useState('ra-meetings');const [title,setTitle]=useState('rA Meetings');
 const [selected,setSelected]=useState<BrowserHost|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [pending,setPending]=useState(false);const [page,setPage]=useState(true);const [ack,setAck]=useState(false);const [progress,setProgress]=useState('');const [pageUrl,setPageUrl]=useState('');const [calendar,setCalendar]=useState('');
 const target=mode==='existing'?url:new URL(host.webUrl).origin+'/sites/'+slug;
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(e){setError(tr(e instanceof Error?e.message:'Einrichtung fehlgeschlagen.'));}finally{setBusy(false);}};
 const choose=()=>run(async()=>{
  const destination=hostForWorkspace(host,workspaceUrl(target,host.webUrl));
  if(mode==='new'){
   const result=pending?await newSiteStatus(host,destination.webUrl):await createWorkspaceSite(host,{url:destination.webUrl,title,language:language()});
   setPending(true);
   if(result.SiteStatus!==2){if(result.SiteStatus===3)throw new Error('SharePoint konnte die Website nicht erstellen. Bitte die Administration kontaktieren.');setProgress('Die Website wird erstellt. Bitte den Status erneut prüfen.');return;}
  }
  await inspectWorkspace(destination);setSelected(destination);setProgress('');setStep(1);
 });
 return <section className="onboarding"><div className="row"><h1>{tr('Willkommen bei rA Meetings')}</h1><Preferences/></div>
 <p>{tr('Dieser Assistent richtet den Arbeitsbereich in Ihrer Microsoft-365-Umgebung ein.')}</p>
 <ol className="onboarding-steps">{['Website auswählen','Zugriff und Einstellungen prüfen','Arbeitsbereich einrichten','Einrichtung abschließen'].map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={step===i?'active':''}>{i+1}. {tr(label)}</li>)}</ol>
 {error&&<p role="alert" className="notice">{error}</p>}{progress&&<p role="status">{tr(progress)}</p>}
 {step===0&&<><label className="field"><span>{tr('Arbeitsbereich')}</span><select disabled={busy||pending} value={mode} onChange={e=>{setMode(e.target.value);setError('');}}><option value="existing">{tr('Vorhandene SharePoint-Website verwenden')}</option>{host.sharepointAt&&<option value="new">{tr('Neue SharePoint-Website erstellen')}</option>}</select></label>
 {mode==='existing'?<><label className="field"><span>{tr('SharePoint-Websiteadresse')}</span><input type="url" value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></label><p className="small muted">{tr('Für ein vorhandenes Team: im Dateibereich des Kanals „In SharePoint öffnen“ wählen und die Websiteadresse ohne Seitennamen kopieren.')}</p></>:<><label className="field"><span>{tr('Name der neuen Website')}</span><input maxLength={100} value={title} disabled={busy||pending} onChange={e=>setTitle(e.target.value)}/></label><label className="field"><span>{tr('Kurzname für die Adresse')}</span><input maxLength={63} value={slug} disabled={busy||pending} onChange={e=>setSlug(e.target.value)}/></label><p className="preserve">{target}</p><p className="notice">{tr('Es entsteht eine eigenständige Teamwebsite ohne neues Microsoft-Team. Ihr Konto wird Besitzer. Richtlinien Ihrer Organisation können die Erstellung verhindern.')}</p></>}
 <button className="button primary" disabled={busy} onClick={choose}>{tr(pending?'Status prüfen':mode==='new'?'Website erstellen':'Website prüfen')}</button>
 {pending&&<button className="button" disabled={busy} onClick={()=>{setMode('existing');setUrl(target);setPending(false);setProgress('');}}>{tr('Als vorhandene Website öffnen')}</button>}
 </>}
 {step===1&&selected&&<><h2>{tr('Zugriff und Einstellungen prüfen')}</h2><p className="preserve">{selected.webUrl}</p><p className="notice">{tr('Alle Leseberechtigten sehen die Inhalte dieses Arbeitsbereichs einschließlich Transkripten und älteren Fassungen. Bearbeitungsberechtigte können gemeinsam moderieren. Die Einrichtung ändert keine Zugriffsrechte.')}</p>
 <a className="button" href={selected.webUrl+'/_layouts/15/user.aspx'} target="_blank" rel="noreferrer">{tr('Websiteberechtigungen öffnen')}</a>
 <p>{tr('Die gewählte Sprache gilt für neue Startvorlagen. Vorhandene Vorlagen bleiben unverändert. „Spannungen“ oder „Agenda“ ist eine persönliche Anzeigeeinstellung.')}</p>
 <label className="check"><input type="checkbox" checked={page} onChange={e=>setPage(e.target.checked)}/>{tr('Eine eigene Einstiegsseite für rA Meetings vorbereiten')}</label>
 <p className="small muted">{tr('Die Einstiegsseite wird als Entwurf angelegt. Sie prüfen und veröffentlichen sie anschließend in SharePoint. Eine vorhandene Startseite wird nicht ersetzt.')}</p>
 <label className="check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>{tr('Ich habe den zugriffsberechtigten Personenkreis geprüft und möchte diesen Arbeitsbereich einrichten.')}</label>
 <div className="row"><button className="button" onClick={()=>{setStep(0);setAck(false);}}>{tr('Zurück')}</button><button className="button primary" disabled={!ack} onClick={()=>{setStep(2);void run(async()=>{const result=await setupWorkspace(selected,language(),page,setProgress);setPageUrl(result.pageUrl||'');setProgress('');setStep(3);});}}>{tr('Arbeitsbereich einrichten')}</button></div></>}
 {step===2&&!busy&&<><p>{tr('Bereits erstellte Bestandteile bleiben erhalten. Sie können die Einrichtung erneut starten.')}</p><button className="button" onClick={()=>setStep(1)}>{tr('Zurück')}</button></>}
 {step===3&&selected&&<><h2>{tr('Ihr Arbeitsbereich ist bereit')}</h2><p>{tr('Speicherbereiche, Startvorlagen und Speichertest sind abgeschlossen.')}</p>
 {pageUrl&&<><a className="button" href={pageUrl+'?Mode=Edit'} target="_blank" rel="noreferrer">{tr('Einstiegsseite prüfen und veröffentlichen')}</a><p className="small muted">{tr('Öffnen Sie die Seite, prüfen Sie den Inhalt und wählen Sie „Veröffentlichen“. Teilen Sie danach den Seitenlink mit Ihrer Gruppe.')}</p></>}
 <h3>{tr('Optionale Verbindungen')}</h3><p>{tr('Kalender benötigt Microsoft-Graph-Freigaben. KI und roleALPHA benötigen ein entsprechend konfiguriertes Paket. Sie können die App zunächst ohne diese Funktionen verwenden.')}</p>
 <button className="button" disabled={busy} onClick={()=>run(async()=>{await graph(selected,'/me/calendar/events?$top=1&$select=id');setCalendar('Kalenderzugriff erfolgreich geprüft.');})}>{tr('Kalenderzugriff testen')}</button>{calendar&&<p role="status">{tr(calendar)}</p>}
 <p>{tr(selected.settings.ai?'KI ist konfiguriert; ein Funktionstest ist noch erforderlich.':'KI ist nicht eingerichtet.')}</p><p>{tr(selected.settings.roleAlpha?'roleALPHA ist konfiguriert; ein Funktionstest ist noch erforderlich.':'roleALPHA ist nicht eingerichtet.')}</p>
 <p>{tr('Für Teams: Die Administration muss die App im App-Katalog zu Teams hinzufügen und freigeben. Beim Hinzufügen einer Registerkarte denselben Arbeitsbereich wählen.')}</p>
 <button className="button primary" disabled={busy} onClick={()=>complete(selected)}>{tr('Arbeitsbereich öffnen')}</button></>}
 {cancel&&step!==2&&<button className="button" disabled={busy} onClick={cancel}>{tr('Schließen')}</button>}
 </section>;
}
