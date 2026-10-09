// Hermes Agent for a person with no Agent (owner decisions 2026-10-09: anyone without an Agent, Codex-only included,
// gets stock Hermes Agent and signs in to a model inside Hermes; a person who already has Hermes gets nothing installed;
// otherwise it is installed the official way, to the official default location, never into Worldlet's library).
// Shared rules only: which official installer, the stages it runs without a person (its stage protocol, the one the
// Hermes desktop installer drives), and what its own sign-in command prints. Downloading and running them is the
// host's (agent-runtime/hermes-official.ts). Kept ES-compatible for JavaScriptCore and Jint.

/** Hermes Agent's official installers (its README's Quick Install). */
export const HERMES_INSTALLERS=Object.freeze({posix:'https://hermes-agent.nousresearch.com/install.sh',windows:'https://hermes-agent.nousresearch.com/install.ps1'});

export interface HermesInstallerStage {name:string;title:string}
/** The stages of the installer's `--manifest` (protocol 1) that run without a person, in order: the ones that need
 * input (`hermes setup`, the gateway service) are left to Hermes itself. Throws when the manifest is not one. */
export function hermesInstallerStages(text:string):HermesInstallerStage[] {
 let value:any;
 try{value=JSON.parse(String(text??'').slice(String(text??'').indexOf('{')));}catch{value=null;}
 if(!value||value.protocol_version!==1||!Array.isArray(value.stages))throw new Error('The Hermes Agent installer did not describe its steps.');
 const stages:HermesInstallerStage[]=[];
 for(const stage of value.stages){
  if(!stage||typeof stage.name!=='string'||!/^[a-z][a-z-]{0,40}$/.test(stage.name))throw new Error('The Hermes Agent installer did not describe its steps.');
  if(stage.needs_user_input===true)continue;
  stages.push({name:stage.name,title:typeof stage.title==='string'&&stage.title.trim()?stage.title.trim().slice(0,80):stage.name});
 }
 if(!stages.length)throw new Error('The Hermes Agent installer did not describe its steps.');
 return stages;
}

/** The result frame a `--stage NAME --json` run printed last: whether the stage finished, and why not. */
export function hermesInstallerResult(text:string,stage:string):{ok:boolean;reason:string} {
 const lines=String(text??'').split(/\r?\n/).map(line=>line.trim()).filter(line=>line.charAt(0)==='{');
 for(let index=lines.length-1;index>=0;index--){
  let frame:any;
  try{frame=JSON.parse(lines[index]);}catch{continue;}
  if(!frame||frame.stage!==stage||typeof frame.ok!=='boolean')continue;
  return {ok:frame.ok,reason:typeof frame.reason==='string'?frame.reason.slice(0,300):''};
 }
 return {ok:false,reason:'it did not report how the step ended'};
}

const ANSI=new RegExp('\u001b\\[[0-9;]*[A-Za-z]','g');
/** What Hermes Agent's own ChatGPT sign-in (`hermes auth add openai-codex`) asks the person to open: the browser
 * authorization address, or the device page and the code to type there. Only OpenAI's own pages count. */
export function hermesSignInPrompt(text:string):{url:string;code:string|null}|null {
 const lines=String(text??'').replace(ANSI,'').split(/\r?\n/).map(line=>line.trim());
 let url:string|null=null,code:string|null=null;
 for(let index=0;index<lines.length;index++){
  const line=lines[index];
  if(!url&&/^https:\/\/auth\.openai\.com\/\S+$/.test(line))url=line;
  if(/^\d*\.?\s*Enter this code:?$/i.test(line)){const next=lines[index+1]??'';if(/^[A-Z0-9][A-Z0-9-]{3,19}$/.test(next))code=next;}
 }
 return url?{url,code}:null;
}

/** The model Hermes Agent answers with once ChatGPT is its provider: the one it already has when ChatGPT accepts it,
 * else the first ChatGPT model Hermes itself lists (ACP `session/new` `models`, "openai-codex:<model>", in Hermes'
 * own order). A vendor-prefixed name ("anthropic/…", the starter config's OpenRouter default) is never a ChatGPT
 * model. Null when Hermes lists none. */
export function hermesChatGptModel(current:unknown,available:unknown[]):string|null {
 const own=(id:unknown)=>typeof id==='string'&&/^openai-codex:[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id)?id.slice('openai-codex:'.length):null;
 const now=own(current);
 const listed=available.map(own).filter((id):id is string=>id!==null);
 if(now&&listed.indexOf(now)>=0)return now;
 return listed[0]??null;
}
