import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { createMeeting, command, getMeeting } from '../server/domain.js';
import { assistanceMessages, assist } from '../server/assistance.js';
import { assistanceInput, assistanceResult } from '../shared/assistance.js';
import { config } from '../server/config.js';
import type { Actor, Template } from '../shared/model.js';
const actor:Actor={id:'owner',name:'Owner',tenantId:'tenant',admin:true};
test('proposal forming uses scoped context; generation never changes meeting or validates objections',async()=>{
 const store=new Store(':memory:');await store.initialize();await store.seed(actor.tenantId);
 try {
 const template=(await store.list<Template>(actor.tenantId,'template')).find(t=>t.category==='governance')!;
 const m=await createMeeting(store,actor,{templateId:template.id,title:'Governance',circle:'Circle'});
 const step=m.template.steps.find(s=>s.kind==='agenda')!;
 command(m,actor,{type:'agenda.add',stepId:step.id,title:'Clear responsibilities'});
 m.transcript=[{id:'secret',start:'',end:'',speaker:'',text:'PRIVATE TRANSCRIPT'}];
 const input=assistanceInput.parse({mode:'proposal',agendaId:m.agenda[0].id,context:'Need an owner',language:'fr'});
 const messages=assistanceMessages(m,input);assert.match(messages[0].content,/Respond in fr/);assert.match(messages[0].content,/never claim approval/);assert.ok(!JSON.stringify(messages).includes('PRIVATE TRANSCRIPT'));
 const prior={aiUrl:config.aiUrl,aiModel:config.aiModel};Object.assign(config,{aiUrl:'https://customer.example/ai',aiModel:'test'});
 try {
 const before=structuredClone(m);
 const response={proposal:'Draft wording',rationale:'Possible improvement',questions:['Who owns it?'],objectionResponses:[]};
 const result=await assist(m,input,async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)}}]})));
 assert.deepEqual(result,response);assert.deepEqual(m,before);
 await assert.rejects(assist(m,input,async()=>new Response(JSON.stringify({choices:[{message:{content:'{"approved":true}'}}]}))),/ungültig/);
 } finally{Object.assign(config,prior);}
 assert.throws(()=>assistanceMessages(m,{...input,mode:'integration'}),/Einwände/);
 command(m,actor,{type:'agenda.proposal',id:m.agenda[0].id,proposal:'Reviewed wording',objections:'Cost'});
 assert.equal(m.agenda[0].proposal,'Reviewed wording');assert.equal(m.agenda[0].phase,0);assert.equal(m.agenda[0].status,'open');assert.equal(m.outcomes.length,0);
 await assert.rejects(getMeeting(store,{...actor,id:'stranger',admin:false},m.id,true),/Zugriff/);
 m.status='completed';assert.throws(()=>command(m,actor,{type:'agenda.proposal',id:m.agenda[0].id,proposal:'Late'}),/abgeschlossen/);
 assert.equal(assistanceResult.safeParse({proposal:'',rationale:'',questions:[],objectionResponses:[]}).success,false);
 }finally{await store.close();}
});

test('assistance HTTP route is read-only, checks revision, and accepts only a separate reviewed save',async t=>{
 const express=(await import('express')).default;
 const {createApp}=await import('../server/app.js');
 const mock=express();mock.use(express.json());let calls=0;
 mock.post('/ai',(req,res)=>{calls++;assert.match(req.body.messages[0].content,/Respond in es/);res.json({choices:[{message:{content:JSON.stringify({proposal:'Propuesta',rationale:'Motivo',questions:[],objectionResponses:[{objection:'Coste',suggestion:'Limitar el alcance'}]})}}]});});
 const remote=mock.listen(0,'127.0.0.1');await new Promise<void>(r=>remote.once('listening',r));
 const prior={aiUrl:config.aiUrl,aiModel:config.aiModel};config.aiUrl=`http://127.0.0.1:${(remote.address() as import('node:net').AddressInfo).port}/ai`;config.aiModel='test';
 const store=new Store(':memory:');await store.initialize();const server=createApp(store).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 t.after(async()=>{Object.assign(config,prior);await new Promise<void>(r=>server.close(()=>r()));await new Promise<void>(r=>remote.close(()=>r()));await store.close();});
 const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/api`;
 const call=(path:string,body?:unknown)=>fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const bootstrap=await(await call('/bootstrap')).json();const template=bootstrap.templates.find((t:Template)=>t.category==='governance');
 let m=await(await call('/meetings',{templateId:template.id,title:'Test',circle:'Team'})).json();const path=`/meetings/${m.id}`;
 m=await(await call(path+'/command',{revision:m.revision,type:'agenda.add',stepId:template.steps[2].id,title:'Proposal'})).json();
 const input={mode:'integration',agendaId:m.agenda[0].id,proposal:'Initial',objections:'Coste',language:'es'};
 assert.equal((await call(path+'/assist',{revision:1,input})).status,409);assert.equal(calls,0);
 const reply=await(await call(path+'/assist',{revision:m.revision,input})).json();assert.equal(reply.suggestion.proposal,'Propuesta');assert.equal(calls,1);
 const unchanged=await(await call(path)).json();assert.deepEqual(unchanged,m);
 m=await(await call(path+'/command',{revision:m.revision,type:'agenda.proposal',id:input.agendaId,proposal:reply.suggestion.proposal,objections:input.objections})).json();assert.equal(m.agenda[0].proposal,'Propuesta');assert.equal(m.outcomes.length,0);
 assert.equal((await call(path+'/command',{revision:reply.revision,type:'agenda.proposal',id:input.agendaId,proposal:'Stale'})).status,409);
});
