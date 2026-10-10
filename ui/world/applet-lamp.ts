export type LampState='off'|'ready'|'processing'|'error';
export const lampLabels:Record<LampState,string>={off:'Not connected or no content',ready:'Ready',processing:'Running',error:'Needs you'};
/** What the person must do, in their words: a failure is only shown when it names one (read-recovery.ts). */
export const lampNeeds:Record<'reconnect'|'permissions'|'run',string>={reconnect:'Sign-in expired',permissions:'Access needed',run:'A run failed'};
export const lampColors={off:0x171c19,ready:0xffffff,processing:0xffffff,error:0xff4141};
// Running breathes deep and at a walking pace: noticeable from the overview (owner request 2026-10-02), never a flash.
export const LAMP_BREATH_MS=2400;
export function lampOpacity(state:LampState,now:number,reduced=false){return state==='off'?0:state==='ready'?.85:state==='processing'&&!reduced?.65-.35*Math.cos(now/LAMP_BREATH_MS*Math.PI*2):1;}
export type LampAction={label:string;run:()=>void;notice?:string};
export type LampSignal={state:LampState;action?:LampAction};
// Color is an enhancement of an available, visible action, never the only cue.
export function lampDisplayState(signal:LampSignal,actionVisible=true):LampState{return signal.state==='error'&&(!signal.action||!actionVisible)?'ready':signal.state;}

// The socket shows runtime health, independently of the overhead Attention item.
export function appletLamp(status:{phase?:string;failed?:boolean;needs?:string|null;connected?:boolean;usableWithoutLogin?:boolean;count?:number}={},activity?:{sessions?:{status:string}[]},content:{available?:boolean}={}){
 const sessions=activity?.sessions||[];
 // A retry may still carry the previous failure until its result arrives.
 if(['reading','syncing','connecting'].includes(status.phase||'')||sessions.some(s=>s.status==='Running'))return 'processing';
 // A failed check, read or analysis retries by itself: only a failure the person must fix (sign in again,
 // allow access) or a run they asked for lights the lamp red. The rest stays quiet, like the Applet's own page.
 if(status.needs||sessions.some(s=>s.status==='Error'||s.status==='Failed'))return 'error';
 if(status.connected||status.usableWithoutLogin||status.phase==='sample'||(status.count||0)>0||content.available||sessions.length)return 'ready';
 return 'off';
}

// Saved findings, read or not, are only content here: the Attention Center is their
// single reminder surface, so they never give the lamp a color or a notice of its own.
export function appletLampContent(provider:string|undefined,pages:any[],hasRecords=false){
 return {available:hasRecords||!!provider&&pages.some(p=>p.sourceProvider===provider)};
}
