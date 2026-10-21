import assert from 'node:assert/strict';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/host/store/ledger.ts';
import {contextChanges,contextReads,ledgerContext} from '../platform/host/store/context-storage.ts';
import {CONTEXT_DOMAINS,CONTEXT_KINDS,CONTEXT_REFUSALS,ContextRefused,agentContext,contextEnvelope,contextReader,contextTime,contextWriter,syncedWriter,type ContextCall,type ContextGuard,type ContextStorage} from '../context/store/index.ts';
import {GRANT_REASONS,STANDING_OUTSIDE_TURN,agentAuditEntry,agentContextWrites,artifactGrant,channelDefaultGrants,standingCallDecision} from '../agent/gate/index.ts';
import type {AgentAuditEntry,AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {connectorWriter} from '../context/connectors/index.ts';

// The one way in to Context (#676, context/store/context.ts) with fictional records: every domain has one kind; the
// envelope is read from records as they are stored today; the general writer refuses Synced and the Connector's writer
// writes only Synced; one search covers the four kinds; the host's storage keeps the same tables and shapes; and an
// Agent reaches Context only in a call the entry admitted against its Grants, each decision audited, while the person and
// Fox are never asked for one.

// Every domain belongs to exactly one of the four kinds, once.
assert.deepEqual([...new Set(CONTEXT_DOMAINS.map(domain=>domain.kind))].sort(),[...CONTEXT_KINDS].sort());
assert.equal(new Set(CONTEXT_DOMAINS.map(domain=>domain.id)).size,CONTEXT_DOMAINS.length);

// Times: seconds, milliseconds and ISO strings are all stored today.
assert.equal(contextTime(1_760_000_000),1_760_000_000_000);
assert.equal(contextTime(1_760_000_000_000),1_760_000_000_000);
assert.equal(contextTime('2026-10-19T08:00:00.000Z'),Date.parse('2026-10-19T08:00:00.000Z'));
assert.equal(contextTime(undefined),null);

// The envelope from the fields a record already has.
assert.deepEqual(contextEnvelope('artifacts',{id:'art-1',agentId:'agent-alex',createdAt:100,updatedAt:200,version:3,sources:[{id:'src-1'}]}),
 {id:'art-1',kind:'made',domain:'artifacts',origin:{by:'agent',id:'agent-alex'},createdAt:100_000,updatedAt:200_000,revision:3,derivedFrom:['src-1']});
assert.deepEqual(contextEnvelope('service-sync',{id:'sync-1',provider:'github',collectedAt:300}).origin,{by:'service',id:'github'});
assert.equal(contextEnvelope('agent-reports',{agentId:'agent-sam',at:'2026-10-19T08:00:00.000Z'}).id,'agent-sam');
assert.deepEqual(contextEnvelope('ongoing',{id:'job-1',origin:'user'}).origin,{by:'person'});

// A small storage: what the entry asks of Platform.
const rows:Record<string,Record<string,any>[]>={artifacts:[{id:'art-1',title:'Garden plan',body:'Plant tomatoes in May',updatedAt:10}],
 'service-sync':[{id:'sync-1',provider:'github',records:[{title:'Tomato issue',text:'Fix the tomato counter'}],collectedAt:20}],
 'attention-items':[{id:'item-1',title:'Water the garden',summary:'Tomatoes need water'}]};
const writes:string[]=[];
const domain=(id:string)=>({rows:()=>rows[id],write:(change:any)=>{writes.push(id);rows[id]=[...rows[id].filter(row=>!(change.forget??[]).includes(row.id)&&!(change.save??[]).some((saved:any)=>saved.id===row.id)),...change.save??[]];}});
const storage:ContextStorage={domains:{artifacts:domain('artifacts'),'service-sync':domain('service-sync'),'attention-items':domain('attention-items')}};
const reader=contextReader(storage);
assert.deepEqual(reader.domains().map(item=>item.id),['service-sync','artifacts','attention-items']);
assert.equal(reader.get('artifacts','art-1')?.body.title,'Garden plan');
assert.equal(reader.get('artifacts','art-missing'),null);
assert.throws(()=>reader.read('widgets'),/does not keep/);
assert.throws(()=>reader.read('nothing' as any),/Unknown Context domain/);

// One search across kinds: every term must appear; a title match ranks first; kinds narrow it.
assert.deepEqual(reader.search('tomato').map(hit=>hit.record.domain),['service-sync','artifacts','attention-items']);
assert.deepEqual(reader.search('garden tomatoes').map(hit=>hit.record.id),['art-1','item-1']);
assert.deepEqual(reader.search('tomato',{kinds:['made','known']}).map(hit=>hit.record.kind),['made','known']);
assert.deepEqual(reader.search('tomato',{domains:['attention-items']}).map(hit=>hit.title),['Water the garden']);
assert.deepEqual(reader.search('   '),[]);
assert.match(reader.search('counter')[0].snippet,/tomato counter/);

// Writers: the general one refuses Synced; the Connector's writes only Synced.
const fox=contextWriter(storage,'fox');
fox.write('artifacts',{save:[{id:'art-2',title:'Shopping list',updatedAt:30}]});
assert.deepEqual(reader.bodies('artifacts').map(row=>row.id),['art-1','art-2']);
fox.remove('artifacts',['art-1']);
assert.deepEqual(reader.bodies('artifacts').map(row=>row.id),['art-2']);
assert.throws(()=>fox.write('service-sync',{save:[{id:'sync-2'}]}),/kept up to date by its Connector/);
assert.throws(()=>contextWriter(storage,{by:'agent',id:'agent-alex'} as any),/only in a call its Grants allowed/,'an Agent never writes without an admitted call');
assert.throws(()=>contextWriter(storage,'agent' as any),ContextRefused);
assert.throws(()=>syncedWriter(storage,'github').write('artifacts',{save:[]}),/not Synced/);
connectorWriter(storage,'github').write('service-sync',{save:[{id:'sync-1',provider:'github',records:[],collectedAt:40}]});
assert.equal(reader.get('service-sync','sync-1')?.updatedAt,40_000);
const writesBefore=writes.length;fox.remove('artifacts',[]);assert.equal(writes.length,writesBefore,'nothing to forget writes nothing');

// Who writes travels with the write: the host marks an ask's or a draft's Attention item as the person's or an Agent's
// from it, as each module passed by hand before; a domain's own reads and changes go through the entry too.
{
 const saved:string[]=[];
 const fake={agentAsks:()=>[],saveAgentAsk:(_ask:any,item:any,origin:string)=>{saved.push(item.id+':'+origin);},
  agentAskAttachment:(askId:string,id:string,offset:number,length:number)=>new Uint8Array([askId.length,id.length,offset,length]),
  update:(id:string,status:string,snoozedUntil:any,readOnly:boolean,by:any)=>{saved.push([id,status,snoozedUntil,readOnly,by].join(','));},value:()=>null} as any;
 const context=ledgerContext(fake);
 contextWriter(context,'person').write('agent-asks',{save:[{id:'a1'}],with:{item:{id:'ask-a1'}}});
 const asks=agentContext({decide:()=>({decision:'allowed',writes:['agent-asks']}),audit(){}},{agentId:'agent-alex',target:'asks',action:'post'});
 asks.writer(context).write('agent-asks',{save:[{id:'a1'}],with:{item:{id:'ask-a1'}}});
 contextWriter(context,'person').write('attention-items',{operation:'status',with:{id:'i1',status:'read',snoozedUntil:null,readOnly:true}});
 assert.deepEqual(saved,['ask-a1:user','ask-a1:agent','i1,read,,true,']);
 assert.deepEqual([...contextReader(context).query<Uint8Array>('agent-asks','attachment',{askId:'a1',id:'f',offset:2,length:9})],[2,1,2,9]);
 assert.throws(()=>contextReader(context).query('agent-asks','pages'),/no pages/);
 assert.throws(()=>contextWriter(context,'person').write('attention-items',{operation:'erase'}),/no erase/);
 assert.throws(()=>contextWriter(context,{by:'service',id:'github'} as any),/Connector/);
 assert.equal(connectorWriter(context,'github').author.id,'github');
}

// The host's storage: the same tables and shapes as before, and a transaction that keeps several writes together.
await withTempDir('worldlet-context-entry-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 try{
  const context=ledgerContext(ledger),read=contextReader(context),write=contextWriter(context,'fox');
  write.write('artifacts',{save:[{id:'art-abcdefghijkl',kind:'answer',title:'A table',body:'| pears | 3 |',agentId:'agent-alex',updatedAt:3}]});
  assert.deepEqual(ledger.artifactRows().map(row=>row.title),['A table']);
  assert.deepEqual(read.get('artifacts','art-abcdefghijkl')?.origin,{by:'agent',id:'agent-alex'});
  write.write('artifact-pages',{save:[{id:'art-abcdefghijkl',html:'<p>pears</p>',createdAt:3}]});
  assert.equal(ledger.artifactPage('art-abcdefghijkl')?.html,'<p>pears</p>');
  write.remove('artifact-pages',['art-abcdefghijkl']);assert.equal(ledger.artifactPage('art-abcdefghijkl'),null);
  write.write('widgets',{save:[{id:'wgt-0123456789',title:'A moment'}],with:{html:'<p>moment</p>',state:{ticked:[1]}}});
  assert.equal(ledger.widgetPage('wgt-0123456789'),'<p>moment</p>');
  assert.deepEqual(ledger.widgetRows(),[{record:{id:'wgt-0123456789',title:'A moment'},state:{ticked:[1]}}]);
  write.write('widgets',{save:[{id:'wgt-0123456789',title:'Renamed'}],with:{id:'wgt-0123456789'}});
  assert.deepEqual(ledger.widgetRows(),[{record:{id:'wgt-0123456789',title:'Renamed'},state:{ticked:[1]}}],'a record alone keeps the page and its state');
  write.write('made-games',{save:[{id:'g-1',title:'Snake',version:1}],with:{html:'<canvas>1</canvas>',versions:3}});
  write.write('made-games',{save:[{id:'g-1',title:'Snake',version:2}],with:{html:'<canvas>2</canvas>',versions:3}});
  assert.deepEqual(ledger.madeGameVersions('g-1'),[{version:1,html:'<canvas>1</canvas>'}]);
  write.write('agent-reports',{save:[{agentId:'agent-alex',status:'working',at:'2026-10-19T08:00:00.000Z'}]});
  assert.equal(read.get('agent-reports','agent-alex')?.body.status,'working');
  write.write('calendar-events',{save:[{id:'evt-1',title:'Dentist'}]});
  write.write('ongoing',{save:[{id:'job-0123456789ab',name:'Garden'}]});
  assert.deepEqual(ledger.ongoingRows(),[{id:'job-0123456789ab',name:'Garden'}]);
  assert.throws(()=>write.transaction(()=>{write.write('board',{save:[{revision:1,definition:{}}]});write.write('service-presets',{save:[{id:'p-1'}]});throw Error('stop');}),/stop/);
  assert.equal(ledger.board(),null,'a failed transaction keeps nothing');assert.deepEqual(ledger.servicePresets(),[]);
  const synced=connectorWriter(context,'github');
  synced.write('service-sync',{save:[{id:'sync-1',provider:'github',records:[{title:'Pears issue'}],collectedAt:5}]});
  synced.write('service-sync',{save:[{id:'sync-1',provider:'github',records:[{title:'Pears issue again'}],collectedAt:6}]});
  assert.equal(ledger.revisions('service-sync-snapshots','sync-1').length,1,'a new snapshot replaces the one before it');
  assert.deepEqual(read.search('pears').map(hit=>hit.record.domain).sort(),['artifacts','service-sync']);
  ledger.addCompanionTurns('fox',[{id:'turn-1',session:'s',role:'user',text:'Remind me about the pears',createdAt:'2026-10-19T08:00:00.000Z'}]);
  assert.deepEqual(read.search('pears',{kinds:['recorded']}).map(hit=>hit.record.domain),['conversations']);
  // A domain's own named reads and changes go through the entry with the ledger's own answers.
  const turns=contextReads(context,'conversations');
  assert.deepEqual(turns.companionTurns('fox').map(turn=>turn.text),['Remind me about the pears']);
  assert.equal(contextChanges(context,'fox','conversations').addCompanionTurns('fox',[{id:'turn-2',session:'s',role:'assistant',text:'I will',createdAt:'2026-10-19T08:01:00.000Z'}]),1);
  assert.equal(turns.companionTurns('fox').length,2);
  contextChanges(context,'fox','companion').saveCompanionStored('private','profile',{name:'Fox'});
  assert.deepEqual(contextReads(context,'companion').companionStored('private','profile'),{name:'Fox'});
  assert.equal(contextReads(context,'widgets').widgetPage('wgt-0123456789'),'<p>moment</p>');
  assert.throws(()=>contextReader(context).query('conversations','dropEverything',{args:[]}),/Not kept here/);
  assert.throws(()=>syncedWriter(context,'x').write('conversations',{operation:'addCompanionTurns',with:{args:['fox',[]]}}),/not Synced/);
 }finally{ledger.close();}
});
// Grants and audit at the entry (agent/gate/GRANTS.md): the host injects the Gate's decision and its audit trail, as the
// standing World tools server does (platform/host/modules/agents/world-tool-bridge.ts). Fictional Agents and records.
{
 const now='2026-10-21T09:00:00.000Z';
 const alex:AgentIdentity={id:'agent-alex',name:'Alex\'s script',harness:'claude-code',kind:'local',createdAt:'2026-10-01T09:00:00.000Z'};
 const sam:AgentIdentity={id:'agent-sam',name:'Sam\'s script',harness:'codex',kind:'local',createdAt:'2026-10-01T09:00:00.000Z'};
 const gone:AgentIdentity={...sam,id:'agent-gone',revokedAt:'2026-10-02T09:00:00.000Z'};
 // Sam may save to the Journal; Alex has only the default Grants every Agent gets, which name no Journal.
 const grants:Grant[]=[...channelDefaultGrants(alex.id,now),...channelDefaultGrants(sam.id,now),artifactGrant(sam.id,'save',now)!];
 const audit:AgentAuditEntry[]=[];
 const guard=(identity:AgentIdentity,tool:string):ContextGuard=>({
  decide:call=>({...standingCallDecision({identity,grants:grants.filter(g=>g.agentId===identity.id),target:call.target,action:call.action,tool,args:{},foxTurn:null,now}),writes:agentContextWrites(call.target)}),
  audit:(call,verdict)=>{audit.push(agentAuditEntry(call.agentId,call.target,call.action,verdict,now));},
 });
 const save:Omit<ContextCall,'agentId'>={target:'agent-artifacts',action:'save'};
 const rows:Record<string,any>[]=[];
 const journal:ContextStorage={domains:{artifacts:{rows:()=>rows,write:change=>{rows.push(...change.save??[]);}},'agent-reports':{rows:()=>[],write:()=>{throw Error('never written');}}}};
 const card={id:'art-sam-1',kind:'answer',title:'Tomato plan',agentId:sam.id,updatedAt:1};

 // An Agent without a Grant: refused before anything is read or written, with the Gate's own words, and audited.
 assert.throws(()=>agentContext(guard(alex,'agent_artifacts'),{agentId:alex.id,...save}),(error:Error)=>error instanceof ContextRefused&&error.message===STANDING_OUTSIDE_TURN);
 assert.deepEqual(audit.at(-1),{at:now,agentId:alex.id,target:'agent-artifacts',action:'save',decision:'denied',reason:STANDING_OUTSIDE_TURN});
 // A revoked Agent: refused as revoked, audited too.
 assert.throws(()=>agentContext(guard(gone,'agent_artifacts'),{agentId:gone.id,...save}),new RegExp(GRANT_REASONS.revoked.replace(/[.']/g,'.')));
 assert.deepEqual(audit.at(-1),{at:now,agentId:gone.id,target:'agent-artifacts',action:'save',decision:'denied',reason:GRANT_REASONS.revoked});

 // An Agent with a Grant: allowed, audited once with the Grant that decided, and it writes as itself.
 const before=audit.length;
 const admitted=agentContext(guard(sam,'agent_artifacts'),{agentId:sam.id,...save});
 assert.deepEqual(audit.slice(before),[{at:now,agentId:sam.id,target:'agent-artifacts',action:'save',decision:'allowed',grantId:'agent-sam-artifacts-save'}],'one record per decision');
 const sams=admitted.writer(journal);
 assert.deepEqual(sams.author,{by:'agent',id:sam.id});
 sams.write('artifacts',{save:[card]});
 assert.deepEqual(contextReader(journal).get('artifacts','art-sam-1')?.origin,{by:'agent',id:sam.id});
 assert.equal(audit.length,before+1,'writing in the admitted call decides nothing again');
 // Only what its call changes: another domain, or Synced, is refused and audited.
 assert.throws(()=>sams.write('agent-reports',{save:[{agentId:sam.id}]}),(error:Error)=>error instanceof ContextRefused&&error.message===CONTEXT_REFUSALS.domain.replace('{label}','agent reports'));
 assert.deepEqual(audit.at(-1),{at:now,agentId:sam.id,target:'agent-artifacts',action:'save',decision:'denied',reason:'This call does not change agent reports.'});
 assert.throws(()=>sams.write('service-sync',{save:[]}),/kept up to date by its Connector/);
 assert.equal(audit.at(-1)?.decision,'denied');
 // A call that changes no Context as an Agent (a default read) is admitted but writes nothing.
 const query=agentContext(guard(alex,'query_world_items'),{agentId:alex.id,target:'items',action:'query'});
 assert.equal(audit.at(-1)?.decision,'allowed');
 assert.throws(()=>query.writer(journal).write('artifacts',{save:[{id:'art-alex'}]}),ContextRefused);
 assert.equal(rows.some(row=>row.id==='art-alex'),false,'nothing was written');
 // Without the host's Grants the entry refuses: there is nothing to decide by.
 assert.throws(()=>agentContext(null,{agentId:sam.id,...save}),(error:Error)=>error instanceof ContextRefused&&error.message===CONTEXT_REFUSALS.unguarded);

 // The person and Fox are never asked: no Grant, no audit, and they write as before.
 const quiet=audit.length;
 contextWriter(journal,'person').write('artifacts',{save:[{id:'art-person',title:'Seeds to buy',updatedAt:2}]});
 contextWriter(journal,'fox').write('artifacts',{save:[{id:'art-fox',title:'Watering times',updatedAt:3}]});
 assert.deepEqual(rows.map(row=>row.id),['art-sam-1','art-person','art-fox']);
 assert.equal(audit.length,quiet,'the person and Fox leave no Agent audit');
}

console.log('PASS one way in to Context: kinds, envelope, search across kinds, Synced only from Connectors, host tables unchanged, Agents only in calls their Grants allowed with each decision audited, the person and Fox never asked');
