import fs from 'node:fs';
import {app,type WebContents} from 'electron';
import {loginItemOptions} from '../modules/shell/login-item.ts';
import type {Row} from '../host/types.ts';
import {errorMessage} from '../files.ts';
/** RC login item check (#1229): the packaged app turns Open at Login on and off again through the same
 * `loginItem` action as the setting, reading the system back after each step, restores what it found,
 * writes a `worldlet-login-item-check/1` report, then quits. `Worldlet --login-item-check <absolute
 * path>.json`. scripts/release-login-item-mac.mjs judges the report; this file reports facts. */
export interface LoginItemCheckRequest {report:string}
export const LOGIN_ITEM_CHECK_USAGE='Usage: Worldlet --login-item-check <absolute path>.json';
/** null without --login-item-check; malformed arguments are a usage error, never a silent default. */
export function loginItemCheckRequest(argv:string[]):LoginItemCheckRequest|null {
 const flag=argv.indexOf('--login-item-check');
 if(flag<0)return null;
 const report=argv[flag+1];
 if(!report||!(report.startsWith('/')||/^[A-Za-z]:\\/.test(report))||!report.endsWith('.json'))throw Error(LOGIN_ITEM_CHECK_USAGE);
 return {report};
}
function base(){
 return {format:'worldlet-login-item-check/1',pid:process.pid,platform:process.platform,channel:'',
  app:{path:process.execPath,version:app.getVersion()},startedAt:new Date().toISOString(),finishedAt:null as string|null,
  steps:[] as Row[],restored:null as boolean|null,error:null as string|null};
}
const write=(report:Record<string,unknown>,request:LoginItemCheckRequest)=>fs.writeFileSync(request.report,JSON.stringify(report,null,2));
export function refuseLoginItemCheckBesideRunningCopy(request:LoginItemCheckRequest){
 write({...base(),error:'Another Worldlet is running with the same data; quit it, then run the check again.'},request);
}
const settings=()=>{
 const raw=app.getLoginItemSettings(loginItemOptions()) as Row;
 return {openAtLogin:raw.openAtLogin,status:raw.status??null,executableWillLaunchAtLogin:raw.executableWillLaunchAtLogin??null};
};
/** Each step records the action's answer and what the system itself reports right after. */
export async function runLoginItemCheck(request:LoginItemCheckRequest,channel:string,dispatch:(body:Row,sender:WebContents)=>Promise<unknown>,sender:WebContents){
 const report:Record<string,any>={...base(),channel};
 const step=async(name:string,body:Row)=>{
  const entry:Row={name};
  try{entry.value=await dispatch({action:'loginItem',...body},sender);}catch(error){entry.error=errorMessage(error);}
  try{entry.system=settings();}catch(error){entry.systemError=errorMessage(error);}
  report.steps.push(entry);return entry;
 };
 try{
  const initial=await step('initial',{operation:'status'});
  const wasOn=initial.system?.openAtLogin===true;
  await step('on',{operation:'set',enabled:true});
  await step('off',{operation:'set',enabled:false});
  // Leave the computer as it was: a person who had it on keeps it on.
  if(wasOn)await step('restore',{operation:'set',enabled:true});
  const last=report.steps.at(-1);
  report.restored=last.system?.openAtLogin===wasOn;
 }catch(error){report.error=errorMessage(error);}
 report.finishedAt=new Date().toISOString();
 write(report,request);return report;
}
