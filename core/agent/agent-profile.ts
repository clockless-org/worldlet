// What a person's own Agent says about itself before setup brings it in (owner request 2026-10-11, Kelvin: "import之前，给
// openclaw或者hermes agent发一条消息，让他总结自己的Profile，skills，notes … 成一个json"). Reading its files finds what
// is stored where Worldlet expects it; the Agent itself also knows what lives elsewhere (a workspace moved out of
// ~/.openclaw, a password vault, a mailbox it runs, the channels it answers in) and what its person does with it. The
// answer only adds to what the files brought: where things are, its connections and channels, and Applets worth having.
// It runs on the person's own Agent and stays on this computer; nothing in it may be a secret.
import {looksSecret} from '../../context/items/index.ts';
export {looksSecret};

export const AGENT_PROFILE_SCHEMA='worldlet.agent-profile/v1';
/** Agents asked; others keep only what their files hold. */
export const AGENT_PROFILE_SOURCES=['openclaw','hermes'] as const;
export const agentProfileAsked=(id:unknown)=>(AGENT_PROFILE_SOURCES as readonly unknown[]).includes(id);
/** One answer may take this long; a reply that is not the JSON is asked again once. Going through its conversations
 * takes an Agent several tool calls, more than the 90 s first allowed (owner report 2026-10-12: a Hermes Agent's
 * answer never came); it runs in the background, so waiting longer holds nothing up. */
export const AGENT_PROFILE_TIMEOUT_MS=300_000;

export interface AgentProfile {
 agent:{name?:string;model?:string};
 /** Where its files are, for agents whose workspace is not where Worldlet looks first. */
 workspaces:{agent?:string;path:string}[];
 persona?:string;
 aboutUser:string[];
 skills:{name:string;description?:string}[];
 connections:{name:string;kind:string;service?:string;usedFor?:string}[];
 channels:{provider:string;place:string;purpose?:string}[];
 routines:{name:string;schedule?:string;what?:string}[];
 threads:{title:string;summary?:string}[];
 /** Applets it suggests: a catalog key when one fits, else a title of its own. */
 applets:{key?:string;title:string;why?:string}[];
 /** What the person handles most day to day, read from their conversations (owner request 2026-10-12): each becomes
  * an Applet, the catalog's when `key` fits, else the conversation it happens in (core/tasks ongoingFromAgent). */
 things:{title:string;why?:string;threads:string[];key?:string}[];
 /** What the person should see in the Attention Center right after setup, read from their conversations (owner request
  * 2026-10-12, Kelvin: "onboard了以后 Attention Center里面要有东西"): something dated coming up, something they said they
  * would do, something worth knowing. Each names the conversation it comes from (core/tasks attentionFromAgent). */
 attention:AgentAttention[];
}
export const AGENT_ATTENTION_GROUPS=['coming','doing','knowing'] as const;
export type AgentAttentionGroup=typeof AGENT_ATTENTION_GROUPS[number];
/** `when`: an ISO date (all day) or date-time with its offset, for `coming`. */
export interface AgentAttention {group:AgentAttentionGroup;title:string;why:string;summary?:string;when?:string;thread:string}

const KINDS=['mcp','channel','api_key','password_vault','oauth','cli','email','other'];

/** One of the Agent's conversations as Worldlet read it from the Agent's own files: its title, how many messages it
 * has, when it was last written to (YYYY-MM-DD) and the person's first few lines. */
export interface AgentConversationDigest {title:string;messages?:number;last?:string;opening?:string[]}
export const AGENT_PROFILE_DIGEST=Object.freeze({conversations:40,lines:3,line:140});

/** The message sent to the Agent. `catalog`: the Applet keys it may suggest from. `conversations`: its conversations as
 * Worldlet already read them from its files (owner request 2026-10-12, Kelvin: "先读文件可以"). With them, the Agent
 * answers from the list and what it already knows, without tools: going through its history itself took a Hermes Agent
 * minutes and sometimes never ended. The things it names point at these titles (core/tasks ongoingFromAgent). */
export function agentProfilePrompt(catalog:readonly string[],conversations:readonly (AgentConversationDigest|string)[]=[]):string {
 const one=(value:string,limit:number)=>[...value.replace(/\s+/g,' ').trim()].slice(0,limit).join('');
 const seen=new Set<string>(),list:AgentConversationDigest[]=[];
 for(const entry of conversations){
  const c=typeof entry==='string'?{title:entry}:entry,title=one(c.title||'',160);
  if(!title||seen.has(title)||list.length>=AGENT_PROFILE_DIGEST.conversations)continue;
  seen.add(title);
  list.push({title,...Number.isFinite(c.messages)&&c.messages!>0?{messages:Math.round(c.messages!)}:{},...c.last&&/^\d{4}-\d{2}-\d{2}$/.test(c.last)?{last:c.last}:{},
   ...c.opening?.length?{opening:c.opening.map(line=>one(line,AGENT_PROFILE_DIGEST.line)).filter(Boolean).slice(0,AGENT_PROFILE_DIGEST.lines)}:{}});
 }
 return [
  'Worldlet is setting up a desktop for you and the person you work for. Describe yourself as ONE JSON object, exactly this shape (every field optional, arrays may be empty):',
  JSON.stringify({schema:AGENT_PROFILE_SCHEMA,agent:{name:'your name',model:'provider/model'},workspaces:[{agent:'agent id',path:'absolute folder holding your SOUL.md, memory, skills'}],persona:'one or two sentences: who you are and how you talk',aboutUser:['short facts about your person'],skills:[{name:'skill name',description:'one line'}],connections:[{name:'what it is',kind:KINDS.join('|'),service:'e.g. gmail, discord, 1password',usedFor:'one line'}],channels:[{provider:'discord|telegram|…',place:'#channel or chat name',purpose:'one line'}],routines:[{name:'',schedule:'cron or plain words',what:'one line'}],threads:[{title:'recent conversation',summary:'one line'}],things:[{title:'short name, like Kitchen restock',why:'what your person keeps doing',threads:['the conversation titles it happens in, exactly as titled'],key:'catalog key below, or omit'}],applets:[{key:'catalog key below, or omit',title:'name',why:'what your person does that it helps with'}],attention:[{group:AGENT_ATTENTION_GROUPS.join('|'),title:'at most 40 characters',why:'why it matters now, at most 8 words',summary:'one or two sentences',when:'for coming: 2026-10-14 or 2026-10-14T15:00:00-07:00',thread:'the conversation title it comes from, exactly as titled'}]}),
  list.length?'Answer right away from what you already know about yourself and your person and from the conversations listed below; do not run tools or read files for this. Leave out anything you are unsure of; do not invent.'
   :'Use what you actually have: your configuration, workspace files, skills, memory and notes, channels, scheduled jobs and recent conversations. Leave out anything you are unsure of; do not invent.',
  'NEVER include secrets: no passwords, tokens, API key values or private keys. Name the service and how it is connected instead.',
  'Do not change any setting or file and do not message anyone; only answer.',
  'things: name the things your person handles most day to day, up to 12, busiest first: recurring jobs, not one-off questions. Each lists the conversations it happens in by their exact titles, and a key from the list below when one Applet fits.',
  ...list.length?['Your conversations, newest first, as Worldlet read them from your files (title, messages, last active, your person\'s first lines). In things and threads, use these titles exactly as written:\n'+list.map(c=>JSON.stringify(c)).join('\n')]:[],
  'attention: up to 9 things your person should see today, from recent conversations: coming = a dated thing in the next two weeks they planned or agreed to (a meeting, deadline, trip), with when; doing = something they said they would do, or a reply they owe, still open; knowing = a result or news from your work for them they would want to hear. Only real, current things, each from one conversation listed below by its exact title; an empty list is fine.',
  'threads: up to 30 recent ones. applets: up to 8, based on what your person really does with you; use a key from this list when one fits: '+catalog.join(', ')+'.',
  'Reply with the JSON object only, no other text.',
 ].join('\n\n');
}


const text=(value:unknown,limit:number):string|undefined=>{
 if(typeof value!=='string')return undefined;
 const clean=value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 return clean&&!looksSecret(clean)?clean.slice(0,limit):undefined;
};
const list=<T>(value:unknown,limit:number,item:(entry:any)=>T|null):T[]=>Array.isArray(value)?value.slice(0,limit*2).map(entry=>entry&&typeof entry==='object'?item(entry):null).filter((entry):entry is T=>entry!==null).slice(0,limit):[];
const defined=<T extends object>(value:T):T=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined)) as T;

/** The JSON object in an Agent's reply (bare, or inside a code fence or prose), or null. */
function jsonIn(reply:string):unknown {
 if(reply.length>400_000)return null;
 const fenced=/```(?:json)?\s*([\s\S]*?)```/.exec(reply)?.[1];
 for(const candidate of [reply.trim(),fenced?.trim(),reply.slice(reply.indexOf('{'),reply.lastIndexOf('}')+1)]){
  if(!candidate)continue;
  try{const value=JSON.parse(candidate);if(value&&typeof value==='object'&&!Array.isArray(value))return value;}catch{}
 }
 return null;
}

/** The Agent's reply as a bounded AgentProfile without secrets, or null when it holds no usable JSON. Entries that do
 * not fit are dropped one by one; the rest is kept. */
export function parseAgentProfile(reply:unknown):AgentProfile|null {
 if(typeof reply!=='string')return null;
 const value=jsonIn(reply) as Record<string,any>|null;
 if(!value)return null;
 const profile:AgentProfile={
  agent:defined({name:text(value.agent?.name,80),model:text(value.agent?.model,120)}),
  workspaces:list(value.workspaces,20,entry=>{const path=text(entry.path,500);return path?defined({agent:text(entry.agent,64),path}):null;}),
  persona:text(value.persona,400),
  aboutUser:Array.isArray(value.aboutUser)?value.aboutUser.slice(0,60).map((entry:unknown)=>text(entry,200)).filter((entry):entry is string=>!!entry).slice(0,30):[],
  skills:list(value.skills,200,entry=>{const name=text(entry.name,80);return name?defined({name,description:text(entry.description,200)}):null;}),
  connections:list(value.connections,60,entry=>{const name=text(entry.name,80);if(!name)return null;const kind=text(entry.kind,20)?.toLowerCase();return defined({name,kind:kind&&KINDS.includes(kind)?kind:'other',service:text(entry.service,60)?.toLowerCase(),usedFor:text(entry.usedFor,200)});}),
  channels:list(value.channels,60,entry=>{const provider=text(entry.provider,40)?.toLowerCase(),place=text(entry.place,120);return provider&&place?defined({provider,place,purpose:text(entry.purpose,200)}):null;}),
  routines:list(value.routines,60,entry=>{const name=text(entry.name,120);return name?defined({name,schedule:text(entry.schedule,80),what:text(entry.what,200)}):null;}),
  threads:list(value.threads,30,entry=>{const title=text(entry.title,160);return title?defined({title,summary:text(entry.summary,200)}):null;}),
  things:list(value.things,12,entry=>{const title=text(entry.title,60);if(!title)return null;const threads=Array.isArray(entry.threads)?entry.threads.slice(0,20).map((thread:unknown)=>text(thread,160)).filter((thread):thread is string=>!!thread).slice(0,10):[];return defined({title,why:text(entry.why,200),threads,key:text(entry.key,60)?.toLowerCase()});}),
  attention:list(value.attention,9,entry=>{
   const group=text(entry.group,12)?.toLowerCase() as AgentAttentionGroup|undefined,title=text(entry.title,40),why=text(entry.why,56),thread=text(entry.thread,160);
   if(!group||!AGENT_ATTENTION_GROUPS.includes(group)||!title||!why||!thread||why.split(' ').length>8)return null;
   const when=text(entry.when,40),valid=when&&/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(when)&&Number.isFinite(Date.parse(when));
   if(group==='coming'&&!valid)return null;
   return defined({group,title,why,summary:text(entry.summary,600),when:valid?when:undefined,thread});
  }),
  applets:list(value.applets,8,entry=>{const title=text(entry.title,80)??text(entry.key,60);return title?defined({key:text(entry.key,60)?.toLowerCase(),title,why:text(entry.why,200)}):null;}),
 };
 if(profile.persona===undefined)delete profile.persona;
 const empty=!profile.agent.name&&!profile.persona&&[profile.workspaces,profile.aboutUser,profile.skills,profile.connections,profile.channels,profile.routines,profile.threads,profile.applets,profile.things,profile.attention].every(items=>!items.length);
 return empty?null:profile;
}

/** Service names an Agent uses for a catalog Applet, where they differ from its key. */
const SERVICE_KEYS:Record<string,string>={'google calendar':'google-calendar',gcal:'google-calendar',calendar:'google-calendar','google drive':'google-drive',gdrive:'google-drive',twitter:'x','x.com':'x',mail:'gmail',email:'gmail','1password':'',imessage:'messages','apple notes':'apple-notes','apple reminders':'apple-reminders',amazon:'amazon'};
/** Catalog Applets the profile points to: the things it named and the ones it suggests by key, then the services its connections and channels
 * use, in that order, without repeats. */
export function agentProfileApplets(profile:AgentProfile|null,catalog:readonly string[]):string[] {
 if(!profile)return [];
 const known=new Set(catalog),found:string[]=[];
 const add=(name:string|undefined)=>{if(!name)return;const lower=name.toLowerCase().trim(),key=lower in SERVICE_KEYS?SERVICE_KEYS[lower]:lower.replace(/\s+/g,'-');if(key&&known.has(key)&&!found.includes(key))found.push(key);};
 for(const thing of profile.things??[])if(thing.key)add(thing.key);
 for(const applet of profile.applets)add(applet.key??applet.title);
 for(const connection of profile.connections)add(connection.service);
 for(const channel of profile.channels)add(channel.provider);
 return found;
}
