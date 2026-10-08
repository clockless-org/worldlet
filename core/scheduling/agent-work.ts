export function agentWorkPriority(body:Record<string,unknown>):number {
 if(body.action==='warmup')return -1;
 if(body._background===true)return 0;
 return body.action==='chat'?2:1;
}
/** FIFO input order is preserved within a priority. A running native effect must settle first. */
export function nextAgentWork(input:{queued:{id:string;body:Record<string,unknown>}[];busy:boolean;foregroundPending:boolean;independentLane?:boolean}):string|null {
 if(input.busy)return null;
 let selected:{id:string;body:Record<string,unknown>}|undefined;
 for(const job of input.queued){
  if(input.foregroundPending&&!input.independentLane&&agentWorkPriority(job.body)<=0)continue;
  if(!selected||agentWorkPriority(job.body)>agentWorkPriority(selected.body))selected=job;
 }
 return selected?.id??null;
}
/** Seconds without the person's input (keyboard, mouse or an open paired phone) after which model-backed
 * background work stops (#1650). Work resumes, with one catch-up pass, at the next input. */
export const BACKGROUND_IDLE_SECONDS=15*60;
/** `idleSeconds` is the host's activity fact; a missing or invalid value counts as active. */
export function userIdle(input:{idleSeconds?:number}):boolean {
 return typeof input?.idleSeconds==='number'&&Number.isFinite(input.idleSeconds)&&input.idleSeconds>=BACKGROUND_IDLE_SECONDS;
}
/** Native hosts supply grants/capabilities and activity facts; Core decides admission. */
export function admitBackgroundWork(input:{supported:boolean;privateScope:boolean;consent:boolean;busy:boolean;foregroundPending:boolean;independentLane?:boolean;idleSeconds?:number}):boolean {
 return input.supported===true&&input.privateScope===true&&input.consent===true&&!input.busy&&(!input.foregroundPending||input.independentLane===true)&&!userIdle(input);
}
/** Interrupt a background attempt, never requeue/replay it; its owner persists recovery. Summarizing Fox's
 * conversation while it is idle (`compact`) is never interrupted: the person's message waits for it, since
 * stopping it would only make that message start the same summary again. */
export function preemptAgentWork(input:{body:Record<string,unknown>;foregroundPending:boolean;independentLane?:boolean}):boolean {
 return input.independentLane!==true&&input.foregroundPending===true&&input.body._background===true&&!['warmup','compact'].includes(String(input.body.action));
}
/** Status polling may wait in a lane but must not interrupt useful background work. */
export function foregroundAgentWork(body:Record<string,unknown>):boolean {
 return body._background!==true&&!['status','warmup'].includes(String(body.action));
}
