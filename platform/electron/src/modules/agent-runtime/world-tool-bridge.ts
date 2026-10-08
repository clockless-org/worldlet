import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {describeActions,resolveAction,worldActions,worldGatewayTools} from '../../../../../core/tools/index.ts';
import {HERMES_WORLD_TOOLS_SHIM,type HermesOwnCalls,type HermesWorldToolsServer,type WorldToolServer} from '../../../../../core/agent/index.ts';
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

/** describe_world_tools / call_world_tool, resolved by shared Core; `dispatch` runs the resolved tool. */
export async function worldGateway(name:unknown,args:unknown,{sample,dispatch}:{sample:boolean;dispatch:(name:string,args:Row)=>Promise<Row>}):Promise<Row> {
 try{
  const input=args&&typeof args==='object'&&!Array.isArray(args)?args as Row:{};
  const target=typeof input.target==='string'?input.target:'',action=typeof input.action==='string'?input.action:'';
  if(name==='describe_world_tools')return describeActions(worldActions({sample}),target,action);
  if(name!=='call_world_tool')return {error:'Unknown World gateway.'};
  // The schema says a JSON string; Harnesses sometimes send the object itself.
  const values=typeof input.arguments==='string'?JSON.parse(input.arguments||'{}'):input.arguments??{};
  const resolved=resolveAction(worldActions({sample}),target,action,values);
  return await dispatch(resolved.name,resolved.args);
 }catch(error){return {error:(error as Error)?.message||'World tool failed.'};}
}

export interface WorldToolBridge {server:WorldToolServer;close():void}

/** The MCP call as the Harness made it (gateway tool and its arguments), beside the World tool it resolves to. */
export type McpCall={name:unknown;arguments:unknown};
/** A loopback endpoint for the stdio server: `list` and `call` (through worldGateway) with the bearer token at `route`. */
async function serveWorldTools(token:string,route:string,sample:boolean,dispatch:(name:string,args:Row,call:McpCall)=>Promise<Row>):Promise<http.Server> {
 const server=http.createServer((request,response)=>{
  const answer=(status:number,value:Row)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(value));};
  if(request.method!=='POST'||request.url!==route||request.headers.authorization!=='Bearer '+token){request.resume();answer(404,{});return;}
  const chunks:Buffer[]=[];let size=0;
  request.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1_000_000)request.destroy();else chunks.push(chunk);});
  request.on('end',()=>{
   void (async()=>{
    let body:Row;
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{answer(400,{});return;}
    if(body.method==='list'){answer(200,{tools:worldToolList()});return;}
    if(body.method!=='call'){answer(400,{});return;}
    const call={name:body.name,arguments:body.arguments};
    const result=await worldGateway(body.name,body.arguments,{sample,dispatch:(name,args)=>dispatch(name,args,call)});
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
 const server=await serveWorldTools(token,route,sample,dispatch),port=portOf(server);
 // Each bridge has its own token file: a turn's and the spare process waiting for the next (SpareTurns) can share a home.
 const script=path.join(home,'worldlet-mcp.cjs'),tokenFile=path.join(home,`worldlet-mcp-${route.slice(1,9)}.token`);
 writeAtomic(script,WORLD_TOOL_SERVER_SOURCE);
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
// gateway, `hermes acp`), not for one turn, so it relays to one endpoint per app run. The endpoint and a new token go into
// an owner-only file in the profile each run (removed on quit); the tool list stays beside it, so Hermes lists the tools
// even while Worldlet is closed, and a call then answers that Worldlet is not open. MCP calls name no Hermes session, so
// a call goes to the Fox turn whose stream announced it (core HermesOwnCalls), else to the one Fox turn running on
// Hermes now (holdStandingTurn: its tool events and trust; a guarded write there that is not its own waits for the
// card); with none, or several and none announced it, it is a call of its own outside any Fox turn (`channel`).
export interface StandingTurn {own:HermesOwnCalls;dispatch:(name:string,args:Row,call:McpCall)=>Promise<Row>}
const foxTurns=new Set<StandingTurn>();
/** A Fox turn on Hermes takes the standing server's calls while it runs; returns its release. */
export function holdStandingTurn(turn:StandingTurn):()=>void {foxTurns.add(turn);return ()=>{foxTurns.delete(turn);turn.own.close();};}
export const standingTurn=(call:McpCall)=>{const turns=[...foxTurns];return turns.find(turn=>turn.own.has(call))??(turns.length===1?turns[0]:null);};
export interface StandingWorldTools {
 /** Writes the stdio server, its tool list and this run's endpoint file into the profile at `home`: the entry to register. */
 server(home:string):HermesWorldToolsServer;
 close():void;
}
export const STANDING_ENDPOINT_FILE='worldlet-mcp-endpoint.json',STANDING_TOOLS_FILE='worldlet-mcp-tools.json';
export async function openStandingWorldTools({channel,runner=process.execPath}:{channel:(name:string,args:Row)=>Promise<Row>;runner?:string}):Promise<StandingWorldTools> {
 const token=crypto.randomBytes(32).toString('hex'),route='/'+crypto.randomUUID();
 const server=await serveWorldTools(token,route,false,(name,args,call)=>{const turn=standingTurn(call);return turn?turn.dispatch(name,args,call):channel(name,args);});
 const url=`http://127.0.0.1:${portOf(server)}${route}`,homes=new Set<string>();
 return {
  server(home){
   const script=path.join(home,HERMES_WORLD_TOOLS_SHIM),tools=path.join(home,STANDING_TOOLS_FILE),endpoint=path.join(home,STANDING_ENDPOINT_FILE);
   const list=JSON.stringify(worldToolList());
   if(readText(script)!==WORLD_TOOL_SERVER_SOURCE)writeAtomic(script,WORLD_TOOL_SERVER_SOURCE);
   if(readText(tools)!==list)writeAtomic(tools,list);
   writeAtomic(endpoint,JSON.stringify({url,token}),0o600);homes.add(home);
   return {command:runner,args:[script],env:{ELECTRON_RUN_AS_NODE:'1',WORLDLET_MCP_ENDPOINT_FILE:endpoint,WORLDLET_MCP_TOOLS_FILE:tools}};
  },
  close(){server.close();server.closeAllConnections?.();for(const home of homes)fs.rmSync(path.join(home,STANDING_ENDPOINT_FILE),{force:true});homes.clear();}
 };
}
const readText=(file:string)=>{try{return fs.readFileSync(file,'utf8');}catch{return null;}};
