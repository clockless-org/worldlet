import {connectionLive,getApp} from '../../context/applets/index.ts';
import {tourInProgress} from '../../core/onboarding/index.ts';
import {appletBox,createCoachMark,createTourSpotlight,elementBox} from './tour-spotlight.ts';
import {createTourLock} from './tour-lock.ts';
import {pairingQR} from '../companion/index.ts';
import {phoneApps} from '../distribution/index.ts';

/** The first half of the first-run tour (owner design 2026-10-02, ui/onboarding/README.md), in the order the owner set on
 * 2026-10-11 ("进入世界后，按照下面这个顺序做引导和介绍"): once the welcome celebration ends,
 * 1. hello: Fox, boxed where it always stands, says we finally meet, this is our new World, and everything the person had
 *    came along (conversations, memory and skills in Fox, past days in the Journal);
 * 2. attention: the Attention Center in the top-left corner, with what Fox already pulled out of those conversations;
 * 3. applets: the Applets in the middle. What is used in them is kept as history and Fox remembers it (owner request
 *    2026-10-11), and with Mail not connected yet the step offers to connect it;
 * 4. dock: what Fox is doing now and the Routines, beside Fox;
 * 5. fox: back to Fox, where every setting lives (Agent beside it), and the phone: first a code to get the app, then the
 *    pairing code (owner request 2026-10-11: "二维码配对，而且让人得先能下载这个下载手机 app").
 * A spotlight keeps the person on the step, and until the whole first run is over (this half and first value) nothing
 * else in the World responds (tour-lock.ts, owner request 2026-10-04). Steps that only tell move on with Continue or a
 * click anywhere; a step with a choice (Connect Mail, the phone) waits for it. It resumes from the persisted journey
 * stage and hands over to first value (first-value.ts), where the person gives Fox one thing to do.
 *
 * The Tutorial switch in the window's bottom-right corner (owner Order 2026-10-07, tour-lock.ts) is on while
 * the tour runs; turning it off skips (owner requests 2026-10-04 and 2026-10-05) and ends the first run at
 * any step: the journey finishes, the World is free, and the switch goes.
 *
 * Replay (#1327): once the first run is over, Show the tutorial in Settings › Help (owner request 2026-10-11:
 * Tutorial and Feedback go back into Settings; it asks with `worldlet:tutorial-replay` on the World) shows the
 * same steps again on demand. A replay only tells: it never moves the journey stage and never connects or pairs
 * anything; turning the switch off (and Esc) end it. While Fox is working it waits and says so, and starts once Fox is
 * idle. */
type Box=ReturnType<typeof elementBox>;
const MAIL='app-gmail',RUNNING=['reading','syncing','connecting'];
/** `connectApplet` opens an Applet's connection (world-onboarding.ts), for the Applets step's Connect Mail. */
export function mountWorldTour({root,view,call,state:initial,arriving=false,connectApplet=(_key:string)=>{}}:{root:HTMLElement,view:any,call:(action:string,body?:object)=>Promise<any>,state:any,arriving?:boolean,connectApplet?:(key:string)=>unknown}){
 let state=initial,step=0,started=false,replaying=false,skipped=false,deferred=false,destroyed=false,waitingForArrival=arriving,shown='',timer:ReturnType<typeof setTimeout>|undefined;
 const spotlight=createTourSpotlight(root);
 const stage=()=>String(state.onboarding?.journeyStage||'');
 const active=()=>replaying||stage()==='world-tour';
 // Choices are underlined words in Fox's bubble (owner feedback 2026-10-06); a second choice (Not now) is muted beside the main one.
 const button=(label:string,run:()=>unknown,quiet=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.className=quiet?'world-tour-quiet':'world-tour-primary';b.onclick=()=>void run();return b;};
 const modules=()=>((root as any).sceneMetrics?.modules||[]).filter((m:any)=>m.visible!==false&&m.unlocked!==false);
 // Mail, when it is in the World and not connected yet (by the person's Agent or by the World): the Applets step offers
 // to connect it (owner request 2026-10-11: "引导它连接 Mail"). A replay never connects anything.
 const mailInWorld=()=>modules().some((m:any)=>m.id===MAIL);
 const mailLive=()=>(state.connections||[]).some((c:any)=>c?.provider==='gmail'&&connectionLive(c));
 const offerMail=()=>!replaying&&mailInWorld()&&!mailLive();
 // The Applet to show: Mail when it is offered, else one whose lights are on, else Mail, else the first one in the World.
 function applet():{id:string,title:string,running:boolean}|null {
  const list=modules();
  const busy=offerMail()&&list.find((m:any)=>m.id===MAIL)||list.find((m:any)=>RUNNING.includes(m.presentation?.phase))||list.find((m:any)=>m.id===MAIL)||list[0];
  return busy?{id:busy.id,title:getApp(busy.id)?.title||'This Thing',running:RUNNING.includes(busy.presentation?.phase)}:null;
 }
 function connectMail(){try{connectApplet('gmail');}catch{}next();}
 // What the Attention Center shows now: its rows (what needs the person, and what they keep talking about with their
 // Agent), and the first one's title, so the step can name what Fox already pulled out (owner request 2026-10-11).
 function attentionNow():{count:number,first:string}{
  const rows=[...root.querySelectorAll<HTMLElement>('.world-task-tracker .world-matter[data-world-item-id],.world-task-tracker .world-ongoing[data-ongoing]')].filter(row=>row.getClientRects().length);
  const items=state.worldItems||[],themes=view.ongoingProposals?.()||[];
  const title=(row:HTMLElement)=>String(row.dataset.worldItemId?items.find((i:any)=>i.id===row.dataset.worldItemId)?.title||'':themes.find((t:any)=>t.id===row.dataset.ongoing)?.title||'').trim();
  return {count:rows.length,first:rows.map(title).find(Boolean)||''};
 }
 // Phone pairing (core/phone/README.md): the host owns it (`phonePair`) and reports changes as `worldlet:phone-status`.
 // Pairing starts only on I have the app, so a skipped step registers nothing with the relay; a host without phone
 // pairing leaves the phone out of the last step.
 type Phone={state?:'none'|'waiting'|'paired',link?:string,phone?:{name?:string}|null};
 let phone:Phone|null=null,phoneMissing=false,phoneBusy=false;
 let phoneChecked=false;
 const checkPhone=()=>{if(phoneChecked||replaying)return;phoneChecked=true;void Promise.resolve().then(()=>call('phonePair',{operation:'status'})).then((status:Phone)=>{if(status&&typeof status==='object')phone=phone||status;},()=>{phoneMissing=true;if(started&&STEPS[step]?.key==='fox')show();});};
 const phoneState=()=>phone?.state==='paired'?'paired':phone?.state==='waiting'&&phone.link?'waiting':'none';
 const phoneOffered=()=>!replaying&&!phoneMissing;
 const onPhoneStatus=(event:Event)=>{phone=(event as CustomEvent).detail||null;if(started&&STEPS[step]?.key==='fox')show();};
 window.addEventListener('worldlet:phone-status',onPhoneStatus);
 // First the code to get the app, then, once the person has it, the pairing code.
 function phoneCode(){
  const state=phoneState(),link=state==='waiting'?phone.link:state==='none'?phoneApps.find(a=>a.id==='iphone')?.url:null;
  if(!link)return null;
  const box=document.createElement('div');box.className='world-tour-phone';
  const code=document.createElement('div');code.className='world-tour-phone-qr';code.innerHTML=pairingQR(link);code.setAttribute('role','img');
  code.setAttribute('aria-label',state==='waiting'?'Pairing code for the Worldlet phone app':'Code to get the Worldlet iPhone app');
  const caption=document.createElement('small');caption.textContent=state==='waiting'?'Scan in the Worldlet app. Waiting for your phone…':'Scan with your iPhone camera to get the app';
  box.append(code,caption);return box;
 }
 async function pairPhone(){
  if(phoneBusy)return;phoneBusy=true;
  try{phone=await call('phonePair',{operation:'start'});}catch{}finally{phoneBusy=false;}
  if(!destroyed&&STEPS[step].key==='fox')show();
 }
 // Not now ends a code nobody scanned; pairing stays in Settings, under Phone.
 function skipPhone(){if(phoneState()==='waiting')void call('phonePair',{operation:'end'}).catch(()=>{});next();}
 type Step={key:string,text:()=>string,target?:()=>Box,actions?:()=>HTMLElement[],body?:()=>HTMLElement|null,tell?:()=>boolean,center?:boolean};
 const STEPS:Step[]=[
  // 1. Fox, in its own lit ring: we finally meet, and nothing the person had was left behind.
  {key:'hello',text:()=>
   'We finally meet! This is our new **World**. Nothing you had was left behind: our past conversations, your memory and skills came with me, and your past days are kept in your **Journal**, up in the corner.'},
  // 2. The Attention Center, top left, with what Fox already pulled out of the person's conversations.
  {key:'attention',center:true,target:()=>elementBox(root,'.world-task-tracker'),text:()=>{
   const {count,first}=attentionNow();
   const what='Up here is your **Attention Center**. I keep everything that needs you here: what’s coming up, what’s worth doing and what’s worth knowing.';
   if(count&&!replaying)return `${what} From what you’ve been doing, I already pulled out **${count===1?'one thing':count+' things'}**${first?`, like **${first}**`:''}.`;
   // Nothing yet: with nothing connected nothing will arrive but the Agent's conversations, so the step says what fills it.
   return (state.connections||[]).some(connectionLive)||replaying?`${what} Pick anything, and I’ll show you how I can take care of it.`:`${what} It fills up as I read your conversations, and your mail once it’s connected.`;
  }},
  // 3. The Applets in the middle: real apps, kept as history Fox remembers (owner request 2026-10-11), and Mail to connect.
  {key:'applets',tell:()=>!offerMail(),target:()=>{const a=applet();return a?appletBox(root,a.id):null;},text:()=>{
   const a=applet(),history=' Everything you do in them is kept as history, and I remember it, so I can help whenever one is open.';
   // The word the step teaches and the Applet's name are bold (owner feedback 2026-10-06).
   if(!a)return 'In the middle are your **Things**. Each one is a real app you can open and use right here.'+history;
   if(offerMail())return `In the middle are your **Things**, real apps you use right here, like **${a.title}**.${history} Connect your mail, and I’ll keep an eye on it for you.`;
   return a.running?`In the middle are your **Things**, like **${a.title}**. See its lights blinking? It’s working for you right now${a.id===MAIL?', collecting your new mail':''}.${history}`
    :`In the middle are your **Things**, like **${a.title}**. Each one is a real app you can open and use right here.${history}`;
  },actions:()=>offerMail()?[button('Later',next,true),button('Connect Mail',connectMail)]:[button('Continue',next)]},
  // 4. The dock beside Fox: what Fox is doing now, and the Routines (owner layout 2026-10-11).
  {key:'dock',target:()=>elementBox(root,'.task-panel:not([hidden])')||elementBox(root,'.companion-pet .companion-avatar'),text:()=>
   'Beside me is what I’m doing for you. Tasks I’m working on show up here as I go, and your **Scheduled** tasks wait their turn: I prepare your day every morning and wrap it up every evening. You can change them any time.'},
  // 5. Back to Fox: every setting lives here, and the phone, first the app, then the pairing code. It waits for a choice.
  {key:'fox',tell:()=>!phoneOffered()||phoneState()==='paired',target:()=>elementBox(root,'.companion-pet .companion-side'),body:()=>phoneOffered()?phoneCode():null,text:()=>{
   const settings='Everything about me is set up here: **Agent** opens your settings, your model, memory, skills, Scheduled tasks and connections.';
   if(!phoneOffered())return `${settings} You can also use me on your **phone**: pair it any time under **Phone**.`;
   const state=phoneState();
   if(state==='paired')return `${settings} And you’re all set: ${phone.phone?.name?phone.phone.name+' is':'your phone is'} paired, so your Attention Center and I are on your **phone** too.`;
   if(state==='waiting')return 'Now open Worldlet on your **phone** and scan this code. It’s end-to-end encrypted, so only your phone and this computer can read what passes between them.';
   const android=phoneApps.find(a=>a.id==='android')?.url;
   return `${settings} Let’s put me on your **phone** too. First get the app: scan this with your iPhone camera${android?', or find Worldlet on Google Play':' (Android is coming soon)'}. Once you have it, I’ll show you the code to pair it.`;
  },
   actions:()=>{if(!phoneOffered())return [button('Continue',next)];const state=phoneState();return state==='paired'?[button('Continue',next)]:state==='waiting'?[button('Not now',skipPhone,true)]:[button('Not now',skipPhone,true),button('I have the app',()=>void pairPhone())];}},
 ];
 // `tour_skipped`'s step (core/diagnostics/ANALYTICS.md): the five steps here, 6–8 in first value.
 const TOUR_STEP:Record<string,number>={hello:1,attention:2,applets:3,dock:4,fox:5};
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
 // Each step in order; after the last one the first run hands over to first value.
 function next(){if(step<STEPS.length-1){step++;show();}else void finish();}
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
  // A step with a choice (Connect Mail, the phone) waits for it in the first run; a replay only tells.
  const tell=replaying||(current.tell?.()??true);
  spotlight.show({target:()=>current.target?.()??null,...tell?{next}:{},...replaying?{exit:stop}:{}});
 }
 // The step survives a restart of this instance, so a transient state never rewinds the tour.
 function start(){if(destroyed||started||!active()||waitingForArrival)return;started=true;checkPhone();show();lock.refresh();}
 const moved=()=>stage().startsWith('first-value')||stage()==='finish';
 // Skip, Esc or the last Continue of a replay: the World is as it was, input included.
 function stop(){
  if(!replaying)return;
  replaying=false;started=false;leave();view.setGuide(null);
  root.dispatchEvent(new CustomEvent('worldlet:world-tour-replay-done'));
  lock.refresh();// The tour's switch goes at once, not at the lock's next frame.
 }
 // Show the tutorial in Settings › Help replays, one tour at a time and never over the first run or Fox's work; the
 // tour's switch (tour-lock.ts), turned off, skips. Fox's notes about it point at Settings beside Fox.
 const coach=createCoachMark();
 const settingsEntry=()=>root.querySelector('.companion-side .companion-panel-button') as HTMLElement|null;
 function replay(){
  if(destroyed||replaying||started||active()||tourInProgress(state.onboarding))return;
  const entry=settingsEntry();
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
 // The switch turned off: the first run ends where it is; Settings › Help shows the tour again.
 const overview=()=>!view.current||view.current==='overview';
 const lock=createTourLock(root,{
  locked:()=>!destroyed&&overview()&&root.dataset.onboarding!=='true'&&(replaying||tourInProgress(state.onboarding)),
  // The switch comes in with Fox's hello, never ahead of it during the arrival and the welcome (owner request 2026-10-06).
  skippable:()=>!destroyed&&!waitingForArrival&&(replaying||tourInProgress(state.onboarding)),
  turnOff:()=>skip(),
 });
 function skip(){
  if(replaying){stop();return;}
  if(!tourInProgress(state.onboarding))return;
  // The step of the README's eight it was skipped on: 1–5 here, 6–8 in first value.
  const stage=String(state.onboarding?.journeyStage||''),at=stage==='world-tour'?TOUR_STEP[STEPS[step].key]:stage==='first-value'?6:stage==='first-value-review'?7:8;
  window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event:'tour_skipped',dimensions:{tour_step:String(at)}}}));
  skipped=true;
  if(started){leave();started=false;}
  state={...state,onboarding:{...state.onboarding,journeyStage:'finish',journeyItemId:undefined}};
  view.setGuide(null);
  root.dispatchEvent(new CustomEvent('worldlet:tour-skipped'));
  lock.refresh();
  void call('onboarding',{operation:'journey',stage:'finish'}).catch(()=>{});
  // Settings is where the tour can be shown again; say so once, beside it.
  requestAnimationFrame(()=>{const entry=settingsEntry();if(!entry||destroyed)return;coach.show(entry,'Turn the tutorial back on in Settings › Help any time.');setTimeout(()=>{if(coach.target===entry&&!deferred)coach.hide();},5000);});
 }
 window.addEventListener('worldlet:fox-idle',idle);
 root.addEventListener('worldlet:tutorial-replay',replay);
 // First value ended the tour with nothing to do together yet (first-value.ts): the World is free at once.
 const firstValueEnded=()=>{if(destroyed||!tourInProgress(state.onboarding))return;skipped=true;state={...state,onboarding:{...state.onboarding,journeyStage:'finish'}};lock.refresh();};
 root.addEventListener('worldlet:first-value-ended',firstValueEnded);
 // The first win (first-value.ts) ends the first run.
 const firstWin=()=>{
  if(destroyed)return;
  // First value saved the finished journey before celebrating; a snapshot from before it must not restart the tour.
  if(tourInProgress(state.onboarding)){skipped=true;state={...state,onboarding:{...state.onboarding,journeyStage:'finish'}};lock.refresh();}
 };
 root.addEventListener('worldlet:first-win',firstWin);
 const arrived=()=>{waitingForArrival=false;clearTimeout(timer);timer=setTimeout(start,600);};
 root.addEventListener('worldlet:celebration-done',arrived);
 if(!arriving)timer=setTimeout(start,2000);
 // Something else in front (a place opened another way, a reply) lifts the spotlight; back in the overview
 // the tour shows the same step again, with its text brought up to date.
 const watch=setInterval(()=>{
  if(destroyed||!started||!active())return;
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
  destroy(){destroyed=true;clearTimeout(timer);clearInterval(watch);leave();spotlight.destroy();coach.destroy();lock.destroy();root.removeEventListener('worldlet:celebration-done',arrived);root.removeEventListener('worldlet:first-value-ended',firstValueEnded);root.removeEventListener('worldlet:first-win',firstWin);root.removeEventListener('worldlet:tutorial-replay',replay);window.removeEventListener('worldlet:fox-idle',idle);window.removeEventListener('worldlet:phone-status',onPhoneStatus);},
 };
}
