import {getApp,connectionFacts} from '../applets/index.ts';
/** The world log: a running, plain-language line per thing the world or the person did.
 * It exists so the person can see the world keeps going (checks, reads, Fox's saves)
 * next to their own steps (Applets opened, sites visited). It is not the Attention
 * Center: nothing here asks for action, and it never shows source contents. */
export const WORLD_LOG_KINDS=['applet.check','applet.activity','applet.task','routine.run','brought.older','world.action','activity.ui.open','activity.page.opened'] as const;
/** `applet` or `site` is where selecting the line takes the person. */
export type WorldLogLine={seq:number;at:number;who:'world'|'fox'|'you';text:string;applet?:string;site?:string;failed?:true};
export type WorldLogNext={owner:string;title:string;at:number};
type Row={seq?:unknown;at?:unknown;kind?:unknown;key?:unknown;body?:unknown};
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const NAMES:Record<string,string>={gmail:'Mail','google-calendar':'Calendar','apple-notes':'Notes','apple-reminders':'Reminders'};
/** Applet ids arrive as provider keys, catalog ids or `app-` place ids. */
export function worldLogApplet(id:unknown):{key:string;title:string}|null {
 if(typeof id!=='string'||!id)return null;
 const key=id.replace(/^(place-)?app-/,''),app=getApp(key);
 if(!app&&!NAMES[key])return null;
 return {key:app?.key??key,title:NAMES[key]??app!.title};
}
const RECORDS:Record<string,[string,string]>={gmail:['email','emails'],'google-calendar':['event','events'],'apple-notes':['note','notes'],'apple-reminders':['reminder','reminders']};
const plural=(n:number,[one,many]:[string,string])=>n+' '+(n===1?one:many);
/** Host of a visited page, never its path or query. */
function site(url:unknown):string {
 const m=typeof url==='string'?/^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(url):null;
 if(!m)return '';
 const host=m[1].toLowerCase().replace(/^www\./,'');
 return host==='worldlet.local'||host==='localhost'?'':host;
}
function line(row:Row):Omit<WorldLogLine,'seq'|'at'>|null {
 const envelope=obj(row.body),body={...envelope,...obj(envelope.data)},kind=String(row.kind);
 const applet=worldLogApplet(row.key)??worldLogApplet(body.appletId)??worldLogApplet(body.provider);
 const name=applet?.title,at=applet?{applet:applet.key}:{};
 if(kind==='applet.check'){
  if(!name||body.status==='started')return null;
  if(body.status==='complete')return {who:'world',text:`Checked ${name}`,...at};
  if(body.status==='cancelled')return null;
  return {who:'world',text:`${name} check didn’t finish · will retry`,failed:true,...at};
 }
 if(kind==='applet.task'){
  // A task Fox handed to an Applet, which works on it beside the conversation.
  if(!name||body.status==='cancelled')return null;
  if(body.status==='started')return {who:'fox',text:`Fox handed a task to ${name}`,...at};
  if(body.status==='complete')return {who:'world',text:`${name} finished a task`,...at};
  return {who:'world',text:`${name} couldn’t finish a task`,failed:true,...at};
 }
 if(kind==='routine.run'){
  // A Fox routine the Harness ran; one missed while the computer slept or Worldlet was closed runs once, late.
  const routine=typeof body.name==='string'&&body.name.trim()?body.name.trim().slice(0,80):'a routine';
  if(body.status==='complete')return {who:'fox',text:`Fox ran ${routine}${body.late===true?' late':''}`};
  return {who:'fox',text:`Fox couldn’t finish ${routine}${body.late===true?' (late)':''}`,failed:true};
 }
 if(kind==='brought.older'){
  // A large Agent history coming in by time, newest first, after its recent part (platform fox/older-history.ts).
  const agent=body.agent==='hermes'?'Hermes Agent':'',count=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
  const brought=count(body.brought),left=count(body.remaining);
  if(!agent||brought===null)return null;
  const many=(n:number)=>n.toLocaleString('en-US')+(n===1?' conversation':' conversations');
  if(body.status==='bringing')return {who:'world',text:brought===0?`Bringing older ${agent} conversations${left?' · '+many(left)+' to go':''}`:`Brought ${many(brought)} from ${agent} so far${left?' · '+left.toLocaleString('en-US')+' to go':''}`};
  if(body.status==='complete')return {who:'world',text:`Brought every older ${agent} conversation · ${many(brought)}`};
  return {who:'world',text:`Brought ${brought.toLocaleString('en-US')} older ${agent} ${brought===1?'conversation':'conversations'} · the oldest stayed behind`};
 }
 if(kind==='applet.activity'){
  if(body.status!=='complete')return null;
  const n=typeof body.count==='number'&&Number.isSafeInteger(body.count)&&body.count>=0?body.count:null;
  const unit=RECORDS[applet?.key??'']??['item','items'];
  const text=({
   _source_result:n===null?`Read ${name??'a source'}`:n===0?`Nothing new in ${name??'a source'}`:`Read ${plural(n,unit)}${name?' in '+name:''}`,
   upsert_world_items:n?`Fox saved ${plural(n,['finding','findings'])}${name?' from '+name:''}`:'Fox saved a finding',
   review_world_item:'Fox reviewed an item',update_world_item:'Fox updated an item',
   archive_world_items:n?`Fox put away ${plural(n,['item','items'])}`:'Fox put an item away',
   configure_world_check:`Fox changed ${name?name+'’s':'a'} schedule`,meeting_decisions:'Fox reviewed meeting decisions'
  } as Record<string,string>)[body.operation];
  if(!text)return null;
  return {who:body.operation==='_source_result'?'world':'fox',text,...at};
 }
 if(kind==='world.action'){
  // Most host actions are plumbing (layout saves, reads, settings). Only what a person would
  // call doing something is a line.
  if(body.phase!=='succeeded'||body.action!=='worldItemStatus')return null;
  const fox=envelope.actor==='fox'||envelope.actor==='agent';
  const verb=({done:'finished',snoozed:'snoozed',dismissed:'dismissed'} as Record<string,string>)[body.status];
  return verb?{who:fox?'fox':'you',text:`${fox?'Fox':'You'} ${verb} an item${name?' from '+name:''}`,...at}:null;
 }
 if(kind==='activity.ui.open'){
  // Walking between regions is navigation, not something the world did; only opening an Applet is kept.
  return name?{who:'you',text:`You opened ${name}`,...at}:null;
 }
 if(kind==='activity.page.opened'){
  const host=site(body.url);
  return host?{who:'you',text:`You visited ${host}`,site:host}:null;
 }
 return null;
}
/** Whether a saved row makes a line. Hosts read the log's rows through it so that host traffic
 * (`world.action` rows a person would not call doing something) never fills the window of
 * recent rows and pushes every line out. */
export function worldLogKeeps(row:Row):boolean {return line(row)!==null;}
/** Oldest first, newest last; repeats of the same line in a row collapse into the latest. */
export function worldLogLines(rows:readonly Row[],limit=40):WorldLogLine[] {
 const out:WorldLogLine[]=[];
 for(const row of [...(Array.isArray(rows)?rows:[])].sort((a,b)=>Number(a.seq)-Number(b.seq))){
  const seq=Number(row.seq),at=typeof row.at==='number'?row.at:Date.parse(String(row.at))/1000;
  if(!Number.isSafeInteger(seq)||!Number.isFinite(at))continue;
  const value=line(row);if(!value)continue;
  const previous=out.at(-1);
  if(previous&&previous.text===value.text)out.pop();
  out.push({seq,at,...value});
 }
 return out.slice(-Math.max(1,limit));
}
/** The next scheduled source check, from the host's runtime task rows. */
export function worldLogNext(tasks:readonly unknown[],now:number):WorldLogNext|null {
 let next:WorldLogNext|null=null;
 for(const raw of Array.isArray(tasks)?tasks:[]){
  const task=obj(raw);
  if(typeof task.id!=='string'||!task.id.endsWith(':check')||task.enabled===false||task.status==='paused'||task.status==='running')continue;
  const applet=worldLogApplet(task.owner),at=Number(task.nextAt);
  if(!applet||!Number.isFinite(at)||at<now-60)continue;
  if(!next||at<next.at)next={owner:applet.key,title:applet.title,at};
 }
 return next;
}
/** What the world is doing right now: one line per Applet working on a task Fox handed it
 * ("YouTube is working on a task…"), then per Applet reading or syncing from its live connection
 * state ("Reading Mail…"). This replaces a Running badge over the device. */
export function worldLogNow(connections:readonly unknown[],tasks:readonly unknown[]=[]):{applet:string;text:string}[] {
 const out:{applet:string;text:string}[]=[];
 for(const raw of Array.isArray(tasks)?tasks:[]){
  const applet=worldLogApplet(obj(raw).applet);
  if(applet&&!out.some(l=>l.applet===applet.key))out.push({applet:applet.key,text:`${applet.title} is working on a task…`});
 }
 for(const raw of Array.isArray(connections)?connections:[]){
  const link=obj(raw),facts=connectionFacts(link);
  if(!facts?.running||link.sample)continue;
  const applet=worldLogApplet(link.provider);if(!applet||out.some(l=>l.applet===applet.key))continue;
  const verb=facts.activity==='syncing'?'Syncing':(getApp(applet.key)?.content?.activity??'Reading');
  out.push({applet:applet.key,text:`${verb} ${applet.title}…`});
 }
 return out;
}
