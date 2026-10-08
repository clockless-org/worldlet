import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {spawn,type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {adoptFolder,digest,WorldletError} from '../../files.ts';
import {bundledResource} from '../../resources.ts';
import {executable,exists} from './protocol.ts';
import {setTimeout as sleep} from 'node:timers/promises';
import {installationRoot,legacyFolder} from '../../profile.ts';
import type {RuntimeContext} from './types.ts';
import {setupFailure} from './setup-failure.ts';
import {end} from '../media/io.ts';

/** A small signed bootstrap ships with the app. The agent and its Python environment live
 * beside user data, never inside the replaceable app or an existing Hermes profile.
 * Mac HermesInstallation.swift (bootstrap install.sh), Windows HermesInstallation.cs (uv). */
const MISSING='Fox setup files are missing. Reinstall Worldlet and try again.';
const FAILED='Fox could not finish setup. Check your internet connection and ask Fox to try again. Your world and accounts are safe.';
/** The Python inside a virtual environment folder. */
export const venvPython=(venv:string)=>path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python3');

export class HermesInstallation {
 private readonly context:RuntimeContext;
 private installation:Promise<void>|null=null;
 private manifestCache:{revision:string,identity:string,text:string}|null=null;
 constructor(context:RuntimeContext){this.context=context;}
 get bootstrap(){return bundledResource(this.context.profile,'hermesBootstrap');}
 private get manifest(){
  if(this.manifestCache)return this.manifestCache;
  const unavailable={revision:'unavailable',identity:'unavailable',text:''};
  const bootstrap=this.bootstrap;
  if(!bootstrap)return unavailable;
  try{
   const text=fs.readFileSync(path.join(bootstrap,'runtime.json'),'utf8');
   const value=JSON.parse(text);
   if(typeof value.revision!=='string'||!/^[0-9a-fA-F]{40}$/.test(value.revision))return unavailable;
   return this.manifestCache={revision:value.revision,identity:digest(text),text};
  }catch{return unavailable;}
 }
 /** Windows: <library>/runtime/hermes-<digest>; Mac and Linux: <installation library>/runtime/<revision>-<manifest
  * digest>, so an RC check's disposable library reuses the installed runtime, as it did in `Worldlet Runtime`. */
 get root(){
  const {revision,identity}=this.manifest;
  if(process.platform==='win32')return path.join(this.context.root,'runtime','hermes-'+identity.slice(0,16));
  return path.join(installationRoot(this.context.profile),'runtime',revision+'-'+identity.slice(0,12));
 }
 get python(){return venvPython(path.join(this.root,'source/.venv'));}
 get ready(){
  const marker=path.join(this.root,'.ready');
  if(!exists(marker)||!executable(this.python))return false;
  return process.platform!=='win32'||fs.readFileSync(marker,'utf8')===this.manifest.identity;
 }
 /** Only one installation runs per process; a failure lets the next request retry. */
 async prepare(){
  if(!this.installation)this.installation=this.install();
  try{await this.installation;}finally{this.installation=null;}
 }
 private async install(){
  const bootstrap=this.bootstrap;
  if(!bootstrap||this.manifest.revision==='unavailable')throw new WorldletError(MISSING);
  if(process.platform==='win32')await this.installWindows(bootstrap);
  else{
   const uv=path.join(bootstrap,'uv');
   if(!executable(uv))throw new WorldletError(MISSING);
   // The runtime used to sit beside the library in `Worldlet Runtime`. Its virtual environment records
   // absolute paths, so it is rebuilt here rather than moved; its uv download cache moves in and is reused.
   const legacy=legacyFolder('Worldlet Runtime');
   adoptFolder(path.join(legacy,'cache'),path.join(path.dirname(this.root),'cache'));
   fs.mkdirSync(path.dirname(this.root),{recursive:true,mode:0o700});
   if(exists(path.join(this.root,'.ready'))&&!executable(this.python))fs.rmSync(path.join(this.root,'.ready'),{force:true});
   if(process.platform==='darwin'){
    if(!exists(path.join(bootstrap,'install.sh')))throw new WorldletError(MISSING);
    // The shell installer serializes app instances and builds at this final path because
    // editable installs record absolute paths.
    let step='start';
    try{
     await run('/bin/bash',[path.join(bootstrap,'install.sh'),this.root,bootstrap],posixEnvironment(path.join(path.dirname(this.root),'cache')),path.dirname(this.root),true,text=>{for(const match of text.matchAll(/^worldlet-setup-step: (\w+)$/gm))step=match[1];});
    }catch(error){
     const detail=String((error as Error)?.message??error);
     writeSetupLog(path.dirname(this.root),step,detail);
     throw new WorldletError(setupFailure(step,detail));
    }
    if(!exists(path.join(this.root,'.ready')))throw new WorldletError(FAILED);
   }else await this.installLinux(bootstrap,uv);
   if(exists(path.join(this.root,'.ready')))fs.rmSync(legacy,{recursive:true,force:true});
  }
  this.context.changed('runtime-ready');
 }
 /** install.sh, step for step, without the macOS-only tools it calls (plutil, shasum). The
  * Linux package ships the same bootstrap as the Mac (scripts/bundle-hermes-bootstrap.py). */
 private async installLinux(bootstrap:string,uv:string){
  const requirements=path.join(bootstrap,'mac-requirements.txt');
  if(!exists(requirements)||!exists(path.join(bootstrap,'source.sha256')))throw new WorldletError(MISSING);
  const stage=this.root,lock=stage+'.installing';
  const environment={...posixEnvironment(path.join(path.dirname(stage),'cache')),UV_PYTHON_INSTALL_DIR:path.join(path.dirname(stage),'python')};
  if(!await acquire(lock,()=>exists(path.join(stage,'.ready')),900_000))return;
  try{
   if(exists(path.join(stage,'.ready')))return;
   fs.rmSync(stage,{recursive:true,force:true});
   fs.mkdirSync(path.join(stage,'source'),{recursive:true,mode:0o700});
   const spec=JSON.parse(this.manifest.text);
   const archive=path.join(stage,'source.tar.gz');
   await download(`https://codeload.github.com/NousResearch/hermes-agent/tar.gz/${this.manifest.revision}`,archive,256*1024*1024);
   if(digest(fs.readFileSync(archive))!==fs.readFileSync(path.join(bootstrap,'source.sha256'),'utf8').trim())throw new WorldletError('Fox setup failed integrity verification. Reinstall Worldlet and try again.');
   await check('tar',['-xzf',archive,'-C',path.join(stage,'source'),'--strip-components','1','--no-same-owner'],environment,stage);
   fs.rmSync(archive);
   const find=async(args:string[])=>{let text='';await run(uv,['python','find',...args],environment,stage,true,chunk=>{text+=chunk;}).catch(()=>{});return text.trim().split('\n').pop()??'';};
   const venv=path.join(stage,'source/.venv/bin/python3');
   const installDependencies=async(python:string)=>{
    await check(uv,['sync','--project',path.join(stage,'source'),'--python',python,'--extra','mcp','--extra','google','--no-dev','--frozen'],environment,stage);
    await check(uv,['pip','install','--python',venv,'--require-hashes','-r',requirements],environment,stage);
   };
   const versions=['sessionSDK','webSearchDependency'].map(key=>String(spec[key]).split('=='));
   // Importing Hermes creates a profile in HERMES_HOME (default ~/.hermes): keep it in the stage.
   const validateHome=path.join(stage,'validate-home');
   const validate=()=>check(venv,['-I','-B','-c',`import importlib.metadata as m, sys
assert (3, 11) <= sys.version_info[:2] < (3, 14)
from run_agent import AIAgent
from tui_gateway import server
from hermes_state import SessionDB
from hermes_cli.config import load_config
import mcp, google.auth, claude_agent_sdk, ddgs
${versions.map(([name,version])=>`assert m.version(${JSON.stringify(name)}) == ${JSON.stringify(version)}`).join('\n')}`],{...environment,HERMES_HOME:validateHome},stage).finally(()=>fs.rmSync(validateHome,{recursive:true,force:true}));
   let python=await find([String(spec.compatiblePython||'>=3.11,<3.14'),'--system']);
   if(!python){await check(uv,['python','install','3.12','--no-bin'],environment,stage);python=await find(['3.12','--managed-python']);}
   try{await installDependencies(python);await validate();}
   catch{
    // A version-compatible system Python can still be unusable; use the app-owned interpreter.
    await check(uv,['python','install','3.12','--no-bin'],environment,stage);
    fs.rmSync(path.join(stage,'source/.venv'),{recursive:true,force:true});
    await installDependencies(await find(['3.12','--managed-python']));
    await validate();
   }
   fs.writeFileSync(path.join(stage,'.ready'),'');
  }catch(error){
   if(error instanceof WorldletError&&error.message!==FAILED&&!/^Fox setup \(/.test(error.message))throw error;
   throw new WorldletError(FAILED);
  }finally{fs.rmSync(lock,{recursive:true,force:true});}
 }
 /** Windows: uv-managed Python 3.12.14 and hash-pinned wheels; never the user's Python. */
 private async installWindows(bootstrap:string){
  const expected=path.join(this.context.profile.webRoot,'hermes/runtime.json');
  const spec=JSON.parse(this.manifest.text);
  if(!exists(expected)||JSON.stringify(sortKeys(spec))!==JSON.stringify(sortKeys(JSON.parse(fs.readFileSync(expected,'utf8')))))throw new WorldletError('Fox setup files do not match this app. Reinstall Worldlet.');
  if(spec.python!=='3.12'||['sessionSDK','webSearchDependency'].some(key=>!/^[a-z0-9-]+==[0-9.]+$/.test(String(spec[key]))))throw new WorldletError('Invalid Fox setup manifest.');
  const root=this.root,identity=this.manifest.identity;
  fs.mkdirSync(path.dirname(root),{recursive:true});
  if(!await acquire(root+'.lock',()=>this.ready,15*60_000))return;
  try{
   if(this.ready)return;
   const uv=path.join(bootstrap,'uv.exe');
   verifyFile(uv,path.join(bootstrap,'uv.sha256'));
   const requirements=path.join(bootstrap,'windows-requirements.txt');
   const pinned=fs.readFileSync(requirements,'utf8');
   if(['sessionSDK','webSearchDependency'].some(key=>!new RegExp('^'+String(spec[key]).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' \\\\\\r?$','m').test(pinned)))throw new WorldletError('Fox setup files do not match this app. Reinstall Worldlet.');
   // Only the exact manifest-derived runtime directory can be removed. Removal and extraction
   // touch thousands of files during startup, so they must not block the main process (#1245).
   await fs.promises.rm(root,{recursive:true,force:true});
   fs.mkdirSync(root,{recursive:true});
   const archive=path.join(root,'source.zip');
   await download('https://codeload.github.com/NousResearch/hermes-agent/zip/'+spec.revision,archive,256*1024*1024,4*60_000);
   verifyFile(archive,path.join(bootstrap,'source.sha256'));
   await extractZip(archive,path.join(root,'source'),'hermes-agent-'+spec.revision);
   fs.rmSync(archive);
   const environment=windowsSetupEnvironment(root);
   const managed=path.join(root,'python','cpython-3.12.14-windows-x86_64-none','python.exe');
   try{await check(uv,['python','install','3.12.14','--no-bin','--no-registry'],environment,root);}
   catch(error){if(!(String((error as Error).message).includes('Missing expected target directory for Python minor version link')&&exists(managed)))throw error;}
   await check(managed,['-I','-B','-c','import sys,ssl; assert sys.version_info[:3]==(3,12,14)'],environment,root);
   await check(uv,['sync','--project',path.join(root,'source'),'--python',managed,'--no-managed-python','--no-python-downloads','--extra','mcp','--extra','google','--no-dev','--frozen'],environment,root);
   await check(uv,['pip','install','--python',this.python,'--require-hashes','--only-binary',':all:','-r',requirements],environment,root);
   const versions=['sessionSDK','webSearchDependency'].map(key=>{const [name,version]=String(spec[key]).split('==');return `assert m.version('${name}')=='${version}'`;}).join('; ');
   await check(this.python,['-I','-B','-c','import sys,importlib.metadata as m; assert sys.version_info[:2]==(3,12); from run_agent import AIAgent; from tui_gateway import server; from hermes_state import SessionDB; from hermes_cli.config import load_config; import mcp,google.auth,claude_agent_sdk,ddgs; '+versions],environment,root);
   if(!exists(this.python))throw new WorldletError('Fox setup did not produce a Python runtime.');
   fs.writeFileSync(path.join(root,'.ready'),identity);
  }catch(error){
   process.stderr.write('Fox setup: '+(error as Error)?.message+'\n');
   throw new WorldletError('Background setup could not finish. Check your connection and try connecting again. Your saved world is safe.');
  }finally{fs.rmSync(root+'.lock',{recursive:true,force:true});}
 }
}

function writeSetupLog(directory:string,step:string,detail:string){
 try{fs.writeFileSync(path.join(directory,'setup.log'),`${new Date().toISOString()} step=${step}\n${detail}\n`,{mode:0o600});}catch{}
}
/** Serializes app instances (install.sh's lock): a directory holding the owner's PID; a dead
 * owner's lock is reclaimed. False when another instance finished the work meanwhile. */
async function acquire(lock:string,done:()=>boolean,timeout:number){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){
  try{fs.mkdirSync(lock,{mode:0o700});fs.writeFileSync(path.join(lock,'pid'),String(process.pid));return true;}catch{}
  if(done())return false;
  let owner=NaN;try{owner=Number(fs.readFileSync(path.join(lock,'pid'),'utf8').trim());}catch{}
  if(Number.isInteger(owner)&&owner>0){try{process.kill(owner,0);}catch{fs.rmSync(lock,{recursive:true,force:true});continue;}}
  await sleep(2000);
 }
 throw new WorldletError(FAILED);
}
function sortKeys(value:any):any {return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortKeys(value[key])])):value;}
function posixEnvironment(cache:string){
 const env:Record<string,string>={};
 for(const key of ['HOME','PATH','TMPDIR','LANG','SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'])if(process.env[key])env[key]=process.env[key];
 env.UV_CACHE_DIR=cache;
 return env;
}
function windowsSetupEnvironment(root:string){
 const system=process.env.SystemRoot||'C:\\Windows',home=path.join(root,'check-home');
 const env:Record<string,string>={SystemRoot:system,WINDIR:system,PATH:path.join(system,'System32'),HOME:home,USERPROFILE:home,HERMES_HOME:home,APPDATA:path.join(home,'Roaming'),LOCALAPPDATA:path.join(home,'Local'),TEMP:path.join(root,'tmp'),TMP:path.join(root,'tmp'),UV_PYTHON_INSTALL_DIR:path.join(root,'python'),UV_CACHE_DIR:path.join(root,'cache'),UV_NO_PROGRESS:'1',UV_NO_CONFIG:'1',PYTHONUTF8:'1',PYTHONDONTWRITEBYTECODE:'1'};
 for(const key of ['HOME','APPDATA','LOCALAPPDATA','TEMP'])fs.mkdirSync(env[key],{recursive:true});
 return env;
}
function verifyFile(file:string,digestFile:string){
 const expected=fs.readFileSync(digestFile,'utf8').trim();
 if(!/^[a-f0-9]{64}$/i.test(expected)||digest(fs.readFileSync(file)).toLowerCase()!==expected.toLowerCase())throw new WorldletError('Fox setup failed integrity verification. Reinstall Worldlet and try again.');
}
async function download(url:string,file:string,limit:number,timeout=240_000){
 // codeload.github.com answers 429 in bursts: wait 1, 2, 4… s (or Retry-After) like install.sh's curl.
 let response:Response|null;
 for(let attempt=0;;attempt++){
  response=await fetch(url,{redirect:process.platform==='win32'?'error':'follow',signal:AbortSignal.timeout(timeout)}).catch(()=>null);
  if(response?.ok&&response.body)break;
  if(attempt>=8||(response&&response.status!==429&&response.status<500))throw new WorldletError(FAILED);
  await response?.body?.cancel().catch(()=>{});
  const after=Number(response?.headers.get('retry-after'));
  await sleep(after>0?Math.min(after,120)*1000:1000*2**attempt);
 }
 const output=fs.openSync(file,'wx',0o600);
 try{
  let total=0;
  for await(const chunk of response.body as any as AsyncIterable<Uint8Array>){
   total+=chunk.length;
   if(total>limit)throw new WorldletError('Fox setup download is too large.');
   fs.writeSync(output,chunk);
  }
 }finally{fs.closeSync(output);}
}
/** Setup steps still running. Quit ends them with their children (uv, pip, the managed Python): left
 * running, they would keep the Windows library's runtime folder open after Worldlet is gone. On Mac and
 * Linux each step leads its own process group, so quit ends install.sh's uv too: killing bash alone left
 * uv writing the runtime folder after Worldlet quit (RC dc0ac274, ENOTEMPTY removing it). */
const running=new Set<ChildProcess>();
export function endSetup(){for(const child of running)endStep(child);running.clear();}
function endStep(child:ChildProcess){
 if(process.platform!=='win32'&&child.pid&&child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGTERM');return;}catch{}}
 end(child);
}
/** Runs a setup step with explicit arguments; returns the exit code. Diagnostics stay bounded. */
function run(executable:string,args:string[],env:Record<string,string>,cwd:string,capture:boolean,onOutput?:(text:string)=>void):Promise<number> {
 return new Promise((resolve,reject)=>{
  fs.mkdirSync(cwd,{recursive:true});
  const child=spawn(executable,args,{cwd,env,stdio:['ignore',capture?'pipe':'ignore',capture?'pipe':'ignore'],windowsHide:true,detached:process.platform!=='win32'});
  running.add(child);
  let errors='';
  child.stdout?.on('data',chunk=>onOutput?.(String(chunk)));
  child.stderr?.on('data',chunk=>{errors=(errors+String(chunk)).slice(-8192);});
  child.on('error',error=>{running.delete(child);reject(error);});
  child.on('close',code=>{running.delete(child);if(capture&&code!==0)reject(new WorldletError(`Fox setup (${path.basename(executable)}, exit ${code}) could not finish: ${errors}`));else resolve(code??1);});
 });
}
const check=(executable:string,args:string[],env:Record<string,string>,cwd:string)=>run(executable,args,env,cwd,true);
export {run as runSetupStep};

const inflateRaw=promisify(zlib.inflateRaw);
/** Minimal ZIP reader (stored/deflate) for the pinned source archive; every entry must
 * stay under `prefix/`, links and absolute or parent paths are refused. */
export async function extractZip(archive:string,destination:string,prefix:string){
 const data=await fs.promises.readFile(archive);
 let end=-1;
 for(let index=data.length-22;index>=Math.max(0,data.length-65557);index--)if(data.readUInt32LE(index)===0x06054b50){end=index;break;}
 if(end<0)throw new WorldletError('Invalid Fox source archive entry.');
 const count=data.readUInt16LE(end+10);
 if(count>30000)throw new WorldletError('Fox source archive has too many entries.');
 let offset=data.readUInt32LE(end+16),total=0;
 const base=path.resolve(destination)+path.sep;
 for(let index=0;index<count;index++){
  if(data.readUInt32LE(offset)!==0x02014b50)throw new WorldletError('Invalid Fox source archive entry.');
  const method=data.readUInt16LE(offset+10),compressed=data.readUInt32LE(offset+20),size=data.readUInt32LE(offset+24);
  const nameLength=data.readUInt16LE(offset+28),extraLength=data.readUInt16LE(offset+30),commentLength=data.readUInt16LE(offset+32);
  const attributes=data.readUInt32LE(offset+38),local=data.readUInt32LE(offset+42);
  const name=data.subarray(offset+46,offset+46+nameLength).toString('utf8');
  offset+=46+nameLength+extraLength+commentLength;
  if(!name.startsWith(prefix+'/')||name.includes('\\')||((attributes>>>16)&0xF000)===0xA000)throw new WorldletError('Invalid Fox source archive entry.');
  const relative=name.slice(prefix.length+1);
  if(!relative)continue;
  if(relative.split('/').some(part=>part==='.'||part==='..'||part.includes(':')))throw new WorldletError('Invalid Fox source archive path.');
  const target=path.resolve(destination,relative);
  if(!(target+(name.endsWith('/')?path.sep:'')).startsWith(base))throw new WorldletError('Fox source archive escaped its directory.');
  total+=size;
  if(total>1024*1024*1024)throw new WorldletError('Fox source archive is too large.');
  if(name.endsWith('/')){await fs.promises.mkdir(target,{recursive:true});continue;}
  if(data.readUInt32LE(local)!==0x04034b50)throw new WorldletError('Invalid Fox source archive entry.');
  const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28);
  const raw=data.subarray(start,start+compressed);
  const content=method===0?raw:method===8?await inflateRaw(raw):null;
  if(!content||content.length!==size)throw new WorldletError('Invalid Fox source archive entry.');
  await fs.promises.mkdir(path.dirname(target),{recursive:true});
  await fs.promises.writeFile(target,content,{flag:'wx'});
 }
}
