/** Public component API. Cross-component consumers import this entry point. */
export {GAME_MAKING_OPEN,GAME_FACTORY_APPLET,MADE_GAME_LIMITS,SANDBOX_POLICY,MADE_GAME_POLICY,MADE_GAME_REPORT,sandboxDocument,gameFactoryModel,madeGameId,validMadeGameId,madeGameRecord,readMadeGame,orderMadeGames,offlinePageProblems,checkMadeGameSource,madeGameTrialProblems,madeGameDocument,readMadeGameReport,betterBest,madeGameTask} from './factory.ts';
export type {MadeGame,ModelSourceName} from './factory.ts';
export {BATTLE_REVIEW,GAME_REVIEW_APPLET,battleWatch,battleUserId,battleSite,observeBattleMessage,finishedBattles,battleReviewDue,battlesReviewed,battleReviewTask} from './battle-review.ts';
export type {BattleWatch,WatchedBattle,FinishedBattle,BattleResult} from './battle-review.ts';
