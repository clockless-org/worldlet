import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {HarnessSkill,HarnessSkillChange,HarnessSkillDraft,HarnessSkills} from '../../../../../contracts/harness-services.ts';
import {commandLine,commandReason,harnessService,hermesDisabledAfter,hermesDisabledSkills,hermesHubSkills,hermesSkillCommand,openClawSkillCommand,openClawSkillEnabled,openClawSkillKey,skillDraftProblem,skillFrontmatter,skillMarkdown} from '../../../../../core/agent/index.ts';
import {claudeCodeHome,codexHome,directories,inside,json,piHome,readFile} from './agent-files.ts';
import {runSendCommand,type SendCommand} from './harness-send.ts';
import {discoverHermes} from './hermes-files.ts';
import {currentEnvironment,harnessEnvironment,locateLocalHarnesses,type HarnessEnvironment,type LocalHarnessInstall} from './local-harness.ts';
import {openClawAgents,openClawSkillRoots,readOpenClawConfig} from './openclaw-files.ts';

// The `skills` Harness service (contracts/harness-services.ts HarnessSkills) for the local Harnesses that declare it
// (core/agent/harness-services.ts), as each keeps its skills (core/agent/PORTABILITY.md#the-agents-skills-in-the-world).
// Listing only reads its folder. Saving adds one new skill the person confirmed, the Agent's own way: OpenClaw's
// `openclaw skills install <folder> --as <name> --agent <id>` (docs/cli/skills.md, OpenClaw 2026.9.8), Hermes Agent's
// `skills/<name>/SKILL.md` where its own `skill_manage` tool creates one (tools/skill_manager_tool.py `_create_skill`),
// since `hermes skills install` takes only a hub identifier or a URL. Saving never changes or removes a skill already there.
// Settings › Agents turns one off or on, or removes it, only with the Agent's own command after the person
// confirmed it (core/agent/harness-controls.ts says where each was checked): Hermes Agent's `hermes config set
// skills.disabled` and `hermes skills uninstall` (hub-installed skills only), OpenClaw's `openclaw config set
// skills.entries.<key>.enabled`; OpenClaw has no command of its own that removes a skill, so it offers none.
// Claude Code, Codex and pi keep a skill as `<home>/skills/<name>/SKILL.md` (CLAUDE_CONFIG_DIR, CODEX_HOME and
// PI_CODING_AGENT_DIR move the home): listed only, since none has a command that turns one off or removes it.
// The World asks for the service, never for a Harness by name: one that declares no `skills` gets null.

const SKILL_FILE=256_000;
const fail=(message:string):never=>{throw new Error(message);};
type Locate=(environment:HarnessEnvironment)=>LocalHarnessInstall[];
const reason=(run:{code:number|null;stdout:string;stderr:string})=>commandReason(run.stderr+'\n'+run.stdout)||(run.code===null?'it did not answer in time':'it stopped with code '+run.code);
/** The skill a change names, as listed now, or why it cannot change. */
function changing(list:HarnessSkill[],change:HarnessSkillChange,title:string):HarnessSkill {
 const skill=list.find(item=>item.name===change.skill);
 if(!skill)return fail(`${title} no longer has this skill.`);
 if(change.action==='remove'&&!skill.removable)return fail(`${title} has no command of its own that removes this skill.`);
 if(change.action==='disable'&&skill.enabled===false)return fail('It is off already.');
 if(change.action==='enable'&&skill.enabled!==false)return fail('It is on already.');
 return skill;
}
/** Skill folders under `folder` (a SKILL.md each), `depth` levels down for grouped ones, without `skip`. */
function skillFolders(root:string,folder:string,depth:number,skip:ReadonlySet<string>=new Set()):{folder:string;name:string;description:string;text:string}[] {
 const found:{folder:string;name:string;description:string;text:string}[]=[];
 const visit=(dir:string,level:number)=>{
  for(const name of directories(dir).slice(0,300)){
   if(found.length>=300||name.startsWith('.')||skip.has(name))continue;
   const base=path.join(dir,name),text=readFile(root,path.join(base,'SKILL.md'),SKILL_FILE);
   if(text)found.push({folder:base,...skillFrontmatter(text,name),text});
   else if(level<depth)visit(base,level+1);
  }
 };
 visit(folder,0);
 return found;
}
const iso=(value:unknown)=>{const at=typeof value==='string'?Date.parse(value):NaN;return Number.isFinite(at)?at:0;};
/** Writes `<parent>/<name>/SKILL.md` as a new folder: nothing is written when it is there already. */
function writeNew(parent:string,root:string,draft:HarnessSkillDraft):string {
 fs.mkdirSync(parent,{recursive:true});
 if(!inside(parent,root)&&path.resolve(parent)!==path.resolve(root))fail('Your Agent’s skills folder is outside its home.');
 const folder=path.join(parent,draft.name);
 fs.mkdirSync(folder);
 const temp=path.join(folder,'.SKILL.md.worldlet');
 fs.writeFileSync(temp,skillMarkdown(draft),{mode:0o644,flag:'wx'});fs.renameSync(temp,path.join(folder,'SKILL.md'));
 return folder;
}

// Hermes Agent ---------------------------------------------------------------------------------

function hermesSkills(environment:HarnessEnvironment,{locate,run}:{locate:Locate;run:SendCommand}):HarnessSkills {
 const root=()=>discoverHermes(environment.home||undefined,environment.env);
 const bundled=(home:string)=>new Set(readFile(home,path.join(home,'skills','.bundled_manifest')).split('\n').map(line=>line.split(':')[0].trim()).filter(Boolean));
 const config=(home:string)=>readFile(home,path.join(home,'config.yaml'),4_000_000);
 const list=(home:string):HarnessSkill[]=>{
  // Its own record of each skill's use (tools/skill_usage.py): `last_used_at` for a `/name` turn, `last_viewed_at` when
  // the Agent loaded it to follow it. Turned off: config.yaml `skills.disabled`; removable: installed from its hub.
  const usage=json(readFile(home,path.join(home,'skills','.usage.json'),4_000_000))??{};
  const off=new Set(hermesDisabledSkills(config(home))),hub=hermesHubSkills(json(readFile(home,path.join(home,'skills','.hub','lock.json'),4_000_000)));
  return skillFolders(home,path.join(home,'skills'),2,bundled(home)).map(skill=>{
   const record=usage[skill.name]&&typeof usage[skill.name]==='object'?usage[skill.name]:{},at=Math.max(iso(record.last_used_at),iso(record.last_viewed_at));
   return {name:skill.name,description:skill.description,where:skill.folder,...at?{lastUsedAt:at}:{},enabled:!off.has(skill.name),removable:hub.has(skill.name)};
  });
 };
 /** The command a change runs in that home, with the `skills.disabled` list it sets. */
 const plan=async(change:HarnessSkillChange,live:boolean)=>{
  const home=root()??fail('Hermes Agent’s home was not found on this computer.');
  changing(list(home),change,'Hermes Agent');
  const install=locate(environment).find(item=>item.id==='hermes')??fail('Hermes Agent is not installed on this computer.');
  const env={...harnessEnvironment(install,environment),HERMES_HOME:home};
  if(change.action==='remove')return {home,install,env,args:hermesSkillCommand(change,null)};
  // The list as Hermes Agent itself reads it when the change runs; its own file for the preview.
  let current:unknown=hermesDisabledSkills(config(home));
  if(live){
   const got=await run(install,['config','get','skills.disabled','--json','--raw'],{env,timeout:20_000});
   const start=got.stdout.search(/[[{"]|null/);
   if(got.code===0&&start>=0)try{current=JSON.parse(got.stdout.slice(start).trim())??[];}catch{}
  }
  const next=hermesDisabledAfter(current,change)??fail(change.action==='disable'?'It is off already.':'It is on already.');
  return {home,install,env,args:hermesSkillCommand(change,next)};
 };
 return {
  list:async()=>{const home=root();try{return home?list(home):[];}catch{return [];}},
  async preview(change){return commandLine('hermes',(await plan(change,false)).args);},
  async change(change){
   const {home,install,env,args}=await plan(change,true);
   const result=await run(install,args,{env,timeout:90_000});
   if(result.code!==0)fail(`Hermes Agent did not do it: ${reason(result)}`);
   const now=list(home).find(skill=>skill.name===change.skill);
   if(change.action==='remove'?!!now:(now?.enabled===false)!==(change.action==='disable'))fail(`Hermes Agent did not do it: ${reason(result)}`);
  },
  async save(draft){
   const problem=skillDraftProblem(draft);if(problem)fail(problem);
   const home=root()??fail('Hermes Agent’s home was not found on this computer.');
   // `skills.create_dir` sends its new skills to another folder (agent/skill_utils.py get_skill_create_dir).
   if(/^\s+create_dir:[ \t]*[^\s#]/m.test(readFile(home,path.join(home,'config.yaml'),4_000_000)))fail('Hermes Agent is set to create skills in another folder (skills.create_dir), so the World keeps this one.');
   if(bundled(home).has(draft.name)||list(home).some(skill=>skill.name===draft.name||path.basename(skill.where)===draft.name))fail(`Hermes Agent already has a skill named ${draft.name}.`);
   return {name:draft.name,where:writeNew(path.join(home,'skills'),home,draft)};
  },
 };
}

// OpenClaw -------------------------------------------------------------------------------------

function openClawSkills(environment:HarnessEnvironment,{locate,run}:{locate:Locate;run:SendCommand}):HarnessSkills {
 const {home,env}=environment;
 const list=():HarnessSkill[]=>{
  const seen=new Set<string>(),found:HarnessSkill[]=[];
  // Each agent's workspace skills come before the shared ones, as OpenClaw loads them (docs/concepts/agent.md#skills).
  const config=readOpenClawConfig(home||undefined,env);
  for(const {root,folder} of openClawSkillRoots(home||undefined,env,config))for(const skill of skillFolders(root,folder,1)){
   if(seen.has(skill.name))continue;seen.add(skill.name);
   const key=openClawSkillKey(skill.name,skill.text);
   found.push({name:skill.name,description:skill.description,where:skill.folder,...key?{enabled:openClawSkillEnabled(config,key)}:{},removable:false});
  }
  return found;
 };
 /** `openclaw config set skills.entries.<key>.enabled …`; its skills have no Remove of its own. */
 const plan=(change:HarnessSkillChange)=>{
  const skill=changing(list(),change,'OpenClaw');
  const key=openClawSkillKey(skill.name,readFile(path.dirname(skill.where),path.join(skill.where,'SKILL.md'),SKILL_FILE))??fail('OpenClaw cannot turn this skill off by its name.');
  return {key,args:openClawSkillCommand(change,key)??fail('OpenClaw has no command of its own that removes a skill.')};
 };
 return {
  list:async()=>{try{return list();}catch{return [];}},
  async preview(change){return commandLine('openclaw',plan(change).args);},
  async change(change){
   const {key,args}=plan(change);
   const install=locate(environment).find(item=>item.id==='openclaw')??fail('OpenClaw is not installed on this computer.');
   const result=await run(install,args,{env:harnessEnvironment(install,environment),timeout:60_000});
   if(result.code!==0)fail(`OpenClaw did not do it: ${reason(result)}`);
   if(openClawSkillEnabled(readOpenClawConfig(home||undefined,env),key)!==(change.action==='enable'))fail(`OpenClaw did not do it: ${reason(result)}`);
  },
  async save(draft){
   const problem=skillDraftProblem(draft);if(problem)fail(problem);
   const install=locate(environment).find(item=>item.id==='openclaw')??fail('OpenClaw is not installed on this computer.');
   const agent=openClawAgents(home||undefined,env).find(item=>item.default)??fail('OpenClaw has no agent to add the skill to.');
   if(list().some(skill=>skill.name===draft.name))fail(`OpenClaw already has a skill named ${draft.name}.`);
   // `install ./path` copies a local folder whose root holds SKILL.md into the agent's workspace `skills/`.
   const stage=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-skill-'));
   try{
    const folder=writeNew(stage,stage,draft);
    const {code,stderr,stdout}=await run(install,['skills','install',folder,'--as',draft.name,'--agent',agent.id],{env:harnessEnvironment(install,environment),timeout:60_000});
    if(code!==0)fail((stderr||stdout).trim().split('\n').filter(Boolean).at(-1)?.slice(0,300)||'OpenClaw did not add the skill.');
   }finally{try{fs.rmSync(stage,{recursive:true,force:true});}catch{}}
   return {name:draft.name,where:agent.workspace?path.join(agent.workspace,'skills',draft.name):draft.name};
  },
 };
}

// Claude Code, Codex, pi ---------------------------------------------------------------------------------------

function folderSkills(root:string):HarnessSkills {
 return {list:async()=>{try{return skillFolders(root,path.join(root,'skills'),0).map(skill=>({name:skill.name,description:skill.description,where:skill.folder}));}catch{return [];}}};
}

/** The `skills` service of the person's `id` Agent on this computer, or null when it declares none. */
export function harnessSkills(id:string,environment:HarnessEnvironment=currentEnvironment(),{locate=locateLocalHarnesses,run=runSendCommand}:{locate?:(environment:HarnessEnvironment)=>LocalHarnessInstall[];run?:SendCommand}={}):HarnessSkills|null {
 if(!harnessService(id,'skills'))return null;
 const home=environment.home||undefined,env=environment.env;
 return id==='hermes'?hermesSkills(environment,{locate,run}):id==='openclaw'?openClawSkills(environment,{locate,run})
  :id==='claude-code'?folderSkills(claudeCodeHome(home,env)):id==='codex'?folderSkills(codexHome(home,env)):id==='pi'?folderSkills(piHome(home,env)):null;
}
