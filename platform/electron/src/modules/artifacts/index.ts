import {mergeArtifact,orderArtifacts,readArtifact,validArtifactId,type Artifact} from '../../../../../core/artifacts/index.ts';
import {WorldletError} from '../../files.ts';
import type {Host} from '../../host/types.ts';

/** Artifacts (core/artifacts/README.md). Every card Fox shows in this World, an Attention card or an explanation
 * from the conversation, is kept in the `artifacts` table so the person finds it again in the Artifacts page of
 * Fox's panel and Fox can bring it back. The practice world keeps none. */
export function installArtifacts(host:Host){
 const {store,page}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const all=():Artifact[]=>{
  if(!own())return [];
  try{return store.ledger().artifactRows().flatMap(row=>{const artifact=readArtifact(row);return artifact?[artifact]:[];});}
  catch(error){host.diagnostics.record(error,'artifacts');return [];}
 };
 const changed=(id='')=>page.event('worldlet:artifacts',{id});
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
    store.ledger().saveArtifacts([saved as any],forget);if(forget.length)store.ledger().deleteArtifactPages(forget);changed(saved.id);
    return {ok:true,artifact:saved};
   }
   if(operation==='delete'){
    const id=String(request.id??'');
    if(!validArtifactId(id))throw new WorldletError('That is not an artifact.');
    store.ledger().saveArtifacts([],[id]);store.ledger().deleteArtifactPages([id]);changed(id);
    return {ok:true};
   }
   throw new WorldletError('Unknown request.');
  },
 });
}
