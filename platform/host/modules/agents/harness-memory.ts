import fs from 'node:fs';
import path from 'node:path';
import {harnessService,isMigrationSource,memoryEntries} from '../../../../agent/gate/index.ts';
import type {HarnessMemory,HarnessMemoryEntry} from '../../../../contracts/harness-services.ts';
import {claudeCodeHome,codexHome,piHome} from './agent-files.ts';
import {discoverHermes} from './hermes-files.ts';
import {openClawWorkspace,readLocalAgentMemory} from './local-memory.ts';
import type {HarnessEnvironment,LocalHarnessInstall} from './local-harness.ts';

// The `memory` Harness service (contracts/harness-services.ts HarnessMemory) for every local Agent that declares it
// (agent/gate/harness-services.ts): the same files setup reads to bring an Agent's memory over (local-memory.ts
// readLocalAgentMemory: bounded regular UTF-8 files inside the Agent's own folder), as entries (core memoryEntries).
// Only read: Worldlet never writes them, and forgetting one is a request to the Agent in Fox's conversation.

/** The folder each Agent's memory files are in, and their names there, for `where`. */
function memoryFiles(id:string,home:string|undefined,env:NodeJS.ProcessEnv):{root:string;user:string;memory:string}|null {
 if(id==='hermes'){const root=discoverHermes(home,env);return root?{root,user:'memories/USER.md',memory:'memories/MEMORY.md'}:null;}
 if(id==='openclaw'){const root=openClawWorkspace(home,env);return root?{root,user:'USER.md',memory:'MEMORY.md'}:null;}
 if(id==='claude-code')return {root:claudeCodeHome(home,env),user:'',memory:'CLAUDE.md'};
 if(id==='codex')return {root:codexHome(home,env),user:'',memory:'AGENTS.md'};
 if(id==='pi')return {root:piHome(home,env),user:'',memory:'AGENTS.md'};
 return null;
}
/** A file's place said the short way: under the person's home as `~/…`, with `/` on Windows too. Hermes Agent's folder
 * is found by its real path, so a home reached through a link (macOS `/var` → `/private/var`) matches by its real path. */
function shortPath(file:string,home:string):string {
 if(!home)return file;
 let real=home;try{real=fs.realpathSync.native(home);}catch{}
 const base=[home,real].find(base=>file.startsWith(base+path.sep));
 return base?'~'+file.slice(base.length).split(path.sep).join('/'):file;
}

export function harnessMemory(install:LocalHarnessInstall,environment:HarnessEnvironment):HarnessMemory|null {
 const id=install.id;
 if(!harnessService(id,'memory')||!isMigrationSource(id))return null;
 const home=environment.home||undefined,env=environment.env;
 return {
  async list(){
   const files=memoryFiles(id,home,env),memory=files?readLocalAgentMemory(id,home,env):null;
   if(!files||!memory)return [];
   const where=(name:string)=>shortPath(path.join(files.root,name),environment.home);
   const entries:HarnessMemoryEntry[]=[];
   if(files.user&&memory.user)entries.push(...memoryEntries(memory.user,{harness:id,kind:'user',where:where(files.user)}));
   if(memory.longTerm)entries.push(...memoryEntries(memory.longTerm,{harness:id,kind:'memory',where:where(files.memory)}));
   return entries;
  },
 };
}
