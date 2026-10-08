// What the website panel manages its pages by (core/browser/page-resume.ts PAGE_MEMORY, budget.ts): memory the
// system can hand out, its pressure level, and the app's whole footprint (owner Order 2026-10-07: "要把内存管理好").
// - Electron's free memory on macOS counts only free pages, which macOS keeps near zero by design (the rest is
//   inactive or purgeable cache it hands out at once), so pages were released while the Mac had gigabytes to give.
//   macOS reads `vm_stat` and the kernel's own pressure level instead.
// - `app.getAppMetrics()` lists Electron's processes only; the CEF website engine runs every website page in
//   processes of its own, so they are added from `ps`, by the engine's process tree.
// Probes run in the background every reading; `readMemory` answers at once from the last ones.
import {execFile} from 'node:child_process';
import {app} from 'electron';
import type {MemoryReading} from '../../../../../core/browser/index.ts';

let engineKB=0,availableMB=NaN,pressure:MemoryReading['pressure'];

const run=(file:string,args:string[])=>new Promise<string>(resolve=>execFile(file,args,{timeout:3000,maxBuffer:4*1024*1024},(error,stdout)=>resolve(error?'':String(stdout))));

/** Resident KB of `root` and every process below it, from `ps -A -o pid=,ppid=,rss=` output. */
export function processTreeKB(ps:string,root:number):number {
 const children=new Map<number,number[]>(),rss=new Map<number,number>();
 for(const line of ps.split('\n')){
  const [pid,ppid,kb]=line.trim().split(/\s+/).map(Number);
  if(!Number.isInteger(pid)||!Number.isInteger(ppid)||!Number.isFinite(kb))continue;
  rss.set(pid,kb);children.set(ppid,[...children.get(ppid)??[],pid]);
 }
 if(!rss.has(root))return 0;
 let total=0;const seen=new Set<number>(),queue=[root];
 while(queue.length){const pid=queue.pop()!;if(seen.has(pid))continue;seen.add(pid);total+=rss.get(pid)??0;queue.push(...children.get(pid)??[]);}
 return total;
}
/** MB macOS can hand out now, from `vm_stat`: free, inactive, speculative and purgeable pages. NaN when unreadable. */
export function vmStatAvailableMB(text:string):number {
 const size=Number(/page size of (\d+) bytes/.exec(text)?.[1]);
 const pages=(name:string)=>Number(new RegExp('Pages '+name+':\\s+(\\d+)').exec(text)?.[1]??NaN);
 const count=pages('free')+pages('inactive')+pages('speculative')+(Number.isFinite(pages('purgeable'))?pages('purgeable'):0);
 return size>0&&Number.isFinite(count)?count*size/1_048_576:NaN;
}
/** The kernel's level (kern.memorystatus_vm_pressure_level: 1 normal, 2 warn, 4 critical). */
export function pressureLevel(text:string):MemoryReading['pressure'] {
 const level=Number(text.trim());
 return level>=4?'critical':level>=2?'warn':level===1?'normal':undefined;
}

/** Reads the probes again: the engine's processes (when it runs) and, on macOS, available memory and pressure. */
export async function refreshMemory(enginePid:number|null|undefined):Promise<void> {
 const ps=enginePid&&process.platform!=='win32'?run('ps',['-A','-o','pid=,ppid=,rss=']):Promise.resolve('');
 const mac=process.platform==='darwin';
 const [tree,vm,level]=await Promise.all([ps,mac?run('vm_stat',[]):Promise.resolve(''),mac?run('sysctl',['-n','kern.memorystatus_vm_pressure_level']):Promise.resolve('')]);
 engineKB=enginePid?processTreeKB(tree,enginePid):0;
 if(mac){availableMB=vmStatAvailableMB(vm);pressure=pressureLevel(level);}
}
/** Memory now, in MB, from Electron and the last probes. */
export function readMemory():MemoryReading|null {
 try{
  const system=process.getSystemMemoryInfo(),appKB=app.getAppMetrics().reduce((sum,metric)=>sum+(metric.memory?.workingSetSize??0),0);
  const freeMB=Number.isFinite(availableMB)?availableMB:system.free/1024;
  return {freeMB,totalMB:system.total/1024,appMB:(appKB+engineKB)/1024,...pressure?{pressure}:{}};
 }catch{return null;}
}
/** The website engine's own share, for diagnostics (metrics.json): MB, or 0 when it is not running or unread. */
export function engineMemoryMB(){return Math.round(engineKB/1024);}
