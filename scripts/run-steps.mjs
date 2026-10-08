// `node scripts/run-steps.mjs <npm script>…`: runs the `a && b && c` chain of each named package.json script with its
// checks side by side instead of one after another (owner request 2026-10-05: an RC finishes within 20 minutes; the
// chains of npm test, test:hermes and test:website took about three minutes on the Mac one by one). Up to four steps run
// at once (three on Windows, WORLDLET_TEST_UI_CONCURRENCY, as in test:ui), with one order kept: a nested `npm run …`
// step starts after the npm step before it and every step after it waits for it, since those may read what it builds
// (test:attention builds the interface); the steps before it run beside it, as they never needed it. Each step prints
// one line as it ends, every failed step's output follows, and any failure fails the run. The chains stay ordinary npm
// scripts, so `npm run <name>` still runs them one by one.
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runStep,testUiConcurrency,npmCli} from './test-ui.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export function chainSteps(name,scripts,cli=npmCli()){
 const chain=scripts[name];
 if(typeof chain!=='string')throw Error('no package.json script '+name);
 const steps=[];let after=-1;
 for(const step of chain.split('&&').map(s=>s.trim()).filter(Boolean)){
  const npm=/^npm run ([\w:-]+)$/.exec(step),direct=/^(node|python3) ([\w./-]+)((?: [\w./:=-]+)*)$/.exec(step);
  // `after`: the index of the step this one waits for (the last npm step before it), -1 for none.
  if(npm){if(!cli)throw Error('npm-cli.js not found beside '+process.execPath);steps.push({name:step,bin:process.execPath,args:[cli,'run',npm[1]],after,npm:true});after=steps.length-1;}
  else if(direct)steps.push({name:step,bin:direct[1]==='node'?process.execPath:'python3',args:[direct[2],...direct[3].trim().split(/\s+/).filter(Boolean)],after});
  else throw Error(`${name}: step "${step}" is neither npm run nor node/python3 with plain arguments`);
 }
 return steps;
}
// Up to `limit` steps at once, each as soon as a lane is free and the step it waits for has ended, npm steps first, as
// the steps after them wait for them; results in list order.
export async function schedule(steps,limit,run){
 const results=[],done=steps.map(()=>null),started=new Set();let wake=()=>{};
 const ready=i=>!started.has(i)&&(steps[i].after<0||done[steps[i].after]);
 const lane=async()=>{for(;;){
  let i=steps.findIndex((x,k)=>x.npm&&ready(k));if(i<0)i=steps.findIndex((_,k)=>ready(k));
  if(i<0){if(started.size===steps.length)return;await new Promise(r=>{const prev=wake;wake=()=>{prev();r();};});continue;}
  started.add(i);results[i]=await run(steps[i]);done[i]=true;const w=wake;wake=()=>{};w();
 }};
 await Promise.all(Array.from({length:Math.min(limit,steps.length)},lane));
 return results;
}
const duration=s=>s<60?s.toFixed(1)+'s':Math.floor(s/60)+'m '+String(Math.floor(s%60)).padStart(2,'0')+'s';
export async function runSteps(names,{scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts,limit=testUiConcurrency(),run=step=>runStep(step,{cwd:root}),log=console.log,cli=npmCli()}={}){
 const started=Date.now(),results=[];
 const report=r=>{log(`${r.ok?'PASS':'FAIL'} ${duration(r.seconds).padStart(7)}  ${r.name}`);return r;};
 for(const name of names){
  const steps=chainSteps(name,scripts,cli);
  log(`${name}: ${steps.length} steps, ${limit} at a time`);
  results.push(...await schedule(steps,limit,step=>run(step).then(report)));
 }
 const failed=results.filter(r=>!r.ok);
 log(`\n${names.join(', ')}: ${results.length-failed.length} of ${results.length} steps passed in ${duration((Date.now()-started)/1000)}`);
 for(const r of failed)log(`\n===== ${r.name} failed after ${duration(r.seconds)}. Its output: =====\n${r.output.trimEnd()}`);
 if(failed.length)log(`\n${names.join(', ')} failed: ${failed.map(r=>r.name).join(', ')}`);
 return failed.length?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await runSteps(process.argv.slice(2));
