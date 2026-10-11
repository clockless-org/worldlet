// npm run test:ios: the iPhone app on the Mac release gate (owner decision 2026-10-03: pull requests only
// compile it; the RC runs its tests for every PR merged since the last RC at once). WorldletKit's tests
// (`swift test`), then the XCUITest UI tests (ios/UITests) on an iPhone Simulator: an XcodeGen project,
// one build, `xcodebuild test`. They tap through pairing, Attention, an item's card, Later, Fox and Settings
// on -demo data, so no network, account or signing is needed.
// A Mac without Xcode reports SKIP and passes, as test:agent:local does without Codex; a missing XcodeGen
// is installed with Homebrew (a host fix done in code, #1391). Build output stays in .local/ios-build,
// the test results in .local/ios-build/UITests.xcresult and the full log in .local/ios-build/test.log.
import {spawnSync} from 'node:child_process';
import {closeSync,mkdirSync,openSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const ios=path.join(root,'ios'),out=path.join(root,'.local/ios-build');
const fail=text=>{console.error('FAIL iOS: '+text);process.exit(1);};
// With `log`, the output goes straight into that file as it comes, so a run the release gate's time budget kills
// still leaves the log of how far it got (Alpha 4244 left none, #321).
const run=(bin,args,{cwd=ios,minutes=20,log}={})=>{
 const fd=log?openSync(log,'w'):undefined;
 const r=spawnSync(bin,args,{cwd,encoding:'utf8',timeout:minutes*60_000,maxBuffer:256*1024*1024,stdio:['ignore',fd??'pipe',fd??'pipe']});
 if(fd!==undefined)closeSync(fd);
 return {ok:r.status===0&&!r.error,out:log?readFileSync(log,'utf8'):(r.stdout||'')+(r.stderr||''),error:r.error};
};

// Every Applet in the built-in style has its device in the app's asset catalog (scripts/ios-applet-icons.mjs).
const icons=run(process.execPath,[path.join(root,'scripts/ios-applet-icons.mjs'),'--check'],{cwd:root,minutes:1});
if(!icons.ok)fail(icons.out.trim());
console.log(icons.out.trim());
if(process.platform!=='darwin'){console.log('SKIP iOS: the iPhone app builds only on a Mac');process.exit(0);}
const xcode=run('xcodebuild',['-version'],{minutes:1});
if(!xcode.ok){console.log('SKIP iOS: Xcode is not installed on this Mac (xcodebuild -version failed); install Xcode from the App Store to run the iPhone tests');process.exit(0);}
console.log(xcode.out.trim().split('\n')[0]);

if(!run('xcodegen',['--version'],{minutes:1}).ok){
 console.log('XcodeGen is missing; installing it with Homebrew');
 if(!run('brew',['install','xcodegen'],{minutes:15}).ok)fail('XcodeGen is not installed and `brew install xcodegen` failed');
}

rmSync(out,{recursive:true,force:true});mkdirSync(out,{recursive:true});
const kit=run('swift',['test'],{minutes:20});
writeFileSync(path.join(out,'swift-test.log'),kit.out);
if(!kit.ok)fail('WorldletKit tests failed (swift test):\n'+kit.out.split('\n').filter(l=>/error|failed/i.test(l)).slice(0,40).join('\n'));
console.log('PASS WorldletKit tests');

const generated=run('xcodegen',['generate'],{minutes:5});
if(!generated.ok)fail('xcodegen generate failed:\n'+generated.out.slice(-2000));

// The first available iPhone Simulator; booted here when it is not already running, and shut down after.
const listed=run('xcrun',['simctl','list','devices','available','-j'],{minutes:2});
let device;
try{device=Object.entries(JSON.parse(listed.out).devices).filter(([runtime])=>/iOS/.test(runtime)).flatMap(([,list])=>list).find(d=>/^iPhone/.test(d.name));}catch{}
if(!device)fail('no available iPhone Simulator (xcrun simctl list devices available); add one in Xcode › Settings › Platforms');
const booted=device.state==='Booted';
if(!booted){run('xcrun',['simctl','boot',device.udid],{minutes:5});run('xcrun',['simctl','bootstatus',device.udid,'-b'],{minutes:10});}
console.log(`Simulator: ${device.name} (${device.udid})`);
try{
 const test=run('xcodebuild',['-project','Worldlet.xcodeproj','-scheme','Worldlet','-configuration','Debug','-destination',`platform=iOS Simulator,id=${device.udid}`,
  '-derivedDataPath',path.join(out,'derived'),'-resultBundlePath',path.join(out,'UITests.xcresult'),
  // A UI test that hangs fails on its own after three minutes and names itself, instead of holding the whole run.
  // Not sooner: testApplets walks the Applets tab, an Applet's page and its website and takes 73 s on a GitHub macOS
  // runner; past a one-minute allowance it failed although it passed, and the hang report it left took minutes more.
  '-test-timeouts-enabled','YES','-default-test-execution-time-allowance','180','-maximum-test-execution-time-allowance','180',
  'CODE_SIGNING_ALLOWED=NO','test'],{minutes:40,log:path.join(out,'test.log')});
 const cases=test.out.split('\n').filter(l=>/^Test Case .* (passed|failed)/.test(l));
 for(const line of cases)console.log('  '+line.replace(/^Test Case '-\[\S+ (\w+)\]' /,'$1 '));
 if(!test.ok)fail(`the iPhone build or UI tests failed (log ${path.relative(root,path.join(out,'test.log'))}):\n`+test.out.split('\n').filter(l=>/error:|failed/.test(l)).slice(0,60).join('\n'));
 if(!cases.length)fail('xcodebuild reported no UI test cases');
 console.log(`PASS iOS: ${cases.length} UI tests on ${device.name}`);
}finally{if(!booted)run('xcrun',['simctl','shutdown',device.udid],{minutes:2});}
