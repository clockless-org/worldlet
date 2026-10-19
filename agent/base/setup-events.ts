// Setup's product events for people who bring their own Agent (agent/base/ANALYTICS.md#bringing-an-agent):
// which supported Agent, coarse counts and outcomes only. Never a name, title, path or text.
import {LOCAL_HARNESSES} from '../gate/index.ts';

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
/** `agent_profile_result`: whether the chosen Agent described itself (agent/gate/agent-profile.ts) and how many
 * connections it reported. */
export function agentProfileDimensions(agent:string,result:string,connections:number):Record<string,string> {
 return {local_agent:agent,profile_result:result,bring_connections:countBucket(connections)};
}
/** Setup without an Agent (agent/gate/hermes-setup.ts): Worldlet installs Hermes Agent, then ChatGPT is signed in inside
 * it. `hermes_setup` is which half (`terminal`: the person ran the official installer in a window Worldlet opened after
 * the quiet one failed); a failure says, as fixed words, where it stopped (`hermes_failure`), the installer's step it was
 * on (`install_step`, `0` before the first one), that step by name (`hermes_stage`) and why (`hermes_reason`), never the
 * error text. */
export const HERMES_SETUP=['install','sign_in','terminal'] as const;
export const HERMES_FAILURES=['command_line_tools','download','manifest','stage','not_found','timeout','cancelled','not_started','no_model','other'] as const;
export const INSTALL_STEPS=['0','1','2','3','4','5','6','7','8','9','10_plus'] as const;
/** The installer's stages (its `--manifest`), told apart by the titles it gives them; `products` is titled after what
 * it installs. */
const STAGE_TITLES:[RegExp,string][]=[
 [/^System prerequisites$/,'prerequisites'],[/^Download Hermes Agent$/,'repository'],[/^Create Python environment$/,'venv'],
 [/^Install Python dependencies$/,'python_deps'],[/^Prepare config and skills$/,'config'],[/^Install command and app/,'products'],
 [/^Build desktop app$/,'desktop'],[/^Finish install$/,'complete'],
];
export const HERMES_STAGES=[...STAGE_TITLES.map(([,stage])=>stage),'other'] as const;
/** Why a stage stopped, from the reason its result frame gave: mostly the installer's own failure classes
 * (`Fail "…" python_install_failed`), which it keeps out of the frame, recognized by their fixed messages; then what
 * Windows or the shell said. A Windows person stopped eight times at Create Python environment (Beta 4384,
 * 2026-10-13) reached PostHog only as `stage`. */
const STAGE_REASONS:[RegExp,string][]=[
 [/took too long|stopped making progress/,'timeout'],
 [/bootstrap python/,'python_install_failed'],
 [/dependency install failed|pm install failed/,'deps_install_failed'],
 [/digest mismatch/,'download_digest_mismatch'],
 [/failed to download/,'download_failed'],
 [/pinned uv|uv\.exe not found|uv binary not found|uv archive/,'uv_unusable'],
 [/git is required|curl is required/,'tool_missing'],
 [/not a hermes git checkout/,'dir_not_checkout'],
 [/local changes|unmerged index/,'local_changes_blocked'],
 [/\bgit (?:clone|fetch|checkout|reset)\b|self-extractor|fetching directory history|fast-forwarding|commit .* is not on branch|could not (?:check out|pin commit)/,'git_failed'],
 [/app products|command publication/,'products_build_failed'],
 [/path (?:is )?too long|pathtoolong/,'path_too_long'],
 [/not enough (?:disk )?space|disk (?:is )?full|no space left/,'disk_full'],
 [/access (?:to the path .*)?is denied|unauthorizedaccess|permission denied|being used by another process/,'access_denied'],
 [/cannot find (?:path|the (?:path|file))|could not find (?:a part of )?the path|does not exist|not recognized as|no such file/,'missing_file'],
 [/cannot (?:move|replace|stage|publish|update path)/,'filesystem_error'],
 [/did not report how the step ended|stopped with code/,'no_report'],
];
export const HERMES_REASONS=[...new Set(STAGE_REASONS.map(([,reason])=>reason)),'other'] as const;
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
 // platform hermes-official.ts: "Hermes Agent could not be installed. … (<stage title>: <reason>)", or "(<reason>)"
 // when the installer did not list its stages.
 const detail=/could not be installed\.[^(]*\((.*)\)\s*$/s.exec(message)?.[1];
 if(detail===undefined)return {...dimensions,hermes_failure:failure};
 const titled=/^([^:]{1,80}): (.*)$/s.exec(detail);
 const stage=titled?STAGE_TITLES.find(([pattern])=>pattern.test(titled[1].trim()))?.[1]??'other':null;
 const said=(titled&&stage!=='other'?titled[2]:detail).toLowerCase();
 const reason=STAGE_REASONS.find(([pattern])=>pattern.test(said))?.[1]??'other';
 return {...dimensions,hermes_failure:failure,...stage?{hermes_stage:stage}:{},hermes_reason:reason};
}
