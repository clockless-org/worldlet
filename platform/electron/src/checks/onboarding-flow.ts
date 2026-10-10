import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {BrowserWindow,type BaseWindow} from 'electron';
import {WorldLedger} from '../store/ledger.ts';
import {createDiagnostics,type DiagnosticNote} from '../host/diagnostics.ts';
import {ExecutionJournal} from '../modules/agent-runtime/journal.ts';
import {DEMO_HOST} from '../modules/browser/page.ts';
import {AGENT,BROWSER,COMPANION,DESKTOP_COMPANION,FOX,USER_ACTIVITY,type AgentService,type BrowserService,type CompanionService,type DesktopCompanionService,type FoxService,type UserActivityService} from '../host/services.ts';
import {desktopCompanion} from './onboarding-paths.ts';
import type {WebPage} from '../modules/browser/web-page.ts';
import type {Row} from '../host/types.ts';
import type {CheckContext} from './index.ts';
import {setTimeout as sleep} from 'node:timers/promises';
import {errorMessage as message} from '../files.ts';

// Release gate (Mac OnboardingFlowSmoke): the whole first-run journey in a fresh library, on real
// code. Mock Google sign-in, app choice, arrival, the guided spotlight tour, Attention results, Fox's first
// suggestion, Fox driving the built-in browser on the rehearsal site under its glow without asking
// for approval until its one Go ahead before the last step, the page Fox ended on still in the
// panel, also with the window covered, and the first win with nothing asked afterwards, then Fox fetching the mock inbox and drafting a reply in conversation
// (mailConversation). At arrival, at Fox's first suggestion and after the first win the
// library must hold no failed background work (journal, runs, Attention budget, diagnostics); an
// item save the model repaired in the same successful run is a self-correction, not a failure.
// Runs Fox and its background work on this computer's Codex CLI, which the launcher chose as Fox's Agent.

const COMPANION_BLOCKING=false;
export async function onboardingFlow({host,window,view}:CheckContext){
 const {store}=host;
 // Development data is disposable, but never the developer's own Dev library.
 const disposable=process.env.WORLDLET_PROFILE_ROOT;
 if(!disposable||path.resolve(disposable)!==path.resolve(store.root))throw Error('needs a disposable library: start with WORLDLET_PROFILE_ROOT (npm run test:onboarding)');
 if(store.state.onboarding?.completed===true||store.state.connections.length||store.sampleEnabled())throw Error('the library is not fresh: '+store.root);
 const agentId=host.optional<AgentService>(AGENT)?.id;
 if(agentId!=='local-codex')throw Error(`Fox's Agent is ${agentId??'missing'}, not the local Codex CLI the launcher chose: install the Codex CLI where Worldlet looks for it`);
 // A person is going through first run: synthetic input never resets the system idle clock, and an
 // unattended release host's own idle time must not hold Attention back.
 host.provide<UserActivityService>(USER_ACTIVITY,{idleSeconds:()=>0});
 const started=Date.now();
 const mark=(step:string)=>console.log(`  ${((Date.now()-started)/1000).toFixed(1).padStart(5)}s  ${step}`);
 await detectorCheck();mark('the failure detector reports a rejected background reply');
 const web=view.webContents;
 const js=(code:string)=>web.executeJavaScript(code,true);
 const seen=async()=>{try{return await js("JSON.stringify({fox:document.querySelector('#companionDialogue')?.innerText?.slice(0,300)??null,buttons:[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()).filter(Boolean).slice(0,24),stage:document.querySelector('#notionWorld')?.dataset.depth??null,world:{...document.querySelector('#notionWorld')?.dataset}})");}catch{return 'unavailable';}};
 const wait=async(what:string,code:string,seconds:number)=>{
  for(let i=0;i<seconds*5;i++){if(await js(code).catch(()=>false)===true){mark(what);return;}await sleep(200);}
  throw Error(`Timed out after ${seconds}s waiting for: ${what}\n  screen: ${await seen()}`);
 };
 // Clicks a visible button by its label, as a person would.
 const button=(label:string)=>`[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;
 const press=async(label:string,seconds=30)=>{await wait(`button “${label}”`,`!!${button(label)}`,seconds);await js(`${button(label)}.click();true`);};
 const dialogue=(pattern:string)=>`${pattern}.test(document.querySelector('#companionDialogue')?.innerText||'')`;
 await wait('first-use screen',"!!document.querySelector('.setup-more-toggle')",20);
 // The one setup page keeps every way in but the local Agents under More options (owner request 2026-10-09).
 await js("document.querySelector('.setup-more-toggle').click();true");
 await press('Use mock Google (Dev)');
 await press('Enter your world',120);
 await wait('world arrival',"document.querySelector('#notionWorld')?.sceneMetrics?.renderer==='pixi-webgl'",60);
 noRecordedFailures(host,'world arrival');
 // A real mouse click at the middle of an element: the tour's spotlight catches every click and
 // acts only on one inside its box (ui/onboarding/tour-spotlight.ts).
 const clickAt=async(what:string,selector:string)=>{
  const at=await js(`(()=>{const b=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();return b&&b.width&&b.height?{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}:null;})()`);
  if(!at)throw Error(`Nothing to click for ${what}: ${selector}\n  screen: ${await seen()}`);
  web.sendInputEvent({type:'mouseMove',x:at.x,y:at.y});
  web.sendInputEvent({type:'mouseDown',x:at.x,y:at.y,button:'left',clickCount:1});
  web.sendInputEvent({type:'mouseUp',x:at.x,y:at.y,button:'left',clickCount:1});
  mark(`click on ${what}`);
 };
 const spotlit="document.querySelector('#notionWorld')?.dataset.tourSpotlight==='true'";
 // The tour (ui/onboarding/world-tour.ts): hello, Applets (Mail, connected by mock Google)
 // and the Attention Center (no step introducing Fox since owner decision 2026-10-10), each telling step proven by its spotlight and moved on with Continue; the phone
 // comes last, after the first win (owner request 2026-10-06).
 const step=(key:string,seconds=30)=>wait(`tour step ${key}`,`document.querySelector('#notionWorld')?.dataset.tourStep===${JSON.stringify(key)}`,seconds);
 await step('hello',60);
 // The Tutorial switch stays on in the World's bottom-right corner through the first run, above the spotlight, the
 // one way out (owner Order 2026-10-07); this journey goes on.
 await wait('the Tutorial switch, on, in the bottom-right corner',"(()=>{const s=document.querySelector('.tour-switch:not([hidden])');const r=s?.getBoundingClientRect();return !!r&&r.width>0&&s.getAttribute('aria-checked')==='true'&&r.right>innerWidth*.6&&r.bottom>innerHeight*.6&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.tour-switch')!==null;})()",10);
 await press('Continue');
 await step('applets');await press('Continue');
 await step('attention');await press('Continue');
 // First value (ui/onboarding/first-value.ts). 5. Fox boxes the item it picked; a click on it opens its card.
 // The items come from this host's own model reading the mock inbox, which on a loaded release host can
 // take minutes: Fox says it is still reading and waits for the item instead of ending the tour first
 // (Mac RCs 2961, 2963, 2968, 2980 ended it with “Nothing needs you right now” and never picked; #1970).
 {const deadline=Date.now()+360000,ended=dialogue('/Nothing needs you right now|Your world is yours to explore/');
  while(!await js(`${dialogue('/I picked/')}&&${spotlit}`).catch(()=>false)){
   const over=await js(ended).catch(()=>false)===true;
   if(over||Date.now()>deadline){
    const db=store.ledger(),attention=db.attentionBudget(),runs=db.records('runs').filter((r:Row)=>r.taskId==='attention:center').map((r:Row)=>r.status);
    throw Error(`${over?'Fox ended the tour without picking something to try together':'Timed out after 360s waiting for: Fox picks something to try together'}\n  items: ${store.worldItems().length}, Attention ${attention.lastStatus??'never ran'}, center runs ${JSON.stringify(runs)}\n  screen: ${await seen()}`);
   }
   await sleep(500);
  }
  mark('Fox picks something to try together');}
 await sleep(600);
 await clickAt('the boxed item','.tour-spotlight:not([hidden]) .tour-spotlight-ring:not(.is-guide)');
 await wait('its card',"!!document.querySelector('#attentionPreview:not([hidden])')",10);
 // 6. Fox's first suggestion: something it can finish on a website.
 await wait('Fox asks to do it',dialogue('/Can I do this for you/'),10);
 // The card is lit to its own edge with no ring; Fox stays where it stands, never lifted under the card (owner feedback 2026-10-06).
 await wait('Fox in its place, its question in its bubble',"(()=>{const r=s=>document.querySelector(s)?.getBoundingClientRect(),card=r('#attentionPreview'),fox=r('.companion-avatar'),said=r('#companionDialogue'),ring=document.querySelector('.tour-spotlight .tour-spotlight-ring:not(.is-guide)');return document.querySelector('#notionWorld')?.dataset.tourFox===undefined&&!!ring?.hidden&&!!card&&!!fox&&!!said&&said.bottom<=fox.top+1&&said.top>=0;})()",10);
 // The card's own Done takes clicks too (owner request 2026-10-04), with Dismiss and Later hidden until
 // the tour is over; this journey goes on with Fox, so Done is only proven reachable, not pressed.
 await wait('the card’s Done reachable, Dismiss and Later hidden',"(()=>{const b=document.querySelector('#attentionPreview .attention-preview-action-primary'),r=b?.getBoundingClientRect();return !!r&&r.width>0&&b.textContent.trim()==='Done'&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b&&![...document.querySelectorAll('#attentionPreview .attention-preview-action:not(.attention-preview-action-primary)')].some(e=>e.offsetParent);})()",5);
 const doing=Date.now()/1000;
 await press('Do it for me');
 await wait('browser open under Fox’s glow',"!!document.querySelector('.browser-viewport.is-fox-control')",8);
 // The glow is a separate transparent window above the page (modules/browser/glow.ts): FoxGlow
 // shows it with the style applied (isShowing) and hides it when Fox stops driving the page.
 const glowing=()=>foxGlowShowing(window);
 for(let i=0;i<80&&!await glowing();i++)await sleep(100);
 if(!await glowing())throw Error('Fox’s glow did not show over the page while Fox worked.');
 if(process.env.WORLDLET_FOX_GLOW_SHOT){await sleep(2000);capture(window,process.env.WORLDLET_FOX_GLOW_SHOT);}
 await wait('Fox narrates while it plans',dialogue('/On it:|reading the saved details|working out the steps/'),8);
 // Attention results and the suggestion came from background S/M and synthesis runs.
 noRecordedFailures(host,'Fox’s first suggestion');
 // While Fox works the only question is the Go ahead before the last step, here Confirm
 // attendance (owner decision 2026-10-03); any other approval or a confirmation afterwards
 // fails the journey.
 let asked='';
 const watching=setInterval(()=>{void js(`[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()).find(t=>['Allow','Mark done','It worked','Mark it done'].includes(t))||''`).then(found=>{if(found)asked=String(found);},()=>{});},300);
 try{
  // 7. The page stays full size in the Applet while Fox works, so the person can watch and step in
  // (owner feedback 2026-10-02: no picture in picture for Fox's pages).
  try{await wait('Fox asks once before the last step',`${dialogue('/Last step:/')}&&!!${button('Go ahead')}`,300);}
  catch(error){throw Error((error as Error).message+'\n'+toolTrail(store.ledger(),doing));}
  // While Fox waits for the Go ahead its page still shows, not a blank slot, also while the window is covered (the
  // person is often in another app when Fox finishes): in the panel, or on the CEF engine in the
  // task picture-in-picture window at the World's bottom-right (#1175). Pages kept for other
  // Applets stay attached but hidden; the visible one is Fox's.
  // Asked of the panel itself, so the check holds on either website engine (#1170).
  const page=host.use<BrowserService>(BROWSER).visiblePage();
  const bounds=page?.frameRect();
  let pageHost='';try{pageHost=new URL(page?.url??'').hostname.toLowerCase();}catch{}
  if(!page||page.hidden||!page.isPresented()||pageHost!==DEMO_HOST||!bounds||bounds.width<=200||bounds.height<=200)
   throw Error('The Browser panel lost Fox’s page: '+JSON.stringify(page?{url:page.url,hidden:page.hidden,presented:page.isPresented(),bounds}:null));
  const text=await page.evaluate('return document.body.innerText',{},{isolated:false}).catch(()=>'');
  if(typeof text!=='string'||!text.trim())throw Error('Fox’s page is empty.');
  await coveredWindowCheck(window,page);
  mark('Fox’s page stays shown (the panel or its task picture-in-picture window)');
  await press('Go ahead');
  await wait('first win',dialogue('/first win/i'),300);
  const won=Date.now();
  // The tour's last step (owner request 2026-10-06): Fox on the phone too. It never follows the first win's fireworks
  // (owner feedback 2026-10-06): the World is free first, and the phone comes a couple of minutes later, at a calm
  // moment. npm run test:onboarding shortens that wait (WORLDLET_TOUR_CODA_MS, the snapshot's tourCodaAfterWinMs) so
  // the RC does not spend two minutes idle; the phone must still wait at least that long, and world-tour-check.ts
  // holds the two minutes on a moved clock. Not now registers nothing with the relay.
  const coda=Number(store.snapshot().tourCodaAfterWinMs)||120_000;
  await wait('the World free after the first win, the phone step waiting',"document.querySelector('#notionWorld')?.dataset.tourSpotlight===undefined&&document.querySelector('#notionWorld')?.dataset.tourLock===undefined&&document.querySelector('#notionWorld')?.dataset.tourCoda==='waiting'",15);
  if(await js("document.querySelector('#notionWorld')?.dataset.tourStep==='phone'"))throw Error('The phone step came right after the first win.');
  await step('phone',Math.round(coda/1000)+60);
  // The check sees the first win up to a poll after the tour does, so allow two seconds.
  if(Date.now()-won<coda-2000)throw Error(`The phone step came ${((Date.now()-won)/1000).toFixed(1)}s after the first win, before its ${coda/1000}s wait.`);
  await press('Not now');
  await wait('the tour over',"document.querySelector('#notionWorld')?.dataset.tourStep===undefined&&document.querySelector('#notionWorld')?.dataset.tourSpotlight===undefined",10);
 }
 finally{clearInterval(watching);}
 if(asked)throw Error(`Fox asked “${asked}” during or after the browser task; the Go ahead before the last step is the only question.`);
 for(let i=0;i<50&&await glowing();i++)await sleep(100);
 if(await glowing())throw Error('Fox’s glow stayed over the page after Fox finished.');
 const journey=store.state.onboarding;
 const itemID=journey?.journeyItemId;
 if(journey?.journeyStage!=='finish'||typeof itemID!=='string')throw Error('The journey did not finish: '+(journey?.journeyStage??'none'));
 if(store.ledger().find('items',itemID)?.status!=='done')throw Error('The first task was not marked done.');
 if(!store.ledger().records('browser-actions').some(row=>row.taskID===itemID&&row.status==='user_confirmed'))throw Error('Fox’s browser step was not linked to the task and settled by the Go ahead.');
 // Background work still in flight settles before the final look (bounded).
 for(let i=0;i<120;i++){
  const db=store.ledger();
  if(!db.records('runtime-runs').some(run=>run.status==='running')&&db.attentionBudget().lastStatus!=='running')break;
  await sleep(1000);
 }
 for(const line of noRecordedFailures(host,'after the first win'))console.log('  self-corrected: '+line);
 // The tour replays on demand from the Tutorial switch in the World's corner (#1327) and leaves the finished journey
 // alone; Esc ends it. It waits while Fox works, so allow for a turn still finishing.
 await wait('the Tutorial switch in the corner, off',"(()=>{const b=document.querySelector('.world-tutorial-corner .world-tutorial[aria-checked=false]');if(!b||!b.checkVisibility({visibilityProperty:true}))return false;b.click();return true;})()",20);
 await step('hello',120);
 // A key reaches the page only while it has keyboard focus, which another window on the test computer can take
 // (Mac Alpha 4139, #191: the replay stayed on its first step). So the page counts the Esc it receives: a press that never
 // arrived is pressed again with the World window focused, and one that arrived but left the replay running fails at once.
 const ended="document.querySelector('#notionWorld')?.dataset.tourStep===undefined&&document.querySelector('#notionWorld')?.dataset.tourSpotlight===undefined";
 await js("window.__checkEscapes=0;window.addEventListener('keydown',e=>{if(e.key==='Escape')window.__checkEscapes++;},true);true");
 for(let attempt=1;;attempt++){
  window.focus();web.focus();
  web.sendInputEvent({type:'keyDown',keyCode:'Escape'});web.sendInputEvent({type:'keyUp',keyCode:'Escape'});
  for(let i=0;i<10&&await js(`window.__checkEscapes>0||(${ended})`).catch(()=>false)!==true;i++)await sleep(200);
  const arrived=await js('window.__checkEscapes>0').catch(()=>false)===true;
  if(arrived)break;
  if(attempt>=3)throw Error(`Esc never reached the page in ${attempt} presses (page focused: ${await js('document.hasFocus()').catch(()=>'unknown')}, World window focused: ${window.isFocused()})\n  screen: ${await seen()}`);
  mark(`Esc did not reach the page (page focused: ${await js('document.hasFocus()').catch(()=>'unknown')}); pressing it again`);
 }
 await wait('the replay ends on Esc',ended,10);
 if(store.state.onboarding?.journeyStage!=='finish')throw Error('Replaying the tour moved the journey: '+(store.state.onboarding?.journeyStage??'none'));
 await mailConversation({host,js,wait,mark,press,seen});
 // Closing the finished World (demo feedback 2026-10-03: a person force-quit instead): Fox stays on the
 // desktop and says once how to go back or quit, and Back to World restores the window (#1492). Quit
 // Completely and leftover processes are onboarding-paths.ts. New in this gate: it reports
 // ADVISORY FAIL until it has passed on 02, then COMPANION_BLOCKING turns on.
 if(process.platform==='darwin'){
  try{
   await desktopCompanion(host.use<DesktopCompanionService>(DESKTOP_COMPANION),window,view,mark,
    ()=>wait('Fox’s one-time hint: Back to World or Quit Completely',dialogue('/Back to World/')+'&&'+dialogue('/Quit Completely/'),10));
  }catch(error){if(COMPANION_BLOCKING)throw error;console.log('ADVISORY FAIL onboarding flow, desktop Companion: '+message(error));}
 }
 console.log(`PASS onboarding flow: mock sign-in → apps → tour → Attention → Fox’s first task finished in the browser → confirmed → first win → tour replayed from the Tutorial switch → Fox fetched the inbox and drafted a reply in conversation, with no failed background work (${Math.round((Date.now()-started)/1000)}s)`);
}

interface MailContext {host:CheckContext['host'];js:(code:string)=>Promise<any>;wait:(what:string,code:string,seconds:number)=>Promise<void>;mark:(step:string)=>void;press:(label:string,seconds?:number)=>Promise<void>;seen:()=>Promise<string>}
/** After the journey, two real conversations about the mock Gmail inbox (core/accounts/google/mock.ts:
 * only the Google API client is fictional; paging, normalization and Fox are the real ones): Fox
 * fetches the unread mail and names who needs a reply, then drafts a reply that waits for review
 * and is cancelled, never sent. Judged on the tools the turn used and their effects, not wording;
 * each conversation gets a second try because a model answers differently each run. */
async function mailConversation({host,js,wait,mark,press,seen}:MailContext){
 const {store}=host,companion=host.use<CompanionService>(COMPANION),fox=host.use<FoxService>(FOX);
 // Tools this turn used, from the execution journal: Hermes reports each tool it runs as progress,
 // and each host tool behind it (a World gateway call included) with its arguments.
 const toolsSince=(since:number)=>{
  const db=store.ledger(),calls:{name:string,args:Row}[]=[];
  for(const row of db.history({since:Math.floor(since)-1,limit:2000})){
   if(!['tool.requested','harness.event'].includes(row.kind))continue;
   const payload=db.queryWorldHistory({seq:row.seq}).events?.[0]?.payload;
   if(payload&&typeof payload==='object'&&['tool','progress'].includes(payload.type)&&typeof payload.name==='string')
    calls.push({name:payload.name,args:payload.args&&typeof payload.args==='object'?payload.args:{}});
  }
  return calls;
 };
 /** read_world_source's receipt: Mail records were returned to Fox,
  * whether Fox called the tool directly or through call_world_tool. */
 const readMail=(calls:{name:string,args:Row}[])=>calls.some(call=>call.name==='_source_result'&&call.args.provider==='gmail'&&call.args.failed!==true);
 /** Types to Fox as a person does; resolves to Fox's answer and the tools its turn used. */
 const ask=async(text:string,seconds=300)=>{
  for(let i=0;i<300&&fox.turnActive();i++)await sleep(200);
  const since=Date.now()/1000;
  if(await js(`(()=>{const input=document.getElementById('notionInput'),form=document.getElementById('notionCommand');if(!input||!form)return false;input.value=${JSON.stringify(text)};form.requestSubmit();return true;})()`)!==true)throw Error('could not type to Fox');
  let idle=0;
  for(let i=0;i<seconds*5;i++){
   await sleep(200);
   const turns=(companion.archive().conversations??[]) as Row[],at=turns.map(turn=>turn.text).lastIndexOf(text);
   const reply=at>=0?turns.slice(at+1).find(turn=>turn.role==='assistant'):undefined;
   idle=at>=0&&!fox.turnActive()?idle+1:0;
   if(reply&&idle){const calls=toolsSince(since);return {reply:String(reply.text),tools:calls.map(call=>call.name),calls};}
   if(idle>=15)throw Error(`Fox's turn ended without an answer\n  screen: ${await seen()}`);
  }
  throw Error(`Fox did not answer within ${seconds}s\n  screen: ${await seen()}`);
 };
 const scenarios:{name:string,run:()=>Promise<string|null>}[]=[
  {name:'Fox fetches the unread mail and says who needs a reply',run:async()=>{
   const turn=await ask('Fetch my unread email from Mail now (not saved items) and tell me which messages need a reply from me.');
   console.log(`         tools: ${turn.tools.join(', ')||'none'}; reply: ${JSON.stringify(turn.reply.slice(0,200))}`);
   if(!readMail(turn.calls))return 'Fox did not read Mail (no read_world_source result for gmail in this turn)';
   return /Priya|Sam/i.test(turn.reply)?null:'the answer names neither Priya nor Sam, who asked for replies';
  }},
  {name:'Fox drafts a reply for review, cancelled without sending',run:async()=>{
   const turn=await ask('Draft a reply to Priya’s email about the Q4 roadmap: say I will send the draft by Thursday afternoon. Do not send it; I want to review it first.');
   console.log(`         tools: ${turn.tools.join(', ')||'none'}; reply: ${JSON.stringify(turn.reply.slice(0,200))}`);
   try{await wait('the draft to Priya shown for review',"/priya@northwind\\.example/i.test(document.querySelector('.fox-email-review')?.innerText||'')",30);}
   catch{return 'no email review addressed to priya@northwind.example was shown';}
   await press('Cancel');
   return null;
  }}
 ];
 for(const scenario of scenarios){
  let failure:string|null='';
  for(let attempt=1;attempt<=2;attempt++){
   try{failure=await scenario.run();}catch(error){failure=message(error);}
   if(!failure){mark(`${scenario.name}${attempt>1?' (second try)':''}`);break;}
   mark(`attempt ${attempt} failed: ${scenario.name}: ${failure}`);
  }
  if(failure)throw Error(`${scenario.name}: ${failure}`);
 }
 noRecordedFailures(host,'after the mail conversation');
}

/** Fox's glow window: a child of the World window whose page (glow.ts PAGE) draws the glow. FoxGlow
 * shows it only with a style applied and hides it otherwise, so a visible one with its frame drawn
 * is `FoxGlow.isShowing`. */
async function foxGlowShowing(window:BaseWindow){
 for(const child of window.getChildWindows()){
  if(!(child instanceof BrowserWindow)||child.isDestroyed()||!child.isVisible())continue;
  try{if(await child.webContents.executeJavaScript("typeof glow==='object'&&getComputedStyle(document.getElementById('root')).display==='block'",false)===true)return true;}catch{}
 }
 return false;
}
/** Website views on the rehearsal site, as attached to the World window (modules/browser/page.ts PageView). */
/** Check evidence: the World window's screen area, the glow window above it included. */
function capture(window:BaseWindow,file:string){
 if(process.platform!=='darwin'){console.log('Window screenshot skipped: macOS only');return;}
 const {x,y,width,height}=window.getBounds();
 try{execFileSync('/usr/sbin/screencapture',['-x','-R',`${x},${y},${width},${height}`,file]);console.log('Window screenshot:',file);}
 catch(error){console.log('Window screenshot failed:',message(error));}
}
/** A covered or inactive World window keeps the website pane attached, visible and rendering:
 * otherwise the panel comes back blank and Fox's page steps stall (Mac BrowserSmoke.coveredWindowCheck). */
async function coveredWindowCheck(window:BaseWindow,page:WebPage){
 console.log('CHECK covered window');
 const bounds=window.getBounds();
 const cover=new BrowserWindow({x:bounds.x-40,y:bounds.y-40,width:bounds.width+80,height:bounds.height+80,frame:false,show:false,backgroundColor:'#000000',hasShadow:false,skipTaskbar:true,
  webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
 try{
  cover.show();
  for(let i=0;i<50&&window.isFocused();i++)await sleep(100);
  await sleep(1000);
  const attached=page.isPresented()&&!page.hidden;
  const state=await page.evaluate("return await new Promise(done=>{let n=0;const report=()=>done({visibility:document.visibilityState,frames:n});const tick=()=>{if(++n>=5)report();else requestAnimationFrame(tick)};requestAnimationFrame(tick);setTimeout(report,3000);});",{},{isolated:false,timeoutSeconds:5}).catch(()=>null);
  if(!attached||state?.visibility!=='visible'||!(state?.frames>=5))
   throw Error(`A covered World window hid the website pane (${JSON.stringify({attached,focused:window.isFocused(),...state})}); the Browser panel would come back blank and Fox’s page steps would stall.`);
  console.log(`PASS covered World window keeps the website pane attached, visible and rendering (World window ${window.isFocused()?'still focused':'inactive'})`);
 }finally{cover.destroy();}
}

/** The journey fails when background work failed, even if its data was saved: #766 made Core
 * reject every background reply, runs were recorded as failed and Mail showed "An operation
 * failed", yet the journey still passed (#787). Returns the repaired self-corrections. */
/** Fox's World tool calls since `since` (seconds), oldest first: each tool, its target and action, and the error it got
 * back, so a browser task that stalls says why in the Alpha Issue (Mac 4096: "the browser kept reporting it wasn't
 * ready"). Names and error text only, never what a page or a mail says. */
export function toolTrail(db:WorldLedger,since:number,limit=24){
 const payload=(seq:number):any=>db.queryWorldHistory({seq}).events?.[0]?.payload;
 const names=new Map<string,string>(),lines:string[]=[];
 const steps=db.history({since:Math.floor(since)-1,kinds:['tool.requested','tool.result','tool.failed'],limit:400}).reverse();
 for(const step of steps){
  const body=payload(step.seq);if(!body||typeof body!=='object')continue;
  const id=typeof body.id==='string'?body.id:'';
  if(step.kind==='tool.requested'){
   const args=body.args&&typeof body.args==='object'?body.args:{};
   const what=[body.name,args.target,args.action,args.name].filter(value=>typeof value==='string'&&value).join(' ');
   names.set(id,what||'unknown tool');continue;
  }
  const error=step.kind==='tool.failed'?body.error:body.result?.error;
  lines.push(`${new Date(step.at*1000).toISOString().slice(11,19)} ${names.get(id)??'unknown tool'}: ${typeof error==='string'?'error '+error.replace(/\s+/g,' ').slice(0,200):'ok'}`);
 }
 return lines.length?`  Fox's World tool calls (last ${Math.min(limit,lines.length)}):\n`+lines.slice(-limit).map(line=>'   '+line).join('\n'):'  Fox made no World tool calls.';
}
function noRecordedFailures(host:CheckContext['host'],checkpoint:string){
 const found=recordedFailures(host.store.root,host.store.ledger(),host.diagnostics.recent?.()??[]);
 if(found.failures.length)throw Error(failureReport(checkpoint,found.failures));
 return found.repaired;
}
/** The report's first line is all a release host keeps of a failed gate (its Issue shows that line, cut at 240
 * characters; Alpha 4036 kept only "Background work failed (checked at world arrival):", #49), so it names how many
 * failed and the first one with its error text; every failure follows, one per line. Home folders read `~`. */
export function failureReport(checkpoint:string,failures:string[]){
 const home=os.homedir(),mask=(line:string)=>home.length>1?line.split(home).join('~'):line;
 const lines=failures.map(line=>mask(line).replace(/\s+/g,' ').trim());
 return `Background work failed at ${checkpoint} (${lines.length}): ${lines[0]}`+(lines.length>1?'\n  - '+lines.join('\n  - '):'');
}

/** The detector itself, on records the app's own writers put in a scratch library: the #787
 * invalid final reply fails; an item save rejected and then repaired in the same successful run
 * passes; a rejected save never repaired fails with its error text. */
async function detectorCheck(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-failure-detector-'));
 const db=new WorldLedger(root);
 try{
  if(recordedFailures(root,db).failures.length)throw Error('The failure detector reports failures in an empty library.');
  // The Agent runtime's journal writer (modules/agent-runtime/index.ts) into this scratch ledger.
  const record=(entry:Row)=>db.recordExecution(entry);
  const home=(scope:string)=>ExecutionJournal.register(path.join(root,'agent',scope,'hermes'),true,record);
  const diagnostics=createDiagnostics(root);
  const task='applet:google-calendar:analyze',turn=crypto.randomUUID().toUpperCase(),rejected=Error('Agent returned an invalid final reply.');
  if(!db.claimRuntimeTask(task,'google-calendar','source-analysis',turn))throw Error('The failure detector could not claim its scratch task.');
  const request={action:'chat',mode:'chat',monitor:true,sourceAnalysis:true,analysisLane:'google-calendar',session:'applet-detector'};
  try{await ExecutionJournal.run(request,home('applet-analysis'),undefined,async()=>{throw rejected;});}catch{}
  diagnostics.record(rejected,'appletAnalysis',turn);
  db.finishRuntimeTask(task,turn,'failed',0);
  // Item saves: call save-1 is rejected, save-2 accepted. The repaired run submits both.
  const reply=(event:Row)=>event.id==='save-1'?{error:'Detector rejected item.'}:{ok:true,staged:1};
  const saves=async(body:Row,scope:string,calls:string[],diagnostic:string)=>{
   await ExecutionJournal.run(body,home(scope),reply,async event=>{
    for(const id of calls)await event({type:'tool',id,name:'upsert_world_items',args:{}});
    return {message:'Saved.'};
   });
   diagnostics.record(Error('Detector rejected item.'),'worldItemSave',diagnostic);
  };
  const repairedTurn=crypto.randomUUID().toUpperCase(),unrepaired='applet-'+crypto.randomUUID().toUpperCase();
  await saves({action:'chat',mode:'chat',monitor:true,attentionSynthesis:true,session:'attention-'+repairedTurn},'monitor',['save-1','save-2'],repairedTurn);
  await saves({action:'chat',mode:'chat',monitor:true,sourceAnalysis:true,analysisLane:'google-calendar',session:unrepaired},'applet-analysis',['save-1'],unrepaired);
  // A source tool call refused within a turn (attention/tools.ts _source_begin) is that call's result, not failed work.
  try{await ExecutionJournal.run({action:'sourceTool',name:'read_world_source',args:{}},home('source'),undefined,async()=>{throw Error('Source is unavailable or this turn reached its read limit.');});}catch{}
  // A kept page released under memory pressure (modules/browser/device.ts) is the host relieving
  // memory as designed, not failed background work.
  diagnostics.record(Error('Kept page released under memory pressure (lowMemory).'),'keptPageRelease');
  diagnostics.record(Error('Kept page released under memory pressure (appFootprint).'),'keptPageRelease');
  // An operation Core keeps no name for, whose text only the host's memory has (diagnostics.recent).
  diagnostics.record(Error('Detector history unreadable.'),'historySync');
  const found=recordedFailures(root,db,diagnostics.recent());
  const report=found.failures.join('\n'),repaired=found.repaired.join('\n');
  if(report.includes('keptPageRelease'))throw Error(`The failure detector reported a kept-page release under memory pressure:\n${report}`);
  if(report.includes('read limit')||!repaired.includes('Source tool read_world_source refused'))throw Error(`The failure detector reported a refused source tool call as failed work:\n${report}`);
  for(const expected of ['Agent run failed: appletAnalysis (google-calendar), session applet-detector','Agent returned an invalid final reply.','Runtime run failed for '+task,'diagnostics.jsonl: appletAnalysis',
   'diagnostics.jsonl: worldItemSave operationFailed at ','diagnostics.jsonl: historySync operationFailed at ','Z: Detector history unreadable.',`— upsert_world_items rejected in appletAnalysis (google-calendar), session ${unrepaired}, never repaired in that run, which ended run.succeeded: Detector rejected item.`])
   if(!report.includes(expected))throw Error(`The failure detector missed “${expected}” in:\n${report}`);
  if(report.includes(repairedTurn)||!repaired.includes(`(request ${repairedTurn}) — upsert_world_items rejected in attentionSynthesis, session attention-${repairedTurn}, repaired by a later accepted upsert_world_items in the same run: Detector rejected item.`))
   throw Error(`The failure detector did not treat a repaired item save as a self-correction.\nFailures:\n${report}\nRepaired:\n${repaired}`);
  // The first line alone names the count and the first failure with its text.
  const first=failureReport('the detector',found.failures).split('\n')[0];
  if(!first.startsWith(`Background work failed at the detector (${found.failures.length}): Agent run failed: `)||!first.includes('Agent returned an invalid final reply.'))
   throw Error(`The failure report's first line does not say what failed: ${first}`);
 }finally{db.close();fs.rmSync(root,{recursive:true,force:true});}
}

/** Diagnostics rows the host persisted (host/diagnostics.ts), oldest first. */
function persistedDiagnostics(root:string):Record<string,string>[] {
 return ['diagnostics.previous','diagnostics'].flatMap(name=>{
  let text='';try{text=fs.readFileSync(path.join(root,'logs',name+'.jsonl'),'utf8');}catch{return [];}
  return text.split('\n').filter(Boolean).flatMap(line=>{
   try{const row=JSON.parse(line);return row&&typeof row==='object'&&!Array.isArray(row)&&Object.values(row).every(value=>typeof value==='string')?[row]:[];}catch{return [];}
  });
 });
}

/** Every failure the library recorded, one line each, naming the operation and its error text so
 * the check output alone is diagnosable. Reads through the host's own accessors: the execution
 * journal (World history), runtime and execution runs, the Attention budget and persisted diagnostics.
 * A diagnostics row keeps no error text and only the operations Core knows, so `notes` (the host's
 * `diagnostics.recent()`, the same failures with their text, from memory) supplies both, matched by time. */
export function recordedFailures(root:string,db:WorldLedger,notes:DiagnosticNote[]=[]):{failures:string[],repaired:string[]} {
 const events=(args:Row):Row[]=>db.queryWorldHistory(args).events??[];
 // A journal payload, read in history content chunks when it is too large to inline.
 const payload=(seq:number):any=>{
  const inline=events({seq})[0]?.payload;
  if(inline!==undefined&&inline?.truncated!==true)return inline;
  let text='',offset=0;
  for(let i=0;i<64;i++){
   const content=events({seq,contentOffset:offset})[0]?.content;
   if(!content||typeof content!=='object')break;
   text+=typeof content.text==='string'?content.text:'';
   if(typeof content.nextContentOffset!=='number')break;
   offset=content.nextContentOffset;
  }
  try{return JSON.parse(text)?.payload;}catch{return undefined;}
 };
 const startedRequest=(runID:string)=>{const seq=db.history({kind:'run.started',key:runID,limit:1})[0]?.seq;const value=typeof seq==='number'?payload(seq):undefined;return value&&typeof value==='object'?value as Row:undefined;};
 // Names match the diagnostics operations (appletAnalysis, attentionSynthesis, …).
 const operation=(request:Row|undefined)=>{
  if(!request)return 'Agent run';
  let name=request.attentionSynthesis===true?'attentionSynthesis':typeof request.analysisLane==='string'?`appletAnalysis (${request.analysisLane})`
   :[request.action,request.mode].filter(value=>typeof value==='string').join('/');
  if(typeof request.session==='string')name+=', session '+request.session;
  return name;
 };
 const failures:string[]=[],repaired:string[]=[];
 // 1. Execution journal: Agent runs that ended in run.failed, with the Harness's error text.
 const agentErrors:{at:number,text:string}[]=[];
 for(const row of db.history({kind:'run.failed',limit:1000})){
  const runID=typeof row.body?.runId==='string'?row.body.runId:row.key??'';
  const error=payload(row.seq)?.error;
  const text=typeof error==='string'?error:`no error text (history seq ${row.seq})`;
  const request=startedRequest(runID);
  // A source tool run (no model) answers one tool call of a turn: its refusal, such as a turn's read limit, is that
  // call's result, and the turn goes on. Background collection that cannot go on fails its own run, reported below.
  if(request?.action==='sourceTool'){repaired.push(`Source tool ${typeof request.name==='string'?request.name:'call'} refused (run ${runID}), returned to its turn: ${text}`);continue;}
  agentErrors.push({at:row.at,text});
  failures.push(`Agent run failed: ${operation(request)} (run ${runID}): ${text}`);
 }
 // The Agent error behind a host-side run, matched by time.
 const agentError=(started:unknown,finished:unknown)=>{
  if(typeof started!=='number')return '';
  const until=(typeof finished==='number'?finished:Date.now()/1000)+1;
  const match=agentErrors.find(error=>error.at>=started&&error.at<=until);
  return match?' — Agent error: '+match.text:'';
 };
 // 2. Runtime runs (tasks, S/M analysis, Attention) and execution runs (source checks).
 const hostRuns=new Map<string,Row>();
 for(const [bucket,label] of [['runtime-runs','Runtime run'],['runs','Execution run']]){
  for(const run of db.records(bucket)){
   if(!['failed','error'].includes(run.status))continue;
   const id=typeof run.id==='string'?run.id:'?';
   const task=typeof run.taskId==='string'?run.taskId:typeof run.provider==='string'?run.provider:'unknown task';
   // The journal mirrors each Agent run as an execution: task, reported above.
   if(task.startsWith('execution:'))continue;
   hostRuns.set(id,run);
   const code=typeof run.errorCode==='string'?', errorCode '+run.errorCode:'';
   failures.push(`${label} ${run.status} for ${task} (run ${id}${code})${agentError(run.startedAt,run.finishedAt)}`);
  }
 }
 // 3. Attention budget.
 const budget=db.attentionBudget();
 if(budget.lastStatus==='error')failures.push(`Attention synthesis budget lastStatus error, lastErrorCode ${typeof budget.lastErrorCode==='string'?budget.lastErrorCode:'none'}${agentError(budget.lastStartedAt,undefined)}`);
 // The rejected tool calls that may lie behind a diagnostics row: tool.failed journal events in the
 // row's time window whose run carries the row's request in its session. Diagnostics keep only UUID
 // requests, so an Applet session's row has none and every rejection in the window is a candidate.
 // Each reports how its run ended and whether a later call of the same tool in that run was accepted.
 const rejections=(row:Record<string,string>,request:string|undefined)=>{
  const time=Date.parse(row.at??'')/1000;
  if(!Number.isFinite(time))return [];
  const found:{text:string,repaired:boolean}[]=[];
  for(const event of db.history({since:Math.floor(time)-1,until:Math.floor(time)+2,kind:'tool.failed',limit:50})){
   const seq=event.seq,runID=event.body?.runId;
   if(typeof runID!=='string')continue;
   const started=startedRequest(runID);
   if(request&&typeof started?.session==='string'&&!started.session.includes(request))continue;
   const detail=payload(seq);
   const text=typeof detail?.error==='string'?detail.error:typeof detail?.result?.error==='string'?detail.result.error:`no error text (history seq ${seq})`;
   // Tool names live on tool.requested; results refer to them by call id.
   const names=new Map<string,string>(),accepted:{seq:number,id:string}[]=[];
   for(const step of db.history({key:runID,limit:1000,after:0})){
    if(!['tool.requested','tool.result'].includes(step.kind))continue;
    const body=payload(step.seq);
    if(!body||typeof body!=='object'||typeof body.id!=='string')continue;
    if(step.kind==='tool.requested')names.set(body.id,typeof body.name==='string'?body.name:'');else accepted.push({seq:step.seq,id:body.id});
   }
   const tool=(typeof detail?.id==='string'?names.get(detail.id):undefined)??'unknown tool';
   const ended=['run.succeeded','run.failed','run.cancelled','run.interrupted'].find(kind=>db.history({kind,key:runID,limit:1}).length)??'unfinished';
   const later=accepted.some(step=>step.seq>seq&&names.get(step.id)===tool);
   const fixed=later&&ended==='run.succeeded';
   const outcome=fixed?`repaired by a later accepted ${tool} in the same run`:later?`a later ${tool} was accepted, but the run ended ${ended}`:`never repaired in that run, which ended ${ended}`;
   found.push({text:` — ${tool} rejected in ${operation(started)}, ${outcome}: ${text}`,repaired:fixed});
  }
  return found;
 };
 // 4. Persisted diagnostics (logs/diagnostics.jsonl): any failure code except a cancellation and
 // a kept page released under memory pressure (core/browser/page-resume.ts PAGE_MEMORY), which is
 // the host relieving memory as designed, not failed work. A tool-level rejection (the tool reply told the model to correct and resubmit) is a normal
 // self-correction only when a later call of that tool in the same run was accepted and the run
 // succeeded; otherwise the work was never saved and it fails.
 const toolLevel=['worldItemSave'],used=new Set<DiagnosticNote>();
 for(const row of persistedDiagnostics(root)){
  const request=row.requestId||undefined;
  // Rows and notes are written in the same order, so each row, exempt ones included, takes the first note of its
  // time it has not used.
  const same=notes.filter(note=>!used.has(note)&&note.at===row.at&&(!row.operation||note.operation===row.operation||note.operation==='hermesChat'&&row.operation==='agentChat'));
  const note=same.find(note=>!!request&&note.requestId===request)??same[0];
  if(note)used.add(note);
  if(row.code==='cancelled')continue;
  if(row.operation==='keptPageRelease'&&(row.code==='lowMemory'||row.code==='appFootprint'))continue;
  const candidates=toolLevel.includes(row.operation??'')?rejections(row,request):[];
  const line=`diagnostics.jsonl: ${note?.operation||row.operation||row.area||'unknown operation'} ${row.code??'failed'} at ${row.at??'?'}${request?` (request ${request})`:''}`;
  // Exempt only when every candidate rejection was repaired: never guess in the row's favor.
  if(candidates.length&&candidates.every(candidate=>candidate.repaired)){repaired.push(line+candidates[0].text);continue;}
  const host=request?hostRuns.get(request):undefined;
  const said=note?': '+note.message:'';
  failures.push(line+(candidates.find(candidate=>!candidate.repaired)?.text??said+(host?agentError(host.startedAt,host.finishedAt):'')));
 }
 return {failures,repaired};
}
