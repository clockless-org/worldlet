import {ACTIVE_THEME} from '../themes/index.ts';
import {firstWinCandidate} from '../onboarding/index.ts';
import {mountCompanionLife} from './companion-life.ts';
import {companionPosition} from './companion-position.ts';
import {uiIcon} from '../components/index.ts';
import {mountCompanionInfo} from './companion-info.ts';
import {watchWorldEnergy} from './world-energy.ts';
import {mountAppletTaskResults} from './applet-task-results.ts';
import {mountFoxProactive} from './fox-proactive.ts';
import {isDesktopCompanion,requireWorldSurface} from './world-surface.ts';
import {isRequestCancellation,reportEngagement} from '../shell/index.ts';
import {contextThread,cleanRecall,FOX_MAIN_THREAD,restoredMainHistory} from '../attention/index.ts';
import {foxVisibleText,guidedVisibleText} from './fox-visible-text.ts';
import {modelFailure} from './model-failure.ts';
import {FOX_WORKING} from './fox-doing.ts';
import {mountFoxNameTag} from './fox-name-tag.ts';
import type {FoxActivitySignal} from '../../contracts/companion-activity.ts';
import {worldNow} from '../shell/index.ts';
import {foxGreeting} from './fox-greeting.ts';
import {THREAD_ROW,renderThreadCards,threadTopicKey,showQuestion,restoreThread,segmentOf,threadCards,threadFinish,threadInterrupt,threadLine,threadRow,threadStart,threadStep,threadSteer,threadUsage,workingText,type ThreadEntry} from './fox-thread.ts';
// Optional model-authored drafts; malformed metadata never becomes an action.
export function parseSuggestedReplies(value){
 const raw=String(value||''),start=raw.lastIndexOf('<worldlet-replies>');if(start<0)return {text:raw,suggestions:[]};
 let suggestions=[];try{const match=raw.slice(start).match(/^<worldlet-replies>([\s\S]*?)<\/worldlet-replies>\s*$/),items=match&&JSON.parse(match[1]);if(Array.isArray(items))suggestions=[...new Set(items.filter(s=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=48&&!/[\r\n<>]/.test(s)).map(s=>s.trim()))].slice(0,2);}catch{}
 return {text:raw.slice(0,start).trimEnd(),suggestions};
}
import {replyMarkdown} from './reply-markdown.ts';
import {replyActionIdentity} from './reply-actions.ts';
import {viewMode} from '../components/index.ts';
import {rememberSpeechLanguage} from './speech-language.ts';
import {mountMicrophonePicker} from './microphone-picker.ts';
import {createFoxTalk} from './fox-talk.ts';
import {mountCompanionPortrait} from './companion-portrait.ts';
import {foxTrace} from './fox-performance.ts';
import {ORDER,ORDER_FEEDBACK,ORDER_LOG} from '../../core/distribution/index.ts';
import {harnessUsageLabel} from '../../core/agent/index.ts';

export function createNativeChat(call){return function({button,input,status,execute,chatRoute,steering=false,holdToSpeak=false,replyActions=false,resolveReplyLink,onReplyNavigate,greetingContext,recallStorage=null,onSpokenReply=null,talkVoice=null}){
  const root=button.closest('.notion-world'),form=button.closest('form'),hud=form.parentElement;
 const make=(tag: string,cls?: string,text?: string): any=>Object.assign(document.createElement(tag),{className:cls,...(text?{textContent:text}:{})});
 root.classList.add('native-console','companion-console','voice-pet-console','radial-pet-console');
 // Viewport tiers follow the window, not the last chat render: a resized window must reveal the tracker again.
 const compact=()=>root.classList.toggle('compact-viewport',root.clientHeight<560);compact();new ResizeObserver(compact).observe(root);
 // Text and speech share the same command path; the fox remains the anchor.
 form.hidden=true;form.inert=true;status.hidden=true;button.remove();
 const dock=make('div','companion-dock');dock.append(hud.querySelector('.notion-shortcuts'));hud.append(dock);
 const avatar=make('button','companion-avatar');avatar.type='button';avatar.setAttribute('aria-controls','companionDialogue');

 const pet=make('div','companion-pet'),state=make('span','companion-listening-state');state.setAttribute('role','status');pet.append(avatar,state);
 // The name tag at Fox's feet: the name at rest, what Fox is doing while it works (fox-name-tag.ts).
 const nameTag=mountFoxNameTag(pet,()=>focusInput());
 // The buttons beside Fox stand in one row on its left, each an icon with its name (owner request
 // 2026-10-05). Settings opens Settings directly (owner Order 2026-10-07; the tutorial's switch is in
 // the World's top-right corner, ui/onboarding/tour-lock.ts); Fox itself is a way to talk, like the message bar (owner feedback 2026-10-04).
 const side=make('div','companion-side');
 // The Journal is the World's top-left corner, today's date at the head of the Attention Center (owner request
 // 2026-10-08: "journal 下面的那个按钮就不用了…收到左上角"), so Fox keeps only Settings beside it, which steps aside
 // inside an Applet (controls.css).
 const panelButton=make('button','companion-panel-button fox-side-button');panelButton.type='button';panelButton.innerHTML=uiIcon('settings')+'<span>Settings</span>';
 panelButton.addEventListener('pointerdown',e=>e.stopPropagation());
 panelButton.onclick=e=>{e.stopPropagation();if(root.dataset.tourLock!=='true'&&root.dataset.tourSpotlight!=='true')openPanel();};
 side.append(panelButton);pet.append(side);hud.append(pet);
 // Fox's left is one column, centered on Fox, with Fox's own buttons under the left actions of the
 // dock (World and the like): at most three a side (owner request 2026-10-05). The two live in
 // different places, so each moves by half the other's height (controls.css).
 let stackFrame=0;
 const countStack=()=>{stackFrame=0;
  const shown=(list:Iterable<Element>)=>[...list].filter(e=>(e as HTMLElement).offsetParent!==null).length;
  root.style.setProperty('--fox-wing-n',String(shown(hud.querySelectorAll('.fox-action-left>*'))));
  root.style.setProperty('--fox-side-n',String(shown(side.children)));
 };
 const restack=()=>{if(!stackFrame)stackFrame=requestAnimationFrame(countStack);};
 new MutationObserver(restack).observe(hud,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
 new MutationObserver(restack).observe(root,{attributes:true,attributeFilter:['class','data-entry-expanded','data-depth','data-detail-open']});mountCompanionPortrait(avatar,{bust:root.classList.contains('fox-first-console')});
 // Order and Feedback (core/distribution/order.ts): one round bug button standing on its own just left of Fox's message
 // bar (owner request 2026-10-06; kept there 2026-10-07) on every channel. In the Alpha and Dev apps on a computer
 // enrolled with the admin service it is Order: a click (or ⌘B / Ctrl+B) starts Fox's voice mode (the button turns red;
 // nothing is captured before the click); what is said then goes to the owner's Claude project as a task, with pictures
 // of the window and the recent operation log. A second click finishes early. Nothing else on screen changes while it
 // listens (owner Order 2026-10-07): the bar, Fox's card and its buttons stay as they were, and the button alone shows
 // listening, then a spinner until it is sent; Fox then says how it went. Everywhere else (Beta, Production, a computer
 // that cannot send Orders) it is Feedback (owner 2026-10-07): it opens Fox's Feedback page, whose message goes to the
 // admin service with the app version only, and the hourly report collects it; never to Claude as an Order.
 const orderButton=make('button','companion-order-button');orderButton.type='button';orderButton.innerHTML=uiIcon('bug');
 orderButton.addEventListener('pointerdown',e=>e.stopPropagation());
 let orderMode:'order'|'feedback'='feedback';
 const setOrderMode=(mode:'order'|'feedback')=>{orderMode=mode;orderButton.dataset.mode=mode;orderButton.title=mode==='order'?ORDER.hint:ORDER_FEEDBACK.hint;orderButton.setAttribute('aria-label',mode==='order'?ORDER.name:ORDER_FEEDBACK.name);};
 setOrderMode('feedback');
 let ordering=false;
 const orderStatus=()=>call('order',{operation:'status'}).then(r=>setOrderMode(r?.available&&r.ready?'order':'feedback'),()=>setOrderMode('feedback'));
 void orderStatus();window.addEventListener('worldlet:app-update',()=>void orderStatus());
 const endOrder=()=>{ordering=false;delete root.dataset.order;orderButton.removeAttribute('aria-pressed');orderButton.removeAttribute('aria-busy');};
 const orderSending=()=>{root.dataset.order='sending';orderButton.setAttribute('aria-busy','true');renderEntry();};
 orderButton.onclick=e=>{
  e.stopPropagation();
  if(orderMode==='feedback'&&!ordering){window.dispatchEvent(new CustomEvent('worldlet:companion-info',{detail:{tab:'Feedback'}}));return;}
  if(ordering){if(root.dataset.order==='listening'&&(recording||starting)){orderSending();void finishSpeech();}return;}
  if(recording||starting||transcribing)return;
  ordering=true;root.dataset.order='listening';orderButton.setAttribute('aria-pressed','true');
  void beginSpeech(false,'order').then(()=>{if(ordering&&!recording&&!starting&&!transcribing)endOrder();});
 };
 // Why an Order ended without being sent, as one allowlisted bucket for product analytics (order_stopped); never the words.
 const orderStopped=(reason:string)=>{void call('order',{operation:'stopped',reason}).catch(()=>{});};
 const ORDER_STOPPED='The Order stopped before it was sent, so nothing reached Claude. Click the bug to try again.';
 async function sendOrder(said:string){
  if(!said.trim()){endOrder();orderStopped('no_speech');say('I didn’t catch a task. Click the button to try again.');return;}
  orderSending();
  try{await placeOrder(said,[root.querySelector('.companion-context .companion-name')?.textContent?.trim(),decodeURIComponent(location.hash.slice(1))].filter(Boolean).join(' · '));}
  finally{endOrder();}
 }
 // Sends one Order and has Fox say how it went; the paired phone's Order button (place `Phone`) comes here too.
 async function placeOrder(said:string,place:string){
  const id=Array.from(crypto.getRandomValues(new Uint8Array(4)),b=>b.toString(16).padStart(2,'0')).join('');
  // The pictures are taken now, before Fox answers over the window.
  try{const r=await call('order',{operation:'send',id,said,place}),n=r?.sent?.screenshots||0;const words=`“${said.trim()}”`,extras=r?.sent?.id?` with ${n} screenshot${n===1?'':'s'} and the last ${ORDER_LOG.minutes} minutes of steps`:'';
   // Never a quiet fallback: when the instant post failed, Fox says so and why (the hourly report still claims it).
  // Fox repeats every word that was sent, so a long Order never reads as cut off (owner 2026-10-07: 「它会截断我的字数」).
   say(r?.sent?.woke?`Order sent to Claude: ${words}${extras}.`:`Order NOT sent to Claude right away (${r?.sent?.wakeError||'Claude Code did not answer'}). It is saved in Gatehouse${extras}, so the hourly report will pick it up: ${words}`);}
  catch(e){say(`${e.message||'The task did not reach Claude.'} What you said: “${said.trim()}”`);}
 }
 const sourceAlert=make('button','companion-source-alert','!');sourceAlert.type='button';sourceAlert.hidden=true;sourceAlert.setAttribute('aria-label','Connection needs your attention');pet.append(sourceAlert);
 let sourceIssues=[];
 root.addEventListener('worldlet:source-issues',(event:any)=>{sourceIssues=event.detail||[];sourceAlert.hidden=!sourceIssues.length;sourceAlert.title=sourceIssues.map(issue=>issue.title+': '+(issue.action==='permissions'?'Allow access':'Reconnect')).join(' · ');});
 sourceAlert.addEventListener('pointerdown',e=>{e.stopPropagation();});
 sourceAlert.onclick=e=>{e.stopPropagation();const actions=sourceIssues.map(issue=>{const action=make('button','',issue.action==='permissions'?'Allow '+issue.title+' access':'Reconnect '+issue.title);action.type='button';action.onclick=issue.run;return action;});api.setGuide({source:'source-access',takeover:true,text:'These connections need your help. Saved items are kept.',actions});api.revealGuide();};
 const life=mountCompanionLife(root,pet,avatar),position=companionPosition(root,hud,avatar);
 // One message bar under Fox (owner decision 2026-10-04, like Claude's composer): click to type, hold to speak,
 // a microphone and Send inside it. Clicking Fox does the same as clicking the bar.
 const entry=make('div','companion-text-entry'),inputState=make('span','companion-input-state');inputState.setAttribute('role','status');const waveform=make('span','companion-input-wave');waveform.setAttribute('aria-hidden','true');for(let i=0;i<17;i++)waveform.append(make('i',''));entry.append(form,inputState,waveform);hud.append(entry);
 const controls=make('div','companion-controls'),speechButton=make('button','companion-speech-button');controls.setAttribute('role','group');controls.setAttribute('aria-label','Companion controls');speechButton.type='button';speechButton.innerHTML=uiIcon('microphone');entry.prepend(controls);controls.append(orderButton);
 // The microphone is the bug's twin on the bar's right, a round button of its own (owner 2026-10-07).
 const voiceControls=make('div','companion-controls companion-voice-controls');voiceControls.setAttribute('role','group');voiceControls.setAttribute('aria-label','Voice');voiceControls.append(speechButton);entry.append(voiceControls);
 form.querySelector('#notionSend')?.classList.add('companion-send-button');
 input.maxLength=3000;input.removeAttribute('placeholder');input.setAttribute('aria-label','Message Fox');
 const send=form.querySelector('#notionSend');send.setAttribute('aria-label','Send message');
 // Send is an icon like the microphone beside it, the same size and style (owner feedback 2026-10-04).
 send.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>';
 // Keep the text cursor and touch keyboard when pressing Send.
 send.addEventListener('pointerdown',e=>{if(e.button===0)e.preventDefault();});
 const panel=make('section','companion-dialogue ui-theme-speech');panel.id='companionDialogue';panel.setAttribute('aria-label','Fox reply');
 const topic=make('span','companion-topic');topic.hidden=true;
 const guideHint=make('span','companion-guide-hint');guideHint.hidden=true;
 // A theme's own companion is called by its id; Village's is Fox.
 const themeName=()=>{const id=ACTIVE_THEME.pack.companion.id;return id==='fox'?'Fox':id[0].toUpperCase()+id.slice(1);};
 let companionName=themeName(),customCompanionName=false;
 const themeNameChanged=()=>{if(!customCompanionName)companionName=themeName();topic.textContent=companionName;topic.title=companionName;panel.setAttribute('aria-label',companionName+' reply');input.setAttribute('aria-label','Message '+companionName);};
 themeNameChanged();
 const log=make('section','native-conversation');log.id='worldConversation';log.setAttribute('role','status');log.setAttribute('aria-label','Current reply');log.setAttribute('aria-live','polite');log.setAttribute('aria-atomic','true');log.tabIndex=0;
 window.addEventListener('worldlet:companion-appearance',(e: any)=>{const requested=String(e.detail?.name||'Fox').trim().slice(0,24);customCompanionName=requested!=='Fox';const name=customCompanionName?requested:themeName();companionName=name;panel.setAttribute('aria-label',name+' reply');input.setAttribute('aria-label','Message '+name);avatar.dataset.requestedPose=e.detail?.expression||'idle';});
 const replyNav=make('nav','companion-reply-nav');replyNav.setAttribute('aria-label','Browse guide pages');
 // Only a guide written as explicit pages (steps) has pages; a turn or a long guide scrolls in one card.
 const previous=make('button','companion-previous','‹'),next=make('button','companion-advance','›');
 previous.type='button';next.type='button';
 previous.setAttribute('aria-label','Previous page');next.setAttribute('aria-label','Next page');
 previous.title='Previous';next.title='Next';
 replyNav.addEventListener('pointerdown',e=>{if(e.button===0&&document.activeElement===input)e.preventDefault();});
 const guideActions=make('div','companion-guide-actions');guideActions.hidden=true;
 const actionFooter=make('div','companion-action-footer');actionFooter.hidden=true;actionFooter.setAttribute('aria-label','Recommended actions');
 const attentionActions=make('div','companion-attention-actions');attentionActions.hidden=true;
 // Browse with me | Don't bother (owner request 2026-10-08): whether Fox chimes in now and then while the person
 // looks at an Applet or page (fox-proactive.ts). It sits in Fox's card under each such line, and on every card in
 // an Applet while Don't bother holds, so it can be turned back on where it was turned off. The host keeps the choice.
 const browseSwitch=make('div','companion-browse');browseSwitch.setAttribute('role','group');browseSwitch.setAttribute('aria-label','Fox while you browse');browseSwitch.hidden=true;
 const browseOn=make('button','','Browse with me'),browseOff=make('button','','Don’t bother');browseOn.type=browseOff.type='button';
 browseOn.title='Fox says a word now and then about the Applet or page you are looking at';browseOff.title='Fox stays quiet until you talk to it';
 browseSwitch.append(browseOn,browseOff);
 let browsing:boolean|null=null;
 const showBrowse=(on:unknown)=>{if(typeof on!=='boolean')return;browsing=on;browseOn.setAttribute('aria-pressed',String(on));browseOff.setAttribute('aria-pressed',String(!on));scheduleRender();};
 const chooseBrowse=(on:boolean)=>(e:Event)=>{e.stopPropagation();if(browsing===on)return;showBrowse(on);void call('foxBrowse',{on}).then(r=>showBrowse(r?.on),()=>showBrowse(!on));};
 browseOn.onclick=chooseBrowse(true);browseOff.onclick=chooseBrowse(false);
 browseSwitch.addEventListener('pointerdown',e=>e.stopPropagation());
 window.addEventListener('worldlet:fox-browse',(e:any)=>showBrowse(e.detail?.on));
 const actionBar=make('div','companion-action-bar');actionBar.append(browseSwitch,guideActions,actionFooter,attentionActions);
 const guideContent=make('div','companion-guide-content');guideContent.hidden=true;
 // The arrows sit on the corner of the world, but they stay part of the bubble in
 // the DOM. Moving them out took them out of every rule written about what belongs
 // to Fox's speech -- the dismissal exemption above all -- and paging a guide
 // forward deleted it mid-sentence. Where a control is drawn and what it belongs
 // to are different questions; CSS answers the first one.
 // The front card shows the question it answers above the answer.
 const asked=make('p','companion-asked');asked.hidden=true;
 // A long answer scrolls inside its card (owner feedback 2026-10-04: no Show more). A small
 // down arrow at its foot says there is more below; it leaves once the end is in view.
 const scrollHint=make('span','companion-scroll-hint');scrollHint.setAttribute('aria-hidden','true');scrollHint.hidden=true;
 function markLogScroll(){const more=log.dataset.scrollable==='true'&&log.scrollHeight-log.clientHeight-log.scrollTop>2;log.dataset.more=String(more);scrollHint.hidden=!more;}
 log.addEventListener('scroll',markLogScroll,{passive:true});
 // A clear handle for the earlier turns: it says how many wait above and folds them again.
 const earlierButton=make('button','companion-earlier');earlierButton.type='button';earlierButton.hidden=true;
 // Earlier cards rise as one bounded reading surface; folding sinks them back
 // before the column closes. A second toggle can reverse either transition.
 let folding=false,threadAnimation:Animation|null=null;
 function cancelThreadMotion(){const run=threadAnimation;threadAnimation=null;folding=false;run?.cancel();}
 function toggleThread(open=folding||!expanded){
  const current=threadAnimation?{transform:getComputedStyle(threadList).transform,opacity:getComputedStyle(threadList).opacity}:null;
  cancelThreadMotion();
  const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animate=!still&&threadList.childElementCount>0;
  folding=!open&&expanded&&animate&&!threadList.hidden;
  if(!folding)expanded=open;
  if(open){peeking=true;preview=true;}
  render();
  if(!animate||threadList.hidden)return;
  // Move the bounded reading surface, not every archived card. Duration and travel
  // stay constant for 2 or 120 turns, and reversing starts at the displayed frame.
  const folded={transform:'translateY(24px)',opacity:0},unfolded={transform:'translateY(0)',opacity:1};
  const run=threadList.animate([current||(open?folded:unfolded),open?unfolded:folded],{duration:open?280:200,easing:'cubic-bezier(.2,.7,.3,1)',fill:'both'});
  threadAnimation=run;
  run.finished.then(()=>{
   if(threadAnimation!==run)return;
   threadAnimation=null;folding=false;
   if(!open){expanded=false;render();}
   run.cancel();
  }).catch(()=>{});
 }
 earlierButton.onclick=e=>{e.stopPropagation();toggleThread();};
 replyNav.append(previous,next);panel.append(topic,earlierButton,guideHint,asked,log,scrollHint,guideContent,actionBar,replyNav);hud.prepend(panel);
 // One card per turn. Earlier turns are separate cards stacked above the front card, newest
 // nearest, clipped cleanly at the top. Beside an Applet the tall column shows them unless folded; in
 // the world they wait behind the front card as a deck until expanded. Only this place's
 // turns show; a turn still running in another place shows as a chip.
 // The deck is one card edge, however many turns wait: two cards in all (owner Order 2026-10-07: the stack was too busy).
 const deck=make('div','companion-deck');deck.setAttribute('aria-hidden','true');deck.hidden=true;deck.append(make('i'));panel.append(deck);
 const threadStack=make('div','companion-thread'),threadRunning=make('p','companion-thread-running'),threadAgent=make('p','companion-thread-agent'),threadList=make('div','companion-thread-list'),threadUsed=make('p','companion-thread-usage');
 threadRunning.setAttribute('role','status');threadStack.hidden=true;threadList.setAttribute('aria-label','Earlier turns');
 threadList.id='companionEarlierTurns';earlierButton.setAttribute('aria-controls',threadList.id);
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',event=>{
  if(!event.matches)return;
  const close=folding;cancelThreadMotion();if(close)expanded=false;render();
 });
 // Beside an Applet the column can fold to its front card, the earlier cards waiting behind it
 // as a deck. The choice is a local UI preference of this profile, like Fox's position; default open.
 const FOLD_KEY='worldlet.companion.chat-folded';
 let chatFolded=false;try{chatFolded=localStorage.getItem(FOLD_KEY)==='true';}catch{}
 const foldButton=make('button','companion-fold');foldButton.type='button';foldButton.hidden=true;foldButton.setAttribute('aria-controls',threadList.id);
 const chevron=(up:boolean)=>`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${up?'m6 15 6-6 6 6':'m6 9 6 6 6-6'}"/></svg>`;
 function setChatFolded(value:boolean){
  if(chatFolded===value)return;
  chatFolded=value;try{localStorage.setItem(FOLD_KEY,String(value));}catch{}
  cancelThreadMotion();render();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const motion={duration:value?220:280,easing:'cubic-bezier(.2,.7,.3,1)'};
  // Unfolding rises the earlier cards out of the deck; folding lifts the deck in behind the card.
  if(!value&&!threadList.hidden){const run=threadList.animate([{transform:'translateY(24px)',opacity:0},{transform:'none',opacity:1}],motion);threadAnimation=run;run.finished.then(()=>{if(threadAnimation===run)threadAnimation=null;run.cancel();}).catch(()=>{});}
  else if(value&&!deck.hidden)deck.animate([{transform:'translateY(12px)',opacity:0},{transform:'none',opacity:1}],motion);
 }
 foldButton.onclick=e=>{e.stopPropagation();setChatFolded(!chatFolded);};
 deck.addEventListener('click',e=>{if(deck.dataset.unfold!=='true')return;e.stopPropagation();setChatFolded(false);});
 panel.append(foldButton);
 const threadFoot=make('div','companion-thread-foot');threadFoot.append(threadAgent,threadUsed,threadRunning);threadAgent.hidden=true;
 // Who answers this Applet's thread and why ("Answered by Ledger · bound to this group", fox/harness-agents.ts on the
 // host), when one of the person's other agents is bound there; asked once per place until a binding changes.
 const answeredBy=new Map<string,string>();
 function answeredHere(){
  const key=String(context.key||'');
  if(!key.startsWith('object:app-'))return '';
  if(!answeredBy.has(key)){answeredBy.set(key,'');void Promise.resolve(call('harnessAgents',{operation:'list',applet:key.slice(7)})).then(found=>{const a=found?.answering;if(a&&a.by!=='main'&&found.agents?.length>1){answeredBy.set(key,'Answered by '+a.name+' · '+a.reason);scheduleRender();}},()=>{});}
  return answeredBy.get(key)||'';
 }
 window.addEventListener('worldlet:harness-agents',()=>{answeredBy.clear();scheduleRender();});
 threadStack.append(threadList,threadFoot);panel.append(threadStack);
 threadStack.addEventListener('pointerdown',e=>e.stopPropagation());
 const contextButton=make('div','companion-context'),name=make('span','companion-name');contextButton.append(name);root.append(contextButton);
 let dismissed=false,peeking=false,dismissedGuide=null;
 let hoverInput=false,editing=false,collapseTimer=null,avatarHoldTimer=null,avatarPress=null,avatarSuppressClick=false;
 let speechGeneration=0,finalTimer=null,queuedTurns=[],activeView='';
 let queuedDraft:null|{text:string;turns:any[]}=null;
 input.addEventListener('input',()=>{queuedDraft=null;fitInput();warmThread();});
 // The person opens Fox or starts typing: the place's session in their own Agent opens now, before Send, so the first
 // word does not wait for it (host `agentWarm`; idempotent there, and asked at most once a minute per place here).
 const warmedAt=new Map<string,number>();
 function warmThread(){const place=context.key;if(Date.now()-(warmedAt.get(place)||0)<60_000)return;warmedAt.set(place,Date.now());void Promise.resolve(call('agentWarm',{thread:contextThread(place,'')})).catch(()=>{});}
 // The field grows with the draft up to six lines, then scrolls; Enter sends, Shift-Enter starts a line,
 // and Enter that confirms an input-method candidate is left to the input method.
 function fitInput(collapsed=false){const line=parseFloat(getComputedStyle(input).lineHeight)||21,limit=Math.round(line*6);input.style.height='auto';const height=input.scrollHeight;input.style.height=(input.value&&!collapsed?Math.min(height,limit):line)+'px';input.style.overflowY=height>limit&&!collapsed?'auto':'hidden';const lift=Math.max(0,parseFloat(input.style.height)-line);if(lift)hud.style.setProperty('--companion-entry-lift',lift+'px');else hud.style.removeProperty('--companion-entry-lift');}
 entry.addEventListener('transitionend',e=>{if(e.target===form&&e.propertyName==='width')fitInput(!editing||recording||starting||transcribing);});
 input.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.keyCode===229)return;e.preventDefault();form.requestSubmit();});
 let quietTurn=false,active=false,recording=false,starting=false,transcribing=false,generation=0,preview=false,history=[],recentActions=[],turnKind='';
 // Talk with Fox (fox-talk.ts), where the host has local speech and a system voice (`talkVoice`): the microphone menu,
 // or the wake word (host `wake`), turns it on. While Fox speaks a quiet capture listens for the person (barge-in).
 let talkWasOn=false,wakeState='off';
 const talk=createFoxTalk({listen:async()=>{if(!talkVoice)return false;await beginSpeech(false,'talk');return recording||starting;},finishListening:()=>void finishSpeech(),cancelListening:()=>{if(recording||starting||transcribing)cancelSpeech('talk');},
  ...(talkVoice?.bargeIn?{listenWhileSpeaking:overhear,keepListening:(preroll:boolean)=>{void call('speechKeep',{preroll}).catch(()=>{});}}:{}),
  speak:text=>talkVoice?talkVoice.speak(text):Promise.resolve(false),stopSpeaking:()=>talkVoice?.stop(),submit:text=>void submit(text),
  // The host's wake listener rests while Talk is on.
  changed:()=>{if(talk.on!==talkWasOn){talkWasOn=talk.on;void call('speechTalk',{active:talk.on}).catch(()=>{});}render();}});
 /** Opens the microphone while Fox speaks, without stopping the voice or saying anything when it cannot. */
 async function overhear(){
  if(recording||starting||transcribing||ordering)return false;
  starting=true;const turn=++speechGeneration;render();
  try{await call('speechStart',{purpose:'talk',barge:true});if(turn===speechGeneration&&starting){starting=false;recording=true;render();return true;}}
  catch{if(turn===speechGeneration){starting=false;render();}}
  return false;
 }
 let turnActivity:FoxActivitySignal|undefined;
 let recallTimer=null,lastReply=null,replyAnimation=null;
 const previousMotion={};
 function motionVariant(kind){const last=previousMotion[kind];const index=last===undefined?Math.floor(Math.random()*3):(last+1+Math.floor(Math.random()*2))%3;previousMotion[kind]=index;return index;}
 let recommendationSignature='';
 let streamingReply=false,turnStatus='',guide=null,guideTurn=-1,answeredGuide='',choice:{label:string;at:number}|null=null,keyPress=null,keyHoldTimer=null,guideShown=null;
 // A guide belongs to the context it appeared in, like a turn: it shows in that context's
 // thread and waits there while the person is elsewhere. Model setup, first-use journeys,
 // the memory editor and help narration for a running turn follow the person instead.
 const GLOBAL_GUIDE=/^(?:model-setup|welcome|first-value|memory-manager|attention-help:|applet-task:|status:job$)/;
 const guidePlace=new WeakMap<object,string>(),guideEntry=new WeakMap<object,string>();
 const guideHere=(g,segment=segmentNow())=>!!g&&(root.dataset.onboardingLocked==='true'||!guidePlace.has(g)||guidePlace.get(g)===segment);
 let turnReply=null;
 const openTopics=new Set<string>();
 let thread:ThreadEntry[]=[],turnEntry='',expanded=false,threadSignature='',stackIds:string[]=[],stackSegment='',deckDepth=0,frontEntry='';
 const readingPositions=new Map<string,{id:string;offset:number;bottom:boolean}>();
 function rememberThreadPosition(){
  if(panel.hidden||threadList.hidden||!threadList.clientHeight)return;
  const top=threadList.getBoundingClientRect().top;
  const card=([...threadList.children] as HTMLElement[]).find(card=>card.getBoundingClientRect().bottom>top);
  if(card)readingPositions.set(stackSegment,{id:card.dataset.entry,offset:card.getBoundingClientRect().top-top,bottom:threadList.scrollHeight-threadList.clientHeight-threadList.scrollTop<2||pinnedTop>=0&&threadList.scrollTop>=pinnedTop-1});
 }
 // The scroll event of the thread's own pin to its end lands a frame later, after a card may have
 // grown; it still counts as reading at the end. Only a scroll above the pin leaves it.
 let pinnedTop=-1;
 let threadRoom=0;
 // Read at its end, the list's top edge never cuts through a line of text (RC UI review 2026-10-07): the room
 // shrinks by the part of a line poking out under the edge, so the first line shown is whole.
 function pinThreadEnd(){
  threadList.style.maxHeight=threadRoom+'px';threadList.scrollTop=threadList.scrollHeight;
  const top=threadList.getBoundingClientRect().top,card=([...threadList.children] as HTMLElement[]).find(c=>{const r=c.getBoundingClientRect();return r.top<top&&r.bottom>top;});
  let cut=0;
  if(card){const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT),range=document.createRange();for(let node=walker.nextNode();node;node=walker.nextNode()){range.selectNodeContents(node);for(const line of range.getClientRects())if(line.height&&line.top<top-.5&&line.bottom>top+.5)cut=Math.max(cut,line.bottom-top);}}
  if(cut){threadList.style.maxHeight=Math.max(0,threadRoom-Math.ceil(cut))+'px';threadList.scrollTop=threadList.scrollHeight;}
  pinnedTop=threadList.scrollTop;
 }
 // Fades mark text past either edge: earlier cards above, the rest of a reply below (#1622).
 function markThreadOverflow(){threadList.dataset.overflow=String(threadList.scrollTop>2);threadList.dataset.more=String(threadList.scrollHeight-threadList.clientHeight-threadList.scrollTop>2);}
 threadList.addEventListener('scroll',()=>{rememberThreadPosition();markThreadOverflow();},{passive:true});
 // A card that grows after it was placed (late fonts, a re-wrapped reply) keeps the newest
 // text in view unless the person scrolled up to read something earlier.
 const threadResize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
  if(threadList.hidden)return;
  const position=readingPositions.get(stackSegment);
  if(!position||position.bottom)pinThreadEnd();
  markThreadOverflow();
 }):null;
 let context={key:'overview',title:'My Worldlet',detail:''},reply=null,pages=[],pageIndex=0,signature='',pageText='',pageOwner=null,replySerial=0,pageRevision=0;
 let displayingGuide=false;
 const contextReplies=new Map();let hoverReply=null;
 const recallKey=contextThread;let contextAnchor=recallKey(context.key,'');
 const threadHistory=new Map();let savedRecall='',recallWrites=Promise.resolve(),rememberedReply=null;
 function contentIdentity(){return visibleContent()?.id||'';}
 const activeThread=()=>FOX_MAIN_THREAD;
 function saveRecall(){root.dispatchEvent(new Event('worldlet:fox-thread'));if(!recallStorage)return;const rows=[...cleanRecall([...contextReplies.values()].slice(-78).concat([{key:FOX_MAIN_THREAD,view:'',text:'',history:threadHistory.get(FOX_MAIN_THREAD)||[]}])),threadRow(thread)];const encoded=JSON.stringify(rows);if(encoded===savedRecall)return;savedRecall=encoded;recallWrites=recallWrites.catch(()=>{}).then(()=>recallStorage.save(rows));recallWrites.catch(()=>{savedRecall='';rememberedReply=null;});}
 const recallReady=recallStorage?recallStorage.load().then(rows=>{rememberedReply=null;if(!thread.length)thread=restoreThread(rows);const clean=cleanRecall((Array.isArray(rows)?rows:[]).filter(r=>r?.key!==THREAD_ROW));if(!threadHistory.has(FOX_MAIN_THREAD))threadHistory.set(FOX_MAIN_THREAD,restoredMainHistory(clean));for(const r of clean){if(r.key===FOX_MAIN_THREAD&&r.view==='')continue;const key=recallKey(r.key,r.view);if(contextReplies.has(key))continue;contextReplies.set(key,r);}render();}).catch(()=>{}):Promise.resolve();
 // Turns live in the thread. A place also remembers Fox lines that were not turns
 // (a remembered notice, an invitation's answer), stamped so the newer one leads.
 function rememberContext(value){if(!value?.text||value===rememberedReply)return;value={...value,at:value.at||Date.now()};rememberedReply=value;const key=recallKey(value.key,value.view);contextReplies.delete(key);contextReplies.set(key,value);if(contextReplies.size>80)contextReplies.delete(contextReplies.keys().next().value);saveRecall();}
 function sameContext(value){return value?.key===context.key&&value?.view===contentIdentity();}
 const segmentNow=()=>recallKey(context.key,contentIdentity());
 const entryReply=(e:ThreadEntry)=>({id:'entry:'+e.id,entry:e.id,text:e.text,key:context.key,view:contentIdentity(),location:e.location,at:e.at});
 // Fox's line in this place: its latest finished turn (or a newer remembered line); with no
 // conversation yet, what Fox can do here. A line over two hours old fades out under a gradient
 // rather than being replayed as a "Welcome back" (owner Order 2026-10-07).
 // Hover, click and arriving in an Applet all show this one card.
 const STALE_AFTER=2*3600e3;
 function frontReply(){
  const segment=segmentNow(),last=thread.filter(e=>segmentOf(e)===segment&&e.status!=='working'&&!!e.text).at(-1),saved=contextReplies.get(segment);
  const latest=last&&!(saved?.at>last.at)?entryReply(last):saved||null,base={key:context.key,view:contentIdentity(),location:context.title};
  if(!latest)return {id:'greeting:'+segment,text:foxGreeting(context,greetingContext?.()?.applet,visibleContent()),...base};
  return latest.at&&Date.now()-latest.at>STALE_AFTER?{...latest,stale:true}:latest;
 }
 function conversationActions(){
  if(active||streamingReply||recording||starting||transcribing||guideShown||reply!==lastReply||reply?.key!==context.key)return [];
  return [...actionFooter.querySelectorAll('a.fox-inline-action')].slice(0,2).map(link=>({id:'reply:'+link.getAttribute('href'),identity:replyActionIdentity(link.getAttribute('href')),label:link.textContent.trim(),icon:'spark',kind:'navigation',placement:'contextual',run:()=>{dismissed=false;preview=true;render();link.click();}}));
 }
 // A conversation action lives in the bubble OR the dock, never both.
 function recommendedActions(){return panel.hidden?conversationActions():[];}
 function visibleActionIds(){return panel.hidden?[]:conversationActions().map(a=>a.identity);}
 const onDesktop=isDesktopCompanion;
 function insideApplet(){return !onDesktop()&&root.dataset.depth==='object'&&root.dataset.page?.startsWith('app-');}
 function contextualDialogue(){return insideApplet()||!!visibleContent()||context.key.split(':')[0]!=='overview';}
 let renderPending=false;
 // A route updates context, visibility and HUD synchronously. Paint their final
 // state once, rather than measuring/re-paginating each intermediate state.
 let cornerObserved=false;
 function scheduleRender(){if(renderPending)return;renderPending=true;queueMicrotask(()=>{if(renderPending)render();});}
 function render(){
  rememberThreadPosition();
  renderPending=false;
  const wasVisible=!panel.hidden;
  // An Order's capture is the button's alone: the card, the bar and Fox look as they did (owner Order 2026-10-07).
  const listening=(recording||starting||transcribing)&&!ordering;
  // A quiet turn (the day's plan and summary) shows only Fox at work, never the card (owner Order 2026-10-07).
  const busy=active&&!quietTurn;
  // Opening any conversation surface must keep a meaningful reply visible.
  const engaging=editing||listening||busy||preview;
  const persistent=contextualDialogue()||!!attentionActions.childElementCount||engaging;
  if(persistent)dismissed=false;
  if(!preview&&!busy&&reply&&reply.view!==contentIdentity()){reply=null;preview=false;}
  const segment=segmentNow(),working=active&&turnEntry?thread.find(e=>e.id===turnEntry&&e.status==='working')||null:null,workingHere=!!working&&segmentOf(working)===segment;
  // A hover's card lasts as long as the hover: a later peek (Expand, a click) shows the newest line, never an old snapshot.
  if(!peeking)hoverReply=null;
  const recalled=!busy&&!listening&&peeking&&hoverReply?hoverReply:null;
  // A guide the person dismissed stays dismissed; hovering Fox brings back the conversation.
  const shownGuide=guideHere(guide,segment)&&!(dismissed&&guide===dismissedGuide)?guide:null;
  // Natural order, no priority (owner decision): a guide (question, notice, review) is the
  // newest line here until the person's next message or Fox's next reply supersedes it.
  // While the person speaks, their voice takes the card, except for a notice about that capture itself.
  const guided=!!shownGuide&&!(active&&shownGuide.source?.startsWith('attention-preview:'))&&(!listening||!!shownGuide.speech)&&!recalled;
  if(guided||busy||root.dataset.onboardingLocked==='true')expanded=false;
  // Context is optional explanatory copy, not a location label on every reply.
  guideHint.textContent=guided?shownGuide?.hint||'':'';guideHint.hidden=!guideHint.textContent;
  guideShown=guided?shownGuide:null;root.dataset.foxGuide=String(guided);guideActions.hidden=!guided||!shownGuide?.actions?.length;guideContent.hidden=!guided||!shownGuide?.body;
  if(guided){if(guideActions.firstChild!==shownGuide.actions?.[0])guideActions.replaceChildren(...(shownGuide.actions||[]));if(guideContent.firstChild!==shownGuide.body)guideContent.replaceChildren(...(shownGuide.body?[shownGuide.body]:[]));}
  panel.dataset.bubbleMode=guided?'guide':'reply';
  // Continuous conversation, context-local presentation. Ambient copy is not
  // a model turn and never enters the transcript or overwrites saved replies.
  const currentReply=sameContext(reply)&&reply?.text?reply:null;
  // The running turn's own card: the question and Fox's steps, until the answer replaces it.
  const workingReply=workingHere?{id:'working:'+working.id,entry:working.id,text:workingText(working,turnStatus),key:context.key,view:contentIdentity(),location:context.title}:null;
  const remembered=(busy?(working?workingReply:turnReply):null)||(sameContext(recalled)?recalled:null)||currentReply||(persistent?frontReply():null);
  // The card points at Fox, so it carries no name tag (owner Order 2026-10-08).
  topic.hidden=true;
  const text=guided?shownGuide.text:remembered?.text||(preview?context.detail:'');
  // A guide that follows a reply (a question with options) is that reply's card, not a new one.
  const frontId=guided?guideEntry.get(shownGuide)||'':remembered?.entry||'';
  const front=frontId?thread.find(e=>e.id===frontId)||null:null;
  // A choice in Fox's card shows as the person's reply on the card that answers it.
  showQuestion(asked,guided&&shownGuide.answered?{user:shownGuide.answered,userIcon:'reply'}:front);
  const onboarding=root.dataset.onboardingLocked==='true';
  // Options and notices take the front card; they never wipe the thread above it.
  const earlier=onboarding?[]:threadCards(thread,segment,{exclude:front?.id||''});
  const runningElsewhere=!!working&&!workingHere;
  threadRunning.hidden=!runningElsewhere;
  // What this place's thread used so far, as the person's Agent reported it: one quiet line under the cards.
  const used=onboarding?{label:'',usage:null}:threadUsage(thread,segment);threadUsed.hidden=!used.label||!earlier.length;
  if(used.label&&threadUsed.textContent!=='This thread · '+used.label){threadUsed.textContent='This thread · '+used.label;threadUsed.title='As your Agent reported it: '+harnessUsageLabel(used.usage,{detail:true});}
  if(runningElsewhere)threadRunning.textContent='Still working · '+(working.location||'another place')+(working.steps.at(-1)||turnStatus?': '+(working.steps.at(-1)||turnStatus):'');
  // Beside an Applet the right-hand column is tall: earlier turns show above the
  // front card unless the person folded it. In the world they wait behind it until expanded.
  // A large artifact open in the world takes the main stage too: Fox and the whole thread move to the
  // right-hand column, as beside an Applet (owner decisions 2026-10-05, layout option A, and 2026-10-06:
  // only large artifacts; a medium one, such as an Attention card, sits above Fox in the middle).
  // The right-hand lane needs room for the Attention Center, the card and Fox; narrower windows and the
  // onboarding tour, which seats Fox under the card it lights, keep the stacked layout.
  const lane=root.dataset.attentionPreview==='true'&&root.dataset.artifactSize==='large'&&root.dataset.detailOpen!=='true'&&root.dataset.depth!=='object'&&root.dataset.tourSpotlight!=='true'&&root.clientWidth>=1340;
  root.dataset.foxLane=String(lane);
  const beside=root.dataset.detailOpen==='true'||root.dataset.depth==='object'||lane;
  // Folded beside an Applet, only the front card shows; a long one scrolls inside it.
  const folded=beside&&chatFolded;
  const history=!onboarding&&!folded&&(expanded||beside);
  const cards=earlier;
  deck.hidden=history||!text||!earlier.length;deck.dataset.depth=String(Math.min(1,earlier.length));deck.dataset.unfold=String(folded&&!deck.hidden);
  foldButton.hidden=!beside||onboarding||!earlier.length;
  if(!foldButton.hidden){
   const label=folded?'Expand':'Fold';
   if(foldButton.dataset.label!==label){foldButton.dataset.label=label;foldButton.innerHTML=chevron(folded)+'<span></span>';foldButton.lastElementChild.textContent=label;}
   foldButton.setAttribute('aria-expanded',String(!folded));
   foldButton.setAttribute('aria-label',folded?`Expand conversation, ${earlier.length} earlier `+(earlier.length===1?'message':'messages'):'Collapse conversation to the latest message');
   foldButton.title=folded?`Expand · ${earlier.length} earlier `+(earlier.length===1?'message':'messages'):'Fold to the latest message';
  }
  panel.dataset.folded=String(folded);
  threadList.hidden=!history||!cards.length;
  const answered=onboarding||!beside?'':answeredHere();threadAgent.hidden=!answered;if(answered)threadAgent.textContent=answered;
  threadStack.hidden=threadList.hidden&&threadRunning.hidden&&threadAgent.hidden;
  panel.dataset.expanded=String(expanded);panel.dataset.history=String(history);
  // Expanded in the world, the cards stand taller over everything else, the earlier turns stacked and scrolling
  // above the latest (owner requests 2026-10-05: long talks were unreadable; no box around them), at the card's
  // one fixed width (owner Order 2026-10-07: the World card never changes width).
  const sheet=history&&!beside;panel.dataset.sheet=String(sheet);root.dataset.foxChatSheet=String(sheet);
  const stackKey=JSON.stringify([segment,cards.map(c=>c.id+':'+c.status),threadTopicKey(cards),[...openTopics]]),stackChanged=stackKey!==threadSignature;
  if(stackChanged||!history)cancelThreadMotion();
  if(stackChanged){threadSignature=stackKey;renderThreadCards(threadList,cards,{answer:entry=>replyMarkdown(parseSuggestedReplies(entry.text).text,{resolveLink:resolveReplyLink}),open:openTopics,toggle:topic=>{if(!openTopics.delete(topic))openTopics.add(topic);render();}});if(threadResize){threadResize.disconnect();for(const card of threadList.children)threadResize.observe(card);}}
  // A conversation turn is one card and never pages; a long one scrolls inside its
  // room. Guides keep their pages (explicit or fitted).
  panel.hidden=false;
  const style=getComputedStyle(log),panelStyle=getComputedStyle(panel),rootBounds=root.getBoundingClientRect();
  const width=parseFloat(panelStyle.maxWidth)-parseFloat(panelStyle.paddingLeft)-parseFloat(panelStyle.paddingRight)-parseFloat(panelStyle.borderLeftWidth)-parseFloat(panelStyle.borderRightWidth);
  const attention=root.querySelector('#foxArtifact:not([hidden])')||root.querySelector('#attentionPreview');
  // The top bar's own box is flat; its corner controls (date, weather, sounds) hang
  // below it, so the bubble and its history stop under any that stand over Fox's column (#1652).
  const topBar=root.querySelector('.notion-top'),column=panel.getBoundingClientRect();
  const topFloor=Math.max(topBar.getBoundingClientRect().bottom,...[...topBar.children].map(child=>{const r=child.getBoundingClientRect();return r.width&&r.height&&r.left<column.right&&r.right>column.left?r.bottom:0;}));
  const ceiling=Math.max(rootBounds.top+64,topFloor+16,attention&&!attention.hidden&&!sheet&&!lane&&!(attention.id==='foxArtifact'&&attention.dataset.size==='large'&&(root.dataset.depth==='object'||root.dataset.depth==='note'))?attention.getBoundingClientRect().bottom+16:0);
  // In Open/Focus, the right-hand bubble may cover the device above Fox.
  const readerRoom=parseFloat(getComputedStyle(root).getPropertyValue('--fox-reader-room'))||Infinity;
  const available=Math.min(readerRoom,Math.max(100,panel.getBoundingClientRect().bottom-ceiling));
  panel.style.setProperty('--fox-dialogue-room',available+'px');
  const room=available-parseFloat(panelStyle.paddingTop)-parseFloat(panelStyle.paddingBottom)-86-(asked.hidden?0:asked.offsetHeight);
  // Beside an Applet the right-hand column is tall, so a card may use more of it.
  const cap=beside?Math.max(240,Math.min(history&&cards.length?320:480,room)):240;
  // Expanded in the world the latest card yields room to the sheet of earlier turns above it.
  const height=Math.min(sheet?Math.min(cap,Math.max(110,Math.round(room*.45))):expanded?Math.min(cap,200):cap,Math.max(64,guided&&shownGuide.body?Math.min(160,room*.35):room));
  log.style.maxHeight=height+'px';
  const owner=guided?shownGuide:remembered?.id||context.key;
  const explicit=guided&&Array.isArray(shownGuide.pages)&&shownGuide.pages.length;
  const pageSource=explicit?shownGuide.pages.join('\n\n'):String(text||'').split('<worldlet-replies>')[0].trim();
  const key=JSON.stringify([explicit?shownGuide.source||'guide-pages':context.key,pageSource,width,guided?height:0,style.font,guided]);
  if(key!==signature||owner!==pageOwner){
   const keepPage=explicit&&owner===pageOwner?pageIndex:null;
   const continuing=guided&&!explicit&&owner===pageOwner&&pageSource.startsWith(pageText),anchor=continuing?pages[pageIndex]?.start||0:0;
   if(owner!==pageOwner)log.scrollTop=0;
   signature=key;pageOwner=owner;pageText=pageSource;
   const content=replyMarkdown(pageSource,{resolveLink:resolveReplyLink,actions:replyActions});
   actionFooter.replaceChildren();const used=new Set();
   for(const link of content.querySelectorAll('.fox-inline-action')){
    const href=link.getAttribute('href');link.querySelector('svg')?.remove();
    if(!used.has(href)&&used.size<2){used.add(href);actionFooter.append(link.cloneNode(true));}
    if(link.parentElement?.textContent.trim()===link.textContent.trim())link.parentElement.remove();else link.replaceWith(document.createTextNode(link.textContent));
   }
   pages=explicit?shownGuide.pages.map((page,i)=>({fragment:replyMarkdown(page,{resolveLink:resolveReplyLink,actions:replyActions}),start:i,end:i+1})):content.childNodes.length?[{fragment:content,start:0,end:1}]:[];
   if(!pages.length&&actionFooter.childElementCount)pages=[{fragment:document.createDocumentFragment(),start:0,end:0}];
   if(!pages.length&&guided&&(shownGuide.body||shownGuide.actions?.length||explicit))pages=[{fragment:document.createDocumentFragment(),start:0,end:0}];
   pageIndex=keepPage!=null?Math.min(keepPage,Math.max(0,pages.length-1)):Math.max(0,pages.findIndex(page=>page.end>anchor));
   pageRevision++;
  }
  const pageKey=pageRevision+':'+pageIndex;
  if(log.dataset.page!==pageKey){
   log.style.minHeight='';
   log.replaceChildren(...(pages[pageIndex]?[pages[pageIndex].fragment.cloneNode(true)]:[]));log.dataset.page=pageKey;
  }
  displayingGuide=guided;
  // With nothing to say here, the bubble still names a turn running in another place.
  panel.hidden=(dismissed&&!peeking)||(!persistent&&!guided&&!preview&&!recalled)||(!pages.length&&threadRunning.hidden);panel.inert=panel.hidden;
  // A card or guide taller than its room scrolls inside it and fades out at the bottom over the arrow; neither
  // pages (owner Order 2026-10-07). Only a guide written as explicit pages, a sequence of steps, has arrows.
  log.dataset.scrollable=String(!panel.hidden&&log.scrollHeight>log.clientHeight+2);markLogScroll();
  // Over an Applet the corner artifact yields to Fox's words (owner Order 2026-10-09: with Show all it squeezed the reply
  // under it to two lines): the front card keeps room for its reply, up to about six lines
  // (four while the artifact is medium, down the column), and the artifact ends above it; a large one covers the Applet instead.
  const corner=root.querySelector('#foxArtifact');
  if(corner&&!cornerObserved){cornerObserved=true;new ResizeObserver(scheduleRender).observe(corner);}
  if(corner&&!corner.hidden&&corner.dataset.size!=='large'&&!panel.hidden&&(root.dataset.depth==='object'||root.dataset.depth==='note')){
   // The same room the card's height takes below: its paddings, the 86px it keeps for the rest of the card and the question.
   const wanted=Math.min(log.scrollHeight,corner.dataset.size==='medium'?104:156)+parseFloat(panelStyle.paddingTop)+parseFloat(panelStyle.paddingBottom)+86+(asked.hidden?0:asked.offsetHeight);
   root.style.setProperty('--fox-column-reserve',Math.round(rootBounds.bottom-panel.getBoundingClientRect().bottom+wanted+16)+'px');
  }else root.style.removeProperty('--fox-column-reserve');
  panel.dataset.expandable=String(!guided&&!panel.hidden&&!active&&!onboarding&&(expanded||(!beside&&!!earlier.length)));
  earlierButton.hidden=guided||active||onboarding||beside||!(expanded||earlier.length);
  // Expand and Fold, a quiet word on the card's edge (owner request 2026-10-05: not History, not loud).
  const unfolded=expanded&&!folding,earlierLabel=unfolded?'Fold':'Expand';
  if(earlierButton.dataset.label!==earlierLabel){earlierButton.dataset.label=earlierLabel;earlierButton.innerHTML=chevron(!unfolded)+'<span></span>';earlierButton.lastElementChild.textContent=earlierLabel;}
  earlierButton.setAttribute('aria-expanded',String(unfolded));earlierButton.title=unfolded?'Fold the conversation':'Expand the whole conversation · or scroll up';
  // The earlier cards stop at an upper bound: older ones are clipped under it and scroll into
  // view, while the front card stays where it is.
  if(!threadList.hidden){
   threadRoom=Math.max(0,Math.min(Math.round(root.clientHeight*(sheet?.78:.42)),panel.getBoundingClientRect().top-ceiling-28-(threadFoot.offsetHeight?threadFoot.offsetHeight+8:0)));
   // With less room than a line of a card, no sliver of the history pokes out under the corner controls.
   threadList.style.maxHeight=threadRoom+'px';threadList.dataset.cramped=String(threadRoom<40);
   const ids=cards.map(c=>c.id),added=ids.filter(id=>!stackIds.includes(id));
   // A reply that just joined the thread is shown whole, wherever the person had scrolled.
   if(stackChanged&&stackSegment===segment&&added.length)readingPositions.delete(segment);
   const position=readingPositions.get(segment),anchor=position&&([...threadList.children] as HTMLElement[]).find(card=>card.dataset.entry===position.id);
   if(!position||position.bottom)pinThreadEnd();
   else if(anchor){pinnedTop=-1;threadList.scrollTop+=anchor.getBoundingClientRect().top-threadList.getBoundingClientRect().top-position.offset;}
   markThreadOverflow();
   // The card that just left the front slides up from Fox's card; the others make room.
   if(stackChanged&&wasVisible&&(!position||position.bottom)&&stackSegment===segment&&stackIds.length+1===ids.length&&added[0]===ids.at(-1)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const moved=threadList.lastElementChild as HTMLElement,from=panel.getBoundingClientRect().top-moved.getBoundingClientRect().top,lift=moved.offsetHeight+10,motion={duration:420,easing:'cubic-bezier(.2,.7,.3,1)'};
    moved.animate([{transform:`translateY(${from}px)`},{transform:'none'}],motion);
    for(const card of [...threadList.children].slice(0,-1))(card as HTMLElement).animate([{transform:`translateY(${lift}px)`},{transform:'none'}],motion);
   }
  }
  if(stackChanged){stackIds=cards.map(c=>c.id);stackSegment=segment;}
  // A new turn's card grows in from the bottom, next to Fox, while the thread above makes room.
  if(workingHere&&front?.id===working.id&&frontEntry!==front.id&&wasVisible&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const grow={duration:320,easing:'cubic-bezier(.2,.7,.3,1)'};
   for(const part of [asked,log])if(!part.hidden)part.animate([{transform:'translateY(14px) scale(.97)',transformOrigin:'50% 100%',opacity:0},{transform:'none',transformOrigin:'50% 100%',opacity:1}],grow);
  }
  frontEntry=front?.id||'';
  // Folded in the world, the deck takes the card in with a small nudge.
  const depth=deck.hidden?0:earlier.length;
  if(depth>deckDepth&&deckDepth>0&&wasVisible&&!matchMedia('(prefers-reduced-motion: reduce)').matches)deck.animate([{transform:'translateY(10px)'},{transform:'none'}],{duration:360,easing:'cubic-bezier(.2,.7,.3,1)'});
  deckDepth=depth;
  // While Fox works, the card holds one lighter line that streams in.
  log.dataset.working=String(!guided&&!!workingReply&&remembered===workingReply);
  log.dataset.stale=String(!guided&&!!remembered?.stale);
  actionFooter.hidden=guided||streamingReply||!actionFooter.childElementCount;
  const unavailable=active||recording||starting||transcribing;
  for(const action of attentionActions.querySelectorAll('button'))action.disabled=unavailable;
  const recommendations=JSON.stringify([guided&&!panel.hidden,recommendedActions().map(a=>[a.id,a.label]),visibleActionIds()]);
  if(recommendations!==recommendationSignature){recommendationSignature=recommendations;queueMicrotask(()=>root.dispatchEvent(new Event('worldlet:recommendations')));}
  const canPrevious=pageIndex>0,canNext=pageIndex<pages.length-1;
  previous.disabled=recording||starting||transcribing||!canPrevious;next.disabled=recording||starting||transcribing||!canNext;
  panel.dataset.continue=String(canNext&&!next.disabled);
  panel.dataset.page=String(pageIndex+1);panel.dataset.pages=String(pages.length);
  replyNav.hidden=!canPrevious&&!canNext;
  previous.dataset.unavailable=String(previous.disabled);next.dataset.unavailable=String(next.disabled);
  if(guided){guideActions.hidden=pageIndex<pages.length-1||!shownGuide.actions?.length;for(const action of guideActions.querySelectorAll('button'))action.hidden=active&&!workingHere&&action.dataset.duringWork!=='true';guideContent.hidden=pageIndex<pages.length-1||!shownGuide.body;}
  browseSwitch.hidden=browsing===null||onDesktop()||root.dataset.onboarding==='true'||root.dataset.onboardingLocked==='true'||(context.key.split(':')[0]==='overview'&&!contentIdentity())||!(browsing===false||guided&&shownGuide.browsing===true);
  actionBar.hidden=browseSwitch.hidden&&guideActions.hidden&&actionFooter.hidden&&attentionActions.hidden;
  replyNav.setAttribute('aria-busy',String(unavailable));
  root.dataset.expressionMode=panel.hidden?'idle':'reply';hud.classList.toggle('composer-expanded',!panel.hidden);hud.classList.toggle('is-chat-peeking',!panel.hidden);root.classList.toggle('companion-talking',!panel.hidden);
  root.dataset.talk=talk.phase;root.classList.toggle('is-listening',listening&&recording);root.classList.toggle('is-preparing-speech',listening&&starting);root.classList.toggle('is-transcribing',listening&&transcribing);
  const value=listening&&recording?'listening':listening&&starting?'preparing':listening&&transcribing?'transcribing':active?(streamingReply?'talking':turnKind===FOX_WORKING?'working':'thinking'):editing||hoverInput?'writing':'idle';avatar.dataset.state=value;
  nameTag.update({name:companionName,state:value,status:turnStatus});
  life.update({state:value,text:turnStatus,context:context.title,signal:active?turnActivity:undefined});
  avatar.setAttribute('aria-label','Talk to '+companionName);avatar.removeAttribute('aria-haspopup');avatar.removeAttribute('title');
  contextButton.hidden=false;name.textContent=context.title;contextButton.setAttribute('aria-label','Current context: '+context.title);
  renderEntry();
  root.dataset.replyBusy=String(active);
  send.disabled=recording||starting||transcribing;
  send.setAttribute('aria-label','Send message');
  send.title=active?(steering&&!!turnEntry&&!quietTurn&&!chatRoute?.()?'Add to current task':`Send next · ${queuedTurns.length} queued`):'';
  layout();
 if(!panel.hidden&&!wasVisible)animateReply();
  if(panel.hidden){replyAnimation?.cancel();replyAnimation=null;cancelThreadMotion();}
 }
 function animateReply(){
  replyAnimation?.cancel();
  const variant=motionVariant('reply');panel.dataset.motion=String(variant);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lift=[4,6,8][variant],duration=[220,260,290][variant];
  replyAnimation=panel.animate(reduced?[{opacity:.65},{opacity:1}]:[
   {opacity:0,transform:`translate(-50%,${lift}px) scale(.99)`},
   {opacity:1,transform:'translate(-50%,0) scale(1)'}
  ],{duration:reduced?100:duration,easing:'cubic-bezier(.2,.7,.3,1)'});
 }
 // A notice (a page that did not load, a job that needs the person) is a line Fox says in its one
 // card, the newest there until something newer supersedes it; there is no second bubble over
 // Fox's head (owner report 2026-10-05). A question waiting for the person's choice keeps the card.
 // A `speech` notice is about the capture under way (a missing microphone) and shows while the person speaks.
 function setStatus(text,{source='notice',speech=false}:{source?:string;persistent?:boolean;speech?:boolean}={}){
  const id='status:'+source;
  if(!text){api.setGuide(null,{only:id});return;}
  if(guide?.actions?.length&&guide.source!==id)return;
  if(guide?.source===id&&guide.text===String(text))return;
  api.setGuide({source:id,takeover:false,text:String(text),speech});api.revealGuide();
 }
 function renderEntry(){
  const speech=(recording||starting||transcribing)&&!ordering,expanded=editing&&!speech;
  root.dataset.entryExpanded=String(expanded);
  // At rest the bar keeps low (owner request 2026-10-05): short, faint and only its name; pointing at it
  // or Fox brings back the hint, the microphone and Send, and a click opens it wide to type.
  const quiet=!expanded&&!speech&&!hoverInput&&!input.value.trim()&&!matchMedia('(hover: none)').matches;
  entry.dataset.quiet=String(quiet);
  // While the microphone listens, for Fox or for an Order, a sound wave stands where the bar was (owner request
  // 2026-10-09); the bar comes back once the words are being understood or sent. While Fox speaks in Talk the open
  // microphone only waits for an interruption, and the bar says how to interrupt.
  const listening=(recording||starting)&&!(talk.on&&talk.phase!=='listening')&&root.dataset.order!=='sending';
  entry.dataset.voice=String(listening);
  form.hidden=listening;form.inert=listening;fitInput(!expanded);inputState.hidden=true;
  waveform.hidden=!listening;
  state.textContent='';
  // A place with no conversation yet invites one; there is no canned greeting.
  // Resting, the bar says how to use it; once typing, it says whom you are asking.
  // In a website the bar is also its address bar (ui/shell/notion-world.ts), and says so (owner request 2026-10-07).
  const content=root.querySelector('#notionContent') as HTMLElement|null,website=!!content&&!content.hidden&&content.dataset.template==='browser';
  entry.dataset.website=String(website);
  input.placeholder=talk.phase==='speaking'?companionName+(talk.overhearing?' is speaking · talk or click the microphone to interrupt':' is speaking · click the microphone to interrupt'):talk.phase==='thinking'&&!speech?companionName+' is thinking · Talk is on':speech&&(recording||starting)?(talk.on?'Talk is on · listening…':'Listening…'):speech&&transcribing?'Understanding your voice…':quiet?'Message '+companionName+(website?' or type a web address':''):!editing?(matchMedia('(hover: none)').matches?'Tap to type · hold to speak':'Click to type · hold to speak'):website?'Ask about '+context.title+' or type a web address':context.key.split(':')[0]==='overview'?'Ask '+companionName+' anything':'Ask about '+context.title;
  speechButton.setAttribute('aria-label',talk.phase==='speaking'?'Interrupt '+companionName:recording?'Send voice message':'Speak to Fox');speechButton.title=talk.on?(talk.phase==='speaking'?'Click to interrupt · Esc ends Talk':'Talk is on · Click to send now · Esc ends Talk'):recording?'Click to send · Esc to cancel':'Click to speak · Hold to speak · Right-click to choose a microphone or Talk with Fox'+(wakeState==='listening'?' · Listening for “Hey '+companionName+'”':'');root.dataset.wake=wakeState;speechButton.setAttribute('aria-pressed',String(speech&&(recording||starting)));
  // Voice capture is intentionally visual: the waveform acknowledges listening
  // without exposing an unstable partial transcription in the bottom status.
  inputState.textContent='';
  inputState.title='';inputState.scrollTop=0;
 }
 // Starting to type or speak: a guide the person dismissed is closed for good.
 function noteInput(){root.dispatchEvent(new Event('worldlet:fox-input'));if(guide&&guide===dismissedGuide)guide=null;dismissedGuide=null;choice=null;}
 // The person's message is newer than any guide: the guide gives way for good and never
 // returns in front of the conversation (natural order, no priority).
 function supersedeGuide(){noteInput();answeredGuide=guide?.text||'';guide=null;}
 function focusInput(){if(root.dataset.onboardingLocked==='true')return;noteInput();dismissed=false;peeking=false;if(recording||starting||transcribing)return;editing=true;render();input.focus({preventScroll:true});}
 function recallLast(){
  clearTimeout(recallTimer);
  if(root.dataset.onboarding==='true')return;
  if(active||recording||starting||transcribing){peeking=true;render();return;}
  if(!panel.hidden)return;
  peeking=true;hoverReply=sameContext(reply)&&reply?.text?reply:frontReply();
  render();
 }
 function leaveRecall(){clearTimeout(recallTimer);recallTimer=setTimeout(()=>{if(!editing&&!expanded&&!pet.matches(':hover')&&!panel.matches(':hover')&&!entry.matches(':hover')){peeking=false;render();}},180);}
 panel.addEventListener('pointerdown',()=>{dismissed=false;peeking=false;});
 pet.addEventListener('pointerenter',recallLast);avatar.addEventListener('focus',recallLast);
 for(const area of [pet,panel,entry]){area.addEventListener('pointerenter',()=>clearTimeout(recallTimer));area.addEventListener('pointerleave',leaveRecall);}
 function hoverOn(e){if(e?.pointerType==='touch'||matchMedia('(hover: none)').matches)return;clearTimeout(collapseTimer);hoverInput=true;renderEntry();}
 function hoverOff(){clearTimeout(collapseTimer);collapseTimer=setTimeout(()=>{hoverInput=!matchMedia('(hover: none)').matches&&(pet.matches(':hover')||form.matches(':hover'));renderEntry();},180);}
 // The bar itself and Fox wake the bar; the round buttons beside it (Order) do not, or the widening bar
 // would slide them out from under the pointer (owner Order 2026-10-07).
 for(const area of [pet,form]){area.addEventListener('pointerenter',hoverOn);area.addEventListener('pointerleave',hoverOff);}
 input.addEventListener('focus',()=>{
  clearTimeout(recallTimer);dismissed=false;peeking=false;editing=true;warmThread();
  if(active||recording||starting||transcribing){renderEntry();return;}
  // Typing shows the same card hovering does: this place's last line, or none.
  if(!sameContext(reply)||!reply?.text){reply=frontReply();if(!reply){render();return;}}
  preview=true;render();
 });
 // Send preserves focus on pointerdown. Leaving an empty field closes it; a draft stays open (owner report
 // 2026-10-04: a stray click while selecting text closed it), and only Escape or sending puts it away.
 entry.addEventListener('focusout',()=>queueMicrotask(()=>{if(!entry.contains(document.activeElement)&&!input.value.trim()){editing=false;}render();}));
 avatar.addEventListener('worldlet:preview-action',()=>{if(active||recording||starting||transcribing)return;editing=false;hoverInput=false;input.blur();render();});
 let draggingFox=false;
 function clearAvatarPress(){if(draggingFox){draggingFox=false;if(onDesktop())void call('desktopCompanionDrag',{phase:'end'}).catch(()=>{});else position.end();}clearTimeout(avatarHoldTimer);avatarHoldTimer=null;avatarPress=null;root.classList.remove('is-pressing-fox','is-dragging-fox');}
 async function finishSpeech(){if(companionInfo.feedback.voicing){await companionInfo.feedback.finishVoice();return;}if(starting){cancelSpeech('stopped_early');return;}if(recording)try{await call('speechStop');}catch(e){cancelSpeech('speech_error');say(e.message||'I could not hear you. Please try again.');}}
 for(const target of [avatar,speechButton,input]){
 target.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  // A resting bar: a click starts typing and a hold speaks. Once typing, the field behaves as a text field.
  if(target===input&&(document.activeElement===input||!holdToSpeak))return;
  if(target===speechButton&&(recording||starting||transcribing))return;
  e.preventDefault();avatarSuppressClick=false;avatarPress={id:e.pointerId,x:e.clientX,y:e.clientY,held:false};root.classList.add('is-pressing-fox');target.setPointerCapture(e.pointerId);
  if(holdToSpeak&&(companionInfo.feedbackActive||!active||(steering&&!chatRoute?.())))avatarHoldTimer=setTimeout(()=>{if(!avatarPress)return;avatarPress.held=true;avatarSuppressClick=true;editing=false;input.blur();if(companionInfo.feedbackActive)void companionInfo.feedback.startVoice();else beginSpeech(true);},280);
 });
 target.addEventListener('pointermove',e=>{if(avatarPress&&!avatarPress.held&&!draggingFox&&Math.hypot(e.clientX-avatarPress.x,e.clientY-avatarPress.y)>12){avatarSuppressClick=true;if(target===avatar){clearTimeout(avatarHoldTimer);draggingFox=true;root.classList.add('is-dragging-fox');if(onDesktop())void call('desktopCompanionDrag',{phase:'start'}).catch(()=>clearAvatarPress());else position.start(avatarPress.x,avatarPress.y);}else{clearAvatarPress();if(target===input)focusInput();}}if(draggingFox&&!onDesktop())position.move(e.clientX,e.clientY);});
 target.addEventListener('pointerup',e=>{
  if(!avatarPress||avatarPress.id!==e.pointerId)return;const held=avatarPress.held,dragged=draggingFox;clearAvatarPress();if(target.hasPointerCapture(e.pointerId))target.releasePointerCapture(e.pointerId);
  avatarSuppressClick=true;if(held)finishSpeech();else if(!dragged){if(target===avatar||target===input)focusInput();else void toggleSpeech();}
 });
 target.addEventListener('pointercancel',()=>{const held=avatarPress?.held;clearAvatarPress();avatarSuppressClick=true;if(held)cancelSpeech();});
 target.addEventListener('lostpointercapture',()=>{if(avatarPress){const held=avatarPress.held;clearAvatarPress();if(held)cancelSpeech();}});
 target.addEventListener('contextmenu',e=>{e.preventDefault();if(target===avatar)void call('companionMenu').catch(()=>{});});
 }
 function visibleContent(){
  if(onDesktop())return null;
  const dialog=root.querySelector('#notionDialog'),reader=root.querySelector('#notionContent');
  const attention=root.querySelector('#attentionPreview');
  const artifact=root.querySelector('#foxArtifact');
  const surface=artifact&&!artifact.hidden?artifact:attention&&!attention.hidden?attention:dialog.open?dialog:!reader.hidden?reader:null;
  if(!surface)return null;
  // This is read on every streamed update. innerText forces layout and would
  // repeatedly extract the reader body even when Fox only needs its identity.
  return {id:surface.dataset.sourceId||(root.dataset.depth==='note'?root.dataset.page:undefined),title:surface.querySelector('h1,h2')?.textContent?.slice(0,200)||context.title};
 }
 // The triangle under the current card points at Fox wherever the card sits.
 function aimTail(){const a=avatar.getBoundingClientRect(),p=panel.getBoundingClientRect();if(p.width)panel.style.setProperty('--fox-tail-x',Math.round(Math.max(28,Math.min(p.width-28,a.left+a.width/2-p.left)))+'px');}
 function layout(){
  root.querySelector('#notionContent').inert=root.querySelector('#notionDialog').open;
  root.dataset.detailOpen=String(!root.querySelector('#notionContent').hidden||root.querySelector('#notionDialog').open);
  root.dataset.uiMode=viewMode({depth:root.dataset.depth,readerOpen:!root.querySelector('#notionContent').hidden,dialogOpen:root.querySelector('#notionDialog').open,dialogKind:root.querySelector('#notionDialog').dataset.kind});
  const top=root.querySelector('.notion-top').getBoundingClientRect();root.style.setProperty('--ui-top-bound',Math.ceil(top.bottom-root.getBoundingClientRect().top)+'px');
  root.style.setProperty('--reader-top',root.clientWidth<=800?'204px':'94px');
  aimTail();requestAnimationFrame(aimTail);

 }
 let actionPending=false;
 panel.addEventListener('click',async e=>{
  const link=e.target.closest('a');if(!link||(!log.contains(link)&&!actionFooter.contains(link)&&!threadList.contains(link))||!link.getAttribute('href')?.startsWith('#'))return;
  e.preventDefault();e.stopPropagation();
  if(!link.classList.contains('fox-inline-action')){const href=link.getAttribute('href');try{await requireWorldSurface(call);onReplyNavigate?.(href);}catch(error){say(error.message);}return;}
  if(actionPending||active||recording||starting||transcribing)return;
  actionPending=true;link.setAttribute('aria-busy','true');link.setAttribute('aria-disabled','true');
  if(link.getAttribute('href').startsWith('#fox-action=open.')){editing=false;input.blur();}
  const previousReply=reply,requestContext=context.key;
  try{const href=link.getAttribute('href'),label=link.textContent;if(href.startsWith('#fox-action=open.'))await requireWorldSurface(call);await call('replyAction',{href,label});}
  catch(error){if(reply===previousReply&&context.key===requestContext)say(error.message||'The action could not finish.');}
  finally{actionPending=false;link.removeAttribute('aria-busy');link.removeAttribute('aria-disabled');}
 });
 const layoutObserver=new ResizeObserver(layout);layoutObserver.observe(hud);layoutObserver.observe(panel);layoutObserver.observe(root.querySelector('.notion-top'));
 window.addEventListener('resize',()=>render());
 document.fonts?.addEventListener('loadingdone',()=>{signature='';render();});
 const viewportObserver=new ResizeObserver(()=>render());viewportObserver.observe(root);
 const surfaceObserver=new MutationObserver(scheduleRender);surfaceObserver.observe(root.querySelector('#notionContent'),{attributes:true,attributeFilter:['hidden']});surfaceObserver.observe(root.querySelector('#notionDialog'),{attributes:true,attributeFilter:['open']});surfaceObserver.observe(root,{attributes:true,attributeFilter:['data-attention-preview','data-artifact-size','data-tour-spotlight']});
 function say(text,key=context.key,remember=true,entryId=''){const parsed=parseSuggestedReplies(foxVisibleText(text));text=parsed.text;streamingReply=false;reply={id:active?'turn:'+generation:'say:'+(++replySerial),...(entryId?{entry:entryId}:{}),text:String(text||''),suggestions:parsed.suggestions,key,view:contentIdentity(),location:context.title};if(remember&&reply.text)lastReply=reply;/* Fox's newer line supersedes the guide shown here (natural order), except a choice this same turn asked for: the reply joins the thread above it. */if(guide&&guideHere(guide)&&reply.text&&!(active&&guideTurn===generation&&guide.actions?.length))guide=null;preview=true;/* Active turns render atomically in finally, without flashing their old waiting state. */if(!active)render();}
 function animateInput(text){
  hud.querySelectorAll('.companion-input-flight').forEach(e=>{e.getAnimations().forEach(a=>a.cancel());e.remove();});
  // What travels is not the sentence. Sending it already put the words where the
  // user can see them; flying a copy of them at the fox reads as the message being
  // carried, and a long one arrives as a slab of text crossing the world. A mote
  // says the same thing -- this reached Fox -- in any language and at any length.
  const flight=make('span','companion-input-flight');flight.setAttribute('aria-hidden','true');
  const base=hud.getBoundingClientRect(),from=entry.getBoundingClientRect(),to=avatar.getBoundingClientRect();
  flight.style.left=(from.x+from.width/2-base.x)+'px';flight.style.top=(from.y+from.height/2-base.y)+'px';hud.append(flight);
  const dx=to.x+to.width/2-(from.x+from.width/2),dy=to.y+to.height*.6-(from.y+from.height/2);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const variant=motionVariant('input'),sway=[-8,0,8][variant],duration=[820,850,900][variant];flight.dataset.motion=String(variant);
  const frames=reduced?[{opacity:1},{opacity:0}]:[
   {opacity:0,transform:'translate(-50%,-50%) scale(1)',offset:0},
   {opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.18},
   {opacity:.9,transform:`translate(calc(-50% + ${dx*.25+sway}px),calc(-50% + ${dy*.3}px)) scale(.9)`,offset:.48},
   {opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.2)`,offset:1}];
  const animation=flight.animate(frames,{duration:reduced?180:duration,easing:'ease-in-out',fill:'forwards'});
  animation.finished.catch(()=>{}).finally(()=>{flight.remove();if(!reduced)avatar.animate([{filter:'brightness(1)'},{filter:'brightness(1.2)'},{filter:'brightness(1)'}],{duration:240,easing:'ease-out'});});
 }
 function clearKeyPress(){clearTimeout(keyHoldTimer);keyHoldTimer=null;keyPress=null;root.classList.remove('is-pressing-fox');}
 function cancelSpeech(why?:unknown){if(why!=='talk')talk.stop();const order=ordering;if(ordering)endOrder();void companionInfo.feedback.cancelVoice();clearKeyPress();clearTimeout(finalTimer);clearAvatarPress();speechGeneration++;if(recording||starting||transcribing)call('speechCancel').catch(()=>{});recording=false;starting=false;transcribing=false;render();if(order){orderStopped(typeof why==='string'?why:'other');say(ORDER_STOPPED);}}
 // An Order is never dropped without a word (owner Order 2026-10-07: 「怎么发不了bug了」, after one Order ended when the
 // World's view settled and another when the window lost focus while its words were being recognised). Moving to
 // another view leaves it running; leaving the app while it listens stops the microphone and sends what was heard;
 // once it stopped listening, its words are recognised and sent wherever the person is.
 function leaveDuringOrder(){if(root.dataset.order==='listening'&&recording){orderSending();void finishSpeech();}else if(starting)cancelSpeech('left_app');}
 function hidePreview(force=false){if(contextualDialogue()&&!force){render();return;}if(root.dataset.onboardingLocked==='true'||root.dataset.onboarding==='true')return;window.dispatchEvent(new Event("worldlet:fox-dismiss"));if(guide)dismissedGuide=guide;if(force||guide||reply||active||lastReply||dismissedGuide)dismissed=true;peeking=false;if(!input.value.trim())editing=false;expanded=false;input.blur();clearTimeout(recallTimer);preview=false;render();}
 function stop(){talk.stop();const order=ordering;if(ordering)endOrder();clearKeyPress();for(const queued of queuedTurns)queued.trace.finish({},'cancelled');queuedTurns=[];generation++;speechGeneration++;if(active)call('cancel').catch(()=>{});if(recording||starting||transcribing)call('speechCancel').catch(()=>{});const wasActive=active;active=false;recording=false;starting=false;transcribing=false;if(wasActive)say('Stopped.');else if(order){orderStopped('cancelled');say(ORDER_STOPPED);}else render();}
 async function beginSpeech(hold=false,purpose=''){if(root.dataset.onboardingLocked==='true')return;
  // Pressing to talk while Fox reads its reply interrupts it (barge-in); a hold then records as usual.
  if(purpose!=='talk'&&talk.interrupt(!hold)&&!hold)return;
  if(companionInfo.feedbackActive){await companionInfo.feedback.startVoice();return;}
  if((active&&(!steering||chatRoute?.()))||starting||recording||transcribing)return;
  // An Order leaves the card as it was; Fox's own voice mode opens it.
  if(purpose!=='order'){noteInput();dismissed=false;peeking=false;expanded=false;preview=!!reply?.text;}starting=true;const turn=++speechGeneration;render();
  try{await call('speechStart',{hold,...(purpose?{purpose}:{})});if(turn===speechGeneration&&starting){starting=false;recording=true;render();}}
  catch(e){if(turn===speechGeneration){starting=false;recording=false;say(e.message||'I could not start the microphone. Please try again.');}}
 }
 async function toggleSpeech(){if(talk.interrupt())return;if(recording||companionInfo.feedback.voicing){await finishSpeech();return;}if(starting){cancelSpeech();return;}editing=false;input.blur();await beginSpeech(false);}
 avatar.onclick=()=>{if(avatarSuppressClick){avatarSuppressClick=false;return;}focusInput();};
 function openPanel(){noteInput();void companionInfo.toggle('Settings');}
 speechButton.onclick=()=>{if(avatarSuppressClick){avatarSuppressClick=false;return;}void toggleSpeech();};
 function browseReply(direction){
  if(recording||starting||transcribing)return;
  if(direction<0&&pageIndex>0){pageIndex--;render();guide?.onPage?.(pageIndex);return;}
  if(direction>0&&pageIndex<pages.length-1){pageIndex++;render();guide?.onPage?.(pageIndex);return;}
}
 previous.onclick=()=>browseReply(-1);next.onclick=()=>browseReply(1);
 panel.addEventListener('click',e=>{
  if(e.defaultPrevented||e.target.closest('a,button,input,textarea,select,summary,.companion-guide-content,.companion-thread,.companion-deck[data-unfold=true]')||window.getSelection()?.toString())return;
  if(panel.dataset.continue==='true'){browseReply(1);return;}
  // Clicking a conversation card expands the thread upward; clicking again folds it.
  if(panel.dataset.expandable==='true'||expanded)toggleThread();
 });
 // Scrolling up on a folded card unfolds the earlier turns above it.
 let wheelOpened=0;
 // A long reply scrolls itself first; the earlier turns open once it is at its top.
 const scrollsReply=(e:WheelEvent)=>log.dataset.scrollable==='true'&&log.contains(e.target as Node)&&(e.deltaY>0?log.scrollHeight-log.clientHeight-log.scrollTop>1:log.scrollTop>0);
 panel.addEventListener('wheel',e=>{if(!expanded&&e.deltaY<-2&&!scrollsReply(e)&&!threadList.contains(e.target as Node)&&panel.dataset.history!=='true'&&panel.dataset.expandable==='true'&&Date.now()-wheelOpened>400){wheelOpened=Date.now();e.preventDefault();e.stopPropagation();toggleThread(true);return;}
  // Over the front card, scrolling moves through the earlier cards above it.
  if(!threadList.hidden&&!threadList.contains(e.target as Node)&&!scrollsReply(e)){e.preventDefault();e.stopPropagation();threadList.scrollTop+=e.deltaY;return;}if(!e.target.closest('.companion-guide-content,.companion-thread-list')&&!scrollsReply(e)){e.preventDefault();e.stopPropagation();}else e.stopPropagation();},{passive:false});
 // origin 'system': Worldlet composed this request (a button), so it may quote
 // untrusted titles. It is never steered into a running task, never handled as a
 // local command and never carries user authority into tools.
 async function submit(request: string,trace?: any,invitation=false,origin: 'user'|'system'='user',displayText?:string,icon?:string,quiet=false){
  if(recording||starting||transcribing)return;
  // A request sent by a choice in Fox's card reads as the person's reply: its name, never the prompt.
  const chosen=choice&&Date.now()-choice.at<5000?choice:null;
  dismissed=false;peeking=false;supersedeGuide();
  const typed=typeof request!=='string',text=typed?input.value.trim():request.trim();if(!text)return;
  if(!typed&&chosen){displayText||=chosen.label;icon||='reply';}
  // An unchanged recovered draft retains its execution payload; editing it makes it
  // an ordinary manual message. Generated context is never put in the input.
  if(typed&&queuedDraft){
   const draft=queuedDraft;queuedDraft=null;
   if(text===draft.text){input.value='';for(const item of draft.turns)void submit(item.text,undefined,false,item.origin,item.displayText,item.icon);return;}
  }
  const shown=displayText?.trim()||text;
  // The person's own message (typed, spoken or a choice they clicked) is real use; only with a fresh gesture.
  if(!invitation&&origin==='user')reportEngagement('fox_message');
  trace??=foxTrace();
  // A follow-up sent before the stream ends must not disappear into a no-op.
  // Accept every submitted turn; assemble history only when its execution starts.
  // Only a person's turn with its own card takes an addition: a message sent during a quiet turn (the day's plan)
  // or Fox's invitation waits for its own card instead of vanishing into a turn that shows none (owner Order 2026-10-07).
  if(active&&steering&&!!turnEntry&&!quietTurn&&!displayText&&origin==='user'&&!chatRoute?.()&&activeView===recallKey(context.key,contentIdentity())){
   const turn=generation;
   if(typed){input.value='';editing=true;input.focus({preventScroll:true});}
   turnStatus='Updating with your message…';streamingReply=false;render();
   try{
    const result=await call('steer',{text});
    if(!result.accepted){
     if(turn!==generation){trace.finish({},'cancelled');return;}
     if(!active)return submit(text,trace);
     throw Error('The message was not added. It is kept in your draft.');
    }
    trace.mark('steerAcceptedMs');trace.finish({timings:{parentId:result.parentId}});
    // The added message heads the working card; the question before it moves up into the stack (owner Order 2026-10-07).
    if(turn===generation&&turnEntry){thread=threadSteer(thread,turnEntry,{user:text,at:Date.now()});saveRecall();render();}
   }catch(error){trace.finish({},'error');if(turn===generation){input.value=[text,input.value].filter(Boolean).join('\n\n');editing=true;turnStatus=error.message;render();}}
   return;
  }
  // A quiet turn waits for a free moment rather than queueing behind the person's turn.
  if(active&&quiet){trace.finish({},'cancelled');return;}
  if(active){queuedTurns.push({text,displayText,icon,trace,origin,session:recallKey(context.key,contentIdentity())});if(typed){input.value='';editing=true;input.focus({preventScroll:true});}render();return;}
  trace.mark('dequeuedMs');let turnResult={},outcome='complete',failureMessage='';turnActivity=undefined;turnKind='';
  if(typed){input.value='';clearTimeout(collapseTimer);editing=true;renderEntry();input.focus({preventScroll:true});}
  if(!invitation&&!quiet){rememberSpeechLanguage(shown);animateInput(shown);}turnReply=sameContext(reply)&&reply?.text?reply:frontReply();turnEntry='';if(!quiet)expanded=false;turnStatus='Getting ready…';active=true;quietTurn=quiet;const guided=root.dataset.onboardingLocked==='true',turn=++generation,requestContext=context.key,requestView=contentIdentity(),requestThread=activeThread(),requestLocation=context.title,directSession=!invitation&&origin==='user'&&!!chatRoute?.();let turnPartial='';streamingReply=false;if(!quiet)preview=!!reply?.text;render();
  const entryId=invitation||quiet?'':'turn:'+Date.now()+':'+turn;
  // The paired phone shows the turn as it streams (core/phone phoneLive): its steps and the reply so far.
  const live=(text:string,done=false)=>{if(!entryId)return;root.dispatchEvent(new CustomEvent('worldlet:fox-live',{detail:{id:entryId,key:requestContext,user:thread.find(e=>e.id===entryId)?.user||shown,steps:thread.find(e=>e.id===entryId)?.steps||[],text,done}}));};
  try{
   activeView=recallKey(requestContext,requestView);
   turnEntry=entryId;
   // The greeting or welcome back the person is answering joins the conversation above it.
   if(turnEntry&&/^(?:greeting|resume):/.test(String(turnReply?.id||''))&&turnReply.text)thread=threadLine(thread,{id:'line:'+turnEntry,key:requestContext,view:requestView,location:requestLocation,text:turnReply.text,at:Date.now()});
   if(turnEntry){thread=threadStart(thread,{id:turnEntry,key:requestContext,view:requestView,location:requestLocation,user:shown,...icon?{userIcon:icon}:{},at:Date.now()});saveRecall();render();live('');}
   const requestEnvironment={thread:FOX_MAIN_THREAD,key:requestContext,location:requestLocation,state:invitation?[greetingContext?.()?.lastVisited?.title?'Last browsed page: '+String(greetingContext().lastVisited.title).slice(0,100):'',context.detail].filter(Boolean).join('. '):context.detail,setup:answeredGuide,recentActions:recentActions.slice(-4),view:structuredClone(visibleContent()),...worldNow(root)};answeredGuide='';
   await recallReady;
   if(turn!==generation)return;
   let result=await call('chat',{text,shown,trace,invitation,origin,onStatus:(value,kind,activity?:FoxActivitySignal)=>{if(turn===generation){root.dispatchEvent(new Event('worldlet:fox-progress'));if(turnEntry){thread=threadStep(thread,turnEntry,value);live(turnPartial);}turnStatus=value;turnKind=kind||'';turnActivity=activity;streamingReply=false;render();}},onDelta:(partial,{appliedContext=false}={})=>{
    if(turn!==generation)return;root.dispatchEvent(new Event('worldlet:fox-progress'));
    // Buffer model text; only the completed answer replaces the reader's page.
    const visible=foxVisibleText(partial,true);if(visible.trim()){turnPartial=visible;live(turnPartial);}
   },history:threadHistory.get(FOX_MAIN_THREAD)||[],context:requestEnvironment});
   result={...result,...(guided?{candidateId:firstWinCandidate(result.message)}:{}),message:guided?guidedVisibleText(result.message):(foxVisibleText(result.message)||turnPartial)};
   turnResult=result;if(turn!==generation){outcome='cancelled';return;}
   // A quiet turn says nothing: what it made (an artifact) is its result.
   if(quiet)return;
   // A turn that ended with nothing to say leaves no card; the place keeps its last one.
   if(turnEntry){thread=result.message?threadFinish(thread,turnEntry,result.message,'done',result.usage):thread.filter(e=>e.id!==turnEntry);saveRecall();live(result.message||'',true);}
   if(!talk.on&&result.message&&(result.appliedContext||(context.key===requestContext&&contentIdentity()===requestView)))void onSpokenReply?.(result.message)?.catch(()=>{});
   if(!directSession){history=[...(threadHistory.get(requestThread)||[])];if(!invitation){history.push({role:'user',text:text.slice(0,2000)});if(result.message)history.push({role:'assistant',text:result.message.slice(0,2000)});}history=history.slice(-6);threadHistory.set(requestThread,history);if(result.message&&!result.appliedContext&&!entryId)rememberContext({id:'turn:'+turn,key:requestContext,view:requestView,text:result.message,location:requestLocation});saveRecall();}
   if(result.targetId&&context.key===requestContext&&contentIdentity()===requestView){execute('visit_place',{id:result.targetId,level:'place'});say(result.message,context.key,true,entryId);}
   // A view the turn's own tool opened (an artifact) is where its reply belongs: the context sync that follows must not clear it as a move.
   else if(result.appliedContext){contextAnchor=recallKey(context.key,contentIdentity());say(result.message,context.key,true,entryId);}
   else if(context.key===requestContext&&contentIdentity()===requestView)say(result.message,context.key,true,entryId);
  }catch(e){outcome=turn!==generation||isRequestCancellation(e)?'cancelled':'error';failureMessage=outcome==='cancelled'?'This task was interrupted. Try again to continue.':(!directSession&&modelFailure(e)?.message)||e.message||'Something went wrong. Please try again.';if(root.dataset.onboardingLocked!=='true'&&outcome==='cancelled')failureMessage='This reply was interrupted. You can try again.';/* The turn's own card: a stopped turn failing late must not touch the turn that replaced it. */if(entryId&&thread.find(x=>x.id===entryId)?.status==='working'){thread=threadInterrupt(thread,entryId,failureMessage);saveRecall();live(failureMessage,true);}if(turn===generation&&!quiet)say(failureMessage,context.key,true,entryId);}
  finally{/* A turn superseded before it answered (the early returns above) never stays working. */if(entryId&&thread.find(x=>x.id===entryId)?.status==='working'){const interrupted='This reply was interrupted. You can try again.';thread=threadInterrupt(thread,entryId,interrupted);saveRecall();live(interrupted,true);}trace.finish(turnResult,outcome);/* What Fox said at the turn's end, for the page's finished status card (browser-device.ts). */window.dispatchEvent(new CustomEvent('worldlet:fox-reply',{detail:{outcome,message:outcome==='complete'?String((turnResult as any).message||''):failureMessage}}));if(turn===generation){turnEntry='';quietTurn=false;life.finish(outcome==='complete',{blocked:outcome==='error'});active=false;streamingReply=false;const followup=queuedTurns.shift();render();if(followup){if(followup.session&&followup.session!==recallKey(context.key,contentIdentity())){const drafts=[followup,...queuedTurns,...(input.value.trim()?[{text:input.value.trim(),origin:'user'}]:[])];input.value=drafts.map(t=>t.displayText||t.text).join('\n\n');queuedDraft={text:input.value,turns:drafts};for(const queued of [followup,...queuedTurns])queued.trace.finish({},'cancelled');queuedTurns=[];editing=true;say('Your queued messages are kept as a draft because the view changed.');}else void submit(followup.text,followup.trace,false,followup.origin,followup.displayText,followup.icon);}else window.dispatchEvent(new Event('worldlet:fox-idle'));}/* Talk reads the reply, then listens again; a queued follow-up answers first. */if(!quiet&&!invitation&&!active&&talk.phase==='thinking')void talk.replied(outcome==='complete'?String((turnResult as any).message||''):outcome==='error'?failureMessage:'');}
  return {outcome,...(guided?{candidateId:(turnResult as any).candidateId}:{}),...(outcome==='complete'?{text:(turnResult as any).message||''}:{}),...(failureMessage?{message:failureMessage}:{})};
 }
 window.addEventListener('worldlet:speech',(e: any)=>{
 if(e.detail?.phase==='spoken'){talk.spoken();return;}
 // The wake word (the host's local listener): its state shows on the microphone, and hearing it starts Talk with what
 // was said after it, if anything.
 if(e.detail?.phase==='wake-state'){wakeState=String(e.detail.text||'off');render();return;}
 if(e.detail?.phase==='wake'){if(!talk.on&&!ordering&&!recording&&!starting&&!transcribing&&root.dataset.onboardingLocked!=='true'){noteInput();dismissed=false;talk.start(String(e.detail.text||''));}if(!talk.on)void call('speechTalk',{active:false}).catch(()=>{});return;}
 if(!recording&&!starting&&!transcribing)return;
  const value=e.detail;
  if(value.phase==='level'){waveform.style.setProperty('--voice-level',String(Math.max(0,Math.min(1,Number(value.text)||0))));if(!ordering)talk.level(Number(value.text)||0);return;}
  // Draft speech stays in the input line; only the final transcript executes.
  if(value.phase==='partial'){renderEntry();}
  else if(value.phase==='processing'){recording=false;starting=false;transcribing=true;if(ordering)orderSending();render();}
  else if(value.phase==='final'){
   recording=false;starting=false;transcribing=true;if(ordering)orderSending();render();
   const turn=speechGeneration;clearTimeout(finalTimer);finalTimer=setTimeout(()=>{if(turn!==speechGeneration)return;transcribing=false;render();if(ordering)void sendOrder(value.text||'');else if(talk.heard(value.text||''))return;else if(value.text?.trim())submit(value.text);else say('I didn’t catch that. Use the microphone to try again.');},0);
  }else if(value.phase==='error'){if(talk.on&&!ordering&&/did not hear|didn’t catch|did not catch/i.test(String(value.text||''))){cancelSpeech('talk');talk.missed();}else{cancelSpeech('speech_error');say(value.text||'I couldn’t hear you. Use the microphone to try again.');}}
 });
 // Global shortcuts apply only to the world canvas, never to forms, dialogs,
 // reader controls, browser fields, games (Space casts or pauses there), modifier
 // shortcuts or an IME composition.
 const keyboardTarget=target=>!root.querySelector('#notionDialog').open&&!target.closest('input,textarea,select,[contenteditable],a,button,[role="button"],summary,[role="dialog"],.game-board');
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&root.querySelector('#companionInfo')?.open)return;
  if(root.dataset.onboardingLocked==='true'||!holdToSpeak||e.defaultPrevented||e.isComposing||e.metaKey||e.ctrlKey||e.altKey||!keyboardTarget(e.target))return;
  if(e.code==='Space'){
   e.preventDefault();
   if(e.repeat||keyPress||recording||starting||transcribing)return;
   keyPress={held:false};root.classList.add('is-pressing-fox');
   if(!active||(steering&&!chatRoute?.()))keyHoldTimer=setTimeout(()=>{if(!keyPress)return;keyPress.held=true;editing=false;input.blur();beginSpeech(true);},280);
  }
 },true);
 // ⌘B (Ctrl+B on Windows) presses the bug button, Order or Feedback (owner Order 2026-10-07), anywhere but a rich-text
 // field, where it means bold; a website page in Worldlet's browser keeps its own keys.
 const mac=/Mac|iPhone|iPad/i.test(navigator.platform);
 window.addEventListener('keydown',e=>{
  if(e.code!==('KeyB')||!(mac?e.metaKey&&!e.ctrlKey:e.ctrlKey&&!e.metaKey)||e.altKey||e.shiftKey||e.repeat||e.isComposing||e.defaultPrevented)return;
  if(orderButton.hidden||!orderButton.isConnected||root.dataset.onboardingLocked==='true'||root.dataset.onboarding==='true'||(e.target as Element)?.closest?.('[contenteditable]:not([contenteditable=false])'))return;
  e.preventDefault();orderButton.click();
 },true);
 window.addEventListener('keyup',e=>{
  if(!holdToSpeak||e.code!=='Space'||!keyPress)return;
  e.preventDefault();e.stopImmediatePropagation();const held=keyPress.held;clearKeyPress();
  // Keyboard button activation must not re-open typing after a voice hold. A tap of Space opens typing to Fox (owner
  // Order 2026-10-07: 「空格是输入，长按空格是语音」).
  if(held)finishSpeech();else focusInput();
 },true);
 window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&(root.querySelector('#companionInfo')?.open||root.querySelector('#notionDialog')?.open))return;
  // A tour on screen takes Esc first (tour-spotlight.ts ends a replay), even over a reply preview it covers.
  if(e.key==='Escape'&&root.dataset.tourSpotlight==='true')return;
  if(e.key==='Escape'&&expanded&&!active){e.preventDefault();e.stopImmediatePropagation();toggleThread(false);return;}
  if(e.key==='Escape'&&(active||recording||starting||transcribing||preview||editing||avatarPress||keyPress)){e.preventDefault();e.stopImmediatePropagation();clearKeyPress();clearAvatarPress();editing=false;input.blur();if(active||recording||starting||transcribing)stop();else hidePreview();}
 },true);
 // With a reader open, Fox has a column of its own on the right and the world is
 // not underneath any of it. Nothing there is a click "away" from Fox, so what it
 // was saying stays said.
 root.addEventListener('pointerdown',e=>{
  if(root.dataset.detailOpen==='true')return;
  if((e as any).worldletKeepFox||e.target.closest('.notion-pin[data-page="place-app-youtube"]')){e.preventDefault();return;}
  if(!e.target.closest('.companion-dialogue,.companion-pet,.companion-text-entry,.world-actions'))hidePreview(true);
 });
 // Native hosts publish deactivation even when Chromium misses window blur.
 window.addEventListener('worldlet:app-inactive',()=>{talk.stop();if(ordering)leaveDuringOrder();else cancelSpeech();});
 window.addEventListener('pagehide',()=>cancelSpeech('page_closed'));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)return;talk.stop();if(ordering)leaveDuringOrder();else cancelSpeech();});
 window.addEventListener('blur',()=>{clearKeyPress();if(!input.value.trim())editing=false;input.blur();clearTimeout(recallTimer);hud.querySelectorAll('.companion-input-flight').forEach(e=>{e.getAnimations().forEach(a=>a.cancel());e.remove();});clearAvatarPress();hoverInput=false;talk.stop();if(ordering)leaveDuringOrder();else if(recording||starting||transcribing)cancelSpeech();render();});
 mountMicrophonePicker({anchor:speechButton,list:()=>call('microphones'),talk:talkVoice&&holdToSpeak?{get active(){return talk.on;},toggle:()=>{if(root.dataset.onboardingLocked!=='true')talk.toggle();}}:null});
 window.addEventListener('worldlet:microphone-fallback',(e:any)=>setStatus(e.detail,{source:'microphone',speech:true}));
 const companionInfo=mountCompanionInfo({root,pet,call,getName:()=>companionName});
 // The settings button beside Fox is the way into the panel; the panel's own entry button stays out of the World.
 companionInfo.entry.remove();
 const openEnergy=async()=>{try{if(isDesktopCompanion())await requireWorldSurface(call);await companionInfo.open('Energy');}catch(error){setStatus(error.message||'Could not reopen World. Try again.');}};
 // Low energy: Fox says so once, with a way to charge, unless another guide or setup is showing.
 const energyWatch=watchWorldEnergy({call,say:text=>{
  if(guide||root.dataset.onboarding==='true')return false;
  const charge=make('button','','Charge'),later=make('button','','Not now');charge.type=later.type='button';
  charge.onclick=()=>{api.setGuide(null,{only:'energy'});void openEnergy();};later.onclick=()=>api.setGuide(null,{only:'energy'});
  api.setGuide({source:'energy',takeover:false,text,actions:[charge,later]});return true;
 },needed:text=>{
  // No model on this computer: Fox points to Settings, Model, where it is chosen (owner request 2026-10-05).
  if(guide||root.dataset.onboarding==='true'||root.dataset.onboardingLocked==='true'||root.classList.contains('companion-info-open'))return false;
  const choose=make('button','','Choose a model'),later=make('button','','Not now');choose.type=later.type='button';
  choose.onclick=async()=>{api.setGuide(null,{only:'model-needed'});try{if(isDesktopCompanion())await requireWorldSurface(call);await companionInfo.open('Settings','model');}catch(error){setStatus(error.message||'Could not reopen World. Try again.');}};
  later.onclick=()=>api.setGuide(null,{only:'model-needed'});
  api.setGuide({source:'model-needed',takeover:false,text,actions:[choose,later]});api.revealGuide();return true;
 }});
 // Said once the panel closes, when it was open as no model was found.
 root.addEventListener('worldlet:companion-info-closed',()=>void energyWatch.refresh());
 // An Applet task Fox handed off ended: Fox says its result once the conversation is free.
 mountAppletTaskResults({busy:()=>active,say:line=>{
  const open=make('button','',line.open);open.type='button';
  open.onclick=()=>{api.setGuide(null,{only:'applet-task:'+line.id});root.appletLayout?.open?.(line.applet);};
  api.setGuide({source:'applet-task:'+line.id,takeover:false,text:line.text,remember:true,actions:line.applet?[open]:[]});api.revealGuide();
 }});
 // Fox speaks first at a quiet moment, when it has one line worth saying (fox-proactive.ts); never while a tour
 // step shows or the phone step after the first win is still to come (Mac RC 3017, 3035).
 mountFoxProactive({call,
  thread:()=>onDesktop()||root.dataset.onboarding==='true'||root.dataset.onboardingLocked==='true'||!!root.dataset.tourStep||!!root.dataset.tourCoda?'':segmentNow(),
  world:()=>context.key.split(':')[0]==='overview'&&!contentIdentity(),
  busy:()=>active||streamingReply||recording||starting||transcribing||editing||!!input.value.trim()||!!guideShown||guideHere(guide)||root.classList.contains('companion-info-open'),
  environment:()=>({key:context.key,location:context.title,state:context.detail,recentActions:recentActions.slice(-4),view:visibleContent(),...worldNow(root)}),
  say:line=>{api.setGuide({source:'proactive:'+line.id,takeover:false,text:line.text,remember:true,actions:[],browsing:line.browsing});api.revealGuide();}
 });
 void call('foxBrowse',{}).then(r=>showBrowse(r?.on),()=>{});
 const backToWorld=make('button','companion-world-button');backToWorld.type='button';backToWorld.innerHTML=uiIcon('home');backToWorld.title='Back to World';backToWorld.setAttribute('aria-label','Back to World');
 backToWorld.onclick=async e=>{e.stopPropagation();backToWorld.disabled=true;try{await requireWorldSurface();}catch{setStatus('Could not reopen World. Try again.');}finally{backToWorld.disabled=false;}};
 controls.prepend(backToWorld);
 root.addEventListener('worldlet:companion-info-opened',()=>panelButton.dataset.panelOpen='true');
 root.addEventListener('worldlet:companion-info-closed',()=>delete panelButton.dataset.panelOpen);
 root.addEventListener('worldlet:companion-info-closed',()=>{clearAvatarPress();clearKeyPress();});
 render();
 let worldContext=context;
 // Choices in Fox's card: pressing one is the person's reply (see `choice`).
 const choiceButtons=new WeakSet<HTMLElement>();
 function bindGuide(value){
  if(!guidePlace.has(value)&&!GLOBAL_GUIDE.test(String(value.source||'')))guidePlace.set(value,segmentNow());
  if(value.follows==='last-reply'&&lastReply?.entry&&sameContext(lastReply))guideEntry.set(value,lastReply.entry);
 }
 const api={
  /** A place's latest turns (newest last), for the paired phone's dialogue: what the person said, Fox's answer or its
   * current step while it works. */
  threadOf(key:string,count=4){return thread.filter(e=>e.key===key).slice(-count).map(e=>({user:e.user,text:e.text,status:e.status,step:e.steps.at(-1)||'',at:e.at}));},
  setAttentionActions(actions:HTMLElement[]){attentionActions.replaceChildren(...actions);attentionActions.hidden=!actions.length;render();},
  revealGuide(){dismissed=false;peeking=false;render();},
  setStatus,
  setGuide(value,{forget=false,only=null}={}){if(only&&guide?.source!==only)return;if(!value&&(!dismissed||forget))dismissedGuide=null;if(value)dismissedGuide=null;if(!value&&guide?.source==='model-setup'&&root.dataset.onboarding==='true'){root.dataset.onboarding='false';queueMicrotask(()=>root.dispatchEvent(new Event('worldlet:recommendations')));}/* A guide is a line said now: it takes the front at once, even during a turn (natural order). */if(value){for(const button of value.actions||[])if(button instanceof HTMLElement&&!choiceButtons.has(button)){choiceButtons.add(button);button.addEventListener('click',()=>{choice={label:button.textContent.trim(),at:Date.now()};},{capture:true});}if(choice&&Date.now()-choice.at<5000){value.answered=choice.label;choice=null;}}if(value?.takeover){editing=false;input.blur();}if(value)bindGuide(value);guide=value;guideTurn=value&&active?generation:-1;guideActions.replaceChildren(...(value?.actions||[]));guideContent.replaceChildren(...(value?.body?[value.body]:[]));if(value){if(value.remember&&value.text){reply={id:'attention:'+Date.now(),text:value.text,key:context.key,view:contentIdentity(),location:context.title};lastReply=reply;rememberContext(reply);const turns=threadHistory.get(FOX_MAIN_THREAD)||[];if(turns.at(-1)?.text!==value.text){threadHistory.set(FOX_MAIN_THREAD,[...turns,{role:'assistant',text:value.text}].slice(-6));saveRecall();}}preview=false;expanded=false;}render();if(value?.onPage&&pageIndex===0)value.onPage(0);},
  setContext(value){if(!value)return;worldContext=value;if(onDesktop())value={key:'overview:desktop',title:'Desktop Companion',detail:'The world window is closed. Fox is a desktop companion. No Applet or desktop content is visible; do not infer what is on the user’s screen.'};/* A turn that opened a view (an artifact) said its answer there before the World's context caught up: that is not the person moving, so the answer stays. */const anchor=recallKey(value.key,contentIdentity()),saidHere=!!reply?.text&&reply.key===value.key&&reply.view===contentIdentity(),changed=contextAnchor!==anchor&&!saidHere;contextAnchor=anchor;if(changed){peeking=false;hoverReply=null;reply=null;preview=false;expanded=false;}
   if(changed){
    // A guide stays the newest line of the place it appeared in (bindGuide), like a reply,
    // and shows only there; the person's next message or Fox's next reply supersedes it.
    const keep=value=>value&&!value.source?.startsWith('focus:');
    if(!keep(guide))guide=null;if(!keep(dismissedGuide))dismissedGuide=null;
    clearKeyPress();clearAvatarPress();if(!ordering&&(recording||starting||transcribing)){/* Talk keeps listening in the new place. */if(talk.phase==='listening'){cancelSpeech('talk');talk.missed();}else if(talk.overhearing){cancelSpeech('talk');talk.dropped();}else cancelSpeech();}if(!active){reply=null;preview=false;}
   }context=value;
   // Arriving back in the world, Fox stays quiet: the last line shows again only on hover or a click (owner Order 2026-10-07).
   scheduleRender();
  },
  recordAction(action){recentActions.push({id:action.id.slice(0,160),label:action.label.slice(0,200),location:context.title.slice(0,200),result:context.detail.slice(0,400)});recentActions=recentActions.slice(-4);},
  contextSnapshot:()=>({thread:activeThread(),key:context.key,location:context.title,state:context.detail,recentActions:recentActions.slice(-4),view:visibleContent()}),
  recommendedActions,visibleActionIds,
  get guideSource(){return String(guide?.source||dismissedGuide?.source||'')},get lastReplyText(){return String(lastReply?.text||'')},get expanded(){return preview},beginDialogue:()=>{dismissed=false;preview=true;render();},get active(){return active||recording||starting||transcribing},cancel:stop,openVoice:()=>beginSpeech(),hidePreview,
  /** An Order said on the paired phone (core/phone `order`): sent like the Order button's, from place `Phone`. */
  order:(said:string)=>said.trim()?placeOrder(said,'Phone'):undefined,
  /** Work Worldlet starts by itself (the day's plan and summary) in a background session beside the conversation
   * (owner Order 2026-10-07): no card, no reply line, and the person can talk to Fox meanwhile. */
  background:(text:string,{displayText}:{displayText?:string}={})=>call('background',{text,shown:displayText,context:{thread:FOX_MAIN_THREAD,key:context.key,location:context.title,state:context.detail,view:structuredClone(visibleContent()),...worldNow(root)}}),
  openText:focusInput,sync:scheduleRender,submit,ask:(text: string,{origin='user',displayText,icon,quiet=false}: {origin?: 'user'|'system';displayText?:string;icon?:string;quiet?:boolean}={})=>submit(text,undefined,false,origin,displayText,icon,quiet)
 };
 window.addEventListener('worldlet:desktop-companion',()=>api.setContext(worldContext));
 if(onDesktop())api.setContext(worldContext);
 return api;
}}
