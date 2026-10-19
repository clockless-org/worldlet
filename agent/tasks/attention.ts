// Brought conversations as Attention context (owner request 2026-10-06: "我们现在不要求用户上来就连邮箱了 … 从对话里面
// 提出来 attention center 的内容"). Someone who brings their own Agent and connects no mail still has work in progress
// in its conversations: things they promised and have not done, replies they are waiting on, dates they planned,
// topics they keep raising. Each recently active conversation becomes one observation of the `conversations`
// provider; the Attention Center's ordinary synthesis reads it, and an item it finds quotes the conversation and
// opens back to it (agent/tasks/README.md#attention). These are the rules every host applies.
import {MIGRATION_SOURCE_TITLES,isMigrationSource} from '../../contracts/agent.ts';
import {conversationNamed,digest,ongoingBusier,ongoingName,type BroughtConversation} from './ongoing.ts';

export const CONVERSATION_ATTENTION=Object.freeze({
 /** The Attention provider brought conversations stand in for (context/applets/definitions/ongoing.ts). */
 provider:'conversations',
 /** Conversations active in the past three weeks are read, the most recently active 40 (the Center keeps at most
  * 80 facts a provider and takes 50 at a time). */
 recentDays:21,conversations:40,
 /** Of each, its latest turns: at most 80, each cut to 1,500 characters, together within the Center's 12,000. */
 turns:80,turnCharacters:1500,characters:12000,
 /** What the panel shows when an item opens its conversation. */
 originalTurns:40,
});
const DAY=86_400;
const seconds=(iso:string)=>{const t=Date.parse(iso);return Number.isFinite(t)?t/1000:NaN;};
const chars=(text:string)=>[...text];

/** The observation's ID: `conv-` and a digest of the Agent and conversation, never its name. */
export const conversationAttentionId=(source:string,session:string)=>'conv-'+digest(source+'\u0000'+session);
export const validConversationAttentionId=(value:unknown):value is string=>typeof value==='string'&&/^conv-[a-z0-9]{12}$/.test(value);

/** The conversations the Center reads now: brought from a known Agent, active in the past CONVERSATION_ATTENTION
 * recentDays, most recently active first, at most CONVERSATION_ATTENTION.conversations. */
export function conversationsForAttention(conversations:BroughtConversation[],now:number):BroughtConversation[] {
 return conversations.filter(c=>{const last=seconds(c.last);return isMigrationSource(c.source)&&c.userTurns>0&&Number.isFinite(last)&&now-last<=CONVERSATION_ATTENTION.recentDays*DAY;})
  .sort((a,b)=>seconds(b.last)-seconds(a.last)||a.session.localeCompare(b.session))
  .slice(0,CONVERSATION_ATTENTION.conversations);
}

const stamp=(iso:string)=>{const t=Date.parse(iso);return Number.isFinite(t)?new Date(t).toISOString().slice(0,16).replace('T',' ')+' UTC':'';};
/** One turn as a line: "[2026-10-05 21:02 UTC] You: …" (the person) or "… OpenClaw: …" (their Agent). */
function line(source:string,turn:{role:string;text:string;createdAt:string}):string {
 const agent=isMigrationSource(source)?MIGRATION_SOURCE_TITLES[source]:'Agent';
 const text=turn.text.replace(/\r\n?/g,'\n').trim(),cut=chars(text);
 const body=cut.length>CONVERSATION_ATTENTION.turnCharacters?cut.slice(0,CONVERSATION_ATTENTION.turnCharacters-2).join('')+' …':text;
 const when=stamp(turn.createdAt);
 return (when?'['+when+'] ':'')+(turn.role==='user'?'You':agent)+': '+body;
}
/** What the Center reads of one conversation: a header naming it, then its latest turns, oldest first, as many as
 * fit. The text depends only on the turns, so reading it again unchanged renews it without a new model pass. */
export function conversationObservation(c:Pick<BroughtConversation,'source'|'session'>,turns:{role:string;text:string;createdAt:string}[]):{id:string;title:string;text:string}|null {
 const name=ongoingName(c.source,c.session);
 const header=`Conversation “${name.title}”${name.where?' in '+name.where:''}, brought from the person’s own Agent. Its latest messages, oldest first; “You” is the person.\n\n`;
 let room=CONVERSATION_ATTENTION.characters-chars(header).length;
 const lines:string[]=[];
 for(const turn of turns.slice(-CONVERSATION_ATTENTION.turns).reverse()){
  if(typeof turn?.text!=='string'||!turn.text.trim())continue;
  const text=line(c.source,turn),size=chars(text).length+2;
  if(size>room)break;
  lines.unshift(text);room-=size;
 }
 if(!lines.length)return null;
 return {id:conversationAttentionId(c.source,c.session),title:name.title,text:header+lines.join('\n\n')};
}
/** The conversation an item opens back to, newest turns last. */
export function conversationOriginal(c:Pick<BroughtConversation,'source'|'session'>,turns:{role:string;text:string;createdAt:string}[]):{title:string;text:string} {
 const name=ongoingName(c.source,c.session);
 const lines=turns.slice(-CONVERSATION_ATTENTION.originalTurns).filter(t=>typeof t?.text==='string'&&t.text.trim()).map(t=>line(c.source,t));
 return {title:name.title,text:(name.where?name.where+'. ':'')+'Its latest messages, oldest first.\n\n'+lines.join('\n\n')};
}

/** What the person's own Agent picked out for the Attention Center when setup asked it to describe itself
 * (agent/gate/agent-profile.ts `attention`; owner request 2026-10-12, Kelvin: "onboard了以后 Attention Center里面要有东西").
 * Its answer comes before any synthesis pass has run on its conversations, so the Center is not empty when the World
 * opens. Each entry becomes a Center item of the `conversations` provider that cites the conversation it names (the
 * busiest brought one whose name matches) and opens back to it; one whose conversation is not here yet waits for it.
 * `key` names an entry for good, so one the person already saw is never made again. */
export interface AgentAttentionEntry {group:'coming'|'doing'|'knowing';title:string;why:string;summary?:string;when?:string;thread:string}
export function attentionFromAgent(said:readonly AgentAttentionEntry[],conversations:BroughtConversation[],now:number,agent:string):{key:string;item:Record<string,unknown>}[] {
 const out:{key:string;item:Record<string,unknown>}[]=[];
 for(const entry of said){
  const found=conversations.filter(c=>isMigrationSource(c.source)&&conversationNamed(ongoingName(c.source,c.session).title,entry.thread)).sort((a,b)=>ongoingBusier(a,b,now))[0];
  if(!found)continue;
  const kind=entry.group==='coming'?'event':entry.group==='doing'?'task':'update';
  // A coming thing needs its day, from yesterday to a month ahead; a date alone is all day.
  let dates:Record<string,unknown>={};
  if(kind==='event'){
   const allDay=/^\d{4}-\d{2}-\d{2}$/.test(entry.when??''),at=Date.parse(allDay?entry.when+'T23:59:59Z':entry.when??'')/1000;
   if(!Number.isFinite(at)||at<now-DAY||at>now+31*DAY)continue;
   dates={start:entry.when,...allDay?{allDay:true}:{},eventDisposition:'confirmed'};
  }
  const name=ongoingName(found.source,found.session).title;
  out.push({key:digest(agent+'\u0000'+entry.group+'\u0000'+entry.title.toLowerCase()),item:{kind,provider:CONVERSATION_ATTENTION.provider,title:entry.title,reason:entry.why,summary:entry.summary||entry.why,
   ...(kind==='task'?{attentionReason:entry.why}:{}),...dates,
   // The conversation's own name is in what the Center reads of it (conversationObservation), so it is the quote.
   sources:[{provider:CONVERSATION_ATTENTION.provider,id:conversationAttentionId(found.source,found.session),quote:name}]}});
 }
 return out;
}
