// Which scripts/*-check files a net runs. A check guards nothing until PR CI or the RC runs it: the fixes for problems
// people hit in owner meetings (2026-09-24 to 10-03) had checks that sat in opt-in npm suites no net called, so the
// fixes could have come undone unseen. The nets: the RC gates (scripts/gate.mjs, through every npm suite they call),
// the test:ui lists (scripts/test-ui.mjs), the RC's operational checks (scripts/pr-checks.mjs), PR CI's fast checks and
// the Mac release pipeline (scripts/release-local.sh), which stops before anything is public when a check fails.
import {readFileSync,readdirSync} from 'node:fs';
import {sharedGates,platformGates} from './gate.mjs';
import {parallelChecks,serialChecks} from './test-ui.mjs';
import {operationalChecks,trustChecks} from './pr-checks.mjs';

const scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts;
export function reachedChecks(){
 const reached=new Set([...parallelChecks,...serialChecks,...operationalChecks,...trustChecks]);
 const walk=(name,seen)=>{
  if(seen.has(name)||!scripts[name])return;seen.add(name);
  for(const m of scripts[name].matchAll(/scripts\/[\w./-]+/g))reached.add(m[0]);
  for(const m of scripts[name].matchAll(/npm run ([\w:-]+)/g))walk(m[1],seen);
  // scripts/run-steps.mjs runs the chains of the scripts it names side by side.
  for(const m of scripts[name].matchAll(/scripts\/run-steps\.mjs((?: [\w:-]+)+)/g))for(const n of m[1].trim().split(' '))walk(n,seen);
 };
 const seen=new Set();
 for(const gate of [...sharedGates,...Object.values(platformGates).flat(),'check:pr','check:docs','check:style'])walk(gate,seen);
 for(const m of readFileSync(new URL('./release-local.sh',import.meta.url),'utf8').matchAll(/^\s*(?:node|python3?)\s+(scripts\/[\w./-]+)/gm))reached.add(m[1]);
 // A check that a reached check imports runs with it (platform-contract-check imports source-snapshot-check).
 for(const file of reached){
  let source;try{source=readFileSync(new URL('../'+file,import.meta.url),'utf8');}catch{continue;}
  if(file.startsWith('scripts/'))for(const m of source.matchAll(/import\s*\(?\s*['"]\.\/([\w.-]+-check\.(?:ts|mjs))['"]/g))reached.add('scripts/'+m[1]);
 }
 return reached;
}
// The files one gate command runs: its npm chain, the test:ui lists when it calls test-ui.mjs, the operational and
// trust checks when it calls pr-checks.mjs. A checkpoint carried over a check-only change (machine-nightly.mjs) still
// reruns a gate whose own files changed.
export function gateReach(gate){
 const files=new Set(),seen=new Set();
 const walk=name=>{
  if(seen.has(name)||!scripts[name])return;seen.add(name);
  for(const m of scripts[name].matchAll(/scripts\/[\w./-]+/g))files.add(m[0]);
  for(const m of scripts[name].matchAll(/npm run ([\w:-]+)/g))walk(m[1]);
  for(const m of scripts[name].matchAll(/scripts\/run-steps\.mjs((?: [\w:-]+)+)/g))for(const n of m[1].trim().split(' '))walk(n);
 };
 walk(gate);
 if(files.has('scripts/test-ui.mjs'))for(const f of [...parallelChecks,...serialChecks])files.add(f);
 if(files.has('scripts/pr-checks.mjs'))for(const f of [...operationalChecks,...trustChecks])files.add(f);
 return files;
}
// Every check file, in scripts/ and the admin service (gatehouse/): until 2026-10-04 only scripts/*-check.{ts,mjs,py}
// were looked at, and a .cjs check and three admin checks sat outside every net unnoticed.
const checkDirs=['scripts','gatehouse'];
export const allChecks=()=>checkDirs.flatMap(dir=>readdirSync(new URL('../'+dir+'/',import.meta.url)).filter(f=>/-check\.(?:ts|mts|mjs|cjs|js|py)$/.test(f)).map(f=>dir+'/'+f)).sort();
export const unreachedChecks=()=>{const reached=reachedChecks();return allChecks().filter(f=>!reached.has(f));};
