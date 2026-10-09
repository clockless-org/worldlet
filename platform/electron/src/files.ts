import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// Owner-only, atomic file IO for the World library.
/** Library folders that belong to this installation, not to the World: Fox's Hermes runtime, local
 * speech (helper packages and model) and the installation's model credential. Reset keeps them, backups
 * neither carry nor replace them, and a running install or recognizer can hold their files open. */
export const INSTALLATION_FOLDERS=['runtime','speech','tools','model-access'];
/** Moves a folder Worldlet kept outside the library into it, once: never over an existing target. */
export function adoptFolder(from:string,to:string){
 try{
  if(fs.existsSync(to)||!fs.lstatSync(from).isDirectory())return false;
  fs.mkdirSync(path.dirname(to),{recursive:true,mode:0o700});
  fs.renameSync(from,to);
  return true;
 }catch{return false;}
}
export const digest=(data:string|Uint8Array)=>crypto.createHash('sha256').update(data).digest('hex');
export const uuid=()=>crypto.randomUUID().toUpperCase();
/** `ISO8601DateFormatter`'s default: internet date-time in UTC, whole seconds. */
export const isoSeconds=(date=new Date())=>date.toISOString().replace(/\.\d{3}Z$/,'Z');
// Swift counts and slices user-perceived characters; the native limits are in those units.
const segmenter=new Intl.Segmenter();
export function characterCount(text:string){let count=0;for(const _ of segmenter.segment(text))count+=1;return count;}
export function characterPrefix(text:string,max:number){
 if(text.length<=max)return text;
 let out='',count=0;
 for(const {segment} of segmenter.segment(text)){if(count>=max)break;out+=segment;count+=1;}
 return out;
}
export function ensureDirectory(dir:string){fs.mkdirSync(dir,{recursive:true,mode:0o700});return dir;}
export function writeAtomic(file:string,data:string|Uint8Array,mode=0o600){
 ensureDirectory(path.dirname(file));
 const temporary=`${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
 fs.writeFileSync(temporary,data,{mode});
 try{fs.renameSync(temporary,file);}catch(error){fs.rmSync(temporary,{force:true});throw error;}
 try{fs.chmodSync(file,mode);}catch{}
}
export function writeJSON(file:string,value:unknown,mode=0o600){writeAtomic(file,JSON.stringify(value,null,2),mode);}
export function readJSON<T=any>(file:string,fallback?:T):T {
 if(!fs.existsSync(file)){if(fallback!==undefined)return fallback;throw Error('Missing '+path.basename(file));}
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
export const isLink=(file:string)=>{try{return fs.lstatSync(file).isSymbolicLink();}catch{return false;}};
/** The resolved real path, or the plain absolute path while the file does not exist. */
export const realPath=(file:string)=>{try{return fs.realpathSync(file);}catch{return path.resolve(file);}};
export class WorldletError extends Error {}
export const errorMessage=(error:unknown)=>error instanceof Error?error.message:String(error);
