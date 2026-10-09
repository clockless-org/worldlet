// The World's MCP connectors as every Agent's source access (platform/electron/src/modules/sources/mcp-source.ts):
// with no connection a read says to connect; a connection the Agent's Hermes profile has is read in the Platform
// (Notion's shelf and read_world_source, a Todoist list through Core's curated read, a refresh test), connecting
// through Worldlet with a token keeps it in the vault under the account owner's transport, disconnecting forgets only
// the World's own, and Google, DoorDash and everything else still go where they went.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {GoogleAccount} from '../platform/electron/src/modules/sources/google-account.ts';
import {GoogleSource,GoogleSourceAccess} from '../platform/electron/src/modules/sources/google-source.ts';
import {McpAccounts} from '../platform/electron/src/modules/sources/mcp-account.ts';
import {McpSource,McpSourceAccess,McpSourceConnections} from '../platform/electron/src/modules/sources/mcp-source.ts';
import {withTempDir} from './test-temp.ts';

const PAGE='0123456789abcdef0123456789abcdef';
await withTempDir('worldlet-mcp-source-',async temp=>{
 const values=new Map<string,string>();
 const vault={get:(id:string)=>values.get(id)??null,set:(id:string,value:string)=>{values.set(id,value);},delete:(id:string)=>{values.delete(id);},deleteAll:()=>values.clear()};
 const hermes=path.join(temp,'hermes');fs.mkdirSync(path.join(hermes,'mcp-tokens'),{recursive:true});
 const calls:any[]=[];
 const text=(value:unknown)=>({content:[{type:'text',text:JSON.stringify(value)}]});
 const answers:Record<string,(args:any)=>unknown>={
  'notion-list-recent-pages':()=>text({results:[{id:PAGE,title:'Trip plan',type:'page'}]}),
  'notion-fetch':()=>text({title:'Trip plan',metadata:{type:'page'},text:'<content>Pack **boots** and a map.</content>'}),
  'find-tasks':()=>text({tasks:[{id:'task1',content:'Buy milk',description:'',priority:'p1',dueDate:'2026-10-10'}],hasMore:false}),
 };
 const fakeFetch=async(input:any,init:any={})=>{
  const url=String(input),auth=String(init.headers?.authorization??'');
  if(!['Bearer agent-token','Bearer world-token'].includes(auth))return new Response('',{status:401});
  const message=JSON.parse(init.body);
  calls.push({url,method:message.method,name:message.params?.name,auth});
  const reply=(result:unknown)=>new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result}),{headers:{'content-type':'application/json','mcp-session-id':'s'}});
  if(message.method==='initialize')return reply({protocolVersion:'2025-06-18',capabilities:{}});
  if(message.method==='notifications/initialized')return new Response('',{status:202});
  if(message.method==='tools/list')return reply({tools:Object.keys(answers).concat(['notion-search','notion-get-self','list_issues','get_issue']).map(name=>({name}))});
  return reply(answers[message.params.name]?.(message.params.arguments)??{isError:true,content:[]});
 };
 const accounts=new McpAccounts({vault,agentHomes:()=>[hermes],fetch:fakeFetch as any});
 const mcp=new McpSource({accounts,openExternal:async()=>{},reviews:path.join(temp,'accounts','notion-reviews')});
 const delegated:any[]=[];
 const fallback={run:async(body:any)=>{delegated.push(body);return {ok:true,from:'owner'};},steer:async()=>false,cancel(){}};
 const access=new McpSourceAccess(mcp,()=>fallback);

 // No connection anywhere: the connector says to connect, without the account owner's runtime.
 await assert.rejects(access.run({action:'sourceRequest',provider:'notion',operation:'list'},hermes),/Connect Notion with Fox before opening this shelf/);
 // The Agent's own Notion and Todoist, in its Hermes profile.
 fs.writeFileSync(path.join(hermes,'config.yaml'),'mcp_servers:\n  notion:\n    url: https://mcp.notion.com/mcp\n    enabled: true\n    auth: oauth\n  todoist:\n    url: https://ai.todoist.net/mcp\n    enabled: true\n    headers:\n      Authorization: Bearer ${MCP_TODOIST_API_KEY}\n');
 fs.writeFileSync(path.join(hermes,'mcp-tokens','notion.json'),JSON.stringify({access_token:'agent-token',token_type:'Bearer'}));
 fs.writeFileSync(path.join(hermes,'.env'),'MCP_TODOIST_API_KEY=agent-token\n');
 const list=await access.run({action:'sourceRequest',provider:'notion',operation:'list'},hermes);
 assert.deepEqual(list.pages,[{id:PAGE,title:'Trip plan',url:'https://www.notion.so/'+PAGE,type:'page'}]);
 const page=await access.run({action:'sourceRequest',provider:'notion',operation:'fetch',id:PAGE},hermes);
 assert.equal(page.page.markdown,'Pack **boots** and a map.');
 const tasks=await access.run({action:'sourceRequest',provider:'todoist',operation:'list'},hermes);
 assert.equal(tasks.pages[0].title,'Buy milk');
 assert.ok(calls.some(call=>call.name==='find-tasks'&&call.url==='https://ai.todoist.net/mcp'));
 const refreshed=await access.run({action:'sourceRefresh',provider:'notion'},hermes);
 assert.equal(refreshed.ok,true);assert.ok(refreshed.tools.includes('notion-fetch'));assert.ok(!refreshed.tools.includes('find-tasks'),'only Notion\'s read tools count');
 await assert.rejects(access.run({action:'sourceRequest',provider:'notion',operation:'delete'},hermes),/Unsupported source operation/);
 // A connection at another address than the connector's is refused.
 fs.writeFileSync(path.join(hermes,'config.yaml'),fs.readFileSync(path.join(hermes,'config.yaml'),'utf8').replace('https://ai.todoist.net/mcp','https://elsewhere.example.com/mcp'));
 await assert.rejects(access.run({action:'sourceRequest',provider:'todoist',operation:'list'},hermes),/official Todoist MCP/);
 // DoorDash and Google are not MCP connectors here.
 await access.run({action:'sourceRequest',provider:'doordash',operation:'status'},hermes);
 await access.run({action:'sourceRequest',provider:'gmail',operation:'read'},hermes);
 assert.deepEqual(delegated.map(body=>body.provider),['doordash','gmail']);

 // read_world_source for Notion runs through the World's Google/World tool path, admitted and recorded.
 const google=new GoogleSource({account:new GoogleAccount({folder:path.join(temp,'accounts','google'),vault,clientFile:()=>null,adoptFrom:()=>[]}),development:false,openExternal:async()=>{},ownProfile:()=>null,legacyHomes:()=>[],
  notion:{connected:()=>mcp.connected('notion'),read:body=>mcp.read('notion',body)}});
 const tools=new GoogleSourceAccess(google,()=>access);
 const events:string[]=[];
 const turn=async(event:any)=>{events.push(event.name);return event.name==='_source_begin'?{ticket:'t'}:{ok:true};};
 const read=await tools.run({action:'sourceTool',name:'read_world_source',args:{provider:'notion',id:PAGE}},hermes,turn);
 assert.deepEqual(events,['_world_authorize','_source_begin','_source_result']);
 assert.equal(read.records[0].provider,'notion');assert.equal(read.records[0].text,'Pack **boots** and a map.');

 // Connecting through Worldlet with a token: the World's own, under the account owner's transport.
 const links=new McpSourceConnections(mcp,()=>({providers:()=>['gmail'],cancel(){},connect:async()=>{delegated.push('connect');},disconnect:async()=>{delegated.push('disconnect');return ['notion'];},clientReady:async()=>false,configureClient:async()=>{}}),()=>'hermes');
 const connected:any[]=[];
 await links.connect({provider:'linear',target:'',endpoint:'',token:'world-token',home:hermes,onStage(){},onConnected:c=>connected.push(c)});
 assert.deepEqual(connected,[{provider:'linear',target:'Linear',transport:'hermes',connector:'mcp'}]);
 assert.match(values.get('mcp:linear')!,/world-token/);
 assert.ok(!fs.readFileSync(path.join(hermes,'config.yaml'),'utf8').includes('linear'),'nothing written into the Agent\'s profile');
 // A connection whose server lacks the connector's tools is not kept.
 await assert.rejects(links.connect({provider:'supabase',target:'',endpoint:'',token:'world-token',home:hermes,onStage(){},onConnected(){}}),/no compatible read tools/);
 assert.equal(values.has('mcp:supabase'),false);
 // Disconnecting: the World's own is forgotten here; the Agent's own goes to its owner.
 assert.deepEqual(await links.disconnect({provider:'linear',connector:'mcp'},hermes),['linear']);
 assert.equal(values.has('mcp:linear'),false);
 await links.disconnect({provider:'notion',connector:'mcp'},hermes);
 assert.equal(delegated.at(-1),'disconnect');
 await links.connect({provider:'gmail',target:'',endpoint:'',token:'',home:hermes,onStage(){},onConnected(){}});
 assert.equal(delegated.at(-1),'connect');
});
console.log('PASS World MCP source access: connect message with no connection, the Agent\'s own Notion and Todoist read in the Platform, refresh test with the connector\'s tools, wrong address refused, read_world_source for Notion, Worldlet\'s own connection in the vault, disconnect, others delegated');
