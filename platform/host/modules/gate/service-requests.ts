import {answerServiceRequest,readServiceRequest,serviceRequestDue,serviceRequestItem,serviceRequestRefusal,type ServiceRequest} from '../../../../agent/gate/index.ts';
import {connector} from '../../../../context/connectors/index.ts';
import type {AgentAccess} from '../../services.ts';
import {contextReader,contextWriter} from '../../../../context/store/index.ts';
import {ledgerContext} from '../../store/context-storage.ts';
import type {Row} from '../companion/agent/types.ts';

// When an Agent first needs a Service (agent/gate/GRANTS.md#when-an-agent-first-needs-a-service). Core decides; this
// keeps each request in the World's ledger (`state.service-requests`) beside its Attention card (provider `agents`),
// written together with no model, and answers the card: Allow gives the read Grant, Not now leaves it.

/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type ServiceRequestLedger={
 serviceRequests():Row[];
 saveServiceRequest(request:Row,item:Row,origin:'user'|'agent'):void;
};
export interface ServiceRequests {
 /** An Agent's `read_service` call was refused for `provider`: puts the card in Attention when one is due, and answers
  * what the refusal should say after its reason ('' when nothing). */
 asked(agent:{id:string;name:string},provider:string):string;
 /** The person's answer on the card (`serviceRequest`): `allow` or `decline` with its ID. Only this computer's pages. */
 answer(request:Row):Row;
}

export function createServiceRequests({ledger,access,connected,title,changed,now=()=>new Date().toISOString()}:
 {ledger:()=>ServiceRequestLedger|null;access:()=>AgentAccess|null;connected:(provider:string)=>boolean;title:(provider:string)=>string;changed:()=>void;now?:()=>string}):ServiceRequests {
 // A Service that signs in is connected from the card itself; one that takes a key, under Settings › Services.
 const signsIn=(provider:string)=>['mcp-oauth','google'].includes(connector(provider)?.mechanism??'');
 const load=(db:ServiceRequestLedger)=>contextReader(ledgerContext(db)).bodies('service-requests').flatMap(row=>{const request=readServiceRequest(row);return request?[request]:[];});
 // Through the one way in to Context (#676): who writes decides whether the item's status is the person's. A request is
 // written by the World on a refused call's behalf (the Agent's call was not admitted, so it writes nothing itself); its
 // record still names the Agent.
 const save=(db:ServiceRequestLedger,request:ServiceRequest,origin:'user'|'world')=>contextWriter(ledgerContext(db),origin==='user'?'person':'world')
  .write('service-requests',{save:[request as unknown as Row],with:{item:serviceRequestItem(request,title(request.provider),{signIn:signsIn(request.provider),region:connector(request.provider)?.region}) as unknown as Row}});
 return {
  asked(agent,provider){
   try{
    const db=ledger();
    if(!db)return '';
    const previous=load(db).find(item=>item.agentId===agent.id&&item.provider===provider)??null,linked=connected(provider);
    const due=serviceRequestDue(previous,agent,provider,linked,now());
    if(due){save(db,due,'world');changed();return serviceRequestRefusal(title(provider),linked,true);}
    return previous?.status==='pending'?serviceRequestRefusal(title(provider),linked,false):'';
   }catch{return '';}
  },
  answer(request){
   const db=ledger();
   if(!db)throw new Error('Worldlet is not ready for this yet: the person has not finished setting up their own World.');
   const outcome=request?.operation==='allow'?'allow':request?.operation==='decline'?'decline':null;
   if(!outcome)throw new Error('Unknown request operation.');
   const found=load(db).find(item=>item.id===request.id);
   const next=answerServiceRequest(found,outcome,found?connected(found.provider):false,now());
   if(outcome==='allow'){
    const agents=access();
    // The same Grant as "Can read" in Settings › Agents, audited the same way.
    if(!agents||!agents.grantService(next.agentId,next.provider))throw new Error('Could not change that. The Agent may have been revoked.');
   }
   save(db,next,'user');changed();
   return {ok:true,status:next.status};
  },
 };
}
