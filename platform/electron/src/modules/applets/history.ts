import fs from 'node:fs';
import path from 'node:path';
import {core} from '../../core.ts';
import {isLink,WorldletError} from '../../files.ts';
import type {WorldLedger} from '../../store/ledger.ts';
import {parse,publicPage} from './rules.ts';
import type {Row} from '../../host/types.ts';
// Local, bounded browsing memory (Mac BrowserHistory). No page content is sent to a model at
// capture time. Kept in the World's database (`browser_visits`); visit times keep the Mac format,
// seconds since 2001. The earlier `browser-history.json` moves in once and stays as `.before-database`.
interface Visit {url:string;title:string;text:string;visitedAt:number}
const REFERENCE=978307200;
const toReference=(ms:number)=>ms/1000-REFERENCE;
const fromReference=(seconds:number)=>(seconds+REFERENCE)*1000;
const sameDay=(a:number,b:number)=>new Date(a).toDateString()===new Date(b).toDateString();
export const isoSeconds=(ms:number)=>new Date(ms).toISOString().replace(/\.\d{3}Z$/,'Z');

/** The public-page gate and URL parsing stay native; Core decides what history remembers. */
export function historyDestination(raw:string):URL|null {
 if(typeof raw!=='string'||raw.length>4096)return null;
 const url=parse(raw);if(!url||!publicPage(url))return null;
 try{const target=core('browserHistoryDestination',{url:url.href});return typeof target==='string'?parse(target):null;}catch{return null;}
}
/** IRI form: only non-ASCII UTF-8 escapes are decoded, so canonical equivalents compare equal
 * while ASCII escapes keep their meaning. */
export function historyIdentity(url:URL){
 return url.href.replace(/(%[89A-Fa-f][0-9A-Fa-f])+/g,run=>{try{return decodeURIComponent(run);}catch{return run;}});
}
export class BrowserHistory {
 private visits:Visit[];
 /** Each visit's row id, in the same order as `visits`. */
 private ids:number[]=[];
 private lastWritten:{url:string,title:string,text:string,at:number}|null=null;
 private readonly ledger:WorldLedger;
 constructor(ledger:WorldLedger){
  this.ledger=ledger;
  const file=path.join(ledger.root,'browser-history.json');
  if(fs.existsSync(file)&&!isLink(file)){
   // A World restored from an older backup brings the file back; it is the newer copy then.
   const saved=JSON.parse(fs.readFileSync(file,'utf8'));
   if(!Array.isArray(saved))throw new WorldletError('Browsing history could not be read.');
   ledger.changeBrowserVisits([],saved.map((visit:Row)=>({url:String(visit.url),title:String(visit.title),text:String(visit.text??''),visitedAt:Number(visit.visitedAt)})),true);
   fs.renameSync(file,file+'.before-database');
  }
  const rows=ledger.browserVisits();
  this.visits=rows.map(({id:_,...visit})=>visit);this.ids=rows.map(row=>row.id);
 }
 record(url:string,title:string,text:string,at=Date.now()){
  const destination=historyDestination(url);
  if(!destination||!title.trim())return;
  const target=historyIdentity(destination);
  const last=this.lastWritten;
  if(last&&last.url===target&&last.title===title&&last.text===text&&at-last.at<300_000&&sameDay(last.at,at))return;
  const item:Visit={url:target,title,text,visitedAt:toReference(at)};
  const result=core('browserHistoryRecord',{visits:this.visits,item,sameDay:this.visits.map(visit=>sameDay(fromReference(visit.visitedAt),at))});
  if(result===null){
   // Unchanged: remember the stored visit's time so repeats skip the encode until it expires.
   const previous=[...this.visits].reverse().find(visit=>visit.url.normalize('NFC')===target.normalize('NFC')&&sameDay(fromReference(visit.visitedAt),at));
   if(previous)this.lastWritten={url:target,title,text,at:fromReference(previous.visitedAt)};
   return;
  }
  if(!Array.isArray(result))throw new WorldletError('Invalid shared history result.');
  // Core drops, adds or trims a few visits; only those rows change.
  const key=(visit:Visit)=>JSON.stringify([visit.url,visit.title,visit.text,visit.visitedAt]);
  const rows=new Map<string,number[]>();
  this.visits.forEach((visit,n)=>{const k=key(visit);rows.set(k,[...rows.get(k)??[],this.ids[n]]);});
  const next:(number|null)[]=(result as Visit[]).map(visit=>rows.get(key(visit))?.shift()??null);
  const added=(result as Visit[]).filter((_,n)=>next[n]===null);
  const ids=this.ledger.changeBrowserVisits([...rows.values()].flat(),added);
  let n=0;this.ids=next.map(id=>id??ids[n++]);
  this.visits=result;this.lastWritten={url:target,title,text,at};
 }
 /** Visits per website host over the past `days`, for an Area's recommendations: hosts and counts only, no pages. */
 sites(days=30):Record<string,number>{
  const since=toReference(Date.now()-days*86_400_000),hosts:Record<string,number>={};
  for(const visit of this.visits){if(visit.visitedAt<since)continue;try{const host=new URL(visit.url).hostname.toLowerCase().replace(/^www\./,'');hosts[host]=(hosts[host]||0)+1;}catch{}}
  return hosts;
 }
 search(args:Row){
  const date=(name:string)=>{
   const raw=args[name];if(typeof raw!=='string'||!raw)return null;
   const day=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
   if(day){const value=new Date(Number(day[1]),Number(day[2])-1,Number(day[3]));if(value.getFullYear()===Number(day[1])&&value.getMonth()===Number(day[2])-1&&value.getDate()===Number(day[3]))return value.getTime();}
   else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(raw)){const value=Date.parse(raw);if(Number.isFinite(value))return value;}
   throw new WorldletError('Use YYYY-MM-DD or an ISO timestamp for history dates.');
  };
  const after=date('after'),before=date('before');
  const result=core('browserHistorySearch',{visits:this.visits,query:typeof args.query==='string'?args.query:'',offset:Number.isInteger(args.offset)?args.offset:0,after:after===null?null:toReference(after),before:before===null?null:toReference(before)});
  if(!result||!Array.isArray(result.items))throw new WorldletError('Invalid shared history result.');
  result.items=result.items.map((row:Row)=>{
   if(typeof row.visitedAt!=='number')throw new WorldletError('Invalid history timestamp.');
   return {...row,visitedAt:isoSeconds(fromReference(row.visitedAt))};
  });
  result.now=isoSeconds(Date.now());result.timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  return result;
 }
}
