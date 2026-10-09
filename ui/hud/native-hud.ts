import {mountDevBuildUpdate,commitAge} from './dev-build-update.ts';
import {hostFeatures} from '../../platform/bridge/features.ts';
import {refreshItemPage} from '../../core/items/index.ts';
import {sourcesReading} from '../../core/applets/index.ts';
import {fitAttentionPanel} from './fit-attention-panel.ts';
import {mountWorldLog} from './world-log.ts';
import {summarizeRequest} from '../../core/agent/index.ts';
import {callHost} from '../../platform/bridge/host.ts';
import {isDesktopCompanion,requireWorldSurface} from '../companion/index.ts';
import {displayReleaseVersion} from '../distribution/index.ts';
import {attentionOrder,attentionFocusSet,attentionFocusFit,attentionFocusEvidence,attentionRelevant,attentionRankSignals} from '../../core/attention/index.ts';
import {appHudIcon,momentLine} from '../applets/index.ts';
import {worldletMark} from '../components/index.ts';
import {collectMatters} from '../attention/index.ts';
import {attentionLevel} from '../../core/attention/index.ts';
import {attentionIcon,attentionReturnWhen,attentionGroupWhen} from '../attention/index.ts';
import {WORLD_UI} from '../components/index.ts';
import {roomObjects} from '../world/index.ts';
import {collectNativeActions,upcomingEvents} from '../shell/index.ts';
import {uiIcon as hudIcon} from '../components/index.ts';
import {actionButton,node,taskRow} from '../components/index.ts';
const el:(tag:string,cls?:string,text?:unknown)=>any=node;
// The groups are named the way a person would say them, not after the kinds they
// hold: what is about to happen, what is owed, what is only worth knowing.
const ATTENTION_GROUPS=[['event','Coming Up'],['needsAction','Worth Doing'],['unseen','Worth Knowing']];
export function mountNativeHUD({root,updates,connectApplet,snapshot,open,visitArea,visitSpace,visitBuilding,visitObject,focusContent,showSearch,connect,original,chat,back,home,leaveApplet=back,dialog,contextual=()=>null,tasks=()=>[],storage,previewAttention=(_item)=>false,itemActions,onDecision,sample=()=>false,toggleSample,onAttention=null,widgets=()=>[],openWidget=(_id:string)=>{},ongoing=()=>[],openOngoing=(_id:string)=>{},calendar=()=>[],openCalendar=(_event:any)=>{}}){
 for(const [key,value]of Object.entries(WORLD_UI))root.style.setProperty('--world-ui-'+key,value);
 // The guided tour points at the Center; it is drawn, with its reading state, even while empty.
 root.addEventListener('worldlet:attention-introduce',()=>refitMatters());
 window.addEventListener('worldlet:attention-focus',(event:any)=>{root.dataset.attentionFocus=event.detail?.mode||'auto';renderMatters(snapshot());});
 const hud=root.querySelector('#notionHUD'),row=root.querySelector('.notion-shortcuts'),input=root.querySelector('#notionInput');
 root.querySelector('#notionNext').hidden=true;
 const actionsRow=el('div','world-actions');actionsRow.setAttribute('aria-label','Suggested actions');row.append(actionsRow);root.addEventListener('worldlet:return-world',home);
 const context=el('div','world-context'),backButton=root.querySelector('#notionBack'),nav=root.querySelector('#notionBreadcrumb');backButton.innerHTML=hudIcon('back');backButton.setAttribute('aria-label','Back to previous level');backButton.title='Back';backButton.onclick=()=>{const pane=root.querySelector('#notionDialog');if(pane.open)pane.close();else back();};backButton.classList.add('scene-control');backButton.append(el('span','','Back'));context.append(nav);const location=el('div','world-location');location.append(root.querySelector('.notion-tools'));root.append(context);root.querySelector('.notion-top').append(location);root.append(root.querySelector('#notionContent'));const area=el('section','world-area');area.setAttribute('aria-label','Place details');area.hidden=true;root.append(area);
 const titleLogo=el('img','companion-app-logo');titleLogo.alt='';titleLogo.hidden=true;
 const titleIcon=el('span','companion-context-icon');titleIcon.setAttribute('aria-hidden','true');titleIcon.hidden=true;
 root.querySelector('.companion-context')?.prepend(titleIcon);root.querySelector('.companion-context')?.prepend(titleLogo);
 // Inside an Applet its top bar holds its controls as icon circles beside the title: one Back on
 // its left (owner feedback 2026-10-04: no second World button); the Applet's own controls (Picture in
 // picture, the Native / Web switch, which find .applet-bar-controls) on its right. A website page's Back,
 // Forward, Refresh, Home, address and Focus are its toolbar's, in the panel (owner request 2026-10-09).
 // What Fox can do here, such as Summarize in Mail, sits beside Fox in its dock, not in the bar.
 const barLeft=el('div','applet-bar-side applet-bar-left'),barRight=el('div','applet-bar-side applet-bar-right'),barControls=el('div','applet-bar-controls');
 barRight.setAttribute('aria-label','Applet controls');barRight.append(barControls);
 const barTitle=root.querySelector('.companion-context');if(barTitle)barTitle.after(barLeft,barRight);else root.append(barLeft,barRight);barControls.append(...root.querySelectorAll(':scope>.browser-pip-offer,:scope>.browser-make-applet,:scope>.applet-mode-toggle'));
 // The sides sit against the title wherever it is drawn (its centering is a transform), on its
 // row; when a narrow window stacks the title below the bar they start the bar instead.
 function placeBar(){
  const title=root.querySelector(':scope>.companion-context'),style=getComputedStyle(root);
  const size=(name,fallback)=>parseFloat(style.getPropertyValue(name))||fallback,top=size('--applet-bar-top',16),height=size('--applet-bar-height',44),start=size('--applet-bar-start',16),leftWidth=barLeft.offsetWidth;
  // The wider side with its gap, on either side of the title: the left one from the bar's start (after the traffic
  // lights), the right one from the bar's plain inset, so a website page's five controls still leave the title its room
  // in the smallest Mac window. The title's room follows from it, so it is set before the title is measured: placed from
  // the title's old box, a control that just appeared would jump a frame later, under the pointer.
  root.style.setProperty('--applet-bar-side',Math.max(Math.max(leftWidth,44)+start,barRight.offsetWidth+16)+10+'px');
  const box=root.getBoundingClientRect(),t=title?.getBoundingClientRect();
  // Under the Applet shelf (ui/hud/applet-shelf.ts) the title gives way to the shelf: Back starts the bar's row and the
  // Applet's controls end it at the edge of the Applet's side; the shelf's + stands just before them.
  if(root.hasAttribute('data-applet-shelf')){
   const lane=Math.max(box.width/3,464),end=box.width-lane-16;
   Object.assign(barLeft.style,{left:start+'px',top:top+'px'});Object.assign(barRight.style,{left:Math.max(start,end-barRight.offsetWidth)+'px',top:top+'px'});
   root.style.setProperty('--applet-shelf-controls',(barRight.offsetWidth?barRight.offsetWidth+8:0)+16+'px');return;
  }
  const stacked=!t?.width||t.top-box.top>=top+height,y=stacked?top:t.top-box.top+t.height/2-height/2;
  Object.assign(barLeft.style,{left:(stacked?start:t.left-box.left-10-leftWidth)+'px',top:y+'px'});
  Object.assign(barRight.style,{left:(stacked?start+(leftWidth?leftWidth+8:0):t.right-box.left+10)+'px',top:y+'px'});
 }
 let barFrame=0;const queueBar=()=>{if(!barFrame)barFrame=requestAnimationFrame(()=>{barFrame=0;placeBar();});};
 if(typeof ResizeObserver!=='undefined'){
  const watch=new ResizeObserver(queueBar);for(const e of [root,barLeft,barRight,root.querySelector('.companion-context')])if(e)watch.observe(e);
  // A new depth moves the title by its stylesheet: place the sides before that frame paints.
  new MutationObserver(placeBar).observe(root,{attributes:true,attributeFilter:['data-depth','data-detail-open','data-applet-shelf','class']});
 }
 const tracker=el('nav','world-task-tracker ui-theme-attention');tracker.setAttribute('aria-label','Attention Center: Coming Up, Worth Doing and Worth Knowing');
 const trackerList=el('div','world-task-list');tracker.append(trackerList);root.append(tracker);
 // Today heads the Attention Center, standing above it even when it is empty (owner request 2026-10-08, "把今天的日期、天气之类的放到左边去，放到左边 Attention Center
 // 上面，然后你随时一点就可以看到今天的计划"): the date and clock open the Journal on today's page, where the morning
 // brief stands first, and the weather beside them keeps opening the forecast. The live nodes move here from the World's
 // corner, so the clock and the weather go on updating themselves; the sound comes too (owner request 2026-10-08).
 const today=el('div','world-today ui-theme-today'),todayOpen=el('button','world-today-open');todayOpen.type='button';
 // It is where the Journal lives (owner request 2026-10-08: "收到左上角 journal 就行了，让人知道这是 journal 的位置"):
 // the book's mark and name under the date, and closed cards fly in here.
 todayOpen.setAttribute('aria-label','Journal: open today’s page');todayOpen.setAttribute('aria-controls','journalBook');
 const todayHint=el('span','world-today-hint');todayHint.innerHTML=hudIcon('book')+'<span>Journal · Today’s plan</span>';
 const dateTime=root.querySelector('.notion-top .world-date-time'),weatherControl=root.querySelector('.notion-top .world-weather-control');
 if(dateTime){todayOpen.append(dateTime,todayHint);today.append(todayOpen);}
 if(weatherControl)today.append(weatherControl);
 // The World's sound joins them when it is already there (world-audio.ts puts it here when it comes later).
 const sound=root.querySelector('.notion-top .world-audio');if(sound)today.append(sound);
 todayOpen.onclick=()=>{if(root.dataset.tourLock==='true'||root.dataset.tourSpotlight==='true')return;const now=new Date(),day=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day}}));};
 if(today.childElementCount)root.append(today);
 // The last child of the list: trimming keeps it, and the panel stays centered as one.
 const trackerMore=el('div','world-task-more');trackerMore.hidden=true;
 const previousBrand=root.querySelector('#notionHome'),brand=el('div','world-watermark');brand.id='notionHome';previousBrand.remove();
 const channel=typeof __WORLDLET_CHANNEL__==='undefined'?'release':__WORLDLET_CHANNEL__,isDev=channel==='dev';brand.dataset.channel=channel;
 // The website is the first footer row; build details sit below.
 const identity=el('a','world-brand','worldlet.ai');
 identity.href='https://worldlet.ai';identity.rel='noreferrer';identity.title='Open worldlet.ai';
 identity.insertAdjacentHTML('afterbegin',worldletMark());brand.append(identity);
 const build=typeof __WORLDLET_BUILD__==='undefined'?null:__WORLDLET_BUILD__;
 if(isDev){
  const revision=typeof __WORLDLET_REVISION__==='undefined'?'local':__WORLDLET_REVISION__,committed=typeof __WORLDLET_REVISION_TIME__==='undefined'?'':__WORLDLET_REVISION_TIME__;
  const line=el('span','world-build-version'),current=el('span','world-build-current'),prefix='Development · '+(typeof __WORLDLET_WORKSPACE__==='undefined'?'':__WORLDLET_WORKSPACE__+' · ')+revision;
  // How old the running commit is, refreshed each minute.
  const age=()=>{current.textContent=[prefix,commitAge(committed)].filter(Boolean).join(' · ');};age();setInterval(age,60000);
  if(committed)current.title='Committed '+new Date(committed).toLocaleString();
  line.append(current);brand.append(line);
 }
 else if(build)brand.append(el('span','world-build-version','v'+displayReleaseVersion(build.version,build.build)));
 const updateButton=el('button','world-footer-update ui-button');updateButton.type='button';updateButton.hidden=true;
 const updateDock=el('div','world-update-dock');updateDock.setAttribute('aria-label','App update');updateDock.append(updateButton);root.append(updateDock);updateDock.addEventListener('pointerdown',e=>{(e as any).worldletKeepFox=true;});
 // Dev: a prepared newer build gets the same capsule as Update, in the same dock.
 if(isDev)mountDevBuildUpdate(updateDock);
 let updateBusy=false;
 const syncUpdate=()=>{const value=updates?.snapshot();updateButton.hidden=!value?.visible;updateButton.disabled=updateBusy||!value?.enabled;updateButton.textContent=value?.label||'Update';updateButton.title=value?.detail||'Update Worldlet';};
 updateButton.onclick=async()=>{if(updateBusy||updateButton.disabled)return;updateBusy=true;syncUpdate();try{await updates.activate();}catch(error){updates.failure?.(error);}finally{updateBusy=false;syncUpdate();}};
 // Settings live in the companion panel (ui/companion/companion-settings.ts); the World lends it the
 // sample world switch and which host features exist.
 root.companionSettingsHost={toggleSample,sample:()=>!!sample(),localDataDeletion:()=>!!hostFeatures(snapshot().data).localDataDeletion};
 root.append(brand);
 // The next scheduled check, bottom right; the full log is the companion panel's History page.
 const worldLog=mountWorldLog({root,call:callHost,sample,connections:()=>snapshot().data.moduleConnections||[],
  // The phone's Applet world shows each Applet's latest lines and what it is doing now.
  onLines:(lines,now)=>window.dispatchEvent(new CustomEvent('worldlet:world-log',{detail:{lines,now}}))});
 root.querySelector('#notionAccount').innerHTML=hudIcon('spark');
 const sampleLabel=el('span','world-sample-label',snapshot().data.localArchive?'Local Notion':'');sampleLabel.hidden=true;root.querySelector('.notion-tools').prepend(sampleLabel);
 window.addEventListener('worldlet:job',(e: any)=>{const value=e.detail;chat()?.setStatus(snapshot().data.sample?'':value.error||'',{source:'job',persistent:true});});
 let panelLocation='',actionSignature='';
 let model={activities:[],actions:[]},tracked=[],display=[],pending=false,forceNext=false,lastRead=null,busy=new Set(),pointerHeld=false;
 function savedDecisions(){try{const value=JSON.parse(storage?.getItem('decisions')||'[]');return Array.isArray(value)?value.filter(v=>typeof v==='string'):[];}catch{return [];}}
 const completed=new Set(savedDecisions());
 const isFrozen=()=>pointerHeld||!forceNext&&((root.contains(document.activeElement)&&[input,actionsRow,barLeft,barRight].some(e=>e===document.activeElement||e.contains(document.activeElement)))||[actionsRow,barLeft,barRight].some(e=>e.matches(':hover')));
 // The sample's tour is walked by Next; it does not also file its stops as updates.
 // What the sample asks for is what its Applets published, like any other world.
 function collect(){const s=snapshot();return collectNativeActions({...s,decisions:s.data.sampleDecisions,completed,lastRead});}
 function button(action){const b=actionButton({...action,run:()=>run(action.id)});b.classList.add('world-capsule');b.dataset.actionId=action.id;b.dataset.state=action.state||'available';b.title=action.label+(action.description?' — '+action.description:'');const target=action.pageId?snapshot().pages.get(action.pageId)?.title:snapshot().sections.find(s=>s.id===action.placeId)?.title;b.setAttribute('aria-label',action.label+(target?': '+target:''));return b;}

 function decide(d,choice){const before=snapshot();const previous={depth:before.depth,id:before.current};const r=onDecision?.(d,choice);if(r?.error)throw Error(r.error);if(previous.depth==='object')visitObject(previous.id);completed.add(d.id);storage?.setItem('decisions',JSON.stringify([...completed]));forceNext=true;sync();}
 function options(){const s=snapshot(),custom=contextual(),list=custom?.actions?[...custom.actions]:[...model.actions];
 const nav=(id,label,run,placement='navigation')=>({id:'nav:'+id,label,run,kind:'navigation',placement});
 const overlay=root.querySelector('#notionDialog');if(overlay.open&&overlay.dataset.kind==='settings')return [...overlay.querySelectorAll('#notionDialogBody>button')].map((b,i)=>nav('settings:'+i,b.textContent,()=>b.click()));
 if(!custom?.actions){const decision=(s.data.sampleDecisions||[]).find(d=>d.pageId===s.current&&!completed.has(d.id));if(decision)for(const [i,choice]of decision.choices.entries())list.unshift(nav(decision.id+':'+i,choice,()=>{decide(decision,choice);},'contextual'));if(s.depth==='overview'){for(const b of s.buildings||[])list.push(nav(b.id,b.title,()=>visitBuilding(b.id)));if(!s.buildings?.length)for(const r of s.sections)list.push(nav(r.id,r.title,()=>visitSpace(r.id)));}
 else if(s.depth==='area'){for(const b of s.buildings.filter(b=>b.areaId===s.current))list.push(nav(b.id,b.title,()=>visitBuilding(b.id)));}
 else if(s.depth==='building'){for(const id of s.buildings.find(b=>b.id===s.current)?.rooms||[]){const r=s.sections.find(r=>r.id===id);if(r)list.push(nav(r.id,r.title,()=>visitSpace(r.id)));}}
 else if(s.depth==='room'){const r=s.sections.find(r=>r.id===s.currentSpace);for(const o of r?roomObjects(r,s.pages,s.composites):[])list.push(nav(o.id,o.title,()=>visitObject(o.id)));}
 else if(s.depth==='object'){const r=s.sections.find(r=>r.id===s.currentSpace),o=r&&roomObjects(r,s.pages,s.composites).find(o=>o.id===s.current);for(const id of o?.pageIds||[]){const p=s.pages.get(id);if(p)list.push(nav('detail:'+id,'Details',()=>open(id),'contextual'));}}}

 if(custom?.extra)list.unshift(...custom.extra);
if(s.depth==='note'&&s.current){const p=s.pages.get(s.current);if(p?.sourceId)list.push({id:'original:'+p.id,pageId:p.id,kind:'original',placement:'contextual',label:'View original',icon:'file'});if(!s.data.sample&&!p?.pending)list.push({id:'summarize:'+s.current,pageId:s.current,kind:'summarize',placement:'contextual',label:'Summarize',icon:'spark'});}
 if(!list.length&&s.data.homestead&&!s.data.homestead.homeBuilt)list.push({id:'connect',kind:'connect',placement:'utility',slot:'home',label:'Connect sources',icon:'plus'});
 if(!list.length&&!s.buildings?.length&&s.depth!=='area'&&s.depth!=='overview'&&s.depth!=='note'&&s.depth!=='search')list.push({id:'browse:'+s.current,pageId:s.current,kind:'browse',label:'Browse this place',icon:'book'});
 return list;}
 function dockOptions(){
  if(root.dataset.attentionPreview==='true')return [];
  const s=snapshot(),next=nextMatter(s);
  // On a website Applet's page World leaves it for the World where it was opened (its region, or the overview), since
  // the page's own Back only moves through its history (owner request 2026-10-06).
  const webPage=!!root.querySelector('.browser-toolbar>.browser-back[data-web-page]');
  const common: any[]=[{id:'utility:home',label:'World',icon:'home',kind:'navigation',placement:'utility',slot:'home',run:webPage?leaveApplet:home},{id:'utility:next',label:next?({needsAction:'Review',event:'View event',unseen:'Read update'}[next.state]||'Do Work'):'Do Work',description:next?.fullAction||next?.actionTitle,icon:'spark',kind:'navigation',placement:'utility',slot:'next',side:'right',disabled:!next,run:nextFocus}];

  // Desktop return is the fourth small Companion control, not a dock action.
  if(isDesktopCompanion())common.shift();
  const local=options().filter(a=>a.placement==='contextual');
  if(s.data.personal&&!s.data.moduleCatalog)local.unshift({id:'utility:connect',label:'Connect sources',icon:'plus',kind:'navigation',placement:'contextual',run:connect});
  const update=updates?.snapshot();
  const release=update?.visible&&isDesktopCompanion()?[{id:'utility:update',label:update.label||'Update',icon:'download',kind:'update',placement:'contextual',disabled:!update.enabled,description:update.detail,run:()=>updates.activate()}]:[];
  const visible=new Set(chat()?.visibleActionIds?.()||[]);
  if(root.dataset.foxGuide==='true'&&!root.querySelector('#companionDialogue')?.hidden)visible.add('utility:connect');
  // Content actions belong to the selected Applet; global suggestions stay in World.
  // During onboarding the guide owns actions, avoiding competing navigation.
  const recommended=chat()?.recommendedActions?.()||[];
  const contextualSuggestions=isDesktopCompanion()?recommended:local.some(a=>a.id.startsWith('attention:'))?[...local,...recommended]:[...recommended,...local];
  const suggestions=root.dataset.onboarding==='true'?[]:[...contextualSuggestions,...(s.depth==='overview'||isDesktopCompanion()?common.filter(a=>a.side==='right'):[])];
  const seen=new Set();
  const right=suggestions.filter(a=>{
   const identity=a.identity||a.id;
   if(a.disabled||visible.has(identity)||seen.has(identity))return false;
   seen.add(identity);return true;
  }).slice(0,3).map(a=>({...a,side:'right'}));
  return [...common.filter(a=>a.slot==='home'&&(s.depth!=='overview'||isDesktopCompanion())),...release.slice(0,1),...right];
 }
 function trackedTasks(){return [...model.activities.filter(a=>a.state==='needsAction'),...tasks(),...model.activities.filter(a=>a.state==='unseen')].filter((a,i,list)=>list.findIndex(b=>b.id===a.id)===i).slice(0,3);}
 const nextVisited=new Set();
 // Later shows what the person put off with Later: the rows their pages will make when the snooze ends.
 function snoozedMatters(s){
  const now=Date.now(),later=new Map();
  for(const [id,p] of s.pages){const until=Date.parse(p.worldItemSnoozedUntil);if(!p.worldItemId||!(until>now))continue;const page={...p};refreshItemPage(page,until+1);if(page.activities.length)later.set(id,page);}
  if(!later.size)return [];
  const view={...s,pages:new Map([...s.pages].map(([id,p])=>[id,later.get(id)||{...p,activities:[],events:[]}])),arrivals:[],sampleTour:[]};
  return collectMatters({...view,activities:collectNativeActions({...view,decisions:[],completed,lastRead}).activities,events:upcomingEvents({...view,limit:Infinity})}).filter(item=>item.signalCount).map(item=>{const page=s.pages.get(item.pageId||item.pageIds?.[0]);return {...item,snoozed:true,when:attentionReturnWhen(item.snoozedUntil||page?.worldItemSnoozedUntil)||item.when};});
 }
 function matterItems(s){const signals=[...collect().activities,...tasks()];return collectMatters({...s,activities:s.data.sample?signals.filter(a=>s.pages.get(a.pageId)?.worldItemId):signals,events:upcomingEvents({...s,limit:Infinity})}).filter(item=>item.signalCount);}
 function focusItem(item){
  if(previewAttention(item))return;
  if(item.kind==='activity')focusContent(item.pageId);else visitObject(item.id);
  const lead=item.signals?.[0];
  const decision=lead?.kind==='decision'&&(snapshot().data.sampleDecisions||[]).find(d=>d.id===lead.id&&!completed.has(d.id));
  if(decision)offerDecision(decision);else itemActions?.(item);
 }
 // A sample decision is asked for the way an item is: opening its row has Fox lay
 // the choice out, and the pick is kept in sample-ui.json as local state only.
 function offerDecision(d){
  const fox=chat();if(!fox?.setGuide)return;
  const choice=label=>{const b=el('button','',label);b.type='button';b.onclick=()=>{fox.setGuide(null);decide(d,label);};return b;};
  const later=el('button','','Not now');later.type='button';later.onclick=()=>fox.setGuide(null);
  fox.setGuide({source:'decision:'+d.id,takeover:true,text:'**'+d.title+'** '+d.objective+'. Pick one; this is the sample, so nothing is sent.',actions:[...d.choices.map(choice),later]});
  fox.revealGuide?.();
 }
 function nextMatter(s){
  const items=matterItems(s).filter(m=>m.signalCount);
  const region=s.depth==='building'?s.current:s.sections.find(r=>r.moduleId===s.current||r.id===s.currentSpace)?.buildingId;
  const priority=m=>m.placeId===s.currentSpace?2:s.sections.find(r=>r.id===m.placeId)?.buildingId===region&&region?1:0;
  items.sort((a,b)=>priority(b)-priority(a));
  return items.find(m=>!m.active&&!nextVisited.has(m.id))||items.find(m=>!m.active)||items[0];
 }
 function nextFocus(){
  const s=snapshot(),items=matterItems(s).filter(m=>m.signalCount);
  if(items.every(m=>m.active||nextVisited.has(m.id)))nextVisited.clear();
  const next=nextMatter(s);chat()?.hidePreview?.();
  if(next){const live=new Set(matterItems(s).map(m=>m.id));for(const id of nextVisited)if(!live.has(id))nextVisited.delete(id);nextVisited.add(next.id);focusItem(next);}
  else nextVisited.clear();
 }
 const seenMatters=new Set<string>(),matterArrivals=new Map<string,number>();let mattersInitialized=false,matterSignature='';
 function focusMatter(id:string){const latest=tracked.find(item=>item.id===id);if(latest)focusItem(latest);}
 const refitMatters=()=>{matterSignature='';if(snapshot().data.matterCatalog)renderMatters(snapshot());};
 window.addEventListener('resize',refitMatters);
 window.addEventListener('worldlet:text-scale',refitMatters);
 document.fonts?.addEventListener('loadingdone',refitMatters);
 let matterSize='';
 const matterResize=new ResizeObserver(([entry])=>{const size=entry.contentRect.width+':'+entry.contentRect.height;if(size!==matterSize){matterSize=size;refitMatters();}});matterResize.observe(tracker);
 window.addEventListener('pagehide',()=>{matterResize.disconnect();document.fonts?.removeEventListener('loadingdone',refitMatters);window.removeEventListener('resize',refitMatters);window.removeEventListener('worldlet:text-scale',refitMatters);},{once:true});
 // The Center is a living focus set, not a queue: clearing a row does not pull the next
 // one in, and what fits this screen is all it holds. Membership is local UI state
 // (the injected storage holds note overlays only); the sample keeps its authored list.
 // Later holds what is not for now: the held-back backlog and what the person put off with
 // Later (owner decision). The Center is two pages (owner decision 2026-10-03): Now, the
 // screen-sized focus set it shows day to day, and one screen below it Later. Scrolling or
 // swiping the Center up turns to Later, and the button at its foot jumps there; scrolling
 // down from Later's top, its Now button or a click beside the rows comes back. Neither
 // changes focus. `expanded` is true while Later is the page shown.
 let focusState=null,expanded=false;
 const turnPage=(later:boolean)=>{if(expanded===later)return;expanded=later;pageTurnedAt=performance.now();wheelTravel=0;matterSignature='';renderMatters(snapshot());};
 const collapseLater=()=>turnPage(false);
 const laterKeep='.world-matter,.world-task-more-button,.world-attention-later,#attentionPreview,dialog,[role=dialog],button,a,input,textarea,select,[contenteditable]';
 document.addEventListener('pointerdown',(event:any)=>{if(expanded&&event.isPrimary!==false&&!event.target?.closest?.(laterKeep))collapseLater();},true);
 // One deliberate gesture turns one page: travel accumulates within a gesture, and a trackpad's
 // momentum after a turn does not turn it back.
 let pageTurnedAt=0,wheelTravel=0,wheelAt=0,touchY=null;
 const laterTop=()=>(trackerList.querySelector('.world-attention-later')?.scrollTop||0)<=0;
 const hasLater=()=>!!trackerList.querySelector('.world-task-more-button[data-page]');
 tracker.addEventListener('wheel',(event:WheelEvent)=>{
  const now=performance.now();if(now-pageTurnedAt<700||!hasLater()||Math.abs(event.deltaY)<Math.abs(event.deltaX))return;
  if(now-wheelAt>250)wheelTravel=0;wheelAt=now;
  if(!expanded&&event.deltaY>0){wheelTravel+=event.deltaY;if(wheelTravel>40)turnPage(true);}
  else if(expanded&&event.deltaY<0&&laterTop()){wheelTravel+=event.deltaY;if(wheelTravel<-40)turnPage(false);}
  else wheelTravel=0;
 },{passive:true});
 tracker.addEventListener('touchstart',(event:TouchEvent)=>{touchY=event.touches.length===1?event.touches[0].clientY:null;},{passive:true});
 tracker.addEventListener('touchend',(event:TouchEvent)=>{
  if(touchY===null||!hasLater())return;const travel=(event.changedTouches[0]?.clientY??touchY)-touchY;touchY=null;
  if(!expanded&&travel<-48)turnPage(true);else if(expanded&&travel>48&&laterTop())turnPage(false);
 },{passive:true});
 const focusKey='worldlet-attention-focus';
 function readFocus(){try{const value=JSON.parse(localStorage.getItem(focusKey)||'null');return value&&typeof value==='object'?value:null;}catch{return null;}}
 function writeFocus(value){focusState=value;try{const text=JSON.stringify(value);if(text!==localStorage.getItem(focusKey))localStorage.setItem(focusKey,text);}catch{}}
 const focusKeyOf=m=>m.worldItemId||m.id;
 // A grouped card keeps the key the saved focus already knows: a newly arriving duplicate may
 // become its lead (Core picks leads by ID) and must not make the card look new (#929).
 let keyOf:(m:any)=>string=focusKeyOf;
 function focusKeys(items,saved):(m:any)=>string{const known=new Set([...(saved?.ids||[]),...(saved?.held||[]),...Object.keys(saved?.observed||{})]),keys=new Map(items.map(m=>[m,m.worldItemIds?.find(id=>known.has(id))||focusKeyOf(m)]));return m=>keys.get(m)||focusKeyOf(m);}
 const startTime=m=>{const value=m.signals?.[0]?.start??m.start;const time=typeof value==='number'?value:Date.parse(value);return Number.isFinite(time)?time:Infinity;};
 const matterRegion=(s,m)=>s.sections.find(r=>r.id===m.placeId)?.buildingId?.replace('building-','');
 function focusMembers(s,items){
  if(s.data.sample){focusState=null;keyOf=focusKeyOf;return {items,held:[]};}
  const now=Date.now(),mode=root.dataset.attentionFocus||'auto';
  // A grouped event follows its inherited snooze, not the snooze of its lead member.
  const grouped=new Set(items.flatMap(m=>m.worldItemIds||[]));
  const saved=readFocus();keyOf=focusKeys(items,saved);
  const snoozed=[...[...s.pages.values()].filter(p=>p.worldItemId&&!grouped.has(p.worldItemId)&&Date.parse(p.worldItemSnoozedUntil)>now).map(p=>p.worldItemId),...items.filter(m=>m.worldItemIds&&Date.parse(m.snoozedUntil)>now).map(keyOf)];
  const focus=attentionFocusSet({items:items.map(m=>({...attentionRankSignals(m),id:keyOf(m),level:attentionLevel(m),state:m.state,relevant:attentionRelevant(matterRegion(s,m),mode,new Date(now)),soon:startTime(m)-now<3*86400000,evidence:attentionFocusEvidence(m.sources||m.pageIds?.flatMap(id=>s.pages.get(id)?.worldItemSources||[])||[])})),saved,snoozed,now});
  writeFocus(focus.saved);
  const members=new Set(focus.ids);
  return {items:items.filter(m=>members.has(keyOf(m))),held:items.filter(m=>!members.has(keyOf(m)))};
 }
 // The page button at the Center's foot: Later turns down a page, Now turns back. No count (owner decision 2026-10-04).
 function pageButton(page:'now'|'later'){
  const button=el('button','world-task-more-button');button.type='button';button.dataset.page=page;
  button.setAttribute('aria-label',page==='later'?'Go to Later':'Back to Now');
  button.append(el('span','world-task-more-label',page==='later'?'Later':'Now'),el('span','world-task-more-chevron'));
  button.lastElementChild.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(page==='later'?'m6 9 6 6 6-6':'m6 15 6-6 6 6')+'"/></svg>';
  button.onclick=()=>turnPage(page==='later');
  return button;
 }
 function renderMatters(s){
  const all=matterItems(s),introducing=root.dataset.onboardingAttention==='true'||root.dataset.attentionIntroduced==='true';
  const {items,held}=focusMembers(s,all),later=[...held,...snoozedMatters(s)];
  if(!later.length)expanded=false;
  const arrivalNow=performance.now();
  for(const item of items){if(mattersInitialized&&!seenMatters.has(item.id))matterArrivals.set(item.id,arrivalNow);seenMatters.add(item.id);}
  mattersInitialized=true;
  for(const [id,at]of matterArrivals)if(arrivalNow-at>=900)matterArrivals.delete(id);
  const previousSelection=trackerList.querySelector('[aria-current="location"]')?.getAttribute('data-world-item-id');
  tracked=[...all,...later.filter(m=>m.snoozed)];resolvePlaces(s);
  const groups=ATTENTION_GROUPS.map(([state,title])=>({state,title,items:s.data.sample?items.filter(m=>m.state===state).sort((a,b)=>attentionLevel(b)-attentionLevel(a)):attentionOrder(items.filter(m=>m.state===state),{mode:root.dataset.attentionFocus||'auto',region:m=>matterRegion(s,m),importance:attentionLevel})}));
  // The paired phone mirrors the same Now and Later (ui/companion/phone-bridge.ts); it dedupes unchanged views.
  // Ongoing proposals (core/ongoing/README.md): Fox asks whether a brought conversation that looks like one job
  // should become an Applet. They are Worth Doing, after the items, here and on the phone (as `ongoing:<id>`).
  const proposals:any[]=s.data.sample?[]:(ongoing()||[]);
  const proposalItems=proposals.map(p=>({id:'ongoing:'+p.id,worldItemId:'ongoing:'+p.id,state:'needsAction',title:p.title,actionTitle:p.title,fullAction:p.title,context:p.context,fullContext:p.context,provider:'ongoing',level:2}));
  // The person's own Calendar events (core/applets/calendar-events.ts) are Coming Up from a day before, here and on
  // the phone (as `calendar:<id>`), in time order with the synced ones; their alert time puts them at the top.
  const own:any[]=s.data.sample?[]:(calendar()||[]);
  const ownItems=own.map(e=>{const m:any={id:'calendar:'+e.key,worldItemId:'calendar:'+e.key,state:'event',title:e.title,actionTitle:e.title,fullAction:e.title,context:e.context,fullContext:e.context,provider:'google-calendar',start:e.start,end:e.end,allDay:e.allDay,alerting:!!e.alerting,when:attentionGroupWhen([{start:e.allDay?e.start:Date.parse(e.start),end:e.allDay?undefined:Date.parse(e.end),allDay:e.allDay}])};m.level=e.alerting?5:attentionLevel(m);return m;});
  if(!s.data.sample)onAttention?.({now:[...groups.flatMap(g=>g.items).map(m=>({...m,level:attentionLevel(m)})),...proposalItems,...ownItems],later:later.map(m=>({...m,level:attentionLevel(m)}))});
  // Keep the live model fresh, but do not rebuild or measure identical rows on
  // every navigation/status sync. Click handlers resolve the latest model by ID.
  const reading=introducing&&!items.length&&sourcesReading(s.data.moduleConnections||[]);
  // Applets Fox made for this moment (core/widgets/README.md) lead Now; each row opens its Applet.
  const forNow=s.data.sample?[]:(widgets()||[]);
  const signature=JSON.stringify([ownItems.map(m=>[m.id,m.title,m.context,m.when?.factor,m.level]),proposals.map(p=>[p.id,p.title,p.context]),forNow.map(w=>[w.id,w.title,w.blurb,w.color,momentLine(w)]),expanded,introducing,reading,later.map(m=>m.id+':'+(m.snoozed?1:0)+':'+(m.when?.factor||'')),groups.map(g=>[g.state,g.items.map(m=>[m.id,m.worldItemId,m.actionTitle,m.context,m.fullAction,m.fullContext,m.title,m.state,m.when,m.requiresChoice,m.priority,attentionLevel(m),s.attentionItemId?m.worldItemId===s.attentionItemId:m.active])])]);
  if(signature===matterSignature)return;
  matterSignature=signature;tracker.hidden=false;trackerList.replaceChildren();
  const matterRow=m=>{const b=taskRow({title:m.actionTitle,objective:m.context,label:m.fullAction+' · '+m.title,active:s.attentionItemId?m.worldItemId===s.attentionItemId:m.active,state:m.state,when:m.when,run:()=>focusMatter(m.id)});b.title=[m.fullAction,m.fullContext].filter(Boolean).join(' · ');b.classList.add('world-matter');if(m.worldItemId===s.attentionItemId&&m.worldItemId!==previousSelection)b.classList.add('world-matter-selecting');if(matterArrivals.has(m.id)){b.classList.add('world-matter-arriving');b.style.animationDelay=-(arrivalNow-matterArrivals.get(m.id))+'ms';}b.dataset.taskId=m.id;if(m.worldItemId)b.dataset.worldItemId=m.worldItemId;b.dataset.matterState=m.state;b.dataset.attentionLevel=String(attentionLevel(m));b.setAttribute("aria-description",(m.state==="event"?"Urgency":"Importance")+" level "+attentionLevel(m)+" of 5");const mark=b.querySelector('.world-task-marker');if(mark){mark.innerHTML=attentionIcon(m.state,m.requiresChoice,m.priority);mark.className='matter-icon';}return b;};
  // The guided introduction names all three groups; ordinary empty groups stay quiet.
  const groupSection=(state,title,rows)=>{
   const section=el('section','world-task-group');section.dataset.group=state;section.setAttribute('aria-label',title);
   if(title){const heading=el('h2','world-task-heading');heading.append(el('span','',title));section.append(heading);}
   for(const row of rows)section.append(row);
   return section;
  };
  // The Later page: what can wait. Its rows keep their category colours (owner decision 2026-10-02).
  const zone=(name,title,note)=>{
   const section=el('section','world-attention-zone');section.dataset.zone=name;section.setAttribute('aria-label',title);
   const head=el('div','world-attention-zone-head');head.append(el('h2','world-attention-zone-title',title),el('p','world-attention-zone-note',note));
   section.append(head);return section;
  };
  if(expanded){
   const page=el('div','world-attention-later');
   const put=zone('later','Later','Can wait. An item moves up to Now when it needs you.');
   put.append(groupSection('later','',later.map(m=>{const row=matterRow(m);row.classList.add('world-matter-later');return row;})));
   page.append(put);trackerList.append(page);
  }else{
   if(forNow.length)trackerList.append(groupSection('widget','For now',forNow.map(w=>{
    const row=taskRow({title:w.title,objective:w.blurb,label:'Applet · '+w.title,state:'widget',when:{factor:momentLine(w),label:momentLine(w)},run:()=>openWidget(w.id)});
    row.classList.add('world-widget');row.dataset.widget=w.id;row.style.setProperty('--widget-accent',w.color);return row;
   })));
  }
  const proposalRow=p=>{
   const b=taskRow({title:p.title,objective:p.context,label:'Fox suggests · '+p.title,state:'needsAction',run:()=>openOngoing(p.id)});
   b.classList.add('world-matter','world-ongoing');b.dataset.ongoing=p.id;b.dataset.matterState='needsAction';
   const mark=b.querySelector('.world-task-marker');if(mark){mark.innerHTML=attentionIcon('needsAction');mark.className='matter-icon';}
   return b;
  };
  const ownRow=m=>{
   const b=taskRow({title:m.title,objective:m.context,label:m.title+' · '+m.context,state:'event',when:m.when,run:()=>openCalendar(own.find(e=>'calendar:'+e.key===m.id))});
   b.classList.add('world-matter','world-own-event');b.dataset.calendarEvent=m.id.slice(9);b.dataset.matterState='event';b.dataset.attentionLevel=String(m.level);if(m.alerting)b.dataset.alerting='true';
   const mark=b.querySelector('.world-task-marker');if(mark){mark.innerHTML=attentionIcon('event');mark.className='matter-icon';}
   return b;
  };
  // An event that is alerting leads Coming Up; the rest take their place by start time among the synced events.
  const startOf=m=>{const lead=m.signals?.[0]||{},t=lead.start??m.start;return m.alerting?-Infinity:typeof t==='number'?t:Date.parse(t)||Infinity;};
  if(!expanded)for(const {state,title,items:group}of groups){
   const extra=state==='needsAction'?proposals:[];
   const merged=[...group];
   if(state==='event')for(const m of [...ownItems].sort((a,b)=>startOf(a)-startOf(b))){const at=merged.findIndex(x=>startOf(x)>startOf(m));merged.splice(at<0?merged.length:at,0,m);}
   const rows=merged.map(m=>m.id.startsWith('calendar:')?ownRow(m):matterRow(m));
   if(!rows.length&&!extra.length&&!introducing)continue;
   trackerList.append(groupSection(state,title,[...rows,...extra.map(proposalRow)]));
  }
  const showLater=()=>{
   if(trackerMore.querySelector('.world-task-more-button'))return;
   if(!items.length&&!proposals.length&&!ownItems.length)trackerMore.append(el('p','world-task-clear','All clear for now.'));
   trackerMore.append(pageButton('later'));trackerMore.hidden=false;
  };
  trackerMore.replaceChildren();trackerMore.hidden=true;trackerList.append(trackerMore);
  trackerList.classList.toggle('is-expanded',expanded);
  // A page turn slides the new page in from where the gesture sends it.
  if(performance.now()-pageTurnedAt<400)trackerList.dataset.turn=expanded?'later':'now';else delete trackerList.dataset.turn;
  if(expanded){
   trackerMore.append(pageButton('now'));trackerMore.hidden=false;tracker.hidden=false;
   return;
  }
  if(later.length)showLater();
  else if(introducing&&!items.length){
   // While what was connected is still being read, three hopping dots say so without a line of text (owner request 2026-10-06).
   const line=el('p','world-task-clear world-task-waiting',reading?'':'Nothing needs you right now. New items will appear here.');line.setAttribute('role','status');
   if(reading){line.classList.add('is-reading');line.setAttribute('aria-label','Reading what you connected');for(let i=0;i<3;i++)line.append(el('i'));}
   trackerMore.append(line);trackerMore.hidden=false;
  }
  tracker.hidden=!items.length&&!later.length&&!introducing&&!forNow.length&&!proposals.length&&!ownItems.length;fitPanel();
  // The screen decides capacity: rows it cannot show wait instead of reappearing later.
  for(let pass=0;focusState&&items.length&&pass<2;pass++){
   // Rows carry their lead's item ID; the focus set knows each card by its key.
   const key=new Map<string,string>(all.map(m=>[focusKeyOf(m),keyOf(m)]));
   const shown=[...trackerList.querySelectorAll('.world-matter[data-world-item-id]')].map(row=>{const id=(row as HTMLElement).dataset.worldItemId;return key.get(id)||id;});
   const fitted=attentionFocusFit(focusState,shown,all.map(keyOf));
   if(fitted===focusState)break;
   writeFocus(fitted);
   if(trackerMore.hidden){showLater();fitPanel();}else break;
  }
 }
 // Nothing here is worth hunting for. The panel never scrolls and never cuts a row
 // short: what does not fit is dropped from the end, where the least pressing rows are.
 function fitPanel(){
  if(!expanded)fitAttentionPanel(trackerList);
 }
 function renderTasks(){const s=snapshot();for(const p of s.pages.values())refreshItemPage(p);if(s.data.matterCatalog){renderMatters(s);return;}const inspect=root.querySelector('#notionDialog').open||!root.querySelector('#notionContent').hidden,items=trackedTasks().filter(a=>!inspect||a.pageId===s.current||a.pageIds?.includes(s.current)||a.placeId===s.currentSpace);tracked=items;const events=upcomingEvents(s).filter(a=>!inspect||a.pageId===s.current||a.placeId===s.currentSpace);tracker.hidden=!items.length&&!events.length;
  trackerList.replaceChildren();
  for(const [state,title]of ATTENTION_GROUPS){
   const group=state==='event'?events:items.filter(a=>a.state===state);if(!group.length)continue;
   const heading=el('div','world-task-heading');heading.append(el('span','',title));trackerList.append(heading);
   for(const a of group){const active=a.pageId===s.current||a.pageIds?.includes(s.current)||a.placeId===s.currentSpace;const b=taskRow({title:a.taskTitle||a.label,objective:a.objective||'Review and decide',label:a.label,active,state,icon:a.icon,run:()=>state==='event'?focusContent(a.pageId):run(a.id)});b.dataset.taskId=a.id;trackerList.append(b);}
  }
 }
 function render(){
  display=dockOptions();const choices=display;
  const left=el('div','fox-action-side fox-action-left'),right=el('div','fox-action-side fox-action-right');
  const restoreBackFocus=document.activeElement===backButton;
  // sceneState still owns this required control during desktop → world
  // restoration. Park it in the hidden context, not in the detached old row.
  // Moved only when it is not already there: re-inserting it on every sync redraws its frosted glass,
  // which flickers (owner report 2026-10-06).
  if(isDesktopCompanion()){if(backButton.parentElement!==context)context.append(backButton);}
  else if(barLeft.firstElementChild!==backButton)barLeft.prepend(backButton);
  // Inside an Applet (or reading one of its items) Back alone leads the left of the title: it already leads up a level,
  // so the World button stays out of the bar. On a website Applet's page its toolbar's Back and Forward stand in for
  // Back (browser-device.ts), and World stands left of Fox in the dock (owner request 2026-10-06).
  const inBar=!isDesktopCompanion()&&(snapshot().depth==='object'||root.dataset.detailOpen==='true');
  const webPage=!!root.querySelector('.browser-toolbar>.browser-back[data-web-page]');
  for(const e of [...barLeft.children])if(e!==backButton)e.remove();
  choices.forEach(action=>{if(inBar&&action.slot==='home'&&!webPage)return;(action.side==='right'?right:left).append(button(action));});
  actionsRow.replaceChildren(left,right);placeBar();
  if(restoreBackFocus)(backButton.hidden?left.querySelector('[data-slot=home]'):backButton)?.focus({preventScroll:true});
  row.hidden=!choices.length&&!actionsRow.querySelector('.companion-entry-action:not([hidden])');actionsRow.setAttribute('aria-label','Suggested actions');


 }
 function guideActions(text,choices){const fox=chat();if(!fox?.setGuide)return;const actions=choices.map(([label,run])=>{const b=el('button','',label);b.type='button';b.onclick=()=>{fox.setGuide(null);run();};return b;});const dismiss=el('button','','Not now');dismiss.type='button';dismiss.onclick=()=>fox.setGuide(null);fox.setGuide({source:'world-actions',takeover:true,text,actions:[...actions,dismiss]});}
 function listPages(ids,title){const choices=ids.map(id=>snapshot().pages.get(id)).filter(Boolean).map(p=>[p.title,()=>open(p.id)]);guideActions(title+(choices.length?'':' — no sources yet.'),choices);}
 window.addEventListener('worldlet:desktop-companion',()=>{forceNext=true;sync();});
 async function run(id){const fresh=[...dockOptions(),...options(),...(contextual()?.agentActions||[]),...model.activities,...tasks()].find(a=>a.id===id);if(!fresh||busy.has(id))return {error:'Action no longer available. Inspect the current context again.'};busy.add(id);[...actionsRow.querySelectorAll('button'),...barLeft.querySelectorAll('button')].forEach(b=>{if(b.dataset.actionId===id){b.disabled=true;b.setAttribute('aria-busy','true');}});
  try{if(!id.startsWith('reply:')&&fresh.kind!=='update')await requireWorldSurface();}catch(error){busy.delete(id);chat()?.setStatus?.(error.message,{source:'navigation',persistent:true});forceNext=true;sync();return {error:error.message};}
  try{if(fresh.run)await fresh.run();else if(fresh.kind==='connect')await connect();else if(fresh.kind==='summarize'){await chat().ask(summarizeRequest(snapshot().pages.get(fresh.pageId)?.title),{origin:'system',displayText:fresh.label,icon:fresh.icon||'spark'});}else if(fresh.kind==='original')await original(fresh.pageId);else if(fresh.kind==='browse'){const s=snapshot().sections.find(s=>s.id===fresh.pageId);listPages(s?.children||[],s?.title||'Sources');}else {focusContent(fresh.pageId||fresh.pageIds?.[0]);}if(fresh.kind!=='update'&&!fresh.id.startsWith('reply:')&&!['utility:next','utility:fun','utility:connect'].includes(fresh.id))chat()?.recordAction?.(fresh);return {ok:true,action:fresh.label,...(fresh.resultHint?{effect:fresh.resultHint}:{})};}
  catch(e){if(fresh.kind==='update'){updates.failure?.(e);return {error:e.message};}guideActions('Action incomplete. '+e.message,[['Retry',()=>run(id)]]);return {error:e.message};}
  finally{busy.delete(id);forceNext=true;sync();}
 }
 function showMore(){guideActions('What would you like to do?',[...options().map(a=>[a.label,()=>run(a.id)]),['Search all sources',()=>showSearch('')],['Connect sources',connect]]);}
 // Building and area membership is world structure; resolve it when the tracked set changes.
 function resolvePlaces(s,items=tracked){
  for(const a of items){
   const building=s.buildings?.find(b=>b.rooms.includes(a.placeId)),area=s.areas?.find(d=>d.places?.includes(a.placeId)||d.buildings?.includes(building?.id));
   a.places=[a.targetId||a.id,a.placeId,building?.id,area?.id].filter(Boolean);
  }
 }
 // Attention is asked for in one place. The world shows what each Applet is and
 // what state it is in; it does not carry a second set of marks saying the same thing.

 function renderArea(s){
  if(s.data.moduleCatalog){area.hidden=true;return;}
  if(s.buildings?.length){
   area.hidden=!['area','building','room','object'].includes(s.depth);if(area.hidden)return;
   area.classList.add('world-trip-panel','world-view-panel');area.replaceChildren();
   const building=s.buildings.find(b=>b.id===s.currentSpace||b.rooms.includes(s.currentSpace));
   const room=s.sections.find(r=>r.id===s.currentSpace);
   const objects=room?roomObjects(room,s.pages,s.composites):[];
   const object=objects.find(o=>o.id===s.current);
   const hint=s.data.personal&&s.depth==='room'?'Region · Choose what matters to you':s.depth==='building'?'Place · Choose a room':s.depth==='room'?'Room · Objects represent what matters to you':s.depth==='object'?'Object · Select a part for details':'Area · Choose a place';
   area.append(el('p','world-view-hint',hint));
   const directory=el('details','world-object-directory'),list=el('div','world-projects');
   directory.append(el('summary','',s.depth==='building'?'Rooms · '+building.rooms.length:s.depth==='room'?'Objects · '+objects.length:s.depth==='object'?'Browse details':'Places'),list);area.append(directory);
   const add=(id,title,summary,kind,fn)=>{const b=el('button','world-project');b.type='button';b.dataset[kind+'Id']=id;b.append(el('strong','',title),el('span','world-project-state',summary));b.onclick=fn;list.append(b);};
   if(s.depth==='object'&&room?.trip){const browse=el('button','world-trip-records','Other trips & memories');browse.type='button';browse.onclick=()=>visitSpace(room.id);area.append(browse);}
   if(s.depth==='building')for(const rid of building.rooms){const r=s.sections.find(r=>r.id===rid);add(rid,r.title,r.functionName+' · '+r.summary,'place',()=>visitSpace(rid));}
   else if(s.depth==='room')for(const o of objects)add(o.id,o.title,o.summary,'object',()=>visitObject(o.id));
   else if(s.depth==='object')for(const id of object?.pageIds||[]){const p=s.pages.get(id);if(p)add(id,p.title,p.projectStatus||'Open content','page',()=>open(id));}
   else for(const b of s.buildings.filter(b=>b.areaId===s.current))add(b.id,b.title,b.rooms.length+(b.rooms.length===1?' room':' rooms'),'building',()=>visitBuilding(b.id));
   return;
  }
  area.hidden=!['place','area'].includes(s.depth);if(area.hidden)return;
  area.classList.remove('world-trip-panel');
  area.classList.toggle('world-matter-panel',!!s.areas?.length&&s.depth==='place');
  if(s.depth==='area'){
   const domain=s.areas.find(a=>a.id===s.currentSpace);if(!domain)return;
   area.replaceChildren(el('p','world-area-eyebrow','Area · '+domain.places.length+'  matters'),el('h1','',domain.title));
   const list=el('div','world-projects');area.append(list);
   for(const id of domain.places){const place=s.sections.find(p=>p.id===id);if(!place)continue;const b=el('button','world-project');b.type='button';b.dataset.placeId=id;b.append(el('strong','',place.title),el('span','world-project-state',place.children.length+'  related sources'));b.onclick=()=>visitSpace(id);list.append(b);}return;
  }
  const section=s.sections.find(p=>p.id===s.currentSpace);if(!section)return;
  area.classList.toggle('world-trip-panel',!!section.trip);
  const ids=section.virtual?section.children:[section.id],previous=area.scrollTop;
  area.replaceChildren(el('p','world-area-eyebrow',(s.areas?.length?'Matter · ':'Area · ')+ids.length+'  items'),el('h1','',section.title));
  const list=el('div','world-projects');if(s.areas?.length){area.append(el('p','world-matter-hint',section.trip?'Trip · Explore the map and preparation status':'Select an object in the scene to read its details.'));const more=el('details','world-object-directory');more.append(el('summary','','Sources · '+ids.length),list);area.append(more);}else area.append(list);
  for(const id of ids){const p=s.pages.get(id);if(!p)continue;
   const decision=(s.data.sampleDecisions||[]).find(d=>d.pageId===id),activity=model.activities.find(a=>a.pageId===id||a.pageIds?.includes(id));
   const state=p.projectStatus||(decision&&completed.has(decision.id)?'Confirmed':activity?.state==='needsAction'?'Needs your decision':activity?.state==='unseen'?'Updated':s.read.has(id)?'Read':'Ready to view');
   const b=el('button','world-project');b.type='button';b.dataset.pageId=id;b.dataset.state=['In review','Ready to release'].includes(p.projectStatus)?'needsAction':activity?.state||'available';
   b.append(el('strong','',p.title),el('span','world-project-state',state));
   b.onclick=()=>open(id);list.append(b);
  }
  if(!list.children.length)list.append(el('p','world-area-empty','Nothing here yet. Synced content will appear here.'));
  area.scrollTop=previous;
 }
 // Context is semantic state, not a hover layout update. Navigation during a
 // click must publish it before a new Fox turn starts, even while buttons freeze.
 function syncContext(s){
  const custom=contextual(),room=s.sections.find(r=>r.id===s.currentSpace),building=s.buildings?.find(b=>b.id===s.current),object=room&&roomObjects(room,s.pages,s.composites).find(o=>o.id===s.current),page=s.pages.get(s.current);
  const title=s.depth==='overview'?(s.data.appName||'Worldlet'):s.depth==='search'?'Search':building?.title||object?.title||page?.title||room?.title||'World';
  chat()?.setContext?.(custom?.context||{key:s.depth+':'+s.current,title,detail:s.depth==='overview'?(model.actions.find(a=>a.state==='needsAction')?'Next up: '+model.actions.find(a=>a.state==='needsAction').label+'.':''):(object?.summary||room?.summary||'').slice(0,180)});
 }
 function sync(){worldLog?.redraw();const s=snapshot();if(pointerHeld){syncContext(s);pending=true;return;}const locationKey=s.depth+':'+s.current;if(locationKey!==panelLocation){root.querySelector('#notionDialog').close();area.dataset.dismissed='false';panelLocation=locationKey;}if(s.depth==='note')lastRead=s.current;model=collect();context.hidden=true;backButton.hidden=s.depth==='overview'&&(root.querySelector('#notionContent') as HTMLElement|null)?.hidden!==false;renderTasks();renderArea(s);if(area.dataset.dismissed==='true')area.hidden=true;const panel=['place','area','building','room','object'].includes(s.depth)?area:['note','search'].includes(s.depth)?root.querySelector('#notionContent'):root;panel.prepend(context);context.classList.toggle('world-panel-context',s.depth!=='overview');
  const custom=contextual(),room=s.sections.find(r=>r.id===s.currentSpace),building=s.buildings?.find(b=>b.id===s.current),object=room&&roomObjects(room,s.pages,s.composites).find(o=>o.id===s.current),page=s.pages.get(s.current);
  const applet=['object','note'].includes(s.depth)&&room?.entity==='app'?room:null,appletIcon: any=applet?appHudIcon(applet):{},logo=appletIcon.source||null;titleLogo.hidden=!logo;if(logo&&titleLogo.getAttribute('src')!==logo)titleLogo.src=logo;
  const overview=s.depth==='overview';
  const title=overview?(s.data.appName||'Worldlet'):s.depth==='search'?'Search':building?.title||object?.title||page?.title||room?.title||'World';
  // World carries our mark; regions stay plain and Applets keep their own logos.
  const icon=overview?worldletMark({monochrome:false}):appletIcon.emoji||'';
  if(titleIcon._icon!==icon){titleIcon._icon=icon;titleIcon.innerHTML=icon;titleIcon.dataset.kind=overview?'mark':'emoji';}
  titleIcon.hidden=!icon;
  chat()?.setContext?.(custom?.context||{key:locationKey,title,detail:s.depth==='overview'?(model.actions.find(a=>a.state==='needsAction')?'Next up: '+model.actions.find(a=>a.state==='needsAction').label+'.':''):(object?.summary||room?.summary||'').slice(0,180)});
  const docked=dockOptions(),signature=JSON.stringify(docked.map(a=>[a.id,a.label,a.disabled,a.description]));if(signature!==actionSignature){actionSignature=signature;forceNext=true;actionsRow.scrollLeft=0;}
  // Frozen buttons keep their original label; availability is a suffix, never repeated.
  if(isFrozen()){pending=true;const valid=new Set(docked.map(a=>a.id));actionsRow.querySelectorAll('[data-action-id]').forEach(b=>{const id=b.dataset.actionId,base=b.dataset.baseLabel??=b.getAttribute('aria-label');b.disabled=!valid.has(id)||busy.has(id)||!!docked.find(a=>a.id===id)?.disabled;const label=b.disabled?base+', currently unavailable':base;if(b.getAttribute('aria-label')!==label)b.setAttribute('aria-label',label);});return;}pending=false;forceNext=false;render();
 }
 function decorateReader(){const s=snapshot(),body=root.querySelector('#notionContent');for(const d of s.data.sampleDecisions||[]){if(d.pageId!==s.current)continue;const section=el('section','world-decision'),label=el('p','',completed.has(d.id)?'Decision saved':'Choose an option');section.append(label);if(!completed.has(d.id))for(const choice of d.choices){const b=el('button','world-capsule',choice);b.type='button';b.onclick=()=>{decide(d,choice);section.replaceChildren(el('p','','Selected: '+choice+'. No message was sent.'));forceNext=true;sync();};section.append(b);}body.append(section);}}
 root.addEventListener('pointerdown',()=>{pointerHeld=true;},true);
 // Keep the clicked row alive through the click event, including focusout microtasks.
 const released=()=>{setTimeout(()=>{pointerHeld=false;if(pending)sync();},0);};window.addEventListener('pointerup',released);window.addEventListener('pointercancel',released);window.addEventListener('blur',released);
 hud.addEventListener('focusout',()=>queueMicrotask(()=>{if(pending&&!isFrozen())sync();}));actionsRow.addEventListener('pointerleave',()=>{if(pending&&!isFrozen())sync();});root.addEventListener('pointerdown',e=>{if((e as any).worldletKeepFox||e.target.closest('.notion-pin[data-page="place-app-youtube"]'))return;if(!hud.contains(e.target)&&!e.target.closest('#notionContent,#notionDialog,#attentionPreview')){input.blur();if(root.dataset.onboarding!=='true')chat()?.hidePreview?.();if(pending)queueMicrotask(sync);}});
 actionsRow.addEventListener('wheel',e=>{if(root.classList.contains('radial-pet-console'))return;if(actionsRow.scrollWidth>actionsRow.clientWidth&&Math.abs(e.deltaY)>Math.abs(e.deltaX)){e.preventDefault();actionsRow.scrollLeft+=e.deltaY;}},{passive:false});
 const resize=new ResizeObserver(()=>{if(!isFrozen())render();});resize.observe(row);
 root.addEventListener('click',e=>{if(!area.hidden&&!area.contains(e.target)&&!e.target.closest('button,input,textarea,a,dialog,.notion-hud,.notion-top,#notionContent')){area.hidden=true;area.dataset.dismissed='true';}} ,true);
 const overlayObserver=new MutationObserver(()=>{forceNext=true;sync();});overlayObserver.observe(root.querySelector('#notionDialog'),{attributes:true,attributeFilter:['open'],childList:true,subtree:true});
 syncUpdate();
 window.addEventListener('worldlet:app-update',()=>{syncUpdate();forceNext=true;sync();});
 const eventTimer=setInterval(()=>{if(!document.hidden)renderTasks();},60000);window.addEventListener('pagehide',()=>clearInterval(eventTimer),{once:true});
 root.addEventListener('worldlet:recommendations',sync);
 root.addEventListener('worldlet:page-controls',()=>{forceNext=true;sync();});
 sync();return {sync,attentionMembers:id=>{const item=tracked.find(m=>m.worldItemId===id||m.worldItemIds?.includes(id));return item?.worldItemIds||[id];},decorateReader,run,showMore,availableActions:()=>[...new Map([...dockOptions(),...options(),...(contextual()?.agentActions||[])].map(a=>[a.id,a])).values()].filter(a=>!['connect','original','summarize','update','voice','suggest'].includes(a.kind)&&!a.id.startsWith('nav:settings:')).map(a=>({id:a.id,label:a.label,kind:a.kind})),get lastRead(){return lastRead;}};
}
