/** Applet-owned background contract. Attention is an optional subscriber. */
export interface AppletRuntimeSpec {
 version:1;key:string;provider:string;mode:'scheduled'|'observation'|'on-demand'|'website';
 reader:string;intervalMinutes:number;publishAttention:boolean;
 syncTimeoutSeconds?:number;analysisTimeoutSeconds?:number;analysisBatchSize?:number;analysisHighWaterMark?:number;analysisPrompt?:string;
 analysis:'source-small'|'structured'|'none';initialLimit:number;pageSize:number;windowDays:number;
}
/** V2 declares executable stages; only shipped handlers are accepted. */
export interface AppletTaskSpec {
 key:'sync'|'analyze';handler:'source.read'|'source.analyze';
 pool:'source-io'|'source-analysis';trigger:'interval'|'observations';
 intervalMinutes?:number;batchSize:number;timeoutSeconds?:number;highWaterMark?:number;prompt?:string;
}
export interface AppletRuntimeV2 {
 version:2;key:string;provider:string;mode:'scheduled';reader:string;
 publishAttention:boolean;initialLimit:number;windowDays:number;
 tasks:AppletTaskSpec[];
}
export type AppletRuntimeManifest=AppletRuntimeSpec|AppletRuntimeV2;
// Configuration is executable policy: reject typos rather than silently ignoring them.
function declaration(value:unknown,fields:string[],label:string):asserts value is Record<string,any> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid '+label+'.');
 const unknown=Object.keys(value).filter(key=>!fields.includes(key));
 if(unknown.length)throw Error('Unsupported '+label+' fields: '+unknown.join(', '));
}
const commonFields=['version','key','provider','mode','reader','publishAttention','initialLimit','windowDays'];
const v1Fields=[...commonFields,'intervalMinutes','analysis','pageSize','syncTimeoutSeconds','analysisTimeoutSeconds','analysisBatchSize','analysisHighWaterMark','analysisPrompt'];
const taskFields=['key','handler','pool','trigger','intervalMinutes','batchSize','timeoutSeconds','highWaterMark','prompt'];
/** Compile declarations to the host contract; v1 packages remain readable. */
export function normalizeAppletRuntime(input:AppletRuntimeManifest):AppletRuntimeSpec {
 declaration(input,[...v1Fields,'tasks'],'Applet runtime');
 if(input.version===1){declaration(input,v1Fields,'v1 Applet runtime');return {...input};}
 declaration(input,[...commonFields,'tasks'],'v2 Applet runtime');
 if(input.version!==2||input.mode!=='scheduled'||!Array.isArray(input.tasks))throw Error('Unsupported Applet runtime version or mode.');
 for(const task of input.tasks)declaration(task,taskFields,'Applet task');
 const sync=input.tasks.find(t=>t.key==='sync'),analysis=input.tasks.find(t=>t.key==='analyze');
 if(input.tasks.length!==(analysis?2:1)||!sync||sync.handler!=='source.read'||sync.pool!=='source-io'||sync.trigger!=='interval'||sync.highWaterMark!==undefined||sync.prompt!==undefined)throw Error('Invalid Applet sync declaration.');
 if(analysis&&(analysis.handler!=='source.analyze'||analysis.pool!=='source-analysis'||analysis.trigger!=='observations'||analysis.intervalMinutes!==undefined))throw Error('Invalid Applet analysis declaration.');
 if(!['source-reader','native-calendar'].includes(input.reader))throw Error('Unknown Applet reader.');
 return {version:1,key:input.key,provider:input.provider,mode:input.mode,reader:input.reader,
  intervalMinutes:sync.intervalMinutes!,publishAttention:input.publishAttention,
  syncTimeoutSeconds:sync.timeoutSeconds??240,analysisTimeoutSeconds:analysis?.timeoutSeconds??600,
  analysisBatchSize:analysis?.batchSize??sync.batchSize,analysisHighWaterMark:analysis?.highWaterMark??100,
  ...(analysis?.prompt?{analysisPrompt:analysis.prompt}:{}),
  analysis:analysis?'source-small':'structured',initialLimit:input.initialLimit,pageSize:sync.batchSize,windowDays:input.windowDays};
}
export function validateAppletRuntimes(manifests:AppletRuntimeManifest[]){
 if(!Array.isArray(manifests))throw Error('Applet registry must be an array.');
 const rows=manifests.map(normalizeAppletRuntime);
 const keys=new Set<string>(),providers=new Set<string>();
 for(const r of rows){
  if(r.version!==1||typeof r.key!=='string'||!/^[-a-z0-9]+$/.test(r.key)||typeof r.provider!=='string'||!/^[-a-z0-9]+$/.test(r.provider)||keys.has(r.key)||!['scheduled','observation','on-demand','website'].includes(r.mode)||!['source-small','structured','none'].includes(r.analysis)||typeof r.publishAttention!=='boolean'||!Number.isInteger(r.initialLimit)||r.initialLimit<0||r.initialLimit>1000||!Number.isInteger(r.pageSize)||r.pageSize<1||r.pageSize>20||!Number.isInteger(r.windowDays)||r.windowDays<0||r.windowDays>90)throw Error('Invalid Applet runtime specification.');
  if(r.analysisPrompt!==undefined&&(r.analysis!=='source-small'||!/^prompts\/[a-z-]+\.md$/.test(r.analysisPrompt)))throw Error('Invalid analysis prompt path.');
  for(const value of [r.syncTimeoutSeconds,r.analysisTimeoutSeconds])if(value!==undefined&&(!Number.isInteger(value)||value<15||value>600))throw Error('Invalid Applet task timeout.');
  const batch=r.analysisBatchSize??r.pageSize,highWater=r.analysisHighWaterMark??100;
  if(!Number.isInteger(batch)||batch<1||batch>20||!Number.isInteger(highWater)||highWater<Math.max(batch,r.pageSize)||highWater>1000)throw Error('Invalid Applet analysis queue policy.');
  if(['website','on-demand'].includes(r.mode)&&(r.reader!=='existing-applet-adapter'||r.intervalMinutes!==0||r.analysis!=='none'||r.publishAttention))throw Error('On-demand Applets cannot declare an unimplemented background worker.');
  if(r.mode==='observation'&&(r.reader!=='observation'||r.analysis!=='structured'||!Number.isInteger(r.intervalMinutes)||r.intervalMinutes<0))throw Error('Invalid observation Applet.');
  keys.add(r.key);
  if(r.mode==='scheduled'){if(!r.provider||providers.has(r.provider)||!['source-reader','native-calendar'].includes(r.reader)||!Number.isInteger(r.intervalMinutes)||r.intervalMinutes<15||r.intervalMinutes>1440||r.initialLimit<1)throw Error('Invalid Applet schedule.');providers.add(r.provider);}
 }
 return rows;
}
/** A persisted cursor makes initial coverage resumable; failed pages never advance it. */
export function appletReadPlan(manifest:AppletRuntimeManifest,cursor:any={},now:number){
 const [spec]=validateAppletRuntimes([manifest]);
 if(spec.mode!=='scheduled')throw Error('Applet has no scheduled reader.');
 const pending=!!cursor.pageToken,initial=!cursor.initialComplete;
 const started=pending?cursor.startedAt:now;
 const query=spec.provider==='gmail'?(pending?cursor.query:initial?'in:anywhere':`after:${Math.floor((cursor.lastSuccessAt||now-86400)-86400)}`):'';
 const scanned=pending?cursor.scanned||0:0;
 const limit=initial?Math.min(spec.pageSize,spec.initialLimit-scanned,spec.provider==='gmail'&&!pending?5:spec.pageSize):spec.pageSize;
 return {provider:spec.provider,limit,pageToken:pending?cursor.pageToken:'',query,scanMessages:spec.provider==='gmail',...(spec.provider==='google-calendar'?{windowStart:started,windowDays:spec.windowDays}:{}),startedAt:started,initial,scanned};
}
export function finishAppletPage(manifest:AppletRuntimeManifest,cursor:any,plan:any,page:any,now:number){
 const [spec]=validateAppletRuntimes([manifest]);
 if(spec.mode!=='scheduled'||plan.provider!==spec.provider||!Number.isInteger(plan.limit)||plan.limit<1||plan.limit>spec.pageSize)throw Error('Invalid Applet page plan.');
 const count=page.scannedCount??page.records?.length??0;
 if(!Number.isInteger(count)||count<0||count>plan.limit)throw Error('Invalid Applet page count.');
 const scanned=plan.scanned+count,more=!!page.nextPageToken&&(!plan.initial||scanned<spec.initialLimit);
 return {...cursor,startedAt:plan.startedAt,query:plan.query,scanned,pageToken:more?page.nextPageToken:'',initialComplete:cursor.initialComplete||!more,lastSuccessAt:more?cursor.lastSuccessAt:plan.startedAt,updatedAt:now,hasMore:more,coverage:more?'scanning':page.nextPageToken?'bounded':'complete'};
}
