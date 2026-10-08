// RC onboarding paths (#1492), without launching the app: when a packaged release accepts the harness's
// disposable library (platform/electron/src/rc-check.ts), that its fixture OpenClaw is a local Agent setup
// can choose, how a phase's launch is judged, and how leftover processes are found (scripts/onboarding-paths.ts).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {locateLocalHarnesses} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {readLocalAgentMemory} from '../platform/electron/src/modules/agent-runtime/local-memory.ts';
import {rcCheckRoot,RC_CHECK_MARKER,RELEASE_CHECKS} from '../platform/electron/src/rc-check.ts';
import {holders,parseArgs,phaseOutcome,PHASES,BLOCKING} from './onboarding-paths.ts';
import {launchEnvironment,writeOpenClawFixture} from './setup-fixtures.ts';

const tmp=fs.realpathSync(os.tmpdir()),library=fs.mkdtempSync(path.join(tmp,'worldlet-rc-')),token='ab'.repeat(32);
try{
 // The fixture local Agent: found first and set up, with memory to bring (so setup asks Start fresh),
 // in a home of its own while the person's OpenClaw settings are left out.
 const fixture=writeOpenClawFixture(path.join(library,'agents')),agentHome=path.join(library,'home');fs.mkdirSync(agentHome);
 const launched=launchEnvironment({PATH:'/usr/bin',HOME:agentHome,OPENCLAW_STATE_DIR:'/Users/a/.openclaw',OPENCLAW_PROFILE:'work',WORLDLET_DEV:'1'},fixture,{});
 const openclaw=locateLocalHarnesses({platform:process.platform,env:launched,home:agentHome,systemDirectories:[]}).find(item=>item.id==='openclaw');
 assert.ok(openclaw?.configured,'setup finds the fixture OpenClaw, set up');
 if(process.platform!=='win32')assert.ok(openclaw.command.startsWith(fixture.bin),'the fixture command, ahead of any OpenClaw on this computer');
 assert.equal(launched.OPENCLAW_STATE_DIR,fixture.env.OPENCLAW_STATE_DIR);assert.equal(launched.OPENCLAW_PROFILE,undefined);assert.equal(launched.WORLDLET_DEV,undefined);
 assert.equal(readLocalAgentMemory('openclaw',agentHome,launched)?.name,'Juniper');

 fs.writeFileSync(path.join(library,RC_CHECK_MARKER),token+'\n');
 const argv=['Worldlet','--check','onboarding-paths'],env={WORLDLET_RC_PROFILE_ROOT:library,WORLDLET_RC_CHECK_TOKEN:token};
 assert.deepEqual(RELEASE_CHECKS,['onboarding-paths'],'a release build runs only the onboarding paths check');
 assert.equal(rcCheckRoot(argv,env,tmp),library,'the harness library with its token');
 assert.equal(rcCheckRoot(['Worldlet'],env,tmp),undefined,'a launch without the check opens the person’s own library');
 assert.equal(rcCheckRoot(['Worldlet','--check','onboarding-flow'],env,tmp),undefined,'only a release check');
 assert.equal(rcCheckRoot(['Worldlet','--window-capture','/tmp/w.png'],env,tmp),library,'the release smoke capture on a stand-in host');
 assert.equal(rcCheckRoot(['Worldlet','--window-capture','/tmp/w.png'],{...env,WORLDLET_RC_CHECK_TOKEN:'cd'.repeat(32)},tmp),undefined,'a capture needs the token too');
 assert.equal(rcCheckRoot(argv,{...env,WORLDLET_RC_CHECK_TOKEN:'cd'.repeat(32)},tmp),undefined,'the wrong token');
 assert.equal(rcCheckRoot(argv,{...env,WORLDLET_RC_CHECK_TOKEN:'short'},tmp),undefined,'a malformed token');
 assert.equal(rcCheckRoot(argv,{WORLDLET_RC_CHECK_TOKEN:token},tmp),undefined,'no library named');
 assert.equal(rcCheckRoot(argv,env,path.join(tmp,'elsewhere')),undefined,'only directly in the temporary folder');
 const home=path.join(os.homedir(),'Library/Application Support/Worldlet');
 assert.equal(rcCheckRoot(argv,{...env,WORLDLET_RC_PROFILE_ROOT:home},tmp),undefined,'never the real library');
 const other=fs.mkdtempSync(path.join(tmp,'worldlet-other-'));
 try{fs.writeFileSync(path.join(other,RC_CHECK_MARKER),token);assert.equal(rcCheckRoot(argv,{...env,WORLDLET_RC_PROFILE_ROOT:other},tmp),undefined,'only a worldlet-rc-* folder');}
 finally{fs.rmSync(other,{recursive:true,force:true});}
 fs.rmSync(path.join(library,RC_CHECK_MARKER));
 assert.equal(rcCheckRoot(argv,env,tmp),undefined,'no marker, no release check');

 // Launcher arguments: nothing (development build) or the package and its evidence folder.
 assert.deepEqual(parseArgs([]),{});
 assert.deepEqual(parseArgs(['--app','/Volumes/W/Worldlet.app/','--out','out']),{app:path.resolve('/Volumes/W/Worldlet.app'),out:path.resolve('out')});
 assert.throws(()=>parseArgs(['--app','/Volumes/W/Worldlet.app']),/Usage/);
 assert.throws(()=>parseArgs(['--app','/tmp/Worldlet','--out','o']),/Worldlet\.app/);
 assert.deepEqual(PHASES.map(p=>p.phase),['choose','resume','after-reset']);
 assert.equal(BLOCKING,true,'a failed onboarding path fails the RC');

 // A phase passes only with its own PASS line and a clean exit (Quit Completely ran).
 assert.deepEqual(phaseOutcome('choose',0,'  1.0s  x\nPASS onboarding paths choose: chose codex; Quit Completely\n',false),{ok:true,reason:null});
 assert.deepEqual(phaseOutcome('choose',0,'SKIP onboarding paths: no local Agent is installed\n',false),{ok:false,reason:'choose: SKIP onboarding paths: no local Agent is installed'},'a SKIP tested nothing: it fails');
 assert.match(phaseOutcome('resume',1,'FAIL onboarding-paths: opening Mail did not start Google sign-in (no google_connect_started)\n',false).reason!,/^resume: opening Mail did not start Google sign-in/);
 assert.match(phaseOutcome('resume',0,'PASS onboarding paths choose: x\n',false).reason!,/without its PASS line/,'another phase’s line does not count');
 assert.match(phaseOutcome('after-reset',null,'',true).reason!,/timed out/);
 assert.match(phaseOutcome('choose',137,'PASS onboarding paths choose: x\n',false).reason!,/exited 137/,'a crash after the PASS line fails');

 // Leftovers: processes whose command line names the library, never this process.
 const table=`  101 /Applications/Worldlet.app/Contents/Frameworks/Worldlet Helper (GPU).app/x --user-data-dir=${library}/Browser/Electron\n  102 /usr/bin/other\n  ${process.pid} node scripts/onboarding-paths.ts ${library}\n`;
 assert.deepEqual(holders(library,{platform:'darwin',run:(()=>table) as any}),[101]);
 let script='';
 assert.deepEqual(holders(library,{platform:'win32',run:((_bin:string,args:string[])=>{script=args.at(-1)!;return '4242\r\n\r\n';}) as any}),[4242]);
 assert.match(script,/Win32_Process/);assert.ok(script.includes(`'${library}'`),'the library path, quoted for PowerShell');
 assert.ok(script.includes('$_.ProcessId -ne $PID'),'the query never counts its own PowerShell, whose command line names the library');
 assert.deepEqual(holders(library,{platform:'darwin',run:(()=>{throw Error('ps missing');}) as any}),[],'an unreadable process table finds nothing');
}finally{fs.rmSync(library,{recursive:true,force:true});}
console.log('PASS onboarding paths: a release build opens the RC library only with the check, a worldlet-rc-* folder in the temporary folder and its token; the fixture OpenClaw is a local Agent to choose; phases need their own PASS line and a clean Quit Completely; leftover processes are found by the library path');
