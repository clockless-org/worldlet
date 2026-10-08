// scripts/run-steps.mjs, which runs a package.json chain's checks side by side for the RC gates: how it splits a
// chain, that nested npm steps run first and alone, that failures fail the run with their output, and the gates it serves.
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {chainSteps,runSteps} from './run-steps.mjs';

const scripts={a:'node scripts/x-check.ts --core-only && npm run b && python3 scripts/y-check.py',b:'node scripts/z.ts',bad:'node x.ts | tee log'};
const steps=chainSteps('a',scripts,'/n/npm-cli.js');
assert.deepEqual(steps.map(s=>[s.bin,s.args,s.after]),[[process.execPath,['scripts/x-check.ts','--core-only'],-1],[process.execPath,['/n/npm-cli.js','run','b'],-1],['python3',['scripts/y-check.py'],1]],
 'node as this node, Python as python3, npm through npm-cli.js, all without a shell; a step after an npm step waits for it');
assert.throws(()=>chainSteps('bad',scripts,'/n/npm-cli.js'),/neither npm run nor node/,'a step it cannot run without a shell is refused, not skipped');
assert.throws(()=>chainSteps('missing',scripts,'/n/npm-cli.js'),/no package.json script/);

// The npm step starts first, beside the step before it; the step after it waits for it; one failure fails the run.
const events=[],lines=[];
const run=async step=>{events.push('start '+step.name);await new Promise(r=>setTimeout(r,step.npm?20:5));events.push('end '+step.name);
 const ok=!step.name.includes('y-check');return {name:step.name,ok,seconds:.01,output:ok?'':'AssertionError: y broke'};};
assert.equal(await runSteps(['a'],{scripts,limit:2,run,log:l=>lines.push(l),cli:'/n/npm-cli.js'}),1);
assert.deepEqual(events,['start npm run b','start node scripts/x-check.ts --core-only','end node scripts/x-check.ts --core-only','end npm run b','start python3 scripts/y-check.py','end python3 scripts/y-check.py'],events.join(', '));
assert.ok(lines.some(l=>l.includes('AssertionError: y broke'))&&lines.at(-1)==='\na failed: python3 scripts/y-check.py','the failure and its output are printed last');
assert.equal(await runSteps(['b'],{scripts,run,log:()=>{},cli:'/n/npm-cli.js'}),0);
// One at a time, the npm step still goes first.
events.length=0;await runSteps(['a'],{scripts,limit:1,run,log:()=>{},cli:'/n/npm-cli.js'});
assert.deepEqual(events.filter(e=>e.startsWith('start')).map(e=>e.slice(6)),['npm run b','node scripts/x-check.ts --core-only','python3 scripts/y-check.py']);

// The RC gates it serves: their chains parse, and npm test keeps the worktree checks (git worktrees) one by one after it.
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).scripts;
assert.equal(pkg.test,'node scripts/run-steps.mjs test:core && npm run test:worktrees');
assert.equal(pkg['test:hermes'],'node scripts/run-steps.mjs test:hermes:checks');
// The open-source export has no website/, so it has no test:website.
const website=existsSync(new URL('../website',import.meta.url));
if(website)assert.equal(pkg['test:website'],'node scripts/run-steps.mjs test:website:checks');
for(const name of ['test:core','test:hermes:checks',...(website?['test:website:checks']:[])])assert.ok(chainSteps(name,pkg,'/n/npm-cli.js').length>3,name);
console.log('PASS run-steps: chain steps side by side, npm steps first and what follows them after them; failures fail with their output; npm test, test:hermes and test:website use it');
