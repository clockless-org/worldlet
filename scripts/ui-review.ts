// npm run test:ui:review: Codex looks at the RC run's UI (owner request 2026-10-02: RC UI should be visible as a recording,
// Codex studies it and raises problems). The real-app gates (test:onboarding, test:agent:local)
// keep pictures of the World view and their PASS lines (WORLDLET_CHECK_FRAMES, platform/electron/src/checks/index.ts)
// under .local/electron-checks/<check>-frames. This script picks up to MAX_IMAGES of them per run and asks this
// computer's Codex CLI, read-only, for visible UI problems as JSON. Findings are printed and saved to
// .local/electron-checks/ui-review.json. Only a "blocker" (unmistakable breakage a person would see at once) fails
// the gate, which hands it to the RC repair flow like any other RC failure; other findings never block a release.
// "issue" findings (clear visible defects) also go to the admin service's requirement inbox (gatehouse/inbox.mjs,
// kind rc-ui) with the pictures they name, at most once a day per check and host, so 03's requirement agent turns
// them into Issues instead of leaving them in a file on 01/02 (owner question 2026-10-03: can Codex watch the RC run
// and find bugs). The Codex CLI takes images, not video, so the run's pictures stand in for a recording.
// SKIP (pass) without pictures from the last six hours or without a Codex sign-in; a Codex error is reported and
// passes too, since the review only adds to the checks that already ran.
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,readdirSync,rmSync,statSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const MAX_IMAGES=16,FRESH_MS=6*3600_000,TIMEOUT_MS=15*60_000;
export interface FrameIndex {check:string;startedAt:string;seconds:number;passed:boolean;frames:{file:string;at:number}[];lines:{at:number;line:string}[]}
export interface Finding {severity:'blocker'|'issue'|'nit';frame:string;title:string;detail:string}

/** The pictures to show: the last one before each printed step, then evenly spaced ones, in time order, at most max. */
export function pickFrames(index:FrameIndex,max=MAX_IMAGES):string[] {
 const frames=index.frames;if(frames.length<=max)return frames.map(f=>f.file);
 const chosen=new Set<number>([0,frames.length-1]);
 for(const line of index.lines){let i=-1;for(let k=0;k<frames.length&&frames[k].at<=line.at;k++)i=k;if(i>=0)chosen.add(i);if(chosen.size>=max)break;}
 for(let step=1;chosen.size<max;step++){const i=Math.round(step*(frames.length-1)/(max+1));if(i>=frames.length)break;chosen.add(i);if(step>max*4)break;}
 return [...chosen].sort((a,b)=>a-b).slice(0,max).map(i=>frames[i].file);
}

export const SCHEMA={type:'object',additionalProperties:false,required:['summary','findings'],properties:{
 summary:{type:'string'},
 findings:{type:'array',items:{type:'object',additionalProperties:false,required:['severity','frame','title','detail'],properties:{
  severity:{type:'string',enum:['blocker','issue','nit']},frame:{type:'string'},title:{type:'string'},detail:{type:'string'}}}}}};

export function reviewPrompt(index:FrameIndex,files:string[]){
 const steps=index.lines.map(l=>`${(l.at/1000).toFixed(0)}s ${l.line}`).join('\n')||'(none printed)';
 return `You are reviewing screenshots from an automated release-candidate run of Worldlet, a desktop app: a small illustrated world (regions, places, a fox character named Fox with a chat panel, HUD panels).
The run was the "${index.check}" check; it ${index.passed?'passed':'failed'} after ${index.seconds}s. Its printed steps, with seconds from the start:
${steps}

The attached images are, in order: ${files.join(', ')} (taken every 1.5 s when the screen changed; website panels are not in them).
Look only at what is visible. Report UI problems a person would notice: broken or missing artwork, blank or black areas, text cut off, overlapping or unreadable text, controls covering each other, error messages, spinners or loading states that never end across frames, layout jumping, wrong language, debugging text left on screen.
Severity: "blocker" only for unmistakable breakage that makes the app unusable or obviously broken (a blank or black World, an error dialog, the main UI missing or unreadable). "issue" for a clear visible defect. "nit" for polish. Do not report intended art style, fictional practice content, or anything you are unsure about. An empty list is a good answer.
Answer in English with the JSON schema: a one-paragraph summary and the findings, each naming the frame file it is seen in.`;
}

/** Strict reading of Codex's answer; anything malformed is an error, never a silent pass. */
export function parseReview(text:string):{summary:string;findings:Finding[]} {
 const v=JSON.parse(text);
 if(!v||typeof v.summary!=='string'||!Array.isArray(v.findings))throw Error('malformed review');
 const findings=v.findings.map((f:any)=>{
  if(!['blocker','issue','nit'].includes(f?.severity)||typeof f.title!=='string'||typeof f.detail!=='string'||typeof f.frame!=='string')throw Error('malformed finding');
  return {severity:f.severity,frame:f.frame.slice(0,40),title:f.title.slice(0,200),detail:f.detail.slice(0,1000)};
 });
 return {summary:v.summary.slice(0,2000),findings};
}

/** The frame folders a gate run just wrote: index.json younger than FRESH_MS. */
export function freshRuns(logs:string,now=Date.now()):{dir:string;index:FrameIndex}[] {
 if(!existsSync(logs))return [];
 return readdirSync(logs).filter(n=>n.endsWith('-frames')).map(n=>path.join(logs,n)).filter(dir=>existsSync(path.join(dir,'index.json'))&&now-statSync(path.join(dir,'index.json')).mtimeMs<FRESH_MS)
  .map(dir=>({dir,index:JSON.parse(readFileSync(path.join(dir,'index.json'),'utf8')) as FrameIndex})).filter(r=>Array.isArray(r.index.frames)&&r.index.frames.length>0);
}

export const REPORT_EVERY_MS=24*3600_000,MAX_REPORT_FRAMES=8,MAX_REPORT_FRAME_BYTES=300*1024;
/** The inbox item for one reviewed run's "issue" findings (blockers already fail the gate, nits are left out), with the
 * pictures they name; null when there is nothing to send. Shapes and limits follow cleanItem in gatehouse/inbox.mjs. */
export function inboxItem({machine,sha,dir,index,summary,findings}:{machine:string;sha:string;dir:string;index:FrameIndex;summary:string;findings:Finding[]}){
 const issues=findings.filter(f=>f.severity==='issue');if(!issues.length)return null;
 const at=new Map(index.frames.map(f=>[f.file,f.at]));
 const files=[...new Set(issues.map(f=>f.frame))].filter(f=>at.has(f)&&existsSync(path.join(dir,f))&&statSync(path.join(dir,f)).size<=MAX_REPORT_FRAME_BYTES).slice(0,MAX_REPORT_FRAMES);
 const shot=(f:string)=>files.includes(f)?`screenshot ${files.indexOf(f)}`:f;
 return {source:'rc-ui',sourceId:`${machine}.${index.check}.${sha.slice(0,12)}`.replace(/[^A-Za-z0-9._-]/g,'-').slice(0,120),
  title:`RC UI review on ${machine}: ${issues.length} visible problem${issues.length===1?'':'s'} in ${index.check}`,
  body:`Codex reviewed pictures of the ${index.check} release-candidate run on ${machine} (commit ${sha.slice(0,12)}, ${index.passed?'passed':'failed'} after ${index.seconds}s) and found:\n\n${issues.map(f=>`- ${f.title} (${shot(f.frame)}): ${f.detail}`).join('\n')}\n\nCodex's summary: ${summary}`,
  frames:files.map(f=>({at:Math.round(at.get(f)!/1000),jpeg:readFileSync(path.join(dir,f)).toString('base64')}))};
}

/** Sends each reviewed run's item to admin, once a day per check; any failure is a warning, never a gate result. */
async function reportFindings(root:string,results:{dir:string;index:FrameIndex;summary:string;findings:Finding[]}[]){
 if(!results.some(r=>r.findings.some(f=>f.severity==='issue')))return;
 // RC gates run in a temporary checkout; the enrolment lives in the host's primary checkout.
 let primary=root;try{primary=path.dirname(execFileSync('git',['rev-parse','--path-format=absolute','--git-common-dir'],{cwd:root,encoding:'utf8'}).trim());}catch{}
 const configFile=process.env.WORLDLET_MACHINE_SERVICE_CONFIG||path.join(primary,'.local/machine-service.json');
 let config:{url?:string;token?:string;machine?:string}|null=null;try{config=JSON.parse(readFileSync(configFile,'utf8'));}catch{}
 if(!config?.url||!config.token||!config.machine){console.log('UI review findings stay local: this computer is not enrolled with the admin service');return;}
 let sha='unknown';try{sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{}
 const stateFile=path.join(path.dirname(configFile),'ui-review-reported.json');
 let state:Record<string,number>={};try{state=JSON.parse(readFileSync(stateFile,'utf8'));}catch{}
 for(const r of results){
  const item=inboxItem({machine:config.machine,sha,...r});if(!item)continue;
  if(Date.now()-(state[r.index.check]||0)<REPORT_EVERY_MS){console.log(`UI review findings of ${r.index.check} not sent: sent to admin less than a day ago`);continue;}
  try{
   const res=await fetch(new URL('/api/machine/inbox',config.url),{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json','User-Agent':'worldlet-ui-review'},body:JSON.stringify(item),signal:AbortSignal.timeout(30_000)});
   if(!res.ok)throw Error(`Gatehouse answered ${res.status}`);
   state[r.index.check]=Date.now();writeFileSync(stateFile,JSON.stringify(state));
   console.log(`UI review findings of ${r.index.check} sent to the admin requirement inbox (${item.frames.length} pictures)`);
  }catch(error){console.warn(`warning: UI review findings of ${r.index.check} not sent: ${error instanceof Error?error.message:String(error)}`);}
 }
}

function review(codex:string,dir:string,index:FrameIndex){
 const files=pickFrames(index),work=mkdtempSync(path.join(os.tmpdir(),'worldlet-ui-review-'));
 try{
  const schema=path.join(work,'schema.json'),out=path.join(work,'review.json');
  writeFileSync(schema,JSON.stringify(SCHEMA));
  const args=['exec','--skip-git-repo-check','--sandbox','read-only','--cd',work,'--image',files.map(f=>path.join(dir,f)).join(','),'--output-schema',schema,'--output-last-message',out,'-'];
  // Windows runs the codex.cmd shim through the shell, so arguments with spaces are quoted.
  const windows=process.platform==='win32',quoted=windows?args.map(a=>/[\s"]/.test(a)?`"${a.replace(/"/g,'\\"')}"`:a):args;
  const run=spawnSync(codex,quoted,{input:reviewPrompt(index,files),encoding:'utf8',timeout:TIMEOUT_MS,maxBuffer:64*1024*1024,shell:windows});
  if(run.status!==0||!existsSync(out))throw Error(`codex exec exited ${run.status??run.signal}${run.error?': '+run.error.message:''}: ${(run.stderr||'').trim().split('\n').slice(-3).join(' ').slice(0,400)}`);
  return {...parseReview(readFileSync(out,'utf8')),images:files.length};
 }finally{rmSync(work,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.WORLDLET_CODEX_GATES_SKIP){console.log('SKIP UI review: '+process.env.WORLDLET_CODEX_GATES_SKIP);process.exit(0);}
 const root=fileURLToPath(new URL('../',import.meta.url)),logs=process.env.WORLDLET_CHECK_LOGS||path.join(root,'.local/electron-checks');
 const runs=freshRuns(logs);
 if(!runs.length){console.log('SKIP UI review: no pictures from a real-app check in the last six hours');process.exit(0);}
 const codexHome=process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
 if(!process.env.WORLDLET_UI_REVIEW_CODEX&&!existsSync(path.join(codexHome,'auth.json'))){console.log(`SKIP UI review: no Codex sign-in on this computer (${path.join(codexHome,'auth.json')})`);process.exit(0);}
 const codex=process.env.WORLDLET_UI_REVIEW_CODEX||'codex';
 const results=[],reviewed=[];let blockers=0;
 for(const {dir,index} of runs){
  try{
   const r=review(codex,dir,index);results.push({check:index.check,dir:path.relative(root,dir),...r});reviewed.push({dir,index,...r});
   console.log(`UI review of ${index.check} (${r.images} pictures): ${r.summary}`);
   for(const f of r.findings){console.log(`  ${f.severity.toUpperCase()} ${f.frame}: ${f.title} — ${f.detail}`);if(f.severity==='blocker')blockers++;}
  }catch(error){console.warn(`warning: UI review of ${index.check} could not run: ${error instanceof Error?error.message:String(error)}`);results.push({check:index.check,error:String(error)});}
 }
 writeFileSync(path.join(logs,'ui-review.json'),JSON.stringify({at:new Date().toISOString(),results},null,1));
 await reportFindings(root,reviewed);
 if(blockers){console.error(`FAIL UI review: ${blockers} blocker${blockers===1?'':'s'}; pictures and findings in .local/electron-checks (ui-review.json)`);process.exit(1);}
 console.log('PASS UI review: no blocker (findings, if any, in .local/electron-checks/ui-review.json)');
}
