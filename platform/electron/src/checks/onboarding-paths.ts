import path from 'node:path';
import {dialog,Menu,shell,type BaseWindow,type MenuItem,type WebContents,type WebContentsView} from 'electron';
import {AGENT,ANALYTICS,DESKTOP_COMPANION,type AgentService,type AnalyticsService,type DesktopCompanionService} from '../host/services.ts';
import {readSelection} from '../modules/agent-runtime/local-harness.ts';
import {readAdopted} from '../modules/agent-runtime/local-memory.ts';
import type {CheckContext} from './index.ts';
import {setTimeout as sleep} from 'node:timers/promises';

// RC onboarding paths (#1492): the first-run paths besides the mock-Google journey (onboarding-flow.ts),
// on a development build (npm run test:onboarding:paths) and on the signed package (scripts/onboarding-paths.ts
// --app, from the RC package smoke). A release build has no mock Google and no Codex model source, so every
// path here enters through a local Agent, as the 10-03 demo did. One launch per phase, all on one disposable
// library; each phase ends with Quit Completely and the launcher proves nothing was left running:
// - choose: the setup page → a local Agent → Build your world → the same page bringing it in → Enter your world on; close the window there, mid-onboarding,
//   which quits the app instead of leaving Fox on the desktop (owner request 2026-10-04; ADVISORY until it
//   has passed on the Mac and Windows hosts, falling back to Quit Completely).
// - resume: the relaunch opens with the Agent brought in → Enter your world → the tour's Mail step → Google sign-in
//   starts (google_connect_started, never google_connect_failed) → Cancel → Reset Fox → the setup page.
//   Before Reset: Not now, the tour's first half ends and, with nothing connected, Fox waits on nothing: the tour
//   closes with the phone step (owner request 2026-10-06), which turning the Tutorial switch off ends, and then opening Mail from the World starts Google sign-in again
//   (the 10-03 meeting: a later click must offer to connect too); closing the World keeps Fox on the
//   desktop and Back to World restores it. Both are ADVISORY (a failure prints ADVISORY FAIL) until they
//   have passed on the Mac and Windows hosts, except the desktop Companion on the Mac, which always blocked.
// - after-reset: the relaunch after Reset Fox opens on the setup page's choices with no local Agent chosen.
// The launcher puts a fixture OpenClaw on this computer's path (scripts/setup-fixtures.ts), so there is
// always a local Agent to choose; finding none fails.
export const ONBOARDING_PATH_PHASES=['choose','resume','after-reset'] as const;
// Agents RC hosts have signed in first (test:agent:local uses Codex), then any other one found here.
const PREFERRED=['codex','claude-code','hermes','openclaw','pi'];
// New steps report ADVISORY FAIL until they have passed on the Mac and Windows hosts; then these turn on.
const MAIL_AGAIN_BLOCKING=false,COMPANION_ELSEWHERE_BLOCKING=false,CLOSE_QUITS_BLOCKING=false;
/** The local Agent setup chose, however it was kept: Fox's Harness, or an Agent adopted before there was none built in. */
const chosen=(root:string)=>readSelection(root)??readAdopted(root);

export async function onboardingPaths({host,window,view}:CheckContext){
 const {store,profile}=host;
 const disposable=profile.channel==='dev'?process.env.WORLDLET_PROFILE_ROOT:profile.rcCheck?store.root:undefined;
 if(!disposable||path.resolve(disposable)!==path.resolve(store.root))throw Error('needs a disposable library: start with scripts/onboarding-paths.ts (npm run test:onboarding:paths)');
 const phase=process.env.WORLDLET_ONBOARDING_PATHS_PHASE as typeof ONBOARDING_PATH_PHASES[number];
 if(!ONBOARDING_PATH_PHASES.includes(phase))throw Error(`WORLDLET_ONBOARDING_PATHS_PHASE must be one of ${ONBOARDING_PATH_PHASES.join(', ')}`);
 const started=Date.now();
 const mark=(step:string)=>console.log(`  ${((Date.now()-started)/1000).toFixed(1).padStart(5)}s  ${step}`);
 // Product events this launch (the page reports them through the host's usageEvent; a check launch never sends them).
 const events:string[]=[];
 const analytics=host.use<AnalyticsService>(ANALYTICS),record=analytics.recordProductEvent.bind(analytics);
 analytics.recordProductEvent=(event,duration,dimensions)=>{events.push(event);mark('event '+event);record(event,duration,dimensions);};
 // The check never opens the host's own browser: on the RC hosts each Google sign-in left an accounts.google.com tab
 // that Cancel never closed, and every run starts from and returns to a fresh host (Kelvin 2026-10-05). The
 // hand-off the person's browser would get is recorded instead.
 shell.openExternal=async(url:string)=>{let host='?';try{host=new URL(url).host;}catch{}mark(`the browser would open ${host} (not opened by the check)`);};
 const web=view.webContents;
 const js=(code:string)=>web.executeJavaScript(code,true);
 const seen=async()=>{try{return await js("JSON.stringify({fox:document.querySelector('#companionDialogue')?.innerText?.slice(0,300)??null,buttons:[...document.querySelectorAll('button')].filter(b=>b.checkVisibility()).map(b=>b.textContent.trim()).filter(Boolean).slice(0,24),tour:document.querySelector('#notionWorld')?.dataset.tourStep??null})");}catch{return 'unavailable';}};
 const wait=async(what:string,code:string,seconds:number)=>{
  for(let i=0;i<seconds*5;i++){if(await js(code).catch(()=>false)===true){mark(what);return;}await sleep(200);}
  throw Error(`Timed out after ${seconds}s waiting for: ${what}\n  screen: ${await seen()}\n  events: ${events.join(', ')||'none'}`);
 };
 // checkVisibility, not offsetParent: the tour's Tutorial switch is position:fixed, which has no offsetParent.
 const button=(label:string)=>`[...document.querySelectorAll('button')].find(b=>b.checkVisibility()&&b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;
 const press=async(label:string,seconds=30)=>{await wait(`button “${label}”`,`!!${button(label)}`,seconds);await js(`${button(label)}.click();true`);};
 const shown=(selector:string)=>`[...document.querySelectorAll(${JSON.stringify(selector)})].some(e=>e.checkVisibility())`;
 const signInPage=shown('.setup-choose'),appsPage=`!!${button('Enter your world')}`;
 const tourOn="!!document.querySelector('.tour-switch:not([hidden])')";
 // The Tutorial switch in the World's top-right corner, on while the tour runs, turned off ends the first run (owner Order 2026-10-07).
 const skipTutorial=async()=>{
  await wait('the Tutorial switch, on',`${shown('.tour-switch[aria-checked=true]')}`,30);
  await js("document.querySelector('.tour-switch').click();true");
  await wait('the tour skipped and the World free',"!document.querySelector('#notionWorld')?.dataset.tourStep&&document.querySelector('#notionWorld')?.dataset.tourSpotlight!=='true'&&document.querySelector('#notionWorld')?.dataset.tourLock!=='true'&&!document.querySelector('.tour-switch:not([hidden])')",30);
  for(let i=0;i<50&&store.state.onboarding?.journeyStage!=='finish';i++)await sleep(200);
  if(store.state.onboarding?.journeyStage!=='finish')throw Error('Turning the Tutorial switch off did not finish the journey: '+(store.state.onboarding?.journeyStage??'none'));
 };
 // Agent detection is done once the loading cards are gone and a tile is choosable or marked missing
 // (ui/onboarding/startup-setup.ts): while it runs, More options already lists every Agent as missing.
 const available="[...document.querySelectorAll(':is(.setup-agent-default,.setup-agent-button):not(.is-missing)')].filter(b=>!b.disabled).map(b=>b.dataset.agent)";
 const detected=`(!document.querySelector('.setup-agent-cards.is-loading')&&(${available}.length>0||!!document.querySelector('.setup-agent-button.is-missing')))`;
 const quitCompletely=async(what:string)=>{
  // The menu item a person picks (app menu, Dock and tray menus share app.quit()).
  const find=(items:MenuItem[]):MenuItem|undefined=>{for(const item of items){if(item.label==='Quit Completely')return item;const inner=item.submenu&&find(item.submenu.items);if(inner)return inner;}return undefined;};
  const quit=find(Menu.getApplicationMenu()?.items??[]);
  if(!quit)throw Error('the app menu has no Quit Completely');
  console.log(`PASS onboarding paths ${phase}: ${what} (${Math.round((Date.now()-started)/1000)}s); Quit Completely`);
  quit.click();
  // The app exits from here; the launcher checks the exit and that nothing was left running.
  await new Promise(()=>{});
 };

 if(phase==='choose'){
  if(store.state.onboarding?.completed===true||store.state.connections.length)throw Error('the library is not fresh: '+store.root);
  await wait('the setup page',signInPage,90);
  await wait('local Agent detection',detected,90);
  const found=await js(available) as string[];
  const choice=PREFERRED.find(id=>found.includes(id))??found[0];
  if(!choice)throw Error(`no local Agent to choose, not even the launcher’s fixture OpenClaw\n  screen: ${await seen()}`);
  // A local Agent found here is setup's default way in, picked for the person (owner requests 2026-10-04, 2026-10-06), with Google folded under More options (2026-10-09).
  if(await js("(()=>{const d=document.querySelector('.setup-agent-default');return !!d&&d.checkVisibility()&&!d.closest('.setup-more');})()")!==true)throw Error(`no default local Agent above More options\n  screen: ${await seen()}`);
  await js(`document.querySelector(':is(.setup-agent-default,.setup-agent-button)[data-agent=${JSON.stringify(choice)}]').click();true`);
  mark(`picked the local Agent ${choice}`);
  // The page's one big button, Build your world, brings the picked Agent (owner requests 2026-10-06, 2026-10-09): the host
  // proves it answers before Fox uses it, then the same page brings it in (its own files are only read); Enter your world turns on once it came over.
  await js("document.querySelector('.setup-next').click();true");
  await wait('the Agent moving in',shown('.setup-import'),300);
  await wait('the Agent brought in',appsPage,300);
  if(chosen(store.root)!==choice)throw Error(`Enter your world showed, but the library has ${chosen(store.root)??'no'} local Agent chosen, not ${choice}`);
  for(let i=0;i<25&&!events.includes('local_agent_selected');i++)await sleep(200);
  if(!events.includes('local_agent_selected'))throw Error('choosing the local Agent reported no local_agent_selected');
  await sleep(1000);
  // Before onboarding is over, closing the window quits (modules/shell/companion.ts); the launcher then
  // checks the exit and that nothing was left running, as after Quit Completely.
  console.log(`PASS onboarding paths ${phase}: chose ${choice} on the setup page and brought it in (${Math.round((Date.now()-started)/1000)}s); closing the window mid-onboarding`);
  window.close();
  await sleep(15000);
  const message=`closing the window during onboarding did not quit the app (Fox on the desktop: ${host.use<DesktopCompanionService>(DESKTOP_COMPANION).isDesktop})`;
  if(CLOSE_QUITS_BLOCKING)throw Error(message);
  console.log(`ADVISORY FAIL onboarding paths ${phase}, close quits during onboarding: ${message}`);
  await host.use<DesktopCompanionService>(DESKTOP_COMPANION).restoreWorld().catch(()=>{});
  await quitCompletely(`chose ${choice} on the setup page and brought it in; quitting mid-onboarding`);
 }

 if(phase==='resume'){
  const choice=chosen(store.root);
  if(!choice)throw Error('the relaunch has no local Agent chosen; the choose phase did not keep it');
  await wait('resumed with the Agent brought in',`${appsPage}||${signInPage}`,90);
  // Agent detection may still move the page on; give it time, then judge where setup resumed.
  await sleep(3000);
  if(await js(signInPage)===true||await js(appsPage)!==true)throw Error(`after quitting with the Agent brought in, the relaunch did not resume there\n  screen: ${await seen()}`);
  mark('the relaunch resumed with the Agent brought in');
  await press('Enter your world',120);
  await wait('world arrival',"!!document.querySelector('#notionWorld')?.sceneMetrics?.renderer",90);
  const step=(key:string,seconds=30)=>wait(`tour step ${key}`,`document.querySelector('#notionWorld')?.dataset.tourStep===${JSON.stringify(key)}`,seconds);
  await step('hello',90);await press('Continue');
  await step('fox');await press('Continue');
  await step('applets');
  // With a local Agent and no Google, the Applets step offers Connect Mail in Fox's bubble (ui/onboarding/world-tour.ts),
  // which starts Google's sign-in from the World without opening the Mail Applet (owner feedback 2026-10-06).
  await wait('Fox offers to sign in to Mail',"/isn’t connected yet/.test(document.querySelector('#companionDialogue')?.innerText||'')",15);
  const ring='.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide):not([hidden])';
  await wait('Mail in the spotlight',`document.querySelector('#notionWorld')?.dataset.tourSpotlight==='true'&&!!document.querySelector(${JSON.stringify(ring)})`,30);
  await press('Connect Mail');
  mark('Connect Mail');
  // The 10-03 demo: Mail after a local Agent failed Google sign-in at once (google_connect_failed).
  for(let i=0;i<150&&!events.includes('google_connect_started');i++)await sleep(200);
  if(!events.includes('google_connect_started'))throw Error(`Connect Mail did not start Google sign-in (no google_connect_started)\n  screen: ${await seen()}\n  events: ${events.join(', ')||'none'}`);
  for(let i=0;i<50&&!events.includes('google_connect_failed');i++)await sleep(200);
  if(events.includes('google_connect_failed'))throw Error(`Google sign-in failed right after it started (google_connect_failed)\n  screen: ${await seen()}`);
  mark('Google sign-in started and is waiting for the person');
  await press('Cancel',30);
  for(let i=0;i<150&&!events.some(event=>/^google_connect_(cancelled|failed|completed)$/.test(event));i++)await sleep(200);
  if(events.includes('google_connect_failed'))throw Error('cancelling Google sign-in reported google_connect_failed');
  mark('Cancel stopped the sign-in');
  // A failed advisory step leaves no sign-in waiting, so Reset Fox still runs as before.
  const advisory=async(what:string,blocking:boolean,run:()=>Promise<void>)=>{
   try{await run();}catch(error){
    if(blocking)throw error;console.log(`ADVISORY FAIL onboarding paths ${phase}, ${what}: ${String((error as Error)?.message||error)}`);
    await js(`${button('Cancel')}?.click();true`).catch(()=>false);
   }
  };
  await advisory('Mail from the World after the tour',MAIL_AGAIN_BLOCKING,async()=>{
   // Back in the World (its World button, if Mail is still in front), the tour asks again: Not now.
   for(let i=0;i<25&&await js(`!${button('Not now')}`).catch(()=>true);i++)await sleep(200);
   if(await js(`!${button('Not now')}`).catch(()=>true))await press('World');
   // Not now moves on (owner request 2026-10-06).
   await press('Not now');
   await step('attention');await press('Continue');
   // Nothing is connected, so first value waits on nothing: the tour closes with the phone step, or Fox offers a page
   // on what the person keeps talking about with the brought Agent (Show me). Turning the Tutorial switch off ends either and frees the World.
   await wait('the phone step, or a brought conversation',`document.querySelector('#notionWorld')?.dataset.tourStep==='phone'||!!${button('Show me')}`,60);
   await skipTutorial();
   const starts=()=>events.filter(event=>event==='google_connect_started').length,before=starts();
   // Mail's Applet in the World, where ui/onboarding/tour-spotlight.ts appletBox finds it.
   await clickAt(web,js,'Mail in the World',"(()=>{const r=document.querySelector('#notionWorld'),m=(r?.sceneMetrics?.modules||[]).find(m=>m.id==='app-gmail'&&m.visible!==false),b=m?.peekBounds,c=r?.querySelector('canvas[data-renderer=\"pixi-webgl\"]');if(!b||!c||!(b.width>0&&b.height>0))return null;const base=c.getBoundingClientRect(),sx=c.clientWidth?base.width/c.clientWidth:1,sy=c.clientHeight?base.height/c.clientHeight:1;return {x:base.left+b.x*sx,y:base.top+b.y*sy,width:b.width*sx,height:b.height*sy};})()");
   mark('opened Mail from the World');
   for(let i=0;i<150&&starts()===before;i++)await sleep(200);
   if(starts()===before)throw Error(`opening Mail from the World after the tour did not start Google sign-in again\n  screen: ${await seen()}\n  events: ${events.join(', ')}`);
   mark('Google sign-in started again');
   const ended=()=>events.slice(events.lastIndexOf('google_connect_started')).find(event=>/^google_connect_(cancelled|failed|completed)$/.test(event));
   await press('Cancel',30);
   for(let i=0;i<150&&!ended();i++)await sleep(200);
   if(ended()==='google_connect_failed')throw Error('Google sign-in from the World reported google_connect_failed');
   mark('Cancel stopped it again');
  });
  // The same code keeps Fox on the desktop on every OS (COMPANION.md), once onboarding is over; Windows
  // returns through the tray icon. During the tour closing quits, so the tour is skipped first.
  if(await js(tourOn)===true)await skipTutorial();
  await advisory('desktop Companion',process.platform==='darwin'||COMPANION_ELSEWHERE_BLOCKING,()=>desktopCompanion(host.use<DesktopCompanionService>(DESKTOP_COMPANION),window,view,mark));
  // Reset Fox from Settings, as a person does; the native confirmation answers Reset.
  const confirm=dialog.showMessageBox;
  dialog.showMessageBox=(async(...args:any[])=>{const options=args.find(arg=>arg&&typeof arg==='object'&&'message' in arg);if(options?.message!=='Reset Worldlet?')return (confirm as any)(...args);mark('confirmed Reset Worldlet?');return {response:0,checkboxChecked:false};}) as typeof dialog.showMessageBox;
  try{
   const clicked=await js("(()=>{const settings=document.getElementById('notionWorld')?.companionSettings;settings?.querySelector('[data-setting=reset]')?.click();const reset=settings?.querySelector('[data-action=reset]');if(!reset)return false;reset.click();return true;})()");
   if(clicked!==true)throw Error('Settings has no Reset button');
   await wait('Reset Fox returned to the setup page',signInPage,120);
  }finally{dialog.showMessageBox=confirm;}
  const agent=host.use<AgentService>(AGENT).id;
  if(chosen(store.root)||agent!=='none')throw Error(`Reset Fox left the local Agent chosen (${chosen(store.root)??'none'}, Fox's Agent ${agent})`);
  await wait('local Agent detection',detected,90);await sleep(3000);
  if(await js(appsPage)===true)throw Error('after Reset Fox, setup moved on to Enter your world');
  await quitCompletely('resumed with the Agent brought in, Mail started Google sign-in, Cancel, Reset Fox → setup page');
 }

 if(phase==='after-reset'){
  if(chosen(store.root))throw Error('the relaunch after Reset Fox still has a local Agent chosen: '+chosen(store.root));
  if(store.state.onboarding?.completed===true)throw Error('the relaunch after Reset Fox has onboarding completed');
  await wait('the setup page',signInPage,90);
  await wait('local Agent detection',detected,90);await sleep(3000);
  if(await js(signInPage)!==true||await js(appsPage)===true)throw Error(`the relaunch after Reset Fox did not stay on the setup page\n  screen: ${await seen()}`);
  await quitCompletely('the relaunch after Reset Fox opens on the setup page');
 }
}

/** A real mouse click at the middle of an element: the tour's spotlight acts only on clicks inside its box. */
async function clickAt(web:WebContents,js:(code:string)=>Promise<any>,what:string,box:string){
 // The spotlight follows the Applet as the World settles: click as soon as it has a box.
 let at:{x:number,y:number}|null=null;
 for(let i=0;i<50&&!at;i++){at=await js(`(()=>{const b=${box};return b&&b.width&&b.height?{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}:null;})()`);if(!at)await sleep(200);}
 if(!at)throw Error(`Nothing to click for ${what}`);
 web.sendInputEvent({type:'mouseMove',x:at.x,y:at.y});
 web.sendInputEvent({type:'mouseDown',x:at.x,y:at.y,button:'left',clickCount:1});
 web.sendInputEvent({type:'mouseUp',x:at.x,y:at.y,button:'left',clickCount:1});
}

/** Closing the World window keeps Fox on the desktop (the World view moves into the Companion's floating
 * window), and Back to World puts the same view back in the shown World window (modules/shell/companion.ts).
 * The one-time hint needs a finished onboarding, so the mock-Google journey checks it (onboarding-flow.ts). */
export async function desktopCompanion(companion:DesktopCompanionService,window:BaseWindow,view:WebContentsView,mark:(step:string)=>void,onDesktop?:()=>Promise<void>){
 window.close();
 for(let i=0;i<50&&!(companion.isDesktop&&!window.isVisible()&&companion.panelBounds());i++)await sleep(200);
 if(!companion.isDesktop||window.isVisible()||!companion.panelBounds())throw Error(`closing the World window did not leave Fox on the desktop (${JSON.stringify({desktop:companion.isDesktop,worldVisible:window.isVisible(),panel:companion.panelBounds()})})`);
 if(window.contentView.children.includes(view))throw Error('the World view stayed in the closed World window instead of moving to the Companion');
 mark('closing the World window left Fox on the desktop');
 await onDesktop?.();
 const frames=()=>view.webContents.executeJavaScript("document.querySelector('#notionWorld')?.sceneMetrics?.performance?.frames??null",false).catch(()=>null) as Promise<number|null>;
 const before=await frames();
 await companion.restoreWorld();
 for(let i=0;i<50&&!(window.isVisible()&&!companion.isDesktop);i++)await sleep(200);
 if(companion.isDesktop||!window.isVisible()||!window.contentView.children.includes(view))throw Error(`Back to World did not bring the World window back (${JSON.stringify({desktop:companion.isDesktop,worldVisible:window.isVisible()})})`);
 // The World stops drawing while Fox is on the desktop; back in its window it draws again (Mac Alpha 4132, #182: the
 // last picture showed the bare sky and labels without the World's art).
 if(typeof before==='number'){
  let after=await frames();
  for(let i=0;i<25&&!(typeof after==='number'&&after>=before+2);i++){await sleep(200);after=await frames();}
  if(!(typeof after==='number'&&after>=before+2))throw Error(`Back to World showed the window but the World did not draw again (frames ${before} → ${after})`);
 }
 mark('Back to World restored the World window');
}
