import {dialog} from 'electron';
import {GAME_FACTORY_APPLET,MADE_GAME_LIMITS,betterBest,checkMadeGameSource,gameFactoryModel,madeGameDocument,madeGameId,madeGameRecord,madeGameTask,orderMadeGames,readMadeGame,validMadeGameId,type MadeGame} from '../../../../../core/games/index.ts';
import {WorldletError} from '../../files.ts';
import {FOX,type FoxService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {Surface} from '../browser/surface.ts';
import {GamePlayer} from './player.ts';
import {tryMadeGame} from './trial.ts';

/** One Game Factory request in flight: the Applet task that works on it and what it may replace. */
interface Job {idea:string;replaces:string|null;saved:string|null}

/** The Game Factory (core/games/README.md). Fox hands a game to the Factory as an Applet task; its
 * model saves one HTML page, which is checked, tried offline and kept in this World's database
 * (`made_games`, before 2026-10-05 the folder `games/<id>/`, which store/moved-in.ts moves in).
 * Made games play in their own sandboxed view and lead the Games area, newest first. */
export function installGames(host:Host){
 const {store,page}=host;
 const fox=()=>host.use<FoxService>(FOX);
 const jobs=new Map<string,Job>();
 const personal=()=>{if(!store.writable||store.sampleEnabled())throw new WorldletError('The Game Factory makes games in your own world. The practice world has none.');};
 const games=()=>{try{return store.ledger().madeGameRecords().map(readMadeGame).filter((game):game is MadeGame=>!!game&&validMadeGameId(game.id));}catch{return [];}};
 const read=(id:string):MadeGame|null=>games().find(game=>game.id===id)??null;
 function list():MadeGame[] {
  if(store.sampleEnabled())return [];
  return orderMadeGames(games());
 }
 const source=(id:string)=>{
  const html=validMadeGameId(id)&&read(id)?store.ledger().madeGamePage(id):null;
  if(html===null)throw new WorldletError('That game is not in this world.');
  return html;
 };
 const changed=(id:string)=>page.event('worldlet:made-games',{id});
 // Jobs whose task ended (finished, failed or stopped) are forgotten.
 const prune=()=>{for(const id of jobs.keys())if(fox().appletTask(id)!==GAME_FACTORY_APPLET)jobs.delete(id);};
 const player=new GamePlayer(new Surface(host),(id,score)=>{
  const game=read(id);if(!game)return;
  const best=betterBest(game.best,score);if(best===game.best)return;
  try{store.ledger().saveMadeGame(id,{...game,best});changed(id);}catch(error){host.diagnostics.record(error,'madeGameBest');}
 });

 // A changed game keeps its last few versions beside it.
 const save=(id:string,html:string,record:MadeGame)=>store.ledger().saveMadeGame(id,record as unknown as Row,html,MADE_GAME_LIMITS.versions);

 host.register({
  madeGames:()=>({games:list().map(({ideas:_ideas,...game})=>game)}),
  gameFactoryStart:async request=>{
   personal();prune();
   const idea=typeof request.idea==='string'?request.idea.trim():'';
   if(!idea||[...idea].length>1200||typeof request.request!=='string')throw new WorldletError('Say what game to make.');
   const replaces=request.replaces==null?null:String(request.replaces),previous=replaces?read(replaces):null;
   if(replaces&&!previous)throw new WorldletError('That game is not in this world. Use list_made_games for the IDs.');
   if(!replaces&&list().length>=MADE_GAME_LIMITS.games)throw new WorldletError(`This world already has ${MADE_GAME_LIMITS.games} made games. Ask the person to delete one in the Game Factory first.`);
   const model=gameFactoryModel((await fox().modelSource()).source);
   if(model.ok===false)return {error:model.error,needsModel:true};
   const result=fox().startAppletTask({applet:GAME_FACTORY_APPLET,task:madeGameTask(idea,previous),request:request.request,...typeof request.parent==='string'?{parent:request.parent}:{}});
   if(typeof result.id==='string')jobs.set(result.id,{idea,replaces,saved:null});
   return result;
  },
  gameFactorySave:async request=>{
   personal();
   const task=typeof request.task==='string'?request.task:'',job=jobs.get(task);
   if(!job||fox().appletTask(task)!==GAME_FACTORY_APPLET)throw new WorldletError('Only the Game Factory\'s running task can save a game.');
   const replaces=job.replaces??job.saved;
   if(request.replaces!=null&&request.replaces!==replaces)throw new WorldletError('Save this task\'s game only'+(replaces?`: replaces "${replaces}".`:'; leave replaces out.'));
   const html=typeof request.html==='string'?request.html:'';
   let problems=checkMadeGameSource(html);
   if(!problems.length)problems=await tryMadeGame(madeGameDocument(html));
   if(problems.length)return {ok:false,problems,message:'Not saved yet. Fix every problem, then save the whole page again.'};
   const id=replaces??madeGameId(),previous=replaces?read(replaces):null;
   const record=madeGameRecord({title:request.title,blurb:request.blurb,color:request.color},{id,idea:job.idea,now:Date.now()/1000,previous});
   save(id,html,record);job.saved=id;
   if(player.current===id)player.stop();
   changed(id);
   return {ok:true,id,title:record.title,message:'Saved and tried: it loads, draws and plays without errors. It now leads the Games area. Tell the person it is ready in one short sentence.'};
  },
  madeGameSource:request=>{
   const task=typeof request.task==='string'?request.task:'';
   if(fox().appletTask(task)!==GAME_FACTORY_APPLET)throw new WorldletError('Only the Game Factory\'s running task can read a game.');
   return {id:request.id,html:source(String(request.id))};
  },
  madeGamePlayer:request=>{
   const operation=typeof request.operation==='string'?request.operation:'';
   if(operation==='hide'){player.stop();return {ok:true};}
   if(operation==='layout'){player.layout(request.rect??{});return {ok:true};}
   if(operation==='show'){
    const id=String(request.id??'');
    if(id===player.current){player.layout(request.rect??{});return {ok:true};}
    player.show(id,madeGameDocument(source(id)),request.rect??{});return {ok:true};
   }
   throw new WorldletError('Unknown game player operation.');
  },
  madeGameDelete:async request=>{
   personal();
   const id=String(request.id??''),game=validMadeGameId(id)?read(id):null;
   if(!game)throw new WorldletError('That game is not in this world.');
   const parent=host.window(),options={type:'warning' as const,message:`Delete “${game.title}”?`,detail:'The game is removed from this world. This cannot be undone.',buttons:['Delete','Cancel'],defaultId:1,cancelId:1};
   const answer=(parent?await dialog.showMessageBox(parent,options):await dialog.showMessageBox(options)).response;
   if(answer!==0)return {cancelled:true};
   if(player.current===id)player.stop();
   store.ledger().deleteMadeGame(id);
   changed(id);
   return {ok:true};
  }
 });
 host.onPageReload(()=>player.stop());
 host.onQuit(()=>player.stop());
}
