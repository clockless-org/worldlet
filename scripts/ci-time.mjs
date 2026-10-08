// PR CI time and spend (owner ask 2026-10-04: PR CI on Linux only, the required Architecture check within three
// minutes of a push, reported every hour). For every Architecture run created in the window it measures the wait a
// pull request sees, from the push (run created) to the `Architecture` job finishing; it also adds up the billed
// minutes of every workflow run in the window by runner OS. Reads GitHub through `gh api` (REST, manual paging).
// Usage: npm run ci:time [-- --hours 1] [--until <ISO time>] [--since <ISO time>] [--json]
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const LIMIT_SECONDS=180;
// GitHub's per-minute rates for standard hosted runners (USD); each job is billed in whole minutes.
export const RATES={linux:0.006,windows:0.010,macos:0.062,'self-hosted':0};
const secondsBetween=(a,b)=>(Date.parse(b)-Date.parse(a))/1000;
export function runnerOs(labels=[]){
 const l=labels.join(' ').toLowerCase();
 return l.includes('self-hosted')?'self-hosted':l.includes('macos')?'macos':l.includes('windows')?'windows':'linux';
}
const percentile=(sorted,p)=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]:null;
// A job GitHub refused to start (billing: about two seconds, no step ran) costs nothing and measures nothing.
export const executed=job=>Boolean(job.started_at&&job.completed_at&&job.steps?.some(s=>s.started_at&&s.conclusion!=='skipped'));
// runs: [{name, created_at, jobs:[{name, labels, started_at, completed_at, conclusion, steps}]}]
export function summarise(runs){
 const durations=[],minutes={};
 let refusedJobs=0,refusedRuns=0;
 for(const run of runs){
  for(const job of run.jobs){
   if(!executed(job)){if(job.completed_at&&job.conclusion!=='skipped')refusedJobs++;continue;}
   const s=secondsBetween(job.started_at,job.completed_at);
   if(s<=0)continue;
   const os=runnerOs(job.labels);
   minutes[os]=(minutes[os]||0)+Math.ceil(s/60);
  }
  if(run.name!=='Architecture contracts')continue;
  const gate=run.jobs.find(j=>j.name==='Architecture');
  if(!gate)continue;
  // Timed only when the Architecture job itself ran: a run whose gate GitHub refused has no CI time, even if other jobs ran.
  if(!executed(gate)){if(gate.completed_at&&gate.conclusion!=='skipped'&&gate.conclusion!=='cancelled')refusedRuns++;continue;}
  if(gate.conclusion!=='cancelled')durations.push(secondsBetween(run.created_at,gate.completed_at));
 }
 const sorted=[...durations].sort((a,b)=>a-b);
 const cost=Object.entries(minutes).reduce((sum,[os,m])=>sum+m*(RATES[os]??0),0);
 return {runs:sorted.length,p50:percentile(sorted,.5),p90:percentile(sorted,.9),max:sorted.at(-1)??null,
  over:sorted.filter(s=>s>LIMIT_SECONDS).length,minutes,cost:Math.round(cost*100)/100,unstarted:refusedRuns,refusedJobs};
}
export function format(s,hours){
 const t=v=>v===null?'–':`${Math.floor(v/60)}:${String(Math.round(v%60)).padStart(2,'0')}`;
 const mins=Object.entries(s.minutes).map(([os,m])=>`${os} ${m}`).join(', ')||'none';
 return [`PR CI, last ${hours} h: ${s.runs} Architecture runs; p50 ${t(s.p50)}, p90 ${t(s.p90)}, max ${t(s.max)}; over 3:00: ${s.over}`,
  `Billed minutes: ${mins} (about $${s.cost.toFixed(2)})`+(s.refusedJobs?`; not started by GitHub (billing): ${s.unstarted} Architecture runs, ${s.refusedJobs} jobs`:'')].join('\n');
}
function api(path){return JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8',maxBuffer:64<<20}));}
function fetchRuns(repo,since,until){
 const runs=[];
 for(let page=1;;page++){
  const batch=api(`repos/${repo}/actions/runs?per_page=100&page=${page}&created=${until?`${since}..${until}`:`>=${since}`}`).workflow_runs;
  runs.push(...batch);
  if(batch.length<100)break;
 }
 for(const run of runs){
  run.jobs=[];
  for(let page=1;;page++){
   const batch=api(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100&page=${page}&filter=latest`).jobs;
   run.jobs.push(...batch);
   if(batch.length<100)break;
  }
 }
 return runs;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=name=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:undefined;};
 const hours=Number(arg('--hours')||1),repo=arg('--repo')||'renkelvin/worldlet-ops';
 const until=arg('--until'),end=until?Date.parse(until):Date.now();
 const since=arg('--since')||new Date(end-hours*3600e3).toISOString().replace(/\.\d+Z$/,'Z');
 const summary=summarise(fetchRuns(repo,since,until));
 console.log(process.argv.includes('--json')?JSON.stringify({hours,since,...summary}):format(summary,hours));
}
