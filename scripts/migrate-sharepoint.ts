import { Store } from '../server/store.js';
import { config } from '../server/config.js';
import { SharePointStore } from '../shared/storage/sharepoint.js';
import { sharepointGraph } from '../server/sharepoint-graph.js';
import { AppError } from '../shared/model.js';
if (!process.env.MIGRATION_SOURCE || !config.sharepointSite || !config.sharepointList || !config.sharepointDrive || config.tenantId === 'local') throw new Error('Set MIGRATION_SOURCE, customer Entra credentials and all SharePoint IDs. Stop application writers before migration.');
const sourceTenant = process.env.MIGRATION_SOURCE_TENANT || config.tenantId;
// This explicit one-off operation reads the old store. It never deletes or overwrites source data.
const source = new Store(process.env.MIGRATION_SOURCE);
const target = new SharePointStore({tenantId:config.tenantId,siteId:config.sharepointSite,listId:config.sharepointList,driveId:config.sharepointDrive},sharepointGraph);
await source.initialize(); await target.initialize();
try {
 for(const kind of ['template','tension','meeting']) {
  const records = await source.list<{id:string;version?:number;revision?:number}>(sourceTenant,kind);
  for(const record of records) {
   let existing: unknown;
   try { existing = await target.get(config.tenantId,kind,record.id); } catch(e) { if(!(e instanceof AppError && e.status===404))throw e; }
   if(existing) {if(JSON.stringify(existing)!==JSON.stringify(record))throw new Error(`Target conflict for ${kind}:${record.id}; resolve explicitly.`);continue;}
   await target.save(config.tenantId,kind,record.id,record.version||record.revision||1,record);
   const copy = await target.get(config.tenantId,kind,record.id);
   if(JSON.stringify(copy)!==JSON.stringify(record))throw new Error(`Verification failed: ${kind}:${record.id}`);
  }
  console.log(`${kind}: ${records.length} verified`);
 }
 // Avoid adding new defaults into the migrated workspace.
 try { await target.save(config.tenantId,'initialized','seed',1,{}); } catch(e) {if(!(e instanceof AppError && e.status===409))throw e;}
} finally {await source.close();await target.close();}
