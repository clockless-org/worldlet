import {agentLiveness,listAgents,makeAgentReport,readStoredReport} from '../../../../../agent/agents/index.ts';
import type {AgentIdentity} from '../../../../../contracts/agent-identity.ts';
import type {AgentListEntry,AgentLiveness,AgentReport} from '../../../../../contracts/agent-reports.ts';
import type {Row} from './types.ts';

// Agent reports (agent/agents/GRANTS.md#agent-reports). Core decides; this keeps each Agent's one report in the World's
// ledger (`state.agent-reports` in world.sqlite, keyed by the Agent). The calling Agent is always the one whose token
// made the call (world-tool-bridge.ts), never one the model names. No model is involved.

/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type ReportLedger={agentReports():Row[];saveAgentReport(report:Row):void};
export interface AgentReports {
 /** One `agent_reports` call (`agents/report`, `agents/list`) by `agentId`, already admitted by its Grants. */
 call(agentId:string,args:Row):Row;
 /** Every Agent the person has not revoked with its report, as `agents/list` answers, for the board's `agents` source
  * (context/board/README.md#the-agents-source): null outside the person's own World. */
 list():AgentListEntry[]|null;
 /** One Agent's report and how it reads now, for Settings › Agents: none outside the person's own World. */
 state(agentId:string):{liveness:AgentLiveness;report?:AgentReport};
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';

export function createAgentReports({ledger,identities,now=()=>new Date().toISOString()}:{ledger:()=>ReportLedger|null;identities:()=>AgentIdentity[];now?:()=>string}):AgentReports {
 const load=(db:ReportLedger)=>db.agentReports().flatMap(row=>{const report=readStoredReport(row);return report?[report]:[];});
 return {
  call(agentId,args){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   try{
    const at=now(),{operation,...input}=args??{};
    if(operation==='report'){
     const report=makeAgentReport(agentId,input,at);
     db.saveAgentReport(report as unknown as Row);
     return {ok:true,liveness:agentLiveness(report,at),guidance:`The person and the Agents allowed to see other Agents now see this. Report again within ${report.ttlMinutes} minutes while it holds, or it reads stale; report offline when stopping.`};
    }
    if(operation==='list')return {agents:listAgents(identities(),load(db),input,at),untrustedContent:true};
    return {error:'Unknown agents operation.'};
   }catch(error){return {error:error instanceof Error&&error.message?error.message:'Could not do that.'};}
  },
  list(){
   let db:ReportLedger|null=null;try{db=ledger();}catch{}
   return db?listAgents(identities(),load(db),{},now()):null;
  },
  state(agentId){
   let db:ReportLedger|null=null;try{db=ledger();}catch{}
   if(!db)return {liveness:'offline'};
   const report=load(db).find(item=>item.agentId===agentId);
   return {liveness:agentLiveness(report,now()),...report?{report}:{}};
  },
 };
}
