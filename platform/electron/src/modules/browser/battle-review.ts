import {BATTLE_REVIEW,battleReviewDue,battleReviewTask,battleSite,battleWatch,battlesReviewed,observeBattleMessage,type FinishedBattle} from '../../../../../core/games/index.ts';
import type {RecordedVisit} from './recorder.ts';
import type {WebRecord} from '../../../../../core/browser/index.ts';

/** What starting a review needs of the host: whether Fox may run one now, and handing it over. `start`
 * returns 'started', 'later' (Fox is busy; ask again) or 'never' (this Agent cannot; drop these games). */
export interface BattleReviewHost {
 now?:()=>number;
 /** The local calendar day of a time in seconds (YYYY-MM-DD) and a short local time for Fox. */
 day:(at:number)=>string;
 local:(at:number)=>string;
 start:(review:{task:string;request:string;games:FinishedBattle[]})=>'started'|'later'|'never';
 onError?:(error:unknown)=>void;
}

/** Proactive game review (#1598): follows the battle messages the website recorders keep, and once the
 * person stops playing hands the games to Fox as a review (core/games/battle-review.ts decides when).
 * In memory only: games from before a restart are left for the person to ask about. */
export class BattleReviews {
 private watch=battleWatch();
 private sites=new Map<string,string>();
 private timer:NodeJS.Timeout|null=null;
 private readonly host:BattleReviewHost;
 constructor(host:BattleReviewHost){this.host=host;}
 private now(){return this.host.now?.()??Date.now()/1000;}

 /** One batch a recorder saved: messages received on a battle site are read for games. */
 observe(visits:RecordedVisit[],records:(WebRecord&{visit:string})[]){
  try{
   for(const visit of visits)this.sites.set(visit.id,visit.site);
   let ended=false;
   for(const record of records){
    if(record.kind!=='ws-in')continue;
    const site=this.sites.get(record.visit)??'';
    if(!battleSite(site))continue;
    ended||=/^\|(win\||tie\b)/m.test(record.body);
    observeBattleMessage(this.watch,{visit:record.visit,site,at:record.at,body:record.body});
   }
   if(this.sites.size>200)this.sites=new Map([...this.sites].slice(-100));
   if(ended)this.schedule(BATTLE_REVIEW.quietSeconds+5);
  }catch(error){this.host.onError?.(error);}
 }

 /** Looks again later; while games wait it keeps looking every minute. */
 private schedule(seconds:number){
  if(this.timer)clearTimeout(this.timer);
  this.timer=setTimeout(()=>{this.timer=null;this.check();},seconds*1000);
  this.timer.unref?.();
 }

 /** Starts a review when one is due. Returns the games handed to Fox, if any. */
 check():FinishedBattle[]|null {
  try{
   const now=this.now(),day=this.host.day(now);
   const games=battleReviewDue(this.watch,now,day);
   if(!games){if(Object.values(this.watch.battles).some(battle=>battle.endedAt!==undefined&&!battle.reviewed&&battle.side))this.schedule(60);return null;}
   const outcome=this.host.start({...battleReviewTask(games,this.host.local),games});
   if(outcome==='later'){this.schedule(60);return null;}
   battlesReviewed(this.watch,games,now,day);
   return outcome==='started'?games:null;
  }catch(error){this.host.onError?.(error);return null;}
 }
 stop(){if(this.timer)clearTimeout(this.timer);this.timer=null;}
}
