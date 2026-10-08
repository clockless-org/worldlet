import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {HarnessSkill,HarnessSkillDraft,HarnessSkills} from '../../../../../contracts/harness-services.ts';
import {harnessService,skillDraftProblem,skillFrontmatter,skillMarkdown} from '../../../../../core/agent/index.ts';
import {directories,inside,json,readFile} from './agent-files.ts';
import {runSendCommand,type SendCommand} from './harness-send.ts';
import {discoverHermes} from './hermes-files.ts';
import {currentEnvironment,harnessEnvironment,locateLocalHarnesses,type HarnessEnvironment,type LocalHarnessInstall} from './local-harness.ts';
import {openClawState} from './local-memory.ts';
import {openClawAgents} from './openclaw-files.ts';

// The `skills` Harness service (contracts/harness-services.ts HarnessSkills) for the local Harnesses that declare it
// (core/agent/harness-services.ts), as each keeps its skills (core/agent/PORTABILITY.md#the-agents-skills-in-the-world).
// Listing only reads its folder. Saving adds one new skill the person confirmed, the Agent's own way: OpenClaw's
// `openclaw skills install <folder> --as <name> --agent <id>` (docs/cli/skills.md, OpenClaw 2026.9.8), Hermes Agent's
// `skills/<name>/SKILL.md` where its own `skill_manage` tool creates one (tools/skill_manager_tool.py `_create_skill`),
// since `hermes skills install` takes only a hub identifier or a URL. Neither changes or removes a skill already there.
// The World asks for the service, never for a Harness by name: one that declares no `skills` gets null.

const SKILL_FILE=256_000;
const fail=(message:string):never=>{throw new Error(message);};
/** Skill folders under `folder` (a SKILL.md each), `depth` levels down for grouped ones, without `skip`. */
function skillFolders(root:string,folder:string,depth:number,skip:ReadonlySet<string>=new Set()):{folder:string;name:string;description:string}[] {
 const found:{folder:string;name:string;description:string}[]=[];
 const visit=(dir:string,level:number)=>{
  for(const name of directories(dir).slice(0,300)){
   if(found.length>=300||name.startsWith('.')||skip.has(name))continue;
   const base=path.join(dir,name),text=readFile(root,path.join(base,'SKILL.md'),SKILL_FILE);
   if(text)found.push({folder:base,...skillFrontmatter(text,name)});
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

function hermesSkills(environment:HarnessEnvironment):HarnessSkills {
 const root=()=>discoverHermes(environment.home||undefined,environment.env);
 const bundled=(home:string)=>new Set(readFile(home,path.join(home,'skills','.bundled_manifest')).split('\n').map(line=>line.split(':')[0].trim()).filter(Boolean));
 const list=(home:string):HarnessSkill[]=>{
  // Its own record of each skill's use (tools/skill_usage.py): `last_used_at` for a `/name` turn, `last_viewed_at` when
  // the Agent loaded it to follow it.
  const usage=json(readFile(home,path.join(home,'skills','.usage.json'),4_000_000))??{};
  return skillFolders(home,path.join(home,'skills'),2,bundled(home)).map(skill=>{
   const record=usage[skill.name]&&typeof usage[skill.name]==='object'?usage[skill.name]:{},at=Math.max(iso(record.last_used_at),iso(record.last_viewed_at));
   return {name:skill.name,description:skill.description,where:skill.folder,...at?{lastUsedAt:at}:{}};
  });
 };
 return {
  list:async()=>{const home=root();try{return home?list(home):[];}catch{return [];}},
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

function openClawSkills(environment:HarnessEnvironment,{locate,run}:{locate:(environment:HarnessEnvironment)=>LocalHarnessInstall[];run:SendCommand}):HarnessSkills {
 const {home,env}=environment;
 const list=():HarnessSkill[]=>{
  const state=openClawState(home||undefined,env),seen=new Set<string>(),found:HarnessSkill[]=[];
  // Each agent's workspace skills come before the shared ones, as OpenClaw loads them (docs/tools/skills.md).
  const roots=[...openClawAgents(home||undefined,env).flatMap(agent=>agent.workspace?[agent.workspace]:[]),state];
  for(const root of roots)for(const skill of skillFolders(root,path.join(root,'skills'),1)){
   if(seen.has(skill.name))continue;seen.add(skill.name);
   found.push({name:skill.name,description:skill.description,where:skill.folder});
  }
  return found;
 };
 return {
  list:async()=>{try{return list();}catch{return [];}},
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

/** The `skills` service of the person's `id` Agent on this computer, or null when it declares none. */
export function harnessSkills(id:string,environment:HarnessEnvironment=currentEnvironment(),{locate=locateLocalHarnesses,run=runSendCommand}:{locate?:(environment:HarnessEnvironment)=>LocalHarnessInstall[];run?:SendCommand}={}):HarnessSkills|null {
 if(!harnessService(id,'skills'))return null;
 return id==='hermes'?hermesSkills(environment):id==='openclaw'?openClawSkills(environment,{locate,run}):null;
}
