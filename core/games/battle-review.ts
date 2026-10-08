// Fox reviews the games the person played without being asked (#1598; owner promise to a VGC player in
// the 2026-10-03 recording: "你一直打之后，他可能 proactively 帮你分析"). The host passes every WebSocket
// message a website page receives; these rules find where a battle starts and ends, whose it is and how
// it went, and decide when a play session is over and worth a review. Pokémon Showdown's battle protocol
// (`>room`, `|init|battle`, `|player|`, `|win|`, `|tie`) is the one game protocol known so far; the
// review itself reads the recordings like any other (conversation guidance, `browser/record`).

/** The Applet a proactive review runs as (its device shows the work and the result opens it). */
export const GAME_REVIEW_APPLET='app-pokemon-showdown';

/** When a proactive review starts, and how many there can be. */
export const BATTLE_REVIEW={
 /** A session is over once no battle has been played for this long after the last result. */
 quietSeconds:180,
 /** …or as soon as this many finished games wait (the friend's "打了十把之后"), and at most this many are reviewed at once. */
 batch:10,
 /** Between two proactive reviews, unless a whole batch waits. */
 minGapSeconds:20*60,
 /** Proactive reviews per local day; asking Fox is never limited by this. */
 perDay:6,
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
export interface BattleWatch {self:string;battles:Record<string,WatchedBattle>;lastReviewAt:number;day:string;reviewsToday:number}
export type BattleResult='won'|'lost'|'tie';
export interface FinishedBattle {room:string;visit:string;site:string;url:string;startedAt:number;endedAt:number;opponent:string;self:string;format:string;turns:number;result:BattleResult}

export function battleWatch():BattleWatch {return {self:'',battles:{},lastReviewAt:0,day:'',reviewsToday:0};}

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
 for(const battle of rooms){
  if(rooms.length<=BATTLE_REVIEW.keep)break;
  if(battle.reviewed||battle.endedAt===undefined){delete watch.battles[battle.room];rooms.splice(rooms.indexOf(battle),1);}
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

/** Whether to review now, and which games: the newest unreviewed ones, once the person has stopped playing
 * (or a whole batch waits), not too soon after the last proactive review and not too often in a day.
 * `day` is the local calendar day (YYYY-MM-DD). */
export function battleReviewDue(watch:BattleWatch,now:number,day:string):FinishedBattle[]|null {
 const waiting=finishedBattles(watch).filter(game=>now-game.endedAt<=BATTLE_REVIEW.maxAgeSeconds);
 if(!waiting.length)return null;
 const today=watch.day===day?watch.reviewsToday:0;
 if(today>=BATTLE_REVIEW.perDay)return null;
 const full=waiting.length>=BATTLE_REVIEW.batch;
 const playing=Object.values(watch.battles).some(battle=>battle.endedAt===undefined&&battle.side!==undefined&&now-battle.lastAt<BATTLE_REVIEW.staleSeconds);
 const lastEnd=Math.max(...waiting.map(game=>game.endedAt));
 if(!full&&(playing||now-lastEnd<BATTLE_REVIEW.quietSeconds))return null;
 if(!full&&now-watch.lastReviewAt<BATTLE_REVIEW.minGapSeconds)return null;
 return waiting.slice(-BATTLE_REVIEW.batch);
}

/** The review started: these games are not offered again, and it counts toward the day. */
export function battlesReviewed(watch:BattleWatch,games:FinishedBattle[],now:number,day:string):void {
 for(const game of games){const battle=watch.battles[game.room];if(battle)battle.reviewed=true;}
 // Older unreviewed games beyond the batch are left for the person to ask about.
 const newest=Math.max(...games.map(game=>game.endedAt));
 for(const battle of Object.values(watch.battles))if(battle.endedAt!==undefined&&battle.endedAt<=newest)battle.reviewed=true;
 watch.reviewsToday=(watch.day===day?watch.reviewsToday:0)+1;watch.day=day;watch.lastReviewAt=now;
}

/** What Fox is handed for a proactive review (an Applet task of the game's Applet): the games, and how to
 * answer. `local` formats a time for the person. The person did not ask, so the answer is short and
 * leads with what to change; the conversation keeps it for follow-up questions. */
export function battleReviewTask(games:FinishedBattle[],local:(at:number)=>string):{task:string;request:string} {
 const won=games.filter(game=>game.result==='won').length,lost=games.filter(game=>game.result==='lost').length,tied=games.length-won-lost;
 const visits=[...new Set(games.map(game=>game.visit))];
 const list=games.map((game,i)=>`${i+1}. ${game.room} (${game.format||'battle'}) vs ${game.opponent||'an opponent'}: ${game.result}, ${game.turns} turns, ended ${local(game.endedAt)}`).join('\n');
 const record=`${won} won, ${lost} lost${tied?`, ${tied} tied`:''}`;
 const request=`(Not the person's words: Worldlet started this after ${games.length===1?'a battle':'a session of battles'} ended.) Review the ${games.length===1?'battle':`${games.length} battles`} I just played.`;
 const task=[
  `The person (${games[0].self||'the player'}) just stopped playing on ${games[0].site}: ${games.length} game${games.length===1?'':'s'}, ${record}. Review them without being asked, as their coach.`,
  `Games (oldest first), each recorded in the built-in browser (visit ${visits.join(', ')}):`,list,
  'Read the visit with browser/record: its first page lists each game\'s address with its record number (#). Read every game above from its # with only "network" until its |win| or |tie|, and nothing else.',
  'Then answer in the person\'s language (the language of their recent conversation with you), in at most 12 short lines: their record; team building (what in their team or the four they brought keeps failing, and one concrete change: a member, move, item, Tera type or what to bring); the opposing Pokémon or strategies they lost to; and the turn choices that cost them games (game and turn number, what they chose, what would have been better and why). Lead with the most important change. End by saying they can ask about any one game in detail.',
  'Use only what the records show and say what they cannot show (the opponent\'s unrevealed moves or items). Do not open or click anything; reading the records is enough.'
 ].join('\n');
 return {task,request};
}
