// Checks the release stages' Issue reporting (scripts/ci-failure-report.mjs) without GitHub.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LABEL,issueBody,outcome,partResults,report} from './ci-failure-report.mjs';
import {gatePart} from './gate.mjs';
import {shardChecks} from './test-ui.mjs';

assert.deepEqual(outcome({job:'success',results:{results:[{command:'test',ok:true}]}}),{state:'pass'});
assert.deepEqual(outcome({job:'failure',results:{results:[{command:'test:ui',ok:false},{command:'check',ok:false},{command:'test',ok:true}]}}),{state:'fail',failing:['check','test:ui'],signature:'check,test:ui'});
assert.deepEqual(outcome({job:'failure',results:null}),{state:'fail',failing:[],signature:'setup'},'a job that never reached the gate is a setup failure');
assert.equal(outcome({job:'cancelled'}).state,'none','a superseded run reports nothing');
assert.deepEqual(outcome({job:'failure',results:{results:[{command:'test:ui',ok:false},{command:'test:ui',ok:false}]}}).failing,['test:ui'],'two failing test:ui shares are one failing gate');
const withError=outcome({job:'failure',results:{results:[{command:'test:onboarding',ok:false,error:'FAIL onboarding flow: missing the `Hermes` runtime\nmore'},{command:'test',ok:true,error:'ignored'}]}});
assert.deepEqual(withError.errors,{'test:onboarding':"FAIL onboarding flow: missing the 'Hermes' runtime"},'a release machine\'s first error line per failed gate, without backticks');
assert.equal(withError.signature,'test:onboarding','the error line never changes the signature');
// The whole failing block, when the machine sends one, goes into the Issue fenced and capped.
const block=['AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:','+ actual - expected','','+ 3','- 4','    at file:///w/scripts/x-check.ts:12:8','```',...Array.from({length:80},(_,i)=>'line '+i)].join('\n');
const withDetails=outcome({job:'failure',results:{results:[{command:'test:ui',ok:false,error:'AssertionError',details:block}]}});
const shown=withDetails.details['test:ui'].split('\n');
assert.equal(shown.length,61,'60 lines and the cut mark');assert.equal(shown.at(-1),'…');assert.ok(!withDetails.details['test:ui'].includes('```'),'no fence breaks out');
assert.equal(withDetails.signature,'test:ui','details never change the signature');
const detailed=issueBody({stage:'alpha',platform:'mac',failing:['test:ui'],signature:'test:ui',sha:'abc',runURL:'r',errors:withDetails.errors,details:withDetails.details});
assert.match(detailed,/<details open><summary>test:ui<\/summary>\n\n```text\nAssertionError \[ERR_ASSERTION\][\s\S]*\+ actual - expected[\s\S]*x-check\.ts:12:8[\s\S]*\n```\n<\/details>/);
assert.ok(!/<details/.test(issueBody({stage:'alpha',platform:'mac',failing:['test:ui'],signature:'test:ui',sha:'abc',runURL:'r'})),'no section without details');
assert.match(issueBody({stage:'alpha',platform:'mac',...withError,sha:'abc',runURL:'r'}),/- `npm run test:onboarding`: FAIL onboarding flow: missing the 'Hermes' runtime\n/);

// A machine may run a platform's gate in parts; the report joins one platform's parts and leaves the other's.
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
const fail={stage:'alpha',platform:'mac',state:'fail',failing:['test:ui'],signature:'test:ui',sha:'abc',runURL:'https://example.com/run/1'};

// A new failure opens one Issue, labelled for the cloud fixers, naming the gate and the run.
let g=github();
assert.equal(report({...fail,gh:g.gh}).created,'https://github.com/example/worldlet/issues/9');
const create=g.calls.find(c=>c[0]==='issue'&&c[1]==='create');
assert(create.includes(LABEL)&&create.includes('platform:mac')&&create.includes('stage:alpha'));
assert.match(create[create.indexOf('--title')+1],/^\[Alpha\]\[mac\] test:ui failing$/);
assert(create.at(-1).includes('npm run test:ui')&&create.at(-1).includes('https://example.com/run/1'));

// The same failure again comments on that Issue; another stage's, platform's or signature's Issue is left alone.
const body=issueBody({...fail});
g=github([{number:3,body},{number:4,body:issueBody({...fail,platform:'windows'})},{number:5,body:issueBody({...fail,stage:'beta'})}]);
assert.deepEqual(report({...fail,gh:g.gh}),{commented:3});
assert(!g.calls.some(c=>c[0]==='issue'&&c[1]==='create'));
g=github([{number:3,body}]);
assert(report({...fail,failing:['check'],signature:'check',gh:g.gh}).created,'a different failure is a new Issue');

// A pass closes only that stage and platform's Issues.
g=github([{number:3,body},{number:4,body:issueBody({...fail,platform:'windows'})},{number:5,body:issueBody({...fail,stage:'beta'})}]);
assert.deepEqual(report({stage:'alpha',platform:'mac',state:'pass',sha:'def',runURL:'u',gh:g.gh}),{closed:[3]});
assert.throws(()=>report({stage:'rc',platform:'mac',state:'pass',gh:g.gh}),/stage/);

// The Dev tests in CI report the names of their failed jobs.
assert.deepEqual(outcome({job:'failure',failed:['Static checks','Fast checks']}),{state:'fail',failing:['Fast checks','Static checks'],signature:'Fast checks,Static checks'});
assert.match(issueBody({stage:'dev',platform:'linux',failing:['Static checks'],signature:'Static checks',sha:'abc',runURL:'u'}),/The Dev tests on linux failed at abc\.\n\nFailing:\n- Static checks\n/);

// The Dev tests: release.yml runs the pull request checks (architecture.yml) on every push to main and reports a failure as an Issue; no RC workflow (owner decision 2026-10-09); the pull request
// UI checks are among them since 2026-10-10. The release machines publish a Dev build only after they pass
// (`ci-release.mjs dev-tests` logic, devTests); nothing here publishes to Dev.
const release=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
assert.match(release,/\n  checks:\n    name: Dev tests\n[^]*?uses: \.\/\.github\/workflows\/architecture\.yml\n/);
assert(!/--channel dev\b/.test(release),'nothing in the workflow publishes to Dev');
assert.match(release,/ci-failure-report\.mjs --stage dev --platform linux/);
assert(!existsSync(new URL('../.github/workflows/rc.yml',import.meta.url)),'no RC workflow');
const architecture=readFileSync(new URL('../.github/workflows/architecture.yml',import.meta.url),'utf8');
assert.match(architecture,/\n  workflow_call:\n/);
assert(!/test:ui(?!:pr)/.test(architecture.split('\njobs:\n')[1]),'the Dev tests run the pull request UI checks, not the whole UI suite');
console.log('ci-failure-report checks passed');
