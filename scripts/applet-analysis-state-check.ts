import assert from 'node:assert/strict';
import {appletAnalysisCommit,appletAnalysisPending,appletObservations,appletAnalysisItems,appletAnalysisRequest} from '../core/applets/index.ts';
const records=[{id:'one',text:'Original fixture',metadataOnly:false},{id:'two',text:'Other fixture',metadataOnly:false}];
const base={provider:'gmail',records,latest:records,saved:{},items:[],processed:['one'],now:100};
const saved=appletAnalysisCommit(base);
assert.deepEqual(appletAnalysisPending(records,saved).map(r=>r.id),['two']);
assert.deepEqual(appletAnalysisPending(records.map(r=>({...r,observedAt:200})),saved).map(r=>r.id),['two']);
assert.throws(()=>appletAnalysisCommit({...base,latest:[{...records[0],text:'Changed'},records[1]]}),/changed/);
assert.throws(()=>appletAnalysisCommit({...base,processed:['unknown']}),/checkpoint/);
const item={provider:'gmail',kind:'update',title:'Fixture update',reason:'A change matters',summary:'The fictional source changed.',sources:[{provider:'gmail',id:'two',quote:'Other fixture'}]};
assert.throws(()=>appletAnalysisCommit({...base,items:[item]}),/covered/);
const next=appletAnalysisCommit({...base,items:[item],processed:['two'],saved});
assert.equal(appletAnalysisPending(records,next).length,0);
assert.deepEqual(next.publishRecords,[records[1]]);
assert.equal(saved.items.length,0,'Pure transition must not mutate previous state');
assert.equal(appletObservations(records,[{...records[0],metadataOnly:true}],101)[0].text,'Original fixture');
assert.equal(appletObservations([],Array.from({length:1001},(_,i)=>({id:String(i),text:'fixture'})),100).length,1000);
console.log('PASS Applet analysis: partial checkpoints, revision fencing, cross-source coverage, immutable inputs and bounded observations');
const hashes={one:'v2:existing-hash-one',two:'v2:existing-hash-two'};
const legacy=appletAnalysisCommit({...base,revisions:hashes,saved:{attempted:{one:1,removed:2}}});
assert.equal(legacy.analyzed.one,hashes.one,'host-owned persisted hashes keep their format');
assert.deepEqual(appletAnalysisPending(records,legacy,hashes).map(r=>r.id),['two']);
assert.deepEqual(legacy.attempted,{one:1},'expired observations lose their attempt bookkeeping');
assert.throws(()=>appletAnalysisCommit({...base,revisions:{}}),/revision/);
assert.throws(()=>appletAnalysisPending(records,legacy,{}),/revision/);
assert.throws(()=>appletAnalysisCommit({...base,revisions:hashes,latest:[{...records[0],text:'Changed'},records[1]]}),/changed/,'host hashes never bypass current original evidence');
console.log('PASS retained native checkpoint hashes, pruned attempt state and source evidence fences');

assert.deepEqual(appletAnalysisItems(records,[item,{...item,sources:[{id:'unrelated'}]}]),[item]);

{
 const {appletAnalysisFailed,appletAnalysisRetrying,appletAnalysisParked,appletAnalysisMaxFailures}=await import('../core/applets/analysis-state.ts');
 const {analysisBatch}=await import('../core/applets/analysis-candidates.ts');
 const rows=[{id:'poison',text:'Unparseable thread'},{id:'fresh-1',text:'New mail one'},{id:'fresh-2',text:'New mail two'}];
 let state:Record<string,any>={};
 state=appletAnalysisFailed({records:[rows[0]],saved:state,latest:rows});
 assert.deepEqual(appletAnalysisRetrying(rows,state),['poison']);
 assert.deepEqual(appletAnalysisPending(rows,state).map(r=>r.id),['fresh-1','fresh-2','poison'],'untried mail runs before retries');
 assert.deepEqual(analysisBatch(appletAnalysisPending(rows,state),5,appletAnalysisRetrying(rows,state)).map(r=>r.id),['fresh-1','fresh-2'],'a failing record never rejoins a healthy batch');
 assert.deepEqual(analysisBatch([rows[0]],5,['poison']).map(r=>r.id),['poison'],'a retry runs alone');
 for(let i=1;i<appletAnalysisMaxFailures;i++)state=appletAnalysisFailed({records:[rows[0]],saved:state,latest:rows});
 assert.deepEqual(appletAnalysisParked(rows,state),['poison']);
 assert.deepEqual(appletAnalysisPending(rows,state).map(r=>r.id),['fresh-1','fresh-2'],'parked input stops spending model budget');
 const edited=[{...rows[0],text:'Unparseable thread, with a new reply'},rows[1],rows[2]];
 assert.deepEqual(appletAnalysisPending(edited,state).map(r=>r.id),['poison','fresh-1','fresh-2'],'a new source revision releases a parked record');
 const committed=appletAnalysisCommit({provider:'gmail',records:[rows[1]],latest:rows,saved:state,items:[],processed:['fresh-1'],now:5});
 assert.equal((committed.failures.poison as {attempts:number}).attempts,appletAnalysisMaxFailures,'commit keeps sibling failure state');
 assert.equal(appletAnalysisFailed({records:[rows[1]],saved:committed,latest:rows}).failures['fresh-1'],undefined,'committed records never count as failed');
 assert.deepEqual(appletAnalysisFailed({records:[],saved:committed,latest:[rows[1]]}).failures,{},'removed sources drop failure state');
 console.log('PASS repeated S failures run alone, then park until the source changes; healthy mail keeps flowing');
}
// The batch reaches a person's Agent only through query_world_items, so the request says to read it there (Mac Alpha
// 4090: Codex answered "No source batch was supplied" and every analysis failed).
assert.match(appletAnalysisRequest(60).text,/read it with query_world_items[\s\S]*submit with upsert_world_items/);
console.log('PASS an analysis turn is told to read its batch with query_world_items');
