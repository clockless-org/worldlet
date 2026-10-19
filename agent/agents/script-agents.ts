import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import {looksSecret} from './agent-profile.ts';

/** Agents for scripts (agent/agents/GRANTS.md#agents-for-scripts): a daemon, a scheduled job or any program on this
 * computer that reaches the World as an Agent of its own, with its own token, Grants and audit, through an endpoint file
 * in the fixed MCP home. Pure: the host keeps the list and writes the files. */

/** The Harness an Agent for a script stands for. */
export const SCRIPT_HARNESS='script';
/** IDs an Agent for a script never takes: the Harnesses Worldlet knows, whose Agents keep these IDs. */
const RESERVED=new Set(['hermes','openclaw','claude-code','codex','pi','fox','person','worldlet',SCRIPT_HARNESS]);
export const SCRIPT_AGENT_LIMITS=Object.freeze({name:60,agents:20});
export const SCRIPT_AGENT_REASONS=Object.freeze({
 name:'Give it a name of one line, at most 60 characters, with a letter or digit in it.',
 secret:'A name may not hold a password, token or key.',
 full:`This World already has ${SCRIPT_AGENT_LIMITS.agents} Agents for scripts. Revoke one first.`,
});
const CONTROL=/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

/** The name the person gave, checked: one line, at most SCRIPT_AGENT_LIMITS.name characters. */
export function scriptAgentName(value:unknown):string {
 const name=typeof value==='string'?value.trim():'';
 if(!name||CONTROL.test(name)||[...name].length>SCRIPT_AGENT_LIMITS.name||!/[\p{L}\p{N}]/u.test(name))throw new Error(SCRIPT_AGENT_REASONS.name);
 if(looksSecret(name))throw new Error(SCRIPT_AGENT_REASONS.secret);
 return name;
}
/** A new Agent ID for `name`: its letters and digits in lowercase with `-` between words, never a Harness's ID nor one
 * already `taken` (a number is added), and `script` when the name has no Latin letters or digits. */
export function scriptAgentId(name:string,taken:readonly string[]):string {
 const base=name.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'')||SCRIPT_HARNESS;
 const used=new Set(taken);
 for(let n=1;;n++){
  const id=n===1?base:`${base}-${n}`;
  if(AGENT_ID_PATTERN.test(id)&&!used.has(id)&&!RESERVED.has(id))return id;
 }
}
