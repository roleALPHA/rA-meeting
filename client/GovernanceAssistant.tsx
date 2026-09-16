import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { useApi } from './api-context';
import { t as tr, language } from './i18n';
import type { GovernanceReply } from '../shared/governance';
export function GovernanceAssistant({enabled}:{enabled:boolean}) {
 const {request}=useApi();const [question,setQuestion]=useState('');const [busy,setBusy]=useState(false);const [reply,setReply]=useState<GovernanceReply|null>(null);const [error,setError]=useState('');
 return <section className="assistant-panel"><h2>{tr('Governance fragen')}</h2>
 <p>{tr('Fragen zu Rollen, Zuständigkeiten und Regeln anhand der bestehenden Governance in roleALPHA beantworten.')}</p>
 <p className="small muted">{tr('Deine Frage wird an roleALPHA gesendet. Die gefundenen Inhalte gehen mit der Frage an den freigegebenen KI-Dienst. Meeting und Transkript werden nicht automatisch mitgesendet. Antworten werden nicht gespeichert.')}</p>
 {!enabled&&<p className="notice">{tr('Für Governance-Fragen müssen KI und roleALPHA-Lesezugriff eingerichtet sein.')}</p>}
 <form onSubmit={async e=>{e.preventDefault();if(busy||!enabled)return;setBusy(true);setError('');setReply(null);try{setReply(await request<GovernanceReply>('/governance/ask',{question,language:language()}));}catch(error){setError(tr(error instanceof Error?error.message:'Governance konnte nicht aus roleALPHA gelesen werden.'));}finally{setBusy(false);}}}>
 <label className="field"><span>{tr('Deine Governance-Frage')}</span><textarea rows={4} minLength={3} maxLength={4000} required disabled={busy} value={question} placeholder={tr('Welche Rolle ist für diese Entscheidung zuständig?')} onChange={e=>{setQuestion(e.target.value);setReply(null);setError('');}}/></label>
 <button className="button primary" disabled={!enabled||busy||question.trim().length<3}><WandSparkles size={16}/>{tr(busy?'Governance wird geprüft …':'Governance prüfen')}</button></form>
 {error&&<p role="alert">{error}</p>}
 {reply&&<div aria-live="polite"><h3>{tr('Antwort mit Quellen')}</h3><p className="notice">{tr('Die Antwort berücksichtigt nur die abgerufenen Quellen. Sie ersetzt keinen Governance-Beschluss. Prüfe die Originaltexte und mögliche weitere Regeln.')}</p>
 {!reply.statements.length&&<p>{tr('Keine ausreichend belegte Antwort gefunden. Präzisiere die Frage oder prüfe die Governance direkt in roleALPHA.')}</p>}
 {reply.statements.map((s,i)=><div className="result-card" key={i}><p className="preserve">{s.text}</p><p className="small">{s.sourceIds.map(id=>{const source=reply.sources.find(s=>s.id===id)!;return `${source.title} (${id})`;}).join(' · ')}</p></div>)}
 {reply.limitations.length>0&&<><h4>{tr('Offene Fragen')}</h4><ul>{reply.limitations.map((s,i)=><li key={i}>{s}</li>)}</ul></>}
 <h4>{tr('Abgerufene Governance-Quellen')}</h4><p className="small muted">{new Date(reply.retrievedAt).toLocaleString(language())}</p>
 {reply.sources.map(source=><details key={source.id}><summary>{source.title} · {source.id}</summary><p className="preserve">{source.content}</p></details>)}
 </div>}
 </section>;
}
