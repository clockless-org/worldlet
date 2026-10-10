import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,type ChildProcess} from 'node:child_process';
import {core} from '../../core.ts';
import {WorldletError} from '../../files.ts';
import {Cancelled,type AgentLink} from './page.ts';
import type {WebPage} from './web-page.ts';
import type {Row} from '../../host/types.ts';

export interface AgentBrowserEnvironment {
 binary():string|null;
 python():Promise<string>;
 script:string;
 /** Fox's pointer over this page while the glow shows (Mac BrowserFoxGlow.point). */
 pointer():{point(x:number,y:number):Promise<void>}|null;
}
/** IO adapter only (Mac AgentBrowser). Upstream agent-browser owns observation, refs and
 * interaction; shared Core owns the command flow and editable-field decisions. */
export class AgentBrowser implements AgentLink {
 private view:WebPage;
 private environment:AgentBrowserEnvironment;
 private child:ChildProcess|null=null;
 private starting:Promise<void>|null=null;
 private buffer='';
 private pending=new Map<string,{resolve:(value:Row)=>void,reject:(error:Error)=>void}>();
 private documentID='';
 private refs:Row={};
 constructor(view:WebPage,environment:AgentBrowserEnvironment){this.view=view;this.environment=environment;}
 invalidate(){this.documentID='';this.refs={};}
 controls(){return Object.keys(this.refs);}
 stop(){
  this.invalidate();this.view.discardAgentCommands();
  this.send({kind:'stop'});
  const child=this.child;this.child=null;this.starting=null;this.buffer='';
  if(child){try{child.stdin?.end();}catch{}setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();},3000);}
  const waiting=[...this.pending.values()];this.pending.clear();
  for(const request of waiting)request.reject(new Cancelled());
 }
 private start():Promise<void> {
  if(this.child)return Promise.resolve();
  if(this.starting)return this.starting;
  const task=(async()=>{
   const binary=this.environment.binary();
   if(!binary)throw new WorldletError('The browser driver is missing. Rebuild or reinstall Worldlet.');
   let python:string;
   // Setup in progress is awaited, so a rejection is a real failure: its reason, not "try again".
   try{python=await this.environment.python();}catch(error){throw error instanceof WorldletError?error:new WorldletError('Fox could not start the local runtime: '+((error as Error)?.message??String(error)));}
   if(this.starting!==task)throw new Cancelled();
   const env:Record<string,string>={PYTHONUNBUFFERED:'1'};
   for(const key of ['PATH','HOME','LANG','TMPDIR','TEMP','TMP','SYSTEMROOT'])if(process.env[key])env[key]=process.env[key]!;
   const child=spawn(python,[this.environment.script,binary],{env,stdio:['pipe','pipe','ignore'],windowsHide:true});
   this.child=child;this.buffer='';
   child.stdout!.setEncoding('utf8');
   child.stdout!.on('data',(data:string)=>{if(this.child===child)this.receive(data);});
   child.stdout!.on('end',()=>{if(this.child===child)this.stop();});
   child.on('exit',()=>{if(this.child===child)this.stop();});
   child.on('error',()=>{if(this.child===child)this.stop();});
   child.stdin!.on('error',()=>{});
   this.view.enableAgentTransport(true);
  })();
  this.starting=task;
  task.catch(()=>{if(this.starting===task)this.starting=null;});
  return task;
 }
 private send(value:Row){const input=this.child?.stdin;if(input&&!input.destroyed)input.write(JSON.stringify(value)+'\n');}
 private receive(data:string){
  this.buffer+=data;
  if(this.buffer.length>8_000_000){this.stop();return;}
  let newline:number;
  while((newline=this.buffer.indexOf('\n'))>=0){
   const line=this.buffer.slice(0,newline);this.buffer=this.buffer.slice(newline+1);
   let value:Row;try{value=JSON.parse(line);}catch{continue;}
   if(!value||typeof value!=='object')continue;
   if(value.kind==='cdp'&&value.message&&typeof value.message==='object')this.view.sendAgentCDP(value.message);
   else if(value.kind==='result'&&typeof value.id==='string'){
    const request=this.pending.get(value.id);if(!request)continue;
    this.pending.delete(value.id);
    const response=value.response&&typeof value.response==='object'?value.response:{};
    if(response.success===true)request.resolve(response.data&&typeof response.data==='object'?response.data:{});
    else{
     if(process.argv.includes('--browser-automation-check'))process.stderr.write('Driver fixture failure: '+JSON.stringify(response)+'\n');
     request.reject(new WorldletError('The browser action did not finish. Inspect the page before retrying.'));
    }
   }
  }
 }
 receiveCDP(message:Row){if(this.child)this.send({kind:'cdp',message});}
 private async command(argv:string[]):Promise<Row> {
  await this.start();
  if(!this.child)throw new Cancelled();
  const id=crypto.randomUUID().toUpperCase();
  return new Promise((resolve,reject)=>{
   this.pending.set(id,{resolve,reject});
   this.send({kind:'command',id,argv});
   setTimeout(()=>{if(this.pending.has(id))this.stop();},40_000);
  });
 }
 /** Center of an agent-browser `get box` reply, wherever the rectangle sits in it. */
 static center(value:unknown):{x:number,y:number}|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const box=value as Row;
  if([box.x,box.y,box.width,box.height].every(n=>typeof n==='number')&&box.width>0&&box.height>0)return {x:box.x+box.width/2,y:box.y+box.height/2};
  for(const key of ['box','data','result','value'])if(key in box){const found=AgentBrowser.center(box[key]);if(found)return found;}
  return null;
 }
 async run(args:Row):Promise<Row> {
  if(this.view.isClosed)throw new Cancelled();
  const revision=crypto.randomUUID().toUpperCase();
  if(args.operation==='snapshot')this.documentID=revision;
  const original=this.documentID;
  let flow:Row=core('browserDriverStart',{args,documentId:this.documentID,refs:this.refs,url:this.view.url,revision})??{};
  while(Array.isArray(flow.argv)){
   const argv=flow.argv as string[];
   if(this.documentID!==original)throw new WorldletError('The page changed. Take a fresh snapshot before acting.');
   const consumed=flow.consume===true;
   // Show where Fox acts: its pointer glides to the control before the real step. Nothing is
   // injected into the website's page.
   const pointer=this.environment.pointer();
   if(pointer&&argv.length>1&&['click','fill','focus'].includes(argv[0])){
    try{const point=AgentBrowser.center(await this.command(['get','box',argv[1]]));if(point)await pointer.point(point.x,point.y);}catch(error){if(error instanceof Cancelled)throw error;}
   }
   if(consumed)this.invalidate();
   this.view.markGesture();
   const response=await this.command(argv);
   // A dispatched click/submit may navigate; do not replay it or invalidate its receipt.
   if(!consumed&&this.documentID!==original)throw new WorldletError('The page changed. Take a fresh snapshot before acting.');
   flow=core('browserDriverNext',{flow,response})??{};
  }
  if(flow.refs&&typeof flow.refs==='object'&&typeof flow.documentId==='string'){this.refs=flow.refs;this.documentID=flow.documentId;}
  return flow.result&&typeof flow.result==='object'?flow.result:{error:'Invalid browser driver result.'};
 }
}
export const agentScript=(webRoot:string)=>path.join(webRoot,'browser/agent_browser.py');
