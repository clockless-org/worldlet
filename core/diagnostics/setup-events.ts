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
/** `agent_profile_result`: whether the chosen Agent described itself (core/agent/agent-profile.ts) and how many
 * connections it reported. */
export function agentProfileDimensions(agent:string,result:string,connections:number):Record<string,string> {
 return {local_agent:agent,profile_result:result,bring_connections:countBucket(connections)};
}
/** Setup without an Agent (core/agent/hermes-setup.ts): Worldlet installs Hermes Agent, then ChatGPT is signed in inside
 * it. `hermes_setup` is which half; a failure says, as a fixed word, where it stopped (`hermes_failure`) and the
 * installer's step it was on (`install_step`, `0` before the first one), never the error text. */
export const HERMES_SETUP=['install','sign_in'] as const;
export const HERMES_FAILURES=['command_line_tools','download','manifest','stage','not_found','timeout','cancelled','not_started','no_model','other'] as const;
export const INSTALL_STEPS=['0','1','2','3','4','5','6','7','8','9','10_plus'] as const;
export function hermesSetupDimensions(part:typeof HERMES_SETUP[number],step:number,error?:unknown):Record<string,string> {
 const at=Number.isInteger(step)&&step>0?step:0;
 const dimensions:Record<string,string>={hermes_setup:part,install_step:at>=10?'10_plus':String(at)};
 if(error===undefined)return dimensions;
 const message=String((error as {message?:unknown})?.message??error??'');
 const failure=/Command Line Tools/.test(message)?'command_line_tools'
  :/took too long|stopped making progress/.test(message)?'timeout'
  :/cancel/i.test(message)?'cancelled'
  :/did not start|not on this computer/.test(message)?'not_started'
  :/lists no ChatGPT model|could not use ChatGPT/.test(message)?'no_model'
  :/could not be installed/.test(message)?(/\(/.test(message)?(at?'stage':'manifest'):(at?'not_found':'download'))
  :'other';
 return {...dimensions,hermes_failure:failure};
}
