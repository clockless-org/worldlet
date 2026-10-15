import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {describeActions,resolveAction,worldActions,worldGatewayTools,type WorldAction} from '../../../../../core/tools/index.ts';
import {HERMES_WORLD_TOOLS_SHIM,agentAuditEntry,standingActions,standingCallDecision,type GrantDecision,type HermesOwnCalls,type HermesWorldToolsServer,type WorldToolServer} from '../../../../../core/agent/index.ts';
import type {AgentAccess} from '../../host/services.ts';
import {writeAtomic} from '../../files.ts';
import type {Row} from './types.ts';

// World tools for a local Harness (Claude Code, Codex, Hermes Agent, OpenClaw, pi): the same two gateway
// tools Hermes offers, as an MCP server the Harness starts for one turn (pi: an extension file). That stdio process only relays to a loopback
// endpoint in the host, guarded by a per-turn token (in an owner-only file in the turn's home, never
// on the Harness's command line, which other local users can read); every call becomes an ordinary Agent `tool`
// event, so the World page's validation, turn trust and permissions decide exactly as for Hermes.

/** The stdio MCP server, run by Electron as Node (ELECTRON_RUN_AS_NODE). No dependencies. */
export const WORLD_TOOL_SERVER_SOURCE=String.raw`'use strict';
const fs=require('fs'),http=require('http'),readline=require('readline');
// Standing (registered in a Hermes profile, outlives any turn): the endpoint and token are read from a file the running
// Worldlet writes each run, and the tool list from a file that stays; with no Worldlet answering, a call says so.
const standing=process.env.WORLDLET_MCP_ENDPOINT_FILE||'',toolsFile=process.env.WORLDLET_MCP_TOOLS_FILE||'';
const CLOSED='Worldlet is not open on this computer. Open Worldlet, then try again.';
let turnToken='';if(!standing)try{turnToken=fs.readFileSync(process.env.WORLDLET_MCP_TOKEN_FILE||'','utf8').trim();}catch{}
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
function where(){
 if(!standing)return {url:process.env.WORLDLET_MCP_URL||'http://127.0.0.1/',token:turnToken};
 try{const value=JSON.parse(fs.readFileSync(standing,'utf8'));return typeof value.url==='string'&&typeof value.token==='string'?value:null;}catch{return null;}
}
function host(body){
 return new Promise((resolve,reject)=>{
  const at=where();if(!at)return reject(new Error(CLOSED));
  const endpoint=new URL(at.url),data=Buffer.from(JSON.stringify(body));
  const request=http.request({hostname:endpoint.hostname,port:endpoint.port,path:endpoint.pathname,method:'POST',headers:{'content-type':'application/json','content-length':data.length,authorization:'Bearer '+at.token}},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));
   response.on('end',()=>{if(response.statusCode!==200)return reject(new Error(standing?CLOSED:'it answered '+response.statusCode));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){reject(error);}});
  });
  request.on('error',error=>reject(standing?new Error(CLOSED):error));request.end(data);
 });
}
readline.createInterface({input:process.stdin}).on('line',async line=>{
 let message;try{message=JSON.parse(line);}catch{return;}
 if(!message||typeof message!=='object'||message.id===undefined||message.id===null)return;
 const reply=result=>send({jsonrpc:'2.0',id:message.id,result});
 try{
  const params=message.params||{};
  if(message.method==='initialize')return reply({protocolVersion:typeof params.protocolVersion==='string'?params.protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'worldlet',version:'1'}});
  if(message.method==='ping')return reply({});
  if(message.method==='tools/list')return reply({tools:toolsFile?JSON.parse(fs.readFileSync(toolsFile,'utf8')):(await host({method:'list'})).tools});
  if(message.method==='tools/call'){
   let result;
   try{result=await host({method:'call',name:params.name,arguments:params.arguments||{}});}
   catch(error){if(!standing)throw error;result={text:String(error&&error.message||CLOSED),isError:true};}
   return reply({content:[{type:'text',text:String(result.text)}],isError:result.isError===true});
  }
  send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Method not found'}});
 }catch(error){send({jsonrpc:'2.0',id:message.id,error:{code:-32603,message:'Worldlet is not answering: '+(error&&error.message)}});}
});
`;

/** The same relay as a pi extension (pi loads it with `-e`; it has no MCP client). Endpoint and token file are
 * written into this turn's copy; a tool's error result throws, which is how pi marks a failed call. */
export const piExtensionSource=(url:string,tokenFile:string)=>String.raw`'use strict';
const fs=require('fs'),http=require('http');
const endpoint=new URL(${JSON.stringify(url)});
let token='';try{token=fs.readFileSync(${JSON.stringify(tokenFile)},'utf8').trim();}catch{}
function host(body){
 return new Promise((resolve,reject)=>{
  const data=Buffer.from(JSON.stringify(body));
  const request=http.request({hostname:endpoint.hostname,port:endpoint.port,path:endpoint.pathname,method:'POST',headers:{'content-type':'application/json','content-length':data.length,authorization:'Bearer '+token}},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));
   response.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){reject(error);}});
  });
  request.on('error',reject);request.end(data);
 });
}
module.exports=async function(pi){
 const {tools}=await host({method:'list'});
 for(const tool of tools)pi.registerTool({name:tool.name,label:tool.name,description:tool.description,parameters:tool.inputSchema,
  async execute(_id,params){
   const result=await host({method:'call',name:tool.name,arguments:params||{}});
   if(result.isError===true)throw new Error(String(result.text));
   return {content:[{type:'text',text:String(result.text)}],details:{}};
  }});
};
`;

const RESULT_LIMIT=200_000;
/** The World tool behind `asks/*` (core/tools/gateway.ts). */
const ASK_TOOL='agent_asks';
/** The World tool behind `board/*` (core/tools/gateway.ts). */
const BOARD_TOOL='world_board';
/** The World tool behind `github-drafts/*` (core/tools/gateway.ts). */
const DRAFT_TOOL='github_drafts';

/** What one Agent may reach on the standing server (core/agent/GRANTS.md): the actions it may discover and the decision
 * for one resolved call. Absent for a Fox turn's own bridge, whose calls the turn's trust alone decides. */
export type GatewayAccess={actions:(all:WorldAction[])=>WorldAction[];decide:(target:string,action:string,tool:string,args:Row)=>GrantDecision};
/** describe_world_tools / call_world_tool, resolved by shared Core; `dispatch` runs the resolved tool. With `access`, an
 * Agent discovers only granted targets and a call runs only when its Grants allow it or send it to the person. */
export async function worldGateway(name:unknown,args:unknown,{sample,dispatch,access}:{sample:boolean;dispatch:(name:string,args:Row)=>Promise<Row>;access?:GatewayAccess}):Promise<Row> {
 try{
  const input=args&&typeof args==='object'&&!Array.isArray(args)?args as Row:{};
  const target=typeof input.target==='string'?input.target:'',action=typeof input.action==='string'?input.action:'';
  const all=worldActions({sample});
  if(name==='describe_world_tools')return describeActions(access?access.actions(all):all,target,action);
  if(name!=='call_world_tool')return {error:'Unknown World gateway.'};
  // The schema says a JSON string; Harnesses sometimes send the object itself.
  const values=typeof input.arguments==='string'?JSON.parse(input.arguments||'{}'):input.arguments??{};
  const resolved=resolveAction(all,target,action,values);
  if(access){
   const decision=access.decide(target,action,resolved.name,resolved.args);
   if(decision.decision==='denied')return {error:decision.reason||'This Agent may not do this.'};
  }
  return await dispatch(resolved.name,resolved.args);
 }catch(error){return {error:(error as Error)?.message||'World tool failed.'};}
}

export interface WorldToolBridge {server:WorldToolServer;close():void}

/** The MCP call as the Harness made it (gateway tool and its arguments), beside the World tool it resolves to. On the
 * standing server it names the Agent whose token made it, so the approval card can name it. */
export type McpCall={name:unknown;arguments:unknown;agent?:{id:string;name:string}};
/** A loopback endpoint for the stdio server: `list` and `call` at `route`, for a bearer token `authorize` accepts (it
 * returns who made the call: an Agent on the standing server, `true` for a turn's own bridge). */
async function serveWorldTools<T>(authorize:(token:string)=>T|null,route:string,call:(body:{name:unknown;arguments:unknown},caller:T)=>Promise<Row>):Promise<http.Server> {
 const server=http.createServer((request,response)=>{
  const answer=(status:number,value:Row)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(value));};
  const header=request.headers.authorization??'',caller=header.startsWith('Bearer ')?authorize(header.slice(7)):null;
  if(request.method!=='POST'||request.url!==route||caller===null){request.resume();answer(404,{});return;}
  const chunks:Buffer[]=[];let size=0;
  request.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000)request.destroy();else chunks.push(chunk);});
  request.on('end',()=>{
   void (async()=>{
    let body:Row;
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{answer(400,{});return;}
    if(body.method==='list'){answer(200,{tools:worldToolList()});return;}
    if(body.method!=='call'){answer(400,{});return;}
    const result=await call({name:body.name,arguments:body.arguments},caller);
    let text=JSON.stringify(result??{error:'World tool is unavailable.'});
    if(text.length>RESULT_LIMIT)text=text.slice(0,RESULT_LIMIT)+'… [truncated]';
    answer(200,{text,isError:typeof result?.error==='string'});
   })().catch(()=>{if(!response.headersSent)answer(500,{});});
  });
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
 return server;
}
const worldToolList=()=>worldGatewayTools.map(tool=>({name:tool.name,description:tool.description,inputSchema:tool.parameters}));
const portOf=(server:http.Server)=>(server.address() as {port:number}).port;

/** Opens the loopback endpoint and writes the stdio server into the turn's home. */
export async function openWorldToolBridge(home:string,{sample,dispatch,runner=process.execPath}:{sample:boolean;dispatch:(name:string,args:Row)=>Promise<Row>;runner?:string}):Promise<WorldToolBridge> {
 const token=crypto.randomBytes(24).toString('hex'),route='/'+crypto.randomUUID();
 const server=await serveWorldTools(value=>value===token?true:null,route,body=>worldGateway(body.name,body.arguments,{sample,dispatch})),port=portOf(server);
 // Each bridge has its own token file: a turn's and the spare process waiting for the next (SpareTurns) can share a home.
 const script=path.join(home,'worldlet-mcp.cjs'),tokenFile=path.join(home,`worldlet-mcp-${route.slice(1,9)}.token`);
 // The stdio server's source is the same every turn: written only when the home has none or an older one.
 if(readText(script)!==WORLD_TOOL_SERVER_SOURCE)writeAtomic(script,WORLD_TOOL_SERVER_SOURCE);
 writeAtomic(tokenFile,token,0o600);
 const url=`http://127.0.0.1:${port}${route}`,extension=path.join(home,`worldlet-pi-${route.slice(1,9)}.cjs`);
 writeAtomic(extension,piExtensionSource(url,tokenFile));
 const env:Record<string,string>={ELECTRON_RUN_AS_NODE:'1',WORLDLET_MCP_URL:url,WORLDLET_MCP_TOKEN_FILE:tokenFile};
 // A Windows process needs SystemRoot even with an explicit environment.
 if(process.platform==='win32')for(const key of ['SystemRoot','SYSTEMROOT','WINDIR'])if(process.env[key])env[key]=process.env[key] as string;
 return {server:{command:runner,args:[script],env,extension},close:()=>{server.close();server.closeAllConnections?.();fs.rmSync(tokenFile,{force:true});fs.rmSync(extension,{force:true});}};
}

// World tools on Hermes, standing (owner decision 2026-10-08 19:15Z, Kelvin: "把 World 工具挂到 Hermes 上，让它所有渠道都能用"):
// the `worldlet` MCP server in the Hermes profile Fox uses (core HERMES_WORLD_TOOLS) is started by Hermes itself (its
// gateway, `hermes acp`), not for one turn, so it relays to one endpoint per app run. Each Agent has its own identity and
// token (core/agent/GRANTS.md): the endpoint and that Agent's new token go into its own owner-only file in the profile
// each run (removed on quit or when the person revokes it), and only the token's hash is kept, in the vault; every call
// is decided by that Agent's Grants and recorded in its audit. The tool list stays beside it, so Hermes lists the tools
// even while Worldlet is closed, and a call then answers that Worldlet is not open. MCP calls name no Hermes session, so
// a call goes to the Fox turn whose stream announced it (core HermesOwnCalls), else to the one Fox turn running on
// Hermes now (holdStandingTurn: its tool events and trust; a guarded write there that is not its own waits for the
// card); with none, or several and none announced it, it is a call of its own outside any Fox turn (`channel`). Only
// Hermes Agent's calls go to a Fox turn: another Agent's are always its own.
export interface StandingTurn {own:HermesOwnCalls;dispatch:(name:string,args:Row,call:McpCall)=>Promise<Row>}
const foxTurns=new Set<StandingTurn>();
/** A Fox turn on Hermes takes the standing server's calls while it runs; returns its release. */
export function holdStandingTurn(turn:StandingTurn):()=>void {foxTurns.add(turn);return ()=>{foxTurns.delete(turn);turn.own.close();};}
export const standingTurn=(call:McpCall)=>{const turns=[...foxTurns];return turns.find(turn=>turn.own.has(call))??(turns.length===1?turns[0]:null);};
export interface StandingWorldTools {
 /** Writes the stdio server, its tool list and this Agent's endpoint file for this run into the profile at `home`: the
  * entry to register. Each Agent has its own token and file (`worldlet-mcp-endpoint.<agentId>.json`, owner-only). */
 server(home:string,agent?:StandingAgent):HermesWorldToolsServer;
 /** The Agent was revoked: its endpoint files go, so its registered server answers that Worldlet is not open. */
 forget(agentId:string):void;
 close():void;
}
export type StandingAgent={id:string;name:string;harness:string;kind:'local'|'remote'};
/** The Agent the profile's registered server has always stood for: Hermes Agent, the first to reach World tools here. */
export const HERMES_STANDING_AGENT:StandingAgent={id:'hermes',name:'Hermes Agent',harness:'hermes',kind:'local'};
/** Before per-Agent tokens there was one endpoint file per profile; a Hermes Agent registered then still reads it until
 * `hermes mcp add` saves the new entry and its gateway restarts, so during that run it holds the same Agent's token. */
export const STANDING_LEGACY_ENDPOINT_FILE='worldlet-mcp-endpoint.json',STANDING_TOOLS_FILE='worldlet-mcp-tools.json';
export const standingEndpointFile=(agentId:string)=>`worldlet-mcp-endpoint.${agentId}.json`;
/** `asks`: an Agent ask call (`agent_asks`, core/agent/GRANTS.md#agent-asks) by the Agent whose token made it. It is
 * always that Agent's own, under its own Grants: never a Fox turn's, and never routed to one. */
/** `board`: a board call (`world_board`, core/board/README.md) by the Agent whose token made it, the same way: its own
 * Grants decide it, and `canRead` says whether they let it read a Service, so the board never shows an Agent a Service
 * its own `read_service` call would be refused. */
/** `drafts`: a GitHub draft call (`github_drafts`, core/agent/GRANTS.md#github-drafts) by the Agent whose token made it,
 * the same way: its own Grants decide it, never a Fox turn's. */
export async function openStandingWorldTools({channel,access,asks,board,drafts,runner=process.execPath}:{channel:(name:string,args:Row,agent:string)=>Promise<Row>;access:AgentAccess;asks?:(agentId:string,args:Row)=>Row;
 board?:(agentId:string,args:Row,canRead:(provider:string,operation:string)=>boolean)=>Promise<Row>;drafts?:(agentId:string,args:Row)=>Promise<Row>;runner?:string}):Promise<StandingWorldTools> {
 const route='/'+crypto.randomUUID();
 const server=await serveWorldTools(token=>access.identify(token),route,(body,identity)=>{
  const call:McpCall={name:body.name,arguments:body.arguments,agent:{id:identity.id,name:identity.name}};
  // Fox's turns run on Hermes Agent: only its calls can be theirs. Another Agent registered on this server (Claude Code
  // or Codex, platform/node mcp-home.ts) is always a call of its own, under its own Grants.
  const turn=identity.id===HERMES_STANDING_AGENT.id?standingTurn(call):null,grants=access.grants(identity.id),now=new Date().toISOString();
  const foxTurn=turn?{own:turn.own.has(call)}:null;
  return worldGateway(body.name,body.arguments,{sample:false,
   dispatch:async(name,args)=>name===ASK_TOOL?asks?.(identity.id,args)??{error:'Asks are not available in this build.'}
    :name===DRAFT_TOOL?await drafts?.(identity.id,args)??{error:'GitHub drafts are not available in this build.'}
    :name===BOARD_TOOL?board?.(identity.id,args,(provider,operation)=>standingCallDecision({identity,grants,target:provider,action:operation,tool:'read_service',args:{provider,operation},foxTurn:null,now}).decision==='allowed')??{error:'The board is not available in this build.'}
    :turn?turn.dispatch(name,args,call):channel(name,args,identity.id),
   access:{
    actions:all=>standingActions(all,identity,grants,foxTurn!==null,now),
    decide:(target,action,tool,args)=>{
     const decision=standingCallDecision({identity,grants,target,action,tool,args,foxTurn,now});
     access.audit(agentAuditEntry(identity.id,target,action,decision,now));
     return decision;
    }
   }});
 });
 const url=`http://127.0.0.1:${portOf(server)}${route}`,files=new Map<string,Set<string>>();
 const remove=(agentId:string)=>{for(const file of files.get(agentId)??[])fs.rmSync(file,{force:true});files.delete(agentId);};
 access.onRevoke(remove);
 return {
  server(home,agent=HERMES_STANDING_AGENT){
   const script=path.join(home,HERMES_WORLD_TOOLS_SHIM),tools=path.join(home,STANDING_TOOLS_FILE),endpoint=path.join(home,standingEndpointFile(agent.id));
   const list=JSON.stringify(worldToolList());
   if(readText(script)!==WORLD_TOOL_SERVER_SOURCE)writeAtomic(script,WORLD_TOOL_SERVER_SOURCE);
   if(readText(tools)!==list)writeAtomic(tools,list);
   const identity=access.ensure(agent),token=identity.revokedAt?null:access.issueToken(identity.id);
   const written=files.get(agent.id)??new Set<string>();files.set(agent.id,written);
   if(token){
    writeAtomic(endpoint,JSON.stringify({url,token}),0o600);written.add(endpoint);
    // An install from before per-Agent tokens: its registered entry still names the profile's one endpoint file.
    const legacy=path.join(home,STANDING_LEGACY_ENDPOINT_FILE);
    if(agent.id===HERMES_STANDING_AGENT.id&&fs.existsSync(legacy)){writeAtomic(legacy,JSON.stringify({url,token}),0o600);written.add(legacy);}
   }else{fs.rmSync(endpoint,{force:true});}
   return {command:runner,args:[script],env:{ELECTRON_RUN_AS_NODE:'1',WORLDLET_MCP_ENDPOINT_FILE:endpoint,WORLDLET_MCP_TOOLS_FILE:tools}};
  },
  forget:remove,
  close(){server.close();server.closeAllConnections?.();for(const agentId of [...files.keys()])remove(agentId);}
 };
}
const readText=(file:string)=>{try{return fs.readFileSync(file,'utf8');}catch{return null;}};
