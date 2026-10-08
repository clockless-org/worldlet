import path from 'node:path';
import crypto from 'node:crypto';
import {core} from '../../core.ts';
import {agentEvent,isCancellation} from './protocol.ts';
import type {AgentEventHandler,Row} from './types.ts';

type Recorder=(entry:Row)=>boolean;
const homes=new Map<string,{record:Recorder}>();
/** Streamed text waits at most this long before it is saved, so a crash loses at most this much of a reply. */
const STREAM_FLUSH_MS=1000;
const key=(home:string)=>path.resolve(home);

/** Host-owned journal IO (Mac ExecutionJournal.swift). Payload policy and event schema
 * live in shared Core; private homes are journaled into world.sqlite, payloads included
 * (`WorldLedger.recordExecution`; before 2026-10-05 they were files under execution/). */
export class ExecutionJournal {
 static register(home:string,enabled:boolean,record:Recorder){
  if(enabled)homes.set(key(home),{record});else homes.delete(key(home));
  return home;
 }
 private readonly record:Recorder;
 private readonly runID=crypto.randomUUID().toUpperCase();
 private sequence=0;
 private readonly startedAt=Date.now()/1000;
 private streamedText='';
 private flushTimer:ReturnType<typeof setTimeout>|null=null;
 private constructor(entry:{record:Recorder}){this.record=entry.record;}
 append(kind:string,payload:unknown){
  const event=payload as Row;
  if(kind==='harness.event'&&event?.type==='delta'&&typeof event.text==='string'){
   this.streamedText+=event.text;
   if(Buffer.byteLength(this.streamedText)>=16000)this.flush();
   else if(!this.flushTimer){this.flushTimer=setTimeout(()=>this.flush(),STREAM_FLUSH_MS);this.flushTimer.unref?.();}
   return;
  }
  this.flush();
  this.write(kind,payload);
 }
 /** Saves the streamed text gathered so far as one delta. */
 private flush(){
  if(this.flushTimer){clearTimeout(this.flushTimer);this.flushTimer=null;}
  if(!this.streamedText)return;
  const chunk=this.streamedText;this.streamedText='';this.write('harness.event',{type:'delta',text:chunk});
 }
 private write(kind:string,payload:unknown){
  this.sequence+=1;
  try{
   const entry=core('journalEntry',{id:this.runID+'-'+this.sequence,runId:this.runID,kind,at:Date.now()/1000,payload,startedAt:this.startedAt});
   if(!this.record(entry))process.stderr.write('[Worldlet] Execution journal write failed.\n');
  }catch{process.stderr.write('[Worldlet] Execution journal write failed.\n');}
 }
 static async run(body:Row,home:string,onEvent:AgentEventHandler|undefined,execute:(observed:AgentEventHandler)=>Promise<Row>):Promise<Row> {
  const registered=homes.get(key(home));
  const journal=registered?new ExecutionJournal(registered):null;
  journal?.append('run.started',body);
  try{
   const result=await execute(async event=>{
    const type=typeof event.type==='string'?event.type:'';
    if(type==='trace'){const trace=agentEvent(event);journal?.append(typeof trace.kind==='string'?trace.kind:'harness.event',trace);return null;}
    journal?.append(type==='tool'?'tool.requested':'harness.event',event);
    try{
     const reply=await onEvent?.(event);
     if(type==='tool')journal?.append('tool.result',{id:event.id??'',result:reply??{error:'Tool unavailable'}});
     return reply;
    }catch(error){if(type==='tool')journal?.append('tool.failed',{id:event.id??'',error:(error as Error)?.message??String(error)});throw error;}
   });
   journal?.append(result?.cancelled===true?'run.cancelled':'run.succeeded',result);
   return result;
  }catch(error){
   journal?.append(isCancellation(error)?'run.cancelled':'run.failed',{error:(error as Error)?.message??String(error)});throw error;
  }
 }
}
