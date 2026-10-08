/**
 * Validates real Hermes host output with the Core rules the native hosts load
 * (the bundled dist/WorldletWeb/shared-core.js, evaluated in a bare JS context
 * like JavaScriptCore/Jint). scripts/hermes-check.py sends one run per stdin line,
 * {scenario, action, requestId, frames}, and reads one reply line per run:
 * {ok:true, frames} or {ok:false, error}.
 *
 * Each run is replayed through harnessReceive as both hosts do:
 * - Mac (HermesWorker.swift): Mac Hermes capabilities, `hermes: true`, and frames
 *   after the final result must be discarded as stale by the next turn.
 * - Windows (ExternalAgent.cs): steer=false, Hermes host events are filtered by
 *   turn before Core, and reading stops at the final result.
 */
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createInterface} from 'node:readline';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const bundle=process.argv[2]??path.join(root,'dist/WorldletWeb/shared-core.js');
const context:{WorldletCore?:{invoke(operation:string,input:string):string}}={};
vm.runInNewContext(readFileSync(bundle,'utf8'),context,{filename:bundle});
const core=context.WorldletCore;
if(!core||typeof core.invoke!=='function')throw Error('The bundled shared core has no invoke entry point: '+bundle);

function invoke(operation:string,input:unknown):any {
 const envelope=JSON.parse(core!.invoke(operation,JSON.stringify(input)));
 if(!envelope.ok)throw Error(envelope.error);
 return envelope.value;
}

const all={streaming:true,tools:true,cancel:true,memory:true,sessions:true,tracing:true};
const hostEvents=['google_auth','model_auth','applet'];
type Profile={name:string;capabilities:Record<string,boolean>;hermes:boolean};
// Keep in step with HermesWorker.capabilities and ExternalAgent's Hermes branch.
const profiles:Profile[]=[
 {name:'Mac host (HermesWorker)',capabilities:{...all,steer:true},hermes:true},
 {name:'Windows host (ExternalAgent)',capabilities:{...all,steer:false},hermes:false},
];
type Run={scenario:string;action:string;requestId:string;frames:unknown[]};

function show(frame:unknown){const text=JSON.stringify(frame);return text.length>800?text.slice(0,800)+'…':text;}

function replay(run:Run,profile:Profile){
 const turn=(requestId:string)=>({requestId,action:run.action,capabilities:profile.capabilities,toolIDs:[] as string[],finished:false});
 let state=turn(run.requestId);
 for(const [index,frame] of run.frames.entries()){
  const where=`${profile.name} rejected frame ${index+1} of ${run.frames.length} ${show(frame)}`;
  try {
   if(state.finished){
    // Windows reads one turn per process and returns at the result.
    if(!profile.hermes)break;
    // Mac keeps the process: late frames reach the next turn, which must drop them.
    const late=invoke('harnessReceive',{state:turn('next-turn'),frame,hermes:true,retired:[run.requestId]});
    if(late.kind!=='stale')throw Error('A frame after the final result was not discarded as stale.');
    continue;
   }
   const value=frame as Record<string,unknown>;
   if(!profile.hermes&&value&&typeof value==='object'&&hostEvents.includes(String(value.type))){
    if(value.requestId!==run.requestId)throw Error('Agent returned an unknown turn.');
    continue;
   }
   state=invoke('harnessReceive',{state,frame,...(profile.hermes?{hermes:true,retired:[]}:{})}).state;
  } catch(error){throw Error(`${where}: ${error instanceof Error?error.message:String(error)}`);}
 }
 if(!state.finished)throw Error(`${profile.name}: the run ended without a final result or error frame.`);
}

for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(!line.trim())continue;
 let reply:Record<string,unknown>;
 try {
  const run=JSON.parse(line) as Run;
  if(typeof run.requestId!=='string'||!run.requestId||!Array.isArray(run.frames))throw Error('Invalid validation request.');
  for(const profile of profiles)replay(run,profile);
  reply={ok:true,frames:run.frames.length};
 } catch(error){reply={ok:false,error:error instanceof Error?error.message:String(error)};}
 process.stdout.write(JSON.stringify(reply)+'\n');
}
