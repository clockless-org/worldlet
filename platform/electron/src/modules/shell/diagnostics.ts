import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {app,BrowserWindow,clipboard,dialog,type BaseWindow,type WebContents} from 'electron';
import {core} from '../../core.ts';
import {canBuild} from '../../store/world-store.ts';
import {ensureDirectory,isoSeconds,readJSON,writeAtomic,WorldletError} from '../../files.ts';
import {platformName} from '../../profile.ts';
import {stableJSON} from '../../store/swift-json.ts';
import {AGENT,FOX,WORLD_TOOLS,type AgentService,type FoxService,type WorldToolsService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {buildInfo,buildNumber,versionText} from './release.ts';
import {engineMemoryMB,readMemory} from '../browser/memory.ts';
import {orderErrors,orderTimings,ORDER_DIAGNOSTICS,type OrderDiagnostics} from '../../../../../core/distribution/index.ts';

// Deliberate allowlist, not a redacted copy of application logs or user documents.
const started=new Date();
const lines=(file:string,limit=2_000_000)=>{
 try{if(fs.statSync(file).size>limit)return [];}catch{return [];}
 return fs.readFileSync(file,'utf8').split('\n').flatMap(line=>{try{const row=JSON.parse(line);return row&&typeof row==='object'?[row]:[];}catch{return [];}});
};

/** Owner-only `logs/<name>.jsonl`, rotated once to `<name>.previous.jsonl` past 1 MB. */
function appendLog(root:string,name:string,row:Row){
 const dir=ensureDirectory(path.join(root,'logs')),file=path.join(dir,name+'.jsonl');
 try{if(fs.statSync(file).size>1_000_000)fs.renameSync(file,path.join(dir,name+'.previous.jsonl'));}catch{}
 fs.appendFileSync(file,stableJSON(row)+'\n',{mode:0o600});
}
/** Bounded, numeric-only end-to-end timings; no prompts, replies, URLs or tool args. */
export function recordFoxTiming(root:string,body:Row):Row|null {
 const row=core<Row|null>('foxTiming',body);
 if(!row)return null;
 appendLog(root,'fox-timing',{...row,at:isoSeconds()});
 return row;
}
export function recentFoxTimings(root:string):Row[] {
 const rows=lines(path.join(root,'logs/fox-timing.jsonl')).slice(-100);
 try{return core('foxTimings',{rows});}catch{return [];}
}
/** This run's classified failures (the host's diagnostics log holds only Core-projected rows). */
function recentErrors(root:string){
 return ['diagnostics.previous','diagnostics'].flatMap(name=>lines(path.join(root,'logs',name+'.jsonl')))
  .filter(row=>typeof row.at==='string'&&Date.parse(row.at)>=started.getTime()-1000).slice(-50);
}

/** A text file's final `bytes`, starting at a whole line; empty when it is missing. */
function tailText(file:string,bytes:number):string {
 try{
  const fd=fs.openSync(file,'r');
  try{const size=fs.fstatSync(fd).size,length=Math.min(size,bytes),buffer=Buffer.alloc(length);fs.readSync(fd,buffer,0,length,size-length);
   const text=buffer.toString('utf8');return length<size?text.slice(text.indexOf('\n')+1):text;}
  finally{fs.closeSync(fd);}
 }catch{return '';}
}
/** The last lines of a text file, reading at most its final 64 KB. */
const tail=(file:string,count:number)=>tailText(file,65_536).split('\n').filter(l=>l.trim()).slice(-count);

// Page console warnings and errors of every view (the World, website panels, Applets), newest CONSOLE_LINES kept in
// memory for an Order (owner 2026-10-06). Website text stays on the computer unless an Order is sent.
const CONSOLE_LINES=500,consoleLines:string[]=[];
export function watchConsole(){
 const watch=(contents:WebContents)=>contents.on('console-message',details=>{
  if(details.level!=='warning'&&details.level!=='error')return;
  let site='';try{site=new URL(contents.getURL()).host;}catch{}
  const source=String(details.sourceId||'').replace(/[?#].*$/,'').split('/').pop();
  consoleLines.push(`${new Date().toISOString().slice(11,23)} ${details.level} ${site||'page'} ${String(details.message).replace(/\s+/g,' ').slice(0,2000)}${source?` (${source}:${details.lineNumber})`:''}`);
  if(consoleLines.length>CONSOLE_LINES)consoleLines.splice(0,consoleLines.length-CONSOLE_LINES);
 });
 app.on('web-contents-created',(_event,contents)=>watch(contents));
}
/** Memory and CPU now: each Electron process, the website engine's processes, what the website panel manages
 * pages by (memory.ts) and the system. */
function metrics(){
 const mb=(kb:number)=>Math.round(kb/1024),reading=readMemory();
 return {at:new Date().toISOString(),uptimeSeconds:Math.round(process.uptime()),
  system:{platform:process.platform,arch:process.arch,version:process.getSystemVersion(),cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model??'',loadAverage:os.loadavg(),totalMemoryMB:Math.round(os.totalmem()/1_048_576),freeMemoryMB:Math.round(os.freemem()/1_048_576)},
  processes:app.getAppMetrics().map(m=>({type:m.type,name:m.name??m.serviceName??'',pid:m.pid,cpuPercent:Math.round(m.cpu.percentCPUUsage*10)/10,memoryMB:mb(m.memory.workingSetSize),peakMemoryMB:mb(m.memory.peakWorkingSetSize)})),
  webEngineMemoryMB:engineMemoryMB(),
  pages:reading?{availableMB:Math.round(reading.freeMB),appMB:Math.round(reading.appMB),pressure:reading.pressure??null}:null};
}
/** The whole local logs an Order sends as files (core/distribution/order.ts orderFiles bounds and redacts them): both
 * rotations of the error and Fox timing logs and of the main process's output, the private agent's own logs and
 * output (with the background lanes' errors and output), the Debug panel, the page console and memory and CPU. */
export function orderLogFiles(host:Host):{name:string;text:string}[] {
 const root=host.profile.root,logs=path.join(root,'logs'),runtime=host.optional<AgentService>(AGENT),home=runtime?.home('private');
 const read=(file:string)=>tailText(file,1_000_000);
 // Background checks, Attention synthesis and Applet analysis run in their own Agent homes (AgentService.isolatedHome),
 // whose errors never reached an Order: 10-07's background `operationFailed` failures had no message to read. Their
 // newest lines follow the private agent's in the same file, so the Order keeps its file count (inbox MAX_FILES).
 const backgroundLanes=(name:string)=>runtime?['monitor','applet-analysis'].map(scope=>{
  const text=tailText(path.join(root,'agent',scope,runtime.id,'logs',name),200_000);
  return text.trim()?`\n===== background: ${scope} =====\n${text}`:'';
 }).join(''):'';
 const files=[
  ...['diagnostics.previous.jsonl','diagnostics.jsonl','fox-timing.previous.jsonl','fox-timing.jsonl','main.previous.log','main.log'].map(name=>({name,text:read(path.join(logs,name))})),
  ...(home?['agent.log','errors.log','host-stderr.log'].map(name=>({name:'hermes-'+name,text:read(path.join(home,'logs',name))+(name==='agent.log'?'':backgroundLanes(name))})):[]),
 ];
 let debug='';try{debug=debugText(sections(host,{},'Sent with an Order; live model status was not checked.'));}catch(error){debug='The Debug panel could not be read: '+(error as Error)?.message;}
 let tasks:unknown=null;try{tasks=host.optional<WorldToolsService>(WORLD_TOOLS)?.runtimeTaskReport()??null;}catch{}
 files.push({name:'debug.txt',text:debug+(tasks?'\n\nBackground tasks\n'+JSON.stringify(tasks,null,1):'')},
  {name:'console.log',text:consoleLines.join('\n')},{name:'metrics.json',text:JSON.stringify(metrics(),null,1)});
 return files;
}
/** What an Order carries from this computer's own logs (core/distribution/order.ts ORDER_DIAGNOSTICS): the system,
 * the installation id, the last hour's classified errors (both rotations, not only this run), the last Fox timings
 * and the newest lines of the private agent's own error log. */
export function orderDiagnostics(host:Host,installation:string,now=Date.now()):OrderDiagnostics {
 const root=host.profile.root,errors=['diagnostics.previous','diagnostics'].flatMap(name=>lines(path.join(root,'logs',name+'.jsonl')));
 const home=host.optional<AgentService>(AGENT)?.home('private');
 return {system:`${platformName()} ${process.getSystemVersion()}`,...(installation?{installation}:{}),
  errors:orderErrors(errors,now/1000),timings:orderTimings(recentFoxTimings(root)),
  agent:home?tail(path.join(home,'logs','errors.log'),ORDER_DIAGNOSTICS.agentLines):[]};
}

export function diagnosticReport(host:Host,timings:Row[]=[]):Row {
 const info=buildInfo(host);
 const input={generatedAt:isoSeconds(),build:{version:info.version,build:info.build},platform:platformName(),systemVersion:process.getSystemVersion(),
  channel:host.profile.channel==='dev'?'development':'release',agentAvailable:host.optional<AgentService>(AGENT)?.available===true,
  connections:host.store.state.connections.map(c=>({provider:c.provider,status:c.syncStatus??'unknown'})),
  recentErrors:recentErrors(host.profile.root),foxTimings:timings};
 try{return core('diagnosticReport',input);}catch{return {schema:2,error:'Diagnostics are unavailable.'};}
}
/** `diagnostics`: the report plus Background tasks, which the World tools service owns. */
export function diagnostics(host:Host){
 const report=diagnosticReport(host);
 const tools=host.optional<WorldToolsService>(WORLD_TOOLS);
 report.runtimeTasks=tools?tools.runtimeTaskReport():{supported:false,rows:[]};
 return report;
}
export async function exportDiagnostics(host:Host,parent:BaseWindow|null,sheet:<T>(work:()=>Promise<T>)=>Promise<T>=work=>work()){
 const options={title:'Save Worldlet diagnostics',defaultPath:'Worldlet-diagnostics.json',filters:[{name:'JSON',extensions:['json']}],
  message:'Version, system information, connection states, error codes and numeric timing traces. Private content is excluded. Nothing is uploaded.'};
 const choice=await sheet(()=>parent?dialog.showSaveDialog(parent as any,options):dialog.showSaveDialog(options));
 if(choice.canceled||!choice.filePath)return {cancelled:true};
 const report=diagnosticReport(host,recentFoxTimings(host.profile.root));
 writeAtomic(choice.filePath,JSON.stringify(JSON.parse(stableJSON(report)),null,2));
 return {ok:true};
}

// Debug panel -----------------------------------------------------------------------------------
interface Section {title:string;rows:[string,string][]}
const SERVICES:Record<string,string>={gmail:'Gmail','google-calendar':'Google Calendar','google-drive':'Google Drive','apple-notes':'Apple Notes','apple-reminders':'Apple Reminders',doordash:'DoorDash','claude-code':'Claude Code',google:'Google',hermes:'Hermes',native:'On this computer','':'Unknown'};
const capitalized=(text:string)=>text.split(' ').map(word=>word?word[0].toUpperCase()+word.slice(1).toLowerCase():word).join(' ');
const service=(id:string)=>SERVICES[id]??capitalized(id.replaceAll('-',' '));
const STATUS:Record<string,string>={connected:'Connected',connecting:'Connecting',syncing:'Reading',reading:'Reading',sync_error:'Needs attention',error:'Needs attention',disconnected:'Disconnected',open:'Open',read:'Read','':'Unknown'};
const statusLabel=(status?:string|null)=>STATUS[status??'']??capitalized((status??'Unknown').replaceAll('_',' '));
const text=(value:unknown)=>typeof value==='string'?value:typeof value==='number'||typeof value==='boolean'?String(value):'';
const blank=(value:unknown)=>text(value)||'Not set';
const yes=(value:boolean)=>value?'Yes':'No';
const clip=(value:string,limit=80)=>value.length<=limit?value:value.slice(0,limit)+'…';
const counts=(values:string[])=>Object.entries(values.reduce<Record<string,number>>((all,value)=>{all[value]=(all[value]??0)+1;return all;},{})).sort(([a],[b])=>a<b?-1:1).map(([key,count])=>`${service(key)} ${count}`).join(', ');
const pretty=(value:number)=>Number.isInteger(value)?String(value):String(Number(value.toPrecision(6)));
function describe(file:string){
 let stat:fs.Stats;
 try{stat=fs.statSync(file);}catch{return 'Missing';}
 if(stat.isDirectory()){const entries=fs.readdirSync(file).filter(name=>name!=='.DS_Store');return entries.length?`Folder, ${entries.length} items`:'Empty folder';}
 if(stat.size<1024)return `${stat.size} B`;
 if(stat.size<1_048_576)return `${(stat.size/1024).toFixed(1)} KB`;
 return `${(stat.size/1_048_576).toFixed(1)} MB`;
}
function sections(host:Host,agent:Row,note:string|null):Section[] {
 const {store,preferences:prefs}=host;
 const runtime=host.optional<AgentService>(AGENT);
 const sample=store.sampleEnabled(),scope=host.optional<FoxService>(FOX)?.scope()??{sample,setup:!sample&&!store.state.cloudConsent};
 const home=runtime?.home(scope.sample?'sample':scope.setup?'setup':'private')??'';
 const info=buildInfo(host);
 const database=fs.existsSync(path.join(store.root,'world.sqlite'));
 let items:Row[]=[],checks:Row[]=[];
 if(database){try{items=store.worldItems();}catch{}try{checks=store.worldChecks();}catch{}}
 let overlay:Row|null=null;try{overlay=store.worldSetting('overlay');}catch{}
 let accounts:string[]=[];
 try{accounts=Object.keys(readJSON(path.join(store.root,'vault.json'),{})).map(key=>key.slice(key.indexOf(':')+1)).sort();}catch{}
 const list:Section[]=[];
 const app:[string,string][]=[
  ['Version',blank(info.version)],['Build',blank(info.build)],['Channel',host.profile.channel==='dev'?'Development':'Release'],['App',host.profile.title],
  [platformName()==='macos'?'macOS':platformName()==='windows'?'Windows':'System',process.getSystemVersion()],['Library',store.root],['Writable',yes(store.writable)],
  ['Fox busy',yes(store.busy)],['Sample world',yes(sample)],['Private context',store.state.cloudConsent?'Allowed':'Not allowed'],
  ['Onboarding',store.state.onboarding?.completed===true?'Complete':'Not finished'],['Workspace',text(store.state.workspaceId)],['Revision',String(store.state.revision??0)],
  ['Text size',pretty(prefs.number('worldlet.textScale',1))],['Last job',clip(text(store.state.lastJob),120)]
 ];
 if(note)app.unshift(['Note',note]);
 list.push({title:'App',rows:app});
 const skills=(Array.isArray(agent.skills)?agent.skills.filter((s:unknown)=>typeof s==='string'):[]).sort();
 const ready=agent.ready===true;
 const [foxName,foxUses]=!Object.keys(agent).length&&note?.includes('skipped')?['Not checked','Fox is working; live model status was skipped.']:
  ready?[blank(agent.name),runtime?.id??'']:['Unavailable','The selected Agent model is not ready. Retry or choose another connection in Fox.'];
 list.push({title:'Models',rows:[
  ['Fox',foxName],['Fox uses',foxUses],['Agent model',blank(agent.name)],['Model id',blank(agent.model)],['Provider',service(text(agent.provider))],['Base URL',blank(agent.baseURL)],
  ['Agent status',ready?'Ready':Object.keys(agent).length?'Not ready':'Not checked'],['Configured',yes(agent.configured===true)],['Catalog default',yes(agent.isDefault===true)],
  ['Agent',runtime?.available?'Available':'Not available'],['Agent version',blank(agent.version)],['Agent home',home],['Skills',skills.length?skills.join(', '):'None']
 ]});
 const connections=store.state.connections;
 const connectionRows:[string,string][]=connections.length?connections.slice(0,40).map(c=>{
  const parts=[statusLabel(c.syncStatus)];
  if(c.transport)parts.push(service(c.transport));
  if(canBuild(c))parts.push('Active');
  if(typeof c.syncedAt==='number')parts.push('Last read '+new Date((c.syncedAt+978307200)*1000).toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}));
  if(c.syncError)parts.push(clip(String(c.syncError),120));
  return [service(c.provider),(c.target||c.provider)+' · '+parts.join(' · ')];
 }):[['Accounts','None']];
 if(connections.length>40)connectionRows.push(['More',`${connections.length-40} additional accounts`]);
 list.push({title:'Connections',rows:connectionRows});
 const servers=Array.isArray(agent.servers)?agent.servers:[];
 list.push({title:'Integrations',rows:servers.length?servers.slice(0,40).map((s:Row)=>[service(text(s.name)),s.enabled===false?'Off':'On'] as [string,string]):[['MCP servers','None reported']]});
 const sources=store.state.sources;
 const stored:[string,string][]=[
  ['Sources',sources.length?`${sources.length}  (${counts(sources.map(s=>s.origin))})`:'None'],['Knowledge',String(store.state.knowledge.length)],
  ['Places',String(store.state.layout?.places?.length??0)],
  ['Saved items',items.length?`${items.length}  (${counts(items.map(i=>typeof i.kind==='string'&&i.kind?i.kind:'other'))})`:'None'],
  ['Source checks',String(checks.length)],['Credential entries',accounts.length?`${accounts.length}  ${accounts.join(', ')}`:'None'],
  ['Google client',store.state.googleClientID?'Present':'Not set'],['Codex',store.state.codexPath||'Not set']
 ];
 for(const source of sources.slice(0,20))stored.push([service(source.origin),(source.enabled!==false?'On':'Off')+' · '+clip(text(source.title))]);
 if(sources.length>20)stored.push(['More sources',`${sources.length-20} additional`]);
 for(const item of items.slice(0,20))stored.push([service(text(item.kind)),service(text(item.provider))+' · '+statusLabel(text(item.status))+' · '+clip(text(item.title))]);
 if(items.length>20)stored.push(['More items',`${items.length-20} additional`]);
 const size=(value:unknown)=>value&&typeof value==='object'?Object.keys(value).length:0;
 stored.push(['World edits',overlay?`Created ${size(overlay.created)}, edited ${size(overlay.edits)}, trash ${size(overlay.trash)}`:'None']);
 list.push({title:'Stored data',rows:stored});
 const files:[string,string][]=['world.sqlite'].map(name=>[name,describe(path.join(store.root,name))]);
 if(runtime){
  for(const [label,scope] of [['Private Agent','private'],['Sample Agent','sample'],['Setup Agent','setup']] as const){
   const file=runtime.home(scope);
   files.push([label+(path.resolve(file)===path.resolve(home)?' (active)':''),describe(file)]);
  }
  for(const [label,file] of runtime.diagnosticFiles(home))files.push([label,describe(file)]);
 }
 list.push({title:'Local files',rows:files});
 list.push({title:'Preferences',rows:[
  ['Ambience',prefs.bool('worldlet.ambience.enabled',true)?'On':'Off'],['Ambience sound',prefs.string('worldlet.ambience.track','village')],
  ['Ambience volume',pretty(prefs.number('worldlet.ambience.volume',0.18))],['Music volume',pretty(prefs.number('worldlet.music.volume',0.24))]
 ]});
 const errors=recentErrors(store.root);
 list.push({title:'Recent errors',rows:errors.length?errors.slice(-20).map(e=>[text(e.area)||'app',text(e.code)+(e.at?'  '+e.at:'')]):[['This run','None']]});
 return list;
}
const debugText=(list:Section[])=>list.map(section=>[section.title,...section.rows.map(([label,value])=>`${label}: ${value}`)].join('\n')).join('\n\n');
const escape=(value:string)=>value.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as Record<string,string>)[c]);
let debugWindow:BrowserWindow|null=null;
/** A read-only window: models, accounts and what is stored on this computer. Its buttons
 * report through the document title, so the page needs no bridge. */
export async function showDebug(host:Host,sheet:<T>(work:()=>Promise<T>)=>Promise<T>){
 const {store}=host;
 const runtime=host.optional<AgentService>(AGENT),fox=host.optional<FoxService>(FOX);
 let agent:Row={},note:string|null=null;
 if(store.busy||runtime?.hasInteractiveWork()||fox?.turnActive())note='Fox is working; live model status was skipped.';
 else if(!runtime?.available)note='Agent runtime is not available.';
 else{
  const scope=fox?.scope()??{sample:store.sampleEnabled(),setup:!store.sampleEnabled()&&!store.state.cloudConsent};
  try{agent=await runtime.status(runtime.home(scope.sample?'sample':scope.setup?'setup':'private'));}catch{note='Agent status was unavailable.';}
 }
 const list=sections(host,agent,note);
 const copyText=debugText(list);
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>Debug</title><style>
:root{color-scheme:light dark;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{margin:0;display:flex;flex-direction:column;height:100vh}
.intro{margin:18px 20px 10px;color:GrayText}main{flex:1;overflow:auto;padding:0 20px 8px}h2{font-size:15px;margin:18px 0 8px}
table{border-collapse:collapse;width:100%}td{padding:3px 0;vertical-align:top}td:first-child{width:150px;padding-right:16px;text-align:right;color:GrayText}td:last-child{overflow-wrap:anywhere}
footer{display:flex;align-items:center;gap:10px;padding:10px 20px 16px}#status{flex:1;color:GrayText;font-size:12px}</style></head><body>
<p class="intro">Models, connected accounts and what is stored on this computer. Secrets and file contents are omitted. Nothing is uploaded.</p><main>${
 list.map(section=>`<h2>${escape(section.title)}</h2><table>${section.rows.map(([label,value])=>`<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join('')}</table>`).join('')
}</main><footer><span id="status"></span><button data-act="export">Export diagnostics</button><button data-act="copy">Copy</button><button data-act="done" autofocus>Done</button></footer>
<script>let n=0;for(const b of document.querySelectorAll('button'))b.onclick=()=>{document.title='worldlet:'+b.dataset.act+':'+(++n);};</script></body></html>`;
 debugWindow?.close();
 const parent=host.window();
 const window=new BrowserWindow({width:680,height:640,minWidth:520,minHeight:420,title:'Debug',show:false,...(parent?{parent:parent as any}:{}),
  webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,spellcheck:false}});
 debugWindow=window;
 const contents=window.webContents;
 contents.on('will-navigate',event=>event.preventDefault());
 contents.setWindowOpenHandler(()=>({action:'deny'}));
 const status=(value:string)=>{void contents.executeJavaScript(`document.getElementById('status').textContent=${JSON.stringify(value)}`).catch(()=>{});};
 contents.on('page-title-updated',(event,title)=>{
  event.preventDefault();
  const action=/^worldlet:(\w+):/.exec(title)?.[1];
  if(action==='done')window.close();
  else if(action==='copy'){clipboard.writeText(copyText);status('Copied.');}
  else if(action==='export')void exportDiagnostics(host,window,sheet).then(result=>status(result.ok?'Diagnostics saved. Nothing was uploaded.':''),()=>status('Could not save diagnostics. Try another location.'));
 });
 window.on('closed',()=>{if(debugWindow===window)debugWindow=null;});
 await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
 window.show();
}

// Feedback ----------------------------------------------------------------------------------------
export async function sendFeedback(host:Host,body:Row){
 const id=body.id,text=body.text,contact=typeof body.contact==='string'?body.contact:'';
 if(body.confirmed!==true||typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||typeof text!=='string'||!text.trim()||text.length>4000)
  throw new WorldletError('Review your feedback before sending (up to 4,000 characters).');
 if(contact.length>254)throw new WorldletError('Please check your email address.');
 const version=`${versionText(host)||'development'} (${buildNumber(host)||'unknown'})`;
 let response:Response;
 try{
  response=await fetch('https://worldlet.ai/api/feedback',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,text,contact,version}),signal:AbortSignal.timeout(25_000)});
 }catch{throw new WorldletError('Feedback was not confirmed. Your draft is kept; please retry later.');}
 if(response.status===429)throw new WorldletError('Too many feedback requests. Please try again later.');
 let receipt:Row|null=null;
 try{const raw=await response.text();if(raw.length<=16000)receipt=JSON.parse(raw);}catch{}
 if(response.status!==200||receipt?.ok!==true||receipt.id!==id)throw new WorldletError('Feedback was not confirmed. Your draft is kept; please retry later.');
 return receipt;
}
