// Bringing a person's own OpenClaw into Worldlet (owner goal 2026-10-03: "load your OpenClaw, all
// your messages, same agent name"). Shared rules only: which OpenClaw conversations count, what each
// is called, how a transcript event becomes a turn, how a scheduled job becomes a Fox routine and how
// channel instructions and extra agents become Hermes skills. The host reads OpenClaw's files
// read-only and writes Worldlet's copies. Kept ES-compatible for JavaScriptCore and Jint.

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;

// Conversations ------------------------------------------------------------------------------

/** Session keys that are OpenClaw's own machinery (scheduled runs, hooks, sub-agents, probes),
 * not a conversation the person had. `createdVia` is the SQLite row's origin when known. */
const MACHINERY=['cron','hook','subagent','run','explicit','acp','spawn','heartbeat','probe'];
export function openClawConversationIncluded(key:string,createdVia?:string|null):boolean {
 if(typeof key!=='string'||!key.trim())return false;
 if(createdVia&&['cron','spawn','run','internal','plugin'].includes(createdVia))return false;
 const parts=key.toLowerCase().split(':');
 return !parts.some(part=>MACHINERY.includes(part));
}

const CHANNELS:Record<string,string>={discord:'Discord',telegram:'Telegram',slack:'Slack',whatsapp:'WhatsApp',imessage:'iMessage',signal:'Signal',matrix:'Matrix',googlechat:'Google Chat',msteams:'Teams',line:'LINE',irc:'IRC',webchat:'Web chat',bluebubbles:'iMessage',nextcloud:'Nextcloud Talk',mattermost:'Mattermost',feishu:'Feishu',wechat:'WeChat'};
const channelName=(id:string)=>CHANNELS[id.toLowerCase()]??(id?id.charAt(0).toUpperCase()+id.slice(1):'');
export interface OpenClawConversationFacts {key:string;label?:string|null;displayName?:string|null;subject?:string|null;channel?:string|null;agentName?:string|null}
/** "Discord · #diet-and-health"; another agent's conversation leads with that agent's name. */
export function openClawConversationTitle(facts:OpenClawConversationFacts):string {
 const parts=String(facts.key||'').split(':');
 const scoped=parts[0]==='agent'?parts.slice(2):parts;
 const channel=text(facts.channel)||(scoped.length>1?scoped[0]:'');
 const named=text(facts.label)||text(facts.displayName)||text(facts.subject);
 let title:string;
 if(scoped.length===1&&scoped[0]==='main')title=named||'Main chat';
 else{
  const kind=scoped.find(part=>['group','channel','room','direct','dm','thread','topic'].includes(part))??'';
  const fallback=kind==='direct'||kind==='dm'?'Direct messages':kind?kind.charAt(0).toUpperCase()+kind.slice(1)+' '+(scoped.at(-1)??''):scoped.join(':');
  const name=named||fallback;
  const service=channelName(channel);
  title=service&&!name.toLowerCase().includes(service.toLowerCase())?service+' · '+name:name;
 }
 const agent=text(facts.agentName);
 return clip((agent?agent+' · ':'')+title,140);
}

export interface OpenClawTurn {role:'user'|'assistant';text:string;at:string|null}
const iso=(value:unknown):string|null=>{
 const date=typeof value==='number'&&Number.isFinite(value)?new Date(value<1e12?value*1000:value):typeof value==='string'&&value?new Date(value):null;
 return date&&!Number.isNaN(date.getTime())?date.toISOString().replace(/\.\d+Z$/,'Z'):null;
};
/** One transcript event (OpenClaw's append-only session tree) as a visible turn, or null for
 * headers, tool calls and results, compaction summaries, extension state and empty messages. */
export function openClawTurn(event:unknown):OpenClawTurn|null {
 const entry=record(event);
 if(entry.type!=='message')return null;
 const message=record(entry.message);
 if(message.role!=='user'&&message.role!=='assistant')return null;
 const content=message.content;
 let body=typeof content==='string'?content:Array.isArray(content)?content.map(part=>{const p=record(part);return ['text','input_text','output_text'].includes(p.type)&&typeof p.text==='string'?p.text:'';}).filter(Boolean).join('\n\n'):'';
 // Channel envelopes end with delivery bookkeeping that means nothing outside OpenClaw.
 body=body.split('\n').filter(line=>!/^\s*\[message_id:\s*[^\]]*\]\s*$/.test(line)).join('\n').trim();
 if(!body||body==='NO_REPLY'||body==='HEARTBEAT_OK')return null;
 return {role:message.role,text:body,at:iso(message.timestamp)??iso(entry.timestamp)};
}

// Scheduled jobs -----------------------------------------------------------------------------

export interface OpenClawRoutine {key:string;name:string;prompt:string;schedule:string;enabled:boolean}
export type OpenClawRoutineResult={ok:true;routine:OpenClawRoutine}|{ok:false;name:string;reason:string};
/** An OpenClaw automation as a Fox routine (Hermes cron: interval, ISO time or five-field cron).
 * Routines run on this computer's clock; jobs that watch a command, run a script or a condition
 * check have no safe equivalent and stay in OpenClaw. */
export function openClawRoutine(job:unknown,now=Date.now()):OpenClawRoutineResult {
 const value=record(job),schedule=record(value.schedule),payload=record(value.payload);
 const name=clip(text(value.name)||text(value.description)||'OpenClaw job',120);
 const prompt=payload.kind==='agentTurn'?text(payload.message):payload.kind==='systemEvent'?text(payload.text):'';
 if(!prompt)return {ok:false,name,reason:'It runs a command or script, not a request to the Agent.'};
 if(record(value.trigger).script)return {ok:false,name,reason:'It waits for a condition script.'};
 let when='';
 if(schedule.kind==='cron'){
  const fields=text(schedule.expr).split(/\s+/).filter(Boolean);
  // A six-field OpenClaw expression starts with seconds; Hermes reads five fields.
  const five=fields.length===6?fields.slice(1):fields;
  if(five.length!==5||!five.every(field=>/^[A-Za-z\d*\-,/?LW#+]+$/.test(field))||five.some(field=>/[?LW#+]/.test(field)))return {ok:false,name,reason:'Its schedule uses cron features Fox does not support.'};
  when=five.join(' ');
 }else if(schedule.kind==='every'){
  const minutes=Math.round(Number(schedule.everyMs)/60000);
  if(!Number.isFinite(minutes)||minutes<1)return {ok:false,name,reason:'It runs more often than once a minute.'};
  when=minutes%1440===0?'every '+minutes/1440+'d':minutes%60===0?'every '+minutes/60+'h':'every '+minutes+'m';
 }else if(schedule.kind==='at'){
  const at=iso(schedule.at);
  if(!at)return {ok:false,name,reason:'Its time could not be read.'};
  if(Date.parse(at)<=now)return {ok:false,name,reason:'It already ran.'};
  when=at;
 }else return {ok:false,name,reason:'It is started by another program, not by the clock.'};
 const agent=text(value.agentId)||'main';
 return {ok:true,routine:{key:'openclaw:'+agent+':'+(text(value.id)||name),name,prompt:clip(prompt,8000),schedule:when,enabled:value.enabled!==false}};
}

// Channel instructions and skills ----------------------------------------------------------------

export interface OpenClawChannelPrompt {provider:string;place:string[];prompt:string}
const CONTAINERS=new Set(['guilds','channels','groups','topics','accounts','rooms','teams','spaces','chats','threads','peers','dm','direct']);
/** Every `systemPrompt` under `channels.<provider>` in openclaw.json, with the IDs or names that
 * lead to it (guild, channel, topic …), so it can be matched to that conversation. */
export function openClawChannelPrompts(config:unknown):OpenClawChannelPrompt[] {
 const found:OpenClawChannelPrompt[]=[];
 const walk=(node:unknown,provider:string,place:string[],depth:number)=>{
  const value=record(node);
  if(depth>8||found.length>=200)return;
  const prompt=text(value.systemPrompt);
  if(prompt)found.push({provider,place,prompt:clip(prompt,20000)});
  for(const [key,child] of Object.entries(value))if(child&&typeof child==='object'&&!Array.isArray(child)&&key!=='*')walk(child,provider,CONTAINERS.has(key)?place:[...place,key],depth+1);
 };
 for(const [provider,node] of Object.entries(record(record(config).channels)))walk(node,provider,[],0);
 return found;
}
const bare=(value:string)=>value.toLowerCase().replace(/^#/,'').trim();
/** The instructions OpenClaw used in that conversation: the most specific matching place. */
export function openClawPromptFor(conversation:{key:string;title:string},prompts:OpenClawChannelPrompt[]):string|null {
 const segments=String(conversation.key||'').toLowerCase().split(':');
 const title=bare(String(conversation.title||'').split(' · ').at(-1)??'');
 const matches=prompts.filter(item=>segments.includes(item.provider.toLowerCase())&&item.place.length&&(segments.includes(String(item.place.at(-1)).toLowerCase())||bare(String(item.place.at(-1)))===title));
 matches.sort((a,b)=>b.place.length-a.place.length);
 return matches[0]?.prompt??null;
}

/** A Hermes skill folder name: lowercase letters, digits and hyphens. */
export function openClawSkillName(value:string):string {
 const slug=String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48).replace(/-+$/,'');
 return slug||'openclaw';
}
const yamlLine=(value:string)=>JSON.stringify(value.replace(/\s+/g,' ').trim());
/** SKILL.md with the frontmatter Hermes needs to list and load it. */
export function openClawSkillMarkdown({name,description,body,source='openclaw'}:{name:string;description:string;body:string;source?:string}):string {
 return `---\nname: ${openClawSkillName(name)}\ndescription: ${yamlLine(clip(description,300))}\nmetadata:\n  source: ${source}\n---\n\n${body.trim()}\n`;
}
const ARCHIVE_HINT='Earlier messages are in your past conversations; search them with read_companion_archive.';
/** One skill for a conversation that had its own instructions in OpenClaw. */
export function openClawConversationSkill(conversation:{title:string},prompt:string):{name:string;markdown:string} {
 const name=openClawSkillName('openclaw-'+conversation.title.split(' · ').at(-1));
 return {name,markdown:openClawSkillMarkdown({name,description:`How you helped in OpenClaw's ${conversation.title}. Use it when the person asks about that topic again.`,
  body:`# ${conversation.title}\n\nIn OpenClaw this conversation had its own instructions. Follow them when the person picks this topic up again:\n\n${prompt}\n\n${ARCHIVE_HINT} Their conversation is called "OpenClaw · ${conversation.title}".`})};
}
export interface AgentRole {id:string;name:string;soul:string;memory:string;user:string;conversations:string[]}
/** One skill for another agent the person kept beside the main one (an extra OpenClaw agent, another
 * Hermes Agent profile): its role, instructions, memory and conversation titles. `from` names where it
 * lived; `prefix` starts the skill's name and its conversations' session names. */
export function agentRoleSkill(agent:AgentRole,{from,source,prefix,kind='agent',session=from}:{from:string;source:string;prefix:string;kind?:string;session?:string}):{name:string;markdown:string} {
 const label=agent.name||agent.id,name=openClawSkillName(prefix+label);
 const sections=[`# ${label}`,'',`In ${from} the person had a separate ${kind} called ${label}. Take on its role when the person asks for what it did.`];
 if(agent.soul)sections.push('','## Its instructions','',clip(agent.soul,20000));
 if(agent.memory)sections.push('','## What it remembered','',clip(agent.memory,20000));
 if(agent.user)sections.push('','## What it knew about the person','',clip(agent.user,8000));
 if(agent.conversations.length)sections.push('','## Its conversations','',...agent.conversations.slice(0,40).map(title=>`- ${session} · `+title),'',ARCHIVE_HINT);
 return {name,markdown:openClawSkillMarkdown({name,source,description:`The person's ${from} ${kind} ${label}: its role, instructions and memory. Use it when they ask for what that ${kind} did.`,body:sections.join('\n')})};
}
/** One skill for an extra OpenClaw agent (a specialist with its own persona and memory). */
export const openClawAgentSkill=(agent:AgentRole)=>agentRoleSkill(agent,{from:'OpenClaw',source:'openclaw',prefix:'openclaw-agent-'});
