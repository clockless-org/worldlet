// Moment Applets (owner requests 2026-10-04): an Applet made for one moment. The person asks Fox for something
// they need right now ("make me a guide for the Getty today"), Fox's model writes it as one self-contained HTML
// page, and Worldlet tries it, keeps it in this World and stands it in the World and on the paired phone as its own
// Applet until its moment is over. These are the rules every host applies (core/artifacts/README.md). In code and
// storage a made Applet's record is still called a widget.
import {offlinePageProblems,madeGameTrialProblems,sandboxDocument,SANDBOX_POLICY} from '../games/index.ts';

/** The Applet task that makes moment Applets (MOMENT_MAKER in core/applets); it has no device of its own. */
export const WIDGET_APPLET='app-moment-maker';
export const WIDGET_LIMITS=Object.freeze({
 bytes:120_000,widgets:40,title:40,blurb:160,idea:2000,
 /** What a widget may keep of its own: keys, one value and all of it (UTF-16 code units). */
 stateKeys:300,stateValue:4000,stateTotal:100_000,
 /** How long a widget may last unless pinned, and how long a finished one is kept before it is forgotten. */
 maxDays:14,keepDays:30,
 /** The phone's slot: at most this many active widgets, and pages while the sealed box stays under the relay's limit. */
 phoneWidgets:6,phoneBytes:185_000,
 /** Its data (core/applets/MY-APPLETS.md#data-and-page): one JSON value Fox writes and the page shows, serialized. */
 dataBytes:40_000,
});
export interface Widget {
 id:string;title:string;blurb:string;color:string;
 /** The person's own words that asked for the widget (and later changes), newest last. */
 ideas:string[];
 /** Seconds since 1970. */
 createdAt:number;updatedAt:number;version:number;
 /** When its moment is over (seconds since 1970): it leaves Now and the phone then, unless pinned. */
 endsAt:number;pinned:boolean;
 /** When it was put away (its end, or the person archived it); null while active. */
 archivedAt:number|null;
 /** What the page shows, apart from the page itself: Fox updates it without rewriting the page (absent: none). */
 data?:WidgetData;
}
/** A JSON object or array (core/applets/MY-APPLETS.md#data-and-page). */
export type WidgetData=Record<string,unknown>|unknown[];
/** What the widget keeps through its own local storage: each key's value (null once removed) and when it was
 * written (milliseconds since 1970), so the computer and the phone merge edits key by key, newest wins. */
export type WidgetStateEntry={v:string|null;at:number};
export type WidgetState=Record<string,WidgetStateEntry>;

const characters=(value:string)=>[...value];
const clip=(value:unknown,count:number)=>characters(typeof value==='string'?value.replace(/\s+/g,' ').trim():'').slice(0,count).join('');
const HOUR=3600,DAY=86400;

/** A new widget's ID: short, file-name safe and unique enough within one World. */
export function widgetId(random:()=>number=Math.random):string {
 let id='wgt-';for(let i=0;i<10;i++)id+='abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(random()*32)];
 return id;
}
export const validWidgetId=(value:unknown):value is string=>typeof value==='string'&&/^wgt-[a-z0-9]{10}$/.test(value);

/** When a widget ends: the time the model gave (an ISO date), kept between a quarter hour and two weeks away;
 * without one, twelve hours from now. */
export function widgetEnd(value:unknown,now:number):number {
 const parsed=typeof value==='string'?Date.parse(value)/1000:typeof value==='number'?value:NaN;
 if(!Number.isFinite(parsed))return Math.round(now+12*HOUR);
 return Math.round(Math.min(now+WIDGET_LIMITS.maxDays*DAY,Math.max(now+HOUR/4,parsed)));
}

/** The record kept beside a widget's page, from the model's save and the previous record when it replaces one. */
/** Data Fox sent for an Applet: a JSON object or array within the limit, or why not. */
export function readWidgetData(value:unknown):{data:WidgetData}|{error:string} {
 // Tools send it as JSON text, so every model's tool schema can carry it.
 if(typeof value==='string'){try{value=JSON.parse(value);}catch{return {error:'data is not valid JSON.'};}}
 if(!value||typeof value!=='object')return {error:'data must be a JSON object or array.'};
 let text:string;try{text=JSON.stringify(value);}catch{return {error:'data must be plain JSON.'};}
 if(new TextEncoder().encode(text).length>WIDGET_LIMITS.dataBytes)return {error:`data is over ${WIDGET_LIMITS.dataBytes/1000} KB. Keep only what the page shows.`};
 return {data:JSON.parse(text)};
}
const storedData=(value:unknown)=>{const read=readWidgetData(value);return 'data' in read?read.data:undefined;};
/** The page as hosts load it, with its data ahead of its own code: the prelude's `window.worldlet.data` reads it.
 * A page without data is unchanged. */
export function widgetWithData(html:string,data:unknown):string {
 const stored=storedData(data);if(stored===undefined)return html;
 const script=`<script>window.__worldletData=${JSON.stringify(stored).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')};</script>`;
 return sandboxDocument(html,script);
}
export function widgetRecord(input:{title?:unknown;blurb?:unknown;color?:unknown;endsAt?:unknown;data?:unknown},{id,idea,now,previous}:{id:string;idea:string;now:number;previous?:Widget|null}):Widget {
 const title=clip(input.title,WIDGET_LIMITS.title)||previous?.title||'For now';
 const blurb=clip(input.blurb,WIDGET_LIMITS.blurb)||previous?.blurb||'';
 const color=typeof input.color==='string'&&/^#[0-9a-f]{6}$/i.test(input.color)?input.color.toLowerCase():previous?.color||'#5c7f9e';
 const ideas=[...(previous?.ideas??[]),clip(idea,WIDGET_LIMITS.idea)].filter(Boolean).slice(-8);
 const endsAt=input.endsAt==null&&previous?previous.endsAt:widgetEnd(input.endsAt,now);
 const data=input.data===undefined?previous?.data:storedData(input.data);
 return {id,title,blurb,color,ideas,createdAt:previous?.createdAt??now,updatedAt:now,version:(previous?.version??0)+1,endsAt,pinned:previous?.pinned??false,archivedAt:null,...data!==undefined?{data}:{}};
}
export function readWidget(value:unknown):Widget|null {
 if(!value||typeof value!=='object')return null;
 const row=value as Record<string,unknown>;
 if(!validWidgetId(row.id)||typeof row.title!=='string'||typeof row.createdAt!=='number'||typeof row.updatedAt!=='number'||typeof row.endsAt!=='number')return null;
 return {id:row.id,title:clip(row.title,WIDGET_LIMITS.title)||'For now',blurb:clip(row.blurb,WIDGET_LIMITS.blurb),
  color:typeof row.color==='string'&&/^#[0-9a-f]{6}$/i.test(row.color)?row.color:'#5c7f9e',
  ideas:Array.isArray(row.ideas)?row.ideas.filter((idea):idea is string=>typeof idea==='string').slice(-8):[],
  createdAt:row.createdAt,updatedAt:row.updatedAt,version:typeof row.version==='number'?row.version:1,endsAt:row.endsAt,
  pinned:row.pinned===true,archivedAt:typeof row.archivedAt==='number'?row.archivedAt:null,...storedData(row.data)!==undefined?{data:storedData(row.data)}:{}};
}

/** A widget is for now until its end, or for as long as it is pinned; then it is put away. */
export const widgetActive=(widget:Widget,now:number)=>widget.archivedAt===null&&(widget.pinned||now<widget.endsAt);
/** Newest first: a widget just made or changed leads. */
export const orderWidgets=(widgets:Widget[])=>[...widgets].sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
/** What the host does with each widget as time passes: put away the ones whose moment is over, and forget the
 * ones put away long ago (the person can still pin or open a put-away widget until then). */
export function widgetHousekeeping(widgets:Widget[],now:number):{archive:string[];forget:string[]} {
 const archive:string[]=[],forget:string[]=[];
 for(const widget of widgets){
  if(widget.archivedAt===null&&!widget.pinned&&now>=widget.endsAt)archive.push(widget.id);
  else if(widget.archivedAt!==null&&now-widget.archivedAt>=WIDGET_LIMITS.keepDays*DAY)forget.push(widget.id);
 }
 return {archive,forget};
}
/** How the end reads beside a widget's name: "Until 6:00 PM", "Until tomorrow 9:00 AM", "Until Oct 9". */
export function widgetUntil(widget:Widget,now:number,timeZone?:string):string {
 if(widget.pinned)return 'Pinned';
 if(widget.archivedAt!==null)return 'Finished';
 const end=new Date(widget.endsAt*1000),today=new Date(now*1000);
 const day=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 const time=new Intl.DateTimeFormat('en-US',{timeZone,hour:'numeric',minute:'2-digit'}).format(end);
 if(day(end)===day(today))return 'Until '+time;
 if(day(end)===day(new Date((now+DAY)*1000)))return 'Until tomorrow '+time;
 return 'Until '+new Intl.DateTimeFormat('en-US',{timeZone,month:'short',day:'numeric'}).format(end);
}

// State --------------------------------------------------------------------------------------------------
/** A stored or sent state, cleaned: valid keys and values within the limits; anything else is dropped. */
export function readWidgetState(value:unknown):WidgetState {
 const state:WidgetState={};
 if(!value||typeof value!=='object'||Array.isArray(value))return state;
 let total=0;
 for(const [key,entry] of Object.entries(value as Record<string,unknown>).slice(0,WIDGET_LIMITS.stateKeys*2)){
  if(!key||key.length>200||!entry||typeof entry!=='object')continue;
  const {v,at}=entry as {v?:unknown;at?:unknown};
  if(typeof at!=='number'||!Number.isFinite(at)||at<0)continue;
  if(v!==null&&(typeof v!=='string'||v.length>WIDGET_LIMITS.stateValue))continue;
  const value=v as string|null;
  total+=key.length+(value?.length??0);
  if(total>WIDGET_LIMITS.stateTotal||Object.keys(state).length>=WIDGET_LIMITS.stateKeys)break;
  state[key]={v:value,at:Math.round(at)};
 }
 return state;
}
/** The values the page sees (removed keys left out). */
export const widgetValues=(state:WidgetState):Record<string,string>=>Object.fromEntries(Object.entries(state).flatMap(([key,entry])=>entry.v===null?[]:[[key,entry.v]]));
/** The page reported all of its storage: the entries that changed since `state`, stamped `at`. */
export function widgetStateChanges(state:WidgetState,values:unknown,at:number):WidgetState {
 const next=values&&typeof values==='object'&&!Array.isArray(values)?values as Record<string,unknown>:{};
 const changes:WidgetState={};
 for(const [key,value] of Object.entries(next))if(typeof value==='string'&&state[key]?.v!==value)changes[key]={v:value,at};
 for(const [key,entry] of Object.entries(state))if(entry.v!==null&&typeof next[key]!=='string')changes[key]={v:null,at};
 return readWidgetState(changes);
}
/** Merges another side's entries key by key: the newer write wins; on a tie the stored value stays. */
export function mergeWidgetState(state:WidgetState,incoming:unknown):{state:WidgetState;changed:boolean} {
 const merged:WidgetState={...state};let changed=false;
 for(const [key,entry] of Object.entries(readWidgetState(incoming))){
  const current=merged[key];
  if(current&&current.at>=entry.at)continue;
  if(!current&&entry.v===null)continue;
  merged[key]=entry;changed=true;
 }
 return {state:readWidgetState(merged),changed};
}

// Page ----------------------------------------------------------------------------------------------------
/** Every widget runs under this policy on top of the host's blocked network (the Game Factory's). */
export const WIDGET_POLICY=SANDBOX_POLICY;
/** Console lines the page writes for the computer's host (the phones use their own message channels). */
export const WIDGET_REPORT='⁣worldlet-widget:';
/** What the page starts from: its stored values, and where it was scrolled. The computer writes it into the
 * page; the iPhone app sets `window.__worldletWidgetSeed` before the page loads and the Android app answers
 * `WorldletAndroid.seed()`. */
export type WidgetSeed={state:Record<string,string>;scroll?:number};
const prelude=(seed?:WidgetSeed)=>`<meta http-equiv="Content-Security-Policy" content="${WIDGET_POLICY}"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><script>(()=>{'use strict';
${seed?`window.__worldletWidgetSeed=${JSON.stringify(seed).replace(/</g,'\\u003c')};`:''}
const ios=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.worldletWidget,android=window.WorldletAndroid;
const send=value=>{try{const text=JSON.stringify(value);if(ios)ios.postMessage(text);else if(android&&android.post)android.post(text);else console.log(${JSON.stringify(WIDGET_REPORT)}+text);}catch{}};
addEventListener('error',event=>send({error:String(event.message||'Error')+(event.lineno?' (line '+event.lineno+')':'')}));
addEventListener('unhandledrejection',event=>send({error:'Unhandled promise rejection: '+String(event.reason&&event.reason.message||event.reason)}));
let seed={};try{seed=android&&android.seed?JSON.parse(android.seed()):(window.__worldletWidgetSeed||{});}catch{}
const map=new Map();for(const [k,v] of Object.entries(seed&&seed.state||{}))if(typeof v==='string')map.set(k,v);
let timer=0;const flush=()=>{clearTimeout(timer);timer=0;send({state:Object.fromEntries(map)});};
const changed=()=>{if(!timer)timer=setTimeout(flush,120);};
const api={getItem:k=>map.has(String(k))?map.get(String(k)):null,setItem:(k,v)=>{k=String(k);v=String(v);if(map.get(k)===v)return;map.set(k,v);changed();},
 removeItem:k=>{if(map.delete(String(k)))changed();},clear:()=>{if(map.size){map.clear();changed();}},key:i=>[...map.keys()][i]??null};
const storage=new Proxy(api,{get:(t,k)=>k==='length'?map.size:typeof k!=='string'||k in t?t[k]:map.has(k)?map.get(k):undefined,
 set:(t,k,v)=>{api.setItem(k,v);return true;},deleteProperty:(t,k)=>{api.removeItem(k);return true;},has:(t,k)=>map.has(String(k)),ownKeys:()=>[...map.keys()],
 getOwnPropertyDescriptor:(t,k)=>map.has(String(k))?{value:map.get(String(k)),enumerable:true,configurable:true,writable:true}:undefined});
const memory=()=>{const m=new Map();return {getItem:k=>m.has(String(k))?m.get(String(k)):null,setItem:(k,v)=>{m.set(String(k),String(v));},removeItem:k=>{m.delete(String(k));},clear:()=>m.clear(),key:i=>[...m.keys()][i]??null,get length(){return m.size;}};};
try{Object.defineProperty(window,'localStorage',{value:storage,configurable:true});}catch{}
try{Object.defineProperty(window,'sessionStorage',{value:memory(),configurable:true});}catch{}
const scroll=Number(seed&&seed.scroll)||0;if(scroll>0)addEventListener('load',()=>requestAnimationFrame(()=>scrollTo(0,scroll)));
let scrolled=0;addEventListener('scroll',()=>{clearTimeout(scrolled);scrolled=setTimeout(()=>send({scroll:Math.round(scrollY)}),300);},{passive:true});
addEventListener('pagehide',()=>{if(timer)flush();});
// Its data, written just after this prelude by the host (widgetWithData), is read when the page asks for it.
Object.defineProperty(window,'worldlet',{value:Object.freeze({widget:true,get data(){return window.__worldletData===undefined?null:window.__worldletData;}})});
})();</script>`;
/** The document a host loads: the model's page with the policy, the storage that Worldlet keeps and syncs, and
 * the report channel, placed before any of its own code. The computer passes the seed; the phones inject it. */
export function widgetDocument(html:string,seed?:WidgetSeed):string {
 return sandboxDocument(html,prelude(seed));
}
/** One report from the page: all of its storage, where it is scrolled, or a script error. */
export function readWidgetReport(value:unknown):{state?:Record<string,string>;scroll?:number;error?:string}|null {
 let parsed:any;
 try{parsed=typeof value==='string'?JSON.parse(value):value;}catch{return null;}
 if(!parsed||typeof parsed!=='object')return null;
 if(parsed.state&&typeof parsed.state==='object'&&!Array.isArray(parsed.state)){
  const state:Record<string,string>={};
  for(const [key,v] of Object.entries(parsed.state).slice(0,WIDGET_LIMITS.stateKeys))if(typeof v==='string'&&key.length<=200&&v.length<=WIDGET_LIMITS.stateValue)state[key]=v;
  return {state};
 }
 if(typeof parsed.scroll==='number'&&Number.isFinite(parsed.scroll))return {scroll:Math.max(0,Math.min(1e6,Math.round(parsed.scroll)))};
 if(typeof parsed.error==='string')return {error:clip(parsed.error,300)};
 return null;
}
/** A console line from the computer's widget view, if it is one of ours. */
export const readWidgetConsole=(line:unknown)=>typeof line==='string'&&line.startsWith(WIDGET_REPORT)&&line.length<=WIDGET_LIMITS.stateTotal+20_000?readWidgetReport(line.slice(WIDGET_REPORT.length)):null;

/** The static rules a widget's page must pass before it is tried. */
export const checkWidgetSource=(html:unknown)=>offlinePageProblems(html,{noun:'Applet',bytes:WIDGET_LIMITS.bytes});
/** The hidden trial's verdict (it runs at phone size: a widget is used on the phone most of all). */
export const widgetTrialProblems=(report:{errors?:unknown;distinctColors?:unknown;crashed?:unknown;loaded?:unknown})=>madeGameTrialProblems(report,'Applet');

/** What the making task asks of Fox's model. The page contract itself rides in save_applet's description. */
export function widgetTask(idea:string,{previous,now,timeZone}:{previous?:Widget|null;now:number;timeZone?:string}):string {
 const words=clip(idea,1200);
 const local=new Intl.DateTimeFormat('en-US',{timeZone,dateStyle:'full',timeStyle:'short'}).format(new Date(now*1000));
 const base=previous?`Change the Applet "${previous.title}" (${previous.id}) as the person asks: ${words}\nRead its current page with moments/source, then send the whole changed page with moments/save and replaces "${previous.id}".`
  :`Make a new Applet for this moment: one small interactive page the person asked for: ${words}`;
 return base+`\nIt is now ${local}${timeZone?` (${timeZone})`:''}. Read the moments/save schema first and follow it exactly. If it reports problems, fix every one and save again. When it succeeds, tell the person in one short sentence that their new Applet is in their World and on their phone.`;
}
