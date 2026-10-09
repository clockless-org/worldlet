import {WorldletError} from '../../files.ts';
import type {McpSession,McpToolResult} from '../../../../../core/accounts/mcp/session.ts';

/** The MCP protocol revision the World asks for; a server answers with the one it speaks. */
export const MCP_PROTOCOL='2025-06-18';
/** An answer the server refused for its authorization (401), so the caller can refresh once and retry. */
export class McpUnauthorized extends Error {
 readonly challenge:string;
 constructor(challenge:string){super('This connection needs authorization before use.');this.name='McpUnauthorized';this.challenge=challenge;}
}
export interface McpClientOptions {
 url:string;
 /** The `Authorization` header to send (a Bearer token), refreshed by the caller; null: none. `force` after a 401. */
 authorization:(force:boolean)=>Promise<string|null>;
 fetch?:typeof fetch;
 /** Shown in errors: the service's name (Notion, Todoist…). */
 title:string;
}

/** A client for one remote MCP server over Streamable HTTP (each request a POST; the answer JSON or an event stream),
 * enough for the World's connectors: initialize, tools/list, tools/call. One session per client, opened on first use
 * and again when the server forgets it (404). No server-to-client requests are answered. */
export class McpHttpClient implements McpSession {
 private readonly options:McpClientOptions;
 private readonly fetch:typeof fetch;
 private session:string|null=null;
 private opened=false;
 private opening:Promise<void>|null=null;
 private protocol=MCP_PROTOCOL;
 private next=1;
 constructor(options:McpClientOptions){this.options=options;this.fetch=options.fetch??fetch;}
 async callTool(name:string,args:Record<string,unknown>,timeoutSeconds=60):Promise<McpToolResult> {
  const result=await this.request('tools/call',{name,arguments:args},timeoutSeconds*1000);
  if(!result||typeof result!=='object')throw new WorldletError(`${this.options.title} returned an invalid tool result.`);
  return result as McpToolResult;
 }
 /** The names of the server's tools, every page. */
 async tools(timeoutMs=30_000):Promise<string[]> {
  const names:string[]=[];let cursor:string|undefined;
  for(let page=0;page<20;page++){
   const result=await this.request('tools/list',cursor?{cursor}:{},timeoutMs);
   for(const tool of Array.isArray(result?.tools)?result.tools:[])if(typeof tool?.name==='string')names.push(tool.name);
   cursor=typeof result?.nextCursor==='string'&&result.nextCursor?result.nextCursor:undefined;
   if(!cursor)break;
  }
  return names;
 }
 /** Ends the session on the server when it gave one. */
 async close(){
  const session=this.session;this.session=null;
  if(!session)return;
  try{await (await this.post(null,5000,{method:'DELETE'}))?.body?.cancel();}catch{}
 }
 private async open(){
  this.opening??=(async()=>{
   const result=await this.exchange({jsonrpc:'2.0',id:this.next++,method:'initialize',params:{protocolVersion:MCP_PROTOCOL,capabilities:{},clientInfo:{name:'Worldlet',version:'1'}}},30_000,true);
   if(typeof result?.protocolVersion==='string')this.protocol=result.protocolVersion;
   await this.exchange({jsonrpc:'2.0',method:'notifications/initialized'},15_000,false);
  })().finally(()=>{this.opening=null;});
  await this.opening;
 }
 private async request(method:string,params:Record<string,unknown>,timeoutMs:number):Promise<any> {
  if(!this.opened){await this.open();this.opened=true;}
  try{return await this.exchange({jsonrpc:'2.0',id:this.next++,method,params},timeoutMs,true);}
  catch(error){
   // A server that forgot the session (restarted) answers 404: open a new one, once.
   if(!(error instanceof SessionGone))throw error;
   this.session=null;this.opened=false;
   await this.open();this.opened=true;
   return await this.exchange({jsonrpc:'2.0',id:this.next++,method,params},timeoutMs,true);
  }
 }
 /** One JSON-RPC message; `answer`: wait for its response (a request) or only for the server to accept it. */
 private async exchange(message:Record<string,unknown>,timeoutMs:number,answer:boolean):Promise<any> {
  let response=(await this.post(message,timeoutMs))!;
  if(response.status===401){
   const challenge=response.headers.get('www-authenticate')??'';
   await response.body?.cancel().catch(()=>{});
   // Once, with a refreshed token; none to refresh means the person signs in again.
   response=await this.post(message,timeoutMs,{force:true});
   if(response===null)throw new McpUnauthorized(challenge);
   if(response.status===401)throw new McpUnauthorized(response.headers.get('www-authenticate')??challenge);
  }
  if(response.status===404&&this.session&&message.method!=='initialize'){await response.body?.cancel().catch(()=>{});throw new SessionGone();}
  const session=response.headers.get('mcp-session-id');
  if(session&&message.method==='initialize')this.session=session;
  if(!response.ok){await response.body?.cancel().catch(()=>{});throw new WorldletError(`${this.options.title} is unavailable right now (HTTP ${response.status}). Try again later.`);}
  if(!answer){await response.body?.cancel().catch(()=>{});return null;}
  const type=(response.headers.get('content-type')??'').toLowerCase();
  const reply=type.includes('text/event-stream')?await streamed(response,message.id,timeoutMs):await response.json().catch(()=>null);
  if(!reply||typeof reply!=='object')throw new WorldletError(`${this.options.title} returned an invalid answer.`);
  if(reply.error){
   const text=typeof reply.error?.message==='string'?reply.error.message.slice(0,300):'request failed';
   throw new WorldletError(`${this.options.title}: ${text}`);
  }
  return reply.result;
 }
 /** null: `force` asked for a refreshed token and there is none. */
 private async post(message:Record<string,unknown>|null,timeoutMs:number,{method='POST',force=false}:{method?:string;force?:boolean}={}):Promise<Response|null> {
  const headers:Record<string,string>={accept:'application/json, text/event-stream'};
  if(message)headers['content-type']='application/json';
  if(this.session)headers['mcp-session-id']=this.session;
  if(message?.method!=='initialize')headers['mcp-protocol-version']=this.protocol;
  const authorization=await this.options.authorization(force);
  if(force&&!authorization)return null;
  if(authorization)headers.authorization=authorization;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await this.fetch(this.options.url,{method,headers,...message?{body:JSON.stringify(message)}:{},signal:controller.signal});}
  catch(error){
   if(controller.signal.aborted)throw new WorldletError(`${this.options.title} took too long to answer. Try again.`);
   throw new WorldletError(`Could not reach ${this.options.title}. Check your internet connection and try again.`);
  }finally{clearTimeout(timer);}
 }
}
class SessionGone extends Error {}

/** The JSON-RPC response with `id` in a server-sent event stream; other messages (progress, logs) are skipped. */
async function streamed(response:Response,id:unknown,timeoutMs:number):Promise<any> {
 const reader=response.body?.getReader();
 if(!reader)return null;
 const decoder=new TextDecoder();let buffer='',data:string[]=[];
 const deadline=Date.now()+timeoutMs;
 try{
  while(Date.now()<deadline){
   const {done,value}=await reader.read();
   if(done)break;
   buffer+=decoder.decode(value,{stream:true});
   if(buffer.length>32_000_000)throw new WorldletError('The service sent more than the World can read.');
   let end:number;
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);
    if(line===''){
     if(data.length){
      let message:any=null;try{message=JSON.parse(data.join('\n'));}catch{}
      data=[];
      for(const item of Array.isArray(message)?message:[message])if(item&&typeof item==='object'&&item.id===id&&('result' in item||'error' in item))return item;
     }
     continue;
    }
    if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
   }
  }
  return null;
 }finally{reader.cancel().catch(()=>{});}
}
