import fs from 'node:fs';
import path from 'node:path';
import {ensureDirectory,writeAtomic,writeJSON} from '../../files.ts';
import {bundledSkills,hermesJobs,inside,json,readFile} from './agent-files.ts';

/** Fox's own Hermes profile moves into the person's stock Hermes Agent (owner decisions 2026-10-09: Worldlet customizes
 * nothing below the Harness contract, so there is no built-in Hermes; a person who used it gets stock Hermes Agent, with
 * what it had learned copied over). Once, when the person's Hermes Agent becomes Fox's Agent, and only what that Hermes
 * Agent does not have yet: its memory files (USER.md, MEMORY.md) when missing or empty there, each skill folder it
 * lacks, and the scheduled jobs the person made (`hermes cron`) when it has none. Never its settings, model, keys or
 * sign-ins (config.yaml, .env, auth.json: Worldlet wrote those for its own runtime), nor jobs Worldlet made for itself.
 * Nothing of the person's Hermes Agent is replaced, and Fox's own profile is left as it was. */
export interface FoxMove {memories:string[];skills:number;jobs:number}
const MARK='fox-moved.json';
const SKILL_LIMIT=2_000_000;

export function moveFoxProfile(root:string,own:string,target:string):FoxMove|null {
 const mark=path.join(root,MARK);
 if(fs.existsSync(mark)||!fs.existsSync(path.join(own,'config.yaml'))||!fs.existsSync(target))return null;
 const moved:FoxMove={memories:[],skills:0,jobs:0};
 for(const name of ['USER.md','MEMORY.md']){
  const text=readFile(own,path.join(own,'memories',name));
  if(!text.trim()||present(path.join(target,'memories',name)))continue;
  ensureDirectory(path.join(target,'memories'));
  writeAtomic(path.join(target,'memories',name),text);
  moved.memories.push(name);
 }
 moved.skills=copySkills(path.join(own,'skills'),path.join(target,'skills'),bundledSkills(own));
 // The person's own scheduled jobs; a Hermes Agent that already has jobs keeps its list as it is.
 const jobs=hermesJobs(own).filter((job:any)=>job&&typeof job==='object'&&typeof job.id==='string'&&job.origin?.platform!=='worldlet');
 if(jobs.length&&!hermesJobs(target).length){
  const file=path.join(target,'cron','jobs.json'),current=json(readFile(target,file));
  if(!fs.existsSync(file)||fs.lstatSync(file).isFile()){
   ensureDirectory(path.join(target,'cron'));
   writeJSON(file,{...current&&typeof current==='object'&&!Array.isArray(current)?current:{},jobs});
   moved.jobs=jobs.length;
  }
 }
 writeJSON(mark,{v:1,to:target,at:new Date().toISOString(),...moved},0o644);
 return moved;
}

/** Whether `file` holds something (anything but a regular file counts, so a link is never written through). */
function present(file:string){
 try{const stat=fs.lstatSync(file);return !stat.isFile()||!!fs.readFileSync(file,'utf8').trim();}catch{return false;}
}
/** Each skill (a folder with SKILL.md, up to two levels down) the target lacks, copied whole: bounded regular files only.
 * Hermes' own bundled skills (its `.bundled_manifest`) are its installer's to provide. */
function copySkills(from:string,to:string,bundled:Set<string>):number {
 let count=0;
 const visit=(dir:string,depth:number)=>{
  let entries:fs.Dirent[]=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const entry of entries){
   if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
   const source=path.join(dir,entry.name),relative=path.relative(from,source);
   if(fs.existsSync(path.join(source,'SKILL.md'))){
    if(bundled.has(entry.name))continue;
    const destination=path.join(to,relative);
    if(fs.existsSync(destination))continue;
    if(copyTree(source,destination,from))count++;
   }else if(depth<2)visit(source,depth+1);
  }
 };
 visit(from,1);
 return count;
}
function copyTree(source:string,destination:string,root:string):boolean {
 const files:{relative:string;data:Buffer}[]=[];let total=0;
 const walk=(dir:string)=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())walk(file);
   else if(entry.isFile()&&inside(file,root)){const data=fs.readFileSync(file);total+=data.length;if(total>SKILL_LIMIT)throw new Error('skill too large');files.push({relative:path.relative(source,file),data});}
  }
 };
 try{walk(source);}catch{return false;}
 for(const {relative,data} of files){ensureDirectory(path.dirname(path.join(destination,relative)));writeAtomic(path.join(destination,relative),data);}
 return files.length>0;
}
