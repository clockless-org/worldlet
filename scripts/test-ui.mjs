// `npm run test:ui`, the World/Applet/Fox UI fixture suite (#986). It builds the native UI once,
// runs the independent checks a few at a time, then the timing-sensitive ones alone. Each check
// prints one line as it ends; every failed check's full output follows the summary, and any
// failure fails the suite. WORLDLET_TEST_UI_CONCURRENCY sets the pool (default 4, 3 on Windows; 1 is serial).
// `--only a,b` (or WORLDLET_TEST_UI_ONLY=a,b) runs just those checks, in their own groups: the RC's recheck of a failed
// run's checks and a repair session's reproduction (owner request 2026-10-06, failed RCs fixed in place, fast).
// No shell on any host: node runs as process.execPath (npm through its own CLI, since Windows
// cannot spawn npm.cmd without one) and Python as `python3`, as scripts/pr-checks.mjs does.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
// The open-source export (scripts/oss-export.mjs) leaves out the hosted services, so their browser checks (gatehouse/)
// are listed only where they exist.
const available=files=>existsSync(path.join(root,'gatehouse'))?files:files.filter(file=>existsSync(path.join(root,file)));
// Independent of one another: each builds its fixtures in memory, drives its own headless browser
// (no OS window, focus or user defaults) over dist/WorldletWeb read-only or an ephemeral port, and
// writes only a private temp directory or screenshot names no other check uses. The Python checks
// keep their state in a private temp HERMES_HOME or CLAUDE_CONFIG_DIR. Longest first, so the pool's
// lanes finish together.
export const parallelChecks=available([
 // The slowest first (Mac RC 2026.1005.2887 times), so no lane is left running one alone at the end. The Attention Center's browser checks moved here from npm test (test:attention), where they ran one by one.
 'scripts/attention-no-refill-check.ts','scripts/attention-actions-check.ts',
 'scripts/applet-focus-check.ts','gatehouse/board-browser-check.mjs','scripts/startup-setup-check.ts','scripts/world-tour-check.ts',
 'scripts/attention-idle-check.ts','scripts/world-log-check.ts','scripts/world-energy-ui-check.ts','scripts/world-history-ui-check.ts','scripts/startup-check.ts','scripts/curated-source-applet-check.ts','scripts/browser-fox-glow-check.ts','scripts/demo-walkthrough-check.ts','scripts/applet-top-bar-check.ts','scripts/text-reader-hud-check.ts',
 'scripts/world-readability-check.ts','scripts/feature-audit-check.ts','scripts/ongoing-ui-check.ts','scripts/phone-pairing-ui-check.ts','scripts/desktop-companion-ui-check.ts','scripts/fox-mac-controls-check.ts','scripts/sample-world-check.ts','scripts/widgets-ui-check.ts',
 'scripts/order-ui-check.ts','scripts/companion-entry-check.ts','scripts/attention-group-identity-check.ts','scripts/fox-name-tag-check.ts',
 // Entering and leaving an Applet zooms, and Back from an area's Applet returns to its panel (owner Order 2026-10-07).
 'scripts/world-level-zoom-check.ts',
 // Long checks from suites no net ran (test:applets, test:browser, test:world, test:render, test:companion, test:demo).
 'scripts/browser-automation-check.ts','scripts/browser-focus-check.ts',
 'scripts/immersive-background-check.ts','scripts/immersive-fallback-check.ts',
 'scripts/library-applet-check.ts','scripts/applet-motion-check.ts','scripts/money-applet-check.ts',
 'scripts/world-asset-source-check.ts',
 'scripts/applet-resume-check.ts','scripts/applet-task-pip-check.ts',
 'scripts/fox-reader-controls-check.ts',
 'scripts/fox-chat-fold-check.ts','scripts/fox-browse-ui-check.ts','scripts/fox-artifact-size-check.ts','scripts/artifacts-ui-check.ts','scripts/daily-plan-ui-check.ts',
 'scripts/applet-stage-check.ts','scripts/calendar-events-ui-check.ts','scripts/calendar-attention-ui-check.ts','scripts/fox-tap-greeting-check.ts','scripts/work-applet-check.ts',
 'scripts/world-refresh-check.ts','scripts/world-scene-check.ts','scripts/feedback-ui-check.ts',
 'scripts/applet-preview-check.ts','scripts/world-audio-check.ts','scripts/local-music-check.ts',
 'scripts/browser-history-check.ts','scripts/browser-tabs-ui-check.ts','scripts/browser-sign-in-check.ts','scripts/voice-memos-check.ts','scripts/messages-check.ts','scripts/attention-later-check.ts','scripts/applet-first-entry-check.ts',
 'scripts/demo-site-check.ts','scripts/mail-open-check.ts','scripts/weather-location-check.ts',
 'scripts/mail-focus-check.ts','scripts/retired-mail-tour-check.ts','scripts/core-applet-content-check.ts',
 'scripts/mock-google-check.py','scripts/sample-persona-check.ts','scripts/work-signal-check.py',
 'scripts/attention-level-check.ts','scripts/attention-brief-markdown-check.ts','scripts/village-camera-check.ts','scripts/fox-visible-text-check.ts',
 'scripts/village-lighting-check.ts','scripts/native-actions-check.ts','scripts/unread-mail-check.py','scripts/game-hud-check.ts',
 // They guard fixes for problems people hit in owner meetings (2026-09-24 to 10-03) and had sat in
 // opt-in suites no RC ran: two-page setup and each app's purpose, Google consent and its unverified-app help, the
 // first task Fox does, and Fox's one conversation across Applets.
 'scripts/google-connection-check.ts','scripts/onboarding-first-value-check.ts',
 'scripts/onboarding-first-value-rows-check.ts','scripts/companion-main-session-check.ts',
 // Fox and its companion controls (test:fox:ui, test:companion), which no RC ran: the Rive Fox and its
 // looks, the painted fallback, the portrait's schedule, entry, drag, panel, persona and tool routing.
 'scripts/companion-transfer-ui-check.ts','scripts/fox-execution-check.ts',
 'scripts/companion-life-check.ts','scripts/companion-knowledge-ui-check.ts','scripts/companion-persona-ui-check.ts',
 'scripts/fox-animation-schedule-check.ts','scripts/fox-applet-navigation-check.ts','scripts/fox-rive-check.ts',
 'scripts/fox-reply-action-check.ts','scripts/fox-painted-check.ts','scripts/fox-painted-render-check.ts',
 'scripts/companion-look-check.ts','scripts/fox-activity-routing-check.ts','scripts/fox-timing-panel-check.ts',
 'scripts/fox-audio-capability-check.ts','scripts/fox-pose-transition-check.ts','scripts/fox-frame-timing-check.ts',
 'scripts/fox-painted-head-check.ts','scripts/fox-state-catalog-check.ts',
 // The rest of those suites, then their fixture checks without a browser, which take about a second each.
 'scripts/landmark-night-check.ts','scripts/onboarding-first-value-world-check.ts','scripts/content-scroll-check.ts','scripts/weather-applet-check.ts',
 'scripts/night-interaction-check.ts','scripts/external-agent-ui-check.ts','scripts/hud-panels-check.ts','scripts/hud-material-check.ts',
 'scripts/speech-focus-check.ts','scripts/fox-talk-ui-check.ts','scripts/world-filter-area-check.ts','scripts/quiet-source-ui-check.ts',
 'scripts/snapshot-refresh-check.ts','scripts/empty-area-drop-check.ts','scripts/desktop-companion-root-check.ts',
 'scripts/windows-update-ui-check.ts','scripts/home-readers-check.ts','scripts/local-deletion-check.ts','scripts/agent-ui-boundary-check.ts',
 'scripts/applet-stage-idle-check.ts','scripts/ui-material-check.ts','scripts/activity-browser-check.ts','scripts/web-record-check.ts','scripts/saved-logins-check.ts','scripts/browser-applet-check.ts','scripts/page-focus-ui-check.ts',
 'scripts/windows-folder-ui-check.ts','scripts/windows-notion-ui-check.ts','scripts/onboarding-reservation-check.ts','scripts/home-review-check.ts',
 'scripts/windows-backup-ui-check.ts','scripts/attention-time-ui-check.ts','scripts/artifact-fit-check.ts','scripts/windows-companion-transfer-ui-check.ts',
 'scripts/world-projection-worker-check.ts','scripts/world-tool-runtime-check.ts','scripts/world-gateway-check.ts','scripts/codex-stream-check.ts',
 'scripts/recorded-speech-lifecycle-check.ts','scripts/home-actions-check.ts','scripts/streaming-speech-lifecycle-check.ts','scripts/world-plate-registration-check.ts',
 'scripts/obsidian-vault-check.ts','scripts/popular-applets-check.ts','scripts/celestial-art-check.ts','scripts/quiet-source-read-check.ts',
 'scripts/content-store-incremental-check.ts','scripts/world-palette-check.ts','scripts/model-worker-check.ts','scripts/source-analysis-check.ts',
 'scripts/memory-edits-check.ts','scripts/applet-pipeline-check.ts','scripts/browser-outcome-check.ts',
 'scripts/slot-placement-check.ts','scripts/todoist-write-check.ts','scripts/world-layout-check.ts','scripts/browser-receipt-check.ts',
 'scripts/mail-review-recovery-check.ts','scripts/navigation-history-check.ts','scripts/google-oauth-windows-check.ts','scripts/agent-browser-policy-check.ts',
 'scripts/applet-scale-check.ts','scripts/applet-lamp-check.ts','scripts/snapshot-inbox-check.ts','scripts/task-review-ui-check.ts','scripts/attention-task-review-check.ts',
 'scripts/website-matching-check.ts','scripts/tennis-demo-check.ts',
 // Browser checks no net ran until check-reach looked past scripts/*-check.{ts,mjs,py} (2026-10-04).
 'scripts/dev-build-ui-check.ts',
]);
// Alone, after the pool: they judge rendering against the wall clock, and the pool's browsers
// competing for CPU and GPU could make them miss a frame or a deadline.
export const serialChecks=available([
 'scripts/world-idle-frames-check.ts', // the World's redraw rate against the frames the browser offers
 // Fake microphones: run beside each other on the Mac release host, two of them failed with NotReadableError
 // "Could not start audio source" after four minutes (Mac RC 2026.1004.2792); alone they pass.
 'scripts/microphone-choice-check.ts', // chosen device on streaming, recorded and media-surface capture
 'scripts/meetings-check.ts','scripts/meeting-transcript-check.ts', // live transcripts from a real WebRTC call's audio
 // A playing video's picture-in-picture offer: beside the pool it missed its 15-second wait for the window in two Mac
 // RCs in a row (2026.1005.2909 and 2911); alone it passes.
 'scripts/applet-pip-check.ts','scripts/applet-carry-check.ts',
]);
// No longer in the RC (owner request 2026-10-05: an RC finishes within 20 minutes, without checks of how things look
// or move): exact hover and motion pixels, weather animation timing, the painted Fox's blink, frame times while an
// Applet opens and the World's work motion took over 2.5 minutes alone, and the Applet lamp and sun and moon renders
// were pictures. Their files are deleted; applet-lamp-check and celestial-art-check keep the rules without a browser.
// The core checks (`npm run test:ui:core`), a quick local run before touching the World. PR CI ran them on Linux
// from 2026-10-03 (about half of a day's RC fixes were feature PRs breaking checks only the RC ran) until the owner
// limited PR CI to the basic Linux checks on 2026-10-04; the RC runs them with the rest of test:ui: the World, the sample world and the Applet
// catalogue, which UI changes broke most. Each ran headless on software WebGL in under three minutes
// alone; the longer ones (world-tour, applet-focus), those that timed out beside others on software WebGL
// (applet-first-entry) and the wall-clock-timed serial checks stay in the RC.
export const coreChecks=[
 'scripts/sample-world-check.ts','scripts/world-scene-check.ts','scripts/feature-audit-check.ts',
 'scripts/sample-persona-check.ts','scripts/core-applet-content-check.ts',
 'scripts/web-record-check.ts','scripts/attention-brief-markdown-check.ts',
 // Meetings: the Open sheet, and live transcripts heard from a real WebRTC call.
 'scripts/meetings-check.ts','scripts/meeting-transcript-check.ts',
];
// The quick set (`npm run test:ui:quick`, owner decision 2026-10-06: "rc只查大问题，Release查小问题"): an RC between release
// slots runs only these, the big things a broken build shows at once: the World starts and draws, setup and the tour, the
// Applets most changes break (today's RC failures), Fox's chat, Attention, Mail, the Browser, Meetings and the admin board.
// The RC in the two hours before each release slot runs the whole suite, and a release ships only a commit that passed
// it (scripts/machine-candidate.mjs rcMode, scripts/release-verified.mjs).
export const quickChecks=available([
 'scripts/startup-check.ts','scripts/startup-setup-check.ts','scripts/world-scene-check.ts','scripts/sample-world-check.ts',
 'scripts/world-tour-check.ts','scripts/feature-audit-check.ts','scripts/core-applet-content-check.ts','scripts/applet-focus-check.ts',
 'scripts/applet-first-entry-check.ts','scripts/library-applet-check.ts','scripts/work-applet-check.ts','scripts/immersive-background-check.ts',
 'gatehouse/board-browser-check.mjs','scripts/attention-actions-check.ts','scripts/attention-no-refill-check.ts','scripts/attention-brief-markdown-check.ts',
 'scripts/fox-chat-fold-check.ts','scripts/fox-execution-check.ts','scripts/companion-entry-check.ts','scripts/onboarding-first-value-check.ts',
 'scripts/google-connection-check.ts','scripts/mail-open-check.ts','scripts/browser-applet-check.ts','scripts/world-history-ui-check.ts',
 'scripts/artifacts-ui-check.ts','scripts/order-ui-check.ts','scripts/sample-persona-check.ts','scripts/web-record-check.ts',
 'scripts/phone-pairing-ui-check.ts','scripts/meetings-check.ts',
]);
// Windows release host 01 is slower: four browsers at once pushed world startup past a check's
// 15-30 s waits (fox-mac-controls, voice-memos). Two at a time took 12.5 minutes on 01, most of a
// Windows RC; the owner asked for three (2026-10-01, #1099).
export function testUiConcurrency(value=process.env.WORLDLET_TEST_UI_CONCURRENCY,platform=process.platform){
 if(value===undefined||value==='')return platform==='win32'?3:4;
 const n=Number(value);
 if(!Number.isInteger(n)||n<1)throw Error('WORLDLET_TEST_UI_CONCURRENCY must be a whole number of at least 1, not '+JSON.stringify(value));
 return n;
}
// npm's CLI for this node: npm sets npm_execpath for `npm run`; otherwise it sits beside node.
export function npmCli(env=process.env,exists=existsSync){
 const dir=path.dirname(process.execPath);
 return [env.npm_execpath,path.join(dir,'node_modules/npm/bin/npm-cli.js'),path.join(dir,'../lib/node_modules/npm/bin/npm-cli.js')]
  .find(file=>file&&/npm-cli\.js$/.test(file)&&exists(file))||null;
}
// The named checks out of the lists, each in its own group; a name the lists do not have is an error, never a pass.
export function onlyChecks(names,{parallel=parallelChecks,serial=serialChecks}={}){
 const want=[...new Set(String(names||'').split(',').map(n=>n.trim().replace(/\\/g,'/')).filter(Boolean))];
 const unknown=want.filter(n=>!parallel.includes(n)&&!serial.includes(n));
 if(!want.length||unknown.length)throw Error(want.length?'test:ui has no check '+unknown.join(', '):'--only names no check');
 return {parallel:parallel.filter(c=>want.includes(c)),serial:serial.filter(c=>want.includes(c))};
}
export function onlyArgument(argv=process.argv,env=process.env){
 const i=argv.indexOf('--only');
 return i>=0?argv[i+1]||'':argv.find(a=>a.startsWith('--only='))?.slice(7)??(env.WORLDLET_TEST_UI_ONLY||null);
}
// One share of the checks, WORLDLET_TEST_UI_SHARD="i/n" (the CI RC runs test:ui on several runners at once): every
// n-th check of the parallel and the serial lists, starting at the i-th, so the shares are about equal.
export function shardChecks({parallel,serial},value=process.env.WORLDLET_TEST_UI_SHARD){
 if(!value)return {parallel,serial};
 const [i,n]=String(value).split('/').map(Number);
 if(!Number.isInteger(i)||!Number.isInteger(n)||i<1||i>n)throw Error('WORLDLET_TEST_UI_SHARD must be i/n with 1 ≤ i ≤ n, not '+JSON.stringify(value));
 const all=[...parallel,...serial],mine=new Set(all.filter((_,k)=>k%n===i-1));
 return {parallel:parallel.filter(c=>mine.has(c)),serial:serial.filter(c=>mine.has(c))};
}
export const checkStep=file=>({name:file,bin:file.endsWith('.py')?'python3':process.execPath,args:[file]});
const running=new Set();
// A check that has not finished after this long fails on its own, so a hung check is named instead of eating
// the gate's 30 minutes (Mac RC 2026.1005.2844 on the stand-in: all 163 pool checks passed in about six
// minutes, then a serial check printed nothing until the gate's limit). The slowest check took 91 s there.
export const CHECK_TIMEOUT_MS=8*60000;
// One step, its stdout and stderr kept together in arrival order. A step that cannot start fails.
export function runStep({name,bin,args},{cwd=root,timeoutMs=CHECK_TIMEOUT_MS}={}){
 return new Promise(resolve=>{
  const started=Date.now();let output='',settled=false;
  const child=spawn(bin,args,{cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});
  const timer=setTimeout(()=>{end(false,`\nNo result after ${Math.round(timeoutMs/1000)} s: stopped (test-ui.mjs CHECK_TIMEOUT_MS)`);child.kill('SIGKILL');},timeoutMs);
  const end=(ok,note='')=>{if(settled)return;settled=true;clearTimeout(timer);running.delete(child);resolve({name,ok,seconds:(Date.now()-started)/1000,output:output+note});};
  running.add(child);
  for(const stream of [child.stdout,child.stderr])stream?.setEncoding('utf8').on('data',chunk=>{output+=chunk;});
  child.on('error',error=>end(false,'\n'+error.message));
  child.on('close',(code,signal)=>end(code===0,signal?'\nStopped by '+signal:''));
 });
}
// Up to `limit` steps at once, each starting as soon as a lane frees; results in list order.
export async function pool(steps,limit,run){
 const results=[];let next=0;
 const lane=async()=>{while(next<steps.length){const i=next++;results[i]=await run(steps[i]);}};
 await Promise.all(Array.from({length:Math.min(limit,steps.length)},lane));
 return results;
}
const duration=s=>s<60?s.toFixed(1)+'s':Math.floor(s/60)+'m '+String(Math.floor(s%60)).padStart(2,'0')+'s';
// On GitHub Actions a failed check's output also follows its FAIL line at once, folded: the RC's time limit can stop
// the suite before the summary prints it (Windows RC 2026-10-09: 40 failures, no output).
export async function testUi({parallel=parallelChecks,serial=serialChecks,limit=testUiConcurrency(),cli=npmCli(),run=runStep,log=console.log,inline=process.env.GITHUB_ACTIONS==='true'}={}){
 const started=Date.now(),total=parallel.length+serial.length;
 const report=r=>{log(`${r.ok?'PASS':'FAIL'} ${duration(r.seconds).padStart(7)}  ${r.name}`);if(!r.ok&&inline)log(`::group::${r.name} output\n${r.output.trimEnd()}\n::endgroup::`);return r;};
 log(`test:ui: build:native-ui, then ${parallel.length} checks ${limit} at a time and ${serial.length} alone`);
 if(!cli){log('FAIL build:native-ui: npm-cli.js not found beside '+process.execPath+'; run npm run test:ui');return 1;}
 const build=report(await run({name:'build:native-ui',bin:process.execPath,args:[cli,'run','build:native-ui']}));
 const results=build.ok?[...await pool(parallel.map(checkStep),limit,step=>run(step).then(report)),
  // Serial checks say when they start, so a log cut short still names the one that was running.
  ...await pool(serial.map(checkStep),1,step=>{log('START   '+step.name);return run(step).then(report);})]:[];
 const failed=[build,...results].filter(r=>!r.ok),names=failed.map(r=>r.name).join(', ');
 log(`\ntest:ui: ${results.filter(r=>r.ok).length} of ${total} checks passed in ${duration((Date.now()-started)/1000)}`+
  (build.ok?'':' (no check ran without the build)')+(failed.length?'. Failed: '+names:''));
 for(const r of failed)log(`\n===== ${r.name} failed after ${duration(r.seconds)}. Its output: =====\n${r.output.trimEnd()}`);
 // The gate files the last lines of this log in its fix Issue: end with every failed name.
 if(failed.length)log(`\ntest:ui failed: ${names}`);
 return failed.length?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 // A stopped gate (its timeout, Ctrl-C) stops the running checks too, not only this process.
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const child of running)child.kill();process.exit(1);});
 const only=onlyArgument();
 process.exitCode=await testUi(shardChecks(process.argv.includes('--core')?{parallel:coreChecks,serial:[]}:only!==null?onlyChecks(only):process.argv.includes('--quick')?onlyChecks(quickChecks.join(',')):{parallel:parallelChecks,serial:serialChecks}));
}
