/** Seconds per execution attempt. Queue time and OS process teardown are separate. */
export function agentRequestDeadline(body:Record<string,unknown>):number {
 const action=body.action,operation=body.operation;
 // Host-owned Applet execution budget; cannot extend the hard background maximum.
 if(body._background===true&&body._taskTimeoutSeconds!==undefined){
  const value=body._taskTimeoutSeconds;
  if(typeof value!=='number'||!Number.isInteger(value)||value<15||value>600)throw Error('Invalid task timeout');
  return value;
 }
 if(action==='status')return 20;
 if(action==='modelLogin')return 960;
 if(action==='modelRepair')return 120;
 if(['configure','modelConfigure','modelCatalog','modelAdopt'].includes(String(action)))return 25;
 if(action==='google'){
  if(operation==='connect')return 360;
  if(operation==='disconnect')return 25;
  if(['mail_access','send_email','reconcile_email'].includes(String(operation)))return 45;
  return 145;
 }
 if(action==='mcp')return ['configure','login'].includes(String(operation))?360:operation==='remove'?25:145;
 if(action==='notion')return 145;
 // Hermes stops a routine whose model goes quiet for 150 s (HERMES_CRON_TIMEOUT); this
 // only bounds one that keeps working, so a long routine finishes instead of being cut off and lost every time.
 if(action==='routine_tick')return 600;
 // Hermes bounds a conversation summary at 600 s itself (as Worldlet's former built-in Hermes did) and keeps
 // reporting while it runs.
 if(action==='compact')return 720;
 if(action==='attention_tick'||body.monitor===true||action==='chat'&&body.mode==='context_analysis')return 600;
 if(action==='chat')return 120;
 return 240;
}

/** Streaming cannot keep a background job alive forever. Foreground retains idle timeout semantics. */
export function agentDeadlineRemaining(body:Record<string,unknown>,started:number,lastInput:number,now:number):number {
 const deadline=agentRequestDeadline(body),idle=deadline-(now-lastInput);
 return body._background===true||body.monitor===true||['attention_tick','routine_tick'].includes(String(body.action))
  ? Math.min(idle,deadline-(now-started)):idle;
}
