import fs from 'node:fs';
import {app,type WebContents} from 'electron';
import type {Row} from '../host/types.ts';
import {errorMessage} from '../files.ts';
/** RC permission check (#1142): the real app on its own data runs the World action that asks macOS for one
 * permission, writes a `worldlet-permission-probe/1` report, then quits. `Worldlet --permission-probe
 * <location|calendars|reminders> <absolute path>.json`. scripts/release-permissions-mac.mjs answers the
 * system prompt through System Events meanwhile and judges the report; this file reports facts. */
export const PROBE_SERVICES=['location','calendars','reminders'] as const;
export type ProbeService=typeof PROBE_SERVICES[number];
export interface ProbeRequest {service:ProbeService;report:string}
export const PROBE_USAGE='Usage: Worldlet --permission-probe <location|calendars|reminders> <absolute path>.json';
/** The World action a person takes for each permission: Weather's "Use my location" and Connect. */
const ACTIONS:Record<ProbeService,Row>={
 location:{action:'weatherLocate'},
 calendars:{action:'connect',provider:'google-calendar'},
 reminders:{action:'connect',provider:'apple-reminders'}
};
/** null without --permission-probe; malformed arguments are a usage error, never a silent default. */
export function probeRequest(argv:string[]):ProbeRequest|null {
 const flag=argv.indexOf('--permission-probe');
 if(flag<0)return null;
 const service=argv[flag+1] as ProbeService,report=argv[flag+2];
 if(!PROBE_SERVICES.includes(service)||!report||!report.startsWith('/')||!report.endsWith('.json'))throw Error(PROBE_USAGE);
 return {service,report};
}
function base(request:ProbeRequest){
 return {format:'worldlet-permission-probe/1',service:request.service,action:ACTIONS[request.service].action,pid:process.pid,
  app:{path:process.execPath,version:app.getVersion()},startedAt:new Date().toISOString(),finishedAt:null as string|null,
  status:'error' as 'granted'|'denied'|'error',message:null as string|null,connected:false,error:null as string|null};
}
const write=(report:Record<string,unknown>,request:ProbeRequest)=>fs.writeFileSync(request.report,JSON.stringify(report,null,2));
export function refuseProbeBesideRunningCopy(request:ProbeRequest){
 write({...base(request),error:'Another Worldlet is running with the same data; quit it, then run the check again.'},request);
}
/** Runs the action through the router as the World page would. `granted` is the action succeeding;
 * `denied` is the error the page shows; `connected` tells whether the feature ended up on. */
export async function runProbe(request:ProbeRequest,dispatch:(body:Row,sender:WebContents)=>Promise<unknown>,
 sender:WebContents,connections:()=>Row[]){
 const report:Record<string,any>=base(request);
 try{
  const value=await dispatch({...ACTIONS[request.service]},sender) as Row;
  report.status='granted';
  if(request.service==='location')report.located=value?.source==='device';
 }catch(error){
  report.status='denied';report.message=errorMessage(error);
 }
 const provider=ACTIONS[request.service].provider;
 report.connected=provider?connections().some(c=>c.provider===provider):report.located===true;
 report.finishedAt=new Date().toISOString();
 write(report,request);return report;
}
