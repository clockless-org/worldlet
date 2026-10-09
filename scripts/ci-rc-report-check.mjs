// Checks the CI release candidate's Issue reporting (scripts/ci-rc-report.mjs) without GitHub.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LABEL,issueBody,outcome,report} from './ci-rc-report.mjs';

assert.deepEqual(outcome({job:'success',results:{results:[{command:'test',ok:true}]}}),{state:'pass'});
assert.deepEqual(outcome({job:'failure',results:{results:[{command:'test:ui',ok:false},{command:'check',ok:false},{command:'test',ok:true}]}}),{state:'fail',failing:['check','test:ui'],signature:'check,test:ui'});
assert.deepEqual(outcome({job:'failure',results:null}),{state:'fail',failing:[],signature:'setup'},'a job that never reached the gate is a setup failure');
assert.equal(outcome({job:'cancelled'}).state,'none','a superseded run reports nothing');

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
console.log('ci-rc-report checks passed');
