/** Fox's sessions (owner request 2026-10-12): every conversation brought from the person's other Agents is a session of
 * its own beside Fox's main one. Pointing at Fox shows them in a column left of the conversation, the main session first
 * and stressed, then the others, latest first, like the phone's list of Things. A session that is a Thing (a kept
 * ongoing conversation, its own Applet) opens its Applet; any other one becomes the place Fox talks in, right in the
 * World, until the person goes back to the main session. Pure rules; ui/companion/fox-sessions.ts draws them. */
import {ongoingAgo,type OngoingThing} from './ongoing.ts';

/** The place key of a session that is not a Thing: Fox's conversation is shown and kept per place, and the person's
 * Agent keeps one session per such place (core/agent/harness-sessions.ts `session:`). */
export const FOX_SESSION_PLACE='session:';
/** At most this many sessions besides the main one: the column never scrolls far. */
export const FOX_SESSION_LIMIT=12;

export type FoxSession={id:string;title:string;where:string;source:string;session:string;thing:boolean;last:string};

const seconds=(iso:string)=>{const t=Date.parse(iso);return Number.isFinite(t)?t/1000:0;};

/** Kept things (Things) and the other brought conversations, latest first, each once. */
export function foxSessions(kept:readonly OngoingThing[],others:readonly OngoingThing[]):FoxSession[] {
 const seen=new Set<string>(),out:FoxSession[]=[];
 for(const [list,thing] of [[kept,true],[others,false]] as const)for(const t of list){
  if(!t||typeof t.id!=='string'||seen.has(t.id))continue;seen.add(t.id);
  out.push({id:t.id,title:String(t.named||t.title||t.session||'').slice(0,120),where:String(t.where||'').slice(0,120),source:String(t.source||''),session:String(t.session||''),thing,last:String(t.last||'')});
 }
 return out.sort((a,b)=>seconds(b.last)-seconds(a.last)||a.title.localeCompare(b.title)).slice(0,FOX_SESSION_LIMIT);
}
/** The row's second line: where it lives and when it was last written to ("OpenClaw · Discord · yesterday"). */
export const foxSessionLine=(s:FoxSession,now:number)=>[s.where,ongoingAgo(s.last,now)].filter(Boolean).join(' · ');
/** A session's place key, and back. */
export const foxSessionPlace=(id:string)=>FOX_SESSION_PLACE+id;
export const foxSessionOf=(place:unknown)=>{const key=String(place??'');return key.startsWith(FOX_SESSION_PLACE)&&key.length>FOX_SESSION_PLACE.length?key.slice(FOX_SESSION_PLACE.length):'';};
/** What Fox is told about the place each turn: which past conversation this is, so it reads it before answering and
 * carries on from where it stood. */
export const foxSessionDetail=(s:Pick<FoxSession,'title'|'where'|'session'>)=>
 `The person switched to a past conversation of theirs: “${s.title}” (${s.where}). Read it with read_companion_archive (conversation “${s.session}”) and carry on from where it stood, as that conversation's own continuation.`;
/** Brought turns as the cards of a place: each thing the person said with the Agent's answer after it, oldest first. */
export function foxSessionCards(turns:readonly {role?:string;text?:string;createdAt?:string|number}[],key:string){
 const cards:{id:string;key:string;view:string;location:string;user:string;text:string;steps:string[];status:'done';at:number}[]=[];
 const at=(value:unknown)=>{const n=typeof value==='number'?value:Date.parse(String(value??''));return Number.isFinite(n)?n:0;};
 for(const turn of turns){
  const text=String(turn?.text??'').trim().slice(0,4000);if(!text)continue;
  const last=cards.at(-1);
  if(turn.role==='user'||!last||last.text)cards.push({id:'origin:'+key+':'+cards.length,key,view:'',location:'',user:turn.role==='user'?text:'',text:turn.role==='user'?'':text,steps:[],status:'done',at:at(turn.createdAt)});
  else last.text=text;
 }
 return cards;
}
