import {contextReader,contextWriter,mergeArtifact,orderArtifacts,readArtifact,validArtifactId,type Artifact} from '../../../../context/store/index.ts';
import {dailyScheduleFailure,dailyScheduleResult,type ScheduleResult} from '../../../../agent/gate/index.ts';
import {WorldletError} from '../../files.ts';
import {PHONE,type PhoneService} from '../../services.ts';
import type {Host,Row} from '../../types.ts';

/** Artifacts (context/store/ARTIFACTS.md). Every card Fox shows in this World, an Attention card or an explanation
 * from the conversation, is kept in the `artifacts` table so the person finds it again in the Artifacts page of
 * Fox's panel and Fox can bring it back. The practice world keeps none. */
export function installArtifacts(host:Host){
 const {store,page}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const all=():Artifact[]=>{
  if(!own())return [];
  try{return contextReader(store.context()).bodies('artifacts').flatMap(row=>{const artifact=readArtifact(row);return artifact?[artifact]:[];});}
  catch(error){host.diagnostics.record(error,'artifacts');return [];}
 };
 const changed=(id='')=>page.event('worldlet:artifacts',{id});
 /** A kept morning brief or day summary (`scheduled` with its `day`) also arrives as an Attention item that opens the
  * Journal on it, and on the phone while fresh. Core decides what it says (agent/gate/harness-schedule.ts). */
 function scheduledResult(kind:unknown,day:unknown,artifact:Artifact,at:number){
  if(kind!=='plan'&&kind!=='summary'||typeof day!=='string')return;
  keep(dailyScheduleResult({kind,day,artifact:artifact as any,at,now:Date.now()}));
 }
 function keep(result:ScheduleResult|null){
  try{
   if(!result)return;
   const id=contextWriter(store.context(),'fox').write<string[]>('attention-items',{save:[result.item as Row],with:{run:'worldlet-schedule'}})[0]??'';
   store.worldChanged();
   if(result.push&&id)void host.optional<PhoneService>(PHONE)?.notify({...result.push,open:{item:id},act:{attention:id}}).catch(()=>{});
  }catch(error){host.diagnostics.record(error,'artifacts');}
 }
 host.register({
  artifacts:async request=>{
   const operation=typeof request.operation==='string'?request.operation:'list';
   if(operation==='list')return {artifacts:orderArtifacts(all()).kept};
   if(operation==='get'){
    const id=String(request.id??'');
    return {artifact:validArtifactId(id)?all().find(a=>a.id===id)??null:null};
   }
   if(!own())throw new WorldletError('Artifacts are kept in your own world. The practice world keeps none.');
   if(operation==='save'){
    const now=Date.now()/1000,next=readArtifact({...(request.artifact as object),createdAt:now,updatedAt:now});
    if(!next)throw new WorldletError('That is not an artifact.');
    const list=all(),saved=mergeArtifact(list.find(a=>a.id===next.id),next,now);
    const {forget}=orderArtifacts([saved,...list.filter(a=>a.id!==saved.id)]);
    const context=contextWriter(store.context(),'fox');
    context.write('artifacts',{save:[saved as any],forget});context.remove('artifact-pages',forget);changed(saved.id);
    if(request.scheduled)scheduledResult(request.scheduled,request.day,saved,now*1000);
    return {ok:true,artifact:saved};
   }
   // Today's prep or Wrap up today ran and made no card: a Worth Doing item says so (core dailyScheduleFailure).
   if(operation==='scheduleFailed'){
    const kind=request.scheduled,day=request.day;
    if((kind==='plan'||kind==='summary')&&typeof day==='string')keep(dailyScheduleFailure({kind,day,reason:typeof request.reason==='string'?request.reason:'',at:Date.now(),now:Date.now()}));
    return {ok:true};
   }
   if(operation==='delete'){
    const id=String(request.id??'');
    if(!validArtifactId(id))throw new WorldletError('That is not an artifact.');
    const context=contextWriter(store.context(),'person');
    context.remove('artifacts',[id]);context.remove('artifact-pages',[id]);changed(id);
    return {ok:true};
   }
   throw new WorldletError('Unknown request.');
  },
 });
}
