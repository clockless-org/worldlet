import {readLinks,readStoredLink,saveLinks} from '../../../../../core/agent/index.ts';
import type {TrackedLink} from '../../../../../contracts/tracked-links.ts';
import type {Row} from './types.ts';

// Tracked links (core/agent/GRANTS.md#tracked-links). Core decides; this keeps the rows in the World's ledger
// (`state.tracked-links` in world.sqlite), all of one call's rows in one transaction. The changing Agent is always the
// one whose token made the call (world-tool-bridge.ts), never one the model names.

/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type LinkLedger={
 records(bucket:string):Row[];
 put(bucket:string,id:string,value:Row):void;
 transaction<T>(work:()=>T):T;
};
export interface TrackedLinks {
 /** One `world_links` call (`links/read`, `links/save`) by `agentId`, already admitted by its Grants. */
 call(agentId:string,args:Row):Row;
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';
export const TRACKED_LINKS_BUCKET='tracked-links';

export function createTrackedLinks({ledger,changed,now=()=>new Date().toISOString()}:{ledger:()=>LinkLedger|null;changed:()=>void;now?:()=>string}):TrackedLinks {
 const load=(db:LinkLedger)=>db.records(TRACKED_LINKS_BUCKET).flatMap(row=>{const link=readStoredLink(row);return link?[link]:[];});
 return {
  call(agentId,args){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   try{
    const {operation,...input}=args??{};
    if(operation==='read')return {links:readLinks(load(db),input),untrustedContent:true};
    if(operation==='save'){
     const saved=db.transaction(()=>{
      const rows:TrackedLink[]=saveLinks(load(db),agentId,input,now());
      for(const row of rows)db.put(TRACKED_LINKS_BUCKET,row.id,row as unknown as Row);
      return rows;
     });
     if(saved.length)changed();
     return {ok:true,saved:saved.map(row=>({id:row.id,revision:row.revision,state:row.state}))};
    }
    return {error:'Unknown links operation.'};
   }catch(error){return {error:error instanceof Error&&error.message?error.message:'Could not do that.'};}
  },
 };
}
