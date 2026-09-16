import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { assert, type Meeting, type Outcome } from '../../shared/model';
import { analysisMessages, validateAnalysis } from '../../shared/analysis';
import { assistanceMessages } from '../../shared/assistance-messages';
import { assistanceResult, type AssistanceInput } from '../../shared/assistance';
import { type BrowserHost, type Endpoint, endpointFetch } from './host';
const receipt = z.object({draft_created:z.literal(true),draftId:z.string().min(1),entityUuid:z.string().min(1),status:z.literal('draft')});
export async function complete(host:BrowserHost,messages:{role:string;content:string}[]) {
 const ai=host.settings.ai;assert(ai,'KI ist nicht konfiguriert.',503);
 const r=await endpointFetch(host,ai)(ai.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:ai.model,messages,response_format:{type:'json_object'}})});
 assert(r.ok,`KI-Dienst nicht verfügbar (HTTP ${r.status}).`,502);
 const body=await r.json() as {choices?:{message?:{content?:string}}[]};
 try{return JSON.parse(body.choices?.[0]?.message?.content||'') as unknown;}catch{throw new Error('Die KI-Antwort ist ungültig. Es wurde nichts übernommen.');}
}
export async function analyzeBrowser(host:BrowserHost,m:Meeting,language:'de'|'en'|'fr'|'es') {return validateAnalysis(await complete(host,analysisMessages(m,language)),m);}
export async function assistBrowser(host:BrowserHost,m:Meeting,input:AssistanceInput){return assistanceResult.parse(await complete(host,assistanceMessages(m,input)));}
export type ExportPlan={destination:string;tool:string;label:string;arguments:{tenant_uuid:string;name:string;custom_id:string;data:unknown}};
export function entityPlan(host:BrowserHost,m:Meeting,o:Outcome):ExportPlan {
 assert(o.status==='approved'&&!o.export,'Nur bestätigte, nicht exportierte Ergebnisse können übertragen werden.',409);
 assert(!o.targetId,'Dieser Adapter legt neue Entitäten an; Änderungen an bestehenden Objekten sind nicht konfiguriert.');
 const route=host.settings.roleAlpha?.entities[o.type];assert(route&&host.settings.roleAlpha,'Für diesen Ergebnistyp ist kein MCP-Ziel konfiguriert.',503);
 return {destination:host.settings.roleAlpha.url,tool:route.tool,label:route.label,arguments:{tenant_uuid:host.settings.roleAlpha.tenant,name:o.title,custom_id:`ra-meeting:${m.id}:${o.id}`,data:{...o.data,raMeeting:{meetingId:m.id,outcomeId:o.id,circle:m.circle,circleId:m.circleId,description:o.description,owner:o.owner,dueDate:o.dueDate,approvedBy:o.approvedBy,approvedAt:o.approvedAt,evidence:m.transcript.filter(s=>o.evidence.includes(s.id))}}}};
}
export function meetingPlan(host:BrowserHost,m:Meeting,outputs:Outcome[]):ExportPlan {
 const settings=host.settings.roleAlpha;assert(settings?.meeting,'roleALPHA ist nicht verbunden.',503);
 assert(outputs.length&&outputs.every(o=>o.status==='approved'&&!o.export),'Nur bestätigte, noch nicht exportierte Ergebnisse sind zulässig.',409);
 return {destination:settings.url,tool:'create_meeting',label:'Meeting',arguments:{tenant_uuid:settings.tenant,name:m.title,custom_id:`ra-meeting:${m.id}:${outputs.map(o=>o.id).sort().join(',')}`,data:{schemaVersion:'ra-meeting/1',meetingId:m.id,circle:m.circle,circleId:m.circleId,template:{id:m.template.id,name:m.template.name,version:m.template.version},meetingStatus:m.status,createdAt:m.createdAt,outcomes:outputs.map(({export:_export,...o})=>({...o,evidenceSegments:m.transcript.filter(s=>o.evidence.includes(s.id))}))}}};
}
/** Explicit delegated-auth transport; never bearer/API keys in properties or persistent storage. */
export async function prepareExport(host:BrowserHost,plan:ExportPlan,target:Endpoint){
 assert(host.settings.roleAlpha&&target.url===host.settings.roleAlpha.url&&target.resource===host.settings.roleAlpha.resource,'roleALPHA ist nicht verbunden.',503);
 assert(plan.destination===target.url,'Exportvorschau hat sich geändert. Erneut prüfen.',409);
 const client=new Client({name:'ra-meeting-spfx',version:'1.0.0'});
 try{
  const transport=new StreamableHTTPClientTransport(new URL(target.url),{fetch:endpointFetch(host,target)});
  await client.connect(transport,{timeout:15_000});
  let cursor:string|undefined;let found;const seen=new Set<string>();
  for(let page=0;page<20;page++){const response=await client.listTools(cursor?{cursor}:{});found=response.tools.find(t=>t.name===plan.tool);if(found||!response.nextCursor)break;assert(!seen.has(response.nextCursor),'Ungültige MCP-Folgeseite.',502);seen.add(response.nextCursor);cursor=response.nextCursor;}
  assert(found,'Das konfigurierte MCP-Tool wird vom Zielserver nicht angeboten.',502);
  const properties=found.inputSchema.properties as Record<string,{type?:string}>|undefined;
  assert(properties&&['tenant_uuid','name','custom_id'].every(k=>properties[k]?.type==='string')&&properties.data?.type==='object'&&(found.inputSchema.required||[]).every(k=>k in plan.arguments),'MCP-Tool unterstützt den roleALPHA-Erstellvertrag nicht.',502);
  return {close:()=>client.close(),send:async()=>{const result=await client.callTool({name:plan.tool,arguments:plan.arguments},undefined,{timeout:30_000});assert(!result.isError,'roleALPHA hat den Entwurf nicht bestätigt.',502);const text=Array.isArray(result.content)?result.content.find(c=>c.type==='text'):undefined;return receipt.parse(result.structuredContent??(text&&'text'in text?JSON.parse(String(text.text)):null));}};
 }catch(error){await client.close().catch(()=>{});throw error;}
}
