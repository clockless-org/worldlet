import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {BaseWindow,WebContentsView} from 'electron';
import type {Host} from '../host/types.ts';
import {localAgentFlow} from './local-agent-flow.ts';
import {onboardingFlow} from './onboarding-flow.ts';
import {onboardingPaths} from './onboarding-paths.ts';
import {setupOptions} from './setup-options.ts';
import {errorMessage} from '../files.ts';

// Development-only named checks compiled into the host: `--check <name>` runs one after the
// modules installed and the World loaded, against that launch's library (launchers pass a
// disposable WORLDLET_PROFILE_ROOT). Release builds refuse in main.ts, except the RELEASE_CHECKS (profile.ts)
// on the RC harness's disposable library. Checks are imported statically; the host has no computed imports.
export interface CheckContext {host:Host;window:BaseWindow;view:WebContentsView}
export const checks:Record<string,(context:CheckContext)=>Promise<void>>={'onboarding-flow':onboardingFlow,'onboarding-paths':onboardingPaths,'setup-options':setupOptions,'local-agent-flow':localAgentFlow};

/** Runs one check; it prints its own PASS lines, a failure prints one FAIL line. Resolves to the exit code. */
export async function runCheck(name:string,context:CheckContext):Promise<number> {
 const check=checks[name];
 if(!check){process.stderr.write(`FAIL ${name||'--check'}: unknown check; available: ${Object.keys(checks).join(', ')}\n`);return 1;}
 const frames=recordFrames(name,context,process.env.WORLDLET_CHECK_FRAMES);
 let code=0;
 try{await check(context);}
 catch(error){process.stderr.write(`FAIL ${name}: ${errorMessage(error)}\n`);code=1;}
 await frames?.stop(code);
 return code;
}

/** RC 录像 (owner request 2026-10-02): with WORLDLET_CHECK_FRAMES=<folder> the run keeps a picture of the World view every
 * FRAME_MS (unchanged pictures skipped) and each printed PASS/FAIL line with its time, in <folder>/index.json, so
 * scripts/ui-review.ts can have Codex look at the run's UI afterwards. capturePage reads the app's own rendering:
 * no Screen Recording permission; website panels drawn by other views are not in the pictures. While the World window is
 * closed and Fox stays on the desktop, the view sits in the Companion's transparent window and captures as a black World
 * (RC f79c2afa's review blocker), so only the view shown in the visible World window is recorded. */
export const FRAME_MS=1500,MAX_FRAMES=900,FRAME_WIDTH=1280;
function recordFrames(name:string,{window,view}:CheckContext,folder:string|undefined){
 if(!folder)return null;
 fs.rmSync(folder,{recursive:true,force:true});fs.mkdirSync(folder,{recursive:true});
 const started=Date.now(),frames:{file:string;at:number}[]=[],lines:{at:number;line:string}[]=[];
 let last='',busy=false;
 const write=process.stdout.write.bind(process.stdout),errors=process.stderr.write.bind(process.stderr);
 const note=(chunk:unknown)=>{for(const line of String(chunk).split('\n'))if(/^(PASS|FAIL|SKIP)\b/.test(line))lines.push({at:Date.now()-started,line:line.slice(0,300)});};
 process.stdout.write=((chunk:any,...rest:any[])=>{note(chunk);return write(chunk,...rest);}) as typeof process.stdout.write;
 process.stderr.write=((chunk:any,...rest:any[])=>{note(chunk);return errors(chunk,...rest);}) as typeof process.stderr.write;
 const grab=async()=>{
  if(busy||frames.length>=MAX_FRAMES||view.webContents.isDestroyed()||window.isDestroyed()||!window.isVisible()||!window.contentView.children.includes(view))return;
  busy=true;
  try{
   const image=await view.webContents.capturePage();
   if(image.isEmpty())return;
   const size=image.getSize(),jpeg=(size.width>FRAME_WIDTH?image.resize({width:FRAME_WIDTH}):image).toJPEG(70);
   const hash=crypto.createHash('sha1').update(jpeg).digest('hex');if(hash===last)return;last=hash;
   const file=`frame-${String(frames.length+1).padStart(4,'0')}.jpg`;
   fs.writeFileSync(path.join(folder,file),jpeg);frames.push({file,at:Date.now()-started});
  }catch{}finally{busy=false;}
 };
 const timer=setInterval(()=>{void grab();},FRAME_MS);
 return {async stop(code:number){
  clearInterval(timer);await grab();
  process.stdout.write=write as typeof process.stdout.write;process.stderr.write=errors as typeof process.stderr.write;
  fs.writeFileSync(path.join(folder,'index.json'),JSON.stringify({format:'worldlet-check-frames/1',check:name,startedAt:new Date(started).toISOString(),seconds:Math.round((Date.now()-started)/1000),passed:code===0,frames,lines},null,1));
 }};
}
