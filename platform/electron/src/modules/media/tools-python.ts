import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {WorldletError} from '../../files.ts';
import {environment,executable,run,WINDOWS_BASE} from './io.ts';

/** The Python Worldlet's own helpers run on (local speech, coding session readers, the browser driver's relay),
 * whichever Agent Fox uses: Worldlet's, never an Agent's (owner decision 2026-10-09: Worldlet customizes nothing
 * below the Harness contract, so no helper borrows a Harness's Python). The bundled uv installs a pinned CPython
 * and a virtual environment with pip (speech installs its packages with it) and the hash-pinned packages in
 * `local-tools/requirements.txt`, once, in the installation library's `tools` folder. */
export const TOOLS_PYTHON_VERSION='3.12.14';
export interface ToolsPythonOptions {
 /** `<installation library>/tools`. */
 folder:string;
 /** The bundled uv, or null when this build has none. */
 uv:()=>string|null|Promise<string|null>;
 /** Hash-pinned requirements (`local-tools/requirements.txt`). */
 requirements:string;
 platform?:NodeJS.Platform;
 /** Runs one setup command (tests replace it). */
 run?:(command:string,args:string[],env:Record<string,string>)=>Promise<number|null>;
}
export class ToolsPython {
 private readonly options:ToolsPythonOptions;
 private preparing:Promise<string>|null=null;
 constructor(options:ToolsPythonOptions){this.options=options;}
 private get windows(){return (this.options.platform??process.platform)==='win32';}
 /** The environment's interpreter. */
 get python(){return this.windows?path.join(this.options.folder,'venv','Scripts','python.exe'):path.join(this.options.folder,'venv','bin','python3');}
 private identity(){return crypto.createHash('sha256').update(TOOLS_PYTHON_VERSION+'\n'+fs.readFileSync(this.options.requirements,'utf8')).digest('hex');}
 private ready(){
  try{return fs.readFileSync(path.join(this.options.folder,'.ready'),'utf8')===this.identity()&&executable(this.python);}catch{return false;}
 }
 /** An explicit `WORLDLET_TOOLS_PYTHON` wins (a developer's or a managed computer's own); otherwise Worldlet's own,
  * set up on first use. */
 path():Promise<string> {
  const explicit=process.env.WORLDLET_TOOLS_PYTHON;
  if(explicit){
   if(!path.isAbsolute(explicit)||!executable(explicit))return Promise.reject(new WorldletError('Local tools need an executable Python path in WORLDLET_TOOLS_PYTHON.'));
   return Promise.resolve(explicit);
  }
  if(this.ready())return Promise.resolve(this.python);
  // Callers share one setup; it is forgotten before any of them resumes, so a later call checks again.
  if(!this.preparing){const preparing:Promise<string>=this.prepare().finally(()=>{if(this.preparing===preparing)this.preparing=null;});this.preparing=preparing;}
  return this.preparing;
 }
 private async prepare():Promise<string> {
  const uv=await this.options.uv();
  if(!uv||!executable(uv))throw new WorldletError('Worldlet’s local tools are missing from this app. Reinstall Worldlet.');
  const {folder}=this.options;
  fs.mkdirSync(folder,{recursive:true,mode:0o700});
  const env=this.environment();
  const step=async(args:string[],failure:string,command=uv)=>{
   const code=await (this.options.run??runSetup)(command,args,env);
   if(code!==0)throw new WorldletError(failure);
  };
  fs.rmSync(path.join(folder,'.ready'),{force:true});
  fs.rmSync(path.join(folder,'venv'),{recursive:true,force:true});
  await step(['venv',path.join(folder,'venv'),'--python',TOOLS_PYTHON_VERSION,'--managed-python','--seed','--no-config'],'Worldlet could not set up Python for its local tools. Check your connection and try again.');
  await step(['pip','install','--python',this.python,'--no-config','--require-hashes','--only-binary',':all:','-r',this.options.requirements],'Worldlet could not install its local tools. Check your connection and try again.');
  await step(['-I','-B','-c','import sys,websockets; assert sys.version_info[:2]==(3,12)'],'Worldlet’s local tools did not start. Try again.',this.python);
  if(!executable(this.python))throw new WorldletError('Worldlet could not set up Python for its local tools. Try again.');
  fs.writeFileSync(path.join(folder,'.ready'),this.identity(),{mode:0o600});
  return this.python;
 }
 private environment(){
  const {folder}=this.options;
  const uv={UV_PYTHON_INSTALL_DIR:path.join(folder,'python'),UV_CACHE_DIR:path.join(folder,'cache'),UV_NO_PROGRESS:'1',UV_PYTHON_DOWNLOADS:'automatic',PYTHONDONTWRITEBYTECODE:'1'};
  const network=['SSL_CERT_FILE','SSL_CERT_DIR','HTTPS_PROXY','HTTP_PROXY','NO_PROXY'];
  return this.windows?environment([...WINDOWS_BASE,...network],uv):environment(['HOME','PATH','TMPDIR','LANG',...network],uv);
 }
}

function runSetup(command:string,args:string[],env:Record<string,string>):Promise<number|null> {
 return run(command,args,{env,timeout:15*60_000,limit:4_000_000,timeoutMessage:'Setting up Worldlet’s local tools took too long. Try again.'}).then(result=>result.code);
}
