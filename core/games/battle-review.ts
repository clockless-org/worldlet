// Fox reviews the games the person played without being asked (#1598; owner promise to a VGC player in
// the 2026-10-03 recording: "你一直打之后，他可能 proactively 帮你分析"). The host passes every WebSocket
// message a website page receives; these rules find where a battle starts and ends, whose it is and how
// it went, and decide when a play session is over and worth a review. Pokémon Showdown's battle protocol
// (`>room`, `|init|battle`, `|player|`, `|win|`, `|tie`) is the one game protocol known so far; the
// review itself reads the recordings like any other (conversation guidance, `browser/record`).

/** The Applet a proactive review runs as (its device shows the work and the result opens it). */
export const GAME_REVIEW_APPLET='app-pokemon-showdown';

/** When a proactive review starts, and how many there can be. Owner 2026-10-13 「打完了以后就可以复盘，然后打完多少局之后也会
 * 给他生成一些这个总结」: every game gets a short review once it ends, and every few games a summary of them. */
export const BATTLE_REVIEW={
 /** A game's review starts this long after its result (games that ended while Fox was busy are reviewed together). */
 afterGameSeconds:15,
 /** After this many reviewed games, Fox sums them up. */
 summaryEvery:5,
 /** At most this many games in one review. */
 batch:10,
 /** Proactive reviews per local day (summaries included); asking Fox is never limited by this. */
 perDay:60,
 /** Finished games older than this are left for the person to ask about. */
 maxAgeSeconds:6*3600,
 /** A started battle with no message for this long is abandoned, not in progress. */
 staleSeconds:10*60,
 /** Battles remembered at once (oldest reviewed ones go first). */
 keep:60
} as const;

export interface WatchedBattle {
 room:string;visit:string;site:string;startedAt:number;lastAt:number;
 players:{p1?:string;p2?:string};
 /** The person's side once known: their name is a player's, or the site asked them to choose. */
 side?:'p1'|'p2';
 format?:string;turns:number;
 endedAt?:number;winner?:string;tie?:boolean;reviewed?:boolean;
}
export interface BattleWatch {self:string;battles:Record<string,WatchedBattle>;lastReviewAt:number;day:string;reviewsToday:number;
 /** Games reviewed since the last summary, oldest first. */
 sinceSummary:string[]}
export type BattleResult='won'|'lost'|'tie';
export interface FinishedBattle {room:string;visit:string;site:string;url:string;startedAt:number;endedAt:number;opponent:string;self:string;format:string;turns:number;result:BattleResult}

export function battleWatch():BattleWatch {return {self:'',battles:{},lastReviewAt:0,day:'',reviewsToday:0,sinceSummary:[]};}

/** Showdown's user id: lowercase letters and digits only ("Ash Fox" and "ashfox" are one user). */
export const battleUserId=(name:string)=>String(name??'').toLowerCase().replace(/[^a-z0-9]/g,'');

/** Sites whose battle protocol is known, by the page's site. */
export function battleSite(site:string):boolean {
 const host=String(site??'').toLowerCase();
 return host==='pokemonshowdown.com'||host.endsWith('.pokemonshowdown.com');
}

/** One WebSocket message the page received, on a site in `battleSite`. Updates `watch` in place. */
export function observeBattleMessage(watch:BattleWatch,message:{visit:string;site:string;at:number;body:string}):void {
 if(!battleSite(message.site)||typeof message.body!=='string'||!message.body.includes('|'))return;
 const lines=message.body.split('\n');
 const room=lines[0]?.startsWith('>')?lines[0].slice(1).trim():'';
 for(const line of room?lines.slice(1):lines){
  if(!room){
   // The signed-in or guest name, as the lobby connection reports it: `|updateuser| Ashfox|1|…`.
   const user=/^\|updateuser\|(.+?)\|/.exec(line);
   if(user)watch.self=user[1].trim().replace(/^[^A-Za-z0-9]+(?=[A-Za-z0-9])/,'')||watch.self;
   continue;
  }
  if(!room.startsWith('battle-'))return;
  let battle=watch.battles[room];
  if(line==='|init|battle'&&!battle){
   battle=watch.battles[room]={room,visit:message.visit,site:message.site,startedAt:message.at,lastAt:message.at,players:{},turns:0};
   forgetOldest(watch);
  }
  if(!battle)continue;
  battle.lastAt=Math.max(battle.lastAt,message.at);
  const player=/^\|player\|(p[12])\|([^|]+)/.exec(line);
  if(player){
   battle.players[player[1] as 'p1'|'p2']=player[2].trim();
   if(watch.self&&battleUserId(player[2])===battleUserId(watch.self))battle.side=player[1] as 'p1'|'p2';
   continue;
  }
  // Only a player is asked to choose: the request names the person's side even before their name is known.
  const request=/^\|request\|\{.*"side":\{"name":"([^"]*)","id":"(p[12])"/.exec(line);
  if(request){battle.side=request[2] as 'p1'|'p2';if(!watch.self)watch.self=request[1];continue;}
  const tier=/^\|tier\|(.+)$/.exec(line);
  if(tier){battle.format=tier[1].trim().slice(0,80);continue;}
  const turn=/^\|turn\|(\d+)$/.exec(line);
  if(turn){battle.turns=Math.max(battle.turns,Number(turn[1]));continue;}
  if(battle.endedAt!==undefined)continue;
  const win=/^\|win\|(.+)$/.exec(line);
  if(win){battle.winner=win[1].trim();battle.endedAt=message.at;continue;}
  if(line==='|tie'||line.startsWith('|tie|')){battle.tie=true;battle.endedAt=message.at;}
 }
}

function forgetOldest(watch:BattleWatch){
 const rooms=Object.values(watch.battles).sort((a,b)=>a.startedAt-b.startedAt);
 // Counted down rather than spliced: removing from the list being walked skipped the battle after each one forgotten.
 let left=rooms.length;
 for(const battle of rooms){
  if(left<=BATTLE_REVIEW.keep)break;
  if(battle.reviewed&&!watch.sinceSummary.includes(battle.room)||battle.endedAt===undefined){delete watch.battles[battle.room];left--;}
 }
}

/** The finished games of the person's own (not ones they watched), oldest first. */
export function finishedBattles(watch:BattleWatch,{reviewed=false}:{reviewed?:boolean}={}):FinishedBattle[] {
 return Object.values(watch.battles)
  .filter(battle=>battle.endedAt!==undefined&&battle.side!==undefined&&(reviewed||!battle.reviewed))
  .sort((a,b)=>a.endedAt!-b.endedAt!)
  .map(battle=>{
   const side=battle.side!,other=side==='p1'?'p2':'p1',self=battle.players[side]??watch.self;
   const result:BattleResult=battle.tie?'tie':battleUserId(battle.winner??'')===battleUserId(self)?'won':'lost';
   return {room:battle.room,visit:battle.visit,site:battle.site,url:`https://play.pokemonshowdown.com/${battle.room}`,startedAt:battle.startedAt,endedAt:battle.endedAt!,
    opponent:battle.players[other]??'',self,format:battle.format??'',turns:battle.turns,result};
  });
}

/** Whether to review now, and which games: each game shortly after it ends (with any others still waiting, newest
 * `batch`), within the day's limit. `day` is the local calendar day (YYYY-MM-DD). */
export function battleReviewDue(watch:BattleWatch,now:number,day:string):FinishedBattle[]|null {
 const waiting=finishedBattles(watch).filter(game=>now-game.endedAt<=BATTLE_REVIEW.maxAgeSeconds);
 if(!waiting.length)return null;
 if((watch.day===day?watch.reviewsToday:0)>=BATTLE_REVIEW.perDay)return null;
 if(now-Math.max(...waiting.map(game=>game.endedAt))<BATTLE_REVIEW.afterGameSeconds)return null;
 return waiting.slice(-BATTLE_REVIEW.batch);
}

/** The review started: these games are not offered again, they wait for the next summary, and it counts toward the day. */
export function battlesReviewed(watch:BattleWatch,games:FinishedBattle[],now:number,day:string):void {
 for(const game of games){const battle=watch.battles[game.room];if(battle)battle.reviewed=true;}
 // Older unreviewed games beyond the batch are left for the person to ask about.
 const newest=Math.max(...games.map(game=>game.endedAt));
 for(const battle of Object.values(watch.battles))if(battle.endedAt!==undefined&&battle.endedAt<=newest)battle.reviewed=true;
 watch.sinceSummary=[...watch.sinceSummary.filter(room=>!games.some(game=>game.room===room)),...games.map(game=>game.room)].slice(-BATTLE_REVIEW.batch);
 countReview(watch,now,day);
}
function countReview(watch:BattleWatch,now:number,day:string){watch.reviewsToday=(watch.day===day?watch.reviewsToday:0)+1;watch.day=day;watch.lastReviewAt=now;}

/** The games to sum up once `summaryEvery` have been reviewed since the last summary (newest `batch`), or null. */
export function battleSummaryDue(watch:BattleWatch,day:string):FinishedBattle[]|null {
 if(watch.sinceSummary.length<BATTLE_REVIEW.summaryEvery)return null;
 if((watch.day===day?watch.reviewsToday:0)>=BATTLE_REVIEW.perDay)return null;
 const games=finishedBattles(watch,{reviewed:true}).filter(game=>watch.sinceSummary.includes(game.room));
 return games.length?games.slice(-BATTLE_REVIEW.batch):null;
}
/** The summary started: the next one waits for `summaryEvery` more games. */
export function battlesSummarized(watch:BattleWatch,now:number,day:string):void {watch.sinceSummary=[];countReview(watch,now,day);}

/** The battle the person is playing on `visit` right now, if any, and how their finished games there went today
 * (Fox's tips while they play, owner 2026-10-13 「边玩也边给用户这个建议」). */
export function battleNow(watch:BattleWatch,{visit,now}:{visit?:string;now:number}):{playing:{room:string;format:string;opponent:string;turn:number}|null;record:{won:number;lost:number;tied:number}} {
 const mine=Object.values(watch.battles).filter(battle=>battle.side!==undefined&&(!visit||battle.visit===visit));
 const live=mine.filter(battle=>battle.endedAt===undefined&&now-battle.lastAt<BATTLE_REVIEW.staleSeconds).sort((a,b)=>b.lastAt-a.lastAt)[0];
 const games=finishedBattles(watch,{reviewed:true}).filter(game=>(!visit||game.visit===visit)&&now-game.endedAt<=BATTLE_REVIEW.maxAgeSeconds);
 const count=(result:BattleResult)=>games.filter(game=>game.result===result).length;
 return {playing:live?{room:live.room,format:live.format??'',opponent:live.players[live.side==='p1'?'p2':'p1']??'',turn:live.turns}:null,record:{won:count('won'),lost:count('lost'),tied:count('tie')}};
}

/** What Fox is handed for a proactive review (an Applet task of the game's Applet): the games, and how to
 * answer. `local` formats a time for the person. The person did not ask, so the answer is short and
 * leads with what to change; the conversation keeps it for follow-up questions. */
export function battleReviewTask(games:FinishedBattle[],local:(at:number)=>string,{summary=false}:{summary?:boolean}={}):{task:string;request:string} {
 const won=games.filter(game=>game.result==='won').length,lost=games.filter(game=>game.result==='lost').length,tied=games.length-won-lost;
 const visits=[...new Set(games.map(game=>game.visit))];
 const list=games.map((game,i)=>`${i+1}. ${game.room} (${game.format||'battle'}) vs ${game.opponent||'an opponent'}: ${game.result}, ${game.turns} turns, ended ${local(game.endedAt)}`).join('\n');
 const record=`${won} won, ${lost} lost${tied?`, ${tied} tied`:''}`;
 const request=summary?`(Not the person's words: Worldlet started this after ${games.length} battles.) Sum up my last ${games.length} battles.`
  :`(Not the person's words: Worldlet started this after ${games.length===1?'a battle':'a session of battles'} ended.) Review the ${games.length===1?'battle':`${games.length} battles`} I just played.`;
 // A game or two just ended: a short review the person reads before queueing again (owner 2026-10-13 「打完了以后就可以复盘」).
 if(!summary&&games.length<=2)return {request,task:[
  `The person (${games[0].self||'the player'}) just finished ${games.length===1?'a game':'two games'} on ${games[0].site}: ${record}. Review ${games.length===1?'it':'them'} right away, without being asked, as their coach.`,
  `Game${games.length===1?'':'s'}, recorded in the built-in browser (visit ${visits.join(', ')}):`,list,
  'Read the visit with browser/record: its first page lists each game\'s address with its record number (#). Read the game from its # with only "network" until its |win| or |tie|, and nothing else.',
  'Then answer in the person\'s language (the language of their recent conversation with you), in at most 5 short lines: the result in a few words, the turn that decided it (turn number, what happened, what would have been better and why), and one thing to do differently next game. A win gets what worked too. Say they can ask for more.',
  'Use only what the records show and say what they cannot show (the opponent\'s unrevealed moves or items). Do not open or click anything; reading the records is enough.'
 ].join('\n')};
 const task=[
  summary?`The person (${games[0].self||'the player'}) has played ${games.length} games on ${games[0].site} since your last summary, each already reviewed on its own: ${record}. Sum them up without being asked, as their coach: the patterns across games, not each game again.`
   :`The person (${games[0].self||'the player'}) just stopped playing on ${games[0].site}: ${games.length} game${games.length===1?'':'s'}, ${record}. Review them without being asked, as their coach.`,
  `Games (oldest first), each recorded in the built-in browser (visit ${visits.join(', ')}):`,list,
  'Read the visit with browser/record: its first page lists each game\'s address with its record number (#). Read every game above from its # with only "network" until its |win| or |tie|, and nothing else.',
  'Then answer in the person\'s language (the language of their recent conversation with you), in at most 12 short lines: their record; team building (what in their team or the four they brought keeps failing, and one concrete change: a member, move, item, Tera type or what to bring); the opposing Pokémon or strategies they lost to; and the turn choices that cost them games (game and turn number, what they chose, what would have been better and why). Lead with the most important change. End by saying they can ask about any one game in detail.',
  'Use only what the records show and say what they cannot show (the opponent\'s unrevealed moves or items). Do not open or click anything; reading the records is enough.'
 ].join('\n');
 return {task,request};
}
