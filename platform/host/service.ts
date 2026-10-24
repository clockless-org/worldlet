import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {askControl,controlAnswers,controlSocketPath} from '../server/src/control.ts';
// The headless service the one-line installers set up on a Mac or Windows computer (platform/install/README.md): the
// Node host (platform/server) on the same library as the desktop app, started at login. Two hosts never run on one
// library, so when the person installs the app the app takes the World over: the service no longer starts at login,
// the running one stops cleanly, and the vault entries it sealed open in the app (vault.ts `earlier`).
/** The launchd agent install.sh writes on a Mac: ~/Library/LaunchAgents/<label>.plist. */
export const MAC_SERVICE_LABEL='ai.worldlet.service';
/** The value install.ps1 writes under HKCU's Run key on Windows. */
export const WINDOWS_SERVICE_RUN_VALUE='WorldletService';
const RUN_KEY='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

type Deps={platform?:string;home?:string;uid?:number;run?:(command:string,args:string[])=>void;stopped?:(socket:string)=>Promise<boolean>;wait?:(ms:number)=>Promise<void>};
/** Takes the library over from a headless service: removes its login start and stops it. Returns what it did, for the
 * log ([] when no service was there). Never throws: the app starts whatever happens. */
export async function takeOverService(root:string,{platform=process.platform,home=os.homedir(),uid=process.getuid?.()??0,run=(command,args)=>{execFileSync(command,args,{stdio:'ignore',timeout:20_000,windowsHide:true});},
 stopped=async socket=>!await controlAnswers(socket),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}:Deps={}):Promise<string[]> {
 const done:string[]=[];
 if(platform==='darwin'){
  const plist=path.join(home,'Library/LaunchAgents',MAC_SERVICE_LABEL+'.plist');
  if(fs.existsSync(plist)){
   // bootout stops it too (SIGTERM, a clean stop) and keeps launchd from starting it again.
   try{run('launchctl',['bootout',`gui/${uid}`,plist]);}catch{}
   fs.rmSync(plist,{force:true});done.push('removed the service\'s launch agent');
  }
 }
 if(platform==='win32'){
  try{run('reg',['query',RUN_KEY,'/v',WINDOWS_SERVICE_RUN_VALUE]);run('reg',['delete',RUN_KEY,'/v',WINDOWS_SERVICE_RUN_VALUE,'/f']);done.push('removed the service\'s start at login');}catch{}
 }
 const socket=controlSocketPath(root);
 if(!await stopped(socket)){
  const reply=await askControl(socket,{command:'stop'},5000).catch(()=>null);
  if(reply){
   for(let waited=0;waited<30&&!await stopped(socket);waited++)await wait(1000);
   done.push(await stopped(socket)?'stopped the running service':'asked the running service to stop, and it is still running');
  }
 }
 return done;
}
