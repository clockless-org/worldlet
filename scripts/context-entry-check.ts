import assert from 'node:assert/strict';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/host/store/ledger.ts';
import {ledgerContext} from '../platform/host/store/context-storage.ts';
import {CONTEXT_DOMAINS,CONTEXT_KINDS,contextEnvelope,contextReader,contextTime,contextWriter,syncedWriter,type ContextStorage} from '../context/store/index.ts';
import {connectorWriter} from '../context/connectors/index.ts';

// The one way in to Context (#676, context/store/context.ts) with fictional records: every domain has one kind; the
// envelope is read from records as they are stored today; the general writer refuses Synced and the Connector's writer
// writes only Synced; one search covers the four kinds; and the host's storage keeps the same tables and shapes.

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
assert.throws(()=>contextWriter(storage,{by:'agent',id:'agent-alex'}).remove('service-sync',['sync-1']),/Connector/);
assert.throws(()=>syncedWriter(storage,'github').write('artifacts',{save:[]}),/not Synced/);
connectorWriter(storage,'github').write('service-sync',{save:[{id:'sync-1',provider:'github',records:[],collectedAt:40}]});
assert.equal(reader.get('service-sync','sync-1')?.updatedAt,40_000);
const writesBefore=writes.length;fox.remove('artifacts',[]);assert.equal(writes.length,writesBefore,'nothing to forget writes nothing');

// The host's storage: the same tables and shapes as before, and a transaction that keeps several writes together.
await withTempDir('worldlet-context-entry-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 try{
  const context=ledgerContext(ledger),read=contextReader(context),write=contextWriter(context,{by:'agent',id:'agent-alex'});
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
 }finally{ledger.close();}
});
console.log('PASS one way in to Context: kinds, envelope, search across kinds, Synced only from Connectors, host tables unchanged');
