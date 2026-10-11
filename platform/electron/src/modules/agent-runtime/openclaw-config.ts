import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {realPath as real} from '../../files.ts';

// Where a person's OpenClaw keeps things, read the way OpenClaw itself resolves them
// (docs/gateway/configuration.md, docs/gateway/config-agents.md): its state folder, its JSON5
// configuration with `$include` files, and each agent's workspace, which may live anywhere
// (`agents.defaults.workspace`, `agents.list[].workspace`, `~` and `${VAR}` allowed). Only read.

/** openclaw.json is JSON5 (comments, unquoted keys, trailing commas, single quotes). */
export function parseJSON5(source:string):unknown {
 try{return JSON.parse(source);}catch{}
 let out='',i=0;
 const n=source.length;
 while(i<n){
  const c=source[i];
  if(c==='"'||c==='\''){
   let value='';i++;
   while(i<n&&source[i]!==c){if(source[i]==='\\'&&i+1<n){value+=source[i]+source[i+1];i+=2;}else value+=source[i++];}
   i++;
   let decoded:string;try{decoded=JSON.parse('"'+value.replace(/\\'/g,"'")+'"');}catch{decoded=value;}
   out+=JSON.stringify(decoded);
   continue;
  }
  if(c==='/'&&source[i+1]==='/'){while(i<n&&source[i]!=='\n')i++;continue;}
  if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);i=end<0?n:end+2;continue;}
  if(/[A-Za-z_$]/.test(c)){
   let word='';while(i<n&&/[\w$]/.test(source[i]))word+=source[i++];
   let j=i;while(j<n&&/\s/.test(source[j]))j++;
   out+=source[j]===':'?JSON.stringify(word):word==='Infinity'||word==='NaN'?'null':word;
   continue;
  }
  if(c==='+'&&/[\d.]/.test(source[i+1]??'')){i++;continue;}
  out+=c;i++;
 }
 out=out.replace(/,(\s*[}\]])/g,'$1');
 try{return JSON.parse(out);}catch{return null;}
}

export const openClawState=(home=os.homedir(),environment=process.env)=>environment.OPENCLAW_STATE_DIR&&path.isAbsolute(environment.OPENCLAW_STATE_DIR)?environment.OPENCLAW_STATE_DIR:path.join(home,'.openclaw');
/** OPENCLAW_CONFIG_PATH, else openclaw.json in its state folder. */
export const openClawConfigPath=(home=os.homedir(),environment=process.env)=>{
 const named=environment.OPENCLAW_CONFIG_PATH;
 return typeof named==='string'&&path.isAbsolute(named)?named:path.join(openClawState(home,environment),'openclaw.json');
};

const CONFIG_LIMIT=4_000_000;
function readConfigFile(file:string):string {
 try{const info=fs.statSync(file);return info.isFile()&&info.size<=CONFIG_LIMIT?fs.readFileSync(file,'utf8'):'';}catch{return '';}
}
const isObject=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function deepMerge(base:unknown,over:unknown):unknown {
 if(!isObject(base)||!isObject(over))return over;
 const out:Record<string,any>={...base};
 for(const [key,value] of Object.entries(over))out[key]=deepMerge(out[key],value);
 return out;
}
/** `$include`: one file replaces the object holding it, several are deep-merged in order, sibling keys win; paths are
 * relative to the including file and must stay under the configuration's folder or OPENCLAW_INCLUDE_ROOTS. */
function resolveIncludes(value:unknown,from:string,roots:string[],depth:number):unknown {
 if(Array.isArray(value))return value.map(item=>resolveIncludes(item,from,roots,depth));
 if(!isObject(value))return value;
 let base:unknown={};
 const include=value.$include;
 if(depth<10&&(typeof include==='string'||Array.isArray(include))){
  for(const name of [include].flat()){
   if(typeof name!=='string'||!name||name.length>=4096||name.includes('\0'))continue;
   const file=path.resolve(path.dirname(from),name);
   let resolved:string;try{resolved=real(file);}catch{continue;}
   if(!roots.some(root=>resolved.startsWith(root+path.sep)))continue;
   base=deepMerge(base,resolveIncludes(parseJSON5(readConfigFile(resolved)),resolved,roots,depth+1));
  }
 }
 const own:Record<string,any>={};
 for(const [key,item] of Object.entries(value))if(key!=='$include')own[key]=resolveIncludes(item,from,roots,depth);
 return deepMerge(base,own);
}

/** The person's OpenClaw configuration with its `$include` files merged in; empty when there is none. */
export function readOpenClawConfig(home=os.homedir(),environment=process.env):Record<string,any> {
 const file=openClawConfigPath(home,environment);
 const value=parseJSON5(readConfigFile(file));
 if(!isObject(value))return {};
 const separator=process.platform==='win32'?';':':';
 const roots=[path.dirname(file),...(environment.OPENCLAW_INCLUDE_ROOTS??'').split(separator).filter(root=>path.isAbsolute(root))].flatMap(root=>{try{return [real(root)];}catch{return [];}});
 const resolved=resolveIncludes(value,file,roots,0);
 return isObject(resolved)?resolved:{};
}

/** A folder named in the configuration: `~` is the home folder and `${VAR}` an environment variable (OpenClaw's own
 * substitution, uppercase names only, `$${VAR}` literal); null when it is not an absolute path. */
export function openClawPath(value:unknown,home=os.homedir(),environment=process.env):string|null {
 if(typeof value!=='string'||!value.trim())return null;
 let missing=false;
 const expanded=value.trim().replace(/\$?\$\{([A-Z_][A-Z0-9_]*)\}/g,(match,name)=>{
  if(match.startsWith('$$'))return match.slice(1);
  const found=environment[name];if(!found)missing=true;return found??'';
 }).replace(/^~(?=$|[\\/])/,home);
 return !missing&&path.isAbsolute(expanded)?expanded:null;
}
const folder=(candidate:string|null)=>{try{return candidate&&fs.statSync(candidate).isDirectory()?real(candidate):null;}catch{return null;}};

/** The default agent's workspace: `agents.defaults.workspace`, else OPENCLAW_WORKSPACE_DIR, else `workspace` (or
 * `workspace-<profile>`) under its state folder. */
export function openClawWorkspace(home=os.homedir(),environment=process.env,config=readOpenClawConfig(home,environment)):string|null {
 const state=openClawState(home,environment);
 const candidates=[openClawPath(config?.agents?.defaults?.workspace,home,environment),openClawPath(environment.OPENCLAW_WORKSPACE_DIR,home,environment)];
 const profile=environment.OPENCLAW_PROFILE;
 if(profile&&profile!=='default'&&/^[A-Za-z0-9_-]+$/.test(profile))candidates.push(path.join(state,'workspace-'+profile));
 candidates.push(path.join(state,'workspace'));
 for(const candidate of candidates){const found=folder(candidate);if(found)return found;}
 return null;
}
