// The test:ui runner (scripts/test-ui.mjs, #986): its check lists, the concurrency setting, the
// bounded pool, timing-sensitive checks running alone, and that a failing child fails the suite with
// its output readable, end to end through real child processes.
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {coreChecks,parallelChecks,serialChecks,testUiConcurrency,npmCli,checkStep,runStep,testUi,onlyChecks,onlyArgument,quickChecks} from './test-ui.mjs';
import {withTempDir} from './test-temp.ts';

const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.equal(pkg.scripts['test:ui'],'node scripts/test-ui.mjs','npm run test:ui stays the single entry point');
const all=[...parallelChecks,...serialChecks];
assert(coreChecks.length&&coreChecks.every(c=>all.includes(c)),'the core checks are a subset of the test:ui checks');
assert.equal(new Set(all).size,all.length,'each check is listed once, in one group');
for(const file of all)assert(/^(?:scripts\/[\w-]+-check\.(?:ts|py)|gatehouse\/[\w-]+-check\.mjs)$/.test(file)&&existsSync(new URL('../'+file,import.meta.url)),'listed check exists: '+file);
assert.equal(testUiConcurrency('','darwin'),4);assert.equal(testUiConcurrency('','linux'),4);assert.equal(testUiConcurrency('2','darwin'),2);
// Windows release host 01 runs three at a time by default (#1099); an explicit value still wins.
assert.equal(testUiConcurrency('','win32'),3);assert.equal(testUiConcurrency('2','win32'),2);
for(const bad of ['0','-1','1.5','four'])assert.throws(()=>testUiConcurrency(bad),/WORLDLET_TEST_UI_CONCURRENCY/);
assert.deepEqual(checkStep('scripts/x-check.py'),{name:'scripts/x-check.py',bin:'python3',args:['scripts/x-check.py']},'Python runs as python3');
assert.deepEqual(checkStep('scripts/x-check.ts'),{name:'scripts/x-check.ts',bin:process.execPath,args:['scripts/x-check.ts']},'node runs as this node, without a shell');
assert.equal(npmCli({npm_execpath:'/n/npm-cli.js'},f=>f==='/n/npm-cli.js'),'/n/npm-cli.js');assert.equal(npmCli({},()=>false),null);
// --only: just the named checks, each kept in its group (the RC recheck and repair sessions); unknown names fail.
assert.deepEqual(onlyChecks(`${serialChecks[0]}, ${parallelChecks[1]},${parallelChecks[1]}`),{parallel:[parallelChecks[1]],serial:[serialChecks[0]]});
assert.deepEqual(onlyChecks(parallelChecks[0].replace(/\//g,'\\')).parallel,[parallelChecks[0]],'Windows separators match');
assert.throws(()=>onlyChecks('scripts/no-such-check.ts'),/test:ui has no check scripts\/no-such-check\.ts/);assert.throws(()=>onlyChecks(' , '),/names no check/);
assert.equal(onlyArgument(['node','t','--only','a,b'],{}),'a,b');assert.equal(onlyArgument(['node','t','--only=a'],{}),'a');
assert.equal(onlyArgument(['node','t'],{WORLDLET_TEST_UI_ONLY:'c'}),'c');assert.equal(onlyArgument(['node','t'],{}),null);
// The quick set the RC runs between release slots: listed checks, each once, the whole suite still the release's.
assert.equal(pkg.scripts['test:ui:quick'],'node scripts/test-ui.mjs --quick');
assert(quickChecks.length>=20&&quickChecks.length<all.length/3&&new Set(quickChecks).size===quickChecks.length,'a short list, each once');
assert.deepEqual([...onlyChecks(quickChecks.join(',')).parallel,...onlyChecks(quickChecks.join(',')).serial].sort(),[...quickChecks].sort(),'every quick check is a test:ui check');
for(const c of ['scripts/world-scene-check.ts','scripts/startup-setup-check.ts','gatehouse/board-browser-check.mjs','scripts/library-applet-check.ts'].filter(c=>existsSync(new URL('../'+c,import.meta.url))))assert(quickChecks.includes(c),c+' (the checks RCs failed on 2026-10-06)');
const lines=[],log=line=>lines.push(line);
assert.equal(await testUi({cli:null,log}),1,'without npm the suite fails instead of skipping the build');

// Scheduling, with steps that only take time: the pool never exceeds its limit, the build runs
// first and alone, and each serial check runs after the pool has drained, with nothing beside it.
const events=[];let busy=0,peak=0;
const fake=failing=>async step=>{events.push('start '+step.name);peak=Math.max(peak,++busy);await new Promise(r=>setTimeout(r,5));busy--;events.push('end '+step.name);
 const ok=!failing.includes(step.name);return {name:step.name,ok,seconds:.01,output:ok?'quiet pass':`fixture output\nAssertionError: ${step.name} broke`};};
const parallel=['p1','p2','p3','p4','p5','p6','p7'],serial=['s1','s2'];
lines.length=0;assert.equal(await testUi({parallel,serial,limit:3,cli:'npm-cli.js',run:fake([]),log}),0);
assert.equal(peak,3,'three at a time');assert.deepEqual(events.slice(0,2),['start build:native-ui','end build:native-ui']);
const drained=Math.max(...parallel.map(n=>events.indexOf('end '+n)));
for(const n of serial){const i=events.indexOf('start '+n);assert(i>drained,n+' waits for the pool');assert.equal(events[i+1],'end '+n,n+' runs alone');}
assert.deepEqual(lines.filter(l=>/^PASS /.test(l)).map(l=>l.split(/\s+/).at(-1)).sort(),['build:native-ui',...parallel,...serial].sort(),'one line per step');
assert.match(lines.at(-1),/9 of 9 checks passed/);assert(!lines.some(l=>l.includes('quiet pass')),'passing output stays quiet');
// A failing check fails the suite; the summary names it and its whole output follows.
lines.length=0;events.length=0;assert.equal(await testUi({parallel,serial,limit:4,cli:'npm-cli.js',run:fake(['p2','s1']),log,inline:false}),1);
assert(lines.some(l=>/^FAIL .* p2$/.test(l)));const summary=lines.findIndex(l=>/7 of 9 checks passed.*Failed: p2, s1/.test(l));
const output=lines.findIndex(l=>l.includes('AssertionError: p2 broke'));assert(summary>0&&output>summary,'failed output follows the summary');
assert.match(lines[output],/===== p2 failed after 0\.0s\. Its output: =====\nfixture output\nAssertionError: p2 broke/);assert.equal(lines.at(-1),'\ntest:ui failed: p2, s1');
// On GitHub Actions the output also follows the FAIL line at once, folded, in case the RC's time limit stops the suite.
lines.length=0;assert.equal(await testUi({parallel,serial,cli:'npm-cli.js',run:fake(['p2']),log,inline:true}),1);
const failLine=lines.findIndex(l=>/^FAIL .* p2$/.test(l));
assert.equal(lines[failLine+1],'::group::p2 output\nfixture output\nAssertionError: p2 broke\n::endgroup::');
assert(!lines.some(l=>l.startsWith('::group::p1')),'passing checks print nothing more');
// A failed build runs no check.
lines.length=0;events.length=0;assert.equal(await testUi({parallel,serial,cli:'npm-cli.js',run:fake(['build:native-ui']),log}),1);
assert.deepEqual(events,['start build:native-ui','end build:native-ui']);assert.match(lines.find(l=>l.includes('checks passed')),/0 of 9 checks passed.*no check ran without the build/);

// Real child processes through the default runner: exit codes, both output streams and a missing
// executable (spawned without a shell, as on the release hosts).
await withTempDir('worldlet-test-ui-',async dir=>{
 const file=(name,body)=>{const p=path.join(dir,name);writeFileSync(p,body);return p;};
 const cli=file('npm-cli.js','if(process.argv.slice(2).join(" ")!=="run build:native-ui")process.exit(9);');
 const pass=file('pass-check.mjs','console.log("PASS fixture");'),fail=file('fail-check.mjs','console.log("before the failure");console.error("AssertionError: fixture broke");process.exit(7);');
 lines.length=0;assert.equal(await testUi({parallel:[pass,fail],serial:[pass],cli,log}),1,'a real failing child fails the suite');
 assert(lines.some(l=>l.startsWith('PASS')&&l.endsWith('build:native-ui')),'the build runs as npm run build:native-ui');
 // Two pipes: both streams are kept, in the order they arrive.
 const failed=lines.find(l=>l.includes(fail+' failed'));assert(failed.includes('before the failure')&&failed.includes('AssertionError: fixture broke'),failed);
 assert.equal(lines.filter(l=>/^PASS /.test(l)&&l.endsWith(pass)).length,2);
 const missing=await runStep({name:'missing',bin:path.join(dir,'no-such-program'),args:[]});
 assert.equal(missing.ok,false,'a check that cannot start fails');assert.match(missing.output,/ENOENT/);
 // A hung check fails on its own after its limit, with what it printed so far.
 const hang=file('hang-check.mjs','console.log("waiting forever");setInterval(()=>{},1000);');
 const hung=await runStep({name:'hang',bin:process.execPath,args:[hang]},{timeoutMs:1500});
 assert.equal(hung.ok,false,'a hung check fails');assert.match(hung.output,/waiting forever[\s\S]*No result after 2 s: stopped/);assert(hung.seconds<10,'and stops at its limit');
});
console.log('PASS test:ui runner: complete lists, --only selects named checks, bounded concurrency, serial checks alone, failures fail with readable output, real child processes.');
