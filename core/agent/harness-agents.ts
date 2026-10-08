// The `agents` Harness service (contracts/harness-services.ts HarnessAgents): the person's own agents or profiles
// (OpenClaw's agents, Hermes Agent's profiles), each with its instructions and model, and which one answers in an
// Applet's, an area's or a channel conversation's thread. Shared rules only: what an agent's files and settings mean,
// and the bindings the World keeps (`applet-agents` in world.sqlite). Reading the files is the host's job. Kept
// ES-compatible for JavaScriptCore and Jint.
import {harnessSessionThread} from './harness-sessions.ts';

const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
/** An agent id or profile name, as the Harness itself accepts it (OpenClaw agent ids, Hermes `-p <name>`). */
export const isHarnessAgentId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_.-]{1,64}$/.test(value)&&value!=='.'&&value!=='..';

/** An agent's instructions as one text: each non-empty file under its name, clipped to `limit` characters. */
export function harnessAgentInstructions(files:[string,string][],limit=8000):string|undefined {
 const text=files.map(([name,body])=>[name,String(body??'').trim()]).filter(([,body])=>body).map(([name,body])=>files.length>1?`# ${name}\n${body}`:body).join('\n\n');
 return text?text.slice(0,limit):undefined;
}
const modelName=(value:unknown)=>{const named=typeof value==='string'?value:record(value).primary;return typeof named==='string'&&named.trim()?named.trim().slice(0,200):undefined;};
/** OpenClaw: an agent's `model` (a name or `{primary}`) in `agents.entries` or `agents.list`, else `agents.defaults.model`. */
export function openClawAgentModel(config:unknown,id:string):string|undefined {
 const agents=record(record(config).agents);
 const listed=Array.isArray(agents.list)?agents.list.map(record).find(entry=>entry.id===id):undefined;
 return modelName(record(agents.entries)[id]?.model)??modelName(listed?.model)??modelName(record(agents.defaults).model);
}
/** Hermes Agent: a profile's model from its config.yaml (`model:` a name, or a block with `default:`). */
export function hermesProfileModel(config:string):string|undefined {
 const unquote=(value:string)=>value.trim().replace(/\s+#.*$/,'').replace(/^["']|["']$/g,'').trim();
 const scalar=/^model\s*:[ \t]*([^\s#][^\n]*)$/m.exec(config);
 if(scalar&&unquote(scalar[1]))return unquote(scalar[1]).slice(0,200);
 const block=/^model\s*:[ \t]*(?:#.*)?\n((?:[ \t]+.*\n?)+)/m.exec(config)?.[1]??'';
 const named=/^[ \t]+(?:default|model|name)\s*:\s*(.+)$/m.exec(block);
 return named&&unquote(named[1])?unquote(named[1]).slice(0,200):undefined;
}

// Which agent answers where, and what it is also told ----------------------------------------------------------------

/** The places an agent and extra instructions can be bound to, most specific first: a person (a direct channel
 * conversation), a group (a shared one), an Applet (an Ongoing theme is one too), an area of the World. The first bound
 * place answers; a thread bound to none is the main agent's. */
export const AGENT_BINDING_SCOPES=['person','group','applet','region'] as const;
export type AgentBindingScope=typeof AGENT_BINDING_SCOPES[number];
/** The places a thread is in, as binding keys (`agentBindingPlace`). */
export type AgentPlaces=Partial<Record<AgentBindingScope,string>>;
/** `choices`: per Harness (agent ids are its own), the agent bound to a place; `notes`: the person's extra instructions
 * for a place, whatever Harness answers. Version 1 kept only `applet:` choices and is read as version 2. */
export type AgentBindings={version:2;choices:Record<string,Record<string,string>>;notes:Record<string,string>};
export const AGENT_NOTE_LIMIT=1000;
const HARNESS_ID=/^[a-z][a-z0-9-]{0,63}$/;
const placeScope=(place:string):AgentBindingScope|null=>{
 const [scope,...rest]=place.split(':'),id=rest.join(':');
 if(scope==='applet')return id&&place.length<=130?'applet':null;
 if(scope==='region')return /^[a-z]{1,24}$/.test(id)?'region':null;
 return (scope==='person'||scope==='group')&&/^[a-z0-9-]{1,64}$/.test(id)?scope:null;
};
const cleanNote=(value:unknown)=>typeof value==='string'?value.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g,' ').trim().slice(0,AGENT_NOTE_LIMIT):'';
export function readAgentBindings(value:unknown):AgentBindings {
 const choices:AgentBindings['choices']={},notes:AgentBindings['notes']={};
 for(const [harness,places] of Object.entries(record(record(value).choices))){
  if(!HARNESS_ID.test(harness))continue;
  const kept:Record<string,string>={};
  for(const [place,agent] of Object.entries(record(places)))if(placeScope(place)&&isHarnessAgentId(agent))kept[place]=agent;
  if(Object.keys(kept).length)choices[harness]=kept;
 }
 for(const [place,note] of Object.entries(record(record(value).notes))){const text=cleanNote(note);if(placeScope(place)&&text)notes[place]=text;}
 return {version:2,choices,notes};
}
/** The Fox thread of an Applet (its World object `app-<id>`), as resident sessions name it. */
export const appletAgentThread=(applet:string)=>{const thread=harnessSessionThread(JSON.stringify(['object:'+applet,'']));return thread.startsWith('applet:')?thread:null;};
/** A place's binding key: an Applet by its World object (`app-<id>`), an area by its id, a person or group by the
 * channel conversation's id; null when it is none. */
export function agentBindingPlace(scope:AgentBindingScope,id:string):string|null {
 const place=scope==='applet'?appletAgentThread(id):scope+':'+id;
 return place&&placeScope(place)===scope?place:null;
}
/** Binds `agent` to `place` for `harness`; null unbinds it, so the next place out answers. Binding the main agent is
 * kept too: it overrides a wider place's other agent. */
export function bindAgent(state:unknown,harness:string,place:string|null,agent:string|null):AgentBindings {
 const next=readAgentBindings(state);
 if(!place||!placeScope(place)||!HARNESS_ID.test(harness))throw Error('Choose an Applet.');
 if(agent!==null&&!isHarnessAgentId(agent))throw Error('Choose one of your agents.');
 const places={...next.choices[harness]};
 if(agent)places[place]=agent;else delete places[place];
 if(Object.keys(places).length)next.choices[harness]=places;else delete next.choices[harness];
 return next;
}
/** The person's extra instructions for `place`; empty removes them. */
export function noteAgentPlace(state:unknown,place:string|null,note:unknown):AgentBindings {
 const next=readAgentBindings(state),text=cleanNote(note);
 if(!place||!placeScope(place))throw Error('Choose an Applet.');
 if(typeof note==='string'&&note.trim().length>AGENT_NOTE_LIMIT)throw Error(`Instructions are at most ${AGENT_NOTE_LIMIT} characters.`);
 if(text)next.notes[place]=text;else delete next.notes[place];
 return next;
}
export type AgentAnswer={agent:string;main:boolean;by:AgentBindingScope|'main';place?:string;notes:{scope:AgentBindingScope;text:string}[]};
/** Who answers a thread in `places`, and why: the most specific bound place whose agent is still one of `agents`
 * (person > group > Applet > area), else the main agent. Notes come from every place the thread is in, widest first. */
export function answeringAgent(state:unknown,harness:string,places:AgentPlaces,agents:{id:string;main?:boolean}[]):AgentAnswer {
 const saved=readAgentBindings(state),bound=saved.choices[harness]??{};
 const notes=[...AGENT_BINDING_SCOPES].reverse().flatMap(scope=>{const place=places[scope],text=place?saved.notes[place]:undefined;return text?[{scope,text}]:[];});
 for(const scope of AGENT_BINDING_SCOPES){
  const place=places[scope],chosen=place?bound[place]:undefined,agent=chosen?agents.find(a=>a.id===chosen):undefined;
  if(agent)return {agent:agent.id,main:!!agent.main,by:scope,place,notes};
 }
 return {agent:agents.find(a=>a.main)?.id??'',main:true,by:'main',notes};
}
/** Why it answers, in words: "bound to this group", "bound to the Work area", "your main agent". */
export function agentAnswerReason(by:AgentAnswer['by'],area?:string):string {
 if(by==='region')return area?`bound to the ${area} area`:'bound to this area';
 return by==='main'?'your main agent':'bound to this '+(by==='applet'?'Applet':by);
}
const NOTE_PLACE:Record<AgentBindingScope,string>={region:'In this area of the World',applet:'In this Applet',group:'In this group',person:'With this person'};
/** The notes as instructions for the turn (they go with the World's own, through the Harness's turn instructions). */
export function agentBindingInstructions(notes:AgentAnswer['notes']):string {
 if(!notes.length)return '';
 return '\n\nThe person’s own instructions for where this is said (a later, more specific one wins where they differ):\n'+notes.map(note=>`- ${NOTE_PLACE[note.scope]}: ${note.text}`).join('\n');
}
