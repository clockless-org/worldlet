import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createAgentReports} from '../platform/electron/src/modules/agent-runtime/agent-reports.ts';
import {BOARD_READ_REUSE_MS,createWorldBoard} from '../platform/electron/src/modules/agent-runtime/board.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {STANDING_OUTSIDE_TURN} from '../agent/agent/grants.ts';
import {BOARD_REASONS} from '../context/board/index.ts';
import {PRESET_REASONS,saveServicePreset} from '../context/accounts/index.ts';
import type {ServiceRead} from '../contracts/services.ts';

// The board on the host (context/board/README.md, agent/agent/GRANTS.md#the-board), the same modules the Electron and Node
// hosts run: kept in world.sqlite beside its Service presets, reached only through the standing `worldlet` MCP server
// with each Agent's own token and Grants (none by default, never a Fox turn's), each preset read once through the
// World's own Service reader, a block of a Service the Agent may not read refused on that block alone, the World's own
// `agents` source shown to an Agent only with its own agents/list Grant, and audited.
await withTempDir('worldlet-board-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-15T12:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 // The World's own Service reader, here a fixture: what a preset read asks and what it answers.
 const asked:ServiceRead[]=[];let cloudflareDown=false;
 const read=async(request:ServiceRead)=>{
  asked.push(request);
  if(request.provider==='posthog')return {provider:'posthog',operation:'query',scope:'HogQL · Read only',records:[{id:'row/1',title:'1200',url:'https://us.posthog.com/project/1/sql',fields:{visited:1200,installed:120}}]};
  if(request.provider==='github')return {provider:'github',operation:'search',scope:'GitHub search · Read only',records:[{id:'example/app#1',title:'Fix the build',url:'https://github.com/example/app/pull/1',fields:{repository:'example/app'}}]};
  if(cloudflareDown)throw new Error('Cloudflare is disconnected or its token has expired. Connect Cloudflare again with a new API token.');
  return {provider:'cloudflare',operation:'read',scope:'Workers · Read only',records:[{id:'worker/api',title:'api',url:'https://dash.cloudflare.com/x',fields:{errors:2}}]};
 };
 let own=true;
 // The Agents' own reports, as agents/list answers them: the board's `agents` source, read with no Service.
 const reports=createAgentReports({ledger:()=>own?ledger:null,identities:()=>access.list(0).map(entry=>entry.identity),now});
 let listed=0;
 const board=createWorldBoard({ledger:()=>own?ledger:null,read,agents:()=>{listed+=1;return reports.list();},now,clock:()=>clock});
 const standing=await openStandingWorldTools({access,board:(agentId,args,canRead)=>board.call(agentId,args,canRead),channel:async()=>({error:'not here'})});
 try{
  const agent=(id:string,name:string)=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target:'board',action,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return JSON.parse((await response.json()).text);
   };
  };
  const codex=agent('codex','Codex'),claude=agent('claude-code','Claude Code'),hermes=agent('hermes','Hermes Agent');
  const presets=[
   {id:'funnel',name:'Funnel',provider:'posthog',read:{operation:'query',query:'SELECT 1200 AS visited, 120 AS installed'}},
   {id:'open-prs',name:'Open pull requests',provider:'github',read:{operation:'search',query:'repo:example/app is:open is:pr'}},
   {id:'workers',name:'Workers',provider:'cloudflare',read:{operation:'read',id:'workers'}},
  ];
  const definition={title:'Product',tabs:[
   {id:'growth',title:'Growth',blocks:[
    {id:'installs',title:'Installs',kind:'number',preset:'funnel',field:'installed',goodAtLeast:100},
    {id:'funnel',title:'Funnel',kind:'funnel',preset:'funnel',steps:[{field:'visited',label:'Visited'},{field:'installed',label:'Installed'}]},
   ]},
   {id:'health',title:'Health',blocks:[
    {id:'prs',title:'Open pull requests',kind:'list',preset:'open-prs',fields:['repository']},
    {id:'errors',title:'Worker errors',kind:'number',preset:'workers',field:'errors',goodAtMost:0},
   ]},
  ]};

  // No Grant by default: refused, nothing stored, nothing read.
  assert.equal((await codex('define',{definition,presets,expectedRevision:0})).error,STANDING_OUTSIDE_TURN);
  assert.equal((await codex('read')).error,STANDING_OUTSIDE_TURN);
  assert.equal(ledger.board(),null);assert.deepEqual(asked,[]);

  // Setting up: the whole definition with its presets, at revision 0; a stale revision is refused with the current one.
  assert.ok(access.grantBoard('codex','define'));
  assert.equal((await codex('read')).error,STANDING_OUTSIDE_TURN,'setting up is not seeing');
  const defined=await codex('define',{definition,presets,expectedRevision:0,agentId:'hermes'});
  assert.equal(defined.error,'This board is not valid.','an unknown argument (a spoofed agentId) is refused');
  assert.deepEqual(await codex('define',{definition,presets,expectedRevision:0}),{ok:true,revision:1,guidance:'The person\'s board now shows this. Read it with board/read to see each block\'s value or error.'});
  assert.deepEqual([ledger.board()!.revision,ledger.board()!.agentId,ledger.servicePresets().map(row=>row.id)],[1,'codex',['funnel','open-prs','workers']]);
  assert.deepEqual(await codex('define',{definition,expectedRevision:0}),{error:BOARD_REASONS.stale,revision:1});
  // Refused as a whole: nothing changes when one part is not valid.
  assert.equal((await codex('define',{definition,presets:[{...presets[0],id:'leak',name:'sk-'+'a'.repeat(30)}],expectedRevision:1})).error,PRESET_REASONS.secret);
  assert.equal((await codex('define',{definition:{tabs:[{id:'a',title:'A',blocks:[{id:'b',title:'B',kind:'pie',preset:'funnel'}]}]},expectedRevision:1})).error,BOARD_REASONS.kind);
  assert.deepEqual([ledger.board()!.revision,ledger.servicePresets().length],[1,3]);

  // Seeing: each preset read once through the World's reader; the Agent sees only Services its own Grants let it read.
  assert.ok(access.grantBoard('claude-code','read'));
  const blind=await claude('read');
  assert.equal(blind.untrustedContent,true);assert.equal(blind.revision,1);assert.equal(blind.definedBy,'codex');
  assert.deepEqual(blind.view.tabs.flatMap((tab:any)=>tab.blocks.map((block:any)=>[block.id,block.status])),[['installs','error'],['funnel','error'],['prs','error'],['errors','error']]);
  assert.match(blind.view.tabs[0].blocks[0].error,/may not read this Service/);
  assert.deepEqual(asked,[],'nothing is read for an Agent that may not read it');
  assert.ok(access.grantService('claude-code','posthog')&&access.grantService('claude-code','github'));
  const seen=await claude('read');
  const blocks=Object.fromEntries(seen.view.tabs.flatMap((tab:any)=>tab.blocks.map((block:any)=>[block.id,block])));
  assert.deepEqual(blocks.installs.number,{value:120,tone:'good'});
  assert.deepEqual(blocks.funnel.funnel,{steps:[{label:'Visited',count:1200,rate:null},{label:'Installed',count:120,rate:0.1}],overall:0.1});
  assert.deepEqual(blocks.prs.list.items,[{title:'Fix the build',url:'https://github.com/example/app/pull/1',fields:{repository:'example/app'}}]);
  assert.match(blocks.errors.error,/may not read this Service/,'Cloudflare is not granted: that block alone');
  assert.deepEqual(asked.map(request=>request.provider),['posthog','github'],'each preset once, however many blocks show it');
  assert.deepEqual(asked[0],{provider:'posthog',operation:'query',query:'SELECT 1200 AS visited, 120 AS installed'});
  assert.deepEqual(seen.presets.map((preset:any)=>preset.id),['funnel','open-prs','workers']);
  // One tab; a recent read is reused; after a minute the Service is asked again; an unknown tab is refused.
  assert.deepEqual((await claude('read',{tab:'growth'})).view.tabs.map((tab:any)=>tab.id),['growth']);
  assert.equal(asked.length,2,'read again within a minute: reused');
  clock+=BOARD_READ_REUSE_MS+1;
  await claude('read',{tab:'growth'});
  assert.equal(asked.length,3);
  assert.equal((await claude('read',{tab:'nope'})).error,BOARD_REASONS.tab);
  // The person's own view reads every connected Service; a Service error stays on its block.
  cloudflareDown=true;
  const person=await board.view({action:'board',operation:'read'});
  const errors=person.view.tabs[1].blocks[1];
  assert.deepEqual([errors.status,errors.provider,errors.error],['error','cloudflare','Cloudflare is disconnected or its token has expired. Connect Cloudflare again with a new API token.']);
  assert.equal(person.view.tabs[0].blocks[0].status,'ok');
  assert.ok(!('untrustedContent' in person));

  // The person's read warmed the shared cache. An Agent still needs its own Service grant on every call,
  // including immediately after revocation; a board grant does not admit cached records or provider errors.
  const countBeforeRevocation=asked.length;
  assert.ok(access.ungrantService('claude-code','posthog'));
  const revoked=await claude('read',{tab:'growth'});
  assert.ok(revoked.view.tabs[0].blocks.every((block:any)=>block.status==='error'&&!('number' in block)&&!('funnel' in block)));
  assert.match(revoked.view.tabs[0].blocks[0].error,/may not read this Service/);
  assert.equal(asked.length,countBeforeRevocation,'revoked Service is neither read nor taken from cache');
  assert.ok(access.grantBoard('hermes','read'));
  const other=await hermes('read');
  assert.ok(other.view.tabs.flatMap((tab:any)=>tab.blocks).every((block:any)=>block.status==='error'&&/may not read this Service/.test(block.error)));
  assert.ok(!JSON.stringify(other.view).includes('Fix the build')&&!JSON.stringify(other.view).includes('token has expired'),'no cached record text or provider failure details for a different Agent');
  assert.equal(asked.length,countBeforeRevocation,'a different Agent cannot reuse the person’s cache without Service grants');
  assert.ok(access.ungrantBoard('hermes','read'));

  // A preset replaced after defining the board cannot make the board attempt a collection-only live read.
  const replacement=saveServicePreset([],{id:'funnel',name:'Notes',provider:'notion',read:{operation:'read',id:'11111111-1111-4111-8111-111111111111'}},now()).preset;
  ledger.saveServicePreset(replacement);
  const beforeCollection=asked.length;
  const collectionOwner=await board.view({tab:'growth'}),collectionAgent=await claude('read',{tab:'growth'});
  for(const answer of [collectionOwner,collectionAgent])assert.ok(answer.view.tabs[0].blocks.every((block:any)=>block.error===BOARD_REASONS.collection));
  assert.equal(asked.length,beforeCollection,'collection-only presets never reach the live Service reader');

  // The World's own `agents` source beside a GitHub releases preset: a release machine reports its runs; the board shows
  // them to the person, and to an Agent only when its own Grants let it see other Agents (agents/list).
  agent('release-pc','Release PC');
  assert.equal(reports.call('release-pc',{operation:'report',status:'working',role:'release',tags:['release','windows'],runs:[
   {id:'beta-1234-windows',title:'Beta 1234 · Windows',status:'running',startedAt:'2026-10-15T12:00:00.000Z'},
   {id:'alpha-1233-windows',title:'Alpha 1233 · Windows',status:'failed',url:'https://ci.example.com/runs/7',startedAt:'2026-10-15T11:00:00.000Z'}]}).ok,true);
  const releases={id:'releases',title:'Releases',blocks:[
   {id:'beta-runs',title:'Beta runs',kind:'list',preset:'beta-runs',fields:['status','agent']},
   {id:'failing',title:'Runs failing',kind:'number',preset:'release-totals',field:'failed',goodAtMost:0},
   {id:'shipped',title:'Releases',kind:'list',preset:'app-releases',fields:['tag']},
  ]};
  const releasePresets=[
   {id:'beta-runs',name:'Beta runs',provider:'agents',read:{operation:'list',id:'runs',query:'tag:release beta'}},
   {id:'release-totals',name:'Release machines',provider:'agents',read:{operation:'list',id:'totals',query:'role:release'}},
   {id:'app-releases',name:'example/app releases',provider:'github',read:{operation:'releases',id:'example/app'}},
  ];
  const revision=ledger.board()!.revision as number;
  assert.equal((await codex('define',{definition:{...definition,tabs:[...definition.tabs,releases]},presets:[presets[0],...releasePresets],expectedRevision:revision})).ok,true,'the funnel preset is saved again over the Notion one');
  assert.deepEqual(ledger.servicePresets().filter(row=>row.provider==='agents').map(row=>[row.id,row.read]),
   [['beta-runs',{operation:'list',id:'runs',query:'tag:release beta'}],['release-totals',{operation:'list',id:'totals',query:'role:release'}]]);
  const releaseBlocks=(answer:any)=>Object.fromEntries(answer.view.tabs[0].blocks.map((block:any)=>[block.id,block]));
  // Can see your board alone: the agents blocks say why, and the reports are not even read for this Agent.
  const askedBefore=asked.length;listed=0;
  const blindReleases=releaseBlocks(await claude('read',{tab:'releases'}));
  assert.deepEqual([blindReleases['beta-runs'].status,blindReleases['beta-runs'].provider,blindReleases.failing.status],['error','agents','error']);
  assert.match(blindReleases['beta-runs'].error,/may not see other Agents/);
  assert.equal(listed,0,'no report is read for an Agent that may not see other Agents');
  assert.ok(!JSON.stringify(blindReleases).includes('Beta 1234'));
  // GitHub's releases go through Can read GitHub, which this Agent has.
  assert.equal(blindReleases.shipped.status,'ok');
  assert.deepEqual(asked.slice(askedBefore),[{provider:'github',operation:'releases',id:'example/app'}]);
  // With Can see other Agents, the same blocks show the runs; the person sees them with no Grant at all.
  assert.ok(access.grantReports('claude-code','list'));
  const seenReleases=releaseBlocks(await claude('read',{tab:'releases'}));
  assert.deepEqual(seenReleases['beta-runs'].list,{items:[{title:'Beta 1234 · Windows',url:'',fields:{status:'running',agent:'Release PC'}}],more:false});
  assert.deepEqual(seenReleases.failing.number,{value:1,tone:'bad'});
  assert.equal(seenReleases['beta-runs'].scope,'Runs the Agents in this World reported · tag:release beta · Read only');
  assert.ok(access.ungrantReports('claude-code','list'));
  assert.match(releaseBlocks(await claude('read',{tab:'releases'})).failing.error,/may not see other Agents/,'taking it back refuses the next read');
  const personReleases=releaseBlocks(await board.view({tab:'releases'}));
  assert.deepEqual([personReleases['beta-runs'].status,personReleases.failing.number],['ok',{value:1,tone:'bad'}]);
  // A revoked Agent's runs leave the board; outside the person's own World there are no reports to show.
  // (Agent access stamps the revocation on its own clock; this check's clock moves past it.)
  access.revoke('release-pc');clock=Date.now()+1000;
  assert.deepEqual(releaseBlocks(await board.view({tab:'releases'}))['beta-runs'].list,{items:[],more:false});
  const notReady=createWorldBoard({ledger:()=>ledger,read,agents:()=>null,now,clock:()=>clock});
  assert.match(releaseBlocks(await notReady.view({tab:'releases'}))['beta-runs'].error,/person's own World, which is not ready/);

  // Hermes Agent with no Grant is refused; taking a Grant back refuses the next call; revoking refuses everything.
  assert.equal((await hermes('read')).error.length>0,true);
  assert.ok(access.ungrantBoard('claude-code','read'));
  assert.equal((await claude('read')).error,STANDING_OUTSIDE_TURN);
  access.revoke('codex');
  assert.deepEqual(await codex('define',{definition,expectedRevision:1}),{status:404});
  // The practice World (or a World without private context) has no board.
  own=false;
  assert.match((await board.view({operation:'read'}).catch((error:Error)=>({error:error.message}))).error,/not ready/);

  // Audit: each call's decision, and each change the person made.
  const audit=(agentId:string)=>ledger.agentAudit(agentId,500).filter(e=>e.target==='board').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('codex').slice(0,4),[['define','denied'],['read','denied'],['grant-define','allowed'],['read','denied']]);
  assert.ok(audit('codex').filter(([action,decision])=>action==='define'&&decision==='allowed').length>=3);
  assert.deepEqual(audit('claude-code').at(-2),['ungrant-read','allowed']);
 }finally{standing.close();ledger.close();}
});
console.log('PASS board on the host: kept in world.sqlite with its presets, only through each Agent\'s own Grants, stale revisions refused, each preset read once and reused for a minute, Services the Agent may not read refused per block, the agents source only with Can see other Agents, GitHub releases through Can read GitHub, audited.');
