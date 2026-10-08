// Dev-only build delivery. Preparing never mutates the running bundle or its web root.
import {mkdir,readFile,writeFile,rename,rm,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
// committedAt: the source commit's time; pr: the PR number a squash merge puts in its subject;
// behind: how many commits the running app is behind this candidate (the Apply label, owner 2026-10-04).
export type DevCandidate={id:string;revision:string;preparedAt:string;committedAt?:string;pr?:number;behind?:number};
/** "Add Fox looks (#1514)" -> 1514; read locally from the commit subject, no network. */
export function pullRequestNumber(subject:string):number|undefined{const m=/\(#(\d{1,7})\)\s*$/.exec(subject||'');return m?Number(m[1]):undefined;}
// current: the source revision of the running app, recorded when Apply launches a candidate.
export type DevUpdateState={candidate:DevCandidate|null;current?:string;observedAt:string;online:boolean;applying:boolean;error:string|null};
const valid=(v:any):v is DevCandidate=>!!v&&/^[a-f0-9]{24}$/.test(v.id)&&/^[a-f0-9]{7,40}$/.test(v.revision)&&Number.isFinite(Date.parse(v.preparedAt));
const read=async(file:string)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}};
const exists=(file:string)=>access(file).then(()=>true,()=>false);
async function atomic(file:string,value:unknown){await mkdir(path.dirname(file),{recursive:true});const tmp=file+'.tmp';await writeFile(tmp,JSON.stringify(value),{mode:0o600});await rename(tmp,file);}
// The first real error in a failed build step's stderr, for the one-line message Dev shows.
export function failureDetail(stderr:string){
 const lines=stderr.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 const esbuild=lines.findIndex(line=>/\[ERROR\]/.test(line));
 const line=esbuild>=0?lines[esbuild].replace(/^.*?\[ERROR\]\s*/,'')+(lines[esbuild+1]&&/^[\w./-]+:\d+:\d+:?$/.test(lines[esbuild+1])?` (${lines[esbuild+1].replace(/:$/,'')})`:'')
  :lines.find(line=>/^(\w*Error|Error)\b.*:/.test(line))??lines.at(-1);
 return line?': '+line.slice(0,300):'';
}
export class DeferredDevUpdate {
 readonly directory:string;readonly statusFile:string;readonly requestFile:string;
 state:DevUpdateState={candidate:null,observedAt:new Date().toISOString(),online:true,applying:false,error:null};
 readonly app:string;readonly web:string;
 constructor(app:string,web:string){this.app=app;this.web=web;this.directory=path.join(path.dirname(app),'candidates');this.statusFile=path.join(path.dirname(app),'.dev-update.json');this.requestFile=path.join(path.dirname(app),'.dev-apply.json');}
 paths(id:string){if(!/^[a-f0-9]{24}$/.test(id))throw Error('Invalid Dev candidate');const base=path.join(this.directory,id);return {base,app:path.join(base,'Worldlet Dev.app'),web:path.join(base,'WorldletWeb'),previousApp:path.join(base,'previous.app'),previousWeb:path.join(base,'previous-web')};}
 async restore(){await rm(this.requestFile,{force:true});const prior=await read(this.statusFile);if(valid(prior?.candidate)){const p=this.paths(prior.candidate.id);if(await exists(p.app)&&await exists(p.web))this.state.candidate=prior.candidate;}if(/^[a-f0-9]{7,40}$/.test(prior?.current))this.state.current=prior.current;await this.publish();}
 async publish(){this.state.observedAt=new Date().toISOString();await atomic(this.statusFile,this.state);}
 async prepare(revision:string,build:(app:string,web:string)=>Promise<void>,committedAt?:string,pr?:number,behind?:number){
  if(!/^[a-f0-9]{7,40}$/.test(revision))throw Error('Invalid source revision');
  const previous=this.state.candidate,id=randomBytes(12).toString('hex'),p=this.paths(id);await mkdir(p.base,{recursive:true});
  try{await build(p.app,p.web);if(!await exists(p.app)||!await exists(p.web))throw Error('Dev candidate is incomplete');
   this.state={...this.state,candidate:{id,revision,preparedAt:new Date().toISOString(),...(committedAt&&Number.isFinite(Date.parse(committedAt))?{committedAt}:{}),...(Number.isInteger(pr)&&pr!>0?{pr}:{}),...(Number.isInteger(behind)&&behind!>=0?{behind}:{})},error:null};await this.publish();
  }catch(error){this.state.candidate=previous;await rm(p.base,{recursive:true,force:true});this.state.error=String(error.message||error);await this.publish();throw error;}
  // Coalesce only a known superseded candidate, never an applied pair or recovery evidence.
  if(previous){const old=this.paths(previous.id);
   if(!await exists(old.previousApp)&&!await exists(old.previousWeb)){
    try{await rm(old.base,{recursive:true,force:true});}
    catch{this.state.error='The latest build is ready; an older candidate could not be removed.';await this.publish();}
   }
  }
 }
 async requested(){const request=await read(this.requestFile);if(!request)return null;await rm(this.requestFile,{force:true});return typeof request.id==='string'?request.id:null;}
 async apply(id:string,stop:()=>Promise<void>,launch:()=>Promise<void>){
  const c=this.state.candidate;if(!c||id!==c.id)throw Error('The prepared build changed. Review the latest build and choose Apply again.');
  const p=this.paths(id);if(!await exists(p.app)||!await exists(p.web))throw Error('Prepared Dev build is missing');
  this.state.applying=true;this.state.error=null;await this.publish();
  let oldApp=false,oldWeb=false,newApp=false,newWeb=false,stopped=false;
  try{
   await stop();stopped=true;
   if(await exists(this.app)){await rename(this.app,p.previousApp);oldApp=true;}
   if(await exists(this.web)){await rename(this.web,p.previousWeb);oldWeb=true;}
   await mkdir(path.dirname(this.web),{recursive:true});await rename(p.web,this.web);newWeb=true;
   await rename(p.app,this.app);newApp=true;
   await launch();this.state.candidate=null;this.state.current=c.revision;
   // Keep the previous pair on disk until a later explicit cleanup; never erase recovery evidence.
  }catch(error){
   if(stopped){
    try{
     if(newApp){await stop();await rename(this.app,p.app);}
     if(newWeb)await rename(this.web,p.web);
     if(oldApp)await rename(p.previousApp,this.app);
     if(oldWeb)await rename(p.previousWeb,this.web);
     if(oldApp)await launch();
    }catch(restoreError){this.state.candidate=null;throw Error(`${error.message}; recovery needs attention: ${restoreError.message}. Backups remain in ${p.base}`);}
   }
   throw error;
  }finally{this.state.applying=false;await this.publish();}
 }
 async requestCurrent(){const s=await read(this.statusFile),age=Date.now()-Date.parse(s?.observedAt);if(!valid(s?.candidate)||!s.online||s.applying||!Number.isFinite(age)||age<0||age>=15000)throw Error('No prepared build with an active Dev watcher');await atomic(this.requestFile,{id:s.candidate.id});return s.candidate;}
}
