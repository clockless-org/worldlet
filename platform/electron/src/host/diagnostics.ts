import fs from 'node:fs';
import path from 'node:path';
import {core} from '../core.ts';
import {ensureDirectory,errorMessage} from '../files.ts';
/** Appends text to a log file, renamed to `<name>.previous<ext>` once past 1 MB. Never throws. */
export function appendRotated(file:string,text:string){
 try{
  ensureDirectory(path.dirname(file));
  if(fs.existsSync(file)&&fs.statSync(file).size>1_000_000){const ext=path.extname(file);fs.renameSync(file,file.slice(0,-ext.length)+'.previous'+ext);}
  fs.appendFileSync(file,text,{mode:0o600});
 }catch{}
}
/** Everything the main process writes to stdout and stderr is also kept in `logs/main.log`, so an Order can carry it
 * after the terminal (or nothing at all, for an app opened from the Dock) is gone (owner 2026-10-06). */
export function keepProcessOutput(root:string){
 const file=path.join(root,'logs','main.log');
 for(const stream of [process.stdout,process.stderr]){
  const write=stream.write.bind(stream) as (...args:any[])=>boolean;
  let inside=false;
  stream.write=((chunk:any,...rest:any[])=>{
   if(!inside){inside=true;try{appendRotated(file,`${new Date().toISOString().slice(11,23)} ${typeof chunk==='string'?chunk:Buffer.from(chunk).toString('utf8')}`);}finally{inside=false;}}
   return write(chunk,...rest);
  }) as typeof stream.write;
 }
}
/** One recorded failure as the host saw it, error text included: kept in memory only, never written or reported. */
export interface DiagnosticNote {at:string;operation:string;requestId:string;message:string}
/** How many recent failures `recent` keeps. */
const RECENT_NOTES=100;
/** Appends Core-projected error records to `logs/diagnostics.jsonl`, rotated past 1 MB. The file keeps only Core's
 * code and operation, never the error text (core/diagnostics/report.ts); `recent` holds the last few failures with
 * their text in this process's memory, so a development check that finds a failure can say what it was. */
export function createDiagnostics(root:string){
 const file=path.join(root,'logs','diagnostics.jsonl');
 const notes:DiagnosticNote[]=[];
 const append=(line:string)=>{
  try{
   ensureDirectory(path.dirname(file));
   if(fs.existsSync(file)&&fs.statSync(file).size>1_000_000)fs.renameSync(file,file.replace(/\.jsonl$/,'.previous.jsonl'));
   fs.appendFileSync(file,line+'\n',{mode:0o600});
  }catch{}
 };
 return {
  record(error:unknown,operation='host',requestId=''){
   const message=errorMessage(error),at=new Date().toISOString();
   notes.push({at,operation:String(operation),requestId:String(requestId??''),message});
   if(notes.length>RECENT_NOTES)notes.splice(0,notes.length-RECENT_NOTES);
   // Core classifies the failure; the time is the host's fact (Core's row has no clock).
   try{append(JSON.stringify({at,...core('diagnosticError',{operation,requestId,message,name:(error as Error)?.name,cancelled:(error as Error)?.name==='AbortError',platform:process.platform})}));}
   catch{append(JSON.stringify({operation,requestId,message,at}));}
  },
  /** The last failures recorded in this process, oldest first, with their error text. */
  recent():DiagnosticNote[]{return notes.map(note=>({...note}));},
  log(line:string){if(process.env.WORLDLET_DEV==='1'||!process.env.WORLDLET_QUIET)process.stderr.write('[Worldlet] '+line+'\n');}
 };
}
