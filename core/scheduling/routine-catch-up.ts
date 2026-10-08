/** Fox routines after a gap in Worldlet's clock (the computer slept, or the app was closed).
 * Each enabled routine whose scheduled time has passed runs once now, however many of its
 * slots were missed; one more than ROUTINE_LATE_MS past its time is reported as late. The
 * Harness keeps the claim and the once-only fire (Hermes collapses missed slots the same way);
 * the host uses this to wake its clock at once on resume and to say which runs were late. */
export const ROUTINE_LATE_MS=5*60_000;
/** One routine as its Harness lists it; `nextRunAt` is the earliest slot not yet run. */
export type RoutineSlot={id:string;name?:string|null;enabled?:boolean|null;state?:string|null;nextRunAt?:string|null};
export type RoutineCatchUp={id:string;name:string;scheduledAt:string;late:boolean};

export function routinesDueAfterGap(routines:readonly RoutineSlot[],now:number):RoutineCatchUp[] {
 const due:RoutineCatchUp[]=[],seen=new Set<string>();
 for(const routine of Array.isArray(routines)?routines:[]){
  if(!routine||typeof routine.id!=='string'||!routine.id||seen.has(routine.id))continue;
  if(routine.enabled===false||routine.state==='paused'||routine.state==='completed')continue;
  const at=typeof routine.nextRunAt==='string'?Date.parse(routine.nextRunAt):NaN;
  if(!Number.isFinite(at)||at>now)continue;
  seen.add(routine.id);
  due.push({id:routine.id,name:typeof routine.name==='string'&&routine.name.trim()?routine.name.trim().slice(0,80):'Scheduled task',scheduledAt:new Date(at).toISOString(),late:now-at>ROUTINE_LATE_MS});
 }
 return due.sort((a,b)=>Date.parse(a.scheduledAt)-Date.parse(b.scheduledAt));
}
