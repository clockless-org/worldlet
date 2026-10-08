import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {digest,WorldletError} from '../../files.ts';
// The Windows preview updater's discovery and verification, free of Electron so release
// scripts can run the same code under plain Node to check a just-published update.
export interface WindowsRelease {version:string;build:number;path:string;size:number;hash:string}
export const WINDOWS_ORIGIN='https://worldlet.ai';
export const WINDOWS_MANIFEST_URL=WINDOWS_ORIGIN+'/downloads/windows-preview.json';
/** The Alpha channel's manifest: the newest RC that passed on 01 (scripts/release-alpha.mjs), its installer under /downloads/alpha/. */
export const WINDOWS_ALPHA_MANIFEST_URL=WINDOWS_ORIGIN+'/downloads/windows-alpha.json';
/** The RC update acceptance (scripts/rc-update-acceptance-windows.mjs) serves its manifest on loopback.
 * Only `http://127.0.0.1:<port>/downloads/windows-preview.json` is accepted; anything else is ignored. */
export function windowsUpdateTest(value:unknown):string|null {
 try{
  const url=new URL(String(value||''));
  return url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.pathname==='/downloads/windows-preview.json'&&!url.search&&!url.hash&&!url.username&&!url.password?url.href:null;
 }catch{return null;}
}

// The installer carries the website engine (CEF, #1170) since Build 1077, which took it past the former
// 300 MiB limit (#1037). Builds before this one reject larger installers, so they update by a fresh download.
// Keep in step with ui/distribution/windows-release.ts.
export const windowsInstallerLimit=1024*1024*1024;
export function parseWindowsManifest(value:unknown):WindowsRelease {
 const row=(value&&typeof value==='object'?value:{}) as Record<string,any>;
 const version=typeof row.version==='string'?row.version:'',build=row.build,size=row.size,hash=typeof row.sha256==='string'?row.sha256:'';
 const name=`Worldlet-${version}-${build}-windows-x64-unsigned.exe`,file=row.url===`/downloads/alpha/${name}`?row.url:`/downloads/${name}`;
 if(row.formatVersion!==1||row.architecture!=='x64'||row.signed!==false||!/^\d+\.\d+\.\d+$/.test(version)||!Number.isInteger(build)||build<1||build>65535||row.url!==file||
  !Number.isInteger(size)||size<100000||size>windowsInstallerLimit||!/^[a-f0-9]{64}$/.test(hash)||typeof row.googleSignIn!=='boolean')
  throw new WorldletError('The Windows update manifest is invalid.');
 return {version,build,path:file,size,hash};
}
/** A manifest body of at most `limit` bytes. */
export async function readManifest(response:Response,limit:number){
 const chunks:Buffer[]=[];let total=0;
 for await (const chunk of response.body as any as AsyncIterable<Uint8Array>){total+=chunk.length;if(total>limit)throw new WorldletError('Update manifest exceeds the limit.');chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
/** The User-Agent the installed updater sends, `Worldlet/<version>`: the website counts update checks and downloads by
 * it (worker/update-checks.ts). Release scripts, which name no version, send the release hosts' own `WorldletMachines/1`. */
export const updaterAgent=(version:string)=>({'User-Agent':/^\d{1,5}(\.\d{1,5}){0,3}$/.test(version)?`Worldlet/${version}`:'WorldletMachines/1'});
/** A download that receives nothing for `idleMs` is aborted with `UPDATE_STALLED`: a stalled connection otherwise holds
 * the whole download timeout (30 min on Mac, 2026-10-08) before the next hourly check can try again. Call `touch()` on
 * every chunk and `stop()` when done. */
export const UPDATE_STALLED='The update download stalled.';
export function stallGuard(idleMs=60_000){
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(new WorldletError(UPDATE_STALLED)),idleMs);timer.unref?.();};
 touch();
 return {signal:controller.signal,touch,stop:()=>clearTimeout(timer),get stalled(){return controller.signal.aborted;}};
}
/** Runs `attempt` again once when it stalled: a fresh connection usually goes through at once. */
export async function retryStalled<T>(attempt:()=>Promise<T>,signal?:AbortSignal):Promise<T> {
 try{return await attempt();}
 catch(error){if(signal?.aborted||!(error instanceof WorldletError)||error.message!==UPDATE_STALLED)throw error;return attempt();}
}
/** The published preview release (15 s, 16 KB, no redirects). */
export async function fetchWindowsRelease(signal?:AbortSignal,manifestUrl=WINDOWS_MANIFEST_URL,version=''):Promise<WindowsRelease> {
 const timeout=AbortSignal.timeout(15_000);
 const response=await fetch(manifestUrl,{redirect:'manual',signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:updaterAgent(version)});
 if(!response.ok)throw new WorldletError(`The Windows update manifest is unavailable (${response.status}).`);
 return parseWindowsManifest(JSON.parse((await readManifest(response,16384)).toString('utf8')));
}
/** Downloads the installer into `directory`, checking the published size and SHA-256 while
 * streaming; returns the verified file (`Worldlet-<version>-<build>-windows-x64-unsigned.exe`). */
export function downloadWindowsInstaller(release:WindowsRelease,directory:string,signal?:AbortSignal,origin=WINDOWS_ORIGIN,version='',idleMs=60_000):Promise<string> {
 return retryStalled(()=>downloadInstallerOnce(release,directory,signal,origin,version,idleMs),signal);
}
async function downloadInstallerOnce(release:WindowsRelease,directory:string,signal:AbortSignal|undefined,origin:string,version:string,idleMs:number):Promise<string> {
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const partial=path.join(directory,crypto.randomUUID()+'.partial');
 const stall=stallGuard(idleMs);
 try{
  const timeout=AbortSignal.timeout(600_000);
  const response=await fetch(origin+release.path,{redirect:'manual',signal:AbortSignal.any([...signal?[signal]:[],timeout,stall.signal]),headers:updaterAgent(version)});
  const declared=Number(response.headers.get('content-length'));
  if(!response.ok||!response.body)throw new WorldletError(`The installer is unavailable (${response.status}).`);
  if(declared&&declared!==release.size)throw new WorldletError('Installer size changed.');
  const hash=crypto.createHash('sha256'),out=fs.openSync(partial,'wx');
  let total=0;
  try{
   for await (const chunk of response.body as any as AsyncIterable<Uint8Array>){
    stall.touch();total+=chunk.length;
    if(total>release.size)throw new WorldletError('Installer exceeds the published size.');
    hash.update(chunk);fs.writeSync(out,chunk);
   }
  }finally{fs.closeSync(out);}
  if(total!==release.size||hash.digest('hex')!==release.hash)throw new WorldletError('Installer verification failed.');
  const installer=path.join(directory,path.basename(release.path));
  fs.renameSync(partial,installer);
  return installer;
 }catch(error){if(stall.stalled)throw new WorldletError(UPDATE_STALLED);throw error;}
 finally{stall.stop();fs.rmSync(partial,{force:true});}
}
/** Re-checks a downloaded installer immediately before it runs. */
export function verifyWindowsInstaller(release:WindowsRelease,file:string){
 const data=fs.readFileSync(file);
 return data.length===release.size&&digest(data)===release.hash;
}
