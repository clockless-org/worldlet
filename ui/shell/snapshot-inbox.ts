/** Complete host snapshots supersede pending snapshots, never commands/events.
 * One consumer runs at a time; all callers await the snapshot that replaces theirs.
 * Scheduling yields to rendering/input but cannot preempt a synchronous consumer. */
export function snapshotInbox<T>(consume:(value:T,isCurrent:()=>boolean)=>void|Promise<void>,schedule:(run:()=>void)=>void=backgroundTurn){
 let generation=0,pending:{value:T,generation:number,waiters:{resolve:()=>void,reject:(error:unknown)=>void}[]}|undefined,running=false,scheduled=false;
 function request(){if(scheduled||running||!pending)return;scheduled=true;schedule(()=>{scheduled=false;void drain();});}
 async function drain(){
  if(running||!pending)return;
  const batch=pending;pending=undefined;running=true;
  try{await consume(batch.value,()=>batch.generation===generation);if(pending)pending.waiters.unshift(...batch.waiters);else for(const waiter of batch.waiters)waiter.resolve();}
  catch(error){if(pending)pending.waiters.unshift(...batch.waiters);else for(const waiter of batch.waiters)waiter.reject(error);}
  finally{running=false;request();}
 }
 return (value:T)=>new Promise<void>((resolve,reject)=>{
  generation++;
  if(pending){pending.value=value;pending.generation=generation;pending.waiters.push({resolve,reject});}
  else pending={value,generation,waiters:[{resolve,reject}]};
  request();
 });
}

function backgroundTurn(run:()=>void){
 // Idle work is bounded against starvation; hidden windows cannot depend on RAF.
 if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:250});
 else setTimeout(run,0);
}
