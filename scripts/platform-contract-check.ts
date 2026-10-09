import './source-snapshot-check.ts';
import {readCompanionProfile} from '../contracts/companion.ts';
import {appletSupport} from '../core/applets/applet-support.ts';
import assert from 'node:assert/strict';
import {resolveHost} from '../platform/bridge/host.ts';
import {hostFeatures,googleSignInStart} from '../platform/bridge/features.ts';
import {GOOGLE_SIGN_IN_EVENT,googleSignInStage} from '../contracts/platform.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {sourceContextRows} from '../core/context/source-context.ts';
import {googleAuthorizationUrl} from '../core/agent/auth-handoff.ts';
const requests:any[]=[];
const mac=resolveHost({webkit:{messageHandlers:{worldlet:{postMessage:async r=>{requests.push(r);return {ok:true};}}}}});
const win=resolveHost({worldletHost:{version:1,platform:'windows',request:async r=>{requests.push(r);return {ok:true};}}});
for(const host of [mac,win]){
 assert.deepEqual(await host.request({action:'agentChat',text:'Hello'}),{ok:true});
 assert.equal(requests.at(-1).action,'agentChat');
}
assert.equal(resolveHost({}),undefined);
assert.throws(()=>resolveHost({worldletHost:{version:2},webkit:{messageHandlers:{worldlet:{}}}}),/Unsupported/,'explicit incompatible host never falls back');
// The one Electron host also serves Linux; it was refused here, so the Linux World never opened.
assert.equal(resolveHost({worldletHost:{version:1,platform:'linux',request:async()=>({ok:true})}})?.platform,'linux');
assert.throws(()=>resolveHost({worldletHost:{version:1,platform:'freebsd',request:async()=>({})}}),/Unsupported/);
assert.equal(hostFeatures({platform:'windows'}).deferredBackupRestore,true);
assert.equal(hostFeatures({platform:'macos'}).deferredBackupRestore,false);
assert.equal(hostFeatures({platform:'windows'}).nativeAppletLaunch,false);
assert.equal(hostFeatures({platform:'macos'}).nativeAppletLaunch,true);
assert.equal(hostFeatures({platform:'macos'}).nativeCalendar,true);
const scheduledWindows=hostFeatures({platform:'windows',hostCapabilities:{version:1,features:{backgroundSourceChecks:true,nativeCalendar:false}}});
assert.equal(scheduledWindows.backgroundSourceChecks,true);
assert.equal(scheduledWindows.nativeCalendar,false,'background checks do not imply EventKit Calendar permissions');
const supplied={version:1,features:{backgroundSourceChecks:false,folderManagement:true}};
for(const platform of ['macos','windows']){
 assert.equal(hostFeatures({platform,hostCapabilities:supplied}).folderManagement,true);
 assert.equal(hostFeatures({platform,hostCapabilities:supplied}).backgroundSourceChecks,false);
 assert.equal(hostFeatures({platform,hostCapabilities:supplied}).deferredBackupRestore,false,'omitted capabilities fail closed');
 assert.equal(hostFeatures({platform,hostCapabilities:supplied}).nativeAppletLaunch,false);
}
assert.throws(()=>hostFeatures({hostCapabilities:{version:2}}),/Unsupported/);
const source={id:'one',title:'Original',enabled:true,revision:'new'};
const finding={sourceId:'one',sourceRevision:'new',summary:'Summary',facts:[{text:'Fact'}],intent:'Suggestion'};
const state={sources:[source],knowledge:[finding,{...finding,sourceRevision:'old'},{...finding,sourceId:'missing'}]};
const original=JSON.stringify(state),rows=sourceContextRows(state);
assert.equal(rows.length,1);assert.equal(rows[0].title,'Original');assert.equal(JSON.parse(rows[0].structured).intent.reason,'Inferred from sources by the model; not confirmed');
assert.equal(JSON.stringify(state),original,'shared projection never mutates native data');
assert.deepEqual(sourceContextRows({...state,sources:[{...source,enabled:false}]}),[]);
console.log('PASS Mac/Windows transport contract, capability overrides, version rejection and shared evidence projection');

// Google sign-in stages: a reporting host says `browser` only once consent opens (a reused grant opens
// none), so setup starts neutral; an older host never says it and keeps the browser steps from the start.
for(const platform of ['macos','windows']){
 assert.equal(hostFeatures({platform}).googleSignInStages,false,'legacy hosts report no sign-in stages');
 assert.equal(googleSignInStart({platform}),'browser');
 assert.equal(googleSignInStart({platform,hostCapabilities:{version:1,features:{googleSignInStages:true}}}),'connecting');
 assert.equal(googleSignInStart({platform,hostCapabilities:{version:1,features:{}}}),'browser','an omitted stage capability keeps the browser steps');
}
assert.deepEqual(['browser','preparing','verifying','connecting','',undefined,{}].map(googleSignInStage),['browser','preparing','verifying',undefined,undefined,undefined,undefined]);
// `browser` may carry the consent address; only Google's own authorization page is ever offered.
const consent='https://accounts.google.com/o/oauth2/auth?client_id=fixture&scope=openid';
assert.equal(googleSignInStage({stage:'browser',url:consent}),'browser');
assert.deepEqual([consent,'http://accounts.google.com/o/oauth2/auth','https://accounts.google.com.evil.test/o/oauth2/auth','https://evil.test/o/oauth2/auth',consent+'&a='+'a'.repeat(8192),{}].map(googleAuthorizationUrl),[consent,undefined,undefined,undefined,undefined,undefined]);
{
 const source=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
 assert.match(source('platform/electron/src/capabilities.ts'),/\bgoogleSignInStages:true\b/,'the Electron host declares sign-in stages');
 const connections=source('platform/electron/src/modules/sources/connections.ts');
 assert.ok(/onStage:\(stage,url\)=>host\.page\.event\('([^']+)',url\?\{stage,url\}:stage\)/.exec(connections)?.[1]===GOOGLE_SIGN_IN_EVENT,'the Electron host relays sign-in stages to the World page');
 assert.match(source('platform/electron/src/host/page.ts'),/new CustomEvent\(/,'page events carry their detail');
 // The host emits only stages the page understands, and `browser` among them.
 const emitted=[...source('platform/electron/src/modules/sources/google-source.ts').matchAll(/onStage\('(\w+)'[,)]/g)].map(match=>match[1]);
 assert.ok(emitted.includes('browser')&&emitted.every(stage=>googleSignInStage(stage)),'unknown host sign-in stage: '+emitted);
 assert.match(source('platform/electron/src/modules/sources/google-source.ts'),/onStage\('browser',handoff\.url\)/,'the browser stage carries the consent address the host validated and opened');
}
console.log('PASS Google sign-in stages: the Electron host declares and relays them, neutral until consent opens, legacy hosts keep the browser steps');

for(const provider of ['apple-notes','apple-reminders','voice-memos']){
 assert.equal(appletSupport(provider,hostFeatures({platform:'windows'})).supported,false);
 assert.equal(appletSupport(provider,hostFeatures({platform:'macos'})).supported,true);
 assert.equal(appletSupport(provider,hostFeatures({platform:'macos',hostCapabilities:{version:1,features:{}}})).supported,false);
}
assert.equal(appletSupport('apple-notes',hostFeatures({platform:'windows',hostCapabilities:{version:1,features:{appleNotes:true}}})).supported,true,'declared capability overrides OS');
assert.equal(appletSupport('gmail',hostFeatures({platform:'windows'})).supported,true,'system requirements do not restrict web services');

{
 const profile={name:'Fox',createdAt:'2026-09-24T00:00:00Z',personality:'Helpful',attentionFocus:'auto'};
 assert.deepEqual(readCompanionProfile(profile),profile);
 assert.throws(()=>readCompanionProfile({...profile,personality:null}),/personality/);
}

assert.deepEqual(readCompanionProfile({name:'Fox'}),{name:'Fox',createdAt:'',personality:'',attentionFocus:'auto'},'older host metadata has explicit unknown defaults');
assert.throws(()=>readCompanionProfile({createdAt:''}),/name/);

// Execute the exact EventKit read helper with a fake EventKit whose request completion never runs,
// as on macOS 14+ under osascript: the decision must come from the re-read TCC status (#1205).
const appleSource=readFileSync('platform/electron/src/modules/sources/apple.ts','utf8').replace(/\r\n/g,'\n');
const eventKitRead=['PRELUDE','READ'].map(name=>appleSource.match(new RegExp(`const ${name}=(?:PRELUDE\\+)?String\\.raw\`\\n([\\s\\S]*?)\\n\`;`))![1]).join('\n');
const readWith=(statuses:number[],authorize=true)=>{
 let clock=0,polls=0,requests=0;
 const status=()=>statuses[Math.min(polls,statuses.length-1)];
 const store={requestFullAccessToRemindersWithCompletion:()=>{requests++;},predicateForRemindersInCalendars:()=>({}),fetchRemindersMatchingPredicateCompletion:(_:unknown,done:(v:unknown)=>void)=>done({count:0})};
 const $:any=Object.assign((x:unknown)=>x,{NSFileHandle:{fileHandleWithStandardInput:{readDataToEndOfFile:JSON.stringify({provider:'apple-reminders',authorize})}},NSString:{alloc:{initWithDataEncoding:(x:unknown)=>x}},NSUTF8StringEncoding:4,
  EKEventStore:{alloc:{init:store},authorizationStatusForEntityType:()=>status()},NSCalendar:{currentCalendar:{}},
  NSDate:{dateWithTimeIntervalSinceNow:(s:number)=>s},NSRunLoop:{currentRunLoop:{runUntilDate:(s:number)=>{clock+=s*1000;polls++;}}}});
 const value=JSON.parse(vm.runInNewContext(eventKitRead,{ObjC:{import:()=>{},unwrap:(x:unknown)=>x},$,Date:{now:()=>clock}}));
 return {value,requests,seconds:clock/1000};
};
assert.deepEqual(readWith([0,0,0,3]).value,{records:[]},'Allow: full access read back after the prompt continues to the read');
assert.deepEqual(readWith([0,0,2]).value,{status:'denied'},'Don\'t Allow: denied read back after the prompt');
const unanswered=readWith([0]);
assert.deepEqual(unanswered.value,{status:'unavailable'},'an unanswered prompt is unavailable, not denied');
assert(unanswered.seconds>=40&&unanswered.seconds<45,'the prompt wait ends before the 45 s helper timeout');
assert.deepEqual(readWith([4]).value,{status:'denied'},'a declined full-access upgrade from write-only is denied');
const refused=readWith([2]);
assert.deepEqual([refused.value,refused.requests,refused.seconds],[{status:'denied'},0,0],'a previous denial answers at once without a request');
const quiet=readWith([0],false);
assert.deepEqual([quiet.value,quiet.requests],[{status:'unavailable'},0],'reads without Connect never request access');

