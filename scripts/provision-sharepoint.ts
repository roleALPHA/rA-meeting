import { config } from '../server/config.js';
import { sharepointGraph } from '../server/sharepoint-graph.js';
import { SharePointStore } from '../shared/storage/sharepoint.js';
const site = process.env.SHAREPOINT_SITE_ID;
if (!site || !config.clientId || !config.clientSecret || config.tenantId === 'local') throw new Error('Set SHAREPOINT_SITE_ID and customer ENTRA_TENANT_ID / CLIENT_ID / CLIENT_SECRET first.');
async function json<T>(path: string, init?: RequestInit): Promise<T> {
 const r = await sharepointGraph(path, init); if (!r.ok) throw new Error(`SharePoint provisioning failed: HTTP ${r.status}`); return r.json() as Promise<T>;
}
const prefix = `/sites/${encodeURIComponent(site)}`;
let path: string | undefined = `${prefix}/lists?$select=id,displayName`;
const lists: { id: string; displayName: string }[] = [];
while(path) {
 const page: { value: typeof lists; '@odata.nextLink'?: string } = await json(path); lists.push(...page.value);
 const next = page['@odata.nextLink']; if(!next)break;
 const url = new URL(next); if(url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith(`/v1.0${prefix}/lists`))throw new Error('Invalid pagination link');
 path=url.pathname.slice(5)+url.search;
}
async function ensure(name: string, template: string, columns?: unknown[]) {
 const found = lists.filter(l => l.displayName === name); if(found.length > 1)throw new Error(`Multiple lists named ${name}; select IDs explicitly.`);
 if(found.length)return found[0];
 return json<{ id: string }>(`${prefix}/lists`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ displayName:name, list:{template}, ...(columns?{columns}:{}) })});
}
// Dedicated workspace site recommended. Restrict library/index access to the app and tenant administrators.
const index = await ensure('rA Meetings Index','genericList',[
 {name:'RecordKey',text:{},indexed:true,enforceUniqueValues:true},
 {name:'RecordKind',text:{},indexed:true}, {name:'RecordId',text:{}},
 {name:'RecordVersion',number:{decimalPlaces:'none'}}, {name:'PayloadId',text:{}},
]);
const library = await ensure('rA Meetings Data','documentLibrary');
const drive = await json<{id:string}>(`${prefix}/lists/${encodeURIComponent(library.id)}/drive`);
const store = new SharePointStore({tenantId:config.tenantId,siteId:site,listId:index.id,driveId:drive.id},sharepointGraph);
await store.initialize();
console.log(`STORAGE_BACKEND=sharepoint\nSHAREPOINT_SITE_ID=${site}\nSHAREPOINT_LIST_ID=${index.id}\nSHAREPOINT_DRIVE_ID=${drive.id}`);
