import {readRetryDelay,sourceReadAction} from '../../core/applets/index.ts';
// Inventory reads only. Never retries sends, writes, bookings, or Agent turns.
export function quietSourceReader({read,enabled,onSuccess,onIssue,schedule=(fn:()=>void,delay:number):any=>setTimeout(fn,delay),cancel=(timer:any)=>clearTimeout(timer)}){
 const entries=new Map();let stopped=false;
 async function run(key){
  if(stopped||!enabled(key))return;
  const state=entries.get(key)||{failures:0,pending:false,timer:null};entries.set(key,state);
  if(state.pending||state.timer)return;
  state.pending=true;
  try{const result=await read(key,state.failures>0);if(stopped||!enabled(key))return;state.failures=0;onIssue(key,null);onSuccess(key,result);}
  catch(error){if(stopped||!enabled(key))return;state.failures++;const action=sourceReadAction(error);onIssue(key,action);if(!action)state.timer=schedule(()=>{state.timer=null;void run(key);},readRetryDelay(state.failures));}
  finally{state.pending=false;}
 }
 function stop(){stopped=true;for(const state of entries.values())if(state.timer)cancel(state.timer);entries.clear();}
 return {run,stop};
}
