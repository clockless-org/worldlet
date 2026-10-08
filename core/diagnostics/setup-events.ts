// Setup's product events for people who bring their own Agent (core/diagnostics/ANALYTICS.md#bringing-an-agent):
// which supported Agent, coarse counts and outcomes only. Never a name, title, path or text.
import {LOCAL_HARNESSES} from '../agent/index.ts';

/** Coarse counts, the only form an amount from setup leaves the device in. */
export const COUNT_BUCKETS=['0','1_9','10_99','100_999','1000_plus'] as const;
export function countBucket(n:unknown):string {
 const value=typeof n==='number'&&Number.isFinite(n)&&n>0?Math.floor(n):0;
 return value===0?'0':value<10?'1_9':value<100?'10_99':value<1000?'100_999':'1000_plus';
}
/** The supported local Agents, by their public product IDs. */
export const LOCAL_AGENT_IDS:string[]=LOCAL_HARNESSES.map(harness=>harness.id);
export const AGENTS_FOUND=['0','1','2','3_plus'] as const;
/** `local_agents_detected`: how many supported Agents this computer has and which one setup recommends. */
export function agentsDetectedDimensions(found:{id:string}[],recommended:string|null):Record<string,string> {
 const n=found.length;
 return {agents_found:n>=3?'3_plus':String(n),recommended_agent:recommended&&LOCAL_AGENT_IDS.includes(recommended)?recommended:'none'};
}
/** `agent_bring_completed`: how much came along and whether its model and integrations did. */
export function agentBringDimensions(agent:string,brought:{conversations?:number,notes?:number,skills?:number,routines?:number,model?:boolean,memory?:boolean},integrations:{outcome?:string}[]=[]):Record<string,string> {
 const outcomes=integrations.map(item=>item?.outcome);
 return {
  local_agent:agent,
  bring_conversations:countBucket(brought.conversations),bring_notes:countBucket(brought.notes),bring_skills:countBucket(brought.skills),bring_routines:countBucket(brought.routines),
  bring_model:brought.model?'yes':'no',bring_memory:brought.memory?'yes':'no',
  integrations_came_over:countBucket(outcomes.filter(o=>o==='ported').length),
  integrations_reconnect:countBucket(outcomes.filter(o=>o==='reconnect').length)
 };
}
