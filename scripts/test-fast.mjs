// The fast part of `npm test` for PR CI (#1225): the node/python checks of test:core and test:worktrees that
// launch no browser, UI build or Electron. Nested `npm run …` groups (test:attention and friends) and any
// check that drives a browser stay in the RC, which runs the full `npm test`.
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts;
export const heavy=/playwright|chromium|puppeteer|from 'electron'|build-native-ui|launchPersistent/;
export function fastSteps(groups=['test:core','test:worktrees'],read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8')){
 const steps=[];
 for(const group of groups)for(const step of scripts[group].split('&&').map(s=>s.trim())){
  const m=/^(node|python3) (scripts\/\S+)(.*)$/.exec(step);if(!m)continue; // `npm run …` groups stay in the RC
  if(m[2]==='scripts/run-steps.mjs')continue; // a group too (it runs other scripts' chains)
  let text='';try{text=read(m[2]);}catch{continue;}
  if(!heavy.test(text))steps.push({bin:m[1]==='node'?process.execPath:'python3',args:[m[2],...m[3].trim().split(/\s+/).filter(Boolean)]});
 }
 return steps;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const steps=fastSteps();let failed=0;
 for(const s of steps){const r=spawnSync(s.bin,s.args,{cwd:root,stdio:'inherit'});if(r.error||r.status!==0){console.error('FAIL '+s.args.join(' '));failed++;break;}}
 console.log(`test:fast: ${steps.length} checks without a browser, UI build or Electron${failed?' — failed':''}`);
 process.exitCode=failed?1:0;
}
