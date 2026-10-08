import assert from 'node:assert/strict';
import {homeWritePlan,todoistWriteReview,todoistWriteResult} from '../core/applets/index.ts';
import {worldActions,resolveAction} from '../core/tools/index.ts';
const plan={provider:'todoist',operation:'complete',id:'t123'};
const source={object:{id:'t123',content:'Exact task',description:'Full description',recurring:false,checked:false,projectId:'p123'},childCount:0,children:[]};
const expected=todoistWriteReview({plan,source});
assert.equal(homeWritePlan(plan).connectionTransport,'hermes');
assert.equal(todoistWriteReview({plan,source,expected:JSON.parse(JSON.stringify(expected))}).targetTitle,'Exact task');
// Native dictionaries may reorder keys without changing the reviewed values.
assert.doesNotThrow(()=>todoistWriteReview({plan,source,expected:{snapshot:Object.fromEntries(Object.entries(expected.snapshot).reverse())}}));
for(const patch of [{id:'other'},{content:'Changed'},{description:'Changed'},{recurring:'every day'},{checked:true},{isDeleted:true},{isUncompletable:true},{recurring:undefined}])assert.throws(()=>todoistWriteReview({plan,source:{...source,object:{...source.object,...patch}},expected}));
for(const patch of [{childCount:1},{childrenError:'unavailable'},{hasMoreChildren:true},{childCount:undefined},{children:undefined}])assert.throws(()=>todoistWriteReview({plan,source:{...source,...patch}}));
for(const bad of [{...plan,id:'../bad'},{...plan,operation:'delete'},{...plan,title:'Ignored'},{...plan,connectionTransport:'hermes'}])assert.throws(()=>homeWritePlan(bad));
const result={receipt:{completed:['t123'],failures:[],totalRequested:1,successCount:1,failureCount:0},observed:{object:{...source.object,checked:true}}};
assert.equal(todoistWriteResult({id:'t123',result}).status,'verified');
for(const patch of [{observed:source},{observed:{object:{id:'other',checked:true}}},{receipt:{...result.receipt,completed:[]}},{receipt:{...result.receipt,failureCount:1}},{observed:null}])assert.throws(()=>todoistWriteResult({id:'t123',result:{...result,...patch}}));
assert.equal(resolveAction(worldActions(),'applet:todoist','draft',{operation:'complete',id:'t123'}).name,'prepare_home_change');
assert.ok(!worldActions().some(a=>a.target==='todoist'&&a.action==='commit'));
console.log('PASS Todoist review eligibility, stale-task rejection, strict completion receipt/readback and model cannot commit.');
