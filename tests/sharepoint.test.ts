import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SharePointStore, type GraphRequest } from '../shared/storage/sharepoint.js';
import { AppError } from '../shared/model.js';
function fixture() {
 const heads=new Map<string, {id:string;eTag:string;fields:Record<string,unknown>}>();
 const files=new Map<string,unknown>(); const calls:{path:string;init?:RequestInit}[]=[];
 let seq=0;
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
 const request: GraphRequest = async (path,init) => {
  calls.push({path,init}); const u=new URL(path,'https://graph.microsoft.com'); const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(path.endsWith('/columns'))return json({value:['RecordKey','RecordKind','RecordId','RecordVersion','PayloadId'].map(name=>({name,indexed:true,enforceUniqueValues:name==='RecordKey'}))});
  if(path.includes('/drives?'))return json({value:[{id:'drive'}]});
  if(init?.method==='PUT') {const id='file-'+(++seq);files.set(id,body);return json({id});}
  if(u.pathname.endsWith('/content')) {const id=u.pathname.split('/').at(-2)!;return files.has(id)?json(files.get(id)):json({},404);}
  if(init?.method==='POST') {if([...heads.values()].some(h=>h.fields.RecordKey===body.fields.RecordKey))return json({},409);const id='item-'+(++seq);heads.set(id,{id,eTag:'v1',fields:body.fields});return json(heads.get(id),201);}
  if(init?.method==='PATCH'||init?.method==='DELETE') {const id=u.pathname.split('/')[6];const old=heads.get(id);if(!old)return json({},404);if(new Headers(init.headers).get('If-Match')!==old.eTag)return json({},412);if(init.method==='DELETE'){heads.delete(id);return new Response(null,{status:204});}heads.set(id,{...old,eTag:'v'+(++seq),fields:body});return json(body);}
  const filter=u.searchParams.get('$filter')!; const match=/fields\/(\w+) eq '(.*)'/.exec(filter)!;
  return json({value:[...heads.values()].filter(h=>h.fields[match[1]]===match[2].replaceAll("''", "'"))});
 };
 return {heads,files,calls,request,store:new SharePointStore({tenantId:'tenant',siteId:'site',listId:'index',driveId:'drive'},request)};
}
test('SharePoint stores large snapshots outside list columns; CAS rejects stale and concurrent edits',async()=>{
 const f=fixture();await f.store.initialize();const body={id:'record',revision:1,transcript:'x'.repeat(200_000)};
 await f.store.save('tenant','meeting','record',1,body);
 assert.deepEqual(await f.store.get('tenant','meeting','record'),body);
 assert.equal(JSON.stringify([...f.heads.values()]).includes(body.transcript),false);
 const edits=await Promise.allSettled([f.store.save('tenant','meeting','record',2,{...body,revision:2,title:'A'},1),f.store.save('tenant','meeting','record',2,{...body,revision:2,title:'B'},1)]);
 assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);assert.equal(edits.filter(r=>r.status==='rejected').length,1);
 await assert.rejects(f.store.save('tenant','meeting','record',3,{},1),(e:unknown)=>e instanceof AppError&&e.status===409);
 await assert.rejects(f.store.get('other-tenant','meeting','record'),/Mandant/);
 await f.store.delete('tenant','meeting','record',2);await assert.rejects(f.store.get('tenant','meeting','record'),/nicht gefunden/);
 assert.ok(f.files.size>=2,'snapshots retained for customer retention policy');
});
test('SharePoint follows bounded-origin pagination and rejects external next links',async()=>{
 let calls=0;
 const store=new SharePointStore({tenantId:'tenant',siteId:'site',listId:'index',driveId:'drive'},async path=>{
  calls++;if(calls===1)return new Response(JSON.stringify({value:[],'@odata.nextLink':'https://graph.microsoft.com/v1.0/sites/site/lists/index/items?$skiptoken=2'}));
  assert.ok(path.includes('skiptoken'));return new Response(JSON.stringify({value:[]}));
 });
 assert.deepEqual(await store.list('tenant','meeting'),[]);assert.equal(calls,2);
 const bad=new SharePointStore(store.settings,async()=>new Response(JSON.stringify({value:[],'@odata.nextLink':'https://attacker.invalid/v1.0/sites/site/lists/index/items'})));
 await assert.rejects(bad.list('tenant','meeting'),/Folgeseite/);
});
test('SharePoint job claims are exclusive and survive repository reconstruction',async()=>{
 const f=fixture();await f.store.enqueue('job/input','tenant','meeting','analysis',{});
 await f.store.enqueue('job/input','tenant','meeting','analysis',{});
 const other=new SharePointStore(f.store.settings,f.request);
 const claims=await Promise.all([f.store.claimJob(),other.claimJob()]);assert.equal(claims.filter(Boolean).length,1);
 const job=claims.find(Boolean)!;await other.finishJob(job.id);assert.equal(await f.store.claimJob(),undefined);
});
