// The `tools` Harness service (contracts/harness-services.ts HarnessTools): what the person's own Agent can do beyond
// World tools, read from its own settings so Fox can offer it (owner parity plan 2026-10-07, item 10: "Fox offers a
// phone call through the person's OpenClaw voice-call plugin"). Only what a Fox turn on that Harness can really call
// is listed; calls stay inside the Harness under its own approvals. The host reads the files read-only; these are the
// rules. Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessTool} from '../../contracts/harness-services.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const list=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()).map(item=>item.trim()):typeof value==='string'&&value.trim()?[value.trim()]:[];

// OpenClaw ------------------------------------------------------------------------------------

/** Tools worth offering, in the order Fox names them (docs.openclaw.ai/tools; group ids from its tool policy). */
const OPENCLAW_TOOLS:readonly (HarnessTool&{groups:string[]})[]=[
 {name:'image_generate',title:'generate images',kind:'media',groups:['group:media','group:openclaw']},
 {name:'music_generate',title:'generate music',kind:'media',groups:['group:media','group:openclaw']},
 {name:'video_generate',title:'generate videos',kind:'media',groups:['group:media','group:openclaw']},
 {name:'tts',title:'speak text aloud',kind:'media',groups:['group:media','group:openclaw']},
 {name:'browser',title:'use its own browser',kind:'web',groups:['group:ui','group:openclaw']},
 {name:'exec',title:'run commands on this computer',kind:'shell',groups:['group:runtime']},
 {name:'sessions_spawn',title:'hand work to sub-agents',kind:'other',groups:['group:sessions','group:agents','group:openclaw']},
];
/** `tools.profile` base allowlists; `full` (and no profile) filters nothing. */
const OPENCLAW_PROFILES:Record<string,string[]>={
 minimal:[],
 coding:['group:runtime','group:sessions','image_generate','music_generate','video_generate'],
 messaging:['sessions_spawn'],
};
const pattern=(rule:string)=>new RegExp('^'+rule.toLowerCase().replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$');
const matches=(rules:string[],tool:{name:string;groups:string[]})=>rules.some(rule=>{const r=pattern(rule);return r.test(tool.name)||tool.groups.some(group=>r.test(group))||rule.toLowerCase()==='bash'&&tool.name==='exec';});
/** Plugins that give the Agent a capability Fox can offer, by plugin id (`plugins.entries.<id>`). */
const OPENCLAW_PLUGINS:Record<string,HarnessTool>={
 'voice-call':{name:'voice_call',title:'make phone calls (voice-call plugin)',kind:'call'},
};

/** What a turn of the person's OpenClaw can call, from `openclaw.json`: built-in tools the profile, `tools.allow` and
 * `tools.deny` leave (deny wins, `*` wildcards, groups), plus enabled capability plugins (`plugins.entries`, minus
 * `plugins.deny`, within `plugins.allow` when set) whose tool the policy allows (docs.openclaw.ai tool policy). */
export function openClawHarnessTools(config:unknown):HarnessTool[] {
 const root=record(config),tools=record(root.tools),plugins=record(root.plugins);
 const profile=typeof tools.profile==='string'?tools.profile.trim().toLowerCase():'';
 const base=OPENCLAW_PROFILES[profile],allow=list(tools.allow),deny=list(tools.deny);
 const found:HarnessTool[]=[];
 for(const tool of OPENCLAW_TOOLS){
  if(base&&!matches(base,tool)&&!matches(list(tools.alsoAllow),tool))continue;
  if(allow.length&&!matches(allow,tool))continue;
  if(deny.length&&matches(deny,tool))continue;
  if(tool.name==='browser'&&record(root.browser).enabled===false)continue;
  found.push({name:tool.name,title:tool.title,kind:tool.kind});
 }
 if(plugins.enabled!==false){
  const entries=record(plugins.entries),allowed=list(plugins.allow),denied=list(plugins.deny);
  for(const [id,tool] of Object.entries(OPENCLAW_PLUGINS)){
   const entry=entries[id];
   if(!entry||record(entry).enabled===false||denied.includes(id)||allowed.length&&!allowed.includes(id))continue;
   // Optional plugin tools come with the `full` profile (or none); another profile needs them allowed by name.
   const named={name:tool.name,groups:[id]};
   if(base&&!matches([...list(tools.alsoAllow),...allow],named))continue;
   if(allow.length&&!matches(allow,named)||deny.length&&matches(deny,named))continue;
   found.unshift(tool);
  }
 }
 return found;
}

// Hermes Agent --------------------------------------------------------------------------------

/** Tools worth offering, by Hermes tool name (NousResearch/hermes-agent toolsets.py). */
const HERMES_TOOLS:Record<string,HarnessTool>={
 image_generate:{name:'image_generate',title:'generate images',kind:'media'},
 video_generate:{name:'video_generate',title:'generate videos',kind:'media'},
 text_to_speech:{name:'text_to_speech',title:'speak text aloud',kind:'media'},
 computer_use:{name:'computer_use',title:'use apps on this computer (computer use)',kind:'other'},
 browser_navigate:{name:'browser_navigate',title:'use its own browser',kind:'web'},
 terminal:{name:'terminal',title:'run commands on this computer',kind:'shell'},
 execute_code:{name:'execute_code',title:'run Python code',kind:'shell'},
 delegate_task:{name:'delegate_task',title:'hand work to sub-agents (delegate_task)',kind:'other'},
};
const HERMES_CORE=['image_generate','text_to_speech','computer_use','browser_navigate','terminal','execute_code','delegate_task'];
/** Toolsets as the offered tools they hold. A `hermes-<platform>` bundle is the core set; `hermes-acp` (what a Fox
 * turn over ACP gets when `platform_toolsets.acp` is unset) is the coding posture without images, speech or computer use. */
const HERMES_TOOLSETS:Record<string,string[]>={
 image_gen:['image_generate'],video_gen:['video_generate'],tts:['text_to_speech'],computer_use:['computer_use'],
 browser:['browser_navigate'],terminal:['terminal'],code_execution:['execute_code'],delegation:['delegate_task'],
 debugging:['terminal'],safe:['image_generate'],
 'hermes-acp':['browser_navigate','terminal','execute_code','delegate_task'],
 'hermes-api-server':['image_generate','browser_navigate','terminal','execute_code','delegate_task'],
};
const hermesToolset=(name:string):string[]=>HERMES_TOOLSETS[name]??(/^hermes-[a-z0-9_-]+$/.test(name)?HERMES_CORE:[]);

/** A small reading of Hermes `config.yaml`: nested maps by indentation, `- item` lists and `[a, b]` flow lists of
 * scalars. Enough for `platform_toolsets` and `agent.disabled_toolsets`; anything else is skipped. */
export function hermesConfigValues(yaml:string):Record<string,any> {
 const root:Record<string,any>={};
 const stack:{indent:number;node:Record<string,any>}[]=[{indent:-1,node:root}];
 let open:{holder:Record<string,any>;key:string;indent:number}|null=null;
 const scalar=(text:string)=>{const value=text.replace(/\s+#.*$/,'').trim();return /^(['"]).*\1$/.test(value)?value.slice(1,-1):value;};
 for(const raw of yaml.split(/\r?\n/)){
  if(!raw.trim()||raw.trim().startsWith('#'))continue;
  const indent=raw.length-raw.trimStart().length,text=raw.trim();
  const item=/^-\s+(.*)$/.exec(text);
  if(item&&open&&indent>=open.indent){if(!Array.isArray(open.holder[open.key]))open.holder[open.key]=[];open.holder[open.key].push(scalar(item[1]));continue;}
  open=null;
  while(stack.length>1&&indent<=stack[stack.length-1].indent)stack.pop();
  const pair=/^("[^"]*"|'[^']*'|[^:\s][^:]*?)\s*:\s*(.*)$/.exec(text);
  if(!pair||item)continue;
  const key=scalar(pair[1]),value=pair[2].replace(/\s+#.*$/,'').trim(),parent=stack[stack.length-1].node;
  if(!value){const node:Record<string,any>={};parent[key]=node;stack.push({indent,node});open={holder:parent,key,indent};}
  else if(/^\[.*\]$/.test(value))parent[key]=value.slice(1,-1).split(',').map(scalar).filter(Boolean);
  else parent[key]=scalar(value);
 }
 return root;
}

/** What a Fox turn on the person's Hermes Agent can call: `platform_toolsets.acp` when set, else the `hermes-acp`
 * bundle, minus `agent.disabled_toolsets` (as Hermes' ACP session resolves them). */
export function hermesHarnessTools(yaml:string):HarnessTool[] {
 const config=hermesConfigValues(yaml),platforms=record(config.platform_toolsets);
 const chosen=list(platforms.acp);
 const enabled=new Set((chosen.length?chosen:['hermes-acp']).flatMap(hermesToolset));
 for(const name of list(record(config.agent).disabled_toolsets).flatMap(hermesToolset))enabled.delete(name);
 return Object.keys(HERMES_TOOLS).filter(name=>enabled.has(name)).map(name=>HERMES_TOOLS[name]);
}

// For Fox -------------------------------------------------------------------------------------

/** The one line Worldlet adds to a turn's instructions, or '' when the Agent has nothing to add. `calls`: the Harness
 * also provides the `calls` service, so a call placed from this conversation is reported back in it when it ends
 * (core/tasks/harness-calls.ts). */
export function harnessToolsLine(tools:readonly HarnessTool[],{calls=false}:{calls?:boolean}={}):string {
 const titles=[...new Set(tools.map(tool=>tool.title).filter(Boolean))].slice(0,10);
 if(!titles.length)return '';
 const report=calls&&tools.some(tool=>tool.kind==='call')?' When you place a phone call for the person, say so in one line and do not wait for it: Worldlet tells them here how it went once it ends.':'';
 return 'Your Agent can also: '+titles.join('; ')+'. These are your own tools, outside Worldlet, under your own approvals: offer one when it would help the person, and use it only when they want it.'+report;
}
/** The quiet line Settings shows under the Agent in use. */
export function harnessToolsSummary(tools:readonly HarnessTool[]):string {
 const titles=[...new Set(tools.map(tool=>tool.title.replace(/\s*\([^)]*\)$/,'')).filter(Boolean))].slice(0,6);
 return titles.length?'Can also '+titles.join(', ')+'.':'';
}
