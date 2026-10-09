// Checks the CI release candidate's Issue reporting (scripts/ci-rc-report.mjs) without GitHub.
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LABEL,issueBody,outcome,partResults,report} from './ci-rc-report.mjs';
import {gatePart} from './gate.mjs';
import {shardChecks} from './test-ui.mjs';

assert.deepEqual(outcome({job:'success',results:{results:[{command:'test',ok:true}]}}),{state:'pass'});
assert.deepEqual(outcome({job:'failure',results:{results:[{command:'test:ui',ok:false},{command:'check',ok:false},{command:'test',ok:true}]}}),{state:'fail',failing:['check','test:ui'],signature:'check,test:ui'});
assert.deepEqual(outcome({job:'failure',results:null}),{state:'fail',failing:[],signature:'setup'},'a job that never reached the gate is a setup failure');
assert.equal(outcome({job:'cancelled'}).state,'none','a superseded run reports nothing');
assert.deepEqual(outcome({job:'failure',results:{results:[{command:'test:ui',ok:false},{command:'test:ui',ok:false}]}}).failing,['test:ui'],'two failing test:ui shares are one failing gate');

// The RC runs each platform's gate in parts; the report joins one platform's parts and leaves the other's.
{
 const dir=mkdtempSync(path.join(os.tmpdir(),'rc-parts-'));
 const part=(name,platform,results)=>{mkdirSync(path.join(dir,name));writeFileSync(path.join(dir,name,'gate.json'),JSON.stringify({platform,results}));};
 part('rc-mac-base','darwin',[{command:'check',ok:true}]);part('rc-mac-ui-1','darwin',[{command:'test:ui',ok:false}]);part('rc-windows-base','win32',[{command:'test',ok:false}]);
 assert.deepEqual(partResults(dir,'mac'),{platform:'mac',results:[{command:'check',ok:true},{command:'test:ui',ok:false}]});
 assert.equal(partResults(dir,'windows').results.length,1);
 assert.equal(partResults(path.join(dir,'none'),'mac'),null,'no part ran its gate');
 rmSync(dir,{recursive:true,force:true});
}
const gates=['check','test','test:ui','test:ios'];
assert.deepEqual(gatePart(gates,{only:'test:ui'}),['test:ui']);
assert.deepEqual(gatePart(gates,{skip:'test:ui,test:ios'}),['check','test']);
assert.deepEqual(gatePart(gates,{}),gates);
assert.throws(()=>gatePart(gates,{only:'test:android'}),/no test:android/,'a part names only gates this platform has');
const lists={parallel:['a','b','c','d','e'],serial:['f','g']},shares=[1,2,3].map(i=>shardChecks(lists,`${i}/3`));
assert.deepEqual(shares.flatMap(s=>[...s.parallel,...s.serial]).sort(),['a','b','c','d','e','f','g'],'the shares hold every check once');
assert.throws(()=>shardChecks(lists,'4/3'));

const github=(issues=[])=>{const calls=[];return {calls,gh:args=>{calls.push(args);
 if(args[0]==='issue'&&args[1]==='list')return JSON.stringify(issues);
 if(args[0]==='issue'&&args[1]==='create')return 'https://github.com/example/worldlet/issues/9\n';
 return '';}};};
const fail={platform:'mac',state:'fail',failing:['test:ui'],signature:'test:ui',sha:'abc',runURL:'https://example.com/run/1'};

// A new failure opens one Issue, labelled for the cloud fixers, naming the gate and the run.
let g=github();
assert.equal(report({...fail,gh:g.gh}).created,'https://github.com/example/worldlet/issues/9');
const create=g.calls.find(c=>c[0]==='issue'&&c[1]==='create');
assert(create.includes(LABEL)&&create.includes('platform:mac'));
assert(create.at(-1).includes('npm run test:ui')&&create.at(-1).includes('https://example.com/run/1'));

// The same failure again comments on that Issue; another platform's or another signature's Issue is left alone.
const body=issueBody({...fail});
g=github([{number:3,body},{number:4,body:issueBody({...fail,platform:'windows'})}]);
assert.deepEqual(report({...fail,gh:g.gh}),{commented:3});
assert(!g.calls.some(c=>c[0]==='issue'&&c[1]==='create'));
g=github([{number:3,body}]);
assert(report({...fail,failing:['check'],signature:'check',gh:g.gh}).created,'a different failure is a new Issue');

// A pass closes only that platform's RC Issues.
g=github([{number:3,body},{number:4,body:issueBody({...fail,platform:'windows'})}]);
assert.deepEqual(report({platform:'mac',state:'pass',sha:'def',runURL:'u',gh:g.gh}),{closed:[3]});

// The workflow: never on pull requests, no secrets, and only the report job may write Issues.
const workflow=readFileSync(new URL('../.github/workflows/rc.yml',import.meta.url),'utf8');
assert(!/^\s*(pull_request|pull_request_target|merge_group)\s*:/m.test(workflow),'rc.yml never runs for pull requests');
assert(!/secrets\./.test(workflow),'the RC needs no secret');
assert.equal((workflow.match(/issues: write/g)||[]).length,1);
assert(/fail-fast: false/.test(workflow),'one failing part does not cancel the others');
assert.equal((workflow.match(/timeout-minutes: 20/g)||[]).length,2,'every part ends within 20 minutes');
console.log('ci-rc-report checks passed');
