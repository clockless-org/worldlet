import {characters} from './companion-text.ts';

/** Fox speaks first (owner request 2026-10-06: "更主动更 helpful", modelled on Poke). At a natural pause
 * Worldlet asks Fox whether one line is worth saying now; most of the time the answer is no and
 * nothing shows. These pure rules decide when to ask and read the answer; the host runs the turn
 * (read only, like the proactive game review) and the Fox bar shows the line. The person's own
 * model pays for every ask, so the limits below also cap the cost. */
export const PROACTIVE={
 /** Between two lines Fox says first; doubles for each line in a row the person let pass (at most ×8). */
 minGapSeconds:10*60,
 /** Lines Fox says first per local day, and per place per day. */
 perDay:12,perPlace:3,
 /** A reply within this long after Fox spoke counts as an answer. */
 answeredSeconds:10*60,
 /** "Be quiet" holds this long. */
 quietSeconds:12*3600,
 /** How long the person stays in a place before Fox may speak there: the World, then an Applet or page. */
 settleSeconds:{world:60,applet:120},
 /** A stay this long in one place is a moment of its own (a break, or how it is going). */
 longStaySeconds:45*60,
 /** Local hours that count as late at night. */
 lateFrom:23,lateUntil:5,
 /** The longest line shown. */
 lineCharacters:240,
 /** Browse with me (owner request 2026-10-08: 「做 Applet 的时候小狐狸在旁边时不时地说话，给一些 context，提供一些帮助」):
  * once the person has looked at an Applet or page this long, Fox may say one line about it. At most `perVisit` asks
  * per visit (the next one `againSeconds` after the first, for when Fox passed or the screen changed), these
  * lines at least `gapSeconds` apart (doubling like the others when let pass) and `perDay` a day, counted apart
  * from the other moments so browsing never uses up the day's other lines. Owner 2026-10-10 「让它提供的更勤一点」:
  * 88 asks in 4 days ended in 2 lines, so a look is shorter, asks come twice per visit and the bar is lower. */
 browse:{settleSeconds:20,againSeconds:3*60,gapSeconds:2*60,perDay:30,perVisit:2}
} as const;

/** Why Worldlet asks: the person settled into a place, has stayed in it a long time, is up late, or is
 * looking at an Applet or page with Browse with me on. */
export type ProactiveMoment='settled'|'long-stay'|'late'|'browsing';
export const PROACTIVE_MOMENTS:readonly ProactiveMoment[]=['settled','long-stay','late','browsing'];

export interface ProactiveState {
 day:string;spoken:number;places:Record<string,number>;moments:string[];
 lastAt:number;ignored:number;quietUntil:number;
 /** Browse with me: on unless the person chose Don't bother in Fox's card (kept by the host). Off, Fox never speaks first. */
 browse:boolean;
 /** Browse lines today, when the last browse ask ran, and the visit it was for (one line per visit). */
 browsed:number;browseAt:number;browseVisit:string;browseVisitAsks:number;
 /** The line said last, until the person answers it or lets it pass. */
 pending:{at:number;place:string}|null;
 /** Recent lines, newest last, so Fox never says the same thing twice. */
 recent:string[];
}
export const proactiveState=():ProactiveState=>({day:'',spoken:0,places:{},moments:[],lastAt:0,ignored:0,quietUntil:0,browse:true,browsed:0,browseAt:0,browseVisit:'',browseVisitAsks:0,pending:null,recent:[]});

function settle(state:ProactiveState,now:number,day:string){
 if(state.day!==day){state.day=day;state.spoken=0;state.places={};state.moments=[];state.browsed=0;}
 // A line nobody answered in time was let pass: Fox waits longer before the next one.
 if(state.pending&&now-state.pending.at>PROACTIVE.answeredSeconds){state.ignored=Math.min(state.ignored+1,3);state.pending=null;}
}

/** Whether Fox may be asked now. `place` is the place key (here.place); `day` the local day (YYYY-MM-DD);
 * `visit` names one stay in an Applet or page for the browsing moment. */
export function proactiveDue(state:ProactiveState,{now,day,moment,place,visit=''}:{now:number;day:string;moment:ProactiveMoment;place:string;visit?:string}):{due:true}|{due:false;reason:string} {
 settle(state,now,day);
 if(!PROACTIVE_MOMENTS.includes(moment)||!place)return {due:false,reason:'unknown'};
 if(!state.browse)return {due:false,reason:'off'};
 if(now<state.quietUntil)return {due:false,reason:'quiet'};
 if(moment==='browsing'){
  if(!visit||visit===state.browseVisit&&state.browseVisitAsks>=PROACTIVE.browse.perVisit)return {due:false,reason:'visit'};
  if(state.browsed>=PROACTIVE.browse.perDay)return {due:false,reason:'day'};
  if(state.pending)return {due:false,reason:'waiting'};
  if(now-Math.max(state.browseAt,state.lastAt)<PROACTIVE.browse.gapSeconds*2**state.ignored)return {due:false,reason:'gap'};
  return {due:true};
 }
 if(state.spoken>=PROACTIVE.perDay)return {due:false,reason:'day'};
 if((state.places[place]??0)>=PROACTIVE.perPlace)return {due:false,reason:'place'};
 if(moment==='late'&&state.moments.includes('late'))return {due:false,reason:'once'};
 if(state.pending)return {due:false,reason:'waiting'};
 if(now-state.lastAt<PROACTIVE.minGapSeconds*2**state.ignored)return {due:false,reason:'gap'};
 return {due:true};
}

/** Worldlet asked Fox: the ask counts toward the gap even when Fox chose to stay quiet, so a quiet
 * moment is not asked again at once. */
export function proactiveAsked(state:ProactiveState,{now,day,moment,visit=''}:{now:number;day:string;moment:ProactiveMoment;visit?:string}){
 settle(state,now,day);
 // A browse ask keeps its own clock, so looking around never pushes back the other moments.
 if(moment==='browsing'){state.browseVisitAsks=visit===state.browseVisit?state.browseVisitAsks+1:1;state.browseAt=now;state.browseVisit=visit;return;}
 state.lastAt=now;
 if(moment==='late'&&!state.moments.includes('late'))state.moments.push('late');
}

/** Fox's line was shown in `place`. */
export function proactiveSpoke(state:ProactiveState,{now,day,place,line,moment}:{now:number;day:string;place:string;line:string;moment?:ProactiveMoment}){
 settle(state,now,day);
 if(moment==='browsing'){state.browsed++;state.browseAt=now;}
 else{state.spoken++;state.places[place]=(state.places[place]??0)+1;state.lastAt=now;}
 state.pending={at:now,place};
 state.recent=[...state.recent,line].slice(-6);
}

/** The person wrote to Fox. Answering the last line resets the wait; asking Fox to be quiet holds
 * every line for a while. Returns true when this was a request for quiet. */
export function proactiveHeard(state:ProactiveState,{now,text}:{now:number;text:string}):boolean {
 if(state.pending&&now-state.pending.at<=PROACTIVE.answeredSeconds){state.ignored=0;state.pending=null;}
 if(!proactiveQuietRequest(text))return false;
 state.quietUntil=now+PROACTIVE.quietSeconds;state.pending=null;
 return true;
}

/** Short requests to stop speaking first, in Chinese or English. A longer message is a conversation, not a mute. */
export function proactiveQuietRequest(text:string):boolean {
 const value=String(text??'').trim().toLowerCase().replace(/[\s,，.。!！~～]+/g,' ').trim();
 if(!value||characters(value).length>24)return false;
 return /^(fox ?|小狐狸 ?)?(你)?(先)?(别|不要|不用)(再)?(说话|打扰我?|吵|插嘴|主动说话?)(了|啦|吧)?$/.test(value.replace(/ /g,''))
  ||/^(fox ?|小狐狸 ?)?(安静|闭嘴|少说)(点|一点|一下|些|两句)?(吧|啦)?$/.test(value.replace(/ /g,''))
  ||/^(please )?(shut up|be quiet|quiet|stop talking|stop interrupting|leave me alone)( please)?$/.test(value);
}

/** The local hour counts as late at night. */
export const proactiveLate=(hour:number)=>hour>=PROACTIVE.lateFrom||hour<PROACTIVE.lateUntil;

/** What Worldlet asks Fox. Nobody spoke, so it is a task with the person's latest words for their
 * language, the lines Fox already said and the moment; Fox answers PASS unless one line is worth it. */
export function proactiveTask({moment,place,local,minutes,recent,lastWords}:{moment:ProactiveMoment;place:string;local:string;minutes:number;recent:string[];lastWords:string}):string {
 const why=moment==='late'?`It is late (${local}) and the person is still here.`:moment==='long-stay'?`The person has been in ${place} for about ${minutes} minutes.`:moment==='browsing'?`The person is looking at ${place}, and asked you to browse along with them.`:`The person has settled into ${place} and paused.`;
 return [
  '(Not the person\'s words: Worldlet is asking at a quiet moment whether you have one thing worth saying first.)',
  `${why} It is ${local}.`,
  'Look at where they are and what is in front of them (location, state and view are the place and what it shows; here, browsing, history; on a website, page.text is what the page on screen says right now) and what you know about their day (query_world_items for what is coming up or due). Do not try to open, snapshot or read the page with a tool: page.text is all of it this ask gets.',
  'Speak only for one of three reasons: useful (something they will need soon: a clash, a deadline, the thing they were just looking for), insight (a concrete, opinionated take on what they are doing right now: a move, a draft, a plan) or warmth (what a friend would say: they just finished something, it is late, they have been at it a long time).',
  moment==='browsing'?'Browsing along, a fourth reason counts: context (something about what is on screen they may not see at a glance: what it means for them, how it ties to their day, a catch, the one thing worth doing here, or what you could do for them here). Talk about this screen, not about browsing.':'',
  // Owner 2026-10-10 「让它提供的更勤一点」: at 7 and "when in doubt, PASS" Fox passed 86 of 88 asks.
  `First think of up to three candidate lines and rate each 0 to 10 for how glad the person would be to get it right now. Say the best one if it rates ${moment==='browsing'?5:6} or more and is not a repeat of anything below; otherwise answer exactly PASS. A specific, helpful line beats silence; a vague or generic one does not.`,
  'The line: one or two short sentences, in the language of their latest words, like a friend\'s text. No greeting, no "need help?", no list, no emoji unless they use them. Answer with the line alone, nothing before or after it.',
  'This turn is read only: do not open, click, send, save or change anything. If something should be done, mention it in the line; they can ask.',
  recent.length?`Lines you already said first today (do not repeat them): ${JSON.stringify(recent)}`:'',
  lastWords?`The person's latest words to you, for their language (reference only): ${JSON.stringify(lastWords)}`:''
 ].filter(Boolean).join('\n');
}

/** The tools the ask runs (it reads but never writes): Worldlet's own saved items and the World's
 * history, which the host serves. Hermes authorizes a service first (`_world_authorize`). Pages are
 * not read with tools: the World page runs no tools for an ask, so the host puts the open page's recorded
 * text in its context as `page` (onScreenText; before, only its title rode along, and every ask on a
 * website passed, owner Order 2026-10-07). */
export const PROACTIVE_READS=['query_world_items','read_world_history'] as const;
export const PROACTIVE_READ_ONLY='This ask is read only: only query_world_items and read_world_history run here. Answer from what you have, or PASS.';
/** Whether an ask's tool event may run. Any other tool gets PROACTIVE_READ_ONLY as its result, so the
 * ask still ends in a line or PASS instead of failing (Mac RC c0369d5d: one tool call failed the ask). */
export function proactiveToolAllowed(event:{name?:unknown;args?:unknown}):boolean {
 const args=event.args&&typeof event.args==='object'&&!Array.isArray(event.args)?event.args as Record<string,unknown>:{};
 const name=event.name==='_world_authorize'?args.name:event.name;
 return (PROACTIVE_READS as readonly unknown[]).includes(name);
}

/** Hermes Agent answers a provider failure with its error as the reply (a completed response, not a failed one), e.g.
 * "ChatGPT or Codex Subscription rejected the request and retrying won't help. Pick another model with /model, …"
 * (owner Order 2026-10-10, Discord). */
const AGENT_FAILURE=/rejected the request and retrying won['’]t help|^\W*\s*(?:non-retryable (?:client )?error|api (?:call )?failed|provider authentication failed|rate limited after \d+ retries|the model provider (?:rejected|failed|is rate-limiting))/i;
/** The line to show from Fox's answer, or null when Fox passed or the Agent answered with its own error: nobody
 * asked, so a failed ask ends quietly instead of showing the error as Fox's line. */
export function proactiveLine(message:unknown):string|null {
 const text=String(message??'').trim().replace(/^["“「]|["”」]$/g,'').trim();
 if(!text||AGENT_FAILURE.test(text)||/^PASS\b/i.test(text)||/\bPASS\s*\.?$/.test(text)&&characters(text).length<12)return null;
 const line=text.split(/\n+/).map(part=>part.trim()).filter(Boolean)[0]??'';
 if(!line||/^PASS\b/i.test(line))return null;
 const all=characters(line);
 return all.length>PROACTIVE.lineCharacters?all.slice(0,PROACTIVE.lineCharacters-1).join('').trimEnd()+'…':line;
}
