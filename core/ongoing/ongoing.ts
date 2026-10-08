// Ongoing things (owner design 2026-10-03, mobile Applet world): a conversation brought from another Agent that is
// really one job carried on over days (an OpenClaw channel, a long Claude Code session) can become its own Applet.
// Fox proposes it as something worth doing; only the person's yes makes it one. Kept, it is listed in the Ongoing
// Applet on the computer and has its own tile in the phone's Applet world. These are the rules every host applies
// (core/ongoing/README.md).
import {MIGRATION_SOURCE_TITLES,isMigrationSource} from '../agent/index.ts';
import {ONGOING_KINDS,isOngoingKind,ongoingKind,type OngoingKindOrGeneral} from './kinds.ts';

/** The Applet whose panel shows an ongoing thing (and whose device art each one's device wears). */
export const ONGOING_APPLET='app-ongoing';
/** The World's areas, by their stable storage IDs (core/applets regions). */
const REGIONS=['home','work','library','money','health','travel'];
export const ONGOING_LIMITS=Object.freeze({
 /** What makes a brought conversation look like one job carried on: enough of the person's own messages, over
  * more than one day, recently enough to still matter. */
 userTurns:6,spanDays:2,recentDays:45,
 /** Open proposals at once, ongoing things kept per World, and how long Not now waits before asking again. */
 proposals:3,kept:24,laterDays:7,
 /** What the phone and the panel show of the conversation itself. */
 recent:4,turnText:160,
});
export type OngoingState='proposed'|'kept'|'declined';
/** One brought conversation, summarized from the World's conversation table (`companion_turns`). */
export interface BroughtConversation {source:string;session:string;turns:number;userTurns:number;first:string;last:string}
export interface OngoingThing {
 /** `job-` and a digest of the conversation, so bringing the Agent again keeps the same thing. */
 id:string;
 /** The Agent it came from (a migration source) and the conversation's session name. */
 source:string;session:string;
 /** The conversation's own name ("#diet-and-health") and where it lives ("OpenClaw · Discord"). */
 title:string;where:string;
 state:OngoingState;
 /** Seconds since 1970. */
 proposedAt:number;decidedAt:number|null;
 /** Not now: asked again after this (seconds since 1970). */
 laterUntil:number|null;
 /** The conversation when it was last read: its messages, the person's own and its first and last times. */
 turns:number;userTurns:number;first:string;last:string;
 /** The area of the World its device stands in, picked when it is kept (ongoingRegion); the person can move it. */
 region?:string;
 /** Set on things kept since the World's areas were regrouped (2026-10-08): `library` is Social and `travel` is
  * Entertainment. An earlier kept thing's `library` meant Create (now Work) and its `travel` a trip (now Life). */
 regrouped?:true;
 /** What it is about (core/ongoing/kinds.ts): fitness, food, study, money, travel, a project, or general. Told
  * from its name and the person's own messages when it is proposed. */
 kind?:OngoingKindOrGeneral;
}

const DAY=86_400;
const clip=(value:unknown,count:number)=>[...(typeof value==='string'?value.replace(/\s+/g,' ').trim():'')].slice(0,count).join('');
const seconds=(iso:string)=>{const t=Date.parse(iso);return Number.isFinite(t)?t/1000:NaN;};

/** A short digest (two FNV-1a passes) that names a conversation without carrying its text. */
export function digest(value:string):string {
 let a=0x811c9dc5,b=0x01000193^value.length;
 for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);a=Math.imul(a^c,0x01000193)>>>0;b=Math.imul(b^c,0x5bd1e995)>>>0;}
 return (a.toString(36)+b.toString(36)).padStart(12,'0').slice(0,12);
}
export const ongoingId=(source:string,session:string)=>'job-'+digest(source+'\u0000'+session);
export const validOngoingId=(value:unknown):value is string=>typeof value==='string'&&/^job-[a-z0-9]{12}$/.test(value);

/** The session name without its Agent: the last part is the conversation's name, the rest says where it lives.
 * "OpenClaw · Discord · #diet-and-health" is "#diet-and-health" in "OpenClaw · Discord". */
export function ongoingName(source:string,session:string):{title:string;where:string} {
 const agent=isMigrationSource(source)?MIGRATION_SOURCE_TITLES[source]:clip(source,40);
 const parts=clip(session,160).split(' · ').map(part=>part.trim()).filter(Boolean);
 if(parts[0]===agent)parts.shift();
 const title=clip(parts.pop()||session,60)||'Conversation';
 return {title,where:[agent,...parts].filter(Boolean).join(' · ')};
}

/** Whether a brought conversation looks like one job carried on (ONGOING_LIMITS). */
export function ongoingLooksLikeJob(c:BroughtConversation,now:number):boolean {
 const first=seconds(c.first),last=seconds(c.last);
 if(!isMigrationSource(c.source)||!Number.isFinite(first)||!Number.isFinite(last))return false;
 return c.userTurns>=ONGOING_LIMITS.userTurns&&last-first>=ONGOING_LIMITS.spanDays*DAY&&now-last<=ONGOING_LIMITS.recentDays*DAY;
}

/** The record for a newly proposed thing. `text` is the person's own messages in it, one per line, to tell its kind. */
export function ongoingProposal(c:BroughtConversation,now:number,text=''):OngoingThing {
 const name=ongoingName(c.source,c.session);
 return {id:ongoingId(c.source,c.session),source:c.source,session:c.session,...name,state:'proposed',
  proposedAt:Math.round(now),decidedAt:null,laterUntil:null,turns:c.turns,userTurns:c.userTurns,first:c.first,last:c.last,
  kind:ongoingKind({source:c.source,...name},text)};
}
/** Its kind: the one told when it was proposed, else from its name alone (a record kept before kinds). */
export const ongoingKindOf=(thing:Pick<OngoingThing,'source'|'title'|'where'|'kind'>):OngoingKindOrGeneral=>thing.kind??ongoingKind(thing);

/** A stored record, or null when it is not one. */
export function readOngoing(value:unknown):OngoingThing|null {
 const v=value as Partial<OngoingThing>|null;
 if(!v||typeof v!=='object'||!validOngoingId(v.id)||typeof v.source!=='string'||typeof v.session!=='string')return null;
 if(!['proposed','kept','declined'].includes(v.state as string))return null;
 const number=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)?x:null;
 return {id:v.id,source:v.source,session:v.session,...ongoingName(v.source,v.session),state:v.state as OngoingState,
  proposedAt:number(v.proposedAt)??0,decidedAt:number(v.decidedAt),laterUntil:number(v.laterUntil),
  turns:number(v.turns)??0,userTurns:number(v.userTurns)??0,first:typeof v.first==='string'?v.first:'',last:typeof v.last==='string'?v.last:'',
  ...REGIONS.includes(v.region as string)?{region:v.regrouped===true?v.region:({library:'work',travel:'money'} as Record<string,string>)[v.region as string]??v.region,regrouped:true as const}:{},
  ...isOngoingKind(v.kind)?{kind:v.kind}:{}};
}

/** A proposal waiting for the person now (not put off with Not now). */
export const ongoingOpen=(thing:OngoingThing,now:number)=>thing.state==='proposed'&&!(thing.laterUntil!=null&&thing.laterUntil>now);

/** What changes when the brought conversations are read again: kept things follow their conversation, things
 * whose conversation is gone are forgotten (unless declined, so they are never asked again), and while fewer than
 * ONGOING_LIMITS.proposals wait, the busiest recent conversations that look like a job and have a kind are proposed. A thing is
 * proposed once: Not now asks again later, Don't ask never does. */
export function ongoingRefresh(things:OngoingThing[],conversations:BroughtConversation[],now:number,textOf?:(c:BroughtConversation)=>string):{save:OngoingThing[];forget:string[]} {
 const byId=new Map(conversations.map(c=>[ongoingId(c.source,c.session),c]));
 const save:OngoingThing[]=[],forget:string[]=[];
 for(const thing of things){
  const c=byId.get(thing.id);
  if(!c){if(thing.state!=='declined')forget.push(thing.id);continue;}
  // A thing proposed before kinds learns its kind from its messages once.
  const kind=thing.kind===undefined&&textOf?{kind:ongoingKind(thing,textOf(c))}:{};
  if(c.turns!==thing.turns||c.last!==thing.last||c.userTurns!==thing.userTurns||c.first!==thing.first||kind.kind)save.push({...thing,turns:c.turns,userTurns:c.userTurns,first:c.first,last:c.last,...kind});
 }
 const known=new Set(things.map(t=>t.id));
 // Only a conversation with a subject is offered (core/ongoing/themes.ts), so one of no kind neither waits nor is proposed.
 const waiting=things.filter(t=>t.state==='proposed'&&!forget.includes(t.id)&&ongoingKindOf(t)!=='general').length;
 const room=Math.max(0,ONGOING_LIMITS.proposals-waiting);
 if(room&&things.filter(t=>t.state==='kept').length<ONGOING_LIMITS.kept){
  const fresh=conversations.filter(c=>!known.has(ongoingId(c.source,c.session))&&ongoingLooksLikeJob(c,now))
   .sort((a,b)=>ongoingScore(b,now)-ongoingScore(a,now)||a.session.localeCompare(b.session));
  save.push(...fresh.map(c=>ongoingProposal(c,now,textOf?.(c)??'')).filter(t=>t.kind!=='general').slice(0,room));
 }
 return {save,forget};
}
/** Busier and more recent first: the person's messages, worth less the longer the conversation has been quiet. */
const ongoingScore=(c:BroughtConversation,now:number)=>c.userTurns/(1+Math.max(0,now-seconds(c.last))/(7*DAY));

export type OngoingDecision='keep'|'later'|'decline';
/** The person's answer to a proposal (or Remove on a kept thing, which is a decline: it is not proposed again). */
export function ongoingDecide(thing:OngoingThing,decision:OngoingDecision,now:number):OngoingThing {
 const at=Math.round(now);
 if(decision==='keep')return {...thing,state:'kept',decidedAt:at,laterUntil:null,region:thing.region??ongoingRegion(thing),regrouped:true};
 if(decision==='later')return {...thing,state:'proposed',laterUntil:at+ONGOING_LIMITS.laterDays*DAY};
 return {...thing,state:'declined',decidedAt:at,laterUntil:null};
}

/** How long ago, said the short way ("today", "3 days ago", "5 weeks ago"). */
export function ongoingAgo(iso:string,now:number):string {
 const days=Math.floor((now-seconds(iso))/DAY);
 if(!Number.isFinite(days))return '';
 if(days<1)return 'today';if(days<2)return 'yesterday';if(days<14)return days+' days ago';
 return Math.floor(days/7)+' weeks ago';
}
/** One line about the conversation: "OpenClaw · Discord · 42 messages · last yesterday", led by its kind when it
 * has one ("Fitness · OpenClaw · Discord · …"). */
export function ongoingLine(thing:OngoingThing,now:number):string {
 const ago=ongoingAgo(thing.last,now),kind=ongoingKindOf(thing);
 return [kind==='general'?'':ONGOING_KINDS[kind].title,thing.where,thing.turns+(thing.turns===1?' message':' messages'),ago?'last '+ago:''].filter(Boolean).join(' · ');
}
/** What the person actually wrote in a brought turn. A chat gateway (Hermes on Slack and the like) stores each message with
 * what it told its Agent around it: a `[Replying to: "…"]` pointer and a `[Thread context — …]` block of the thread's
 * earlier messages. Those are the Agent's context, not the person's words, so pages show the message without them
 * (Order 2026-10-07: a kept Slack thread opened on that block instead of its to-dos). */
export function ongoingTurnText(text:string):string {
 let rest=String(text??'').replace(/\r\n?/g,'\n');
 for(;;){
  const trimmed=rest.trimStart();
  const reply=/^\[Replying to(?: your previous message)?: "[\s\S]*?"\]\n\n/.exec(trimmed);
  if(reply){rest=trimmed.slice(reply[0].length);continue;}
  if(trimmed.startsWith('[Thread context — ')){const end=trimmed.indexOf('[End of thread context]');if(end>=0){rest=trimmed.slice(end+'[End of thread context]'.length);continue;}}
  return trimmed.trim();
 }
}
/** The conversation's latest turns as short lines ("You: …", "OpenClaw: …"), oldest first. */
export function ongoingRecent(thing:Pick<OngoingThing,'source'>,turns:{role:string;text:string}[]):string[] {
 const agent=isMigrationSource(thing.source)?MIGRATION_SOURCE_TITLES[thing.source]:'Agent';
 return turns.slice(-ONGOING_LIMITS.recent).map(t=>(t.role==='user'?'You':agent)+': '+clip(t.text,ONGOING_LIMITS.turnText)).filter(line=>!line.endsWith(': '));
}
/** Kept first, newest decision first; then open proposals, newest first. */
export function orderOngoing(things:OngoingThing[]):OngoingThing[] {
 return [...things].sort((a,b)=>(a.state==='kept'?0:1)-(b.state==='kept'?0:1)||(b.decidedAt??b.proposedAt)-(a.decidedAt??a.proposedAt)||a.id.localeCompare(b.id));
}

// Where its device stands: the area its words point to (a trip, food, health, family or money in Life, a game in Games,
// music, video and shows in Entertainment, friends and communities in Social, writing, design, code and work in Work);
// a coding Agent's conversation is work; anything else is at Home. The person can move it like any device.
const AREA_WORDS:[string,RegExp][]=[
 ['money',/\b(trips?|travel\w*|flights?|hotels?|vacations?|holidays?|itinerar\w*)\b|旅行|出差|机票|酒店/i],
 ['health',/\b(games?|gaming)\b|游戏/i],
 ['travel',/\b(music|songs?|playlists?|videos?|movies?|films?|shows?|series|anime|podcasts?|streams?|streaming)\b|音乐|视频|电影|追剧|动漫|直播/i],
 ['library',/\b(friends?|community|communities|social|group chats?|followers?)\b|朋友|社区|社群|群聊|社交/i],
 ['work',/\b(writ\w*|blog\w*|essays?|books?|novels?|stor(y|ies)|design\w*|draw\w*|art|research)\b|写作|设计|画/i],
 ['money',/\b(diet|health\w*|fitness|runs?|running|gym|workouts?|food|meals?|recipes?|cook\w*|family|kids|parents|money|budget\w*|financ\w*|tax(es)?|shopping|groceries|home|house)\b|饮食|健康|健身|跑步|家庭|孩子|理财|记账|购物/i],
 ['work',/\b(code|coding|bugs?|fix\w*|deploy\w*|repos?|PRs?|releases?|work|team|projects?|meetings?|clients?|launch\w*|product)\b|工作|项目|会议|代码|发布/i],
];
export function ongoingRegion(thing:Pick<OngoingThing,'source'|'title'|'where'|'kind'>):string {
 const kind=ongoingKindOf(thing);
 if(kind!=='general')return ONGOING_KINDS[kind].region;
 const words=thing.title+' '+thing.where.split(' · ').slice(1).join(' ');
 for(const [region,pattern] of AREA_WORDS)if(pattern.test(words))return region;
 return ['claude-code','codex','pi'].includes(thing.source)?'work':'home';
}

/** A kept thing as an Applet of its own: a device in its area wearing the Ongoing device's art, whose panel shows
 * that conversation. Its key is the thing's ID (`job-…`), the same key the phone's tile uses. */
export function ongoingApplet(thing:OngoingThing){
 const kind=ongoingKindOf(thing),spec=kind==='general'?null:ONGOING_KINDS[kind],color=spec?.color??'#4f7a6a';
 return {id:'app-'+thing.id,key:thing.id,title:thing.title,region:thing.region??ongoingRegion(thing),version:1,
  description:spec?`Your ${thing.where} conversation as a ${spec.title} Applet: ${spec.heading.toLowerCase()} there, and its latest messages; ask Fox to pick it up.`
   :`Your ${thing.where} conversation, kept as your own Applet. Its latest messages are here; talk to Fox about it to pick it up.`,
  purpose:spec?.purpose??'Pick up where you left off',
  fullView:{kind:'panel'},scene:{template:'device',color,renderer:'painted-device',version:1},
  connection:{kind:'none',provider:null,capability:'local'},content:{activity:spec?.title??'Following'},installByDefault:false,
  /** The built-in art and panel it borrows, and the thing it shows. */
  art:'ongoing',panel:'ongoing',ongoing:thing.id,mine:'conversation',
  /** When it was kept (ms): it comes into the World as if just used (ui/world/region-layout.ts lastUse). */
  arrivedAt:(thing.decidedAt??thing.proposedAt)*1000,
  shape:'device',color,provider:null,capability:'local'};
}
