import {characters} from './companion-text.ts';

/** Fox speaks first (owner request 2026-10-06: "更主动更 helpful", modelled on Poke). At a natural pause
 * Worldlet asks Fox whether one line is worth saying now; most of the time the answer is no and
 * nothing shows. These pure rules decide when to ask and read the answer; the host runs the turn
 * (read only, like the proactive game review) and the Fox bar shows the line. The person's own
 * model pays for every ask, so the limits below also cap the cost. */
export const PROACTIVE={
 /** Between two lines Fox says first; doubles for each line in a row the person let pass (at most ×2). Owner
  * 2026-10-13 「companion说的再勤一点，隔一段时间就表达一下」: was 10 minutes, ×8 and 12 a day. Owner 2026-10-15
  * 「companion说话频率再高一些」: Fox spoke on ~85% of asks, so the waits were the limit; every wait and cap halved or doubled. */
 minGapSeconds:2*60,
 /** Lines Fox says first per local day, and per place per day. */
 perDay:80,perPlace:20,
 /** Check in: while the person is around (some input in the last 10 minutes) and Fox has said nothing on its own for
  * this long, Worldlet asks whether Fox has something to say, in the World or anywhere else (owner 2026-10-13). */
 checkinSeconds:3*60,
 /** A reply within this long after Fox spoke counts as an answer. */
 answeredSeconds:10*60,
 /** "Be quiet" holds this long. */
 quietSeconds:12*3600,
 /** How long the person stays in a place before Fox may speak there: the World, then an Applet or page. */
 settleSeconds:{world:10,applet:60},
 /** A stay this long in one place is a moment of its own (a break, or how it is going). */
 longStaySeconds:30*60,
 /** Local hours that count as late at night. */
 lateFrom:23,lateUntil:5,
 /** The longest line shown. */
 lineCharacters:240,
 /** Browse with me (owner request 2026-10-08: 「做 Applet 的时候小狐狸在旁边时不时地说话，给一些 context，提供一些帮助」):
  * once the person has looked at an Applet or page this long, Fox may say one line about it. At most `perVisit` asks
  * per visit (the next one `againSeconds` after the first, for when Fox passed or the screen changed), these
  * lines at least `gapSeconds` apart (doubling like the others when let pass) and `perDay` a day, counted apart
  * from the other moments so browsing never uses up the day's other lines. Owner 2026-10-10 「让它提供的更勤一点」:
  * 88 asks in 4 days ended in 2 lines, so a look is shorter, asks come twice per visit and the bar is lower.
  * Owner 2026-10-12 「进一个 applet 就开始推荐说话 像个真的 companion」: the first ask goes out a few seconds after the
  * Applet opens and says one recommendation about it; a line no longer holds the next browse line until it is
  * answered (a line nobody answered held every Applet quiet for 10 minutes); `placeSeconds` keeps Fox from
  * opening on the same Applet again soon after it said something there. Owner 2026-10-13 「每一个 app 进来之后…变得更主动一点」:
  * every Applet keeps talking while the person stays (a look a minute, up to 20 a visit), not three times and done. */
 browse:{settleSeconds:3,againSeconds:40,gapSeconds:30,perDay:400,perVisit:40,placeSeconds:5*60,
  /** In a game Worldlet follows (a Showdown battle), Fox keeps playing along: a look every `againSeconds`, up to
   * `perVisit` a visit (owner 2026-10-13 「进入这种游戏了，那上来就要跟用户聊天，然后边玩也边给用户这个建议」). */
  game:{againSeconds:30,gapSeconds:20,perVisit:80}},
 /** Wrap up (owner 2026-10-13): back in the World after at least `minStaySeconds` in an Applet or page, Fox may sum it
  * up in one line (what the person got out of it, what is left), at most `perDay` a day and `gapSeconds` after any
  * other line. A game Worldlet follows has its own reviews (core/games/battle-review.ts) instead. */
 wrapup:{minStaySeconds:60,perDay:60,gapSeconds:60}
} as const;

/** What kind of place an Applet or page is, for the hooks that fit it (owner 2026-10-13: every Applet, not only
 * games): `reading` (articles, docs, news, notes), `mail`, `plan` (tasks, calendar, reminders), `watch` (video,
 * music), `shop`, `code`, `play` (games), else `app`. Read from the place key and its title. */
export type PlaceKind='reading'|'mail'|'plan'|'watch'|'shop'|'code'|'play'|'app';
const KINDS:[PlaceKind,RegExp][]=[
 ['mail',/\b(mail|gmail|inbox|outlook|email)\b/i],
 ['plan',/\b(calendar|reminders?|tasks?|to-?dos?|planner|meetings?|agenda)\b/i],
 ['watch',/\b(youtube|video|videos|netflix|twitch|music|spotify|podcasts?|voice memos)\b/i],
 ['shop',/\b(shop|shopping|amazon|store|cart|ebay|taobao)\b/i],
 ['code',/\b(codex|github|gitlab|code|terminal|pull request)\b/i],
 ['play',/\b(games?|2048|snake|minesweeper|sudoku|chess|showdown|pok[eé]mon|puzzle)\b/i],
 ['reading',/\b(notes?|notion|library|docs?|wiki|news|articles?|blog|reader|books?|reddit|hacker news|medium|substack|paper|journal)\b|^web:/i]
];
export function placeKind(place:string,title=''):PlaceKind {
 const text=`${place} ${title}`;
 return KINDS.find(([,pattern])=>pattern.test(text))?.[0]??'app';
}
/** One hook per kind: what a companion beside the person would talk about there while it is open, and when they leave. */
const HOOKS:Record<PlaceKind,{during:string;after:string}>={
 reading:{during:'the one point on screen that matters most to them, a catch or a counterpoint, or how it ties to their day',after:'the two or three takeaways worth keeping from what they read, in one line, and one thing to do with them'},
 mail:{during:'which message needs them first and why, or what a reply could say',after:'what is still waiting on an answer from them, and which one first'},
 plan:{during:'a clash, a gap, the next thing due, or what to move',after:'what is next and when, and anything that slipped'},
 watch:{during:'something worth knowing about what is playing, or what to watch or play next',after:'a short reaction to what they watched or heard, and what to try next'},
 shop:{during:'a catch in the price, reviews, size or delivery, or a better choice',after:'where they landed and anything left to decide or check before buying'},
 code:{during:'the risk or next step in the change on screen',after:'what is done, what is still open, and the next step'},
 play:{during:'a concrete tip for the move on screen, or a reaction to how it is going',after:'how the game went and one thing to try next time'},
 app:{during:'the one thing worth doing or noticing here, or something you could do for them here',after:'what they got done there and the next step, if any'}
};

/** Why Worldlet asks: the person settled into a place, has stayed in it a long time, is up late, is
 * looking at an Applet or page, Fox has been quiet a while (check in), or they just came back from an Applet (wrap up). */
export type ProactiveMoment='settled'|'long-stay'|'late'|'browsing'|'checkin'|'wrapup';
export const PROACTIVE_MOMENTS:readonly ProactiveMoment[]=['settled','long-stay','late','browsing','checkin','wrapup'];

export interface ProactiveState {
 day:string;spoken:number;places:Record<string,number>;moments:string[];
 lastAt:number;ignored:number;quietUntil:number;
 /** Browse lines today, when the last browse ask ran, and the visit it was for (one line per visit). */
 browsed:number;browseAt:number;browseVisit:string;browseVisitAsks:number;
 /** When Fox last said a browse line in each place today, so a return visit soon after is not opened on again. */
 browsePlaces:Record<string,number>;
 /** Wrap-up lines today and when the last wrap-up ask ran. */
 wrapped:number;wrapAt:number;
 /** The line said last, until the person answers it or lets it pass. */
 pending:{at:number;place:string}|null;
 /** Recent lines, newest last, so Fox never says the same thing twice. */
 recent:string[];
}
export const proactiveState=():ProactiveState=>({day:'',spoken:0,places:{},moments:[],lastAt:0,ignored:0,quietUntil:0,browsed:0,browseAt:0,browseVisit:'',browseVisitAsks:0,browsePlaces:{},wrapped:0,wrapAt:0,pending:null,recent:[]});

function settle(state:ProactiveState,now:number,day:string){
 if(state.day!==day){state.day=day;state.spoken=0;state.places={};state.moments=[];state.browsed=0;state.browsePlaces={};state.wrapped=0;}
 // A line nobody answered in time was let pass: Fox waits longer before the next one.
 if(state.pending&&now-state.pending.at>PROACTIVE.answeredSeconds){state.ignored=Math.min(state.ignored+1,3);state.pending=null;}
}

/** Whether Fox may be asked now. `place` is the place key (here.place); `day` the local day (YYYY-MM-DD);
 * `visit` names one stay in an Applet or page for the browsing moment. */
export function proactiveDue(state:ProactiveState,{now,day,moment,place,visit='',game=false}:{now:number;day:string;moment:ProactiveMoment;place:string;visit?:string;
 /** The place is a game Worldlet follows: browse looks keep coming while they play. */
 game?:boolean}):{due:true}|{due:false;reason:string} {
 settle(state,now,day);
 if(!PROACTIVE_MOMENTS.includes(moment)||!place)return {due:false,reason:'unknown'};
 if(now<state.quietUntil)return {due:false,reason:'quiet'};
 if(moment==='browsing'){
  if(!visit||visit===state.browseVisit&&state.browseVisitAsks>=(game?PROACTIVE.browse.game.perVisit:PROACTIVE.browse.perVisit))return {due:false,reason:'visit'};
  if(state.browsed>=PROACTIVE.browse.perDay)return {due:false,reason:'day'};
  if(visit!==state.browseVisit&&now-(state.browsePlaces[place]??-Infinity)<PROACTIVE.browse.placeSeconds)return {due:false,reason:'place'};
  // Browsing never waits for the last line's answer: a companion keeps talking about what is on screen. Lines let
  // pass still slow it, at most four times the gap.
  if(now-Math.max(state.browseAt,state.lastAt)<(game?PROACTIVE.browse.game.gapSeconds:PROACTIVE.browse.gapSeconds)*2**Math.min(state.ignored,2))return {due:false,reason:'gap'};
  return {due:true};
 }
 // A wrap up follows the person leaving an Applet, so it has its own day count and a shorter gap.
 if(moment==='wrapup'){
  if(state.wrapped>=PROACTIVE.wrapup.perDay)return {due:false,reason:'day'};
  if(now-Math.max(state.lastAt,state.browseAt,state.wrapAt)<PROACTIVE.wrapup.gapSeconds)return {due:false,reason:'gap'};
  return {due:true};
 }
 if(state.spoken>=PROACTIVE.perDay)return {due:false,reason:'day'};
 if((state.places[place]??0)>=PROACTIVE.perPlace)return {due:false,reason:'place'};
 if(moment==='late'&&state.moments.includes('late'))return {due:false,reason:'once'};
 // No line waits for the last one's answer (owner 2026-10-13: speak more often); lines let pass slow it, at most ×2.
 if(now-state.lastAt<PROACTIVE.minGapSeconds*2**Math.min(state.ignored,1))return {due:false,reason:'gap'};
 // A check in comes only after Fox has been quiet a while, a browse line included.
 if(moment==='checkin'&&now-Math.max(state.lastAt,state.browseAt)<PROACTIVE.checkinSeconds)return {due:false,reason:'gap'};
 return {due:true};
}

/** Worldlet asked Fox: the ask counts toward the gap even when Fox chose to stay quiet, so a quiet
 * moment is not asked again at once. */
export function proactiveAsked(state:ProactiveState,{now,day,moment,visit=''}:{now:number;day:string;moment:ProactiveMoment;visit?:string}){
 settle(state,now,day);
 // A browse ask keeps its own clock, so looking around never pushes back the other moments.
 if(moment==='browsing'){state.browseVisitAsks=visit===state.browseVisit?state.browseVisitAsks+1:1;state.browseAt=now;state.browseVisit=visit;return;}
 if(moment==='wrapup'){state.wrapAt=now;return;}
 state.lastAt=now;
 if(moment==='late'&&!state.moments.includes('late'))state.moments.push('late');
}

/** Fox's line was shown in `place`. */
export function proactiveSpoke(state:ProactiveState,{now,day,place,line,moment}:{now:number;day:string;place:string;line:string;moment?:ProactiveMoment}){
 settle(state,now,day);
 // A new line over one still unanswered: the earlier one was let pass.
 if(state.pending)state.ignored=Math.min(state.ignored+1,3);
 if(moment==='browsing'){state.browsed++;state.browseAt=now;state.browsePlaces[place]=now;}
 // A wrap up holds the World's next line for the usual gap, so Fox does not sum up and then settle in at once.
 else if(moment==='wrapup'){state.wrapped++;state.wrapAt=now;state.lastAt=now;}
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
 const joined=value.replace(/ /g,'');
 return /^(fox ?|小狐狸 ?)?(你)?(先)?(别|不要|不用)(再)?(说话|打扰我?|吵|插嘴|主动说话?)(了|啦|吧)?$/.test(joined)
  ||/^(fox ?|小狐狸 ?)?(安静|闭嘴|少说)(点|一点|一下|些|两句)?(吧|啦)?$/.test(joined)
  ||/^(please )?(shut up|be quiet|quiet|stop talking|stop interrupting|leave me alone)( please)?$/.test(value);
}

/** The local hour counts as late at night. */
export const proactiveLate=(hour:number)=>hour>=PROACTIVE.lateFrom||hour<PROACTIVE.lateUntil;

/** What Worldlet asks Fox. Nobody spoke, so it is a task with the person's latest words for their
 * language, the lines Fox already said and the moment; Fox answers PASS unless one line is worth it. */
export function proactiveTask({moment,place,local,minutes,recent,lastWords,opened=false,game=null,kind='app',left=null}:{moment:ProactiveMoment;place:string;local:string;minutes:number;recent:string[];lastWords:string;
 /** What kind of place this is (placeKind), for the hook that fits it while browsing. */
 kind?:PlaceKind;
 /** The wrap up: the Applet or page they just left, its kind and how long they stayed (what it showed rides in `left` in context). */
 left?:{place:string;kind:PlaceKind;minutes:number}|null;
 /** The browse ask made as the Applet or page opens: Fox opens with a recommendation about it (owner 2026-10-12). */
 opened?:boolean;
 /** The game on screen, when Worldlet follows it: the battle being played now and today's record there. */
 game?:{playing:{format:string;opponent:string;turn:number}|null;record:{won:number;lost:number;tied:number}}|null}):string {
 const first=moment==='browsing'&&opened;
 const record=game?`${game.record.won} won, ${game.record.lost} lost${game.record.tied?`, ${game.record.tied} tied`:''} today`:'';
 // Owner 2026-10-13 「进入这种游戏了，那上来就要跟用户聊天，然后边玩也边给用户这个建议」: Fox plays along.
 const playing=game?.playing?`They are in a battle right now (${game.playing.format||'a battle'} vs ${game.playing.opponent||'an opponent'}, turn ${game.playing.turn}; ${record}). Give one concrete tip for this turn or the next from what page.text shows of the battle: the threat to watch, a switch, a move, a target or when to Terastallize, and why in a few words. They are mid-game: keep it short and never repeat a tip you already gave.`:'';
 const lobby=game&&!game.playing?`This is a game they play (${record}). ${first?'They just came in: open like a friend joining their session: about today\'s games, the last one, or what to try next.':'Between games: a word on the last game, their team or the next queue.'}`:'';
 const why=moment==='wrapup'&&left?`The person just came back from ${left.place} after about ${Math.max(1,left.minutes)} minutes there.`:moment==='checkin'?`The person is in ${place}, and you have not said anything for a while.`:moment==='late'?`It is late (${local}) and the person is still here.`:moment==='long-stay'?`The person has been in ${place} for about ${minutes} minutes.`:first?`The person just opened ${place}, and asked you to browse along with them.`:moment==='browsing'?`The person is looking at ${place}, and asked you to browse along with them.`:`The person has settled into ${place} and paused.`;
 return [
  '(Not the person\'s words: Worldlet is asking at a quiet moment whether you have one thing worth saying first.)',
  `${why} It is ${local}.`,
  'Look at where they are and what is in front of them (location, state and view are the place and what it shows; here, browsing, history; on a website, page.text is what the page on screen says right now) and what you know about their day (query_world_items for what is coming up or due). Do not try to open, snapshot or read the page with a tool: page.text is all of it this ask gets.',
  'Speak only for one of three reasons: useful (something they will need soon: a clash, a deadline, the thing they were just looking for), insight (a concrete, opinionated take on what they are doing right now: a move, a draft, a plan) or warmth (what a friend would say: they just finished something, it is late, they have been at it a long time).',
  moment==='browsing'?'Browsing along, a fourth reason counts: context (something about what is on screen they may not see at a glance: what it means for them, how it ties to their day, a catch, the one thing worth doing here, or what you could do for them here). Talk about this screen, not about browsing.':'',
  // Owner 2026-10-13 「每一个 app 进来之后…变得更主动一点」: the hook that fits this kind of place.
  moment==='browsing'&&!game?`Here, good things to talk about: ${HOOKS[kind].during}. A new look at the same place: say something new about what is on screen now, not the same point again.`:'',
  moment==='wrapup'&&left?`Wrap it up like a friend who was beside them: ${HOOKS[left.kind].after}. context.left is what that place showed when they left it (its location, state and view). Name the actual thing, never "you were in an app".`:'',
  // Owner 2026-10-12 「进一个 applet 就开始推荐说话 像个真的 companion」.
  moment==='checkin'?'Check in like a companion who is around: a fourth reason counts here: presence (a short reaction to what they are doing or where they are, a thought about their day, or something you could do for them now). Say something specific to this moment, never "how is it going" or a generic hello.':'',
  playing||lobby,
  first&&!game?'They just walked in, so open like a friend sitting beside them: one concrete recommendation for this screen (the one thing worth doing, reading or noticing here first, or what you could do for them here), naming the actual thing on screen. Answer PASS only if the screen shows nothing yet that you could name.':'',
  // Owner 2026-10-10 「让它提供的更勤一点」: at 7 and "when in doubt, PASS" Fox passed 86 of 88 asks.
  `First think of up to three candidate lines and rate each 0 to 10 for how glad the person would be to get it right now. Say the best one if it rates ${first||game?3:moment==='browsing'||moment==='checkin'||moment==='wrapup'?4:6} or more and is not a repeat of anything below; otherwise answer exactly PASS. A specific, helpful line beats silence; a vague or generic one does not.`,
  'The line: one or two short sentences, in the language of their latest words, like a friend\'s text. No greeting, no "need help?", no list, no emoji unless they use them. Answer with the line alone, nothing before or after it.',
  'This turn is read only: do not open, click, send, save or change anything. If something should be done, mention it in the line; they can ask.',
  // Owner 2026-10-10: Attention is the one place to act, so a line about something waiting on the person points to its card.
  'If the line is about something waiting on the person (an open item from query_world_items they need to do, decide or answer), end it with [card:ID], that item\'s exact id, and keep the line to why it matters now: they act on the card, not in this line. Never make up an id.',
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
 * (owner Order 2026-10-10, Discord), or a model the account no longer accepts (HTTP 400, Applet analysis 2026-10-11). */
const AGENT_FAILURE=/rejected the request and retrying won['’]t help|^\W*\s*(?:non-retryable (?:client )?error|api (?:call )?failed|provider authentication failed|rate limited after \d+ retries|the model provider (?:rejected|failed|is rate-limiting))/i;
/** Whether an Agent's final reply is its own provider error rather than an answer. */
export function agentReplyFailed(message:unknown):boolean {return AGENT_FAILURE.test(String(message??'').trim());}
/** `[card:ID]` at the end of a line: the Attention item the line is about (proactiveTask). */
const CARD_MARK=/\s*\[card:\s*([^\]\s]{1,200})\s*\]/gi;
/** The Attention item Fox's line points to, as Fox wrote it; the host keeps it only if that item is open in the World. */
export function proactiveCard(message:unknown):string|null {
 const marks=[...String(message??'').matchAll(CARD_MARK)];
 return marks.length?marks.at(-1)![1]:null;
}
/** The line to show from Fox's answer, or null when Fox passed or the Agent answered with its own error: nobody
 * asked, so a failed ask ends quietly instead of showing the error as Fox's line. A card mark is not part of the line. */
export function proactiveLine(message:unknown):string|null {
 const text=String(message??'').replace(CARD_MARK,'').trim().replace(/^["“「]|["”」]$/g,'').trim();
 if(!text||agentReplyFailed(text)||/^PASS\b/i.test(text)||/\bPASS\s*\.?$/.test(text)&&characters(text).length<12)return null;
 const line=text.split(/\n+/).map(part=>part.trim()).filter(Boolean)[0]??'';
 if(!line||/^PASS\b/i.test(line))return null;
 const all=characters(line);
 return all.length>PROACTIVE.lineCharacters?all.slice(0,PROACTIVE.lineCharacters-1).join('').trimEnd()+'…':line;
}
