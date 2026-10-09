import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {core} from '../../core.ts';
import {ensureDirectory,realPath as real,writeJSON,WorldletError} from '../../files.ts';
import type {Row} from './types.ts';

const MAX_ARCHIVE_BYTES=16_000_000;
const utf8=new TextDecoder('utf-8',{fatal:true});

// Companion archive files (Mac CompanionArchive / CompanionTransfer: portable, Agent-independent).
const sortKeys=(value:any):any=>Array.isArray(value)?value.map(sortKeys):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sortKeys(value[key])])):value;
export function encodeArchive(archive:Row):string {
 core('companionValidate',{archive});
 const text=JSON.stringify(sortKeys(archive),null,2);
 if(Buffer.byteLength(text)>MAX_ARCHIVE_BYTES)throw new WorldletError('Companion archive exceeds 16 MB.');
 return text;
}
// Existing-profile attachment (Mac HermesAttachment): references the profile, never copies it.
/** Where Hermes Agent keeps its profile when HERMES_HOME is not set (hermes_constants: %LOCALAPPDATA%\hermes on
 * Windows, ~/.hermes elsewhere). */
export function standardHermesHome(userHome=os.homedir(),environment:NodeJS.ProcessEnv=process.env,platform:NodeJS.Platform=process.platform):string {
 if(platform==='win32'){const local=environment.LOCALAPPDATA?.trim(),win=path.win32;return win.join(local&&win.isAbsolute(local)?local:win.join(userHome,'AppData','Local'),'hermes');}
 return path.join(userHome,'.hermes');
}
export function discoverHermes(userHome=os.homedir(),environment=process.env,platform:NodeJS.Platform=process.platform):string|null {
 const base=standardHermesHome(userHome,environment,platform),candidates:string[]=[];
 const override=environment.HERMES_HOME;
 if(override&&path.isAbsolute(override))candidates.push(override);
 try{
  const active=fs.readFileSync(path.join(base,'active_profile'),'utf8').trim();
  if(active!=='default'&&/^[A-Za-z0-9_-]+$/.test(active))candidates.push(path.join(base,'profiles',active));
 }catch{}
 candidates.push(base);
 // Windows: ~/.hermes too, where a profile made before Hermes Agent used %LOCALAPPDATA% (and Worldlet's checks) keeps it.
 const dotted=path.join(userHome,'.hermes');
 if(dotted!==base)candidates.push(dotted);
 const found=candidates.find(home=>{try{const config=path.join(home,'config.yaml');fs.accessSync(config,fs.constants.R_OK);return fs.statSync(config).size>0;}catch{return false;}});
 return found?real(found):null;
}
/** Fox's own Hermes profile in the library. */
export const ownHermesHome=(root:string)=>path.join(root,'agent','private','hermes');
/** Whether `home` is Fox's own profile (which Worldlet once linked at the standard location), not another Hermes Agent. */
export function isOwnHermes(root:string,home:string){try{return real(home)===real(ownHermesHome(root));}catch{return false;}}
/** A Hermes Agent of the person's that is not Fox's own profile. */
export function discoverOtherHermes(root:string):string|null {const found=discoverHermes();return found&&!isOwnHermes(root,found)?found:null;}

/** Where the official installer puts the `hermes` command (~/.local/bin); Worldlet once put one there for Fox's own profile. */
export const hermesCommandPath=(userHome=os.homedir())=>path.join(userHome,'.local','bin','hermes');

export function attachedHermes(root:string):string|null {
 try{
  const value=JSON.parse(fs.readFileSync(path.join(root,'hermes-attachment.json'),'utf8'));
  if(typeof value?.home!=='string'||!path.isAbsolute(value.home))return null;
  return real(value.home);
 }catch{return null;}
}
export function bindHermes(root:string,expectedPath:string):string {
 const home=discoverHermes();
 if(!home||home!==expectedPath)throw new WorldletError('The local Hermes profile changed or is unavailable. Please check again.');
 ensureDirectory(root);
 writeJSON(path.join(root,'hermes-attachment.json'),{home},0o644);
 attachedHermes(root);
 return home;
}
/** Ends the attachment, so Worldlet's own Hermes home is the private profile again; the person's profile is untouched. */
export function unbindHermes(root:string){
 fs.rmSync(path.join(root,'hermes-attachment.json'),{force:true});
}
/** Only explicit identity declarations ("Name: Nova", "You are Nova."); never infer a name from user memory. */
export function declaredName(text:string):string|null {
 const patterns=[/^[-# ]*(?:name|agent name|assistant name|名字|名称)\s*[:：]\s*(.{1,80})$/iu,/^(?:you are|your name is|my name is|I am|I'm)\s+([\p{L}\p{N}_-]{1,24})(?:[,.! 。！]|$)/iu];
 for(const line of text.slice(0,32000).split(/\r\n|\r|\n/)){
  const cleaned=line.replaceAll('**','').trim();
  for(const pattern of patterns){
   const match=pattern.exec(cleaned);
   const name=match?Array.from(match[1].replace(/^[ "'`]+|[ "'`]+$/g,'')).slice(0,24).join(''):'';
   if(name)return name;
  }
 }
 return null;
}
