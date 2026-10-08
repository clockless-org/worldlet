import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {realPath as real,writeAtomic,WorldletError} from '../../files.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';
import {isMigrationSource,type MigrationSource} from '../../../../../core/agent/index.ts';
import {claudeCodeHome,codexHome,piHome} from './agent-files.ts';
import {declaredName,discoverHermes} from './hermes-files.ts';

// A person's own Agent (OpenClaw, Claude Code, pi, Hermes Agent) is a whole Agent: model plus
// Harness, with a name and memory. Choosing it at setup keeps Fox on the built-in Hermes Harness and
// copies its name, About you and long-term memory into Worldlet (owner decision 2026-10-02: port,
// not share), the same way for all four (owner request 2026-10-03: one flow). The original files are
// only read, never written, and nothing else in that Agent is touched.

// Codex is different: it stays Fox's model (its sign-in), so choosing it is not adopting an Agent,
// though its memory and conversations come over through the same flow.
export type AdoptableAgent=Exclude<MigrationSource,'codex'>;
export const isAdoptable=(value:unknown):value is AdoptableAgent=>isMigrationSource(value)&&value!=='codex';
/** `soul`: its persona (who it is, how it talks), only when it declares a name, so an untouched
 * template is not brought. `model`: it has a model setting the Hermes host may copy if it is an API
 * key (`modelAdopt`). */
export interface LocalAgentMemory {name:string|null;soul:string;user:string;longTerm:string;model:boolean}

const LIMIT=1_000_000;
const utf8=new TextDecoder('utf-8',{fatal:true});
/** A regular file inside `home`, UTF-8 and at most 1 MB; anything else counts as absent. */
function readInside(home:string,relative:string):string {
 const file=path.join(home,relative);
 try{
  const info=fs.lstatSync(file);
  if(!info.isFile()||info.size>LIMIT||!real(file).startsWith(real(home)+path.sep))return '';
  return utf8.decode(fs.readFileSync(file)).trim();
 }catch{return '';}
}
const firstOf=(home:string,names:string[])=>names.map(name=>readInside(home,name)).find(Boolean)??'';

/** OpenClaw's workspace: `agents.defaults.workspace` in openclaw.json when it is plain JSON, else
 * `workspace` (or `workspace-<profile>`) under its state folder. */
export const openClawState=(home=os.homedir(),environment=process.env)=>environment.OPENCLAW_STATE_DIR&&path.isAbsolute(environment.OPENCLAW_STATE_DIR)?environment.OPENCLAW_STATE_DIR:path.join(home,'.openclaw');
export function openClawWorkspace(home=os.homedir(),environment=process.env):string|null {
 const state=openClawState(home,environment);
 const candidates:string[]=[];
 try{
  const configured=JSON.parse(fs.readFileSync(path.join(state,'openclaw.json'),'utf8'))?.agents?.defaults?.workspace;
  if(typeof configured==='string'&&configured.trim())candidates.push(configured.trim().replace(/^~(?=$|[\\/])/,home));
 }catch{}
 const profile=environment.OPENCLAW_PROFILE;
 if(profile&&profile!=='default'&&/^[A-Za-z0-9_-]+$/.test(profile))candidates.push(path.join(state,'workspace-'+profile));
 candidates.push(path.join(state,'workspace'));
 const found=candidates.find(folder=>path.isAbsolute(folder)&&fs.existsSync(folder)&&fs.statSync(folder).isDirectory());
 return found?real(found):null;
}

/** The name and memory a person's own Agent keeps, or null when it has none here. */
export function readLocalAgentMemory(id:MigrationSource,home=os.homedir(),environment=process.env):LocalAgentMemory|null {
 let memory:LocalAgentMemory;
 if(id==='hermes'){
  const profile=discoverHermes(home,environment);
  if(!profile)return null;
  // Hermes ships a default SOUL.md; only an explicit declaration counts as a name. An IDENTITY.md beside it (as
  // OpenClaw keeps) names it first.
  const soul=readInside(profile,'SOUL.md'),name=declaredName(readInside(profile,'IDENTITY.md'))??declaredName(soul);
  memory={name,soul:name?soul:'',user:readInside(profile,'memories/USER.md'),longTerm:readInside(profile,'memories/MEMORY.md'),model:/^\s+provider\s*:/m.test(readInside(profile,'config.yaml'))};
 }else if(id==='claude-code'||id==='pi'||id==='codex'){
  // Their memory is one instructions file and they keep no name. Claude Code's model is a sign-in
  // (never copied), Codex's is already Fox's; pi may hold API keys in auth.json.
  const root=id==='pi'?piHome(home,environment):id==='codex'?codexHome(home,environment):claudeCodeHome(home,environment);
  let keys=false;
  if(id==='pi')try{keys=Object.values(JSON.parse(readInside(root,'auth.json')||'{}')).some((entry:any)=>entry?.type==='api_key'&&typeof entry.key==='string'&&entry.key);}catch{}
  memory={name:null,soul:'',user:'',longTerm:readInside(root,id==='claude-code'?'CLAUDE.md':'AGENTS.md'),model:keys};
 }else{
  const workspace=openClawWorkspace(home,environment),model=!!readInside(openClawState(home,environment),'openclaw.json');
  if(!workspace&&!model)return null;
  const soul=workspace?readInside(workspace,'SOUL.md'):'',name=workspace?declaredName(readInside(workspace,'IDENTITY.md'))??declaredName(soul):null;
  memory=workspace?{name,soul:name?soul:'',user:readInside(workspace,'USER.md'),longTerm:firstOf(workspace,['MEMORY.md','memory.md']),model}:{name:null,soul:'',user:'',longTerm:'',model};
 }
 return memory.name||memory.user||memory.longTerm||memory.model?memory:null;
}
/** The folder whose model setting the Hermes host reads for `modelAdopt`. */
export function ownAgentHome(id:MigrationSource,home=os.homedir(),environment=process.env):string|null {
 if(id==='hermes')return discoverHermes(home,environment);
 if(id==='pi'){const root=piHome(home,environment);return fs.existsSync(root)?real(root):null;}
 if(id!=='openclaw')return null;
 const state=openClawState(home,environment);
 return fs.existsSync(state)?real(state):null;
}

/** Which Agent's name and memory Fox took at setup; shown as the chosen Agent on the first page. */
export function readAdopted(root:string):AdoptableAgent|null {
 const value=readAgentSetting(root,'adopted-agent');
 return value?.version===1&&isAdoptable(value.id)?value.id as AdoptableAgent:null;
}
export function writeAdopted(root:string,id:AdoptableAgent|null){
 if(id!==null&&!isAdoptable(id))throw new WorldletError('Unknown local Agent.');
 writeAgentSetting(root,'adopted-agent',id===null?null:{version:1,id});
}

/** A few words for each fact setup's second page shows (owner request 2026-10-06): its personality, what it
 * knows about the person and its model, read from its own files. Plain text, at most ~60 characters each. */
export interface LocalAgentSummary {personality:string;about:string;model:string}
const SHORT=60;
/** The first sentence of a Markdown memory, without headings, list marks, links or a bare name line. */
export function firstSentence(text:string,name:string|null=null):string {
 let fenced=false;
 for(const raw of text.slice(0,32000).split(/\r\n|\r|\n|§/)){
  const line=raw.trim();
  if(line.startsWith('```')){fenced=!fenced;continue;}
  if(fenced||!line||/^(#|---|===|<!--|\|)/.test(line))continue;
  let plain=line.replace(/^(?:[-*+>]\s+|\d+[.)]\s+)+/,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[*_`]+/g,'').trim();
  // A line that only declares a name says nothing more.
  if(/^(?:name|agent name|assistant name|名字|名称)\s*[:：]/iu.test(plain))continue;
  if(name)plain=plain.replace(new RegExp('^(?:you are|i am|i\'m|your name is|my name is)\\s+'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*[,，.。!！:：—–-]*\\s*','iu'),'');
  plain=plain.replace(/^(?:you are|you're)\s+/i,'');
  const sentence=(/^(.+?[.!?。！？])(?:\s|$)/u.exec(plain)?.[1]??plain).replace(/[.。]$/u,'').trim();
  if(sentence.length<3)continue;
  const capital=sentence.charAt(0).toUpperCase()+sentence.slice(1);
  if(capital.length<=SHORT)return capital;
  const cut=capital.slice(0,SHORT-1),space=cut.lastIndexOf(' ');
  return (space>SHORT/2?cut.slice(0,space):cut).replace(/[\s,;:，、—–-]+$/u,'')+'…';
 }
 return '';
}
/** The model an Agent's own settings name, when they name one (never a key or account). */
export function localAgentModel(id:MigrationSource,home=os.homedir(),environment=process.env):string {
 const clean=(value:unknown)=>typeof value==='string'&&/^[\w.:/@+-]{1,60}$/.test(value.trim())?value.trim().replace(/^[\w-]+\//,''):'';
 try{
  if(id==='hermes'){
   const profile=discoverHermes(home,environment);if(!profile)return '';
   const config=readInside(profile,'config.yaml');
   const block=/^model\s*:\s*\n((?:[ \t]+.*\n?)+)/m.exec(config)?.[1]??'';
   const value=/^[ \t]+(?:default|model|name)\s*:\s*["']?([^"'#\n]+)/m.exec(block)?.[1]??/^model[ \t]*:[ \t]*["']?([^"'#\n]+)/m.exec(config)?.[1];
   return clean(value);
  }
  if(id==='codex')return clean(/^model\s*=\s*["']([^"']+)["']/m.exec(readInside(codexHome(home,environment),'config.toml'))?.[1]);
  if(id==='claude-code')return clean(JSON.parse(readInside(claudeCodeHome(home,environment),'settings.json')||'{}')?.model);
  if(id==='pi')return clean(JSON.parse(readInside(piHome(home,environment),'settings.json')||'{}')?.defaultModel);
  const model=JSON.parse(readInside(openClawState(home,environment),'openclaw.json')||'{}')?.agents?.defaults?.model;
  return clean(typeof model==='string'?model:model?.primary);
 }catch{return '';}
}
export function summarizeLocalAgent(id:MigrationSource,memory:LocalAgentMemory|null,home=os.homedir(),environment=process.env):LocalAgentSummary {
 return {personality:memory?.soul?firstSentence(memory.soul,memory.name):'',about:memory?.user?firstSentence(memory.user):'',model:localAgentModel(id,home,environment)};
}
