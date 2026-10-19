// Settings › Context (issue #674, context/sources/world-context.ts): how much each kind of context the World keeps holds,
// in plain words (only past conversations are counted), each Service named and the largest first, and the host's sizes
// read from a real temporary SQLite ledger (WorldLedger.contextSizes): conversations and their notes, each Service's
// synced pages and snapshot, the Journal's cards apart from what Agents saved, and the board. Synthetic records only.
import assert from 'node:assert/strict';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {contextAmount,contextServiceName,readWorldContextSizes,worldContextRows,worldContextServices} from '../context/sources/index.ts';
import {CONNECTOR_TECHNICAL_WORDS} from '../context/sources/index.ts';

assert.deepEqual([0,-5,Number.NaN,1,1023,1024,1536,10_240,1_048_576,1_400_000,12*1024**3].map(contextAmount),
 ['Nothing yet','Nothing yet','Nothing yet','Under 1 KB','Under 1 KB','1 KB','2 KB','10 KB','1 MB','1.3 MB','12 GB']);
assert.deepEqual([contextServiceName('gmail'),contextServiceName('github'),contextServiceName('search-console'),contextServiceName('other')],['Google','GitHub','Search Console','other']);
assert.equal(readWorldContextSizes({available:false}),null,'the practice world keeps nothing of the person\'s own');
assert.equal(readWorldContextSizes(null),null);
const sizes=readWorldContextSizes({available:true,conversations:{count:1,bytes:300},services:[{provider:'github',bytes:2048},{provider:'posthog',bytes:9000},{provider:'',bytes:5},{bytes:3}],journal:{bytes:-1},agentOutputs:{bytes:'x'},board:{}});
assert.deepEqual(sizes,{conversations:{count:1,bytes:300},services:[{provider:'github',bytes:2048},{provider:'posthog',bytes:9000}],journal:{bytes:0},agentOutputs:{bytes:0},board:{bytes:0}},'what the host said, checked');
const rows=worldContextRows(sizes,0);
assert.deepEqual(rows.map(r=>[r.id,r.amount,r.empty]),[['conversations','1 past conversation',false],['memory','Nothing yet',true],['services','11 KB',false],['journal','Nothing yet',true],['agent-outputs','Nothing yet',true],['board','Not set up',true]]);
assert.equal(worldContextRows(null,0)[0].amount,'None yet');
assert.equal(worldContextRows({...sizes!,conversations:{count:3,bytes:9}},0)[0].amount,'3 past conversations','only conversations are counted');
assert.deepEqual(worldContextServices(sizes),[{provider:'posthog',name:'PostHog',amount:'9 KB'},{provider:'github',name:'GitHub',amount:'2 KB'}],'the largest first');
for(const row of rows)for(const text of [row.title,row.line,row.amount])assert.doesNotMatch(text,CONNECTOR_TECHNICAL_WORDS,'plain words: '+text);

await withTempDir('worldlet-world-context-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 const empty=ledger.contextSizes();
 assert.deepEqual(empty,{conversations:{count:0,bytes:0},services:[],journal:{bytes:0},agentOutputs:{bytes:0},board:{bytes:0}},'a new World keeps nothing');
 // Two conversations of Fox's and one an Agent brought, with a note.
 ledger.addCompanionTurns('fox',[{id:'t1',session:'s1',role:'user',text:'Hello',createdAt:'2026-10-18T09:00:00Z'},{id:'t2',session:'s1',role:'assistant',text:'Hi there',createdAt:'2026-10-18T09:00:01Z'},
  {id:'t3',session:'s2',role:'user',text:'Weather?',createdAt:'2026-10-18T10:00:00Z'}]);
 ledger.addCompanionTurns('openclaw',[{id:'t4',session:'s1',role:'user',text:'Plan the trip',createdAt:'2026-10-17T10:00:00Z'}]);
 // A Service's synced snapshot, and an older revision of it that no longer counts.
 ledger.put('service-sync-jobs','github-updates',{id:'github-updates',provider:'github'});
 ledger.put('service-sync-snapshots','github-updates',{id:'github-updates',records:['x'.repeat(5000)]});
 ledger.put('service-sync-snapshots','github-updates',{id:'github-updates',records:['x'.repeat(100)]});
 // Fox's card and an Agent's, with the Agent's page.
 ledger.saveArtifacts([{id:'art-000000000001',title:'Plan',updatedAt:1},{id:'art-000000000002',title:'Build',agentId:'claude-code',updatedAt:2}]);
 ledger.saveArtifactPage({id:'art-000000000002',html:'y'.repeat(4000),createdAt:2});
 ledger.saveBoard({tiles:[{id:'stars'}]});
 const kept=ledger.contextSizes();
 assert.deepEqual(kept.conversations,{count:3,bytes:'Hello'.length+'Hi there'.length+'Weather?'.length+'Plan the trip'.length},'three past conversations: Fox\'s two and the one brought');
 assert.equal(kept.services.length,1);
 assert.equal(kept.services[0].provider,'github');
 assert.ok(kept.services[0].bytes>100&&kept.services[0].bytes<1000,'only what is kept now: '+kept.services[0].bytes);
 assert.ok(kept.journal.bytes>0&&kept.journal.bytes<200,'Fox\'s card: '+kept.journal.bytes);
 assert.ok(kept.agentOutputs.bytes>4000,'the Agent\'s card with its page: '+kept.agentOutputs.bytes);
 assert.equal(kept.board.bytes,JSON.stringify({tiles:[{id:'stars'}]}).length);
 ledger.close();
});
console.log('PASS Settings › Context: how much each kind of context holds in plain words (only past conversations counted), each Service named, the largest first, and the host\'s sizes from a real ledger (conversations, synced Services as kept now, the Journal apart from Agents\' saves with their pages, the board)');
