import {dialog} from 'electron';
import {artifactPage,readWidgetData,readyApplet,widgetWithData,WIDGET_APPLET,WIDGET_LIMITS,checkWidgetSource,mergeWidgetState,orderWidgets,readWidget,readWidgetConsole,readWidgetState,validWidgetId,widgetActive,widgetDocument,widgetHousekeeping,widgetId,widgetRecord,widgetStateChanges,widgetTask,widgetTrialProblems,widgetValues,type Widget,type WidgetState} from '../../../../../core/widgets/index.ts';
import {phoneWidgets} from '../../../../../core/phone/index.ts';
import {readArtifact,validArtifactId} from '../../../../../core/artifacts/index.ts';
import {WorldletError} from '../../files.ts';
import {FOX,PHONE,WIDGETS,type FoxService,type PhoneService,type WidgetsService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {Surface} from '../browser/surface.ts';
import {tryMadeGame} from '../games/trial.ts';
import {WidgetPlayer} from './player.ts';

/** One widget request in flight: the Applet task that works on it and what it may replace. */
interface Job {idea:string;replaces:string|null;saved:string|null;endsAt:string|null}
const MINUTE=60_000;

/** Widgets (core/widgets/README.md). Fox hands a widget to the Widgets Applet as an Applet task; its model saves
 * one HTML page, which is checked, tried at phone size and kept in this World's `widgets` table. A widget plays
 * in its own sandboxed view, stands at the top of Now and goes to the paired phone until its moment is over;
 * what the person ticks on either side is merged key by key and sent to the other. */
export function installWidgets(host:Host){
 const {store,page}=host;
 const fox=()=>host.use<FoxService>(FOX);
 const jobs=new Map<string,Job>();
 const now=()=>Date.now()/1000;
 const personal=()=>{if(!store.writable||store.sampleEnabled())throw new WorldletError('New Applets are made in your own world. The practice world has none.');};
 const rows=():{widget:Widget,state:WidgetState}[]=>{
  if(store.sampleEnabled())return [];
  try{return store.ledger().widgetRows().flatMap(row=>{const widget=readWidget(row.record);return widget?[{widget,state:readWidgetState(row.state)}]:[];});}
  catch(error){host.diagnostics.record(error,'widgets');return [];}
 };
 const find=(id:string)=>validWidgetId(id)?rows().find(row=>row.widget.id===id)??null:null;
 const rawPage=(id:string)=>{const value=store.ledger().widgetPage(id);if(value===null)throw new WorldletError('That Applet is not in this world.');return value;};
 // The page as it is shown, here and on the phone: with its data ahead of its own code (core/applets/MY-APPLETS.md#data-and-page).
 const html=(id:string)=>widgetWithData(rawPage(id),find(id)?.widget.data);
 const list=()=>orderWidgets(rows().map(row=>row.widget));

 // The phone gets the widgets for now, with their pages and state, whenever any of them changes.
 function publish(){
  const phone=host.optional<PhoneService>(PHONE);if(!phone||store.sampleEnabled())return;
  try{
   const t=now(),active=orderWidgets(rows().filter(row=>widgetActive(row.widget,t)).map(row=>row.widget));
   const states=new Map(rows().map(row=>[row.widget.id,row.state]));
   void phone.publish('widgets',phoneWidgets(active.map(widget=>({widget,html:html(widget.id),state:states.get(widget.id)??{}})),Date.now())).catch(error=>host.diagnostics.record(error,'widgets'));
  }catch(error){host.diagnostics.record(error,'widgets');}
 }
 // A made Applet's record changing changes the World itself: its device comes, goes or is renamed.
 const changed=(id:string,detail:Row={})=>{store.worldChanged();page.event('worldlet:widgets',{id,...detail});publish();};
 // Put away widgets whose moment is over; forget the ones put away long ago.
 function housekeeping(){
  if(store.sampleEnabled()||!store.writable)return;
  const t=now(),{archive,forget}=widgetHousekeeping(list(),t);
  for(const id of archive){const row=find(id);if(row){store.ledger().saveWidget(id,{...row.widget,archivedAt:Math.max(row.widget.endsAt,t-1)});if(player.current===id)player.stop();}}
  for(const id of forget){store.ledger().deleteWidget(id);if(player.current===id)player.stop();}
  if(archive.length||forget.length)changed(archive[0]??forget[0]);
 }
 // Prune jobs whose task ended (finished, failed or stopped).
 const prune=()=>{for(const id of jobs.keys())if(fox().appletTask(id)!==WIDGET_APPLET)jobs.delete(id);};
 function saveState(id:string,incoming:WidgetState){
  const row=find(id);if(!row||!Object.keys(incoming).length)return false;
  const merged=mergeWidgetState(row.state,incoming);if(!merged.changed)return false;
  store.ledger().saveWidget(id,row.widget,{state:merged.state});
  return merged.state;
 }
 const player=new WidgetPlayer(new Surface(host),(id,values)=>{
  try{
   const row=find(id);if(!row)return;
   if(saveState(id,widgetStateChanges(row.state,values,Date.now())))publish();
  }catch(error){host.diagnostics.record(error,'widgetState');}
 });

 // The World page builds a device for each made Applet whose moment is now (or that is pinned).
 const extras=store.snapshotExtras;
 store.snapshotExtras=()=>{
  const t=now(),momentApplets=list().filter(w=>widgetActive(w,t)).map(({id,title,blurb,color,endsAt,pinned,createdAt})=>({id,title,blurb,color,endsAt,pinned,createdAt}));
  return {...extras(),momentApplets};
 };
 host.provide<WidgetsService>(WIDGETS,{
  applyPhoneState(widget,incoming){
   if(!validWidgetId(widget))return;
   const state=saveState(widget,readWidgetState(incoming));
   if(!state)return;
   publish();
   if(player.current===widget)player.refresh(widget,html(widget),widgetValues(state));
  },
 });

 host.register({
  widgets:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'list';
   if(operation==='readData'){
    const row=find(String(request.id??''));if(!row)throw new WorldletError('That Applet is not in this world. Use list_made_applets for the IDs.');
    return {id:row.widget.id,title:row.widget.title,data:row.widget.data??null};
   }
   if(operation==='list'){
    housekeeping();
    const t=now(),all=list();
    const shape=({ideas:_ideas,data:_data,...widget}:Widget)=>widget;
    return {now:all.filter(w=>widgetActive(w,t)).map(shape),finished:all.filter(w=>!widgetActive(w,t)).map(shape)};
   }
   personal();
   // An artifact kept as an Applet (core/applets/MY-APPLETS.md): the card the person sees becomes one of their own
   // page Applets, kept with no end. The page renders the card's body; the artifact itself stays in its list.
   if(operation==='keepArtifact'){
    const artifact=validArtifactId(request.artifact)?store.ledger().artifactRows().map(readArtifact).find(a=>a?.id===request.artifact)??null:null;
    if(!artifact||artifact.kind!=='answer')throw new WorldletError('Only a card Fox laid out in conversation can be kept as an Applet.');
    const kept=list().find(w=>w.ideas.includes('artifact:'+artifact.id));
    if(kept){if(!kept.pinned||kept.archivedAt)store.ledger().saveWidget(kept.id,{...kept,pinned:true,archivedAt:null});changed(kept.id);return {ok:true,id:kept.id,title:kept.title,existing:true};}
    if(list().length>=WIDGET_LIMITS.widgets)throw new WorldletError(`This world already has ${WIDGET_LIMITS.widgets} Applets made from pages. Delete one first.`);
    const html=artifactPage({title:artifact.title,origin:'Kept from a conversation with Fox',fragment:request.html});
    const problems=checkWidgetSource(html);if(problems.length)throw new WorldletError('This card could not become an Applet: '+problems[0]);
    const t=now(),id=widgetId(),record={...widgetRecord({title:artifact.title,blurb:'Kept from a conversation with Fox'},{id,idea:'artifact:'+artifact.id,now:t}),pinned:true};
    store.ledger().saveWidget(id,record,{html,state:{}});changed(id,{made:true});
    return {ok:true,id,title:record.title};
   }
   const id=String(request.id??''),row=find(id);
   if(!row)throw new WorldletError('That Applet is not in this world.');
   const save=(widget:Widget)=>{store.ledger().saveWidget(id,widget);changed(id);return {ok:true};};
   if(operation==='pin')return save({...row.widget,pinned:true,archivedAt:null});
   // Fox updates what the page shows without rewriting it; the page loads again with it, here and on the phone.
   if(operation==='data'){
    const read=readWidgetData(request.data);if('error' in read)throw new WorldletError(read.error);
    const widget={...row.widget,data:read.data,updatedAt:now(),version:row.widget.version+1};
    store.ledger().saveWidget(id,widget);
    if(player.current===id)player.refresh(id,html(id),widgetValues(row.state),{page:true});
    changed(id);
    return {ok:true,id,title:widget.title,message:`“${widget.title}” shows the new data now, on the computer and the phone.`};
   }
   // Unpinned, a widget past its end is put away at once.
   if(operation==='unpin'){const t=now();return save({...row.widget,pinned:false,archivedAt:t>=row.widget.endsAt?t:null});}
   if(operation==='archive'){if(player.current===id)player.stop();return save({...row.widget,pinned:false,archivedAt:now()});}
   if(operation==='delete'){
    const parent=host.window(),options={type:'warning' as const,message:`Delete “${row.widget.title}”?`,detail:'The Applet is removed from this world and from your phone. This cannot be undone.',buttons:['Delete','Cancel'],defaultId:1,cancelId:1};
    const answer=(parent?await dialog.showMessageBox(parent,options):await dialog.showMessageBox(options)).response;
    if(answer!==0)return {cancelled:true};
    if(player.current===id)player.stop();
    store.ledger().deleteWidget(id);changed(id);
    return {ok:true};
   }
   throw new WorldletError('Unknown Applet request.');
  },
  widgetStart:async request=>{
   personal();prune();
   const idea=typeof request.idea==='string'?request.idea.trim():'';
   if(!idea||[...idea].length>1200||typeof request.request!=='string')throw new WorldletError('Say what the Applet is for.');
   const replaces=request.replaces==null?null:String(request.replaces),previous=replaces?find(replaces)?.widget??null:null;
   if(replaces&&!previous)throw new WorldletError('That Applet is not in this world. Use list_made_applets for the IDs.');
   if(!replaces&&list().length>=WIDGET_LIMITS.widgets)throw new WorldletError(`Fox already made ${WIDGET_LIMITS.widgets} Applets in this world. Ask the person to delete one first.`);
   const timeZone=typeof request.timeZone==='string'&&request.timeZone.length<=60?request.timeZone:undefined;
   const endsAt=typeof request.endsAt==='string'?request.endsAt.slice(0,40):null;
   // A ready-made Applet is added at once: its page was written and checked with Worldlet, so no task writes one.
   if(request.ready!=null){
    const ready=readyApplet(request.ready);if(!ready)throw new WorldletError('There is no such ready-made Applet.');
    const t=now(),existing=list().find(w=>w.title===ready.title&&widgetActive(w,t));
    if(checkWidgetSource(ready.html).length)throw new WorldletError('That ready-made Applet could not be added.');
    if(existing){
     // A copy added before its page was redrawn takes the new page and keeps what was ticked.
     if(store.ledger().widgetPage(existing.id)!==ready.html){
      const record=widgetRecord({title:existing.title,blurb:ready.blurb,color:ready.color},{id:existing.id,idea,now:t,previous:existing});
      store.ledger().saveWidget(existing.id,record,{html:ready.html});
      if(player.current===existing.id)player.refresh(existing.id,ready.html,widgetValues(find(existing.id)?.state??{}),{page:true});
      changed(existing.id);
     }
     return {ok:true,id:existing.id,title:existing.title,message:`“${existing.title}” is already in their World. Tell them in one short sentence that it is there.`};
    }
    // With no end given it lasts the rest of the local day: a museum day, not twelve hours from now.
    const evening=new Date();evening.setHours(23,59,0,0);
    const id=widgetId(),record=widgetRecord({title:ready.title,blurb:ready.blurb,color:ready.color,endsAt:endsAt??evening.toISOString()},{id,idea,now:t});
    store.ledger().saveWidget(id,record,{html:ready.html,state:{}});
    changed(id,{made:true});
    return {ok:true,id,title:record.title,message:`“${record.title}” is now a new Applet in their World (on the Home ground), at the top of Now and on the paired phone. It puts itself away when its moment is over. Tell the person in one short sentence that it is ready.`};
   }
   const task=widgetTask(endsAt?`${idea}\n(It ends ${endsAt}.)`:idea,{previous,now:now(),timeZone});
   const result=fox().startAppletTask({applet:WIDGET_APPLET,task,request:request.request,...typeof request.parent==='string'?{parent:request.parent}:{}});
   if(typeof result.id==='string')jobs.set(result.id,{idea,replaces,saved:null,endsAt});
   return result;
  },
  widgetSave:async request=>{
   personal();
   const task=typeof request.task==='string'?request.task:'',job=jobs.get(task);
   if(!job||fox().appletTask(task)!==WIDGET_APPLET)throw new WorldletError('Only the Applet-making task can save a new Applet.');
   const replaces=job.replaces??job.saved;
   if(request.replaces!=null&&request.replaces!==replaces)throw new WorldletError('Save this task\'s widget only'+(replaces?`: replaces "${replaces}".`:'; leave replaces out.'));
   const source=typeof request.html==='string'?request.html:'';
   const read=request.data==null?null:readWidgetData(request.data);
   if(read&&'error' in read)return {ok:false,problems:[read.error],message:'Not saved yet. Fix every problem, then save the whole page again.'};
   const data=read&&'data' in read?{data:read.data}:null;
   let problems=checkWidgetSource(source);
   if(!problems.length)problems=await tryMadeGame(widgetDocument(widgetWithData(source,data?.data),{state:{}}),{width:390,height:844,read:readWidgetConsole,problems:widgetTrialProblems});
   if(problems.length)return {ok:false,problems,message:'Not saved yet. Fix every problem, then save the whole page again.'};
   const id=replaces??widgetId(),previous=replaces?find(replaces):null;
   const record=widgetRecord({title:request.title,blurb:request.blurb,color:request.color,endsAt:request.endsAt??job.endsAt,...data?{data:data.data}:{}},{id,idea:job.idea,now:now(),previous:previous?.widget});
   // A changed page keeps what the person already ticked.
   store.ledger().saveWidget(id,record,{html:source,...previous?{}:{state:{}}});
   job.saved=id;
   if(player.current===id)player.refresh(id,html(id),widgetValues(previous?.state??{}),{page:true});
   changed(id,{made:!previous});
   return {ok:true,id,title:record.title,message:`Saved and tried at phone size: it loads and draws without errors. “${record.title}” is now a new Applet in their World (on the Home ground), at the top of Now and on the paired phone${previous?'':'. It puts itself away when its moment is over'}. Tell the person in one short sentence that their new Applet is ready.`};
  },
  widgetSource:request=>{
   const task=typeof request.task==='string'?request.task:'';
   if(fox().appletTask(task)!==WIDGET_APPLET)throw new WorldletError('Only the Applet-making task can read a made Applet.');
   const id=String(request.id??'');if(!find(id))throw new WorldletError('That Applet is not in this world.');
   return {id,html:rawPage(id),data:find(id)?.widget.data??null};
  },
  widgetPlayer:request=>{
   const operation=typeof request.operation==='string'?request.operation:'';
   if(operation==='hide'){player.stop();return {ok:true};}
   if(operation==='layout'){player.layout(request.rect??{});return {ok:true};}
   if(operation==='show'){
    const id=String(request.id??''),row=find(id);
    if(!row)throw new WorldletError('That Applet is not in this world.');
    if(id===player.current){player.layout(request.rect??{});return {ok:true};}
    player.show(id,html(id),widgetValues(row.state),request.rect??{});return {ok:true};
   }
   throw new WorldletError('Unknown Applet page request.');
  },
 });
 // A widget's end passes while the app runs: Now and the phone follow within a minute.
 const clock=setInterval(()=>{try{housekeeping();}catch(error){host.diagnostics.record(error,'widgets');}},MINUTE);
 host.onPageLoaded(()=>{try{housekeeping();publish();}catch(error){host.diagnostics.record(error,'widgets');}});
 host.onPageReload(()=>player.stop());
 host.onQuit(()=>{clearInterval(clock);player.stop();});
}
