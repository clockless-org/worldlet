import {spawn} from 'node:child_process';
import {canBuild} from '../../store/world-store.ts';
import {WorldletError} from '../../files.ts';
import {AGENT,ANALYTICS,WORLD_TOOLS} from '../../host/services.ts';
import type {AgentRuntime,AgentService,AgentSourceConnections,AnalyticsService,WorldToolsService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
export const IMPORT_REGIONS=new Set(['home','work','development','library','money','health','travel','people']);

/** What every source handler shares: the store, the Agent's source lanes and the World page. */
export class SourcesContext {
 readonly host:Host;
 private access:AgentRuntime|null=null;
 private links:AgentSourceConnections|null=null;
 /** The account owner `access` and `links` were made by: an Agent change that moves accounts replaces them. */
 private owner='';
 private children=new Set<ReturnType<typeof spawn>>();
 constructor(host:Host){this.host=host;}
 get store(){return this.host.store;}
 agent(){return this.host.use<AgentService>(AGENT);}
 /** Fox's Agent. */
 agentId(){return this.host.optional<AgentService>(AGENT)?.id??'hermes';}
 /** Who owns account connections (`transport` on them): the built-in Hermes whichever Agent Fox
  * talks through, unless a configured external Agent brings its own. */
 accountsId(){return this.host.optional<AgentService>(AGENT)?.accountsId??'hermes';}
 /** Where account grants and their reads live: the account owner's private home. */
 home(){return this.agent().accountsHome();}
 worldTools(){return this.host.optional<WorldToolsService>(WORLD_TOOLS);}
 analytics(){return this.host.optional<AnalyticsService>(ANALYTICS);}
 sample(){return this.store.sampleEnabled();}
 /** The store's long-lived source reader (Mac `WorldStore.sourceAccess`). */
 sourceAccess(){this.follow();return this.access??=this.agent().makeSourceAccess();}
 sourceConnections(){this.follow();return this.links??=this.agent().makeSourceConnections();}
 private follow(){const id=this.accountsId();if(id!==this.owner){this.owner=id;this.access=null;this.links=null;}}
 cancel(){this.access?.cancel();this.links?.cancel();for(const child of this.children)child.kill();}
 connections():Row[]{return this.store.state.connections;}
 /** The same connection, still authorized; a reconnect or account switch makes it stale. */
 currentSourceIndex(connection:Row){
  return this.connections().findIndex(current=>current.id===connection.id&&current.provider===connection.provider&&current.transport===connection.transport&&current.target===connection.target&&current.bookmark===connection.bookmark&&current.folderPath===connection.folderPath&&current.vaultPath===connection.vaultPath&&canBuild(current));
 }
 agentConnection(provider:string){return this.connections().find(c=>c.provider===provider&&c.transport===this.accountsId()&&canBuild(c));}
 /** `busy` blocks concurrent source work exactly as the Mac host's flag did. */
 async busyWhile<T>(work:()=>Promise<T>):Promise<T>{
  this.store.busy=true;this.store.error=null;
  try{return await work();}finally{this.store.busy=false;}
 }
 /** Runs a macOS helper with explicit arguments, an optional stdin and a hard timeout. */
 run(executable:string,args:string[],{input,timeout=45000,limit=4_000_000}:{input?:string,timeout?:number,limit?:number}={}):Promise<{code:number|null,stdout:string,stderr:string}>{
  return new Promise((resolve,reject)=>{
   const child=spawn(executable,args,{stdio:['pipe','pipe','pipe'],env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:process.env.HOME??'',LANG:'en_US.UTF-8'}});
   this.children.add(child);
   const out:Buffer[]=[],err:Buffer[]=[];let size=0,overflow=false;
   const timer=setTimeout(()=>child.kill(),timeout);
   child.stdout.on('data',chunk=>{size+=chunk.length;if(size>limit){overflow=true;child.kill();}else out.push(chunk);});
   child.stderr.on('data',chunk=>{if(err.length<64)err.push(chunk);});
   child.on('error',error=>{clearTimeout(timer);this.children.delete(child);reject(error);});
   child.on('close',code=>{
    clearTimeout(timer);this.children.delete(child);
    if(overflow){reject(new WorldletError('The response is too large.'));return;}
    resolve({code,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8')});
   });
   child.stdin.on('error',()=>{});
   child.stdin.end(input??'');
  });
 }
 requireRegion(region:unknown){if(typeof region!=='string')return undefined;if(!IMPORT_REGIONS.has(region))throw new WorldletError('Unsupported region.');return region;}
}
