// GitHub as a Worldlet Service (contracts/services.ts, context/accounts/mcp/github.ts, `read_service`): against a fixture
// of GitHub's remote MCP server, a pasted token connects and is kept in the vault with only read tools enabled; list,
// read, search and releases come back bounded and call only the reader's read tools; another server address, an expired
// token and a refused turn stop the read; and the Grant targets github/list, github/read, github/search and
// github/releases are each enforced, with none of them in an Agent's default Grants, and a "Can read GitHub" Grant
// given before releases existed covers them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {GITHUB_LIMITS,GITHUB_TOOLS,readGithub} from '../context/accounts/index.ts';
import {channelDefaultGrants,currentServiceGrant,serviceReadGrant,standingActions,standingCallDecision} from '../core/agent/grants.ts';
import {readServicePresetRead} from '../context/accounts/index.ts';
import {hermesChannelToolAllowed} from '../core/agent/hermes-server.ts';
import {turnTrustObserve} from '../core/agent/turn-trust.ts';
import {resolveAction,worldActionOf,worldActions} from '../core/tools/gateway.ts';
import {McpAccounts} from '../platform/electron/src/modules/sources/mcp-account.ts';
import {McpSource,McpSourceAccess,McpSourceConnections} from '../platform/electron/src/modules/sources/mcp-source.ts';
import {GoogleAccount} from '../platform/electron/src/modules/sources/google-account.ts';
import {GoogleSource,GoogleSourceAccess} from '../platform/electron/src/modules/sources/google-source.ts';
import {APP_DEFINITIONS,connectToken} from '../context/applets/index.ts';
import {validateAttentionRegistrations} from '../core/attention/attention-center.ts';
import {attentionFollowupReads,attentionReads} from '../core/attention/index.ts';
import {validateAppletRuntimes} from '../context/applets/runtime.ts';
import {conversationGuidance} from '../core/companion/conversation-guidance.ts';
import {listWorldTools} from '../core/tools/index.ts';
import {withTempDir} from './test-temp.ts';

const TOKEN='fixture-token';
const issue=(repo:string,number:number,extra:Record<string,unknown>={})=>({number,title:`Change ${number}`,state:'open',html_url:`https://github.com/${repo}/${extra.pull_request?'pull':'issues'}/${number}`,
 repository_url:`https://api.github.com/repos/${repo}`,user:{login:'alex'},labels:[{name:'bug'}],updated_at:`2026-10-${String(10+number%15).padStart(2,'0')}T09:00:00Z`,comments:0,...extra});
const pull=(repo:string,number:number,extra:Record<string,unknown>={})=>issue(repo,number,{pull_request:{url:'x'},...extra});

await withTempDir('worldlet-github-service-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const home=path.join(temp,'hermes');fs.mkdirSync(home,{recursive:true});
 const calls:{url:string;name?:string;args?:any}[]=[];
 let accepted=TOKEN;
 const text=(value:unknown)=>({content:[{type:'text',text:JSON.stringify(value)}]});
 const long='x'.repeat(5000);
 const answers:Record<string,(args:any)=>unknown>={
  search_pull_requests:({query,perPage,page})=>{
   // More than asked for, so the reader's own cap shows.
   if(query.includes('author:@me'))return text({total_count:25,items:Array.from({length:25},(_,i)=>pull('example-org/app',i+1))});
   if(query.includes('review-requested:@me'))return text({total_count:2,items:[pull('example-org/app',3),pull('example-org/site',7,{user:{login:'sam'}})]});
   return text({total_count:100,items:Array.from({length:perPage},(_,i)=>pull('example-org/app',100+(page-1)*perPage+i))});
  },
  search_issues:({query,perPage,page})=>{
   if(query.includes('assignee:@me'))return text({total_count:1,items:[issue('example-org/app',40,{title:'T'.repeat(400),assignees:[{login:'alex'}]})]});
   return text({total_count:100,items:Array.from({length:perPage},(_,i)=>issue('example-org/app',300+(page-1)*perPage+i))});
  },
  issue_read:({method,owner,repo,issue_number,page,perPage})=>{
   if(method==='get')return text(issue(`${owner}/${repo}`,issue_number,{body:long,comments:45}));
   if(method==='get_comments'){
    assert.equal(page,3,'the newest comments: the last page');assert.equal(perPage,GITHUB_LIMITS.comments);
    return text(Array.from({length:5},(_,i)=>({user:{login:'sam'},created_at:'2026-10-14T10:00:00Z',body:i===4?'y'.repeat(1500):`Comment ${41+i}`})));
   }
   return {isError:true,content:[]};
  },
  list_releases:({owner,repo,perPage,page})=>{
   // More than asked for on the first page, a row that is not a release, and a short last page.
   const release=(i:number)=>({tag_name:`v1.${i}.0`,name:i===1?'':`App 1.${i}`,html_url:`https://github.com/${owner}/${repo}/releases/tag/v1.${i}.0`,url:`https://api.github.com/repos/${owner}/${repo}/releases/${i}`,
    published_at:i===2?null:`2026-10-${String(20-i).padStart(2,'0')}T09:00:00Z`,created_at:'2026-10-01T09:00:00Z',prerelease:i%2===1,draft:i===2,author:{login:'alex'},
    assets:i===3?[]:[{name:'App.dmg',size:1},{name:'App-setup.exe',size:2},...i===4?Array.from({length:25},(_,n)=>({name:`extra-${n}.zip`})):[]],body:'Notes '+long});
   if(page===1)return text([{name:'not a release'},...Array.from({length:perPage+2},(_,i)=>release(i+1))]);
   return text(Array.from({length:3},(_,i)=>release((page-1)*perPage+i+1)));
  },
 };
 const fakeFetch=async(input:any,init:any={})=>{
  const url=String(input),auth=String(init.headers?.authorization??'');
  if(auth!=='Bearer '+accepted)return new Response('',{status:401});
  const message=JSON.parse(init.body);
  calls.push({url,name:message.params?.name,args:message.params?.arguments});
  const reply=(result:unknown)=>new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result}),{headers:{'content-type':'application/json','mcp-session-id':'s'}});
  if(message.method==='initialize')return reply({protocolVersion:'2025-06-18',capabilities:{}});
  if(message.method==='notifications/initialized')return new Response('',{status:202});
  if(message.method==='tools/list')return reply({tools:[...Object.keys(answers),'get_me','create_pull_request','merge_pull_request','add_issue_comment'].map(name=>({name}))});
  return reply(answers[message.params.name]?.(message.params.arguments)??{isError:true,content:[]});
 };
 const accounts=new McpAccounts({vault,agentHomes:()=>[home],fetch:fakeFetch as any});
 const mcp=new McpSource({accounts,openExternal:async()=>{},reviews:path.join(temp,'reviews')});
 const access=new McpSourceAccess(mcp,()=>({run:async()=>({ok:true}),steer:async()=>false,cancel(){}}));
 const authorized:any[]=[];
 const turn=async(event:any):Promise<Record<string,unknown>>=>{authorized.push(event.args);return {ok:true};};
 const read=(args:Record<string,unknown>,events=turn)=>access.run({action:'sourceTool',name:'read_service',args},home,events);

 // Not connected: the read says to connect, before any request.
 await assert.rejects(read({provider:'github',operation:'list'}),/Connect GitHub first/);
 assert.equal(calls.length,0);

 // A pasted token connects at GitHub's official address and is the World's own, in the vault; only read tools count.
 const links=new McpSourceConnections(mcp,()=>{throw Error('GitHub is an MCP connector here');},()=>'hermes');
 const connected:any[]=[];
 await links.connect({provider:'github',target:'',endpoint:'',token:'Bearer '+TOKEN,home,onStage(){},onConnected:c=>connected.push(c)});
 assert.deepEqual(connected,[{provider:'github',target:'GitHub',transport:'hermes',connector:'mcp'}]);
 const grant=JSON.parse(values.get('mcp:github')!);
 assert.equal(grant.kind,'bearer');assert.equal(grant.url,'https://api.githubcopilot.com/mcp/');
 assert.ok(!JSON.stringify(connected).includes(TOKEN),'the receipt carries no token');
 // A pasted token GitHub refuses is checked before it is kept: it replaces nothing, says so plainly and repeats nothing.
 const kept=values.get('mcp:github'),stages:unknown[]=[];
 const refused=await links.connect({provider:'github',target:'',endpoint:'',token:'github_pat_REFUSEDREFUSEDREFUSED',home,onStage:(...stage)=>stages.push(stage),onConnected(){throw Error('a refused token connected');}}).then(()=>null,(error:Error)=>error);
 assert.match(refused!.message,/^GitHub did not accept this token\. .*Issues, Pull requests and Metadata/);
 assert.ok(!refused!.message.includes('REFUSED'),'the error does not repeat the token');
 assert.equal(values.get('mcp:github'),kept,'the working token is kept');
 assert.equal(connected.length,1);assert.deepEqual(stages,[],'a token opens no browser and sends no stage event');
 // What the host's `connect` accepts as a token: only for a token source, required there, shaped like one.
 assert.equal(connectToken('github','  github_pat_'+'A1'.repeat(20)+'  '),'github_pat_'+'A1'.repeat(20));
 assert.equal(connectToken('notion',undefined),'');
 // With no token, GitHub signs in with its code instead.
 assert.equal(connectToken('github',''),'');assert.equal(connectToken('github',undefined),'');
 for(const [provider,value,pattern] of [['github','secret value!',/does not look like a token/],['github','x'.repeat(256),/does not look like a token/],['notion','secretvaluesecretvalue1',/does not connect with a token/]] as const){
  const error=(()=>{try{connectToken(provider,value);return null;}catch(error){return error as Error;}})();
  assert.match(error!.message,pattern,String(value));
  if(value)assert.ok(!error!.message.includes(value),'the error does not repeat what was pasted');
 }
 const tested=await access.run({action:'sourceRefresh',provider:'github'},home);
 for(const tool of GITHUB_TOOLS)assert.ok(tested.tools.includes(tool),tool);
 for(const write of ['create_pull_request','merge_pull_request','add_issue_comment'])assert.ok(!tested.tools.includes(write),'not enabled: '+write);

 // list: the three searches, each capped, one record per Issue or pull request, newest first.
 calls.length=0;
 const list=await read({provider:'github',operation:'list'});
 assert.deepEqual(authorized.at(-1),{name:'read_service',provider:'github',operation:'list'});
 assert.deepEqual(calls.filter(c=>c.name).map(c=>c.name),['search_pull_requests','search_pull_requests','search_issues']);
 assert.ok(calls.filter(c=>c.name).every(c=>c.url==='https://api.githubcopilot.com/mcp/'&&c.args.perPage===GITHUB_LIMITS.listPerQuery));
 assert.equal(list.provider,'github');assert.equal(list.operation,'list');assert.equal(list.cursor,undefined);
 assert.equal(list.records.length,GITHUB_LIMITS.listPerQuery+2,'ten of yours, one more review, one Issue');
 const twice=list.records.find((r:any)=>r.id==='example-org/app#3');
 assert.equal(twice.fields.reason,'Your pull request; Review requested');
 const site=list.records.find((r:any)=>r.id==='example-org/site#7');
 assert.deepEqual(site.fields,{kind:'pull request',repository:'example-org/site',number:7,reason:'Review requested',state:'open',author:'sam',labels:'bug',comments:0});
 assert.equal(site.url,'https://github.com/example-org/site/pull/7');
 const assigned=list.records.find((r:any)=>r.id==='example-org/app#40');
 assert.equal([...assigned.title].length,GITHUB_LIMITS.title);assert.equal(assigned.fields.kind,'issue');assert.equal(assigned.fields.assignees,'alex');
 assert.deepEqual(list.records.map((r:any)=>r.updatedAt),[...list.records.map((r:any)=>r.updatedAt)].sort().reverse());
 await assert.rejects(read({provider:'github',operation:'list',cursor:'2'}),/takes no ID, query or cursor/);

 // read: one Issue, its text and the newest comments, cut.
 calls.length=0;
 const one=await read({provider:'github',operation:'read',id:'example-org/app#40'});
 assert.deepEqual(calls.filter(c=>c.name).map(c=>[c.name,c.args.method]),[['issue_read','get'],['issue_read','get_comments']]);
 const record=one.records[0];
 assert.equal(record.id,'example-org/app#40');assert.equal(record.url,'https://github.com/example-org/app/issues/40');
 assert.equal([...record.text].length,GITHUB_LIMITS.text);
 assert.equal(record.comments.length,5);assert.equal(record.comments[0].text,'Comment 41');assert.equal([...record.comments[4].text].length,GITHUB_LIMITS.comment);
 for(const id of ['example-org/app','app#40','../x#1','example-org/..#1','a.b/app#1','example-org/app#0','example-org/app#1 OR 1'])await assert.rejects(read({provider:'github',operation:'read',id}),/Invalid GitHub record ID/,id);

 // search: both kinds unless the query names one, paged by cursor up to a limit.
 calls.length=0;
 const found=await read({provider:'github',operation:'search',query:'flaky test'});
 assert.deepEqual(calls.filter(c=>c.name).map(c=>c.name),['search_issues','search_pull_requests']);
 assert.equal(found.records.length,GITHUB_LIMITS.searchPage);assert.equal(found.cursor,'2');
 calls.length=0;
 const next=await read({provider:'github',operation:'search',query:'is:pr flaky',cursor:found.cursor});
 assert.deepEqual(calls.filter(c=>c.name).map(c=>[c.name,c.args.page,c.args.perPage]),[['search_pull_requests',2,GITHUB_LIMITS.searchPage]]);
 assert.equal(next.cursor,'3');
 const last=await read({provider:'github',operation:'search',query:'is:issue flaky',cursor:String(GITHUB_LIMITS.searchPages)});
 assert.equal(last.cursor,undefined,'no page past the limit');
 for(const cursor of ['0',String(GITHUB_LIMITS.searchPages+1),'abc'])await assert.rejects(read({provider:'github',operation:'search',query:'x',cursor}),/Invalid GitHub search cursor/);
 await assert.rejects(read({provider:'github',operation:'search',query:'q'.repeat(257)}),/query of up to 256 characters/);
 await assert.rejects(read({provider:'github',operation:'search',query:'q'.repeat(4001)}),/Invalid arguments for read_service/);
 await assert.rejects(read({provider:'github',operation:'search'}),/query of up to/);
 await assert.rejects(read({provider:'gitlab',operation:'list'}),/Invalid arguments for read_service/);
 // PostHog is a Service too, read over its own API (service-source.ts), never over GitHub's MCP connection; GitHub has no query.
 await assert.rejects(read({provider:'posthog',operation:'query',query:'SELECT 1'}),/Unsupported Service/);
 await assert.rejects(read({provider:'github',operation:'query',query:'SELECT 1'}),/no query read/);
 await assert.rejects(read({provider:'github',operation:'merge',id:'example-org/app#1'}),/Invalid arguments for read_service/);
 // Only the reader's read tools were ever called.
 assert.ok(calls.every(c=>!c.name||GITHUB_TOOLS.includes(c.name)));

 // releases: one repository's newest releases, a page at a time, each its tag, name, publishing, kind and assets.
 calls.length=0;
 const releases=await read({provider:'github',operation:'releases',id:'example-org/app'});
 assert.deepEqual(authorized.at(-1),{name:'read_service',provider:'github',operation:'releases'});
 assert.deepEqual(calls.filter(c=>c.name).map(c=>[c.name,c.args]),[['list_releases',{owner:'example-org',repo:'app',perPage:GITHUB_LIMITS.releasesPage,page:1}]]);
 assert.equal(releases.records.length,GITHUB_LIMITS.releasesPage-1,'cut to the page; the row that is not a release is left out');
 assert.equal(releases.cursor,'2');assert.equal(releases.scope,'Releases of example-org/app, newest first, page 1 · Read only');
 assert.deepEqual(releases.records[0],{id:'example-org/app@v1.1.0',title:'v1.1.0',url:'https://github.com/example-org/app/releases/tag/v1.1.0',updatedAt:'2026-10-19T09:00:00Z',
  fields:{repository:'example-org/app',tag:'v1.1.0',name:'v1.1.0',prerelease:true,draft:false,assetCount:2,publishedAt:'2026-10-19T09:00:00Z',assets:'App.dmg, App-setup.exe',author:'alex'}});
 assert.deepEqual([releases.records[1].fields.draft,releases.records[1].fields.publishedAt,releases.records[1].updatedAt],[true,undefined,'2026-10-01T09:00:00Z'],'a draft is not published yet');
 assert.deepEqual([releases.records[2].fields.assetCount,releases.records[2].fields.assets],[0,undefined]);
 assert.equal(releases.records[3].fields.assetCount,27);assert.equal(String(releases.records[3].fields.assets).split(', ').length,GITHUB_LIMITS.assets,'asset names are capped, the count is not');
 assert.ok(releases.records.every((r:any)=>!r.text&&!JSON.stringify(r).includes('Notes')),'release notes are not part of the read');
 const older=await read({provider:'github',operation:'releases',id:'example-org/app',cursor:'2'});
 assert.deepEqual([older.records.length,older.cursor],[3,undefined]);
 for(const cursor of ['0',String(GITHUB_LIMITS.releasesPages+1),'x'])await assert.rejects(read({provider:'github',operation:'releases',id:'example-org/app',cursor}),/Invalid GitHub releases cursor/);
 for(const id of ['example-org','example-org/app#1','../x','a/b/c','example-org/..','exa mple/app'])await assert.rejects(read({provider:'github',operation:'releases',id}),/Invalid GitHub repository/,id);
 await assert.rejects(read({provider:'github',operation:'releases',id:'example-org/app',query:'v1'}),/only the repository/);
 // A releases preset is checked the same way before it is saved.
 assert.deepEqual(readServicePresetRead('github',{operation:'releases',id:' example-org/app '}),{operation:'releases',id:'example-org/app'});
 assert.throws(()=>readServicePresetRead('github',{operation:'releases',id:'example-org/app#1'}),/Invalid GitHub repository/);
 assert.throws(()=>readServicePresetRead('github',{operation:'releases',id:'example-org/app',query:'v1'}),/takes an id/);

 // A turn that does not authorize the read stops it before GitHub is asked.
 calls.length=0;
 await assert.rejects(read({provider:'github',operation:'list'},async()=>({error:'Allow private context first.'})),/Allow private context first/);
 assert.equal(calls.length,0);
 // Attention: the Attention Center's own background collection reads GitHub's list through read_world_source, as
 // Notion's does; each record is a fact with a quotable text and its github.com link. Nothing else reaches it there.
 const google=new GoogleSource({account:new GoogleAccount({folder:path.join(temp,'accounts','google'),vault,clientFile:()=>null,adoptFrom:()=>[]}),development:false,openExternal:async()=>{},ownProfile:()=>null,legacyHomes:()=>[],
  github:{read:body=>mcp.read('github',body)}});
 const tools=new GoogleSourceAccess(google,()=>access);
 const seen:string[]=[];let receipt:any=null;
 const collector=async(event:any)=>{seen.push(event.name);if(event.name==='_source_result')receipt=event.args;return event.name==='_source_begin'?{ticket:'t'}:{ok:true};};
 const [plan]=attentionReads('github');
 assert.deepEqual(plan,{provider:'github',limit:20});
 calls.length=0;
 const page=await tools.run({action:'sourceTool',name:'read_world_source',args:plan,_background:true},home,collector);
 assert.deepEqual(seen,['_world_authorize','_source_begin','_source_result']);
 assert.deepEqual(calls.filter(c=>c.name).map(c=>c.name),['search_pull_requests','search_pull_requests','search_issues'],'one list read, no other GitHub call');
 assert.equal(page.records.length,GITHUB_LIMITS.listPerQuery+2);assert.deepEqual(receipt.records,page.records);
 const review=page.records.find((r:any)=>r.id==='example-org/site#7');
 assert.equal(review.provider,'github');assert.equal(review.url,'https://github.com/example-org/site/pull/7');assert.equal(review.metadataOnly,false);
 assert.equal(review.text,'Review requested: Change 7\npull request example-org/site#7\nAuthor: sam\nLabels: bug\nState: open\nComments: 0\nUpdated: 2026-10-17T09:00:00Z');
 const assignedFact=page.records.find((r:any)=>r.id==='example-org/app#40');
 assert.match(assignedFact.text,/^Assigned to you: T+…\nissue example-org\/app#40\nAuthor: alex\nAssignees: alex/);
 assert.ok(page.records.every((r:any)=>r.text.length<=12000&&r.url.startsWith('https://github.com/')));
 assert.deepEqual(attentionFollowupReads('github',page.records),[],'the list is the whole read');
 // Not the background collection (a Fox turn, an Agent through the gateway), or with more than a limit: refused before GitHub is asked.
 calls.length=0;
 for(const [body,label] of [[{action:'sourceTool',name:'read_world_source',args:plan},'a turn'],[{action:'sourceTool',name:'read_world_source',args:{...plan,id:'example-org/app#40'},_background:true},'an ID'],
  [{action:'sourceTool',name:'read_world_source',args:{provider:'github',limit:500},_background:true},'a large limit']] as const)
  await assert.rejects(tools.run(body,home,collector),/Read this Service with read_service/,label);
 assert.equal(calls.length,0);
 // An expired or revoked token says to reconnect.
 accepted='rotated';
 await assert.rejects(read({provider:'github',operation:'list'}),/GitHub is disconnected or its token has expired/);
 accepted=TOKEN;
 // An Agent's own GitHub connection at another address is refused.
 vault.delete('mcp:github');
 fs.writeFileSync(path.join(home,'config.yaml'),'mcp_servers:\n  github:\n    url: https://elsewhere.example.com/mcp\n    enabled: true\n    headers:\n      Authorization: Bearer ${GITHUB_TOKEN}\n');
 fs.writeFileSync(path.join(home,'.env'),'GITHUB_TOKEN='+TOKEN+'\n');
 calls.length=0;
 await assert.rejects(read({provider:'github',operation:'list'}),/official MCP server/);
 assert.equal(calls.length,0);
 // The same Agent connection at the official address is read as it is.
 fs.writeFileSync(path.join(home,'config.yaml'),fs.readFileSync(path.join(home,'config.yaml'),'utf8').replace('https://elsewhere.example.com/mcp','https://api.githubcopilot.com/mcp/'));
 assert.equal((await read({provider:'github',operation:'list'})).records.length,GITHUB_LIMITS.listPerQuery+2);
});

// The reader alone: a different record than asked for is refused.
await assert.rejects(readGithub({callTool:async()=>({content:[{type:'text',text:JSON.stringify(issue('example-org/app',41))}]}),listTools:async()=>({tools:[]})},{provider:'github',operation:'read',id:'example-org/app#40'}),/different record/);

// Grants: github/list, github/read, github/search and github/releases are the targets; none is in the default Grants.
const actions=worldActions();
for(const operation of ['list','read','search','releases'])assert.deepEqual(worldActionOf(actions,'read_service',{provider:'github',operation}),{target:'github',action:operation});
const resolved=resolveAction(actions,'github','read',{id:'example-org/app#40'});
assert.deepEqual(resolved.args,{id:'example-org/app#40',provider:'github',operation:'read'});
assert.throws(()=>resolveAction(actions,'github','list',{provider:'other'}),/routing field provider/);
assert.deepEqual(actions.find(a=>a.target==='github'&&a.action==='search')!.parameters.required,['query']);
assert.deepEqual(actions.find(a=>a.target==='github'&&a.action==='releases')!.parameters.required,['id']);
const now='2026-10-15T12:00:00.000Z';
const agent:AgentIdentity={id:'claude-code',name:'Claude Code',harness:'claude-code',kind:'local',createdAt:now};
const defaults=channelDefaultGrants(agent.id,now,actions);
const serviceTargets=actions.filter(a=>a.tool==='read_service'&&a.defaults.provider==='github').map(a=>a.target+'/'+a.action);
assert.deepEqual(serviceTargets,['github/list','github/read','github/search','github/releases','applet:github/list','applet:github/read','applet:github/search','applet:github/releases']);
assert.ok(defaults.every(g=>g.targets.every(t=>!serviceTargets.includes(t))),'read_service is in no default Grant');
assert.equal(hermesChannelToolAllowed({name:'read_service'}),false);
const decide=(grants:Grant[],operation:string)=>standingCallDecision({identity:agent,grants,target:'github',action:operation,tool:'read_service',args:{provider:'github',operation},foxTurn:null,now}).decision;
assert.equal(decide(defaults,'list'),'denied');
const listOnly:Grant={id:'g1',agentId:agent.id,targets:['github/list'],access:'read',duration:'standing',grantedAt:now};
assert.equal(decide([...defaults,listOnly],'list'),'allowed');
assert.equal(decide([...defaults,listOnly],'read'),'denied');
assert.equal(decide([...defaults,listOnly],'search'),'denied');
const all:Grant={...listOnly,id:'g2',targets:['github/*']};
for(const operation of ['list','read','search','releases'])assert.equal(decide([all],operation),'allowed');
assert.equal(decide([...defaults,listOnly],'releases'),'denied');
// "Can read GitHub" covers releases, including a Grant the person gave before GitHub had them.
const canRead=serviceReadGrant(agent.id,'github',now)!;
assert.deepEqual(canRead.targets,['github/list','github/read','github/search','github/releases','context/search','context/read'],'and the saved context\'s search and read');
const earlier={...canRead,targets:['github/list','github/read','github/search']};
assert.equal(decide([earlier],'releases'),'denied');
assert.equal(decide([currentServiceGrant(earlier)],'releases'),'allowed');
assert.deepEqual(currentServiceGrant({...earlier,revokedAt:now}).revokedAt,now,'a revoked Grant stays revoked');
assert.equal(decide([currentServiceGrant({...earlier,revokedAt:now})],'releases'),'denied');
assert.deepEqual(currentServiceGrant(listOnly),listOnly,'any other Grant is kept as it is');
assert.deepEqual(currentServiceGrant({...canRead,access:'write'}),{...canRead,access:'write'},'only a standing read Grant is "Can read GitHub"');
assert.deepEqual(standingActions(actions,agent,[listOnly],false,now).map(a=>a.target+'/'+a.action),['github/list']);
// Reading a Service makes the turn untrusted, so its writes are refused afterwards.
assert.equal(turnTrustObserve({},{type:'tool',name:'_world_authorize',args:{name:'read_service'}}).untrusted,true);

// The Applet's Attention registration and schedule: a source reader every 15 minutes, like Notion's.
const github=APP_DEFINITIONS.find(app=>app.key==='github')!;
assert.deepEqual(validateAttentionRegistrations([github.attention]),[{version:1,provider:'github',reader:'source-reader',intervalMinutes:15,freshnessMinutes:1440}]);
const [schedule]=validateAppletRuntimes([JSON.parse(fs.readFileSync(new URL('../ui/applets/github/runtime.json',import.meta.url),'utf8'))]);
assert.equal(schedule.mode,'scheduled');assert.equal(schedule.intervalMinutes,15);assert.equal(schedule.publishAttention,true);assert.equal(schedule.analysis,'structured');
// It widens nothing: read_world_source still names no Service, no action reads GitHub through it, and the default Grants
// (written from the gateway's actions) gain no GitHub target.
const sourceSchema=listWorldTools().find((t:any)=>t.name==='read_world_source') as any;
assert.ok(!sourceSchema.parameters.properties.provider.enum.includes('github'));
assert.ok(!actions.some(a=>a.tool==='read_world_source'&&a.defaults.provider==='github'));
assert.equal(worldActionOf(actions,'read_world_source',{provider:'github'}),null);
assert.deepEqual(defaults.flatMap(g=>g.targets.filter(t=>/github/.test(t))),['applet:github/runtime'],'the default Grants name only the GitHub Applet\'s saved World items, never a read of GitHub');
assert.match(conversationGuidance({scope:'private',connectedSources:['github'],backgroundSources:['github']}),/github\/list.*never read with read_world_source/);

console.log('PASS GitHub Service: token connect with read tools only, bounded list, read, search and releases through read_service, other address, expired token and refused turn stop the read, Grant targets github/list|read|search|releases enforced and in no default Grant, an earlier Can read GitHub covers releases, Attention reads the list only in the background collection and widens no Grant, a pasted token is checked before it is kept and a refused one replaces nothing');
