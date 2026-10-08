// Stable checkout identity. Branch labels may change; local profiles must not.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {realpathSync, mkdirSync, openSync, writeFileSync, readFileSync, unlinkSync, closeSync, existsSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const repoRoot=fileURLToPath(new URL('../',import.meta.url));
export function git(root:string,...args:string[]):string{return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true}).trim();}
export function workspace(root=repoRoot){
 root=realpathSync(root);
 const common=realpathSync(path.resolve(root,git(root,'rev-parse','--git-common-dir')));
 const primary=realpathSync(path.dirname(common));
 const linked=root!==primary,id=linked?createHash('sha256').update(root).digest('hex').slice(0,12):'';
 const branch=git(root,'branch','--show-current')||'detached';
 const label=linked?`${branch} · ${id.slice(0,6)}`:branch;
 return {root,primary,common,linked,id,branch,label,bundleId:'app.worldlet.mac.dev'+(id?'.wt'+id:''),
  name:linked?`Worldlet Dev — ${label}`:'Worldlet Dev',port:linked?10000+parseInt(id.slice(0,8),16)%40000:8766};
}
export function processAlive(pid:number){try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}}
// A lock written before this boot is stale whatever process now has its PID: after the replacement Mac release host
// restarted (2026-10-06) the daemon lock named PID 1109, which macOS had given to textunderstandingd, and the daemon
// refused to start for hours.
export function writtenBeforeBoot(file:string,{uptime=os.uptime(),now=Date.now()}={}){
 try{return statSync(file).mtimeMs<now-uptime*1000;}catch{return false;}
}
const heldBy=(file:string,owner:number)=>!!owner&&processAlive(owner)&&!writtenBeforeBoot(file);
// Atomic local process lock; stale files are retained unless their owner has exited.
export function lock(file:string){
 mkdirSync(path.dirname(file),{recursive:true});
 for(let attempt=0;attempt<2;attempt++){
  try{const fd=openSync(file,'wx');writeFileSync(fd,String(process.pid));
   // close immediately: Windows and external tools should also be able to inspect it.
   closeSync(fd);return ()=>{if(readFileSafe(file)===String(process.pid))unlinkSync(file);};
  }catch(error){if(error.code!=='EEXIST')throw error;
   const owner=Number(readFileSafe(file));if(!owner||heldBy(file,owner))throw Error(`Another operation owns ${file}. Stop it before retrying.`);
   unlinkSync(file);
  }
 }
 throw Error('Could not acquire '+file);
}
export function locked(file:string){if(!existsSync(file))return false;const pid=Number(readFileSafe(file));return !pid||heldBy(file,pid);}
// lock(), but while another live process holds the file it waits, bounded; `waiting` hears each new holder's PID.
// The poll is shorter than the 250 ms gap a Dev watcher leaves between back-to-back builds.
export async function waitForLock(file:string,timeout:number,waiting=(pid:string)=>{},poll=200){
 const deadline=Date.now()+timeout;let holder='';
 for(;;){
  // lock() signals contention with plain errors, or ENOENT when another process cleared a stale lock first;
  // any other filesystem error fails at once instead of waiting out the bound.
  try{return lock(file);}catch(error){if(error.code&&error.code!=='ENOENT')throw error;}
  const pid=readFileSafe(file);if(pid&&pid!==holder)waiting(holder=pid);
  if(Date.now()>=deadline)throw Error(`Timed out after ${timeout/1000} s waiting for process ${holder||'unknown'} to release ${file}.`);
  await new Promise(resolve=>setTimeout(resolve,poll));
 }
}
function readFileSafe(file:string){try{return readFileSync(file,'utf8').trim();}catch{return '';}}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(workspace(),null,2));
