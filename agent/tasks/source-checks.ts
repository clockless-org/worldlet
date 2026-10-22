import {runtimeFailure} from './runtime-policy.ts';
import type {WorldItem as Row} from '../../contracts/world-item.ts';
/** Schedule decisions only. Hosts own authorization, clocks, timers and execution. */
/** Fallback only when an Applet registration or stored check lacks a valid interval. */
export const DEFAULT_SOURCE_CHECK_MINUTES=30;
const validInterval=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)?value:null;
/** New checks take their interval from the Applet attention registration, identically on every host. */
export function defaultSourceChecks(existing:Row[],providers:string[],now:number,registrations:readonly {provider?:unknown;intervalMinutes?:unknown}[]=[]):Row[]{
 return providers.filter(provider=>!existing.some(row=>row.id===provider)).map(provider=>({id:provider,provider,enabled:true,intervalMinutes:validInterval(registrations.find(r=>r?.provider===provider)?.intervalMinutes)??DEFAULT_SOURCE_CHECK_MINUTES,nextAt:now}));
}
/** Configure an authorized source. The host supplies eligible providers, not policy.
 * Internal setup may omit fields; tool-facing required fields remain in its schema.
 */
export function configureSourceCheck(existing:Row|undefined,request:Row,providers:string[],now:number):Row {
 const provider=request.provider;
 if(typeof provider!=='string'||!providers.includes(provider)||!Number.isFinite(now))throw Error('Invalid source check configuration.');
 if(request.enabled!==undefined&&typeof request.enabled!=='boolean')throw Error('Invalid source check configuration.');
 const interval=request.intervalMinutes===undefined?(existing?.intervalMinutes??DEFAULT_SOURCE_CHECK_MINUTES):request.intervalMinutes;
 if(typeof interval!=='number'||!Number.isInteger(interval)||interval<15||interval>1440)throw Error('Choose 15–1440 minutes.');
 if(existing&&(existing.id!==provider||existing.provider!==provider))throw Error('Source check identity mismatch.');
 const enabled=request.enabled??existing?.enabled??true;
 if(typeof enabled!=='boolean')throw Error('Invalid source check configuration.');
 const check:Row={...existing,id:provider,provider,enabled,intervalMinutes:interval,nextAt:now};
 if(!enabled&&check.lastStatus==='running')check.lastStatus='cancelled';
 return check;
}
export function dueSourceCheck(checks:Row[],providers:string[],now:number,only?:string,firstMail=false):Row|null {
 return [...checks].sort((a,b)=>Number(a.nextAt||0)-Number(b.nextAt||0)).find(row=>(only===undefined||row.provider===only)&&row.enabled===true&&(firstMail||(typeof row.nextAt==='number'?row.nextAt:0)<=now)&&providers.includes(row.provider as string))??null;
}
export function startSourceCheck(check:Row,now:number):Row {
 const interval=validInterval(check.intervalMinutes)??DEFAULT_SOURCE_CHECK_MINUTES;
 return {...check,lastStartedAt:now,lastStatus:'running',nextAt:now+interval*60};
}
export function reconcileSourceCheck(check:Row,latest?:Row):Row {
 if(!latest)return {...check};
 const result={...check};
 if(latest.intervalMinutes!==check.intervalMinutes||latest.enabled!==check.enabled){
  delete result.nextAt;
  if(Object.hasOwn(latest,'nextAt'))result.nextAt=latest.nextAt;
 }
 for(const key of ['enabled','intervalMinutes']){
  delete result[key];if(Object.hasOwn(latest,key))result[key]=latest[key];
 }
 return result;
}

/** Both hosts persist this result; native code only supplies outcome and clock. */
export function finishSourceCheck(check:Row,latest:Row|undefined,status:string,now:number,message?:string):Row {
 if(!['complete','error','cancelled'].includes(status)||!Number.isFinite(now))throw Error('Invalid source check outcome');
 const result=reconcileSourceCheck(check,latest);
 result.lastStatus=status;result.lastFinishedAt=now;
 if(status==='complete'){
  result.lastSuccessAt=now;
  for(const key of ['failures','error','errorCode','requiredAction','waitReason'])delete result[key];
 }else{
  const failure=runtimeFailure({message:message??String(check.errorCode||''),cancelled:status==='cancelled',now,failures:Number(check.failures)||0});
  result.failures=failure.failures;result.errorCode=failure.code;result.waitReason=failure.waitReason;
  const unchanged=!latest||(latest.enabled===check.enabled&&latest.intervalMinutes===check.intervalMinutes);
  if(result.enabled===true&&unchanged)result.nextAt=failure.nextAt;

 }
 return result;
}
/** "Read connected apps": every enabled check becomes due now; the host's check lanes run them. */
export function readSourceChecksNow(checks:Row[],now:number):Row[] {
 if(!Number.isFinite(now))throw Error('Invalid source check request.');
 return checks.filter(row=>row.enabled===true&&row.lastStatus!=='running').map(row=>({...row,nextAt:now}));
}
