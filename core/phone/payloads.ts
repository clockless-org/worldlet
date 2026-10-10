// What the desktop shows the paired phone, and what the phone may ask of the desktop (README.md in this folder).
import {WIDGET_LIMITS,widgetDocument,readWidgetState,type Widget,type WidgetState} from '../artifacts/index.ts';
import {worldLogApplet} from '../activity/index.ts';
import {httpsAddress} from './phone-web.ts';
// The phone renders exactly these shapes (ios/Worldlet/Models.swift); bump PAIR_PROTOCOL in pairing.ts when one
// changes incompatibly.
export type PhoneGroup='event'|'needsAction'|'unseen';
// fact, summary, source and art are optional (absent when empty), so an older phone ignores them: fact is the row's time
// line as the desktop Center writes it ("Due tomorrow · 5:00 PM", "Back tomorrow"), summary the card's saved Markdown
// brief, source the provider the item came from and art the card's illustration (a picture name the phone bundles:
// scene-<id> from resources/styles/builtin/assets/attention/scenes.json, or coming-up, do-something, worth-knowing).
export type PhoneAttentionItem={id:string,ids:string[],group:PhoneGroup,title:string,action:string,context:string,
 start:string|null,when:string,level:number,snoozed:boolean,fact?:string,summary?:string,source?:string,art?:string,fox?:PhoneItemFox,
 /** The Applet the item came from (its home in the Applet world), when the World has it. */
 applet?:string};
/** Fox's dialogue on an item's card, as the computer shows it: the line Fox says when the card opens (`say`) with the one
 * option it offers (`option`, its primary help), and the item's own latest turns, newest last. A turn still running has
 * `working` and its current step as `text`. */
export type PhoneItemFox={say:string,option:string,turns:{user:string,text:string,working:boolean,at:string}[]};
/** An account the computer cannot read until the person reconnects it (or allows access) there; the phone never signs in. */
export type PhoneAccount={provider:string,title:string,action:'reconnect'|'permissions'};
/** One Applet in the phone's Applet world (owner decision 2026-10-03: swipe down from Now). `section` is where the
 * grid shows it: `live` (working now, holding Now items, or a widget for now), `accounts` (a connected source) or
 * `jobs` (an ongoing thing the person made into an Applet, core/tasks; its key is `job-…`) or `places` (every other
 * Applet in the World). `state` is its lamp: busy (working), ready, failed or off. `line` says what
 * it is doing or its status, `recent` its latest world log lines (newest last), `widget` the widget a moment Applet opens,
 * `fox` its own thread of Fox's conversation (what was said inside it), and `mine` where one of the person's own Applets
 * came from (a website, a page Fox made, a conversation), so its tile carries the same mark as its device
 * (core/applets/MY-APPLETS.md). `url` is the website the phone opens when its tile is tapped (phone-web.ts); only
 * moment Applets and ongoing things, which work on the phone in their own page, come without one. */
export type PhoneApplet={key:string,title:string,section:'live'|'accounts'|'jobs'|'places',state:'busy'|'ready'|'failed'|'off',
 line?:string,recent?:{text:string,at:string}[],widget?:string,fox?:PhoneItemFox,mine?:'site'|'page'|'conversation',url?:string};
// `applets` is optional, so an older phone ignores it.
export type PhoneAttention={v:1,at:string,now:PhoneAttentionItem[],later:PhoneAttentionItem[],accounts:PhoneAccount[],applets?:PhoneApplet[]};
export type PhoneTurn={id:string,role:'user'|'fox',text:string,at:string};
export type PhoneConversation={v:1,at:string,busy:boolean,name:string,messages:PhoneTurn[]};
/** The turn Fox is on now, sent as it streams so the phone shows it word by word, as the computer's dialogue does:
 * `steps` are its thinking (the working lines, newest last), `text` the reply so far. `item` is the Attention item whose
 * card the turn was asked from (its conversation), absent for the main conversation. `done` marks the finished reply. */
// `applet` is the Applet the turn was asked in (its thread), absent elsewhere.
/** `approval`: the person's own Agent asks before it acts (contracts/harness-services.ts approvals); the phone answers
 * with a PhoneMessage `approval`. */
export type PhoneApproval={id:string,title:string,detail:string,choices:('once'|'always'|'deny')[]};
export type PhoneLive={v:1,at:string,id:string,item?:string,applet?:string,user:string,steps:string[],text:string,done:boolean,approval?:PhoneApproval};
/** `order` (optional, so an older phone ignores it) says this computer takes Orders, the team's spoken tasks for Claude
 * (core/distribution/order.ts): an Alpha or Dev app on a computer that can send them. Only then the phone shows its
 * Order button (owner request 2026-10-06). */
export type PhoneDesktop={v:1,at:string,name:string,version:string,order?:true};
export type PhoneAction='done'|'later'|'remove';
/** A widget for now (core/artifacts): `page` is the whole document with the widget prelude but no seed (the phone
 * injects its stored values); it is absent when the slot has no room for it, and the phone keeps the page it has. */
export type PhoneWidget={id:string,title:string,blurb:string,color:string,endsAt:string,pinned:boolean,updatedAt:string,version:number,page?:string,state:WidgetState};
export type PhoneWidgets={v:1,at:string,widgets:PhoneWidget[]};
// A chat line with `item` was said with that item's card open and joins its conversation; `option` chooses the option
// Fox offers on the item's card.
// `widget` carries the entries the person changed in a widget on the phone (core/artifacts mergeWidgetState).
// A chat line with `applet` was said inside that Applet's page on the phone: the computer opens the Applet, so the line
// joins its thread. `applet` with action `open` opens the Applet on the computer.
// `order` is what the person said with the phone's Order button: it goes to Claude as an Order from this computer, never
// to Fox as a chat line.
// `web` is what happened on a website the phone opened in its own browser (owner request 2026-10-07): the observer's
// reports (platform/bridge/web-record.js) with the phone's time, kept in the computer's World by the same rules as
// the computer's browser (core/browser/web-record.ts).
export type PhoneMessage={type:'chat',id:string,text:string,item?:string,applet?:string}|{type:'applet',id:string,applet:string,action:'open'}|{type:'widget',id:string,widget:string,state:WidgetState}|{type:'option',id:string,item:string}|{type:'attention',id:string,action:PhoneAction}|{type:'connect',id:string,provider:string}|{type:'order',id:string,said:string}|{type:'web',id:string,applet:string,records:PhoneWebRecord[]}|{type:'approval',id:string,approval:string,choice:'once'|'always'|'deny'};
/** One report from the observer on a page the phone opened, `at` in seconds. `private` says the page showed a password,
 * card or one-time-code field: nothing more is kept from it until its address changes. */
export type PhoneWebRecord={at:number,kind:'page'|'text'|'text-more'|'input'|'click'|'submit'|'private',url:string,title?:string,text?:string,
 field?:string,value?:string,label?:string,href?:string,fields?:string[]};
const WEB_KINDS:PhoneWebRecord['kind'][]=['page','text','text-more','input','click','submit','private'];

export const PHONE_LIMITS=Object.freeze({items:40,turns:40,turnText:4000,chatText:4000,field:400,summary:1500,accounts:20,steps:6,applets:48,recent:4,webRecords:300,webText:100000});
const GROUPS:PhoneGroup[]=['event','needsAction','unseen'];
const clip=(value:unknown,max:number=PHONE_LIMITS.field)=>typeof value==='string'?value.trim().slice(0,max):'';
const iso=(value:unknown)=>{const t=typeof value==='number'?value:Date.parse(String(value??''));return Number.isFinite(t)?new Date(t).toISOString():null;};

// A Center row (ui/hud/native-hud.ts matter) as the phone lists it. Grouped rows keep every member id, so an action on
// the phone settles the whole group, as the desktop card does.
function phoneItem(m:any,snoozed:boolean):PhoneAttentionItem|null{
 const id=clip(m?.worldItemId||m?.id,200);
 if(!id||!GROUPS.includes(m.state))return null;
 const ids=(Array.isArray(m.worldItemIds)&&m.worldItemIds.length?m.worldItemIds:[id]).filter((v:unknown)=>typeof v==='string').slice(0,20);
 const when=m.when&&typeof m.when==='object'?[m.when.clock,m.when.relative].filter(Boolean).join(' · '):clip(m.when);
 return {id,ids,group:m.state,title:clip(m.title),action:clip(m.fullAction||m.actionTitle),context:clip(m.fullContext||m.context),
  start:iso(m.signals?.[0]?.start??m.start),when:clip(when,120),level:Math.max(1,Math.min(5,Number(m.level)||1)),snoozed,
  ...optional({fact:clip(m.when?.factor,120),summary:clip(m.summary??m.signals?.[0]?.summary,PHONE_LIMITS.summary),source:clip(m.provider||m.sourceProvider||m.sources?.[0]?.provider,40),art:typeof m.art==='string'&&/^[a-z0-9-]{1,60}$/.test(m.art)?m.art:''}),...itemFox(m.fox)};
}
function itemFox(value:any):{fox?:PhoneItemFox}{
 if(!value||typeof value!=='object')return {};
 const turns=(Array.isArray(value.turns)?value.turns:[]).slice(-4).map((t:any)=>{const working=t?.status==='working';
  return {user:clip(t?.user,PHONE_LIMITS.field),text:working?clip(t?.step,160):clip(t?.text,PHONE_LIMITS.turnText),working,at:iso(t?.at)||''};})
  .filter((t:any)=>t.user||t.text||t.working);
 const fox={say:clip(value.say),option:clip(value.option,80),turns};
 return fox.say||fox.option||turns.length?{fox}:{};
}
const optional=(fields:Record<string,string>)=>Object.fromEntries(Object.entries(fields).filter(([,value])=>value));
// Accounts come from the World page's source issues (ui/shell/notion-world.ts publishSourceIssues).
// `world` (optional) is the Applet world: the Applets in the World with their lamps, what they are doing now, the world
// log, the widgets for now and each Applet's thread (phoneApplets). Without it the payload is the Center alone.
export function phoneAttention({now,later,accounts=[],world}:{now:any[],later:any[],accounts?:any[],world?:PhoneWorld},at:number):PhoneAttention{
 const places=world?appletPlaces(world.places):[];
 const home=(item:PhoneAttentionItem)=>{const key=appletFor(item.source,places);return key?{...item,applet:key}:item;};
 const pick=(rows:any[],snoozed:(m:any)=>boolean)=>rows.map(m=>phoneItem(m,snoozed(m))).filter((v):v is PhoneAttentionItem=>!!v).slice(0,PHONE_LIMITS.items).map(home);
 const linked=accounts.filter(a=>clip(a?.provider,100)&&['reconnect','permissions'].includes(a.action))
  .map(a=>({provider:clip(a.provider,100),title:clip(a.title,100)||clip(a.provider,100),action:a.action})).slice(0,PHONE_LIMITS.accounts);
 const value:PhoneAttention={v:1,at:new Date(at).toISOString(),now:pick(now,()=>false),later:pick(later,m=>!!m.snoozed),accounts:linked};
 if(world)value.applets=phoneApplets(world,places,value.now);
 return value;
}

/** What the World page knows about its Applets, for the phone's Applet world. `places` are the Applets in the World
 * (key, title, provider, lamp `state`, status `label`, `source` true for one that reads an account, `url` the website
 * the phone opens, phoneWebAddress; a place without one stays on the computer); `now` what each is
 * doing this moment ("Reading Mail…", core/activity worldLogNow); `log` the world log (core/activity WorldLogLine);
 * `widgets` the widgets for now; `jobs` the ongoing things kept (core/tasks: id, title, line and the conversation's latest
 * lines); `thread` an Applet's own turns of Fox's conversation (native-chat threadOf). */
export type PhoneWorld={places:any[],now?:{applet:string,text:string}[],log?:{at:number,text:string,applet?:string}[],
 widgets?:{id:string,title:string}[],jobs?:{id:string,title:string,line:string,recent:{text:string,at:string}[]}[],thread?:(key:string)=>any[]};
type Place={key:string,title:string,provider:string,state:PhoneApplet['state'],label:string,source:boolean,url:string,mine?:'site'};
const STATES:PhoneApplet['state'][]=['busy','ready','failed','off'];
function appletPlaces(rows:any[]):Place[]{
 const seen=new Set<string>(),out:Place[]=[];
 for(const r of Array.isArray(rows)?rows:[]){
  const key=clip(r?.key,60),url=httpsAddress(r?.url);if(!/^[a-z0-9][a-z0-9-]*$/.test(key)||seen.has(key))continue;seen.add(key);
  // Only Applets that work on the phone go there (owner request 2026-10-07).
  if(!url)continue;
  out.push({key,title:clip(r.title,60)||key,provider:clip(r.provider,60)||key,state:STATES.includes(r.state)?r.state:'off',label:clip(r.label,120),source:r.source===true,url,...r.mine==='site'?{mine:'site' as const}:{}});
 }
 return out;
}
// An item's home: the Applet in the World that reads its provider (gmail is Mail), else none.
function appletFor(source:string|undefined,places:Place[]):string|undefined{
 if(!source)return undefined;
 const key=worldLogApplet(source)?.key;
 return (places.find(p=>p.provider===source)??places.find(p=>p.key===source||p.key===key))?.key;
}
/** The Applet world as the phone draws it (owner request 2026-10-07: own Applets on top, the ones that work below,
 * the rest left out): the person's own first (widgets for now, their websites, then ongoing things, each an Applet
 * of its own with its own thread), then the others that open on the phone, those working or holding Now items first,
 * then by recent use as the World lists them. `section` still says where an older phone groups each tile. */
export function phoneApplets(world:PhoneWorld,places=appletPlaces(world.places),now:PhoneAttentionItem[]=[]):PhoneApplet[]{
 const doing=new Map<string,string>();
 for(const l of world.now??[]){const key=worldLogApplet(l?.applet)?.key;if(key&&!doing.has(key))doing.set(key,clip(l.text,120));}
 const recent=new Map<string,{text:string,at:string}[]>();
 for(const l of world.log??[]){const key=worldLogApplet(l?.applet)?.key,when=iso(Number(l?.at)*1000);if(!key||!when||!clip(l.text))continue;
  const list=recent.get(key)??[];list.push({text:clip(l.text,160),at:when});recent.set(key,list.slice(-PHONE_LIMITS.recent));}
 const held=new Set(now.map(i=>i.applet).filter(Boolean));
 const thread=(key:string)=>{const fox=itemFox({turns:world.thread?.(key)??[]}).fox;return fox?{fox}:{};};
 const moments:PhoneApplet[]=(world.widgets??[]).map(w=>({id:clip(w?.id,40),title:clip(w?.title,60)})).filter(w=>/^wgt-[a-z0-9]{10}$/.test(w.id)&&w.title)
  .map(w=>({key:'widget:'+w.id,title:w.title,section:'live',state:'ready',widget:w.id,mine:'page'}));
 const jobs:PhoneApplet[]=(world.jobs??[]).filter(j=>/^job-[a-z0-9]{12}$/.test(j?.id)&&clip(j?.title)).slice(0,PHONE_LIMITS.applets).map(j=>{
  const lines=(Array.isArray(j.recent)?j.recent:[]).map(r=>({text:clip(r?.text,160),at:iso(Date.parse(r?.at))})).filter((r):r is {text:string,at:string}=>!!r.text&&!!r.at).slice(-PHONE_LIMITS.recent);
  const line=clip(j.line,120);
  return {key:j.id,title:clip(j.title,60),section:'jobs',state:'ready',mine:'conversation',...line?{line}:{},...lines.length?{recent:lines}:{},...thread(j.id)} as PhoneApplet;
 });
 const applets=places.map(p=>{
  const line=doing.get(p.key)??p.label,busy=doing.has(p.key)||p.state==='busy';
  const section:PhoneApplet['section']=busy||held.has(p.key)?'live':p.source&&p.state!=='off'?'accounts':'places';
  return {key:p.key,title:p.title,section,state:busy?'busy':p.state,...line?{line}:{},...recent.has(p.key)?{recent:recent.get(p.key)}:{},...thread(p.key),...p.mine?{mine:p.mine}:{},url:p.url} as PhoneApplet;
 });
 const rank=(a:PhoneApplet)=>a.state==='busy'?0:held.has(a.key)?1:2;
 const sites=applets.filter(a=>a.mine),others=applets.filter(a=>!a.mine).sort((a,b)=>rank(a)-rank(b));
 return [...moments,...sites,...jobs,...others].slice(0,PHONE_LIMITS.applets);
}

// The main conversation's recent turns (the companion archive), newest last.
export function phoneConversation({turns,busy,name}:{turns:any[],busy:boolean,name:string},at:number):PhoneConversation{
 const lastSession=[...turns].reverse().find(t=>typeof t?.session==='string')?.session;
 const messages=turns.filter(t=>t&&(t.role==='user'||t.role==='assistant')&&typeof t.text==='string'&&t.text.trim()&&(!lastSession||t.session===lastSession))
  .slice(-PHONE_LIMITS.turns).map(t=>({id:clip(t.id,100)||String(t.createdAt),role:t.role==='user'?'user' as const:'fox' as const,text:clip(t.text,PHONE_LIMITS.turnText),at:iso(t.createdAt)||new Date(at).toISOString()}));
 return {v:1,at:new Date(at).toISOString(),busy,name:clip(name,60)||'Fox',messages};
}

const APPROVAL_CHOICES=['once','always','deny'] as const;
// The running turn (ui/companion/native-chat.ts `worldlet:fox-live`) as the phone shows it.
export function phoneLive(turn:any,at:number):PhoneLive|null{
 const id=clip(turn?.id,120);
 if(!id)return null;
 const key=typeof turn.key==='string'?turn.key:'',item=key.startsWith('attention:')?clip(key.slice(10),200):'',applet=key.startsWith('object:app-')?appletKey(key.slice(11)):'';
 const steps=(Array.isArray(turn.steps)?turn.steps:[]).map((s:unknown)=>clip(s,160)).filter(Boolean).slice(-PHONE_LIMITS.steps);
 const a=turn.approval,approval=a&&clip(a.id,120)&&clip(a.title,200)?{id:clip(a.id,120),title:clip(a.title,200),detail:clip(a.detail,PHONE_LIMITS.turnText),choices:APPROVAL_CHOICES.filter(c=>c==='deny'||(Array.isArray(a.choices)&&a.choices.includes(c)))}:null;
 return {v:1,at:new Date(at).toISOString(),id,...item?{item}:applet?{applet}:{},user:clip(turn.user,PHONE_LIMITS.field),steps,text:clip(turn.text,PHONE_LIMITS.turnText),done:turn.done===true,...approval&&turn.done!==true?{approval}:{}};
}

// The computer's own slot: its name and version, and `order` only while it takes Orders.
export function phoneDesktop({name,version,order}:{name:string,version:string,order:boolean},at:number):PhoneDesktop{
 return {v:1,at:new Date(at).toISOString(),name,version,...order?{order:true as const}:{}};
}

// A message the phone sent, after the box opened. Anything else is ignored, never executed. `connect` only opens the
// account's sign-in on the computer; the person finishes it there.
export function readPhoneMessage(value:any):PhoneMessage|null{
 const id=clip(value?.id,200);
 if(!id)return null;
 if(value.type==='chat'){const text=clip(value.text,PHONE_LIMITS.chatText),item=clip(value.item,200),applet=appletKey(value.applet);return text?{type:'chat',id,text,...item?{item}:applet?{applet}:{}}:null;}
 if(value.type==='applet'){const applet=appletKey(value.applet);return applet&&value.action==='open'?{type:'applet',id,applet,action:'open'}:null;}
 if(value.type==='option'){const item=clip(value.item,200);return item?{type:'option',id,item}:null;}
 if(value.type==='attention'&&['done','later','remove'].includes(value.action))return {type:'attention',id,action:value.action};
 if(value.type==='widget'){const widget=clip(value.widget,40),state=readWidgetState(value.state);return /^wgt-[a-z0-9]{10}$/.test(widget)&&Object.keys(state).length?{type:'widget',id,widget,state}:null;}
 if(value.type==='connect'){const provider=clip(value.provider,100);return provider?{type:'connect',id,provider}:null;}
 if(value.type==='approval'){const approval=clip(value.approval,120);return approval&&APPROVAL_CHOICES.includes(value.choice)?{type:'approval',id,approval,choice:value.choice}:null;}
 if(value.type==='order'){const said=clip(value.said,PHONE_LIMITS.chatText);return said?{type:'order',id,said}:null;}
 if(value.type==='web'){
  const applet=appletKey(value.applet),records=(Array.isArray(value.records)?value.records:[]).slice(0,PHONE_LIMITS.webRecords).map(phoneWebRecord).filter((r):r is PhoneWebRecord=>!!r);
  return applet&&records.length?{type:'web',id,applet,records}:null;
 }
 return null;
}

// A phone's web report: only the observer's own shapes, bounded; anything else in it is dropped.
function phoneWebRecord(value:any):PhoneWebRecord|null{
 const kind=value?.kind,url=clip(value?.url,2000),at=Number(value?.at);
 if(!WEB_KINDS.includes(kind)||!/^https:\/\//i.test(url)||!Number.isFinite(at)||at<=0)return null;
 const fields=Array.isArray(value.fields)?value.fields.filter((f:unknown)=>typeof f==='string').slice(0,40).map((f:string)=>f.slice(0,600)):[];
 return {at,kind,url,...optional({title:clip(value.title,300),text:typeof value.text==='string'?value.text.slice(0,PHONE_LIMITS.webText):'',field:clip(value.field,120),
  value:typeof value.value==='string'?value.value.slice(0,4000):'',label:clip(value.label,200),href:clip(value.href,2000)}),...fields.length?{fields}:{}};
}
const appletKey=(value:unknown)=>{const key=clip(value,60);return /^[a-z0-9][a-z0-9-]*$/.test(key)?key:'';};

// The item status the desktop card writes for the same choice (ui/shell/notion-world.ts showAttentionGuide):
// Done for a task, Got it (read) for an update or event, Later keeps it open until the later time, Remove dismisses.
export function phoneActionStatus(action:PhoneAction,kind:string):{status:'done'|'read'|'open'|'dismissed',later:boolean}{
 if(action==='remove')return {status:'dismissed',later:false};
 if(action==='later')return {status:'open',later:true};
 return {status:kind==='update'?'read':'done',later:false};
}

/** A notification for the paired phone (README.md in this folder, Push), sealed whole with place `push` (pairing.ts
 * PUSH_BOX_PLACE): the phone opens it and shows `title` and `body`; a tap opens `open`: the item's card, the Applet's
 * page or Fox's dialogue (the app's Now when it names none). */
export type PhonePush={v:1,id:string,at:number,kind:'attention'|'fox'|'routine'|'task',title:string,body:string,open:{item?:string,applet?:string,conversation?:true},act?:PhonePushAct};
/** What the notification's own buttons do (README.md in this folder, Push › Actions), answered from the shade with the
 * phone's ordinary sealed messages: `attention` (an item id) offers Done and Later (`attention` message), `reply` an inline
 * reply said where `open` points (`chat` with its item or Applet), `approval` (the request id) Allow once, when `once`
 * says it is offered, and Deny (`approval` message). Optional, so an older phone shows the notification as before. */
export type PhonePushAct={attention:string}|{reply:true}|{approval:string,once?:true};
/** What a module asks PhoneService.notify for; `collapse` replaces an earlier notification with the same key. */
export type PhonePushRequest=Omit<PhonePush,'v'|'id'|'at'>&{collapse?:string};
/** `box` is the relay's cap on the sealed box (worker/push.ts PUSH_LIMITS), `perCall` the Attention pushes per snapshot. */
export const PHONE_PUSH_LIMITS=Object.freeze({title:80,body:240,perCall:3,box:3000});
const PUSH_KINDS:PhonePush['kind'][]=['attention','fox','routine','task'];
const oneLine=(value:unknown,max:number)=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,max):'';
/** A push as it is sealed: known fields only, one line each, clamped; null without a kind or a title. */
export function phonePush(value:any,at=Date.now(),id:string=crypto.randomUUID()):PhonePush|null{
 const kind=value?.kind,title=oneLine(value?.title,PHONE_PUSH_LIMITS.title);
 if(!PUSH_KINDS.includes(kind)||!title)return null;
 const item=clip(value.open?.item,200),applet=appletKey(value.open?.applet);
 const open=item?{item}:applet?{applet}:value.open?.conversation===true?{conversation:true as const}:{},act=pushAct(value.act);
 return {v:1,id:clip(value.id,100)||id,at:Number.isFinite(Number(value.at))&&Number(value.at)>0?Number(value.at):at,kind,title,body:oneLine(value.body,PHONE_PUSH_LIMITS.body),open,...act?{act}:{}};
}
// One action set or none: an unknown or empty one is dropped, never guessed.
function pushAct(value:any):PhonePushAct|null{
 const attention=clip(value?.attention,200),approval=clip(value?.approval,120);
 if(attention)return {attention};
 if(value?.reply===true)return {reply:true};
 return approval?{approval,...value.once===true?{once:true as const}:{}}:null;
}
/** Attention worth a push: Now items (Coming Up and Worth Doing, never Worth Knowing) that are new in `next`, one push
 * each, at most three, the rest folded into one. An item the previous snapshot already had (in Now, or in Later without a
 * snooze) is not new; one back from its Later time is. `previous` undefined (the first snapshot after launch or pairing)
 * gives none. */
export function phoneAttentionPushes(previous:PhoneAttention|undefined,next:PhoneAttention):PhonePushRequest[]{
 if(!previous)return [];
 const known=new Set([...previous.now,...previous.later.filter(i=>!i.snoozed)].flatMap(i=>[i.id,...i.ids]));
 const fresh=next.now.filter(i=>(i.group==='event'||i.group==='needsAction')&&!known.has(i.id)&&!i.ids.some(id=>known.has(id)));
 const pushes:PhonePushRequest[]=fresh.slice(0,PHONE_PUSH_LIMITS.perCall).map(i=>({kind:'attention',title:oneLine(i.title,PHONE_PUSH_LIMITS.title)||'Worldlet',
  body:oneLine(i.context||i.action||i.when,PHONE_PUSH_LIMITS.body),open:{item:i.id},act:{attention:i.id},.../^[A-Za-z0-9_.-]{1,64}$/.test(i.id)?{collapse:i.id}:{}}));
 const rest=fresh.slice(PHONE_PUSH_LIMITS.perCall);
 if(rest.length)pushes.push({kind:'attention',title:`And ${rest.length} more`,body:oneLine(rest.map(i=>i.title).filter(Boolean).join(' · '),PHONE_PUSH_LIMITS.body),open:{},collapse:'attention-more'});
 return pushes;
}
/** Fox's finished reply to a line said on the phone: where it was asked opens again (the item's card, the Applet's page
 * or the main conversation). */
export function phoneFoxPush({name,text,item,applet}:{name:string,text:string,item?:string,applet?:string}):PhonePushRequest|null{
 const body=oneLine(text,PHONE_PUSH_LIMITS.body);
 if(!body)return null;
 return {kind:'fox',title:oneLine(name,PHONE_PUSH_LIMITS.title)||'Fox',body,open:item?{item}:applet?{applet}:{conversation:true},act:{reply:true},collapse:'fox'};
}
/** The person's own Agent asks before it acts (PhoneApproval): titled with the request and its command, collapsed per
 * request, opening Fox's dialogue with the approval card, and answered from the shade with Allow once (when offered) or
 * Deny. Always stays in the app, where the whole command shows. */
export function phoneApprovalPush(request:any):PhonePushRequest|null{
 const id=clip(request?.id,120),title=oneLine(request?.title,PHONE_PUSH_LIMITS.title);
 if(!id||!title)return null;
 const once=Array.isArray(request.choices)&&request.choices.includes('once');
 return {kind:'fox',title,body:oneLine(request.detail,PHONE_PUSH_LIMITS.body),open:{conversation:true},act:{approval:id,...once?{once:true as const}:{}},collapse:'approval-'+id.slice(0,50)};
}

// The widgets for now, newest first, as the phone shows them at the top of its Now page. Pages ride along while the
// slot stays small enough for one sealed box; a page left out is one the phone already has (same version) or, for a
// very large one, opens on the computer.
export function phoneWidgets(rows:{widget:Widget,html:string,state:WidgetState}[],at:number,budget=WIDGET_LIMITS.phoneBytes):PhoneWidgets{
 const iso=(s:number)=>new Date(s*1000).toISOString();
 const widgets:PhoneWidget[]=rows.slice(0,WIDGET_LIMITS.phoneWidgets).map(({widget,html,state})=>({id:widget.id,title:widget.title,blurb:widget.blurb,color:widget.color,
  endsAt:iso(widget.endsAt),pinned:widget.pinned,updatedAt:iso(widget.updatedAt),version:widget.version,page:widgetDocument(html),state}));
 const size=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
 const value:PhoneWidgets={v:1,at:new Date(at).toISOString(),widgets};
 // The oldest pages give way first.
 for(let i=widgets.length-1;i>=0&&size(value)>budget;i--)delete widgets[i].page;
 return value;
}
