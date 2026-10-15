import assert from 'node:assert/strict';
import {BOARD_LIMITS,type BoardDefinition} from '../contracts/board.ts';
import type {ServiceRecords} from '../contracts/services.ts';
import {saveServicePreset} from '../core/accounts/index.ts';
import {BOARD_REASONS,boardNumber,boardPresetIds,readBoardDefinition,resolveBoard,type BoardRead} from '../core/board/index.ts';

// The board (contracts/board.ts, core/board/board.ts): a definition of tabs and blocks that name Service presets,
// checked; and the resolver that turns it and the presets' reads into what each block shows, with a plain error for
// each block that cannot be shown and no model.
const now='2026-10-15T12:00:00.000Z';
const refused=(work:()=>unknown,reason:string|RegExp)=>assert.throws(work,(error:Error)=>typeof reason==='string'?error.message===reason:reason.test(error.message));

let presets=saveServicePreset([],{id:'funnel',name:'Funnel this week',provider:'posthog',read:{operation:'query',query:'SELECT 1200 AS visited, 300 AS downloaded, 120 AS installed, 0 AS retained'}},now).presets;
presets=saveServicePreset(presets,{id:'signups',name:'Signups by day',provider:'posthog',read:{operation:'query',query:'SELECT toDate(timestamp) AS day, count() AS signups FROM events GROUP BY day ORDER BY day LIMIT 30'}},now).presets;
presets=saveServicePreset(presets,{id:'open-prs',name:'Open pull requests',provider:'github',read:{operation:'search',query:'repo:example/app is:open is:pr'}},now).presets;
presets=saveServicePreset(presets,{id:'workers',name:'Workers',provider:'cloudflare',read:{operation:'read',id:'workers'}},now).presets;

const definition={title:'Product',tabs:[
 {id:'growth',title:'Growth',blocks:[
  {id:'north-star',title:'Installs this week',kind:'number',preset:'funnel',field:'installed',goodAtLeast:100},
  {id:'funnel',title:'Funnel',kind:'funnel',preset:'funnel',steps:[{field:'visited',label:'Visited'},{field:'downloaded',label:'Downloaded'},{field:'installed',label:'Installed'}]},
  {id:'signups',title:'Signups',kind:'trend',preset:'signups',x:'day',y:'signups'},
 ]},
 {id:'health',title:'Health',blocks:[
  {id:'prs',title:'Open pull requests',kind:'list',preset:'open-prs',fields:['repository','author'],limit:2},
  {id:'pr-count',title:'Pull requests open',kind:'number',preset:'open-prs',goodAtMost:5},
  {id:'errors',title:'Worker errors',kind:'number',preset:'workers',field:'errors',goodAtMost:0},
  {id:'gone',title:'Missing preset',kind:'number',preset:'nothing-here'},
 ]},
]};

// Checking a definition: exactly what each kind takes, unique IDs, sizes, no secrets or control characters.
const board=readBoardDefinition(definition);
assert.deepEqual(board,definition,'a valid board is kept as it is');
assert.equal(readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[]}]}).title,'Board');
assert.deepEqual(boardPresetIds(board),['funnel','signups','open-prs','workers','nothing-here']);
assert.deepEqual(boardPresetIds(board,'growth'),['funnel','signups']);
const block=(more:object)=>({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'number',preset:'funnel',...more}]}]});
refused(()=>readBoardDefinition(block({kind:'pie'})),BOARD_REASONS.kind);
refused(()=>readBoardDefinition(block({steps:[]})),BOARD_REASONS.invalid);
refused(()=>readBoardDefinition(block({query:'SELECT 1'})),BOARD_REASONS.invalid);
refused(()=>readBoardDefinition(block({provider:'posthog'})),BOARD_REASONS.invalid);
refused(()=>readBoardDefinition(block({preset:'Not An Id'})),/preset/);
refused(()=>readBoardDefinition(block({id:'B B'})),BOARD_REASONS.id);
refused(()=>readBoardDefinition(block({title:'sk-'+'a'.repeat(30)})),BOARD_REASONS.secret);
refused(()=>readBoardDefinition(block({title:'two\nlines'})),BOARD_REASONS.control);
refused(()=>readBoardDefinition(block({field:'x'.repeat(BOARD_LIMITS.field+1)})),BOARD_REASONS.field);
refused(()=>readBoardDefinition(block({goodAtLeast:5,goodAtMost:1})),/goodAtLeast/);
refused(()=>readBoardDefinition(block({goodAtLeast:Infinity})),BOARD_REASONS.invalid);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'funnel',preset:'p',steps:[{field:'a'}]}]}]}),/2 to 8 steps/);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'funnel',preset:'p',steps:[{field:'a'},{field:'a'}]}]}]}),/its own field/);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'list',preset:'p',limit:21}]}]}),/1 to 20/);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'trend',preset:'p',x:'day'}]}]}),BOARD_REASONS.field);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[]},{id:'a',title:'Again',blocks:[]}]}),BOARD_REASONS.duplicate);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'number',preset:'p'}]},{id:'c',title:'C',blocks:[{id:'b',title:'B',kind:'number',preset:'p'}]}]}),BOARD_REASONS.duplicate);
refused(()=>readBoardDefinition({tabs:[]}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({tabs:Array.from({length:9},(_,i)=>({id:'t'+i,title:'T',blocks:[]}))}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:Array.from({length:17},(_,i)=>({id:'b'+i,title:'B',kind:'number',preset:'p'}))}]}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:Array.from({length:16},(_,i)=>({id:'b'+i,title:'B',kind:'number',preset:'p'+i}))},{id:'c',title:'C',blocks:Array.from({length:5},(_,i)=>({id:'c'+i,title:'C',kind:'number',preset:'q'+i}))}]}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({...definition,owner:'alex'}),BOARD_REASONS.invalid);

// Numbers from a read: numbers, or text that is only a decimal number.
assert.deepEqual([boardNumber(3),boardNumber('42'),boardNumber(' -1.5 '),boardNumber('1e3'),boardNumber(''),boardNumber(NaN),boardNumber(true)],[3,42,-1.5,null,null,null,null]);

// Resolving: each block from its preset's read; errors stay on their own block.
const records=(provider:string,rows:ServiceRecords['records'],more:Partial<ServiceRecords>={}):BoardRead=>({records:{provider,operation:'query',records:rows,scope:provider+' scope',...more}});
const row=(title:string,fields:Record<string,string|number|boolean>,url='https://example.com/'+title)=>({id:title,title,url,fields});
const reads:Record<string,BoardRead>={
 funnel:records('posthog',[row('1200',{visited:1200,downloaded:'300',installed:120,retained:0})]),
 signups:records('posthog',[row('a',{day:'2026-10-13',signups:10}),row('b',{day:'2026-10-14',signups:14}),row('c',{day:'2026-10-15',signups:11})]),
 'open-prs':records('github',[row('One',{repository:'example/app',author:'alex',number:1}),row('Two',{repository:'example/app',number:2}),row('Three',{repository:'example/app',number:3})],{cursor:'2'}),
 workers:{error:'Cloudflare is disconnected or its token has expired. Connect Cloudflare again with a new API token.'},
};
const view=resolveBoard(board,presets,reads,now);
assert.equal(view.title,'Product');assert.equal(view.resolvedAt,now);
const [growth,health]=view.tabs;
assert.deepEqual(growth.blocks[0],{id:'north-star',title:'Installs this week',kind:'number',preset:'funnel',provider:'posthog',scope:'posthog scope',status:'ok',number:{value:120,tone:'good'}});
assert.deepEqual(growth.blocks[1].funnel,{steps:[{label:'Visited',count:1200,rate:null},{label:'Downloaded',count:300,rate:0.25},{label:'Installed',count:120,rate:0.4}],overall:0.1});
assert.deepEqual(growth.blocks[2].trend,{points:[{x:'2026-10-13',y:10},{x:'2026-10-14',y:14},{x:'2026-10-15',y:11}],latest:11,change:-3});
assert.deepEqual(health.blocks[0].list,{items:[{title:'One',url:'https://example.com/One',fields:{repository:'example/app',author:'alex'}},{title:'Two',url:'https://example.com/Two',fields:{repository:'example/app'}}],more:true});
assert.deepEqual(health.blocks[1].number,{value:3,tone:'good'},'without a field: how many records came back');
assert.deepEqual([health.blocks[2].status,health.blocks[2].provider,health.blocks[2].error],['error','cloudflare','Cloudflare is disconnected or its token has expired. Connect Cloudflare again with a new API token.']);
assert.deepEqual([health.blocks[3].status,health.blocks[3].error],['error','No Service preset named “nothing-here”. Save it first.']);
// A tab alone; a preset not read; fields the read lacks; values that are not numbers; empty reads; a funnel whose first
// step is 0; a bad tone.
assert.deepEqual(resolveBoard(board,presets,reads,now,'health').tabs.map(tab=>tab.id),['health']);
assert.equal(resolveBoard(board,presets,{},now).tabs[0].blocks[0].error,'This preset was not read.');
const one=(more:object,read:BoardRead)=>resolveBoard(readBoardDefinition(block(more)),presets,{funnel:read},now).tabs[0].blocks[0];
assert.equal(one({field:'missing'},reads.funnel).error,'The read has no field “missing”.');
assert.equal(one({field:'x'},records('posthog',[row('r',{x:'many'})])).error,'“x” is not a number.');
assert.equal(one({field:'x'},records('posthog',[])).error,'The read returned nothing.');
assert.deepEqual(one({},records('posthog',[])).number,{value:0});
assert.deepEqual(one({field:'x',goodAtLeast:10,goodAtMost:20},records('posthog',[row('r',{x:25})])).number,{value:25,tone:'bad'});
assert.deepEqual(one({kind:'funnel',steps:[{field:'retained',label:'Retained'},{field:'installed',label:'Installed'}]},reads.funnel).funnel,{steps:[{label:'Retained',count:0,rate:null},{label:'Installed',count:120,rate:null}],overall:null});
assert.equal(one({kind:'trend',x:'day',y:'signups'},records('posthog',[row('r',{signups:3})])).error,'The read has no field “day”.');
assert.deepEqual(one({kind:'trend',x:'day',y:'signups'},records('posthog',[row('r',{day:'2026-10-15',signups:3})])).trend,{points:[{x:'2026-10-15',y:3}],latest:3,change:null});
assert.equal(one({kind:'trend',x:'day',y:'signups'},records('posthog',[])).error,'The read returned nothing.');
assert.equal(one({kind:'list'},records('posthog',Array.from({length:30},(_,i)=>row('r'+i,{})))).list?.items.length,BOARD_LIMITS.listDefault);
assert.equal(one({},{error:'x'.repeat(1000)}).error?.length,BOARD_LIMITS.error,'a Service error is cut short');
// Nothing but the definition, the presets and the reads goes in; the same in gives the same out.
assert.deepEqual(resolveBoard(board,presets,reads,now),view);
const typed:BoardDefinition=board;assert.ok(typed);
console.log('PASS board: definitions checked (kinds, IDs, sizes, no secrets), resolved from preset reads into numbers, funnels, lists and trends, with a plain error per block and no model.');
