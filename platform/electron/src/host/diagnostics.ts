import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {core} from '../core.ts';
import {redactDiagnosticText,diagnosticLineCapture} from '../../../../agent/base/index.ts';
import {ensureDirectory,errorMessage} from '../files.ts';
/** Appends text to a log file, renamed to `<name>.previous<ext>` once past 1 MB. Never throws. */
export function appendRotated(file:string,text:string){
 try{
  ensureDirectory(path.dirname(file));
  if((fs.statSync(file,{throwIfNoEntry:false})?.size??0)>1_000_000){const ext=path.extname(file);fs.renameSync(file,file.slice(0,-ext.length)+'.previous'+ext);}
  fs.appendFileSync(file,text,{mode:0o600});
 }catch{}
}
/** Complete lines the main process writes to stdout and stderr are redacted and kept in `logs/main.log`, so an Order can carry it
 * after the terminal (or nothing at all, for an app opened from the Dock) is gone (owner 2026-10-06). */
export function keepProcessOutput(root:string){
 const file=path.join(root,'logs','main.log');
 for(const stream of [process.stdout,process.stderr]){
  const write=stream.write.bind(stream) as (...args:any[])=>boolean;
  const decoder=new StringDecoder('utf8');
  const capture=diagnosticLineCapture(line=>appendRotated(file,`${new Date().toISOString().slice(11,23)} ${line}`));
  let inside=false;
  stream.write=((chunk:any,...rest:any[])=>{
   if(!inside){inside=true;try{capture(typeof chunk==='string'?chunk:decoder.write(Buffer.from(chunk)));}finally{inside=false;}}
   return write(chunk,...rest);
  }) as typeof stream.write;
 }
}
/** One recorded failure as the host saw it, error text included: kept in memory only, never written or reported. */
export interface DiagnosticNote {at:string;operation:string;requestId:string;message:string}
/** How many recent failures `recent` keeps. */
const RECENT_NOTES=100;
/** Appends Core-projected error records to `logs/diagnostics.jsonl`, rotated past 1 MB. The file keeps only Core's
 * code and operation, never the error text (agent/base/report.ts); `recent` holds the last few failures with
 * their text in this process's memory, so a development check that finds a failure can say what it was. */
export function createDiagnostics(root:string){
 const file=path.join(root,'logs','diagnostics.jsonl');
 const notes:DiagnosticNote[]=[];
 const append=(line:string)=>appendRotated(file,line+'\n');
 return {
  record(error:unknown,operation='host',requestId=''){
   const message=redactDiagnosticText(errorMessage(error)),at=new Date().toISOString();
   notes.push({at,operation:redactDiagnosticText(operation),requestId:redactDiagnosticText(requestId),message});
   if(notes.length>RECENT_NOTES)notes.splice(0,notes.length-RECENT_NOTES);
   // Core classifies the failure; the time is the host's fact (Core's row has no clock).
   try{append(JSON.stringify({at,...core('diagnosticError',{operation,requestId,message,name:(error as Error)?.name,cancelled:(error as Error)?.name==='AbortError',platform:process.platform})}));}
   catch{append(JSON.stringify({operation:'host',code:'operationFailed',at}));}
  },
  /** The last failures recorded in this process, oldest first, with their error text. */
  recent():DiagnosticNote[]{return notes.map(note=>({...note}));},
  log(line:string){if(process.env.WORLDLET_DEV==='1'||!process.env.WORLDLET_QUIET)process.stderr.write('[Worldlet] '+redactDiagnosticText(line)+'\n');}
 };
}
