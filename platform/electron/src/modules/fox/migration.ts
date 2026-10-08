import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {MIGRATION_SOURCES,migrationMemoryNote,migrationNotesSession,migrationSession,migrationSkillMarkdown,migrationSkillName,migrationSkillPath,openClawAgentSkill,openClawChannelPrompts,openClawConversationSkill,openClawPromptFor,openClawRoutine,
 type MigrationRoutine,type MigrationSource} from '../../../../../core/agent/index.ts';
import {ensureDirectory,isLink,isoSeconds,writeAtomic} from '../../files.ts';
import {readClaudeCode,readCodex,readOwnHermes,readPi,type AgentHistory,type BroughtSkill} from '../agent-runtime/agent-files.ts';
import {readOpenClaw,type OpenClawData} from '../agent-runtime/openclaw-files.ts';
import type {Companion} from './companion.ts';
import type {Row} from '../../host/types.ts';

// Brings a person's own Agent into Fox at setup, the same way for each (owner requests 2026-10-03:
// "load your OpenClaw, all your messages, same agent name"; OpenClaw, Claude Code, pi, Hermes
// Agent and Codex through one flow). Name, About you and long-term memory come through `adoptMemory`; this
// adds the rest, all copied and kept on this computer:
//  - every conversation and note, as Fox's past conversations that `read_companion_archive` searches;
//  - skills (and OpenClaw's channel instructions and extra agents), as Hermes skills Fox loads on demand;
//  - scheduled jobs, as Fox routines (Hermes cron), which Hermes Agent's resident gateway runs also while Worldlet is closed.
// The Agent's own files are only read. Bringing it again replaces what it brought last time.
//
// The World keeps every part (owner question 2026-10-03: "if we swap the Hermes Harness, then
// what?"): memory in the companion profile, and conversations, notes, skills (Markdown) and
// routines in the World's database (`world.sqlite`). The Harness only holds a copy
// (`placeBrought`), made again whenever its copy is missing or older (`restoreBrought`), so a new
// or fresh Harness gets them back.

const TURN_LIMIT=127_000;
const stableID=(...parts:string[])=>{
 const hex=crypto.createHash('sha256').update(parts.join('\u0000')).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-${(8|parseInt(hex[16],16)&3).toString(16)}${hex.slice(17,20)}-${hex.slice(20,32)}`.toUpperCase();
};
const boundBytes=(text:string)=>Buffer.byteLength(text)<=TURN_LIMIT?text:Buffer.from(text).subarray(0,TURN_LIMIT-8).toString('utf8').replace(/�$/,'')+' …';

/** What one Agent brought beyond memory and conversations, as the World keeps it. */
export interface BroughtStore {version:1;source:MigrationSource;skills:Record<string,Record<string,string>>;routines:MigrationRoutine[]}
/** Where the World keeps them: its database (`WorldLedger`). */
export type BroughtShelf={readonly root:string;broughtStores():{source:string;skills:Record<string,Record<string,string>>;routines:Row[]}[];replaceBrought(source:string,skills:Record<string,Record<string,string>>,routines:Row[]):void};
/** Before 2026-10-03 the World kept them as `companion/brought/<agent>.json`. */
export const broughtFile=(root:string,source:MigrationSource)=>path.join(root,'companion','brought',source+'.json');
/** Moves the earlier files in once; each stays as `<agent>.json.before-database`. */
function moveLegacyBrought(world:BroughtShelf){
 for(const source of MIGRATION_SOURCES){
  const file=broughtFile(world.root,source);
  try{
   if(isLink(file)||!fs.existsSync(file))continue;
   const value=JSON.parse(fs.readFileSync(file,'utf8'));
   if(value?.version===1&&value.source===source&&value.skills&&typeof value.skills==='object'&&Array.isArray(value.routines))world.replaceBrought(source,value.skills,value.routines);
   fs.renameSync(file,file+'.before-database');
  }catch{}
 }
}
/** Each Agent's skills and routines kept in the World. */
export function readBrought(world:BroughtShelf):BroughtStore[] {
 moveLegacyBrought(world);
 return world.broughtStores().flatMap(value=>(MIGRATION_SOURCES as readonly string[]).includes(value.source)?[{version:1 as const,source:value.source as MigrationSource,skills:value.skills,routines:value.routines as MigrationRoutine[]}]:[]);
}
// The Harness copy carries a digest of the World copy it was made from.
const MARKER='.worldlet-brought';
// Folders and files in name order, so the same content always has the same digest.
const sorted=(value:Record<string,any>)=>Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]]));
const digest=(entry:BroughtStore)=>crypto.createHash('sha256').update(JSON.stringify({...entry,skills:sorted(Object.fromEntries(Object.entries(entry.skills).map(([folder,files])=>[folder,sorted(files)])))})).digest('hex');
type PlaceOptions={hermesHome:string|null;importRoutines:((routines:MigrationRoutine[])=>Promise<Row>)|null};
/** Copies one Agent's skills and routines from the World into Fox's Harness. */
export async function placeBrought(entry:BroughtStore,{hermesHome,importRoutines}:PlaceOptions):Promise<{skills:string[];routines:string[];stayed:{name:string;reason:string}[];partial:boolean}> {
 let partial=false,skills:string[]=[];
 if(hermesHome){try{writeSkills(hermesHome,entry.source,new Map(Object.entries(entry.skills)));skills=Object.keys(entry.skills).filter(folder=>migrationSkillPath(folder,'SKILL.md'));}catch{partial=true;}}
 const stayed:{name:string;reason:string}[]=[];
 let created:string[]=[];
 if(entry.routines.length&&importRoutines){
  try{
   const value=await importRoutines(entry.routines);
   created=Array.isArray(value?.routines)?value.routines.map((name:unknown)=>String(name)):entry.routines.map(r=>r.name);
   if(Array.isArray(value?.failed))for(const failure of value.failed)stayed.push({name:String(failure?.name??''),reason:String(failure?.reason??'Fox could not schedule it.')});
  }catch{partial=true;stayed.push(...entry.routines.map(r=>({name:r.name,reason:'Fox could not schedule it right now.'})));}
 }else stayed.push(...entry.routines.map(r=>({name:r.name,reason:'Fox’s routines are unavailable in this build.'})));
 // Only a complete copy is marked, so a partial one is tried again next time.
 if(hermesHome&&!partial&&(importRoutines||!entry.routines.length))try{writeAtomic(path.join(hermesHome,'skills',entry.source,MARKER),digest(entry));}catch{}
 return {skills,routines:created,stayed,partial};
}
/** Gives Fox's Harness back what the World keeps when its copy is missing or older (a new or reset
 * Harness, or a World restored from backup). Returns the Agents copied again. */
export async function restoreBrought(world:BroughtShelf,options:PlaceOptions&{hermesHome:string}):Promise<MigrationSource[]> {
 const restored:MigrationSource[]=[];
 for(const entry of readBrought(world)){
  let current='';try{current=fs.readFileSync(path.join(options.hermesHome,'skills',entry.source,MARKER),'utf8');}catch{}
  if(current===digest(entry))continue;
  await placeBrought(entry,options);
  restored.push(entry.source);
 }
 return restored;
}

export interface BroughtAgent {conversations:number;messages:number;notes:number;skills:string[];routines:string[];stayed:{name:string;reason:string}[];note:string;partial:boolean;list:{title:string;messages:number}[];
 /** Older conversations still to come in the background, newest first (fox/older-history.ts). */
 older?:NonNullable<AgentHistory['older']>}

/** OpenClaw in the shared shape: its channel instructions and extra agents become skills too. */
export function openClawHistory(data:OpenClawData,now=Date.now()):AgentHistory {
 const names=new Map(data.agents.map(agent=>[agent.id,agent]));
 const skills:BroughtSkill[]=[];
 const prompts=openClawChannelPrompts(data.config);
 for(const conversation of data.conversations){
  const prompt=openClawPromptFor(conversation,prompts);
  if(prompt){const skill=openClawConversationSkill(conversation,prompt);skills.push({name:skill.name,files:[{relative:'SKILL.md',text:skill.markdown}]});}
 }
 for(const agent of data.agents){
  if(agent.default)continue;
  const persona=data.personas[agent.id]??{soul:'',memory:'',user:''},titles=data.conversations.filter(c=>c.agentId===agent.id).map(c=>c.title);
  // An agent with nothing of its own (no instructions, memory or conversations) needs no skill.
  if(!persona.soul&&!persona.memory&&!persona.user&&!titles.length)continue;
  const skill=openClawAgentSkill({id:agent.id,name:agent.name,...persona,conversations:titles});
  skills.push({name:skill.name,files:[{relative:'SKILL.md',text:skill.markdown}]});
 }
 skills.push(...data.skills);
 return {
  conversations:data.conversations.map(c=>({key:c.agentId+':'+c.key,title:c.title,turns:c.turns})),
  notes:data.notes.map(note=>{const agent=names.get(note.agentId);return {session:migrationNotesSession('openclaw',agent&&!agent.default&&data.agents.length>1?agent.name:null),date:note.date,text:note.text};}),
  skills,routines:data.jobs.map(job=>openClawRoutine(job,now)),problems:data.problems,truncated:data.truncated,
 };
}

/** Everything one Agent here holds that Fox can bring over, or null when it is not here. */
/** `ownFolders`: Worldlet's own folders; a session run there is a Fox turn (`codex exec` keeps one), not the person's. */
export function readAgentHistory(source:MigrationSource,{now=Date.now(),home=os.homedir(),environment=process.env,ownFolders=[] as string[],own=((_session:string)=>false) as (session:string)=>boolean}={}):AgentHistory|null {
 // Fox's own Gateway sessions (`own`, history-sync ownHarnessSession) are not brought as the person's conversations.
 if(source==='openclaw'){const data=readOpenClaw(home,environment);return data?openClawHistory({...data,conversations:data.conversations.filter(c=>!own(c.key))},now):null;}
 if(source==='claude-code')return readClaudeCode(home,environment,ownFolders);
 if(source==='pi')return readPi(home,environment,ownFolders);
 if(source==='codex')return readCodex(home,environment,ownFolders);
 return readOwnHermes(home,environment);
}

/** Replaces `<home>/skills/<source>` with `skills` ({folder: {relative: text}}), all or nothing. */
function writeSkills(hermesHome:string,source:MigrationSource,skills:Map<string,Record<string,string>>){
 const parent=ensureDirectory(path.join(hermesHome,'skills')),live=path.join(parent,source);
 if(isLink(live))throw new Error('The brought skills folder is a link.');
 const stage=live+'.staging-'+crypto.randomUUID(),previous=live+'.previous-'+crypto.randomUUID();
 try{
  // The skills may come from a restored backup: only the shapes bringing an Agent makes are
  // written, and only inside the staging folder. Anything else is skipped and named by a code.
  let skipped=0;
  for(const [folder,files] of skills)for(const [relative,text] of Object.entries(files)){
   const parts=migrationSkillPath(folder,relative),target=parts&&typeof text==='string'?path.resolve(stage,...parts):'';
   if(!target||!target.startsWith(path.resolve(stage)+path.sep)){skipped++;continue;}
   writeAtomic(path.join(ensureDirectory(path.dirname(target)),path.basename(target)),text);
  }
  if(skipped)console.warn(`worldlet: brought-skill-path-rejected source=${source} count=${skipped}`);
  ensureDirectory(stage);
  if(fs.existsSync(live))fs.renameSync(live,previous);
  fs.renameSync(stage,live);
 }catch(error){
  fs.rmSync(stage,{recursive:true,force:true});
  if(fs.existsSync(previous)&&!fs.existsSync(live))fs.renameSync(previous,live);
  throw error;
 }
 fs.rmSync(previous,{recursive:true,force:true});
}

/** Brought conversations as the World keeps them, with IDs from the Agent and conversation, so bringing again (or
 * bringing older ones later, fox/older-history.ts) keeps the same turns. */
export function broughtConversations(source:MigrationSource,conversations:AgentHistory['conversations'],now=Date.now()){
 const fallback=isoSeconds(new Date(now));
 return conversations.map(conversation=>{
  let last:string|null=null;
  return {id:stableID(source,'conversation',conversation.key),title:conversation.title,session:migrationSession(source,conversation.title),turns:conversation.turns.map((turn,index)=>{
   last=turn.at??last;
   return {id:stableID(source,conversation.key,String(index)),role:turn.role,text:boundBytes(turn.text),createdAt:last??fallback};
  })};
 });
}

/** A turn read later from the Agent's history (fox/history-sync.ts), with the ID and size bringing gives it. */
export const broughtTurnId=(source:MigrationSource,key:string,index:string)=>stableID(source,key,index);
export {boundBytes};

/** `world`: the World's database, which keeps the skills and routines. */
export async function bringAgent(source:MigrationSource,{companion,world,hermesHome,importRoutines,now=Date.now(),home=os.homedir(),environment=process.env,ownFolders=[],own}:{companion:Companion;world:BroughtShelf|null;hermesHome:string|null;importRoutines:((routines:MigrationRoutine[])=>Promise<Row>)|null;now?:number;home?:string;environment?:NodeJS.ProcessEnv;ownFolders?:string[];own?:(session:string)=>boolean}):Promise<BroughtAgent|null> {
 const data=readAgentHistory(source,{now,home,environment,ownFolders,own});
 if(!data)return null;

 // Conversations and notes become Fox's past conversations in the World's database.
 const fallback=isoSeconds(new Date(now));
 const conversations=broughtConversations(source,data.conversations,now);
 const notes=data.notes.map(note=>({id:stableID(source+'-note',note.session,note.date,note.text.slice(0,200)),session:note.session,date:note.date,text:boundBytes(note.text),createdAt:/^\d{4}-\d{2}-\d{2}$/.test(note.date)?note.date+'T12:00:00Z':fallback}));
 // Each part is best effort: one that cannot be copied leaves the others in place.
 let partial=data.truncated||data.problems.length>0;
 if(conversations.some(c=>c.turns.length)||notes.length){try{companion.replaceImportedHistory(source,{conversations:conversations.filter(c=>c.turns.length),notes});}catch{partial=true;}}

 // Skills go under one folder per source, named so they never clash with each other.
 const skills:Record<string,Record<string,string>>={};
 for(const skill of data.skills){
  let folder=migrationSkillName(skill.name),n=2;
  while(skills[folder])folder=migrationSkillName(skill.name)+'-'+n++;
  skills[folder]=Object.fromEntries(skill.files.map(file=>[file.relative,file.relative==='SKILL.md'?migrationSkillMarkdown(file.text,folder,source):file.text]));
 }
 // Scheduled jobs become routines; the ones with no safe equivalent stay with that Agent.
 const routines:MigrationRoutine[]=[],stayed:{name:string;reason:string}[]=[];
 for(const result of data.routines){if('routine' in result)routines.push(result.routine);else stayed.push({name:result.name,reason:result.reason});}
 // The World keeps them first; Fox's Harness gets a copy.
 const entry:BroughtStore={version:1,source,skills,routines};
 if(world){try{moveLegacyBrought(world);world.replaceBrought(source,skills,routines);}catch{partial=true;}}
 const placed=await placeBrought(entry,{hermesHome,importRoutines});
 partial||=placed.partial;stayed.push(...placed.stayed);
 const created=placed.routines,placedSkills=placed.skills;

 const titles=[...new Set(data.conversations.map(c=>c.title))];
 return {conversations:titles.length,messages:data.conversations.reduce((sum,c)=>sum+c.turns.length,0),notes:data.notes.length,
  skills:placedSkills,routines:created,stayed,partial,
  // What setup's second page shows coming in, one conversation at a time (owner request 2026-10-04).
  list:data.conversations.filter(c=>c.turns.length).slice(0,60).map(c=>({title:c.title,messages:c.turns.length})),
  ...data.older?{older:data.older}:{},
  note:migrationMemoryNote({source,conversations:titles,routines:created,skills:placedSkills,notes:data.notes.length})};
}
