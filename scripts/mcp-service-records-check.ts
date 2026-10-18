// Linear, Todoist and Supabase as Worldlet Services (contracts/services.ts, core/accounts/mcp/service-records.ts,
// `read_service`): against fixtures of their official MCP servers, list and read come back as bounded Service records
// with the turn's admission asked first; Linear and Todoist page with a cursor; the Applets' own reads are unchanged; the
// Grant targets linear/list, linear/read and the rest are each a "Can read" Grant's and never a default; presets take
// their list and an ID they check.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type {AgentIdentity,Grant} from '../contracts/agent-identity.ts';
import {SERVICE_ACTIONS,SERVICE_PROVIDERS,SERVICE_TITLES} from '../contracts/services.ts';
import {MCP_SERVICE_RECORD_LIMITS,mcpServiceRecords,readServicePresetRead} from '../core/accounts/index.ts';
import {channelDefaultGrants,serviceReadGrant,standingCallDecision} from '../core/agent/grants.ts';
import {resolveAction,worldActions} from '../core/tools/gateway.ts';
import {McpAccounts} from '../platform/electron/src/modules/sources/mcp-account.ts';
import {McpSource,McpSourceAccess} from '../platform/electron/src/modules/sources/mcp-source.ts';
import {withTempDir} from './test-temp.ts';

const NEW=['linear','todoist','supabase'];
for(const provider of NEW){
 assert.deepEqual(SERVICE_ACTIONS[provider],{list:[],read:['id']});
 assert.ok(SERVICE_PROVIDERS.includes(provider));
 assert.ok(SERVICE_TITLES[provider]);
 for(const operation of ['list','read']){
  const action=worldActions().find(a=>a.target===provider&&a.action===operation)!;
  assert.equal(action.tool,'read_service');assert.deepEqual(action.defaults,{provider,operation});
  assert.deepEqual(action.parameters.required,operation==='read'?['id']:[]);
  assert.deepEqual(resolveAction(worldActions(),provider,operation,operation==='read'?{id:'x1'}:{}).args,{...operation==='read'?{id:'x1'}:{},provider,operation});
 }
}

// The shape: details become fields, text is cut, and only a read carries it.
const long='y'.repeat(9000);
const shaped=mcpServiceRecords('linear','read',{id:'ENG-1',title:'Fix it',description:long,text:long,url:'https://linear.app/example/issue/ENG-1',
 details:{status:'In Progress',priority:'High',labels:'bug, ui',updatedAt:'2026-10-17T09:00:00Z',nested:{a:1},'bad key':'x'}});
assert.equal(shaped.records.length,1);
assert.deepEqual(shaped.records[0].fields,{status:'In Progress',priority:'High',labels:'bug, ui'});
assert.equal(shaped.records[0].updatedAt,'2026-10-17T09:00:00Z');
assert.equal([...shaped.records[0].text!].length,MCP_SERVICE_RECORD_LIMITS.text);
assert.equal(shaped.scope,'One Linear issue · Read only');
assert.throws(()=>mcpServiceRecords('linear','read',{id:'ENG-1',title:'x',url:'javascript:alert(1)'}),/did not return this issue/);
assert.throws(()=>mcpServiceRecords('paypal','list',{pages:[]}),/Unsupported/);
assert.throws(()=>mcpServiceRecords('todoist','search' as any,{pages:[]}),/Unsupported/);

// Grants: each target is a "Can read" Grant's, never a default.
const agent:AgentIdentity={id:'agent-1',name:'Ada',kind:'hermes',createdAt:'2026-10-01T00:00:00.000Z',lastUsedAt:null,revokedAt:null} as any;
const now='2026-10-18T00:00:00.000Z';
const defaults=channelDefaultGrants(agent.id,now);
for(const provider of NEW){
 assert.ok(!defaults.some(g=>g.targets.some(t=>t.startsWith(provider+'/'))),provider+' is not a default');
 const grant=serviceReadGrant(agent.id,provider,now)!;
 assert.deepEqual(grant.targets,[provider+'/list',provider+'/read']);
 for(const operation of ['list','read']){
  const decide=(grants:Grant[])=>standingCallDecision({identity:agent,grants,target:provider,action:operation,tool:'read_service',args:{provider,operation},foxTurn:null,now}).decision;
  assert.notEqual(decide(defaults),'allowed',`${provider}/${operation} needs its Grant`);
  assert.equal(decide([...defaults,grant]),'allowed',`${provider}/${operation} with its Grant`);
 }
}

// Presets: the list, or one by an ID the reader would take.
for(const provider of NEW){
 assert.deepEqual(readServicePresetRead(provider,{operation:'list'}),{operation:'list'});
 assert.throws(()=>readServicePresetRead(provider,{operation:'list',id:'x'}),/takes nothing else/);
 assert.throws(()=>readServicePresetRead(provider,{operation:'read',id:'not an id!'}),/Invalid/);
 assert.throws(()=>readServicePresetRead(provider,{operation:'search',query:'x'}),/read with list or read/);
}
assert.deepEqual(readServicePresetRead('linear',{operation:'read',id:'ENG-12'}),{operation:'read',id:'ENG-12'});

await withTempDir('worldlet-mcp-service-records-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const hermes=path.join(temp,'hermes');fs.mkdirSync(hermes,{recursive:true});
 const calls:{url:string;name:string;args:any}[]=[];
 const text=(value:unknown)=>({content:[{type:'text',text:JSON.stringify(value)}]});
 const issue=(n:number)=>({id:'uuid-'+n,identifier:'ENG-'+n,title:'Issue '+n,description:'About '+n,url:'https://linear.app/example/issue/ENG-'+n,
  state:{name:'Todo'},priorityLabel:'High',labels:{nodes:[{name:'bug'}]},updatedAt:`2026-10-${10+n}T09:00:00Z`});
 const task=(n:number)=>({id:'task'+n,content:'Task '+n,description:'Do '+n,priority:'p'+n,dueDate:'2026-10-20',labels:['home','errand'],duration:{amount:5}});
 const project=(n:number)=>({id:'proj'+n,ref:'proj'+n,name:'Project '+n,status:'ACTIVE_HEALTHY',region:'us-east-1',anon_key:'must-not-appear'});
 const answers:Record<string,(args:any)=>unknown>={
  list_issues:args=>text(args.cursor?{issues:[issue(3)],pageInfo:{hasNextPage:false}}:{issues:[issue(1),issue(2)],pageInfo:{hasNextPage:true,endCursor:'c-2'}}),
  get_issue:args=>text(issue(Number(String(args.id).split('-')[1]))),
  'find-tasks':args=>text(args.cursor?{tasks:[task(3)],hasMore:false}:{tasks:[task(1),task(2)],hasMore:true,nextCursor:'t-2'}),
  'fetch-object':args=>text({object:task(Number(String(args.id).slice(4)))}),
  list_projects:()=>text([project(1),project(2)]),
  get_project:args=>text(project(Number(String(args.id).slice(4)))),
 };
 const fakeFetch=async(input:any,init:any={})=>{
  if(String(init.headers?.authorization??'')!=='Bearer agent-token')return new Response('',{status:401});
  const message=JSON.parse(init.body);
  const reply=(result:unknown)=>new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result}),{headers:{'content-type':'application/json','mcp-session-id':'s'}});
  if(message.method==='initialize')return reply({protocolVersion:'2025-06-18',capabilities:{}});
  if(message.method==='notifications/initialized')return new Response('',{status:202});
  if(message.method==='tools/list')return reply({tools:Object.keys(answers).map(name=>({name,inputSchema:name==='list_issues'?{type:'object',properties:{assignee:{type:'string'},limit:{type:'number'},cursor:{type:'string'}}}:{type:'object'}}))});
  calls.push({url:String(input),name:message.params.name,args:message.params.arguments});
  return reply(answers[message.params.name]?.(message.params.arguments)??{isError:true,content:[]});
 };
 fs.writeFileSync(path.join(hermes,'config.yaml'),['mcp_servers:',
  ...[['linear','https://mcp.linear.app/mcp'],['todoist','https://ai.todoist.net/mcp'],['supabase','https://mcp.supabase.com/mcp?read_only=true&features=account']]
   .flatMap(([name,url])=>[`  ${name}:`,`    url: ${url}`,'    enabled: true','    headers:',`      Authorization: Bearer \${MCP_${name.toUpperCase()}_API_KEY}`])].join('\n')+'\n');
 fs.writeFileSync(path.join(hermes,'.env'),NEW.map(name=>`MCP_${name.toUpperCase()}_API_KEY=agent-token`).join('\n')+'\n');
 const accounts=new McpAccounts({vault,agentHomes:()=>[hermes],fetch:fakeFetch as any});
 const mcp=new McpSource({accounts,openExternal:async()=>{},reviews:path.join(temp,'reviews')});
 const access=new McpSourceAccess(mcp,()=>({run:async()=>({from:'elsewhere'}),steer:async()=>false,cancel(){}}));
 const authorized:any[]=[];
 const turn=async(event:any):Promise<Record<string,unknown>>=>{authorized.push(event.args);return {ok:true};};
 const read=(args:Record<string,unknown>,events=turn)=>access.run({action:'sourceTool',name:'read_service',args},hermes,events);

 // Linear: a page, the next page by cursor, one issue with its text.
 const issues=await read({provider:'linear',operation:'list'});
 assert.deepEqual(authorized.at(-1),{name:'read_service',provider:'linear',operation:'list'});
 assert.deepEqual([issues.provider,issues.operation,issues.cursor,issues.records.map((r:any)=>r.id)],['linear','list','c-2',['ENG-1','ENG-2']]);
 assert.deepEqual(issues.records[0],{id:'ENG-1',title:'Issue 1',url:'https://linear.app/example/issue/ENG-1',fields:{status:'Todo',priority:'High',labels:'bug'},updatedAt:'2026-10-11T09:00:00Z'});
 const more=await read({provider:'linear',operation:'list',cursor:'c-2'});
 assert.equal(calls.at(-1)!.args.cursor,'c-2');assert.deepEqual(more.records.map((r:any)=>r.id),['ENG-3']);assert.equal(more.cursor,undefined);
 const one=await read({provider:'linear',operation:'read',id:'ENG-2'});
 assert.deepEqual([one.records.length,one.records[0].id,one.records[0].text,one.scope],[1,'ENG-2','About 2','One Linear issue · Read only']);

 // Todoist: the same, with labels joined and a nested detail left out.
 const tasks=await read({provider:'todoist',operation:'list'});
 assert.deepEqual([tasks.cursor,tasks.records.map((r:any)=>r.id)],['t-2',['task1','task2']]);
 assert.deepEqual(tasks.records[0].fields,{dueDate:'2026-10-20',priority:'p1',labels:'home, errand'});
 assert.equal(tasks.records[0].url,'https://app.todoist.com/app/task/task1');
 assert.equal((await read({provider:'todoist',operation:'list',cursor:'t-2'})).records[0].id,'task3');
 assert.equal((await read({provider:'todoist',operation:'read',id:'task2'})).records[0].text,'Do 2');

 // Supabase: projects and their public metadata only.
 const projects=await read({provider:'supabase',operation:'list'});
 assert.deepEqual(projects.records.map((r:any)=>[r.id,r.fields.status,r.fields.region]),[['proj1','ACTIVE_HEALTHY','us-east-1'],['proj2','ACTIVE_HEALTHY','us-east-1']]);
 assert.ok(!JSON.stringify(projects).includes('must-not-appear'),'no key reaches the Agent');
 const proj=await read({provider:'supabase',operation:'read',id:'proj2'});
 assert.match(proj.scope,/^One Supabase project · Project metadata only/);
 await assert.rejects(read({provider:'supabase',operation:'list',cursor:'2'}),/does not use a cursor/);

 // Refused by the turn, an operation the Service does not have, or a bad ID: no request.
 const before=calls.length;
 await assert.rejects(read({provider:'linear',operation:'list'},async()=>({error:'Ada may not read Linear.'})),/may not read Linear/);
 await assert.rejects(read({provider:'todoist',operation:'search',query:'x'}),/has no search read/);
 await assert.rejects(read({provider:'linear',operation:'read',id:'not an id!'}),/Invalid Linear issue ID/);
 assert.equal(calls.length,before);

 // The Applets' own reads keep their shape.
 const shelf=await access.run({action:'sourceRequest',provider:'todoist',operation:'list'},hermes);
 assert.equal(shelf.pages[0].title,'Task 1');
});

console.log('PASS Linear, Todoist and Supabase as Services: list and read as bounded Service records, cursor pages, text cut, no keys, each a Grant target and never a default, presets checked, the Applets\' reads unchanged');
