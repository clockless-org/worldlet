import {CoreError} from '../../core.ts';
import {WorldletError,characterCount} from '../../files.ts';
import {Cancelled} from '../../store/ledger.ts';
import type {Row} from '../../host/types.ts';

export const now=()=>Date.now()/1000;
export {uuid,isoSeconds,characterCount,characterPrefix,errorMessage as message} from '../../files.ts';
/** Core rule violations and host validation failures; both become correctable tool results. */
/** Input changed or was paused while a background turn ran: not a model error a repair can fix. */
export const CONTEXT_CHANGED='Attention context changed. Read the latest evidence before proposing it again.',SOURCE_PAUSED='This source check is paused.';
export const isValidation=(error:unknown)=>error instanceof WorldletError||error instanceof CoreError;
export const isCancel=(error:unknown)=>error instanceof Cancelled||['AbortError','CancellationError'].includes((error as Error)?.name);
export const checkCancellation=(signal:AbortSignal)=>{if(signal.aborted)throw new Cancelled();};
export const isRow=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
export const rows=(value:unknown):Row[]=>Array.isArray(value)?value.filter(isRow):[];
export const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter(v=>typeof v==='string'):[];
export const int=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)?value:undefined;
export const withinCharacters=(text:string,max:number)=>text.length<=max||characterCount(text)<=max;
/** ISO8601DateFormatter's default (internet date-time, no fractional seconds). */
export const internetDate=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value));
/** Explicit https links in verified source text, as the Mac host's link detector kept them. */
export function httpsLinks(text:string){
 const found=new Set<string>();
 for(const match of text.matchAll(/https:\/\/[^\s<>"'`]+/g)){
  const candidate=match[0].replace(/[.,;:!?'")\]}>]+$/,'');
  try{const url=new URL(candidate);if(url.protocol==='https:'&&url.hostname&&!url.username&&!url.password)found.add(candidate);}catch{}
 }
 return [...found].sort();
}
export function sleep(seconds:number,signal:AbortSignal){
 return new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(new Cancelled());return;}
  const abort=()=>{clearTimeout(timer);reject(new Cancelled());};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,seconds*1000));
  signal.addEventListener('abort',abort,{once:true});
 });
}
