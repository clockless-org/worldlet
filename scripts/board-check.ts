import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BOARD_LIMITS,type BoardDefinition} from '../contracts/board.ts';
import type {ServiceRecords} from '../contracts/services.ts';
import {PRESET_REASONS,readServicePresetRead,saveServicePreset} from '../core/accounts/index.ts';
import {AGENT_BOARD_REASONS,agentBoardRecords,listAgents,makeAgentReport} from '../core/agent/index.ts';
import type {AgentIdentity} from '../contracts/agent-identity.ts';
import {BOARD_REASONS,BOARD_TONE_WORDS,boardNorthStar,formatBoardNumber,formatBoardRate,defineBoard,boardNumber,boardPresetIds,readBoardDefinition,resolveBoard,type BoardRead} from '../core/board/index.ts';

// The board (contracts/board.ts, core/board/board.ts): a definition of tabs and blocks that name Service presets,
// checked; the resolver that turns it and the presets' reads into what each block shows, with a plain error for each
// block that cannot be shown and no model; and the World's own `agents` source, read from what agents/list returns.
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
const funnelBlock=(steps:object[])=>({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'funnel',preset:'p',steps}]}]});
refused(()=>readBoardDefinition(funnelBlock([{field:'a',goodAtLeast:0.5},{field:'b'}])),/first funnel step/);
refused(()=>readBoardDefinition(funnelBlock([{field:'a'},{field:'b',goodAtLeast:2}])),/rate from 0 to 1/);
refused(()=>readBoardDefinition(funnelBlock([{field:'a'},{field:'b',goodAtLeast:'half'}])),BOARD_REASONS.invalid);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'trend',preset:'p',x:'day'}]}]}),BOARD_REASONS.field);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[]},{id:'a',title:'Again',blocks:[]}]}),BOARD_REASONS.duplicate);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'number',preset:'p'}]},{id:'c',title:'C',blocks:[{id:'b',title:'B',kind:'number',preset:'p'}]}]}),BOARD_REASONS.duplicate);
refused(()=>readBoardDefinition({tabs:[]}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({tabs:Array.from({length:9},(_,i)=>({id:'t'+i,title:'T',blocks:[]}))}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:Array.from({length:17},(_,i)=>({id:'b'+i,title:'B',kind:'number',preset:'p'}))}]}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({tabs:[{id:'a',title:'A',blocks:Array.from({length:16},(_,i)=>({id:'b'+i,title:'B',kind:'number',preset:'p'+i}))},{id:'c',title:'C',blocks:Array.from({length:16},(_,i)=>({id:'c'+i,title:'C',kind:'number',preset:'q'+i}))},{id:'d',title:'D',blocks:[{id:'d0',title:'D',kind:'number',preset:'r0'}]}]}),BOARD_REASONS.size);
refused(()=>readBoardDefinition({...definition,owner:'alex'}),BOARD_REASONS.invalid);

// Collection-only presets cannot enter the live Service board, including unused inline saves.
const notion={id:'notes',name:'Notes',provider:'notion',read:{operation:'read',id:'11111111-1111-4111-8111-111111111111'}};
const collected=saveServicePreset(presets,notion,now).presets;
refused(()=>defineBoard(null,presets,{definition,expectedRevision:0,presets:[notion]},null,now),BOARD_REASONS.collection);
refused(()=>defineBoard(null,collected,{definition:block({preset:'notes'}),expectedRevision:0},null,now),BOARD_REASONS.collection);
assert.equal(defineBoard(null,collected,{definition,expectedRevision:0},null,now).board.revision,1,'unrelated collection presets do not block normal boards');

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
// A step's goodAtLeast colours its rate; a step with no rate (after a 0) has no tone.
assert.deepEqual(one({kind:'funnel',steps:[{field:'a',label:'A'},{field:'b',label:'B',goodAtLeast:0.5},{field:'c',label:'C',goodAtLeast:0.5},{field:'d',label:'D',goodAtLeast:0.1}]},records('posthog',[row('r',{a:100,b:60,c:0,d:0})])).funnel,
 {steps:[{label:'A',count:100,rate:null},{label:'B',count:60,rate:0.6,tone:'good'},{label:'C',count:0,rate:0,tone:'bad'},{label:'D',count:0,rate:null}],overall:0});
assert.equal(one({kind:'trend',x:'day',y:'signups'},records('posthog',[row('r',{signups:3})])).error,'The read has no field “day”.');
assert.deepEqual(one({kind:'trend',x:'day',y:'signups'},records('posthog',[row('r',{day:'2026-10-15',signups:3})])).trend,{points:[{x:'2026-10-15',y:3}],latest:3,change:null});
assert.equal(one({kind:'trend',x:'day',y:'signups'},records('posthog',[])).error,'The read returned nothing.');
assert.equal(one({kind:'list'},records('posthog',Array.from({length:30},(_,i)=>row('r'+i,{})))).list?.items.length,BOARD_LIMITS.listDefault);
assert.equal(one({},{error:'x'.repeat(1000)}).error?.length,BOARD_LIMITS.error,'a Service error is cut short');
// An HTTP JSON preset shows like any other Service's: its records' fields, flat.
const http=saveServicePreset(presets,{id:'uptime',name:'Uptime',provider:'http',read:{operation:'read',id:'status',query:'status.json'}},now).presets;
assert.deepEqual(resolveBoard(readBoardDefinition(block({preset:'uptime',field:'uptime',goodAtLeast:99.5})),http,{uptime:records('http',[row('status/1',{uptime:99.9})])},now).tabs[0].blocks[0].number,{value:99.9,tone:'good'});
// Nothing but the definition, the presets and the reads goes in; the same in gives the same out.
assert.deepEqual(resolveBoard(board,presets,reads,now),view);
const typed:BoardDefinition=board;assert.ok(typed);
// The north-star number the World draws on the board's device: the first tab's first number block, only when it shows a
// value; a read of another tab alone, an error on it, or no board leaves the device empty.
assert.deepEqual(boardNorthStar({definition:board,view}),{title:'Installs this week',value:120,tone:'good'});
assert.equal(boardNorthStar({definition:board,view:resolveBoard(board,presets,reads,now,'health')}),null,'another tab alone says nothing about the first');
assert.equal(boardNorthStar({definition:board,view:resolveBoard(board,presets,{},now)}),null,'an error on that block leaves the device empty');
assert.equal(boardNorthStar({definition:null,view:null}),null);assert.equal(boardNorthStar(null),null);
const untoned=readBoardDefinition({tabs:[{id:'a',title:'A',blocks:[{id:'l',title:'L',kind:'list',preset:'open-prs'},{id:'n',title:'Open',kind:'number',preset:'open-prs'}]}]});
assert.deepEqual(boardNorthStar({definition:untoned,view:resolveBoard(untoned,presets,reads,now)}),{title:'Open',value:3},'no tone without a target; a list before it is passed over');
// How numbers, rates and tones are said.
assert.deepEqual([formatBoardNumber(1234.567),formatBoardNumber(12_345,true),formatBoardNumber(1_250_000,true),formatBoardNumber(-3),formatBoardNumber(NaN)],['1,234.57','12.3K','1.3M','-3','—']);
assert.deepEqual([formatBoardRate(0.25),formatBoardRate(0.1),formatBoardRate(0.045),formatBoardRate(1),formatBoardRate(null)],['25%','10%','4.5%','100%','—']);
assert.deepEqual(BOARD_TONE_WORDS,{good:'On target',bad:'Off target'});

// The World's own `agents` source (core/board/README.md#the-agents-source): presets checked like any other, saved with
// a board, and read from what agents/list returns as runs, Agents or totals, narrowed by tag, role, agent, liveness,
// status and words. Two release machines and a laptop; a revoked Agent never shows.
assert.deepEqual(readServicePresetRead('agents',{operation:'list',id:'runs',query:'  Tag:Release   Beta '}),{operation:'list',id:'runs',query:'tag:release Beta'});
assert.deepEqual(readServicePresetRead('agents',{operation:'list',id:'totals'}),{operation:'list',id:'totals'});
for(const [read,reason] of [[{operation:'read',id:'runs'},/Agents presets read with list/],[{operation:'list'},AGENT_BOARD_REASONS.list],[{operation:'list',id:'machines'},AGENT_BOARD_REASONS.list],
 [{operation:'list',id:'runs',query:'tags:release'},AGENT_BOARD_REASONS.filter],[{operation:'list',id:'runs',query:'status:working'},/runs take status: queued, running, passed, failed, cancelled/],
 [{operation:'list',id:'agents',query:'status:passed'},/agents take status: working, idle, blocked, offline/],[{operation:'list',id:'runs',query:'liveness:dead'},AGENT_BOARD_REASONS.query],
 [{operation:'list',id:'runs',query:'agent:a_b'},AGENT_BOARD_REASONS.query],[{operation:'list',id:'runs',query:'status:'},/take status/],[{operation:'list',id:'runs',query:Array(13).fill('beta').join(' ')},AGENT_BOARD_REASONS.query],
 [{operation:'list',id:'runs',query:'x'.repeat(201)},AGENT_BOARD_REASONS.query],[{operation:'list',id:'runs',query:'beta\nalpha'},AGENT_BOARD_REASONS.query],[{operation:'list',id:'runs',query:'sk-'+'a'.repeat(30)},PRESET_REASONS.secret]] as const)
 refused(()=>readServicePresetRead('agents',read),reason as string|RegExp);
const identities:AgentIdentity[]=[{id:'release-mac',name:'Release Mac',harness:'claude-code',kind:'remote',createdAt:now},{id:'release-pc',name:'Release PC',harness:'codex',kind:'remote',createdAt:now},
 {id:'laptop',name:'Laptop',harness:'codex',kind:'local',createdAt:now},{id:'gone',name:'Gone',harness:'codex',kind:'local',createdAt:now,revokedAt:now}];
const later='2026-10-15T12:20:00.000Z';
const reports=[
 makeAgentReport('release-mac',{status:'working',summary:'Building Beta 1234',role:'release',tags:['release','macos'],capacity:{slots:2,busy:1},runs:[
  {id:'beta-1234-macos',title:'Beta 1234 · macOS',status:'running',url:'https://ci.example.com/runs/1',startedAt:'2026-10-15T12:10:00.000Z'},
  {id:'alpha-1233-macos',title:'Alpha 1233 · macOS',status:'passed',startedAt:'2026-10-15T10:00:00.000Z',finishedAt:'2026-10-15T10:40:00.000Z'},
  {id:'testflight-1232',title:'TestFlight 1232 · iOS',status:'failed',startedAt:'2026-10-15T09:00:00.000Z',finishedAt:'2026-10-15T09:30:00.000Z'}]},'2026-10-15T12:15:00.000Z'),
 makeAgentReport('release-pc',{status:'idle',role:'release',tags:['release','windows'],ttlMinutes:5,runs:[
  {id:'beta-1234-windows',title:'Beta 1234 · Windows',status:'passed',startedAt:'2026-10-15T11:00:00.000Z',finishedAt:'2026-10-15T11:20:00.000Z'}]},now),
 makeAgentReport('gone',{status:'working',runs:[{id:'beta-1234-linux',title:'Beta 1234 · Linux',status:'failed'}]},now),
];
const entries=listAgents(identities,reports,{},later);
const ids=(read:{id:string;query?:string})=>agentBoardRecords(entries,read).records.map(record=>record.id);
const runs=agentBoardRecords(entries,{id:'runs'});
assert.deepEqual([runs.provider,runs.operation,runs.scope,runs.cursor],['agents','list','Runs the Agents in this World reported · Read only',undefined]);
assert.deepEqual(runs.records.map(record=>record.id),['release-mac/beta-1234-macos','release-pc/beta-1234-windows','release-mac/alpha-1233-macos','release-mac/testflight-1232'],'newest run first; a revoked Agent\'s runs never show');
assert.deepEqual(runs.records[0],{id:'release-mac/beta-1234-macos',title:'Beta 1234 · macOS',url:'https://ci.example.com/runs/1',updatedAt:'2026-10-15T12:10:00.000Z',
 fields:{status:'running',agent:'Release Mac',agentId:'release-mac',liveness:'live',role:'release',tags:'release, macos',startedAt:'2026-10-15T12:10:00.000Z'}});
assert.deepEqual([runs.records[1].url,runs.records[1].fields.liveness,runs.records[1].fields.finishedAt],['','stale','2026-10-15T11:20:00.000Z'],'a run with no link; its Agent has gone quiet');
assert.deepEqual(ids({id:'runs',query:'beta'}),['release-mac/beta-1234-macos','release-pc/beta-1234-windows'],'grouped by its title');
assert.deepEqual(ids({id:'runs',query:'BETA macos'}),['release-mac/beta-1234-macos'],'every word, in any case');
assert.deepEqual(ids({id:'runs',query:'tag:windows'}),['release-pc/beta-1234-windows'],'grouped by its Agent\'s tag');
assert.deepEqual(ids({id:'runs',query:'status:failed,running'}),['release-mac/beta-1234-macos','release-mac/testflight-1232']);
assert.deepEqual(ids({id:'runs',query:'liveness:live status:passed'}),['release-mac/alpha-1233-macos']);
assert.deepEqual(ids({id:'runs',query:'agent:release-pc,laptop'}),['release-pc/beta-1234-windows']);
assert.deepEqual(ids({id:'runs',query:'role:development'}),[]);
assert.equal(agentBoardRecords(entries,{id:'runs',query:'tag:release beta'}).scope,'Runs the Agents in this World reported · tag:release beta · Read only');
const agents=agentBoardRecords(entries,{id:'agents'});
assert.deepEqual(agents.records.map(record=>record.id),['release-mac','release-pc','laptop'],'newest report first, an Agent with none last');
assert.deepEqual(agents.records[0],{id:'release-mac',title:'Release Mac',url:'',updatedAt:'2026-10-15T12:15:00.000Z',fields:{status:'working',liveness:'live',harness:'claude-code',kind:'remote',summary:'Building Beta 1234',
 role:'release',tags:'release, macos',runs:3,queued:0,running:1,passed:1,failed:1,cancelled:0,slots:2,busy:1,reportedAt:'2026-10-15T12:15:00.000Z'}});
assert.deepEqual(agents.records[2],{id:'laptop',title:'Laptop',url:'',fields:{status:'offline',liveness:'offline',harness:'codex',kind:'local',runs:0,queued:0,running:0,passed:0,failed:0,cancelled:0}});
assert.deepEqual(ids({id:'agents',query:'status:offline'}),['laptop']);
assert.deepEqual(ids({id:'agents',query:'building'}),['release-mac'],'words match an Agent\'s name or summary');
assert.deepEqual(ids({id:'agents',query:'liveness:stale,offline'}),['release-pc','laptop']);
assert.deepEqual(agentBoardRecords(entries,{id:'totals',query:'role:release'}).records,[{id:'totals',title:'Agents',url:'',
 fields:{agents:2,live:1,stale:1,offline:0,working:1,idle:1,blocked:0,runs:4,queued:0,running:1,passed:2,failed:1,cancelled:0}}]);
assert.deepEqual(agentBoardRecords(entries,{id:'totals',query:'beta'}).records[0].fields,{agents:3,live:1,stale:1,offline:1,working:1,idle:1,blocked:0,runs:2,queued:0,running:1,passed:1,failed:0,cancelled:0},'words narrow the runs counted');
assert.equal(agentBoardRecords([],{id:'totals'}).records[0].fields.agents,0);
assert.throws(()=>agentBoardRecords(entries,{id:'machines'}),(error:Error)=>error.message===AGENT_BOARD_REASONS.list);
// A release board: agents presets save with the board beside a GitHub releases preset, and show as any read does.
const releaseBoard={title:'Releases',tabs:[{id:'beta',title:'Beta',blocks:[
 {id:'beta-runs',title:'Beta runs',kind:'list',preset:'beta-runs',fields:['status','agent','finishedAt']},
 {id:'beta-failed',title:'Beta runs failing',kind:'number',preset:'beta-failed',goodAtMost:0},
 {id:'machines',title:'Release machines live',kind:'number',preset:'release-totals',field:'live',goodAtLeast:2},
 {id:'shipped',title:'Releases',kind:'list',preset:'app-releases',fields:['tag','prerelease','publishedAt','assetCount'],limit:5},
]}]};
const releasePresets=[
 {id:'beta-runs',name:'Beta runs',provider:'agents',read:{operation:'list',id:'runs',query:'tag:release beta'}},
 {id:'beta-failed',name:'Beta runs failing',provider:'agents',read:{operation:'list',id:'runs',query:'tag:release beta status:failed'}},
 {id:'release-totals',name:'Release machines',provider:'agents',read:{operation:'list',id:'totals',query:'role:release'}},
 {id:'app-releases',name:'example/app releases',provider:'github',read:{operation:'releases',id:'example/app'}},
];
const defined=defineBoard(null,[],{definition:releaseBoard,presets:releasePresets,expectedRevision:0},'release-mac',now);
assert.deepEqual(defined.presets.map(preset=>[preset.id,preset.provider,preset.read.operation]),[['app-releases','github','releases'],['beta-failed','agents','list'],['beta-runs','agents','list'],['release-totals','agents','list']]);
const agentRead=(id:string):BoardRead=>({records:agentBoardRecords(entries,defined.presets.find(preset=>preset.id===id)!.read)});
const releaseView=resolveBoard(defined.board.definition,defined.presets,{'beta-runs':agentRead('beta-runs'),'beta-failed':agentRead('beta-failed'),'release-totals':agentRead('release-totals'),
 'app-releases':records('github',[row('App 1.4',{tag:'v1.4.0',prerelease:false,publishedAt:'2026-10-14T09:00:00Z',assetCount:3},'https://github.com/example/app/releases/tag/v1.4.0')])},now).tabs[0].blocks;
assert.deepEqual(releaseView[0].list,{items:[{title:'Beta 1234 · macOS',url:'https://ci.example.com/runs/1',fields:{status:'running',agent:'Release Mac'}},
 {title:'Beta 1234 · Windows',url:'',fields:{status:'passed',agent:'Release PC',finishedAt:'2026-10-15T11:20:00.000Z'}}],more:false});
assert.deepEqual([releaseView[0].provider,releaseView[0].scope],['agents','Runs the Agents in this World reported · tag:release beta · Read only']);
assert.deepEqual(releaseView[1].number,{value:0,tone:'good'},'no Beta run is failing');
assert.deepEqual(releaseView[2].number,{value:1,tone:'bad'},'one release machine has gone quiet');
assert.deepEqual(releaseView[3].list?.items[0].fields,{tag:'v1.4.0',prerelease:false,publishedAt:'2026-10-14T09:00:00Z',assetCount:3});
// The Releases board in core/board/README.md defines as it is written, and its first number is the north star.
const documented=JSON.parse(fs.readFileSync(new URL('../core/board/README.md',import.meta.url),'utf8').match(/```json\n(\{"expectedRevision":0,[^`]*)```/)![1]);
const documentedBoard=defineBoard(null,[],documented,null,now);
assert.deepEqual(documentedBoard.presets.map(preset=>preset.provider).sort(),['agents','agents','agents','agents','agents','github']);
const documentedReads=Object.fromEntries(documentedBoard.presets.map(preset=>[preset.id,preset.provider==='agents'?{records:agentBoardRecords(entries,preset.read)}:records('github',[])]));
assert.deepEqual(boardNorthStar({definition:documentedBoard.board.definition,view:resolveBoard(documentedBoard.board.definition,documentedBoard.presets,documentedReads,now)}),{title:'Beta runs failing',value:0,tone:'good'});
console.log('PASS board: definitions checked (kinds, IDs, sizes, no secrets), resolved from preset reads into numbers, funnels, lists and trends, with a plain error per block and no model; the World\'s own agents source checked and read as runs, Agents and totals, narrowed by tag, role, agent, liveness, status and words.');
