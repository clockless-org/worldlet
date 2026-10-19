import crypto from 'node:crypto';
import {artifactId,readArtifact,type Artifact} from '../../../../context/store/index.ts';
import {findAgentArtifacts,readAgentArtifactRead,readAgentArtifactSave,saveAgentArtifact} from '../../../../agent/gate/index.ts';
import type {Row} from './types.ts';

// Agent artifacts (agent/gate/GRANTS.md#agent-artifacts). Core checks and decides; this keeps each artifact in the World's
// `artifacts` table (world.sqlite), where the Journal lists it like every other artifact, and tells the page it changed.

/** The World's ledger, while it is the person's own World (not the practice World), writable, with private context. */
export type ArtifactLedger={artifactRows():Row[];saveArtifacts(save:Row[],forget?:string[]):void;deleteArtifactPages(ids:string[]):void};
export interface AgentArtifacts {
 /** One `agent_artifacts` call (`agent-artifacts/save`, `agent-artifacts/read`) by `agentId`, already admitted by its
  * Grants. `readsAll` says whether they let it read every Agent's artifacts ("Can read Agents' Journal artifacts"); without it a
  * read returns only its own. */
 call(agentId:string,args:Row,readsAll:boolean):Row;
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';
/** A keyed artifact's ID: the same Agent and key always name the same artifact, and nothing else can be told from it. */
export const agentArtifactId=(agentId:string,key:string)=>'art-'+crypto.createHash('sha256').update(agentId+'\n'+key).digest('hex').slice(0,12);

export function createAgentArtifacts({ledger,name,changed,clock=()=>Date.now(),newId=()=>artifactId()}:
 {ledger:()=>ArtifactLedger|null;name:(agentId:string)=>string;changed:(id:string)=>void;clock?:()=>number;newId?:()=>string}):AgentArtifacts {
 const load=(db:ArtifactLedger):Artifact[]=>db.artifactRows().flatMap(row=>{const artifact=readArtifact(row);return artifact?[artifact]:[];});
 const failure=(error:unknown)=>({error:error instanceof Error&&error.message?error.message:'Could not do that.'});
 return {
  call(agentId,args,readsAll){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   const {operation,...input}=args??{};
   try{
    if(operation==='save'){
     const save=readAgentArtifactSave(input),list=load(db);
     const {artifact,forget}=saveAgentArtifact(list,save,{agentId,agentName:name(agentId),id:save.key?agentArtifactId(agentId,save.key):newId(),now:clock()/1000});
     db.saveArtifacts([artifact as unknown as Row],forget);
     if(forget.length)db.deleteArtifactPages(forget);
     changed(artifact.id);
     return {ok:true,id:artifact.id,savedAt:new Date(artifact.updatedAt*1000).toISOString(),guidance:'The person sees this artifact in their Journal. Save again with the same key to replace it.'};
    }
    if(operation==='read')return {artifacts:findAgentArtifacts(load(db),readAgentArtifactRead(input),readsAll?undefined:agentId),untrustedContent:true};
    return {error:'Unknown artifact operation.'};
   }catch(error){return failure(error);}
  },
 };
}
