import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {createServiceDrafts} from '../platform/electron/src/modules/agent-runtime/service-drafts.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {createAgentAsks} from '../platform/electron/src/modules/agent-runtime/agent-asks.ts';
import {ServiceSource} from '../platform/electron/src/modules/sources/service-source.ts';
import {McpAccounts} from '../platform/electron/src/modules/sources/mcp-account.ts';
import {McpSource} from '../platform/electron/src/modules/sources/mcp-source.ts';
import {askItemId} from '../agent/gate/asks.ts';
import {roomDenied} from '../contracts/web-world.ts';
import {STANDING_OUTSIDE_TURN} from '../agent/gate/grants.ts';
import {SERVICE_DRAFT_MESSAGES,SERVICE_DRAFT_REASONS,SERVICE_DRAFT_STALE,serviceDraftItemId} from '../agent/gate/service-drafts.ts';
import type {PosthogSettings} from '../context/sources/index.ts';

// PostHog and Notion drafts on the host (agent/gate/GRANTS.md#posthog-and-notion-drafts), the same modules the Electron
// and Node hosts run, on a real world.sqlite through the standing server, against a stubbed PostHog API (the World's
// PostHog key, sources/service-source.ts) and a stubbed Notion MCP server (the Notion connection, sources/mcp-source.ts):
// an Agent drafts only under its own "Can draft PostHog changes" or "Can draft Notion changes" Grant; the draft keeps the
// target as read; Approve reads it again and refuses a flag or appended page that changed, or a target that is gone, and
// otherwise writes once; a PostHog key without the write scope fails plainly; Dismiss writes nothing; an ask carries
// them; everything is audited; the PostHog key and the Notion token appear in no answer, stored row, audit entry or log.
const HOST='https://posthog.example.com',PROJECT='4242',KEY='phx_'+'F1xturePersonalKey'.repeat(3),NOTION_TOKEN='notion-'+'F1xtureToken'.repeat(4);
const PAGE='0123456789abcdef0123456789abcdef',PARENT='11112222333344445555666677778888',DATABASE='aaaabbbbccccddddeeeeffff00001111',NEW_PAGE='99998888777766665555444433332222';
await withTempDir('worldlet-service-drafts-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-16T12:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 const logged:string[]=[];
 const original={log:console.log,error:console.error,warn:console.warn};
 for(const name of ['log','error','warn'] as const)console[name]=(...args:unknown[])=>{logged.push(args.map(String).join(' '));};

 // Stubbed PostHog: the project, its feature flags and its annotations; every request kept. `scopes` are the key's.
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
 const flags=new Map<number,any>([[7,{id:7,key:'new-checkout',active:false,deleted:false,updated_at:'2026-10-16T10:00:00Z'}],[8,{id:8,key:'dark-mode',active:true,deleted:false,updated_at:'2026-10-16T10:00:00Z'}]]);
 const annotations:any[]=[];
 const scopes=new Set(['feature_flag:write']);
 const posthogCalls:{method:string;path:string;body?:any}[]=[];
 const posthogFetch=async(input:any,init:any={}):Promise<Response>=>{
  const url=new URL(String(input));
  assert.equal(init.redirect,'manual');assert.equal(url.origin,HOST,'only the address the person gave');
  if(init.headers?.authorization!=='Bearer '+KEY)return json({detail:'Invalid key'},401);
  const body=init.body?JSON.parse(init.body):undefined,method=init.method??'GET';
  posthogCalls.push({method,path:url.pathname+url.search,...body?{body}:{}});
  if(url.pathname===`/api/projects/${PROJECT}/`)return json({id:Number(PROJECT),name:'Example app'});
  if(url.pathname===`/api/projects/${PROJECT}/feature_flags/`&&method==='GET'){
   const search=url.searchParams.get('search')??'';
   return json({results:[...flags.values()].filter(f=>f.key.includes(search))});
  }
  const flag=/^\/api\/projects\/4242\/feature_flags\/(\d+)\/$/.exec(url.pathname);
  if(flag){
   const found=flags.get(Number(flag[1]));
   if(!found)return json({detail:'Not found.'},404);
   if(method==='GET')return json(found);
   if(method==='PATCH'){
    if(!scopes.has('feature_flag:write'))return json({detail:'API key missing required scope \'feature_flag:write\''},403);
    Object.assign(found,body,{updated_at:'2026-10-16T13:00:00Z'});return json(found);
   }
  }
  if(url.pathname===`/api/projects/${PROJECT}/annotations/`&&method==='POST'){
   if(!scopes.has('annotation:write'))return json({type:'authentication_error',code:'permission_denied',detail:'API key missing required scope \'annotation:write\''},403);
   annotations.push(body);return json({id:annotations.length,...body},201);
  }
  return json({detail:'unexpected'},500);
 };
 const services=new ServiceSource({vault,fetch:posthogFetch as typeof fetch});

 // Stubbed Notion MCP server: pages and a database, each with its last edit; the write tools with their schemas.
 const hermes=path.join(dir,'hermes');fs.mkdirSync(path.join(hermes,'mcp-tokens'),{recursive:true});
 fs.writeFileSync(path.join(hermes,'config.yaml'),'mcp_servers:\n  notion:\n    url: https://mcp.notion.com/mcp\n    enabled: true\n    auth: oauth\n');
 fs.writeFileSync(path.join(hermes,'mcp-tokens','notion.json'),JSON.stringify({access_token:NOTION_TOKEN,token_type:'Bearer'}));
 const pages=new Map<string,any>([
  [PAGE,{title:'Weekly notes',metadata:{type:'page'},text:'<content>Monday: shipped.</content>',page_last_edited_at:'2026-10-16T09:00:00.000Z'}],
  [PARENT,{title:'Projects',metadata:{type:'page'},text:'<content>All projects.</content>',page_last_edited_at:'2026-10-16T09:00:00.000Z'}],
  [DATABASE,{title:'Meeting notes',metadata:{type:'database'},text:'<database><data-source url="collection://abcdefab-cdef-abcd-efab-cdefabcdefab"><data-source-state>{"schema":{"Name":{"type":"title"},"Date":{"type":"date"}}}</data-source-state></data-source></database>'}],
 ]);
 const notionCalls:{name:string;args:any}[]=[];
 let refuseWrites=false;
 const tools=[
  {name:'notion-fetch',inputSchema:{type:'object',properties:{id:{type:'string'}},required:['id']}},
  {name:'notion-create-pages',inputSchema:{type:'object',properties:{parent:{type:'object'},pages:{type:'array'}},required:['parent','pages'],additionalProperties:false}},
  {name:'notion-update-page',inputSchema:{type:'object',properties:{page_id:{type:'string'},command:{type:'string',enum:['insert_content','replace_content']},new_str:{type:'string'},allow_async:{type:'boolean'}},required:['page_id','command'],additionalProperties:false}},
 ];
 const text=(value:unknown)=>({content:[{type:'text',text:JSON.stringify(value)}]});
 const notionFetch=async(input:any,init:any={})=>{
  assert.equal(String(input),'https://mcp.notion.com/mcp');
  if(init.headers?.authorization!=='Bearer '+NOTION_TOKEN)return new Response('',{status:401});
  const message=JSON.parse(init.body);
  const reply=(result:unknown)=>new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result}),{headers:{'content-type':'application/json','mcp-session-id':'s'}});
  if(message.method==='initialize')return reply({protocolVersion:'2025-06-18',capabilities:{}});
  if(message.method==='notifications/initialized')return new Response('',{status:202});
  if(message.method==='tools/list')return reply({tools});
  const {name,arguments:args}=message.params;
  notionCalls.push({name,args});
  if(name==='notion-fetch'){const found=pages.get(String(args.id));return reply(found?text(found):{isError:true,content:[{type:'text',text:'Could not find page'}]});}
  if(refuseWrites)return reply({isError:true,content:[{type:'text',text:'Insufficient permissions for this integration'}]});
  if(name==='notion-update-page'){pages.get(args.page_id).page_last_edited_at='2026-10-16T14:00:00.000Z';return reply(text({page_id:args.page_id}));}
  if(name==='notion-create-pages')return reply(text({pages:[{id:NEW_PAGE,url:'https://www.notion.so/'+NEW_PAGE}]}));
  return reply({isError:true,content:[]});
 };
 const mcp=new McpSource({accounts:new McpAccounts({vault,agentHomes:()=>[hermes],fetch:notionFetch as any}),openExternal:async()=>{},reviews:path.join(dir,'notion-reviews')});

 // The World's own connections, lent to the drafts exactly as the Agent service lends them (agent-runtime/index.ts).
 let notionConnected=false;
 const connections=()=>({posthog:()=>{const writer=services.writer('posthog');return writer?{settings:writer.settings as PosthogSettings,request:writer.request}:null;},notion:()=>notionConnected?mcp.notionSession():null});
 let changes=0;
 const drafts=createServiceDrafts({ledger:()=>ledger,connections,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{changes+=1;},now});
 const asks=createAgentAsks({ledger:()=>ledger,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{},drafts:()=>drafts,now});
 const standing=await openStandingWorldTools({access,serviceDrafts:(agentId,args)=>drafts.call(agentId,args),asks:(agentId,args)=>asks.call(agentId,args),channel:async()=>({error:'not here'})});
 const said:string[]=[];
 const keep=<T>(value:T):T=>{said.push(JSON.stringify(value));return value;};
 const refused=async(run:()=>Promise<unknown>|unknown)=>{try{await run();}catch(error){return keep((error as Error).message);}assert.fail('expected a refusal');};
 try{
  const agent=(id:string,name:string)=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const [target,verb]=action.split('/');
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target,action:verb,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return keep(JSON.parse((await response.json()).text));
   };
  };
  const codex=agent('codex','Codex'),claude=agent('claude-code','Claude Code');
  const turnOn={write:'flag.set',target:'new-checkout',active:true};

  // No Grant by default, and none from the default Grants: refused, nothing asked of PostHog or Notion, nothing stored.
  assert.equal((await codex('posthog-drafts/create',turnOn)).error,STANDING_OUTSIDE_TURN);
  assert.equal((await codex('notion-drafts/read')).error,STANDING_OUTSIDE_TURN);
  assert.deepEqual([posthogCalls.length,notionCalls.length,ledger.serviceDrafts().length],[0,0,0]);
  assert.ok(access.grantServiceDrafts('codex','posthog'));
  assert.equal(access.grantServiceDrafts('codex','github'),false,'GitHub drafts have their own Grant');
  // The PostHog Grant is not the Notion one.
  assert.equal((await codex('notion-drafts/read')).error,STANDING_OUTSIDE_TURN);
  // Granted, but PostHog is not connected: it says so, and nothing is stored.
  assert.equal((await codex('posthog-drafts/create',turnOn)).error,SERVICE_DRAFT_MESSAGES.posthogMissing);
  await services.connect('posthog',KEY,{host:HOST,project:PROJECT});
  posthogCalls.length=0;

  // flag.set: the flag is found by its key and kept as read; an agentId the model sends is dropped; nothing is written.
  const flag=await codex('posthog-drafts/create',{...turnOn,agentId:'claude-code'});
  assert.equal(flag.ok,true,JSON.stringify(flag));
  assert.deepEqual([flag.draft.agentId,flag.draft.provider,flag.draft.write,flag.draft.active,flag.draft.status],['codex','posthog','flag.set',true,'pending']);
  assert.deepEqual(flag.draft.target,{kind:'feature flag',id:'7',state:'off',updatedAt:'2026-10-16T10:00:00Z',title:'new-checkout',url:`${HOST}/project/${PROJECT}/feature_flags/7`});
  const item=ledger.value('items',serviceDraftItemId(flag.draft.id))!;
  assert.deepEqual([item.provider,item.kind,item.status,item.agentName,item.title,item.serviceDraftProvider,item.serviceDraftWhere,item.serviceDraftUrl],
   ['agents','task','open','Codex','Turn on the feature flag new-checkout','posthog','PostHog · new-checkout',`${HOST}/project/${PROJECT}/feature_flags/7`]);
  assert.match(String(item.serviceDraftText),/Turn on “new-checkout” \(it is off now\)/);
  assert.deepEqual(posthogCalls.filter(c=>c.method!=='GET'),[],'drafting writes nothing');
  // What does not fit is refused before anything is stored.
  assert.equal((await codex('posthog-drafts/create',{write:'flag.set',target:'dark-mode',active:true})).error,SERVICE_DRAFT_REASONS.already('on'));
  assert.equal((await codex('posthog-drafts/create',{write:'flag.set',target:'no-such-flag',active:true})).error,SERVICE_DRAFT_MESSAGES.notFound('posthog'));
  assert.equal((await codex('posthog-drafts/create',{write:'annotation.create',content:'Release 2.5',date:'yesterday'})).error,SERVICE_DRAFT_REASONS.date);
  assert.equal((await codex('posthog-drafts/create',{write:'annotation.create',content:'key sk-'+'a'.repeat(30),date:'2026-10-16T08:00:00Z'})).error,SERVICE_DRAFT_REASONS.secret);
  assert.equal((await codex('posthog-drafts/create',{write:'page.append',target:PAGE,body:'Hi'})).error,SERVICE_DRAFT_REASONS.write('posthog'));
  assert.equal(ledger.serviceDrafts().length,1);
  // Another Agent reads none of Codex's drafts.
  assert.ok(access.grantServiceDrafts('claude-code','posthog'));
  assert.deepEqual((await claude('posthog-drafts/read')).drafts,[]);

  // Stale: the flag changed in PostHog after the draft. Approve reads it again and refuses; nothing is written.
  const writes=()=>posthogCalls.filter(c=>c.method!=='GET').length;
  flags.get(7).updated_at='2026-10-16T11:00:00Z';
  assert.deepEqual(keep(await drafts.approve(flag.draft.id)),{ok:true,status:'stale',reason:SERVICE_DRAFT_STALE.updated('posthog')});
  assert.equal(writes(),0);
  assert.equal(ledger.value('items',serviceDraftItemId(flag.draft.id))!.status,'dismissed');
  assert.equal(await refused(()=>drafts.approve(flag.draft.id)),SERVICE_DRAFT_REASONS.settled,'a settled draft is never approved again');
  // Turned on by someone else meanwhile: refused with both states named.
  const second=await codex('posthog-drafts/create',turnOn);
  flags.get(7).active=true;
  assert.equal((await drafts.approve(second.draft.id)).reason,SERVICE_DRAFT_STALE.state('off','on'));
  flags.get(7).active=false;
  // Deleted: refused as gone.
  const third=await codex('posthog-drafts/create',{write:'flag.set',target:'7',active:true});
  assert.equal(third.draft.target.id,'7','a flag named by its ID');
  flags.get(7).deleted=true;
  assert.equal((await drafts.approve(third.draft.id)).reason,SERVICE_DRAFT_STALE.gone('posthog'));
  flags.get(7).deleted=false;
  assert.equal(writes(),0);

  // Fresh: written once, exactly the drafted change; a second Approve is refused and writes nothing.
  const fresh=await codex('posthog-drafts/create',turnOn);
  assert.deepEqual(keep(await drafts.approve(fresh.draft.id)),{ok:true,status:'written',url:`${HOST}/project/${PROJECT}/feature_flags/7`});
  assert.deepEqual(posthogCalls.filter(c=>c.method!=='GET'),[{method:'PATCH',path:`/api/projects/${PROJECT}/feature_flags/7/`,body:{active:true}}]);
  assert.equal(await refused(()=>drafts.approve(fresh.draft.id)),SERVICE_DRAFT_REASONS.settled);
  assert.equal(writes(),1);
  const read=await codex('posthog-drafts/read',{ids:[fresh.draft.id]});
  assert.deepEqual([read.drafts[0].status,read.drafts[0].resultUrl,read.untrustedContent],['written',`${HOST}/project/${PROJECT}/feature_flags/7`,true]);
  assert.equal(ledger.value('items',serviceDraftItemId(fresh.draft.id))!.status,'done');

  // annotation.create: a key without annotation:write fails plainly, never retried; with the scope it is written.
  const note={write:'annotation.create',content:'Release 2.5 shipped',date:'2026-10-16T08:00:00Z'};
  const scoped=await codex('posthog-drafts/create',note);
  assert.deepEqual([scoped.draft.target.kind,scoped.draft.target.title,scoped.draft.scope],['project','Example app','project']);
  const failed=keep(await drafts.approve(scoped.draft.id));
  assert.equal(failed.status,'failed');
  assert.match(failed.reason,/the personal API key needs the annotation:write scope/);
  assert.equal(annotations.length,0);
  scopes.add('annotation:write');
  const annotated=await codex('posthog-drafts/create',{...note,scope:'organization'});
  assert.equal((await drafts.approve(annotated.draft.id)).status,'written');
  assert.deepEqual(annotations,[{content:'Release 2.5 shipped',date_marker:'2026-10-16T08:00:00.000Z',scope:'organization'}]);

  // Dismiss writes nothing; Done or Dismiss through the item's ordinary status (a phone) dismisses too.
  const before=writes();
  const dismissed=await codex('posthog-drafts/create',{write:'flag.set',target:'dark-mode',active:false});
  assert.deepEqual(keep(drafts.dismiss(dismissed.draft.id)),{ok:true,status:'dismissed'});
  const phone=await codex('posthog-drafts/create',{write:'flag.set',target:'dark-mode',active:false});
  ledger.update(serviceDraftItemId(phone.draft.id),'done');
  assert.equal((await codex('posthog-drafts/read',{ids:[phone.draft.id]})).drafts[0].status,'dismissed');
  assert.equal(writes(),before);

  // Notion: its own Grant; not connected says so.
  assert.ok(access.grantServiceDrafts('codex','notion'));
  const append={write:'page.append',target:'https://www.notion.so/Weekly-notes-'+PAGE,body:'Tuesday: reviewed the plan.\n\nWednesday: demo.'};
  assert.equal((await codex('notion-drafts/create',append)).error,SERVICE_DRAFT_MESSAGES.notionMissing);
  notionConnected=true;
  const appended=await codex('notion-drafts/create',append);
  assert.equal(appended.ok,true,JSON.stringify(appended));
  assert.deepEqual(appended.draft.target,{kind:'page',id:PAGE,state:'active',updatedAt:'2026-10-16T09:00:00.000Z',title:'Weekly notes',url:'https://www.notion.so/'+PAGE});
  assert.deepEqual((await codex('posthog-drafts/read',{ids:[appended.draft.id]})).drafts,[],'each Service reads only its own drafts');
  assert.equal((await codex('notion-drafts/create',{write:'page.append',target:DATABASE,body:'Hi'})).error,SERVICE_DRAFT_REASONS.database);
  assert.equal((await codex('notion-drafts/create',{write:'page.append',target:'not a page',body:'Hi'})).error,SERVICE_DRAFT_REASONS.page);
  assert.equal((await codex('notion-drafts/create',{write:'page.append',target:NEW_PAGE,body:'Hi'})).error,SERVICE_DRAFT_MESSAGES.notFound('notion'));
  const notionWrites=()=>notionCalls.filter(c=>c.name!=='notion-fetch').length;
  assert.equal(notionWrites(),0,'drafting writes nothing');
  // Stale: the page was edited after the draft.
  pages.get(PAGE).page_last_edited_at='2026-10-16T10:00:00.000Z';
  assert.deepEqual(keep(await drafts.approve(appended.draft.id)),{ok:true,status:'stale',reason:SERVICE_DRAFT_STALE.updated('notion')});
  assert.equal(notionWrites(),0);
  // Fresh: appended once, after the page's last block, nothing replaced.
  const again=await codex('notion-drafts/create',append);
  assert.deepEqual(keep(await drafts.approve(again.draft.id)),{ok:true,status:'written',url:'https://www.notion.so/'+PAGE});
  assert.deepEqual(notionCalls.filter(c=>c.name!=='notion-fetch'),[{name:'notion-update-page',args:{page_id:PAGE,command:'insert_content',new_str:'\n\nTuesday: reviewed the plan.\n\nWednesday: demo.',allow_async:false}}]);
  // page.create under a page, and in a database (its first collection, the title in its title property).
  const child=await codex('notion-drafts/create',{write:'page.create',target:PARENT,title:'Launch plan',body:'Goals first.'});
  pages.get(PARENT).page_last_edited_at='2026-10-16T15:00:00.000Z';
  assert.deepEqual(await drafts.approve(child.draft.id),{ok:true,status:'written',url:'https://www.notion.so/'+NEW_PAGE},'a parent page\'s edits do not stop a new page');
  assert.deepEqual(notionCalls.at(-1),{name:'notion-create-pages',args:{parent:{page_id:PARENT},pages:[{properties:{title:'Launch plan'},content:'Goals first.'}]}});
  const row=await codex('notion-drafts/create',{write:'page.create',target:DATABASE,title:'Standup 10/16'});
  assert.equal(row.draft.target.kind,'database');
  assert.equal((await drafts.approve(row.draft.id)).status,'written');
  assert.deepEqual(notionCalls.at(-1),{name:'notion-create-pages',args:{parent:{data_source_id:'abcdefab-cdef-abcd-efab-cdefabcdefab'},pages:[{properties:{Name:'Standup 10/16'},content:''}]}});
  // Notion refuses a write: failed with its words, never retried.
  const refusedDraft=await codex('notion-drafts/create',{write:'page.create',target:PARENT,title:'Another'});
  refuseWrites=true;
  const notionRefused=keep(await drafts.approve(refusedDraft.draft.id));
  assert.equal(notionRefused.status,'failed');assert.match(notionRefused.reason,/^Notion refused the write: Insufficient permissions/);
  refuseWrites=false;

  // An ask carries PostHog and Notion drafts: its card names them, a plain answer of Approve is refused, approveDrafts
  // runs each as on its own card, and the Agent reads what became of them through asks/read.
  assert.ok(access.grantAsks('codex','ask'));
  const flagged=await codex('posthog-drafts/create',{write:'flag.set',target:'dark-mode',active:false});
  const noted=await codex('notion-drafts/create',{write:'page.append',target:PAGE,body:'Thursday: retro.'});
  const carrying=await codex('asks/post',{title:'Ship the dark mode change?',draftIds:[flagged.draft.id,noted.draft.id]});
  assert.equal(carrying.ok,true,JSON.stringify(carrying));
  assert.deepEqual(ledger.value('items',askItemId(carrying.ask.id))!.askDraftServices,['posthog','notion']);
  assert.match(await refused(()=>asks.answer({operation:'answer',id:carrying.ask.id,outcome:'answered',choice:'Approve'})),/approve this ask in Worldlet on the computer itself/);
  const approved=await asks.answer({operation:'approveDrafts',id:carrying.ask.id,outcome:'answered',choice:'Approve'});
  assert.deepEqual(approved,{ok:true,status:'answered',drafts:[{id:flagged.draft.id,status:'written',resultUrl:`${HOST}/project/${PROJECT}/feature_flags/8`},{id:noted.draft.id,status:'written',resultUrl:'https://www.notion.so/'+PAGE}]});
  assert.deepEqual((await codex('asks/read',{ids:[carrying.ask.id]})).asks[0].drafts,approved.drafts);
  assert.equal(flags.get(8).active,false);

  // Only on this computer: a World page on another device cannot approve or dismiss a draft.
  assert.notEqual(roomDenied({action:'serviceDraft',operation:'approve'}),'');
  assert.notEqual(roomDenied({action:'serviceDraft',operation:'dismiss'}),'');

  // Audit: each Approve and Dismiss is one entry for the drafting Agent, under that Service's target.
  const audit=(target:string)=>ledger.agentAudit('codex',500).filter(e=>e.target===target&&['approve','dismiss','grant'].includes(e.action)).map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit('posthog-drafts'),[['grant','allowed'],['approve','denied'],['approve','denied'],['approve','denied'],['approve','allowed'],['approve','denied'],['approve','allowed'],['dismiss','allowed'],['dismiss','allowed'],['approve','allowed']]);
  assert.deepEqual(audit('notion-drafts'),[['grant','allowed'],['approve','denied'],['approve','allowed'],['approve','allowed'],['approve','allowed'],['approve','denied'],['approve','allowed']]);
  assert.ok(changes>0);

  // Disconnecting PostHog: drafting says to connect it again.
  services.disconnect('posthog');
  assert.equal((await codex('posthog-drafts/create',turnOn)).error,SERVICE_DRAFT_MESSAGES.posthogMissing);

  // The PostHog key and the Notion token never leave the vault and the Notion connection: not in an answer, item,
  // stored row, audit entry or log line.
  const stored=JSON.stringify([ledger.serviceDrafts(),ledger.agentAudit('codex',500),ledger.agentAudit('claude-code',500),ledger.records('items'),ledger.history({limit:1000})]);
  for(const text of [...said,stored,...logged])for(const secret of [KEY,NOTION_TOKEN])assert.ok(!text.includes(secret),'a credential leaked');
  assert.deepEqual(logged.filter(line=>!line.includes('ExperimentalWarning')),[],'nothing is logged');
 }finally{standing.close();ledger.close();Object.assign(console,original);}
});
console.log('PASS PostHog and Notion drafts on the host: each Service\'s own Grant only, drafted against the target as read, Approve re-reads and refuses a changed or deleted flag and an edited page, writes once through the World\'s PostHog key or Notion connection, a key without the write scope fails plainly, Dismiss and a phone settle write nothing, an ask carries them, every Approve and Dismiss audited, and the key and token appear nowhere');
