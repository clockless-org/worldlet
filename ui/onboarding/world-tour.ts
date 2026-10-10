import {connectionLive,getApp} from '../../core/applets/index.ts';
import {tourInProgress} from '../../core/onboarding/index.ts';
import {appletBox,createCoachMark,createTourSpotlight,elementBox} from './tour-spotlight.ts';
import {createTourLock} from './tour-lock.ts';
import {pairingQR} from '../companion/index.ts';
import {phoneApps} from '../distribution/index.ts';

/** The first half of the first-run tour (owner design 2026-10-02, ui/onboarding/README.md):
 * once the welcome celebration ends, Fox says hello from where it always stands (owner feedback
 * 2026-10-04: it no longer hops to the middle), shows an Applet at work, then boxes the Attention Center.
 * The tour is short and never asks to sign in (owner decision 2026-10-10): the person's existing Agent is fully
 * connected at setup, so there is no Mail sign-in step, and no rename step (Fox's name stays changeable in Settings).
 * The tour's very last step, once first value is over, says Fox can be used on the phone too (owner request
 * 2026-10-06): a code to get the app, then the pairing code. After a first win it waits a couple of minutes for a calm
 * moment instead of following the fireworks (owner feedback 2026-10-06). A spotlight keeps the
 * person on the step, and until the whole first run is over (this half and first value) nothing
 * else in the World responds (tour-lock.ts, owner request 2026-10-04). Steps that only tell move on
 * with Continue or a click anywhere; the phone step waits for a choice. It resumes from the persisted journey stage and hands over to first value
 * (first-value.ts), where the person gives Fox one thing to do.
 *
 * The Tutorial switch in the World's bottom-right corner (owner Order 2026-10-07, tour-lock.ts) is on while
 * the tour runs; turning it off skips (owner requests 2026-10-04 and 2026-10-05) and ends the first run at
 * any step: the journey finishes, the World is free, and the switch stays in the corner, off.
 *
 * Replay (#1327): once the first run is over, turning the switch on shows the same steps again on
 * demand. A replay only tells: it never moves the journey stage and never asks
 * to sign in; turning the switch off (and Esc) end it. While Fox is working it waits and says so, and starts
 * once Fox is idle. */
type Box=ReturnType<typeof elementBox>;
const MAIL='app-gmail',RUNNING=['reading','syncing','connecting'];
// How long the phone step waits after first value ends. After the first win it never follows the fireworks: the World is
// the person's for a couple of minutes first, and the phone comes at a calm moment after that (owner feedback 2026-10-06:
// a phone prompt right after finishing the first task felt wrong). When the tour ends with nothing to do, Fox's farewell
// is seen first.
const CODA_AFTER_WIN=120000,CODA_AFTER_END=3000,CODA_RETRY=5000;
// A development host's real-app journey check (npm run test:onboarding) may shorten the wait after the first win with the
// snapshot's `tourCodaAfterWinMs` (WORLDLET_TOUR_CODA_MS, never in a release build): it still proves the phone waits and
// comes at a calm moment, without spending two wall-clock minutes of the RC; scripts/world-tour-check.ts holds the two
// minutes themselves on a clock it moves forward. Never shorter than CODA_MIN, so it still never follows the fireworks.
const CODA_MIN=10000;
const codaAfterWin=(state:any)=>{const ms=state?.tourCodaAfterWinMs;return typeof ms==='number'&&Number.isFinite(ms)&&ms>=CODA_MIN&&ms<CODA_AFTER_WIN?ms:CODA_AFTER_WIN;};
export function mountWorldTour({root,view,call,state:initial,arriving=false}){
 let state=initial,step=0,started=false,replaying=false,skipped=false,deferred=false,destroyed=false,waitingForArrival=arriving,shown='',timer:ReturnType<typeof setTimeout>|undefined;
 // The phone step closes the first run after first value (`coda`); it is not saved, as pairing stays in Settings.
 let coda=false,codaTimer:ReturnType<typeof setTimeout>|undefined;
 const spotlight=createTourSpotlight(root);
 const stage=()=>String(state.onboarding?.journeyStage||'');
 const active=()=>replaying||coda||stage()==='world-tour';
 // Choices are underlined words in Fox's bubble (owner feedback 2026-10-06); a second choice (Not now) is muted beside the main one.
 const button=(label:string,run:()=>unknown,quiet=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=quiet?'world-tour-quiet':'world-tour-primary';b.onclick=()=>void run();return b;};
 const modules=()=>((root as any).sceneMetrics?.modules||[]).filter((m:any)=>m.visible!==false&&m.unlocked!==false);
 // The Applet to show: one whose lights are on, else Mail, else the first one in the World. The step only tells; it never
 // offers to sign in (owner decision 2026-10-10).
 function applet():{id:string,title:string,running:boolean}|null {
  const list=modules();
  const busy=list.find((m:any)=>RUNNING.includes(m.presentation?.phase))||list.find((m:any)=>m.id===MAIL)||list[0];
  return busy?{id:busy.id,title:getApp(busy.id)?.title||'This Applet',running:RUNNING.includes(busy.presentation?.phase)}:null;
 }
 // Phone pairing (core/phone/README.md): the host owns it (`phonePair`) and reports changes as `worldlet:phone-status`.
 // Pairing starts only on Show pairing code, so a skipped step registers nothing with the relay; a host without phone
 // pairing leaves the step out.
 type Phone={state?:'none'|'waiting'|'paired',link?:string,phone?:{name?:string}|null};
 let phone:Phone|null=null,phoneMissing=false,phoneBusy=false;
 let phoneChecked=false;
 const checkPhone=()=>{if(phoneChecked||replaying)return;phoneChecked=true;void Promise.resolve().then(()=>call('phonePair',{operation:'status'})).then((status:Phone)=>{if(status&&typeof status==='object')phone=phone||status;},()=>{phoneMissing=true;});};
 const phoneState=()=>phone?.state==='paired'?'paired':phone?.state==='waiting'&&phone.link?'waiting':'none';
 const onPhoneStatus=(event:Event)=>{phone=(event as CustomEvent).detail||null;if(started&&STEPS[step]?.key==='phone')show();};
 window.addEventListener('worldlet:phone-status',onPhoneStatus);
 function phoneCode(){
  const state=phoneState(),link=state==='waiting'?phone.link:state==='none'?phoneApps.find(a=>a.id==='iphone')?.url:null;
  if(!link)return null;
  const box=document.createElement('div');box.className='world-tour-phone';
  const code=document.createElement('div');code.className='world-tour-phone-qr';code.innerHTML=pairingQR(link);code.setAttribute('role','img');
  code.setAttribute('aria-label',state==='waiting'?'Pairing code for the Worldlet phone app':'Code to get the Worldlet iPhone app');
  const caption=document.createElement('small');caption.textContent=state==='waiting'?'Scan in the Worldlet app. Waiting for your phone…':'Scan with your iPhone camera';
  box.append(code,caption);return box;
 }
 async function pairPhone(){
  if(phoneBusy)return;phoneBusy=true;
  try{phone=await call('phonePair',{operation:'start'});}catch{}finally{phoneBusy=false;}
  if(!destroyed&&STEPS[step].key==='phone')show();
 }
 // Not now ends a code nobody scanned; pairing stays in Fox's panel, under Mobile.
 function skipPhone(){if(phoneState()==='waiting')void call('phonePair',{operation:'end'}).catch(()=>{});next();}
 type Step={key:string,text:()=>string,target?:()=>Box,actions?:()=>HTMLElement[],body?:()=>HTMLElement|null,tell?:boolean,center?:boolean};
 const STEPS:Step[]=[
  {key:'hello',tell:true,text:()=>'Welcome! This is your **World**. Everything you have can live here now.'},
  {key:'applets',tell:true,target:()=>{const a=applet();return a?appletBox(root,a.id):null;},text:()=>{
   const a=applet();
   // The word the step teaches and the Applet's name are bold (owner feedback 2026-10-06).
   if(!a)return 'These are your **Applets**. Each one is a real app you can open and use right here.';
   return a.running?`This is your **Applet**, **${a.title}**. See its lights blinking? It’s working for you right now${a.id===MAIL?', collecting your new mail':''}. Every Applet here is a real app you can open and use.`
    :`This is your **Applet**, **${a.title}**. Each one is a real app you can open and use right here, and they keep working in the background.`;
  }},
  {key:'attention',tell:true,center:true,target:()=>elementBox(root,'.world-task-tracker'),text:()=>(state.connections||[]).some(connectionLive)||replaying
   ?'On the left is your **Attention Center**. I keep everything that needs you here: what’s coming up, what’s worth doing and what’s worth knowing. Pick anything, and I’ll show you how I can take care of it.'
   // Nothing connected: nothing will arrive to wait for, so the step only says what the Center is for.
   :'On the left is your **Attention Center**. I keep everything that needs you here: what’s coming up, what’s worth doing and what’s worth knowing. It fills up once your mail or calendar is connected.'},
  // The tour's last step (owner request 2026-10-06): Fox can be used on the phone too. Get the app, then pair it. It waits
  // for a choice, never a click anywhere. In the first run it follows first value (`coda`); a replay shows it last.
  {key:'phone',tell:false,body:()=>replaying?null:phoneCode(),text:()=>{
   // A replay only tells.
   if(replaying)return 'You can also use me on your **phone**: it shows your Attention Center and me wherever you go. Pair it any time from Settings, under Mobile.';
   const state=phoneState();
   if(state==='paired')return `You’re all set: ${phone.phone?.name?phone.phone.name+' is':'your phone is'} paired. Your Attention Center and I are on your **phone** now, wherever you go.`;
   if(state==='waiting')return 'Open Worldlet on your **phone** and scan this code. It’s end-to-end encrypted, so only your phone and this computer can read what passes between them.';
   const android=phoneApps.find(a=>a.id==='android')?.url;
   return `One more thing: you can also use me on your **phone**. Scan this with your iPhone camera to get Worldlet${android?', or find it on Google Play':' (Android is coming soon)'}. Then show the pairing code and scan it in the app.`;
  },
   actions:()=>{if(replaying)return [button('Continue',next)];const state=phoneState();return state==='paired'?[button('Continue',next)]:state==='waiting'?[button('Not now',skipPhone,true)]:[button('Not now',skipPhone,true),button('Show pairing code',()=>void pairPhone())];}},
 ];
 const TOUR_STEP:Record<string,number>={hello:1,applets:3,attention:4};
 function introduce(on:boolean){
  if((root.dataset.attentionIntroduced==='true')===on)return;
  if(on)root.dataset.attentionIntroduced='true';else delete root.dataset.attentionIntroduced;
  root.dispatchEvent(new CustomEvent('worldlet:attention-introduce'));
 }
 // After the welcome Fox comes in where it always stands (owner feedback 2026-10-04: no hop to the middle).
 function arrive(){
  if(!root.dataset.foxAway)return;
  root.querySelector('.companion-pet')?.getBoundingClientRect();
  delete root.dataset.foxAway;root.dataset.foxEntering='true';
  setTimeout(()=>{delete root.dataset.foxEntering;},1400);
 }
 function leave(){spotlight.hide();introduce(false);delete root.dataset.tourStep;delete root.dataset.tourReplay;}
 async function finish(){
  if(replaying){stop();return;}
  leave();started=false;
  state={...state,onboarding:{...state.onboarding,journeyStage:'first-value'}};
  try{await call('onboarding',{operation:'journey',stage:'first-value'});}catch{}
  view.setGuide(null);
  root.dispatchEvent(new CustomEvent('worldlet:world-tour-done'));
 }
 function next(){
  if(coda){endCoda();return;}
  // The first run hands over to first value after the Attention Center; the phone comes after it (coda). A replay shows it last.
  const last=replaying?STEPS.length-1:STEPS.findIndex(s=>s.key==='attention');
  if(step<last&&!(STEPS[step+1].key==='phone'&&phoneMissing)){step++;show();}else void finish();
 }
 // The phone, once first value is over (the first win, or nothing to do yet): the tour's last step.
 // A host without phone pairing leaves it out, and turning the Tutorial switch off before then cancels it.
 // While the phone step waits, `data-tour-coda` tells Fox not to speak first: a line of its own would keep the moment
 // from being calm, so the phone would never come (Mac RC 3035).
 function cancelCoda(){clearTimeout(codaTimer);delete root.dataset.tourCoda;}
 function startCoda(delay:number){
  cancelCoda();
  if(destroyed||replaying||coda||phoneMissing)return;
  root.dataset.tourCoda='waiting';
  codaTimer=setTimeout(()=>{
   if(destroyed||replaying||coda||phoneMissing||tourInProgress(state.onboarding)){cancelCoda();return;}
   // Only at a calm moment: in the World overview, Fox idle and saying nothing else, no card open.
   if(!calm()){startCoda(CODA_RETRY);return;}
   cancelCoda();coda=true;step=STEPS.findIndex(s=>s.key==='phone');show();lock.refresh();
  },delay);
 }
 const calm=()=>overview()&&!view.busy&&!view.pageOpen&&root.dataset.attentionPreview!=='true'&&['','first-value','world-tour'].includes(view.guideSource||'');
 function endCoda(){
  if(!coda)return;
  coda=false;leave();view.setGuide(null);lock.refresh();
 }
 function show(){
  if(destroyed||!active())return;
  const current=STEPS[step];
  introduce(!!current.center);
  arrive();
  root.dataset.tourStep=current.key;
  const text=current.text();shown=current.key+':'+text;
  const body=current.body?.();
  const actions=current.actions?.()||[button('Continue',next)];
  view.setGuide({source:'world-tour',takeover:false,text,...body?{body}:{},actions});
  view.revealGuide?.();
  // The phone step waits for a choice in the first run; a replay only tells.
  const tell=current.key==='phone'?replaying:current.tell!==false;
  spotlight.show({target:()=>current.target?.()??null,...tell?{next}:{},...replaying?{exit:stop}:{}});
 }
 // The step survives a restart of this instance, so a transient state never rewinds the tour.
 function start(){if(destroyed||started||coda||!active()||waitingForArrival)return;started=true;checkPhone();show();lock.refresh();}
 const moved=()=>stage().startsWith('first-value')||stage()==='finish';
 // Skip, Esc or the last Continue of a replay: the World is as it was, input included.
 function stop(){
  if(!replaying)return;
  replaying=false;started=false;leave();view.setGuide(null);
  root.dispatchEvent(new CustomEvent('worldlet:world-tour-replay-done'));
  lock.refresh();// The corner's switch, off, is back at once, not at the lock's next frame.
 }
 // The Tutorial switch in the World's corner (tour-lock.ts): on replays, one tour at a time and never over
 // the first run or Fox's work; off skips.
 const coach=createCoachMark();
 const tutorialSwitch=()=>lock.button as HTMLElement|null;
 const offered=()=>state.onboarding?.completed===true&&stage()!=='world-tour'&&!stage().startsWith('first-value')&&!replaying&&!coda;
 function replay(){
  if(destroyed||replaying||started||coda||active()||tourInProgress(state.onboarding))return;
  const entry=tutorialSwitch();
  if(stage().startsWith('first-value')){if(entry){coach.show(entry,'Let’s finish your first task together first. Then I can show you around again.');setTimeout(()=>coach.hide(),5000);}return;}
  if(view.busy){
   // Fox's task keeps going; the tour waits for it rather than taking the screen away.
   deferred=true;if(entry)coach.show(entry,'I’m finishing something for you. I’ll show you around as soon as I’m done.');return;
  }
  deferred=false;coach.hide();
  view.showOverview?.();
  replaying=true;step=0;root.dataset.tourReplay='true';start();
  lock.refresh();// The tour's switch, on, shows with the first step, not at the lock's next poll.
 }
 const idle=()=>{if(deferred&&!view.busy){deferred=false;coach.hide();replay();}};
 // The switch turned off: the first run ends where it is, and the corner's switch stays, off, to turn it on again.
 const overview=()=>!view.current||view.current==='overview';
 const lock=createTourLock(root,{
  locked:()=>!destroyed&&overview()&&root.dataset.onboarding!=='true'&&(replaying||tourInProgress(state.onboarding)),
  // The switch comes in with Fox's hello, never ahead of it during the arrival and the welcome (owner request 2026-10-06).
  skippable:()=>!destroyed&&!waitingForArrival&&(replaying||coda||tourInProgress(state.onboarding)),
  offered:()=>!destroyed&&offered(),
  turnOn:()=>replay(),
  turnOff:()=>skip(),
 });
 function skip(){
  if(replaying){stop();return;}
  // On the phone, the last step, the first run is already finished: the switch just closes it.
  if(coda){endCoda();return;}
  if(!tourInProgress(state.onboarding))return;
  cancelCoda();
  // The step of the README's eight it was skipped on, by its number before the tour was shortened (owner decision
  // 2026-10-10), so `tour_step` keeps its meaning: hello 1, Applets 3, Attention Center 4 here (2, Fox's introduction, is
  // gone), 5–7 in first value (8, the phone, comes after).
  const stage=String(state.onboarding?.journeyStage||''),at=stage==='world-tour'?TOUR_STEP[STEPS[step].key]:stage==='first-value'?5:stage==='first-value-review'?6:7;
  window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event:'tour_skipped',dimensions:{tour_step:String(at)}}}));
  skipped=true;
  if(started){leave();started=false;}
  state={...state,onboarding:{...state.onboarding,journeyStage:'finish',journeyItemId:undefined}};
  view.setGuide(null);
  root.dispatchEvent(new CustomEvent('worldlet:tour-skipped'));
  lock.refresh();
  void call('onboarding',{operation:'journey',stage:'finish'}).catch(()=>{});
  // The corner's switch is where the tour can be reopened; say so once, on the switch itself.
  requestAnimationFrame(()=>{const entry=tutorialSwitch();if(!entry||destroyed)return;coach.show(entry,'Turn the tutorial back on here any time.');setTimeout(()=>{if(coach.target===entry&&!deferred)coach.hide();},5000);});
 }
 window.addEventListener('worldlet:fox-idle',idle);
 // First value ended the tour with nothing to do together yet (first-value.ts): the World is free at once.
 const firstValueEnded=()=>{if(destroyed||!tourInProgress(state.onboarding))return;skipped=true;state={...state,onboarding:{...state.onboarding,journeyStage:'finish'}};lock.refresh();startCoda(CODA_AFTER_END);};
 root.addEventListener('worldlet:first-value-ended',firstValueEnded);
 // The first win (first-value.ts): the phone comes a couple of minutes later, at a calm moment, never right after the fireworks.
 const firstWin=()=>{
  if(destroyed)return;
  // First value saved the finished journey before celebrating; a snapshot from before it must not restart the tour.
  if(tourInProgress(state.onboarding)){skipped=true;state={...state,onboarding:{...state.onboarding,journeyStage:'finish'}};lock.refresh();}
  startCoda(codaAfterWin(state));
 };
 root.addEventListener('worldlet:first-win',firstWin);
 // A restart straight into first value never runs this half's start, so ask about the phone now.
 if(tourInProgress(initial.onboarding))checkPhone();
 const arrived=()=>{waitingForArrival=false;clearTimeout(timer);timer=setTimeout(start,600);};
 root.addEventListener('worldlet:celebration-done',arrived);
 if(!arriving)timer=setTimeout(start,2000);
 // Something else in front (a place opened another way, a reply) lifts the spotlight; back in the overview
 // the tour shows the same step again, with its text brought up to date.
 const watch=setInterval(()=>{
  if(destroyed||!started&&!coda||!active())return;
  if(view.busy||root.dataset.attentionPreview==='true'||view.current&&view.current!=='overview'||!['','world-tour'].includes(view.guideSource)&&!spotlight.active){spotlight.hide();return;}
  const current=STEPS[step];
  if(view.guideSource!=='world-tour'||!spotlight.active||current.key+':'+current.text()!==shown)show();
 },1500);
 return {
  update(next){
   // A snapshot from before the skip was saved must not start the tour again.
   if(skipped&&tourInProgress(next.onboarding))next={...next,onboarding:{...next.onboarding,journeyStage:'finish'}};else if(skipped)skipped=false;
   state=next;if(replaying)return;if(moved()){if(started){leave();started=false;}return;}if(active()&&!started)start();},
  replay,
  get replaying(){return replaying;},
  destroy(){destroyed=true;clearTimeout(timer);cancelCoda();clearInterval(watch);leave();spotlight.destroy();coach.destroy();lock.destroy();root.removeEventListener('worldlet:celebration-done',arrived);root.removeEventListener('worldlet:first-value-ended',firstValueEnded);root.removeEventListener('worldlet:first-win',firstWin);window.removeEventListener('worldlet:fox-idle',idle);window.removeEventListener('worldlet:phone-status',onPhoneStatus);},
 };
}
