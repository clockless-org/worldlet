// Open Worldlet at login (#1229) without touching the system: the truthful status, the one-time offer
// (after onboarding, never during setup or the first task, never again after either answer), the
// `login` guide, and the quiet start. The packaged round trip is scripts/release-login-item-mac.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LOGIN_ITEM_ARG,loginItemOfferDue,loginItemOn,loginItemStatus,loginItemText,openedAtLogin,releaseLaunch} from '../core/distribution/index.ts';

// Status: only packaged Mac and Windows builds register; the Mac reads SMAppService back.
const release=(platform:string,settings:object|null)=>loginItemStatus({channel:'release',platform,settings});
assert.equal(loginItemStatus({channel:'dev',platform:'darwin',settings:{openAtLogin:true,status:'enabled'}}),'unsupported','A Dev build never reports a login item');
assert.equal(release('linux',{openAtLogin:true}),'unsupported');
assert.equal(release('darwin',null),'unsupported','Unreadable settings are not reported as off');
assert.equal(release('darwin',{openAtLogin:true,status:'enabled'}),'enabled');
assert.equal(release('darwin',{openAtLogin:true,status:'requires-approval'}),'requires-approval');
assert.equal(release('darwin',{openAtLogin:false,status:'not-registered'}),'disabled');
assert.equal(release('darwin',{openAtLogin:false,status:'not-found'}),'disabled');
assert.equal(release('win32',{openAtLogin:true,executableWillLaunchAtLogin:true}),'enabled');
assert.equal(release('win32',{openAtLogin:true,executableWillLaunchAtLogin:false}),'requires-approval','Turned off in Startup apps needs the person');
assert.equal(release('win32',{openAtLogin:false}),'disabled');
assert.deepEqual(['enabled','requires-approval','disabled','unsupported'].map(s=>loginItemOn(s as any)),[true,true,false,false]);
assert.match(loginItemText('requires-approval','darwin'),/System Settings → General → Login Items/);
assert.match(loginItemText('requires-approval','win32'),/Settings → Apps → Startup/);
assert.match(loginItemText('unsupported','darwin'),/only in the installed Worldlet app/);
assert.match(loginItemText('enabled','darwin'),/quietly/);

// The offer: once, after onboarding; never during setup, the tour or the first task.
const due=(onboarding:object|undefined,status='disabled',offered=false)=>loginItemOfferDue({status:status as any,offered,onboarding});
assert.equal(due({completed:true,journeyStage:'finish'}),true);
assert.equal(due({completed:true}),true,'Someone who finished onboarding before the journey existed');
assert.equal(due({completed:false}),false,'Never during setup');
assert.equal(due(undefined),false);
for(const stage of ['world-tour','first-value','first-value-review','first-value-running','first-value-outcome'])assert.equal(due({completed:true,journeyStage:stage}),false,stage);
assert.equal(due({completed:true,journeyStage:'finish'},'disabled',true),false,'Never again after either answer');
for(const status of ['enabled','requires-approval','unsupported'])assert.equal(due({completed:true,journeyStage:'finish'},status),false,status);

// Quiet start: the Mac knows from wasOpenedAtLogin, Windows from the Run entry's argument.
assert.equal(openedAtLogin({platform:'darwin',argv:[],wasOpenedAtLogin:true}),true);
assert.equal(openedAtLogin({platform:'darwin',argv:[LOGIN_ITEM_ARG]}),false);
assert.equal(openedAtLogin({platform:'win32',argv:['Worldlet.exe',LOGIN_ITEM_ARG]}),true);
assert.equal(openedAtLogin({platform:'win32',argv:['Worldlet.exe'],wasOpenedAtLogin:true}),false);
assert.equal(openedAtLogin({platform:'linux',argv:[LOGIN_ITEM_ARG],wasOpenedAtLogin:true}),false);
// A Windows login-item launch is the released app: it reports and updates; any other switch is a check.
assert.equal(releaseLaunch(['Worldlet.exe']),true);
assert.equal(releaseLaunch(['Worldlet.exe',LOGIN_ITEM_ARG]),true);
assert.equal(releaseLaunch(['Worldlet.exe','--window-capture','x']),false);
assert.equal(releaseLaunch(['Worldlet.exe',LOGIN_ITEM_ARG,'--check']),false);

// A just-enough DOM and clock for the offer and the guide.
let now=0;const ticks:(()=>void)[]=[];
const realNow=Date.now;Date.now=()=>now;
const realInterval=globalThis.setInterval;(globalThis as any).setInterval=(fn:()=>void)=>{ticks.push(fn);return ticks.length;};
(globalThis as any).clearInterval=()=>{};
(globalThis as any).window=new EventTarget();
(globalThis as any).document={createElement:()=>({type:'',textContent:'',disabled:false,onclick:null as any})};
class Root extends EventTarget {dataset:Record<string,string>={};}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const advance=async(ms:number)=>{now+=ms;for(const tick of ticks)tick();await settle();await settle();};
function fixture(login:{status:string,offered:boolean,platform?:string}){
 const calls:any[]=[];
 const view:any={busy:false,current:'overview',guideSource:'',guide:null,setGuide(value:any){this.guide=value;this.guideSource=value?.source||'';},revealGuide(){}};
 const call=async(action:string,body:any={})=>{
  calls.push({action,...body});
  if(body.operation==='offered')login.offered=true;
  if(body.operation==='set')login.status=body.enabled?'requires-approval':'disabled';
  return {...login,platform:login.platform||'darwin'};
 };
 return {calls,view,call,root:new Root()};
}
const {mountLoginItemOffer}=await import('../ui/onboarding/login-item-offer.ts');
const offered=(view:any)=>view.guideSource==='login-item';
try{
 // During the journey nothing is asked; finishing it (the first win) waits for its moment.
 {
  const f=fixture({status:'disabled',offered:false});
  let state:any={onboarding:{completed:true,journeyStage:'first-value-outcome'}};
  const offer=mountLoginItemOffer({root:f.root,view:f.view,call:f.call,state});
  await advance(20000);
  assert.equal(f.calls.length,0,'No status read or offer during the first task');
  state={onboarding:{completed:true,journeyStage:'finish'}};offer.update(state);
  f.root.dispatchEvent(new Event('worldlet:first-win'));
  f.view.setGuide({source:'first-value',text:'**That’s your first win.**'});
  await advance(5000);
  assert.equal(offered(f.view),false,'The first win keeps its moment');
  await advance(6000);
  assert.equal(offered(f.view),true,'Worldlet turns it on after the first win, without asking');
  assert.deepEqual(f.calls.map(c=>c.operation),[undefined,'offered','set']);
  assert.equal(f.calls.at(-1).enabled,true);
  assert.match(f.view.guide.text,/needs your approval: allow Worldlet in System Settings → General → Login Items/,'Fox says truthfully what the system reports');
  assert.deepEqual(f.view.guide.actions.map((b:any)=>b.textContent),['Don\'t open at login'],'with a way to turn it off');
  await advance(60000);
  assert.equal(f.calls.length,3,'Done once');
  offer.destroy();
 }
 // Turning it off from that line is final and a later launch does not turn it on again.
 {
  const login={status:'disabled',offered:false};
  const f=fixture(login);
  const offer=mountLoginItemOffer({root:f.root,view:f.view,call:f.call,state:{onboarding:{completed:true,journeyStage:'finish'}}});
  await advance(1500);
  assert.equal(offered(f.view),false,'A later launch lets the world settle first');
  await advance(2000);
  assert.equal(offered(f.view),true,'A later launch turns it on once the world is settled');
  await f.view.guide.actions[0].onclick();
  assert.deepEqual(f.calls.map(c=>c.operation+':'+(c.enabled??'')),['undefined:','offered:','set:true','set:false']);
  assert.equal(f.view.guide,null);
  offer.destroy();
  const again=fixture(login);
  const next=mountLoginItemOffer({root:again.root,view:again.view,call:again.call,state:{onboarding:{completed:true,journeyStage:'finish'}}});
  await advance(10000);
  assert.equal(offered(again.view),false,'Never turned on again after the person turned it off');
  assert.deepEqual(again.calls.map(c=>c.operation),[undefined],'Only the status is read');
  next.destroy();
 }
 // Never over a place, a reply in progress, another guide, or when it is already on or unsupported.
 {
  const f=fixture({status:'disabled',offered:false});
  f.view.current='building-work';
  const offer=mountLoginItemOffer({root:f.root,view:f.view,call:f.call,state:{onboarding:{completed:true}}});
  await advance(5000);assert.equal(f.calls.length,0,'Not inside a place');
  f.view.current='overview';f.view.busy=true;await advance(1500);assert.equal(f.calls.length,0,'Not while Fox is busy');
  f.view.busy=false;f.view.guideSource='google-sign-in';await advance(1500);assert.equal(f.calls.length,0,'Not over another guide');
  f.view.guideSource='';await advance(1500);assert.equal(offered(f.view),true);
  offer.destroy();
  for(const status of ['enabled','requires-approval','unsupported']){
   const g=fixture({status,offered:false});
   const o=mountLoginItemOffer({root:g.root,view:g.view,call:g.call,state:{onboarding:{completed:true}}});
   await advance(10000);assert.equal(offered(g.view),false,status);o.destroy();
  }
 }

 // The `login` guide shows the system's status and turns it on and off.
 const {createFoxPreferences}=await import('../ui/companion/fox-preferences.ts');
 for(const [status,platform,pattern,label] of [
  ['requires-approval','darwin',/allow Worldlet in System Settings → General → Login Items/,'Don\'t open at login'],
  ['enabled','win32',/opens quietly in the background/,'Don\'t open at login'],
  ['disabled','darwin',/does not open when you log in/,'Open at login'],
  ['unsupported','darwin',/only in the installed Worldlet app/,null]] as const){
  const f=fixture({status,offered:false,platform});
  const preferences=createFoxPreferences({call:f.call,view:f.view,root:f.root,setup:()=>{},toggleSample:()=>{}});
  await preferences.show('login');
  assert.match(f.view.guide.text,pattern,status);
  assert.deepEqual(f.view.guide.actions.map((b:any)=>b.textContent),label?[label]:[],status);
  if(label){await f.view.guide.actions[0].onclick();assert.deepEqual(f.calls.filter(c=>c.operation==='set').map(c=>c.enabled),[status==='disabled']);}
 }
}finally{Date.now=realNow;globalThis.setInterval=realInterval;}

// Wiring that needs Electron: the guide is reachable, the policy knows the answer, the window starts quietly.
const read=(file:string)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
assert.match(read('core/tools/controls.ts'),/'data','login'\]/,'Fox can open the login guide');
assert.match(read('platform/electron/src/modules/fox/index.ts'),/'data','login'\]/,'The host accepts the login guide');
assert.match(read('contracts/world-event-policy.json'),/"loginItem:offered"/);
assert.match(read('platform/electron/src/world/window.ts'),/quiet[\s\S]*showInactive\(\)[\s\S]*minimize\(\)/,'A login launch never takes focus');
assert.match(read('platform/electron/src/modules/shell/login-item.ts'),/channel==='release'/,'Only the packaged app registers');
assert.match(read('ui/index.ts'),/if\(!sample\)\{if\(!loginItemOffer\)loginItemOffer=mountLoginItemOffer/,'The practice world never offers');
console.log('PASS open at login: status mapping, one-time offer, login guide, quiet start');
