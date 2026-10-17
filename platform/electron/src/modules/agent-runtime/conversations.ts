import {readConversationAdd,readConversationSearch} from '../../../../../core/agent/index.ts';
import type {Row} from './types.ts';

// The conversation archive (core/agent/GRANTS.md#conversation-archive). Core checks and cleans; this keeps the messages
// in the World's ledger (`agent_conversations` in world.sqlite, with its search index). The saving Agent is always the
// one whose token made the call (world-tool-bridge.ts), never one the model names.

/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type ArchiveLedger={
 addArchivedMessages(source:string,messages:Row[],agentId:string,savedAt:string):{added:number;updated:number;unchanged:number};
 searchArchivedMessages(search:Row):{messages:Row[];total:number};
};
export interface ConversationArchive {
 /** One `world_conversations` call (`conversations/add`, `search`) by `agentId`, already admitted by its Grants. */
 call(agentId:string,args:Row):Row;
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';

export function createConversationArchive({ledger,now=()=>new Date().toISOString()}:{ledger:()=>ArchiveLedger|null;now?:()=>string}):ConversationArchive {
 return {
  call(agentId,args){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   try{
    const {operation,...input}=args??{};
    if(operation==='add'){
     const {source,messages}=readConversationAdd(input);
     return {ok:true,source,...db.addArchivedMessages(source,messages as unknown as Row[],agentId,now())};
    }
    if(operation==='search'){
     const {messages,total}=db.searchArchivedMessages(readConversationSearch(input) as Row);
     return {messages,total,untrustedContent:true};
    }
    return {error:'Unknown conversations operation.'};
   }catch(error){return {error:error instanceof Error&&error.message?error.message:'Could not do that.'};}
  },
 };
}
