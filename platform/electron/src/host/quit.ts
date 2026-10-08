// Quitting Completely ends everything Worldlet started (owner report 2026-10-04: after quitting, Fox
// stayed on the desktop). Fox and the World leave the screen at once, quit work has a deadline, and any
// process the app spawned that is still running afterwards (a Hermes worker, the website engine, a
// tool) is ended with its own children before the app exits.
import {execFile} from 'node:child_process';
import {app,BaseWindow} from 'electron';

/** Windows taskbar Jump List task (and a second launch with it): quit the running app. */
export const QUIT_ARGUMENT='--quit';
export const wantsQuit=(argv:readonly string[])=>argv.includes(QUIT_ARGUMENT);

/** Windows: right-clicking the taskbar button offers Quit Worldlet beside Close window, which only
 * closes the World and leaves Fox on the desktop. Packaged builds only: a checkout's electron.exe
 * would need the app path too. */
export function installQuitTask(platform:NodeJS.Platform=process.platform){
 if(platform!=='win32'||!app.isPackaged)return;
 try{app.setUserTasks([{program:process.execPath,arguments:QUIT_ARGUMENT,iconPath:process.execPath,iconIndex:0,title:'Quit Worldlet',description:'Quit Worldlet and Fox completely'}]);}catch{}
}

/** Fox's desktop window and the World disappear the moment Quit is chosen, before any work ends. */
export function hideAllWindows(){
 for(const window of BaseWindow.getAllWindows())try{if(!window.isDestroyed())window.hide();}catch{}
}

/** Waits for `work`, but never longer than `ms`. */
export function withDeadline(work:Promise<unknown>,ms:number):Promise<void> {
 return new Promise(resolve=>{
  const timer=setTimeout(resolve,ms);
  work.then(()=>{clearTimeout(timer);resolve();},()=>{clearTimeout(timer);resolve();});
 });
}

/** Processes that must outlive the quit they cause: the update installer waits for this app to exit,
 * then replaces it, so ending it with the strays would leave the old build installed. */
const survivors=new Set<number>();
export function outliveQuit(pid:number|undefined){if(pid)survivors.add(pid);}
/** Children a quit leaves running: Electron's own helpers and the outliveQuit processes. */
export const keptOnQuit=(helpers:Iterable<number>)=>new Set([...helpers,...survivors]);

/** app.relaunch starts Electron's relauncher at once, as a direct child that waits for this app to exit;
 * endStrayChildren ended it with the strays, so an installed update never reopened (RC d2139330). A relaunch
 * asked for while quitting starts after the strays are ended, just before the app exits. */
let pendingRelaunch:Electron.RelaunchOptions|null=null;
export function relaunchAfterQuit(options:Electron.RelaunchOptions={}){pendingRelaunch=options;}
export function startPendingRelaunch(relaunch:(options:Electron.RelaunchOptions)=>void=options=>app.relaunch(options)){
 const options=pendingRelaunch;pendingRelaunch=null;
 if(options)relaunch(options);
 return !!options;
}

export interface ProcessRow {pid:number;ppid:number}
/** Direct children of `root` outside `exclude` (Electron's own helpers), each a tree to end. */
export function strayChildren(rows:readonly ProcessRow[],root:number,exclude:ReadonlySet<number>):number[] {
 return rows.filter(row=>row.ppid===root&&row.pid!==root&&!exclude.has(row.pid)).map(row=>row.pid);
}
/** Every descendant of `pids`, deepest first, so a parent cannot respawn a child after it ends. */
export function processTrees(rows:readonly ProcessRow[],pids:readonly number[]):number[] {
 const children=new Map<number,number[]>();
 for(const row of rows){const list=children.get(row.ppid)??[];list.push(row.pid);children.set(row.ppid,list);}
 const order:number[]=[],seen=new Set<number>();
 const visit=(pid:number)=>{if(seen.has(pid))return;seen.add(pid);for(const child of children.get(pid)??[])visit(child);order.push(pid);};
 for(const pid of pids)visit(pid);
 return order;
}

const run=(file:string,args:string[],timeout:number)=>new Promise<string>(resolve=>{
 try{execFile(file,args,{timeout,windowsHide:true,maxBuffer:8_000_000},(error,stdout)=>resolve(error?'':String(stdout)));}catch{resolve('');}
});
async function processRows(platform:NodeJS.Platform):Promise<ProcessRow[]> {
 const text=platform==='win32'
  ?await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId)" }'],4000)
  :await run('/bin/ps',['-A','-o','pid=,ppid='],2000);
 return text.split(/\r?\n/).map(line=>line.trim().split(/\s+/).map(Number)).filter(([pid,ppid])=>Number.isInteger(pid)&&Number.isInteger(ppid)&&pid>0).map(([pid,ppid])=>({pid,ppid}));
}

/** Ends every process this app spawned that outlived its quit work; Electron's own helpers end with the app
 * and processes marked with outliveQuit are left running. */
export async function endStrayChildren(platform:NodeJS.Platform=process.platform){
 let helpers:number[]=[];
 try{helpers=app.getAppMetrics().map(metric=>metric.pid);}catch{}
 const rows=await processRows(platform);
 const strays=strayChildren(rows,process.pid,keptOnQuit(helpers));
 if(!strays.length)return;
 if(platform==='win32'){
  const taskkill=`${process.env.SystemRoot||'C:\\Windows'}\\System32\\taskkill.exe`;
  await Promise.all(strays.map(pid=>run(taskkill,['/PID',String(pid),'/T','/F'],3000)));
  return;
 }
 for(const pid of processTrees(rows,strays))try{process.kill(pid,'SIGKILL');}catch{}
}
