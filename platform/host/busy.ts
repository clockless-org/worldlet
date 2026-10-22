import {performance} from 'node:perf_hooks';
import {MAIN_STALL_MS,stallTask} from '../../agent/app/index.ts';

// Main-process stalls (owner decision 2026-10-11, after a report of a slow first week on a smaller Mac): the World page,
// every website page's input and Fox all wait on this process, so synchronous work here that runs for a second or more
// freezes the app. `busyWith` names the work it runs (a host action, a background task) and reports it when it ran that
// long; the heartbeat catches the rest as `unlabelled`. Only the task's code name and how long it took leave this module.

export interface Stall {task:string;ms:number}
type Listener=(stall:Stall)=>void;
const listeners:Listener[]=[];
const running:string[]=[];
/** When the last stall `busyWith` reported ended, so the heartbeat does not report it twice. */
let reportedUntil=0;
function report(task:string,ms:number,end:number){
 reportedUntil=Math.max(reportedUntil,end);
 for(const listener of listeners)try{listener({task:stallTask(task),ms:Math.round(ms)});}catch{}
}
/** Runs `work` named `task`; a run of a second or more is reported. For an async `work`, only its synchronous part counts. */
export function busyWith<T>(task:string,work:()=>T):T {
 const started=performance.now();
 running.push(task);
 try{return work();}
 finally{
  running.pop();
  const end=performance.now();
  // Only the outermost task reports: a nested one's time is part of it.
  if(end-started>=MAIN_STALL_MS&&!running.length)report(task,end-started,end);
 }
}
export function onStall(listener:Listener){listeners.push(listener);}

/** A timer that should fire every `every` ms: when it fires a second or more late, nothing let it run. A hidden app's
 * timers can be held back by the system (App Nap, sleep), so this counts only while `watched()` (a window of the app has
 * the focus) and never a gap over ten minutes. */
export function watchMainStalls(watched:()=>boolean,every=250):()=>void {
 let last=performance.now();
 const timer=setInterval(()=>{
  const now=performance.now(),late=now-last-every;
  if(late>=MAIN_STALL_MS&&late<600_000&&reportedUntil<=last&&watched())report('unlabelled',late,now);
  last=now;
 },every);
 timer.unref?.();
 return ()=>clearInterval(timer);
}
