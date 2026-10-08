import {characters} from './companion-text.ts';
/** Spatial context switching (owner decision 2026-10-04): Fox has one conversation that remembers
 * everything, and every turn is said in a place (the World, an Applet, one email, one website). Each
 * turn the model gets, beside the whole conversation, the turns said in this place, a note when the
 * person just came from somewhere else, and what they did lately in the built-in browser. Pure. */

export const PLACE={turns:8,turnCharacters:1200,visits:8,pageCharacters:3000} as const;
const clip=(text:unknown,count:number)=>characters(String(text??'')).slice(0,count).join('');

/** The place a thread key names: the chat's context key (`["web:example.com",""]` → "web:example.com"). */
export function placeKey(thread:string):string {
 try{const value=JSON.parse(thread);if(Array.isArray(value))return [value[0],value[1]].filter(part=>typeof part==='string'&&part).join(' · ').slice(0,200);}catch{}
 return String(thread??'').slice(0,200);
}

/** What rides with a turn about its place. `turns` are this place's earlier turns, oldest first;
 * `previous` is where the conversation's last turn was said. */
export function placeContext({thread,turns,previous}:{thread:string;turns:{role:string;text:string;createdAt?:string}[];previous:string}){
 if(!thread)return null;
 const here=placeKey(thread);
 const earlier=(Array.isArray(turns)?turns:[]).slice(-PLACE.turns).filter(turn=>turn&&['user','assistant'].includes(turn.role)&&typeof turn.text==='string')
  .map(turn=>({role:turn.role,text:clip(turn.text,PLACE.turnCharacters),...typeof turn.createdAt==='string'?{at:turn.createdAt.slice(0,19)}:{}}));
 const moved=!!previous&&previous!==thread;
 return {place:here,earlierHere:earlier,
  ...moved?{cameFrom:placeKey(previous),note:'The person just moved here from another place. Answer about this place; the conversation\'s latest turns before this one were about that other place and only apply if the person refers to them.'}:{}};
}

/** The newest visits in the built-in browser, one short line each, newest first. `open` is the id of
 * the visit on screen right now, if any: that one says `onScreen`, so Fox never mistakes a past visit
 * on the same site for the page in front of the person, or the open page for a finished one. */
export function recentBrowsing(visits:{id?:string;site:string;title:string;startedAt:number;endedAt:number}[],now:number,open=''){
 return (Array.isArray(visits)?visits:[]).slice(0,PLACE.visits).map(visit=>({
  site:clip(visit.site,120),title:clip(visit.title,120),
  ...open&&visit.id===open?{onScreen:true}:{minutesAgo:Math.max(0,Math.round((now-visit.endedAt)/60))},
  minutes:Math.max(0,Math.round((visit.endedAt-visit.startedAt)/60))
 }));
}

/** What the page on screen says, from its recording (core/browser/web-record.ts): the newest whole-page
 * text and what was added to the page after it, oldest first. A long page keeps its start (what the page
 * is) and its newest part (what just appeared, such as an opened post), at most PLACE.pageCharacters. */
export function onScreenText(records:{kind:string;body:string}[],limit:number=PLACE.pageCharacters):string {
 const list=Array.isArray(records)?records:[];
 let start=-1;
 for(let i=list.length-1;i>=0;i--)if(list[i]?.kind==='text'){start=i;break;}
 const text=list.slice(Math.max(0,start)).filter(r=>r&&(r.kind==='text'||r.kind==='text-more')&&typeof r.body==='string')
  .map(r=>r.body.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
 const all=characters(text);
 if(all.length<=limit)return text;
 const head=Math.floor(limit/3);
 return all.slice(0,head).join('').trimEnd()+' … '+all.slice(all.length-(limit-head-3)).join('').trimStart();
}
