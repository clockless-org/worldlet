import {createMailArrival} from '../world/index.ts';
import {themeAppletIcon,ACTIVE_THEME,themeAmbientTrack,createMailArrivalObserver} from '../themes/index.ts';
import {renderHomeFocus} from '../applets/index.ts';
import {mailMetadata} from '../applets/index.ts';
import {safeAttentionURL as safeAttentionSourceURL} from '../../core/attention/index.ts';
import {getApp,recommendForArea,appletHost,curatedConnection,CURATED_READERS,HOME_NATIVE,CODING_SESSIONS,MONEY_READERS,ORIGINAL_READERS} from '../../core/applets/index.ts';
import {observeWorldActivity,recordWorldActivity} from '../../platform/bridge/activity.ts';
import {curatedOriginal,renderCuratedTable} from '../applets/index.ts';
import {recordWorldCommand} from '../../platform/bridge/host.ts';
import {firstValueRequest,firstValueLinks} from '../../core/onboarding/index.ts';
import {carriesConversation,worldSpeechTerms} from '../../core/companion/index.ts';
import {helpNarration,narrateHelp} from '../companion/index.ts';
import {createWorldUI} from './public-interface.ts';
import {eventTrigger,reportAppletOpened,reportEngagement} from './product-analytics.ts';
import {mountFoxArtifact,flyIntoJournal} from '../artifacts/index.ts';
import {node,textButton,worldletMark,uiIcon} from '../components/index.ts';
import {readRetryDelay,sourceReadAction} from '../../core/applets/index.ts';
import {attentionRequest} from '../../core/agent/index.ts';
import {FOCUS_RULES_REQUEST,browserEffectDecision,browserFinalStep,browserFollowThrough,typedAddress,webSite} from '../../core/browser/index.ts';
import {quietSourceReader} from '../applets/index.ts';
import {mountAttentionPreview,taskReviewLine} from '../attention/index.ts';
import {attentionPreviewData,attentionLaterUntil} from '../../core/attention/index.ts';
import {mountPhoneBridge} from '../companion/index.ts';
import {attentionBrief} from '../../core/attention/index.ts';
import {artifactFitProblem,artifactId,attentionArtifactId,findArtifacts,readArtifact,readDailyArtifactsState,markDailyUse,markDailyMade,journalWaiting,journalSeen,dayKey,dailyArtifactDue,dailyArtifactRequest,readPreparedRepliesState,preparedRepliesSettling,markReplyPrepared,backgroundBlocked,replyThread,replyCandidates,replyPrepareDue,replyPrepareRequest,replyPrepareStatus,foxWorkDone,type FoxWorkKind} from '../../core/artifacts/index.ts';
import {applyRegionLayout,lastUse,readRegionLayout,parseRegionLayout,moveRegionApplet,pinRegionApplet,pinnedPlace,recordAppletUse,regionId,recentlyUsedFirst,storedRegionLayout} from '../world/index.ts';
import {resolvePlacements,lampLabels} from '../world/index.ts';
import {WORLD_LAYOUT,THEME_SCENE} from '../world/index.ts';
import {createLocationWriter} from './navigation-history.ts';
import {renderMailFocus} from '../applets/index.ts';
import {renderTranscript,transcriptBar} from '../applets/index.ts';
import {createVoiceMemoReader} from '../applets/index.ts';
import {createMessagesReader} from './messages.ts';
import {installTextReaderHUD} from '../components/index.ts';
import {createPracticeWalkthrough} from '../practice/index.ts';
import {createPracticeJob,practiceJobSession,practiceJobDetail,PRACTICE_BUILD_MS} from '../practice/index.ts';
import {mountPracticeTimer,practiceTimerHTML} from '../practice/index.ts';
import {MEETING_BRIEF_REQUEST,meetingSummaryRequest,calendarMeetings,dueMeeting,meetingContextDetail,meetingsStage} from '../../core/applets/index.ts';
import {inspectBrowserOutcome} from '../browser/index.ts';
import {presentEmailReview} from '../companion/index.ts';
import {tennisDemo} from '../practice/index.ts';
import {tennisCard} from '../practice/index.ts';
import {createClaudeSession} from '../applets/index.ts';
import {forecastStage,weatherGlyph} from '../world/index.ts';
import {createWeatherPanel} from '../applets/index.ts';
import {createGameApplet} from '../applets/index.ts';
import {ongoingLine,ongoingThemes,ongoingThemeRequest,isOngoingThemeId,type OngoingThing} from '../../core/tasks/index.ts';
import {loadMoney,readMoneyItem} from '../applets/index.ts';
import {WORK_APPLETS,workItems,workError,renderWorkDetail,sampleWork,sampleWorkDetail} from '../applets/index.ts';
import {attentionIcon} from '../attention/index.ts';
import {coreAppletItems} from '../world/index.ts';
import {localCalendarItems} from '../applets/index.ts';
import {alertAt,upcomingCalendarEvents} from '../../core/applets/index.ts';
import type {World,WorldPage} from '../../contracts/world.ts';
import {createAppletPanel} from '../applets/index.ts';
import {createAppDevice} from './app-device.ts';
import {createCodexApplet} from '../applets/index.ts';
import {appLogoSource} from '../applets/index.ts';
import {eventWhen} from '../attention/index.ts';
import {appletIndicator,myAppletKind,momentAppletId,siteAppletId,siteAppletPage,websiteAppletFor} from '../../core/applets/index.ts';
import {appletStatus as appStatus,connectionLive} from '../../core/applets/index.ts';
import {phoneWebAddress} from '../../core/phone/index.ts';
import {applyModuleWorld,moduleStatus} from '../world/index.ts';
import {createModuleScene} from '../world/index.ts';
import {settleItemPage} from '../../core/items/index.ts';
import {createBrowserPanel} from '../browser/index.ts';
import {restoreTextScale} from '../components/index.ts';
import {detailTemplate} from '../components/index.ts';
import {searchNotes} from '../applets/index.ts';
import {mountTravelExperiment} from '../world/index.ts';
import {mountWorldEnvironment} from '../world/index.ts';
import { bindWorldViewport } from '../world/index.ts';
import { createContentStore } from './content-store.ts';
import { describePlace } from '../world/index.ts';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {roomObjects} from '../world/index.ts';
import { createWorldTools } from './live-world-tools.ts';
import {mountNativeHUD,mountAppletShelf} from '../hud/index.ts';

const element:(tag:string,cls?:string,text?:unknown)=>any=node;
const button=textButton;
const icons={account:'<circle cx="12" cy="8" r="3.2"/><path d="M5 21a7 7 0 0 1 14 0"/>',bell:'<path d="M18 9a6 6 0 0 0-12 0c0 6-3 6-3 8h18c0-2-3-2-3-8M10 21h4"/>',mic:'<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v3m-3 0h6"/>'};
const icon=k=>`<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">${icons[k]}</svg>`;
const themes=title=>/github|代码仓库|pull request|软件构建/i.test(title)?'factory':/starship|航天|太空|rocket/i.test(title)?'rocket':/月历|日历|calendar|年表|Time/i.test(title)?'calendar':/CRM|朋友|人脉|关系|contacts/i.test(title)?'cafe':/logs|育儿|孩子|成长|family/i.test(title)?'family':/零花|财务|账|finance|Budget/i.test(title)?'finance':/愿景|愿望|vision|目标|五星/i.test(title)?'vision':/种植|园艺|Garden|garden/i.test(title)?'garden':'library';
// Tools that drive an Applet panel: [panel key, title].
// A field the person is typing in: text inputs, text areas and editable regions, not buttons or toggles.
const TEXT_ENTRY='textarea,input:not([type=button],[type=submit],[type=reset],[type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=image])';
const isTextEntry=(el:Element|null)=>el instanceof HTMLElement&&(el.isContentEditable||el.matches(TEXT_ENTRY));
const PANEL_TOOLS=new Map([['use_stripe_crm',['stripe','Stripe']],['use_youtube',['youtube','YouTube']]]);
export function mountNotionWorld(data: World, native: any) {
  data=structuredClone(data);if(native&&data.buildings?.length)applyModuleWorld(data);
  const regionStorageKey='worldlet-regions-v1:'+String(data.sample?'sample':data.workspaceId||data.workspace||'personal');
  // The areas' layout (names, membership, pinned places, last use) is kept in the World, so it comes back with a
  // backup (owner request 2026-10-04); a World without one yet takes what this page kept before, once.
  const regionsInWorld=!data.sample&&!!native?.editApplet;
  const regionLayout=regionsInWorld&&data.regionLayout?parseRegionLayout(data.regionLayout):readRegionLayout(regionStorageKey);applyRegionLayout(data,regionLayout);
  // The ground follows recent use when the person is back on the World, not behind the Applet they opened.
  let regionsReorder=false;
  document.getElementById('app').hidden=true;document.getElementById('contextSpace').hidden=true;
  const root=element('main','notion-world');root.id='notionWorld';root.dataset.modules=String(!!data.moduleCatalog);document.body.append(root);
  const pages=new Map<string,WorldPage>(data.pages.map(p=>[p.id,p])),byPath=new Map(data.pages.flatMap(p=>p.paths.map(path=>[path,p.id]))),assetPaths=new Set(data.assets.map(a=>a.path)),excludedPaths=new Set((data.excludedAssets||[]).map(a=>a.path));
  let top=data.roots.map(id=>pages.get(id));
  if(top.length===1&&top[0].children.length)top=top[0].children.map(id=>pages.get(id));
  const sections: any[]=data.spaces?.length?data.spaces.map(s=>({...s,virtual:true,kind:'space',parent:null,paths:[],text:'',markdown:''})):top.map(p=>({...p,theme:themes(p.title)}));
  const areas=data.areas||[];
  const buildings=data.buildings||[],composites=data.viewObjects||[];
  const buildingFor=id=>buildings.find(b=>b.id===id||b.rooms.includes(id));
  const objectsFor=room=>roomObjects(room,pages,composites);
  const objectFor=id=>{id=data.navigationAliases?.[id]||id;return sections.flatMap(objectsFor).find(o=>o.id===id||o.roomId===id||o.pageIds.includes(id));};
  const areaFor=id=>areas.find(a=>a.places.includes(id)||a.buildings?.includes(id));
  const describe=theme=>{const s=sections.find(s=>s.theme===theme);if(['mailroom','calendar-room'].includes(s?.module))return {...describePlace(theme),name:s.title,inside:s.title,enter:'Explore'+s.title,shelf:s.module==='mailroom'?'Mail shelf':'Calendar shelf',browse:s.module==='mailroom'?'Check mail':'Check calendar'};return describePlace(theme)};
  for(const s of sections)if(s.virtual)pages.set(s.id,s);
  const contentStore=createContentStore({pages,sections,aliases:data.navigationAliases||{},key:'aladdin-content-v1:'+ (data.sample?'sample':data.workspace),...(native?{storage:native.storage}:{})});
  const memberOf=new Map(sections.flatMap(s=>(s.virtual?s.children:[s.id]).map(id=>[id,s.id])));
  const sectionFor=id=>{let p=pages.get(id),seen=new Set();while(p&&!seen.has(p.id)){seen.add(p.id);if(sections.some(s=>s.id===p.id))return p.id;if(memberOf.has(p.id))return memberOf.get(p.id);p=pages.get(p.parent)}return sections[0]?.id};
  const trails=id=>{let p=pages.get(id),out=[],seen=new Set();while(p&&!seen.has(p.id)){seen.add(p.id);out.unshift(p);p=pages.get(p.parent)}return out};
  let appletShelf:ReturnType<typeof mountAppletShelf>|null=null;
  let voice,environmentController,nativeHUD,travelExperiment,weatherPanel,picturesAsked='';
  let attentionPage:any=null;
  let arrivals=[];
  let objectFromRoom=false,foregroundGuide=null,restoringWorld=false,appletEntryReturn=null;
  let focusEntryReturn=null;
  let current=null,currentSpace=null,depth='overview',scene,searching=false,query='',history=[],catalogOffset=0,searchOffset=0,readerReturns=[];
  const readKey='aladdin-notion-read-'+(data.workspaceId||data.workspace);let read=new Set();try{read=new Set(JSON.parse(localStorage.getItem(readKey)||'[]'))}catch{}
  restoreTextScale(root);
  root.innerHTML=`<div id="notionStage" class="notion-stage" aria-label="A connected 2.5D world of your matters and sources"><div id="notionPins" class="notion-pins"></div></div>
    <div class="notion-top ui-theme-top"><div class="notion-identity"><button id="notionHome" class="notion-wordmark">Worldlet <span id="notionWorkspace"></span></button><div class="notion-world-caption"><span id="notionWorldTitle"></span><span id="notionWorldMeta"></span></div><nav id="notionBreadcrumb" class="notion-breadcrumb" aria-label="Current location" hidden></nav></div><div class="notion-tools"><button id="notionUpdates" class="notion-round" aria-label="Notifications" title="Notifications">${icon('bell')}<i></i></button><button id="notionAccount" class="notion-round" aria-label="Account & sources" title="Account & sources">${icon('account')}</button></div></div>
    <section id="notionHUD" class="notion-hud ui-theme-companion" aria-label="Command bar"><div id="notionContent" class="notion-content" hidden></div><div id="notionStatus" class="notion-status" role="status" hidden></div><div class="notion-shortcuts"><button id="notionBack" hidden>Back</button><button id="notionNext">Next place →</button></div><form id="notionCommand" class="notion-command"><button id="notionVoice" type="button" aria-label="Voice input" aria-pressed="false">${icon('mic')}</button><label class="space-sr" for="notionInput">Search notes or describe what you want to see</label><textarea id="notionInput" rows="1" autocomplete="off" placeholder="What would you like to explore?"></textarea><button type="submit" id="notionSend" aria-label="Send">↑</button></form><div id="notionVoiceStatus" class="notion-status" role="status" hidden></div></section>
    <dialog id="notionDialog" class="notion-dialog ui-theme-dialog" aria-labelledby="notionDialogTitle"><button id="notionDialogClose" class="notion-close" aria-label="Close">×</button><div id="notionDialogBody"></div></dialog>`;
  const $=id=>root.querySelector('#'+id),content=$('notionContent'),hud=$('notionHUD'),pins={};
  if(native)installTextReaderHUD(content);
  if(native)observeWorldActivity(root,()=>!data.sample);
  let recordedLocation='';
  function recordLocationActivity(){
    if(!native||data.sample)return;const target=[depth,current||'',currentSpace||''].join(':');if(target===recordedLocation)return;
    if(recordedLocation)recordWorldActivity('ui.close',{target:recordedLocation});
    recordedLocation=target;recordWorldActivity('ui.open',{target,appletId:sections.find(s=>s.moduleId===current)?.moduleId||'',region:currentSpace||''});
  }
  // A card the person closes goes into the Journal on its way out (owner request 2026-10-08).
  const attentionPreview=mountAttentionPreview({root,onClose:()=>{flyIntoJournal(root,$('attentionPreview'));closeAttentionPreview();},onOriginal:openAttentionOriginal,onLink:href=>{const page=attentionPage;closeAttentionPreview(false);openWorldURL(href,{attention:page});}});
  // Every card Fox shows is kept as an artifact (core/artifacts/README.md); the person finds it again in Fox's panel.
  let shownArtifact:any=null,artifactsShown=0;
  const keepArtifact=(artifact)=>{if(native?.artifacts)void Promise.resolve(native.artifacts({operation:'save',artifact})).catch(()=>{});};
  const foxArtifact=mountFoxArtifact(root,renderMarkdown,()=>{flyIntoJournal(root,$('foxArtifact'));foxArtifact.close();delete root.dataset.attentionPreview;voice?.sync();},href=>openWorldURL(href),size=>{if(shownArtifact){shownArtifact={...shownArtifact,size};keepArtifact(shownArtifact);}},
   // A next step on the card drafts the person's request in Fox's message bar; it goes to Fox only when they send it,
   // so a card made from untrusted content can never speak for them (core/artifacts/README.md#actions).
   action=>{const input=root.querySelector('#notionInput') as HTMLTextAreaElement|HTMLInputElement|null;if(!input)return;input.value=action.request;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange?.(input.value.length,input.value.length);},
   // What the person ticks or sets on the card's blocks is kept with it, so the Journal and a reopened card show it.
   blocks=>{if(shownArtifact){shownArtifact={...shownArtifact,blocks};keepArtifact(shownArtifact);}});
  function showArtifact(args,artifact){
   const result=foxArtifact.show(args);
   if(result.ok){artifactsShown++;closeAttentionPreview(false);root.dataset.attentionPreview='true';voice?.sync();shownArtifact=artifact?{...artifact,size:result.size}:null;if(shownArtifact)keepArtifact(shownArtifact);}
   return result;
  }
  async function openArtifact(id):Promise<{error?:string;[key:string]:unknown}>{
   if(!native?.artifacts)return {error:'The practice world keeps no artifacts.'};
   const artifact=readArtifact((await native.artifacts({operation:'get',id}))?.artifact);
   if(!artifact)return {error:'That artifact is not in this World any more.'};
   // An Attention card opens on its item while the item is in the World, with its outcomes.
   if(artifact.origin.type==='attention'&&previewAttention({worldItemId:artifact.origin.item}))return {ok:true,id:artifact.id,title:artifact.title};
   const label=artifact.kind==='attention'?(artifact.category||'Attention')+' · earlier':'From an earlier conversation';
   return showArtifact({id:artifact.id,title:artifact.title,body:artifact.body||' ',brief:artifact.brief||null,detail:artifact.detail||null,chart:artifact.chart,size:artifact.size,actions:artifact.actions,blocks:artifact.blocks||null,tone:artifact.tone||null,art:artifact.art||null,label},artifact.kind==='answer'?artifact:null);
  }
  // A page Fox made is an Applet while its moment lasts or once kept; a finished one comes back when the person keeps it.
  async function openMade(widget:string,keep:boolean){
   const applet=momentAppletId(widget);
   if(keep){if(!native?.widgets)return;try{await native.widgets({operation:'pin',id:widget});}catch(error){notify(error.message||'Could not bring it back.');return;}}
   const here=()=>sections.some(r=>r.moduleId===applet);
   for(let tries=0;tries<25&&!here();tries++)await new Promise(resolve=>setTimeout(resolve,120));
   if(here())visitObject(applet);else notify('That Applet is not in this World any more.');
  }
  window.addEventListener('worldlet:artifact-open',(event:any)=>{
   const detail=event.detail||{};
   if(typeof detail.made==='string'){void openMade(detail.made,detail.keep===true);return;}
   void openArtifact(String(detail.id||'')).then(result=>{if(result?.error)notify(result.error);});
  });
  root.addEventListener('click',e=>{
   // A click elsewhere in the World puts the card away into the Journal. Over an Applet the card stays pinned in the
   // top-right corner until its × (owner Order 2026-10-09: a click beside it made it vanish with no way back).
   if(foxArtifact.visible&&!insideApplet()&&!(e.target as Element).closest('#foxArtifact,#notionHUD,button,a,input,textarea,select,[role="button"],.world-task-tracker')){flyIntoJournal(root,$('foxArtifact'));foxArtifact.close();delete root.dataset.attentionPreview;voice?.sync();}
   if(!attentionPage||(e.target as Element).closest('#attentionPreview,#notionHUD,button,a,input,textarea,select,[role="button"],.notion-pin,.world-task-tracker,.notion-content,.notion-dialog'))return;
   e.preventDefault();e.stopPropagation();flyIntoJournal(root,$('attentionPreview'));closeAttentionPreview(false);voice?.hidePreview?.(true);
  },true);
  window.addEventListener('worldlet:routines',(event: any)=>{const r=event.detail;if(r.error)notify(r.error);else if(r.ran)notify((r.job?.last_status==='ok'?(r.late?'Finished late: ':'Finished: '):'Check routine: ')+(r.job?.name||'Scheduled task')+'. Ask Fox for the result.');});
  const appletPanels=new Map();
  // Spatial context switching (owner decision 2026-10-04): each website in a browsing Applet is its own
  // place to talk with Fox (`web:<site>`). A page Fox opens while helping with an Attention item stays
  // that item's place until the person moves to another site or the item is settled.
  // The page an item's help opens before Fox's turn (`previewActions`) is already the item's place while it
  // loads: Fox's turn starts there, and a place change mid-turn stops Fox's page steps ("The user changed views").
  let attentionOrigin:{key:string,title:string,at:number}|null=null,attentionOpening:{key:string,title:string,site:string}|null=null;
  // A carried thread (`carried`) is the conversation the page brought from the place it left (carryConversation).
  const siteThreads=new Map<string,{key:string,title:string,carried?:boolean}>();
  // The website each Applet's page was last on, to see the page move to another one.
  const pageSites=new Map<string,string>();
  const browserPanel=createBrowserPanel({root,content,native,notify,openApplet:id=>visitObject(id),openPage:url=>openWorldURL(url),leave:()=>back(),sample:!!data.sample,
    // A page opened from something in its Applet (a link in an email, a meeting) goes back there from its first page.
    canReturn:()=>!!libraryWebReturn&&depth==='object'&&current===libraryWebReturn.app.moduleId,
    // Make Applet at the top of the Browser (core/applets/site-applet.ts): the made Applets are the World's own.
    madeApplets:native?.siteApplets&&!data.sample?{
      find:url=>{const host=siteAppletPage(url)?.hostname.toLowerCase().replace(/^www\./,''),made=host?sections.find(r=>r.site?.host===host):null;return made?{id:made.moduleId,title:made.title}:null;},
      make:async page=>{const result=await native.siteApplets({operation:'make',url:page.url,title:page.title});return {id:siteAppletId(result.id),title:result.title};},
    }:null,
    onPage:(applet,page,byFox)=>{
      const site=webSite(page.url);
      if(site&&byFox&&attentionOrigin&&Date.now()-attentionOrigin.at<15*60000){siteThreads.set(applet+'|'+site,{key:attentionOrigin.key,title:attentionOrigin.title});attentionOrigin=null;}
      if(site&&byFox)attentionOpening=null;
      const before=pageSites.get(applet);if(site)pageSites.set(applet,site);
      if(site&&before&&before!==site)carryConversation(applet,before,site,page,byFox);
      nativeHUD?.sync();
    }});
  window.addEventListener('worldlet:fox-idle',()=>{attentionOrigin=null;attentionOpening=null;if(carryPending){const next=carryPending;carryPending=null;setTimeout(()=>carryToApplet(next.from,next.to),0);}});
  /** The page in an Applet moved from one website to another (a link, or Fox's step). While the person and Fox are
   * talking (core/companion/conversation-place.ts, carriesConversation) the conversation goes with it: the new site
   * continues the place it came from instead of starting its own (owner Order 2026-10-09). A page that belongs to
   * another website Applet in the World moves there, with its background and title; Fox's turn finishes first, so
   * its steps on the page are never cut off by the move. */
  let carryPending:{from:string,to:string}|null=null;
  function carryConversation(applet:string,before:string,site:string,page:{url:string,title:string},byFox:boolean){
    const r=sections.find(s=>s.key===applet&&s.entity==='app');if(!r)return;
    const from=siteThreads.get(applet+'|'+before)||{key:'web:'+before,title:r.title+' · '+before};
    const last=voice?.threadOf?.(from.key,1)?.[0];
    const bound=siteThreads.get(applet+'|'+site);
    if((!bound||bound.carried)&&carriesConversation({byFox,working:last?.status==='working',lastTurnAt:last?.at??null,now:Date.now()}))
      siteThreads.set(applet+'|'+site,{key:from.key,title:from.title,carried:true});
    // Only a website Applet (or one made from a site) hands its page on; the Browser offers the switch instead.
    if(applet==='browser'||applet==='web'||depth!=='object'||current!==r.moduleId)return;
    const own=pageApplet(page.url);
    if(!own||own===r.moduleId)return;
    if(byFox&&voice?.active){carryPending={from:r.moduleId,to:own};return;}
    setTimeout(()=>carryToApplet(r.moduleId,own),0);
  }
  const pageApplet=(url:string)=>websiteAppletFor(url,sections.filter(s=>s.entity==='app').map(s=>({id:s.moduleId,web:s.fullView?.kind==='web',siteHost:s.site?.host})));
  function carryToApplet(from:string,to:string){
    const r=sections.find(s=>s.moduleId===from),target=sections.find(s=>s.moduleId===to);
    // Only while the person is still on that page in that Applet.
    if(!r||!target||depth!=='object'||current!==from||content.hidden||content.dataset.template!=='browser')return;
    const page=browserPanel.lastVisit(r.key),site=page?webSite(page.url):'';
    if(!page||pageApplet(page.url)!==to)return;
    const thread=siteThreads.get(r.key+'|'+site);
    if(thread)siteThreads.set(target.key+'|'+site,thread);
    pageSites.set(target.key,site);
    visitObject(target.moduleId,{enter:false});
    // The Applet it left lets the page go and starts on its own website next time.
    header(target.title,'Website',{applet:true});browserPanel.mount(target.key,{url:page.url,platform:'web',release:true});
    sceneState();
  }
  /** The place a browsing Applet's open page is: its Attention item's, or the website's own. The
   * title stays the Applet's name: it is the top bar's title (#951), and a page title or address
   * shown there would reach the World's activity record (applet-resume-check). Only Fox's turn
   * context names the page. */
  function websiteContext(r){
    if(content.hidden||content.dataset.template!=='browser')return null;
    const page=browserPanel.lastVisit(r.key),site=page?webSite(page.url):'';
    if(attentionOpening)return {key:attentionOpening.key,title:r.title,detail:'Opening '+attentionOpening.site+' in '+r.title+' for the Attention item "'+attentionOpening.title+'". Read the page before acting.'};
    if(!page||!site)return null;
    let bound=siteThreads.get(r.key+'|'+site);
    if(bound?.carried){
      const last=voice?.threadOf?.(bound.key,1)?.[0];
      if(!carriesConversation({working:last?.status==='working',lastTurnAt:last?.at??null,now:Date.now()})){siteThreads.delete(r.key+'|'+site);bound=undefined;}
      else return {key:bound.key,title:r.title,detail:'Website open in '+r.title+': '+page.url+' ('+page.title+'). The conversation continues here from '+bound.title+': the page moved on while you were talking, so the earlier turns still apply. Read the page or the browser\'s recordings before answering about it.'};
    }
    if(bound)return {key:bound.key,title:r.title,detail:'Working on the Attention item "'+bound.title+'" in '+r.title+' on '+page.url+' ('+page.title+'). Read the page before acting.'};
    return {key:'web:'+site,title:r.title,detail:'Website open in '+r.title+': '+page.url+' ('+page.title+'). Read the page or the browser\'s recordings before answering about it.'};
  }
  // Public links share the same visible browser, including Fox citations and originals. Inside an Applet a
  // page opens in that Applet; anywhere else it opens where the person is, as a page over the World with
  // its own close (owner request 2026-10-06: browsing is a capability; only the Browser's own entry is the
  // Browser Applet). Closing it returns to where it was opened from: the Attention card, Fox's card, the note.
  let pageLayer:{depth:string,current:string,attention:any,artifact:any}|null=null;
  const inPageLayer=()=>!!pageLayer&&!content.hidden&&content.dataset.template==='browser'&&content.dataset.applet==='web';
  function closePageLayer(){
    const from=pageLayer;pageLayer=null;if(!from)return;
    if(from.depth==='note'&&pages.has(from.current)){open(from.current);return;}
    content.hidden=true;hud.classList.remove('is-reading');sceneState();
    if(from.attention?.worldItemId&&previewAttention({worldItemId:from.attention.worldItemId}))return;
    if(from.artifact&&!foxArtifact.visible)void openArtifact(from.artifact.id);
  }
  function openWorldURL(value:string,from:{attention?:any,artifact?:any}={}){
    let url:URL;try{url=new URL(value);}catch{return false;}
    if(url.protocol!=='https:'||url.username||url.password)return false;
    const app=depth==='object'?sections.find(s=>s.moduleId===current&&s.entity==='app'):null;
    if(app){
      if(content.dataset.template!=='browser')libraryWebReturn={app,record:appReader?.app.key===app.key?appReader.record:null};
      header(app.title,'Website',{applet:true});browserPanel.mount(app.key,{url:url.href,platform:'web'});sceneState();return true;
    }
    libraryWebReturn=null;
    // A page with its own website Applet in the World (an Attention card's PostHog link) opens
    // there directly, never through the Browser and whatever page it last showed.
    const own=websiteAppletFor(url.href,sections.filter(s=>s.entity==='app').map(s=>({id:s.moduleId,web:s.fullView?.kind==='web',siteHost:s.site?.host})));
    const site=own?sections.find(s=>s.moduleId===own):null;
    if(site){
      visitObject(site.moduleId,{enter:false});
      header(site.title,'Website',{applet:true});browserPanel.mount(site.key,{url:url.href,platform:'web'});sceneState();return true;
    }
    const origin=inPageLayer()?pageLayer:{depth,current,attention:from.attention||null,artifact:from.artifact||(foxArtifact.visible?shownArtifact:null)};
    closeRegionShelf();header(webSite(url.href),'Web');browserPanel.mount('web',{url:url.href,platform:'web'});pageLayer=origin;sceneState();return true;
  }
  window.addEventListener('worldlet:open-url',(event:any)=>openWorldURL(event.detail?.url||''));
  root.addEventListener('click',event=>{
    const link=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;
    if(!native?.browser||!link||link.hasAttribute('download')||event.defaultPrevented)return;
    if(link.protocol==='https:'){event.preventDefault();openWorldURL(link.href);}
  });
  bindWorldViewport(root);
  root.classList.add('fox-first-console');
  $('notionWorkspace').textContent=(data.sample?'Worldlet':data.workspace)+(data.sample?'':native?' · Local':' · Notion');
  if(native){$('notionHome').firstChild.textContent='WORLDLET ';$('notionAccount').setAttribute('aria-label','Ask Fox');$('notionAccount').title='Ask Fox';$('notionUpdates').hidden=true;}
  // The sample switch lives in Settings, bottom left. A pill beside the account
  // button used to sit here and had been display:none for long enough that
  // nothing referred to it; only the flag it set is still read, by the world
  // state Fox is given, so that stays.
  root.dataset.sample=String(!!data.sample);
  if(data.sample)$('notionStage').setAttribute('aria-label',data.localArchive?'A connected 2.5D world of local Notion content and fictional content':'A connected 2.5D world of fictional content');
  $('notionWorldTitle').textContent='A place for all your notes.';
  $('notionWorldMeta').textContent=`${data.coverage.pages}  pages · ${data.coverage.rows}  database records · Stored locally`;
  function notify(text: string){$('notionStatus').hidden=true;voice?.setStatus(text);}
  function dialog(title: string,{kind='detail'}: {kind?: string}={}){$('notionDialog').dataset.kind=kind;delete $('notionDialog').dataset.template;const body=$('notionDialogBody');body.classList.remove('ui-gallery','ui-large');delete body.dataset.theme;body.style.removeProperty('--ui-text-body');body.style.removeProperty('--ui-text-label');body.replaceChildren(Object.assign(element('h2','',title),{id:'notionDialogTitle'}));if(native){if(!$('notionDialog').open)$('notionDialog').show();}else $('notionDialog').showModal();return body}
  let worldPointerStart:{x:number,y:number,panelOpen:boolean,handled?:boolean,typing:''|'world'|'page'}|null=null;
  // Typing is read when the press starts, before the browser moves focus off the field. A website
  // page keeps its own focus: the World window gaining focus with this press means the person was in
  // the page (or another app; endTyping then finds no field and the tap goes Back as usual).
  let windowFocusAt=0;window.addEventListener('focus',()=>{windowFocusAt=performance.now();});
  function typingNow(){
    if(isTextEntry(document.activeElement))return 'world';
    const page=native?.browser&&!content.hidden&&content.dataset.template==='browser';
    return page&&(!document.hasFocus()||performance.now()-windowFocusAt<1000)?'page':'';
  }
  root.addEventListener('pointerdown',e=>{worldPointerStart={x:e.clientX,y:e.clientY,panelOpen:!content.hidden,typing:typingNow()};},true);
  root.addEventListener('click',e=>{
    // Pixi pointertap opens Applets before the DOM click bubbles: never close
    // a panel that this same gesture just opened.
    if(worldPointerStart&&!worldPointerStart.panelOpen)return;
    // A scene tap inside an Applet already went back on pointerup: one gesture, one step.
    if(worldPointerStart?.handled)return;
    if(!native||content.hidden||insideApplet()||content.contains(e.target)||e.target.closest('button,a,input,textarea,select,dialog,.notion-hud,.notion-top'))return;
    if(e.target.closest('canvas[data-renderer]')){
      if(worldPointerStart&&Math.hypot(e.clientX-worldPointerStart.x,e.clientY-worldPointerStart.y)>6)return;
    }
    // Handle Focus dismissal before tutorial capture: one scenery click closes
    // the reader, never advances the guide or also exits the Applet's Open view.
    // Over a page opened outside any Applet, a click while typing only ends typing, as in an Applet.
    e.preventDefault();e.stopImmediatePropagation();const typing=inPageLayer()&&worldPointerStart?.typing;if(typing){endTyping(typing);return;}back();
  },true);
  root.addEventListener('click',e=>{if(native&&$('notionDialog').open&&!e.target.closest('dialog,.notion-hud,.notion-top,button,a,input,textarea,select,#notionContent'))$('notionDialog').close();});
  $('notionDialogClose').onclick=()=>$('notionDialog').close();$('notionDialog').addEventListener('click',e=>{if(e.target===$('notionDialog')){const r=$('notionDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('notionDialog').close()}});
  function sourceInfo(){native.settings();}
  $('notionAccount').onclick=()=>{if(native)voice?.cancel();sourceInfo();};
  if(data.sample||native)$('notionUpdates').querySelector('i').hidden=true;
  $('notionUpdates').onclick=()=>{if(native){native.settings();return}if(data.sample){const body=dialog('Attention Center');body.append(element('p','','Nothing needs your attention.'),element('p','','This practice world has no real sources or remote updates connected.'));return}const body=dialog('Source updates');body.append(element('h3','','Notion Imported'),element('p','',`${data.coverage.pages}  pages and ${data.coverage.rows}  database records added to your local world.`),element('p','','Imported records keep their original dates. Historical records are not treated as new tasks.'),button('View sources',()=>{$('notionDialog').close();sourceInfo()}));$('notionUpdates').querySelector('i').hidden=true};
  let toolNavigation=false;
  function dismissFox(){if(root.dataset.onboarding==='true'||toolNavigation)return;voice?.hidePreview?.();}
  function insideApplet(){return depth==='object'||depth==='note';}
  function endTyping(where){
    if(where==='world'){(document.activeElement as HTMLElement|null)?.blur?.();return;}
    Promise.resolve(native.browser.command('endTyping',{},false)).then(value=>value?.typing===true,()=>false).then(typed=>{if(!typed&&(insideApplet()||inPageLayer()))back();});
  }
  // Inside an Applet a click on bare scenery leaves it one step, like Back (owner request 2026-10-05,
  // reversing 2026-10-04). An open card or dialog closes first, on the DOM click; background
  // targets stay disabled, so the click never selects the Region or Applet behind.
  // While the person types, that same tap only ends typing and the Applet stays (owner request 2026-10-06).
  function spatialAction(target){if(inPageLayer()){
    // A page opened over the World is in front: a tap on the World behind it closes it, one step like Back,
    // or only ends typing; the tap that opened it (the same gesture) does nothing more.
    if(!worldPointerStart?.panelOpen||attentionPage||foxArtifact.visible||$('notionDialog').open)return;
    const typing=worldPointerStart.typing;worldPointerStart.handled=true;if(typing){endTyping(typing);return;}back();return;}
   if(target.action==='back'&&insideApplet()){if(attentionPage||foxArtifact.visible||$('notionDialog').open)return;const typing=worldPointerStart?.typing;if(worldPointerStart)worldPointerStart.handled=true;if(typing){endTyping(typing);return;}back();return;}if(target.action==='region-more'){if(root.dataset.onboardingLocked!=='true'){if(THEME_SCENE.areaZoom)visitBuilding(target.id);else openRegion(target.id);}return;}if(!content.hidden&&['app-source','coding-session','browser'].includes(content.dataset.template)&&['back','building','space'].includes(target.action)){back();return;}if(target.action==='back'){back();return;}if(target.id!=='place-app-youtube'&&target.id!=='app-youtube')dismissFox();if(target.action==='applet-item'){openStageItem(target.id);return;}if(target.action==='building')visitBuilding(target.id);else visitSpace(target.id,target.level||'place')}
  // Scene edits change presentation only; connected sources and records remain intact.
  const layoutKey='worldlet-applet-layout:'+String(data.sample?'sample':data.workspace);
  function loadSampleLayout(){if(!data.sample&&native?.editApplet)return;try{const saved=JSON.parse(localStorage.getItem(layoutKey)||'{}');Object.assign(data,saved);}catch{}}
  loadSampleLayout();
  async function editApplet(operation,id,position?){
    if(!sections.some(r=>r.moduleId===id&&r.entity==='app'))throw Error('Applet is unavailable in this world.');
    if(!data.sample&&native?.editApplet)await native.editApplet({operation,applet:id,...(position?{position}:{})});
    if(operation==='removeApplet')data.hiddenApplets=[...new Set([...(data.hiddenApplets||[]),id])];
    if(operation==='unlock'){data.hiddenApplets=(data.hiddenApplets||[]).filter(a=>a!==id);if(!unlockedList().includes(id))data.unlockedApplets.push(id);}
    if(data.sample||!native?.editApplet)localStorage.setItem(layoutKey,JSON.stringify({hiddenApplets:data.hiddenApplets,appletPositions:data.appletPositions,unlockedApplets:data.unlockedApplets}));
    scene?.setAppletLayout(data.hiddenApplets,data.appletPositions);scene?.setUnlockedApplets(data.unlockedApplets);saveRegions();
    root.dispatchEvent(new CustomEvent('worldlet:applet-layout'));
  }
  root.appletLayout={area:id=>sections.find(r=>r.moduleId===id&&r.entity==='app')?.buildingId,areaTitle:id=>buildings.find(b=>b.id===id)?.title,has:id=>!data.hiddenApplets?.includes(id)&&(data.unlockedApplets?data.unlockedApplets.includes(id):sections.find(r=>r.moduleId===id)?.installByDefault!==false),available:id=>sections.some(r=>r.moduleId===id&&r.entity==='app'),add:id=>editApplet('unlock',id),open:id=>visitObject(id)};
  // Saved with every theme's pinned places (ui/themes/theme-placements.ts).
  const storedRegions=()=>JSON.stringify(storedRegionLayout(regionLayout));
  let savedRegions=regionsInWorld&&data.regionLayout?storedRegions():'',regionSave=false;
  function saveRegions(){
   if(!regionsInWorld){localStorage.setItem(regionStorageKey,storedRegions());return;}
   // One write per burst of changes, and none when nothing changed.
   if(regionSave)return;regionSave=true;queueMicrotask(()=>{regionSave=false;const value=storedRegions();if(value===savedRegions)return;savedRegions=value;
    Promise.resolve(native.editApplet({operation:'regionLayout',layout:JSON.parse(value)})).catch(()=>{savedRegions='';});});
  }
  // Where each Applet stands now: its area's place index, or -1 when it is not on the ground.
  function groundIndex(id){
   const room=sections.find(r=>r.moduleId===id&&r.entity==='app');if(!room)return -1;
   const slot=resolvePlacements(sections,{},r=>root.appletLayout.has(r.moduleId),{},regionLayout)[id];
   return slot?WORLD_LAYOUT.regions[room.region]?.placements.findIndex(s=>s.id===slot.id)??-1:-1;
  }
  function pinApplet(id,pin){
   const room=sections.find(r=>r.moduleId===id&&r.entity==='app'),index=groundIndex(id);if(!room||pin&&index<0)return;
   pinRegionApplet(regionLayout,id,room.region,pin?index:null);refreshRegions();
  }
  function refreshRegions(){
   for(const room of sections){const id=regionId(regionLayout.assignments[room.moduleId]||room.region||room.buildingId||'home');room.region=id;room.buildingId='building-'+id;}
   for(const b of buildings){const id=regionId(b.id);b.title=regionLayout.names[id]||WORLD_LAYOUT.regions[id]?.title||b.title;b.visualTheme=regionLayout.themes[id]||id;b.rooms=sections.filter(r=>r.buildingId===b.id).map(r=>r.id);}
   scene?.refreshRegions();saveRegions();root.dispatchEvent(new CustomEvent('worldlet:applet-layout'));
  }
  function moveApplet(id,region,index?){
   if(root.dataset.onboardingLocked==='true'||!root.appletLayout.has(id))return;
   moveRegionApplet(regionLayout,id,region,index);saveRegions();refreshRegions();
  }
  const regionManage=button('Manage Applets',()=>openRegion(current),'region-manage');root.append(regionManage);
  let regionShelf: HTMLElement|null=null,regionShelfTrigger: HTMLElement|null=null,regionShelfPlace='';
  let shelfDrop:((index:number)=>Promise<void>)|null=null;
  function closeRegionShelf(){
   shelfDrop=null;scene?.setPlacementArea(null);if(regionShelf)scene?.frameArea(null);regionShelf?.remove();regionShelf=null;regionShelfTrigger?.focus({preventScroll:true});regionShelfTrigger=null;}
  // An Area recommends Applets related to it that are not in the World yet (owner Order 2026-10-07), worked out here
  // from the catalog, the apps installed on this computer and the sites visited in Worldlet's browser (hosts and counts
  // only). The signals are read again at most every ten minutes, never by Fox, and nothing leaves the computer.
  let areaSignals={installed:new Set<string>(),visits:{} as Record<string,number>,at:0},areaSignalsReading=false;
  function readAreaSignals(){
   if(data.sample||areaSignalsReading||Date.now()-areaSignals.at<600_000)return;areaSignalsReading=true;
   const installed=native?.installedApplets?Promise.resolve(native.installedApplets()).then(r=>new Set<string>(Array.isArray(r?.keys)?r.keys:[]),()=>areaSignals.installed):Promise.resolve(areaSignals.installed);
   const visits=native?.visitedSites?Promise.resolve(native.visitedSites()).then(r=>r?.hosts&&typeof r.hosts==='object'?r.hosts:{},()=>areaSignals.visits):Promise.resolve(areaSignals.visits);
   void Promise.all([installed,visits]).then(([i,v])=>{areaSignals={installed:i,visits:v,at:Date.now()};}).finally(()=>{areaSignalsReading=false;});
  }
  // An Applet's catalog category is the Area it belongs to by default; the Area it stands in is the person's choice.
  const appCategory=(r:any)=>regionId(getApp(r.key)?.region||r.region||'home');
  const appWebsite=(r:any)=>appletHost(getApp(r.key)||r);
  // Puts an Applet the person did not have yet into this Area; opening it then makes it theirs.
  function placeInArea(applet:string,area:string){moveRegionApplet(regionLayout,applet,area);saveRegions();refreshRegions();}
  function openRegion(value){
   const id=regionId(value),building=buildings.find(b=>regionId(b.id)===id);if(!building)return;
   const refresh=regionShelf?.dataset.area===id;closeRegionShelf();regionShelfTrigger=document.activeElement as HTMLElement;
   const shelf=element('section','region-shelf ui-hud-panel');regionShelf=shelf;regionShelfPlace=depth+':'+current;shelf.dataset.area=id;if(refresh)shelf.classList.add('is-refresh');shelf.setAttribute('role','dialog');shelf.setAttribute('aria-label',building.title+' applets');
   const header=element('header','region-shelf-header');header.append(element('h2','',building.title));
   shelf.append(header);
   // The Games area's landmark is its game workshop (owner decision 2026-10-03): this panel is where games
   // are discovered (the lists below) and made. Making a game is coming soon (core/games/README.md).
   if(id==='health'){
    const factory=element('section','region-shelf-factory'),title=element('div','region-shelf-factory-title');
    title.append(element('h3','','Make a game'),element('span','region-shelf-soon','Coming soon'));
    const idea=element('input') as HTMLInputElement;idea.disabled=true;idea.placeholder='Tell Fox the game you want: “like Flappy Bird, but a fox flies over the river”';idea.setAttribute('aria-label','The game you want (coming soon)');
    factory.append(title,element('p','','Fox will make small games for you here, tried before they arrive and played offline on this computer.'),idea);
    shelf.append(factory);
   }
   readAreaSignals();
   // The Area holds only the person's own Applets, most recently used first (owner Order 2026-10-07): chosen at setup,
   // opened, or put here. The rest of the catalog is recommended below or listed under All.
   const apps=sections.filter(r=>r.entity==='app'&&r.region===id&&root.appletLayout.has(r.moduleId)).sort((a,b)=>recentlyUsedFirst(a,b,regionLayout));
   const placements=resolvePlacements(sections,{},r=>root.appletLayout.has(r.moduleId),{},regionLayout);
   const ground=WORLD_LAYOUT.regions[id].placements.map(slot=>apps.find(app=>placements[app.moduleId]?.id===slot.id)||null);
   const groundIds=new Set(ground.filter(Boolean).map(app=>app.moduleId));
   shelf.append(element('p','region-shelf-note','The '+(ground.length===5?'five':ground.length)+' you used last stand on the ground. Pin one to keep its place.'));
   const catalog=sections.filter(r=>r.entity==='app'&&r.key&&!['ongoing','weather'].includes(r.key)&&!r.ongoing&&!r.moment&&!r.site);
   const list=element('div','region-shelf-scroll');shelf.append(list);
   let dragged:string|null=null,dropping=false;
   const clearDrop=()=>shelf.querySelectorAll('.is-drop-target').forEach(node=>node.classList.remove('is-drop-target'));
   const acceptDrop=()=>!!dragged&&!dropping&&root.dataset.onboardingLocked!=='true'&&sections.some(app=>app.entity==='app'&&app.moduleId===dragged);
   async function place(index:number){
     if(!acceptDrop())return;clearDrop();shelf.classList.remove('is-dragging');scene?.setPlacementArea(null);
     const applet=dragged,source=ground.findIndex(app=>app?.moduleId===applet),displaced=ground[index]?.moduleId;
     dragged=null;if(source===index)return;dropping=true;shelf.setAttribute('aria-busy','true');
     try{
      if(!root.appletLayout.has(applet))await editApplet('unlock',applet);
      // Dropping pins the Applet to that place. A pinned Applet it displaces takes the place it came from; an
      // unpinned one goes back among the recently used.
      const pins=regionLayout.pins[id]??=Array(5).fill(null),displacedPinned=!!displaced&&pins[index]===displaced;
      pinRegionApplet(regionLayout,applet,id,index);
      if(displacedPinned&&source>=0)pinRegionApplet(regionLayout,displaced,id,source);
      saveRegions();refreshRegions();
      if(regionShelf===shelf){openRegion(id);regionShelf.querySelector<HTMLElement>('[data-ground-slot="'+index+'"]').focus();}
     }catch(error){notify(error.message||'Could not move this app. Try again.');}
     finally{dropping=false;shelf.removeAttribute('aria-busy');}
   }
   shelfDrop=place;
   function dropTarget(tile:HTMLElement,index:number){
    tile.dataset.groundSlot=String(index);
    tile.ondragover=e=>{if(!acceptDrop())return;e.preventDefault();e.dataTransfer.dropEffect='move';clearDrop();tile.classList.add('is-drop-target');};
    tile.ondragleave=()=>tile.classList.remove('is-drop-target');
    tile.ondrop=e=>{if(!acceptDrop())return;e.preventDefault();e.stopPropagation();void place(index);};
   }
   const group=(title,items,heading:string|null=title)=>{if(heading)list.append(element('h3','',heading));const grid=element('div','region-shelf-grid');grid.dataset.group=title;list.append(grid);for(const [index,app] of items.entries()){
    if(!app){const empty=element('div','region-shelf-slot','Empty place');empty.setAttribute('aria-label','Empty place '+(index+1));dropTarget(empty,index);grid.append(empty);continue;}
    const own=root.appletLayout.has(app.moduleId)&&app.region===id;
    const tile=button('',()=>{closeRegionShelf();if(!own&&!root.appletLayout.has(app.moduleId))placeInArea(app.moduleId,id);visitObject(app.moduleId);if(appletEntryReturn)appletEntryReturn.area=id;},'region-shelf-applet');tile.setAttribute('aria-label',app.title);
    const img=element('img');img.src=themeAppletIcon(app.key)||'';img.alt='';tile.append(img,element('span','',app.title));
    tile.draggable=true;tile.ondragstart=e=>{if(dropping){e.preventDefault();return;}dragged=app.moduleId;requestAnimationFrame(()=>{if(dragged&&regionShelf===shelf)shelf.classList.add('is-dragging');});scene?.setPlacementArea(id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/worldlet-applet',app.moduleId);};tile.ondragend=()=>{dragged=null;shelf.classList.remove('is-dragging');clearDrop();scene?.setPlacementArea(null);};
    if(!own){
     // Recommended and All: Place here adds it to this Area without opening it.
     const cell=element('div','region-shelf-cell'),add=button('Place here',()=>{void editApplet('unlock',app.moduleId).then(()=>{placeInArea(app.moduleId,id);if(regionShelf===shelf)openRegion(id);},error=>notify(error.message||'Could not place this app. Try again.'));},'region-shelf-place');
     add.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>';add.title='Place here';add.setAttribute('aria-label','Place '+app.title+' in '+building.title);cell.append(tile,add);grid.append(cell);continue;
    }
    if(title!=='On the ground'){const cell=element('div','region-shelf-cell');cell.append(tile,moveButton(app));grid.append(cell);continue;}
    dropTarget(tile,index);
    // Pin keeps this Applet in this place whatever is used next; unpinned places follow recent use.
    const pinned=regionLayout.pins[id]?.[index]===app.moduleId,cell=element('div','region-shelf-cell');cell.dataset.pinned=String(pinned);tile.dataset.pinned=String(pinned);
    const pin=button(pinned?'Unpin':'Pin',()=>{pinRegionApplet(regionLayout,app.moduleId,id,pinned?null:index);saveRegions();refreshRegions();if(regionShelf===shelf){openRegion(id);regionShelf.querySelector<HTMLElement>('[data-ground-slot="'+index+'"] + .region-shelf-pin')?.focus();}},'region-shelf-pin');
    pin.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M15 3l6 6-3 1-3.5 3.5L15 18l-2 2-4-4-5 5-1-1 5-5-4-4 2-2 4.5.5L14 6z"/></svg>';pin.setAttribute('aria-pressed',String(pinned));pin.setAttribute('aria-label',(pinned?'Unpin ':'Pin ')+app.title);pin.title=pinned?'Pinned here. Unpin to let recent use move it.':'Keep '+app.title+' in this place';
    cell.append(tile,pin,moveButton(app));grid.append(cell);
   }};
   // Move to another Area, from the panel as from the device's own menu in the World.
   function moveButton(app){
    const move=button('',()=>{
     const open=shelf.querySelector('.region-shelf-move-menu') as HTMLElement|null;open?.remove();shelf.querySelectorAll('.region-shelf-move').forEach(b=>b.setAttribute('aria-expanded','false'));if(open?.dataset.applet===app.moduleId)return;move.setAttribute('aria-expanded','true');
     const menu=element('div','region-shelf-move-menu');menu.dataset.applet=app.moduleId;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Move '+app.title+' to');
     for(const b of buildings){const to=regionId(b.id);if(to===id)continue;const item=button('Move to '+b.title,()=>{moveApplet(app.moduleId,to);if(regionShelf===shelf)openRegion(id);},'region-shelf-move-item');item.setAttribute('role','menuitem');menu.append(item);}
     move.closest('.region-shelf-cell').append(menu);(menu.firstElementChild as HTMLElement)?.focus();
    },'region-shelf-move');
    move.setAttribute('aria-label','Move '+app.title+' to another area');move.title='Move to another area';move.setAttribute('aria-haspopup','menu');move.setAttribute('aria-expanded','false');
    move.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
    return move;
   }
   group('On the ground',ground,'Recently used');group('Recently used',apps.filter(app=>!groundIds.has(app.moduleId)),null);
   const mine=new Map<string,string>(sections.filter(r=>r.entity==='app'&&root.appletLayout.has(r.moduleId)).map(r=>[r.moduleId,r.region]));
   const recommended=recommendForArea({area:id,mine,removed:new Set(data.hiddenApplets||[]),installed:areaSignals.installed,visits:areaSignals.visits,
    apps:catalog.map(r=>({id:r.moduleId,key:r.key,category:appCategory(r),host:appWebsite(r)}))}).map(appId=>catalog.find(r=>r.moduleId===appId));
   if(recommended.length)group('Recommended',recommended);
   // Every catalog Applet of this Area's category the person does not have here, by name, behind one button.
   const rest=catalog.filter(r=>appCategory(r)===id&&!(root.appletLayout.has(r.moduleId)&&r.region===id)&&!recommended.includes(r)).sort((a,b)=>a.title.localeCompare(b.title));
   if(rest.length){
    const all=button('All '+building.title+' Applets ('+rest.length+')',()=>{all.remove();group('All',rest,'All '+building.title+' Applets');},'region-shelf-all');
    all.setAttribute('aria-expanded','false');list.append(all);
   }
   shelf.append(element('p','region-shelf-note','Accounts, permissions or a required desktop app are set up only when needed.'));
   shelf.addEventListener('pointerdown',e=>e.stopPropagation());root.append(shelf);
   // On a wide window the panel slides in from the right and the World zooms the area into the space left of
   // it; closing the panel zooms back out (owner request 2026-10-06). Narrow windows keep the centred panel.
   const side=getComputedStyle(shelf).getPropertyValue('--region-shelf-side').trim()==='1';shelf.dataset.side=String(side);
   scene?.frameArea(id,side?root.clientWidth-shelf.offsetLeft:0);(shelf.querySelector('.region-shelf-applet,.region-shelf-add') as HTMLElement)?.focus({preventScroll:true});
  }
  let deviceMenu=null;
  function removeMenu(){deviceMenu?.remove();deviceMenu=null;}
  root.addEventListener('pointerdown',e=>{if(regionShelf&&!regionShelf.contains(e.target as Node))closeRegionShelf();if(deviceMenu&&!deviceMenu.contains(e.target))removeMenu();});
  root.addEventListener('keydown',e=>{if(e.key==='Escape'&&(regionShelf||deviceMenu)){e.preventDefault();e.stopPropagation();closeRegionShelf();removeMenu();}});
  function appletMenu(id,x,y){
    removeMenu();const menu=element('div','applet-layout-menu');deviceMenu=menu;menu.setAttribute('role','menu');
    for(const b of buildings)menu.append(button('Move to '+b.title,()=>{moveApplet(id,regionId(b.id));removeMenu();}));
    if(pinnedPlace(regionLayout,id))menu.append(button('Unpin',()=>{pinApplet(id,false);removeMenu();}));
    else if(groundIndex(id)>=0)menu.append(button('Pin in this place',()=>{pinApplet(id,true);removeMenu();}));
    // A made Applet is not hidden but deleted (a widget the host asks about first; a website Applet goes at once, since
    // Make Applet brings it back): it was only ever this one page.
    const placed=sections.find(r=>r.moduleId===id),{moment,site}=placed||{};
    // The person's own Applet can ask for new pictures from the image model on this computer.
    const kind=myAppletKind(placed);
    if(kind&&native?.appletArt&&!data.sample)menu.append(button('Paint new pictures',async()=>{removeMenu();try{const result=await native.appletArt({operation:'repaint',applets:[{applet:id,title:placed.title,about:placed.description||'',kind}]});notify(result?.ok?'Painting new pictures for '+placed.title+'.':'New pictures need Codex signed in on this computer.');}catch(e){notify(e.message);}}));
    const remove=moment||site?button('Delete this Applet',async()=>{remove.disabled=true;try{await (moment?native?.widgets?.({operation:'delete',id:moment.id}):native?.siteApplets?.({operation:'delete',id:site.id}));removeMenu();}catch(e){remove.disabled=false;notify(e.message);}})
     :button('Remove from world',async()=>{remove.disabled=true;try{await editApplet('removeApplet',id);removeMenu();}catch(e){remove.disabled=false;notify(e.message);}});remove.setAttribute('role','menuitem');menu.append(remove);root.append(menu);
    // With several agents in the person's own Harness (OpenClaw agents, Hermes Agent profiles), one can answer in this
    // Applet's thread instead of the main one, bound to the Applet, its area or a channel conversation's person or group,
    // each with the person's own extra instructions (the Harness `agents` service; fox/harness-agents.ts on the host).
    if(native?.harnessAgents&&!data.sample)void Promise.resolve(native.harnessAgents({operation:'list',applet:id})).then(found=>{
     if(deviceMenu!==menu||!found?.places?.length)return;
     const several=found.agents?.length>1,label=several&&found.answering?'Answered by '+found.answering.name+' · '+found.answering.reason:'Instructions here';
     const pick=button(label,()=>{removeMenu();chooseAgent(id,placed?.title||'This Applet');});pick.setAttribute('role','menuitem');menu.insertBefore(pick,remove);
    },()=>{});
    // With several models in the same Agent, a cheaper one can answer in this Applet's thread (the Harness `models`
    // service; fox/harness-models.ts on the host), on the person's own sign-in as before.
    if(native?.harnessModels&&!data.sample)void Promise.resolve(native.harnessModels({operation:'list',applet:id})).then(found=>{
     if(deviceMenu!==menu||!(found?.models?.length>1))return;
     const current=found.models.find(m=>m.id===found.chosen)||found.models.find(m=>m.current);
     const pick=button('Model: '+(current&&found.chosen?current.name:'Agent’s own'),()=>{removeMenu();chooseModel(id,placed?.title||'This Applet',found);});pick.setAttribute('role','menuitem');menu.insertBefore(pick,remove);
    },()=>{});
    const r=root.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x-r.left,r.width-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(y-r.top,r.height-menu.offsetHeight-8))+'px';remove.focus();
  }
  // A small editor in place: for each place this Applet's thread is in (most specific first), the agent bound there and
  // the person's extra instructions there; the first bound place answers (core answeringAgent).
  const AGENT_PLACE={person:'This person',group:'This group',applet:'This Applet',region:'This area'};
  async function chooseAgent(id,title){
    let found;try{found=await native.harnessAgents({operation:'list',applet:id});}catch(e){notify(e.message);return;}
    const body=dialog('Who answers in '+title),several=found.agents?.length>1;
    body.append(element('p','',several?'Choose which of your agents answers when you talk with Fox here, and anything it should also know. The most specific place answers: a person, then a group, then this Applet, then its area.':'Anything Fox should also know when you talk with it here. The most specific place comes last.'));
    if(found.answering&&several)body.append(element('p','agent-answering','Answered by '+found.answering.name+' · '+found.answering.reason));
    for(const place of found.places){
     const box=element('section','agent-place'),name=place.scope==='region'&&place.area?'The '+place.area+' area':AGENT_PLACE[place.scope];
     box.append(element('h3','',name));
     let agent=null;
     if(several){
      agent=element('select');agent.setAttribute('aria-label','Agent for '+name.toLowerCase());
      agent.append(Object.assign(element('option','','Not bound here'),{value:''}),...found.agents.map(a=>Object.assign(element('option','',a.name+(a.main?' (main)':'')+(a.model?' · '+a.model:'')),{value:a.id})));
      agent.value=place.agent||'';box.append(agent);
     }
     const note=element('textarea');note.rows=3;note.maxLength=1000;note.value=place.note||'';note.placeholder='Extra instructions here, such as “Answer briefly, in Chinese.”';note.setAttribute('aria-label','Instructions for '+name.toLowerCase());
     const save=button('Save',async()=>{save.disabled=true;try{await native.harnessAgents({operation:'choose',applet:id,scope:place.scope,...agent?{agent:agent.value||null}:{},note:note.value});notify('Saved for '+name.toLowerCase()+'.');window.dispatchEvent(new Event('worldlet:harness-agents'));void chooseAgent(id,title);}catch(e){save.disabled=false;notify(e.message);}});
     box.append(note,save);body.append(box);
    }
    $('notionDialogClose').focus();
  }
  function chooseModel(id,title,found){
    const body=dialog('Which model answers in '+title);
    body.append(element('p','','Your Agent answers with its own model unless you choose another of its models here, such as a cheaper one for this Applet. It uses your Agent’s own sign-in.'));
    const own=found.models.find(m=>m.current);
    const choices=[{id:null,name:'Agent’s own'+(own?' · '+own.name:'')},...found.models.filter(m=>!m.current||found.chosen===m.id)];
    for(const m of choices){
     const chosen=m.id===null?!found.chosen:m.id===found.chosen;
     const pick=button((chosen?'✓ ':'')+m.name,async()=>{pick.disabled=true;try{await native.harnessModels({operation:'choose',applet:id,model:m.id});$('notionDialog').close();notify((m.id?m.name:'Your Agent’s own model')+' answers in '+title+' now.');}catch(e){pick.disabled=false;notify(e.message);}});
     body.append(pick);
    }
    $('notionDialogClose').focus();
  }
  function lampAction(room,state,activity){
   if(state!=='error')return;
   const failed=activity?.sessions?.find(session=>['Error','Failed'].includes(session.status));
   if(failed?.sessionId&&CODING_SESSIONS.includes(room.key)&&(data.sample||(room.key==='codex'?native?.codexSession:native?.developmentSessions)))return {label:'Review failed run',run:()=>{
    visitObject(room.moduleId,{enter:false});
    const item=workItems(room.key,{sessions:[failed]})[0];if(item)openWorkItem(room,item);
   }};
   if(native.setup&&!data.sample&&room.capability==='connect')return {label:'Check connection',run:()=>native.setup('connection',room.region,room.key)};
   // A failure flag without diagnostics is not evidence for reauthorization or retry.
   return {label:'Inspect app status',run:()=>{
    const body=dialog(room.title+' status');
    body.append(element('p','','The app reported a failed operation. No diagnostic details are available here. Open the app to inspect its current content and available controls.'),button('Open '+room.title,()=>{$('notionDialog').close();visitObject(room.moduleId);}));
    $('notionDialogClose').focus();
   }};
  }
  function buildScene(){scene=createModuleScene($('notionStage'),sections,spatialAction,points=>{
    for(const key of Object.keys(pins))if(!points[key]){const pin=pins[key];delete pins[key];pin?.remove();}
    const appIndex=new Map();for(const r of sections)if(r.entity==='app'){appIndex.set(r.id,r);appIndex.set(r.moduleId,r);}
    for(const [key,point]of Object.entries<any>(points)){
      let p=pins[key];if(!p){p=button('',()=>spatialAction(point),'notion-pin');p.dataset.page=point.id;p.dataset.action=point.action;p.dataset.level=point.level||'note';p.dataset.kind=point.kind;if(point.action==='region-more'){p.addEventListener('pointerenter',()=>scene?.setHoveredArea(point.id));p.addEventListener('pointerleave',()=>scene?.setHoveredArea(null));p.addEventListener('focus',()=>scene?.setHoveredArea(point.id));p.addEventListener('blur',()=>scene?.setHoveredArea(null));}if(point.action==='space'){p.addEventListener('pointerenter',()=>scene?.setHoveredApplet(point.id));p.addEventListener('pointerleave',()=>scene?.setHoveredApplet(null));p.addEventListener('focus',()=>scene?.setHoveredApplet(point.id));p.addEventListener('blur',()=>scene?.setHoveredApplet(null));}p.addEventListener('keydown',e=>{if(point.action==='space'&&(e.key==='ContextMenu'||e.shiftKey&&e.key==='F10')){e.preventDefault();const app=sections.find(r=>r.id===point.id);if(app){const r=p.getBoundingClientRect();appletMenu(app.moduleId,r.left,r.bottom);}}});p.setAttribute('aria-label',point.title);const caption=element('small','');caption.hidden=true;p.append(element('strong','',point.title),caption);pins[key]=p;$('notionPins').append(p)}
      if(point.kind==='region-slot'){
       p.ondragover=e=>{if(!shelfDrop)return;e.preventDefault();e.dataTransfer.dropEffect='move';p.classList.add('is-drop-target');};
       p.ondragleave=()=>p.classList.remove('is-drop-target');
       p.ondrop=e=>{e.preventDefault();e.stopPropagation();p.classList.remove('is-drop-target');void shelfDrop?.(point.slot);};
      }
      if(point.kind==='region-more'){const title=(THEME_SCENE.areaZoom?'Enter ':'Manage ')+point.title;if(p.title!==title)p.title=title;if(!p.querySelector('.region-edit-hint')){const hint=element('span','region-edit-hint');hint.setAttribute('aria-hidden','true');hint.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m16 3 5 5-12 12-6 1 1-6Z M13 6l5 5"/></svg>';p.append(hint);}}
      const strong=p._strong??=p.querySelector('strong');
      if(point.kind==='app'){
       const labelVisible=String(!!point.labelVisible),running=String(!!point.running);
       if(p.dataset.labelVisible!==labelVisible)p.dataset.labelVisible=labelVisible;
       if(p.dataset.running!==running)p.dataset.running=running;
       if(p.dataset.lampState!==point.lampState)p.dataset.lampState=point.lampState;
       let lamp=p.querySelector('.applet-base-lamp');if(!lamp){lamp=element('span','applet-base-lamp');lamp.setAttribute('aria-hidden','true');lamp.append(element('i',''));p.append(lamp);}
       const lampX=point.lampX+'px',lampY=point.lampY+'px';
       if(p._lampX!==lampX){p._lampX=lampX;lamp.style.marginLeft=lampX;}if(p._lampY!==lampY){p._lampY=lampY;lamp.style.top=lampY;}
      }
      // Peek names are plain: the installation already identifies the Applet.
      p.querySelector('.applet-icon')?.remove();
      let attention=p.querySelector('.applet-attention');const attentionKey=point.attention?JSON.stringify(point.attention):null;
      // Connection guides do not announce saved findings or animate their arrival.
      if(point.attention){
       if(!attention){attention=element('span','applet-attention');p.append(attention);}
       if(attention.dataset.value!==attentionKey){
        attention.dataset.value=attentionKey;attention.dataset.state=point.attention.state;attention.dataset.badge=point.attention.badge;attention.replaceChildren();
        const mark=document.createElement('img');mark.className='applet-guide-mark';mark.alt='';mark.src=(globalThis as any).__WORLDLET_25D_ASSETS__?.mailParts?.attention||'';attention.append(mark);
        if(point.attention.badge==='connection'){const label=element('span','applet-connection-label'),name=element('span','applet-connection-name');label.innerHTML=uiIcon('link');label.prepend(name);label.append(element('span','', 'Connect'));label.setAttribute('aria-hidden','true');attention.append(label);}
        attention.title=point.attention.hint;attention.setAttribute('aria-label',attention.title);
       }
       const connectionName=attention.querySelector('.applet-connection-name');if(connectionName&&connectionName.textContent!==point.title)connectionName.textContent=point.title;
       attention.style.setProperty('--applet-guide-top',-point.attentionOffset+'px');attention.style.setProperty('--applet-guide-x',(point.attentionX||0)+'px');attention.style.setProperty('--applet-guide-anchor-x',point.x+'px');
      }
      else attention?.remove();

      if(strong&&strong.textContent!==point.title)strong.textContent=point.title;
      const app=appIndex.get(point.id);
      // Labels change with the world, not the camera: write them only when their inputs change.
      const lampLabel=lampLabels[point.lampState];
      const labelKey=app?app.title+'\u0000'+[appletIndicator(app,data.moduleConnections||[]).label,lampLabel].filter(Boolean).join(' · '):point.description||point.title;
      if(p._labelKey!==labelKey){
       p._labelKey=labelKey;
       if(app){p.querySelector('.app-state-token')?.remove();p.title=labelKey.replace('\u0000',' · ');p.setAttribute('aria-label',p.title);}
       else p.setAttribute('aria-label',point.description||labelKey);
      }
      const caption=p.querySelector('small'),captionHidden=!point.caption;
      // Projection runs every frame; identical hidden writes still notify DOM
      // observers and schedule desktop geometry work. Preserve real changes.
      if(caption.hidden!==captionHidden)caption.hidden=captionHidden;
      if(point.caption&&caption.textContent!==point.caption)caption.textContent=point.caption;
      const hovered=String(!!point.hovered);if(p.dataset.hovered!==hovered)p.dataset.hovered=hovered;

      const x=point.x+'px',y=point.y+'px',visibility=point.visible?'visible':'hidden';
      if(p._x!==x){p._x=x;p.style.left=x;}if(p._y!==y){p._y=y;p.style.top=y;}if(p._visibility!==visibility){p._visibility=visibility;p.style.visibility=visibility;}
    }
  },pages,{buildings,regionLayout,onMoveApplet:moveApplet,areaControls:!!native,connections:data.moduleConnections||[],unlockedApplets:data.unlockedApplets,hiddenApplets:data.hiddenApplets,appletPositions:data.appletPositions,onAppletMenu:appletMenu,lampAction});if(environmentController)scene?.setEnvironment(environmentController.current);}
  const updateCapsule=()=>nativeHUD?.sync();
  function templateLibrary(){
    native.setup('sources',buildingFor(currentSpace)?.id.replace('building-','')||'home');
  }
  buildScene();saveRegions();askForPictures();
  const mailArrivals=createMailArrivalObserver();mailArrivals([]);
  const arrival=createMailArrival(()=>scene?.deliverMail()||false);
  const observeMail=(world)=>{const connection=world.moduleConnections?.find(c=>c.provider==='gmail');if(!connection?.records)return;deliverMail(connection.records);};
  const deliverMail=(records)=>{const arrivals=mailArrivals(records);if(arrivals.length)arrival.arrive(arrivals.join('|'));};
  observeMail(data);
  // The sample's weather Open shows its sample records; a late environment load must not replace them.
  environmentController=mountWorldEnvironment({root,dialog,recording:!!data.sample,close:()=>$('notionDialog').close(),onOpenWeather:()=>visitObject('app-weather'),onChange:(value,actual)=>{scene?.setEnvironment(value);if(current==='app-weather'){if(weatherPanel?.element.isConnected)weatherPanel.update(actual);else if(!data.sample)scene?.setAppStage?.(current,forecastStage(actual));}},...(native?.weather?{adapter:native.weather}:{})});
  Object.defineProperty(root,'sceneMetrics',{get:()=>scene?.metrics});
  if(!scene){root.classList.add('notion-no-webgl');for(const section of buildings.length?buildings:areas.length?areas:sections){const b=button(section.title,()=>buildings.length?visitBuilding(section.id):areas.length?visitArea(section.id):visitSpace(section.id,'shelf'),'notion-pin');$('notionPins').append(b)}}
  function breadcrumbs(){
    const nav=$('notionBreadcrumb');nav.hidden=false;nav.replaceChildren(button('My world',home));
    const add=(title,fn)=>nav.append(element('span','','/'),button(title,fn));
    if(searching){add('Search',()=>showSearch(query));return}
    if(buildings.length){
      const b=buildingFor(currentSpace),room=sections.find(s=>s.id===currentSpace),o=objectFor(current);
      const area=areaFor(currentSpace)||areas.find(a=>a.id===currentSpace);if(areas.length>1&&area)add(area.title,()=>visitArea(area.id));
      const compact=room?.trip&&b?.rooms.length===1;
      if(b&&!compact)add(b.title,()=>visitBuilding(b.id));
      if(room&&depth!=='building'&&!compact&&!data.personal)add(room.title,()=>visitSpace(room.id));
      if(compact&&depth==='room')add('Trips & memories',()=>visitSpace(room.id));
      if(o&&['object','note'].includes(depth))add(o.title,()=>visitObject(o.id));
      if(depth==='note'&&o?.id!==current)add(pages.get(current)?.title||'Details',()=>open(current));
      nav.lastElementChild?.setAttribute('aria-current','location');return;
    }
    const currentArea=areas.find(a=>a.id===currentSpace)||areaFor(currentSpace);if(currentArea)add(currentArea.title,()=>visitArea(currentArea.id));
    if(depth==='area'){nav.lastElementChild?.setAttribute('aria-current','location');return;}
    if(currentSpace){const space=pages.get(currentSpace)||sections.find(s=>s.id===currentSpace);add(space.title,()=>visitSpace(currentSpace,'place'));
      if(native){if(depth==='note')add(pages.get(current)?.title||'Content',()=>open(current));nav.lastElementChild?.setAttribute('aria-current','location');return;}
      if(['room','shelf','note'].includes(depth))add(describe((sections.find(s=>s.id===currentSpace)||{}).theme).inside,()=>visitSpace(currentSpace,'room'));
      if(['shelf','note'].includes(depth))add(describe((sections.find(s=>s.id===currentSpace)||{}).theme).shelf,()=>visitSpace(currentSpace,'shelf'));
      if(depth==='note')for(const p of trails(current).filter(p=>!data.roots.includes(p.id)&&!p.virtual))add(p.title,()=>open(p.id));
    }
    nav.scrollLeft=nav.scrollWidth;
  }
  const updateLocation=createLocationWriter();
  function writeLocation(){const u=new URL(location.href);u.hash=depth==='building'?'building='+current:depth==='object'?'object='+current:depth==='room'&&buildings.length?'room='+currentSpace:depth==='area'?'area='+currentSpace:depth==='note'?'note='+current:depth==='overview'||depth==='search'?'':'place='+currentSpace+'&level='+depth;updateLocation(u)}
  function syncSoundScene(){root.dataset.soundTrack=themeAmbientTrack(ACTIVE_THEME.pack,depth,current||'');}
  // An area panel belongs to the place it was opened in: entering an Applet by any path, or moving to another
  // place (as after Back reopens it, #2054), closes it, so it never covers what comes next.
  function sceneState(){syncSoundScene();recordLocationActivity();if(regionShelf&&(insideApplet()||regionShelfPlace!==depth+':'+current))closeRegionShelf();if(regionsReorder&&depth==='overview'){regionsReorder=false;scene?.refreshRegions();}if(attentionPage&&!restoringWorld)closeAttentionPreview(false);if(memoReader&&(content.hidden||current!=='app-voice-memos'||content.dataset.template!=='app-source')){memoReader.dispose();memoReader=null;}if(messagesReader&&(content.hidden||current!=='app-messages'||content.dataset.template!=='app-source')){messagesReader.dispose();messagesReader=null;}if(root.dataset.onboarding!=='true'&&foregroundGuide&&(depth!=='object'||current!==foregroundGuide||!content.hidden)){foregroundGuide=null;voice?.setGuide?.(null,{forget:true});}if(depth!=='object'||!sections.some(r=>r.moduleId===current&&r.entity==='app'))deviceInventory?.hide();const place=describe(sections.find(s=>s.id===currentSpace)?.theme);root.dataset.depth=depth;appletShelf?.sync(depth==='object'?current:null);root.dataset.viewLevel=data.matterCatalog?({overview:'world',building:'region',room:'matter',object:sections.find(r=>r.id===currentSpace)?.entity||'matter',note:'detail'}[depth]||depth):data.moduleCatalog?({overview:'world',building:'region',room:'module',object:'module',note:'detail'}[depth]||depth):data.personal?({overview:'world',room:'region',object:'object',note:'detail'}[depth]||depth):depth;root.dataset.page=current||'';if(native)$('notionStage').inert=depth==='note'||depth==='search';$('notionBack').hidden=depth==='overview';$('notionNext').textContent=({overview:'Go home →',place:place.enter+' →',room:place.browse+' →',shelf:'Read a book →',note:'Next book →',search:'Back to my world →'})[depth];breadcrumbs();syncAppletMode();writeLocation();voice?.sync();updateCapsule();travelExperiment?.sync()}
  function home(){focusEntryReturn=null;pageLayer=null;$('notionDialog').close();if(!restoringWorld)dismissFox();readerReturns=[];current=null;currentSpace=null;depth='overview';searching=false;history=[];content.hidden=true;hud.classList.remove('is-reading');$('notionWorldTitle').hidden=false;$('notionWorldTitle').textContent='This is your little world.';$('notionWorldMeta').textContent='Come home, read, and do what you love';scene?.focus('overview');sceneState();if(data.sample){$('notionWorldTitle').textContent='A place for everything in your life.';$('notionWorldMeta').textContent='Explore or type “show my mail”'}}
  function visitArea(id){
    const area=areas.find(a=>a.id===id);if(!area)return;if(buildings.length&&areas.length===1){home();return;}readerReturns=[];current=id;currentSpace=id;depth='area';searching=false;content.hidden=true;hud.classList.remove('is-reading');scene?.focus(id,'area');sceneState();
  }
  function visitBuilding(id){id=id==='building-people'?'building-travel':id;const b=buildings.find(b=>b.id===id);if(!b)return;if(regionShelf&&regionShelf.dataset.area!==regionId(b.id))closeRegionShelf();if(data.personal&&!data.moduleCatalog){if(b.unbuilt){native?.setup('sources',b.id.replace('building-',''));return;}visitSpace(b.rooms[0]);return;}const room=b.rooms.length===1?sections.find(r=>r.id===b.rooms[0]):null,trip=!data.moduleCatalog&&room?.trip&&objectsFor(room).find(o=>o.kind==='trip');if(trip){objectFromRoom=false;visitObject(trip.id,{fromRoom:false});return;}readerReturns=[];current=id;currentSpace=id;depth='building';searching=false;content.hidden=true;hud.classList.remove('is-reading');scene?.focus(id,'building');sceneState();if(id==='building-work')refreshWorkRegion();}
  root.addEventListener('worldlet:prepare-arrival',(event:any)=>scene?.prepareArrival?.(event.detail));
  root.addEventListener('worldlet:intro-devices',(event:any)=>{data.unlockedApplets=event.detail;const arrival=scene?.setUnlockedApplets?.(event.detail,event.fromCenter===true,event.icons,event.settled===true);if(event.fromCenter)void Promise.resolve(arrival).then(()=>{if(root.isConnected)root.dispatchEvent(new Event('worldlet:devices-arrived'));});});
  // Worlds without a saved list start from the Applets installed by default.
  function unlockedList(){return data.unlockedApplets??=sections.filter(r=>r.entity==='app'&&r.installByDefault!==false).map(r=>r.moduleId);}
  function unlockApplet(id){
    if(!id.startsWith('app-'))return;
    if(unlockedList().includes(id))return;
    data.unlockedApplets.push(id);scene?.setUnlockedApplets?.(data.unlockedApplets);
    void native?.unlockApplet?.(id).catch(error=>notify(error.message));
  }
  function visitObject(id: string,{fromRoom,enter=true,connect=false}: {fromRoom?: boolean;enter?: boolean;connect?: boolean}={}){focusEntryReturn=null;id=data.navigationAliases?.[id]||id;if(data.moduleCatalog&&!data.matterCatalog&&id==='object-japan')id='module-trip';const o=objectFor(id);if(!o)return;if(enter&&!restoringWorld&&current!==o.id){{const trigger=eventTrigger();if(!data.sample)reportAppletOpened(o.id.replace(/^app-/, ''),trigger);if(trigger==='user')reportEngagement('applet_open');}recordAppletUse(regionLayout,o.id);regionsReorder=true;saveRegions();}unlockApplet(id);if(!restoringWorld&&depth!=='object'&&depth!=='note')appletEntryReturn={depth,current,currentSpace};if(pages.get(id)?.webApp?.kind==='x'){open(id);return;}if(fromRoom!==undefined)objectFromRoom=fromRoom;else if(depth!=='note')objectFromRoom=depth==='room'&&currentSpace===o.roomId;readerReturns=[];current=o.id;currentSpace=o.roomId;depth='object';searching=false;content.hidden=true;hud.classList.remove('is-reading');scene?.focus(o.id,'object');sceneState();if(data.moduleCatalog){const r=sections.find(s=>s.id===o.roomId);if(r?.entity==='app'){if(enter&&!restoringWorld){if(connect)native.setup('connection',r.region,r.key);else showAppPanel(r);}}else if(r?.presentation==='panel'||!r?.children.length)showModulePanel(o.id);}}
  function visitSpace(id,level='place'){
    id=data.navigationAliases?.[id]||id;if(buildings.some(b=>b.id===id)){visitBuilding(id);return;}const section=sections.find(s=>s.id===id);if(!section)return;if(data.moduleCatalog){visitObject(section.moduleId);return;}if(native)level=buildings.length?'room':'place';readerReturns=[];if(section.unbuilt){if(data.personal)native?.setup('sources',section.buildingId.replace('building-',''));else native?.connect('google').catch(e=>notify(e.message));return}current=id;currentSpace=id;depth=level;searching=false;content.hidden=true;hud.classList.remove('is-reading');$('notionWorldTitle').hidden=false;$('notionWorldTitle').textContent=section.title;
    $('notionWorldMeta').textContent=({place:describe(section.theme).name+' · '+describe(section.theme).enter,room:describe(section.theme).inside+' · '+describe(section.theme).browse,shelf:'Choose a book and take your time'})[level];
    scene?.focus(id,level);sceneState();
    if(!scene&&level==='shelf'){header(section.title,'Bookshelf');content.append(...(section.virtual?section.children:[section.id]).map(i=>pageLink(pages.get(i))))}
  }
  function focusContent(id){
    const page=pages.get(id),app=sections.find(r=>r.entity==='app'&&r.children.includes(id));
    if(app&&page?.sourceId&&native?.original){
      const previous={depth,current,currentSpace};
      visitObject(app.moduleId,{fromRoom:false,enter:false});focusEntryReturn=previous;dismissFox();
      openAppRecord(app,{id:page.sourceId,sourceId:page.sourceId,title:page.title,url:page.sourceURL,worldItemId:page.worldItemId,noteId:page.noteId,localOriginal:true});return;
    }
    const o=buildings.length?objectFor(id):null;if(o){visitObject(o.id,{fromRoom:false});return;}const room=sectionFor(id);if(room)visitSpace(room);
  }
  function open(id: string,{remember=true}: {remember?: boolean}={}){
    const p=pages.get(id);if(!p)return;
    const owner=data.sample&&sections.find(r=>r.entity==='app'&&r.sampleRecords?.includes(id)&&['gmail','notion','google-calendar'].includes(r.key));
    if(owner){visitObject(owner.moduleId,{fromRoom:false,enter:false});openAppRecord(owner,{id,noteId:id,title:p.title});return;}
    if(p.virtual){visitSpace(id);return}if(native&&remember&&current!==id&&depth!=='note'){readerReturns.push({current,currentSpace,depth,query,offset:searchOffset,scroll:content.scrollTop,catalogOffset});readerReturns=readerReturns.slice(-20);}if(remember&&current&&current!==id)history.push(current);
    current=id;currentSpace=sectionFor(id);depth='note';searching=false;query='';catalogOffset=0;read.add(id);try{localStorage.setItem(readKey,JSON.stringify([...read]))}catch{}
    if(buildings.length){const o=objectFor(id);scene?.focus(o?.id||currentSpace,o?'object':'room');}else scene?.focus(currentSpace,'place',trails(id).map(p=>p.id));
    // Publish the settled reader identity: Fox must not discover a second
    // context change only after opening a guide on this same page.
    renderPage();sceneState();
  }
  function back(){if(inPageLayer()){closePageLayer();return;}if(!content.hidden&&content.dataset.template==='meeting-transcript'){const r=sections.find(s=>s.key==='meetings');if(r){showMeetings(r);return;}}if(libraryWebReturn&&depth==='object'&&current===libraryWebReturn.app.moduleId&&content.dataset.template==='browser'){const previous=libraryWebReturn;libraryWebReturn=null;if(previous.record)openAppRecord(previous.app,previous.record);else showAppPanel(previous.app);return;}if(!content.hidden&&content.dataset.template==='coding-session'){visitObject(content.dataset.sessionApp);return;}if(!content.hidden&&content.dataset.template==='app-source'&&appReader){const previous=focusEntryReturn;focusEntryReturn=null;if(previous?.depth==='overview'){home();return;}if(previous?.depth==='building'){visitBuilding(previous.current);return;}if(previous?.depth==='object'&&previous.current){visitObject(previous.current);return;}visitObject(appReader.app.moduleId);return;}
    // An Applet opened from an area panel goes back out to that panel, and the panel out to the World (owner Order 2026-10-07).
    if(data.moduleCatalog&&depth==='object'&&sections.some(r=>r.moduleId===current&&r.entity==='app')&&appletEntryReturn){const previous=appletEntryReturn;appletEntryReturn=null;if(previous.depth==='overview'){home();if(previous.area&&root.dataset.onboardingLocked!=='true')openRegion(previous.area);return;}if(previous.depth==='building'){visitBuilding(previous.current);return;}}
    if(data.moduleCatalog&&depth==='object'){if(!sections.some(r=>r.moduleId===current&&r.entity==='app')&&!content.hidden){content.hidden=true;hud.classList.remove('is-reading');sceneState();return;}const b=buildingFor(currentSpace);if(b)visitBuilding(b.id);else home();return;}
    if(buildings.length&&!searching){
      if(depth==='note'){const saved=readerReturns.findLast(s=>s.depth==='search');readerReturns=[];if(saved){showSearch(saved.query,{offset:saved.offset,scroll:saved.scroll});return;}const o=objectFor(current);if(o)visitObject(o.id);else visitSpace(currentSpace);return;}
      if(depth==='object'){const room=sections.find(r=>r.id===currentSpace);if(room?.trip&&!objectFromRoom&&buildingFor(currentSpace)?.rooms.length===1){home();return;}visitSpace(currentSpace);return;}
      if(depth==='room'){if(data.personal){home();return;}const b=buildingFor(currentSpace);if(b?.rooms.length===1&&sections.find(r=>r.id===currentSpace)?.trip){home();return;}visitBuilding(b.id);return;}
      if(depth==='building'){const a=areaFor(currentSpace);if(areas.length>1&&a)visitArea(a.id);else home();return;}
    }
    if(native&&depth==='note'){const saved=readerReturns.findLast(s=>s.depth==='search');readerReturns=[];if(saved)showSearch(saved.query,{offset:saved.offset,scroll:saved.scroll});else if(currentSpace){const selected=current;visitSpace(currentSpace);root.querySelector('.world-project[data-page-id="'+CSS.escape(selected)+'"]')?.focus({preventScroll:true});}else home();return;}
    if(depth==='place'&&areaFor(currentSpace)){visitArea(areaFor(currentSpace).id);return;}
    if(searching){home();return}if(depth==='note'){const parent=pages.get(current)?.parent;if(parent&&!data.roots.includes(parent)){open(parent,{remember:false});return}visitSpace(currentSpace,'shelf');return}
    if(depth==='shelf'){visitSpace(currentSpace,'room');return}if(depth==='room'){visitSpace(currentSpace,'place');return}home();
  }
  function next(){
    if(buildings.length){if(depth==='overview'){visitBuilding(buildings[0].id);return;}if(depth==='building'){visitSpace(buildingFor(current).rooms[0]);return;}if(depth==='room'){const o=objectsFor(sections.find(r=>r.id===currentSpace))[0];if(o)visitObject(o.id);return;}if(depth==='object'){const o=objectFor(current);if(o)open(o.pageIds.find(id=>pages.has(id)));return;}}
    if(depth==='area'){const area=areas.find(a=>a.id===currentSpace);if(area?.places.length)visitSpace(area.places[0]);return;}
    if(depth==='search'){home();return}if(depth==='overview'){visitSpace((sections.find(s=>s.theme==='home')||sections[0]).id);return}
    if(native&&depth==='place'){const section=sections.find(s=>s.id===currentSpace),id=section?.virtual?section.children[0]:section?.id;if(id)open(id);return;}
    if(depth==='place'){visitSpace(currentSpace,'room');return}if(depth==='room'){visitSpace(currentSpace,'shelf');return}
    const section=sections.find(s=>s.id===currentSpace);
    if(depth==='shelf'){const first=section.virtual?section.children[0]:section.id;if(first)open(first);return}
    const currentPage=pages.get(current),siblings=currentPage?.parent?(data.roots.includes(currentPage.parent)&&section?.virtual?section.children:pages.get(currentPage.parent)?.children):[current];
    const ids=siblings?.length?siblings:[current];open(ids[(ids.indexOf(current)+1)%ids.length]);
  }
  function moduleContext(){
    publishSourceIssues();
    if(attentionPage)return {context:{key:'attention:'+attentionPage.worldItemId,title:attentionPage.title,detail:'HUD preview of saved attention item '+attentionPage.worldItemId+'. '+attentionBrief(attentionPage)+'\nSaved evidence only; no original has been opened. Read actual sources before acting.'},actions:[]};
    const result=moduleContentContext(),id=!content.hidden&&appReader?.record.worldItemId;
    const section=depth==='object'?sections.find(r=>r.moduleId===current&&r.entity==='matter'):null;
    const localItem=section?.children?.length===1?pages.get(section.children[0]):null;
    const item=id?[...pages.values()].find(p=>p.worldItemId===id):localItem?.worldItemId?localItem:null;
    if(item)return {...(result||{context:{key:'attention:'+item.worldItemId,title:item.title,detail:libraryReadContext||'Read the saved item’s sources before acting.'}}),actions:attentionActions(item)};
    return result;
  }
  function readSnoozes(){try{return JSON.parse(native?.storage?.getItem('itemSnoozes')||'{}');}catch{return {};}}
  // Visible Center rows in reading order: Coming Up, Worth Doing, Worth Knowing.
  const attentionRowOrder=()=>[...root.querySelectorAll('.world-matter[data-world-item-id]')].map(row=>(row as HTMLElement).dataset.worldItemId);
  async function settleAttention(item,status,snoozedUntil,{advance=false,by}:{advance?:boolean,by?:'fox'}={}){
    const order=attentionRowOrder(),previewing=attentionPage?.worldItemId===item.worldItemId;
    // A settled item's website pages become the websites' own places again.
    if(status!=='open')for(const [page,bound] of siteThreads)if(bound.key==='attention:'+item.worldItemId)siteThreads.delete(page);
    // A grouped row is one user outcome. Persist every represented member so a
    // hidden duplicate cannot become its replacement on the next projection.
    const memberIds=nativeHUD?.attentionMembers(item.worldItemId)||[item.worldItemId];
    for(const id of memberIds){
      if(data.sample){settleSampleItem(id,status);const saved=readSnoozes();if(snoozedUntil)saved[id]=snoozedUntil;else delete saved[id];native?.storage?.setItem('itemSnoozes',JSON.stringify(saved));}
      else {const result=await native.itemStatus(id,status,snoozedUntil,by);if(!result?.ok){nativeHUD?.sync();throw Error(result?.error||'Could not save this item.');}}
      for(const page of pages.values())if(page.worldItemId===id)settleItemPage(page,status,snoozedUntil);
    }
    scene?.refreshContent?.();voice?.setGuide?.(null);nativeHUD?.sync();
    // Listeners (e.g. the first-win moment) may keep the view here instead of advancing.
    const proceed=root.dispatchEvent(new CustomEvent('worldlet:attention-settled',{cancelable:true,detail:{id:item.worldItemId,status}}));
    if(!previewing)return;
    if(!proceed){closeAttentionPreview();return;}
    // Clearing an item from its card moves straight to the next one still in the Center.
    const index=order.indexOf(item.worldItemId),remaining=new Set(attentionRowOrder());remaining.delete(item.worldItemId);
    const next=advance?[...order.slice(index+1),...order.slice(0,Math.max(0,index))].find(id=>remaining.has(id)):null;
    if(!next||!previewAttention({worldItemId:next}))closeAttentionPreview();
  }
  function attentionActions(item){
    const id=item.worldItemId,kind=item.worldItemKind;
    const action=(key,label,run,disabled=false)=>({id:'attention:'+key+':'+id,label,icon:'spark',placement:'contextual',kind:'navigation',disabled,run});
    const ask=(request,displayText)=>{voice?.setGuide?.(null);attentionOrigin={key:'attention:'+id,title:item.title,at:Date.now()};return voice?.ask(attentionRequest(request,id,item.title,'Read its actual sources and related context first. Do not assume missing facts or completion. Complete website steps directly; never enter payment details or passwords.'),{displayText,icon:'spark'});};
    if(kind==='update')return [action('explore','Explore more',()=>ask('Explain what this means and useful next steps','Explore more'),!libraryReadContext)];
    if(['done','dismissed'].includes(item.worldItemStatus))return [action('explore','Explore more',()=>ask('Explore more','Explore more'),!libraryReadContext)];
    const snooze=()=>{
      const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);tomorrow.setHours(9,0,0,0);
      const choices:[string,Date][]=[['In 1 hour',new Date(Date.now()+3600000)],['Tomorrow morning',tomorrow]];
      const before=new Date(Date.parse(item.worldItemSignal?.start)-10*60000);if(before.getTime()>Date.now())choices.push(['10 min before',before]);
      voice?.setGuide?.({source:'attention-snooze:'+id,takeover:true,text:'When should this return to Attention Center?',actions:[...choices.map(([label,date])=>button(label,()=>settleAttention(item,'open',date.toISOString()).catch(e=>notify(e.message)))),button('Cancel',()=>{voice?.setGuide?.(null);nativeHUD?.sync();})]});voice?.revealGuide?.();
    };
    // Remove clears the item without an outcome; the card's Dismiss only closes the card.
    return [action('help',kind==='event'?'Help me prepare':'Help me do it',()=>data.sample&&id==='sample-item-1'?reviewTennis():ask(kind==='event'?'Help me prepare':'Help me do this',kind==='event'?'Help me prepare':'Help me do it'),!libraryReadContext),
      ...(kind==='task'?[action('done',"I’ve done it",()=>settleAttention(item,'done',null))]:[]),
      ...(kind==='task'?[action('more','More options',()=>{voice?.setGuide?.({source:'attention-options:'+id,takeover:true,text:'Manage this attention item',actions:[button('Snooze',snooze),button('Remove',()=>settleAttention(item,'dismissed',null).catch(e=>notify(e.message))),button('Cancel',()=>{voice?.setGuide?.(null);nativeHUD?.sync();})]});voice?.revealGuide?.();})]:[action('snooze','Snooze',snooze),action('remove','Remove',()=>settleAttention(item,'dismissed',null))])];
  }
  const attentionReadAttempts=new Map<string,{pending:boolean,failures:number,timer:ReturnType<typeof setTimeout>}>();
  window.addEventListener('pagehide',()=>{for(const state of attentionReadAttempts.values())clearTimeout(state.timer);attentionReadAttempts.clear();},{once:true});
  async function acknowledgeAttention(record){
    const item=[...pages.values()].find(p=>p.worldItemId===record.worldItemId);
    if(!item||item.worldItemKind!=='update'||item.worldItemStatus!=='open')return;
    const id=item.worldItemId,state=attentionReadAttempts.get(id)||{pending:false,failures:0,timer:null};
    if(state.pending||state.timer)return;state.pending=true;attentionReadAttempts.set(id,state);
    try{
      if(data.sample)settleSampleItem(item.worldItemId,'read');
      else {const result=await native.itemRead(item.worldItemId);if(!result?.ok)throw Error(result?.error||'Could not mark this item read.');for(const page of pages.values())if(page.worldItemId===item.worldItemId&&page.worldItemStatus==='open')settleItemPage(page,'read');}
      attentionReadAttempts.delete(id);scene?.refreshContent?.();nativeHUD?.sync();
    }catch{
      // Local acknowledgement is idempotent; retry quietly, never repeat source actions.
      if(!root.isConnected||attentionReadAttempts.get(id)!==state)return;
      state.failures++;state.timer=setTimeout(()=>{state.timer=null;if(root.isConnected)void acknowledgeAttention(record);},readRetryDelay(state.failures));
    }finally{state.pending=false;}
  }
  function moduleContentContext(){
    if(!data.moduleCatalog||!['object','note'].includes(depth))return null;
    const r=sections.find(s=>s.id===currentSpace);if(!r)return null;
    if(r.key==='codex'&&codexApplet?.selected&&!content.hidden&&content.dataset.template==='coding-session')return {context:{key:'codex:'+codexApplet.selected.sessionId,title:'Codex · '+codexApplet.selected.title,detail:'Your next message continues this Codex session.'},actions:[]};
    if(appReader?.app.key==='gmail'&&r.key==='gmail'&&!content.hidden&&content.dataset.template==='app-source'){
      const record=appReader.record,ready=!!libraryReadContext;
      const act=(id,label,request)=>({id:'mail:'+record.id+':'+id,label,icon:'mail',placement:'contextual',kind:'navigation',disabled:!ready,run:()=>{voice?.setGuide?.(null);return voice?.ask(request,{displayText:label,icon:'mail'});}});
      return {context:{key:'gmail:'+record.id,title:'Mail · '+record.title,detail:libraryReadContext||'The selected email is loading. Do not infer its contents.'},actions:[
        act('reply','Reply',data.sample?'Read the selected email original, then use prepare_email with its sourceIds, exact example.com recipient, subject and reply body. Show the full practice draft for review; do not claim it is sent.':'Read the email currently open and prepare a concise reply using prepare_email with its exact Gmail thread ID. Show the complete draft for review. Do not send or invent missing information.'),
        act('summarize','Summarize','Summarize the email currently open and what, if anything, needs my attention. Use only its actual contents.'),
      ]};
    }
    if(data.sample&&practiceTimer&&!content.hidden&&content.dataset.template==='coding-prototype')return {context:{key:'practice-timer',title:'Quiet focus timer',detail:'A working local timer prototype. Use the current actions to start, pause or reset.'},actions:[['start','Start'],['pause','Pause'],['reset','Reset']].map(([id,label])=>({id:'practice:timer-'+id,label,icon:id==='start'?'play':id==='pause'?'pause':'refresh',kind:'navigation',placement:'contextual',run:()=>practiceTimer.action(id)}))};
    if(data.sample&&workSelection?.r.key===r.key&&workSelection?.item.session?.practiceJob&&!content.hidden&&content.dataset.template==='coding-session')return {context:{key:'practice-code:'+workSelection.item.id,title:workSelection.item.title,detail:'A local walkthrough task with its original design attached. No external CLI runs.'},actions:workSelection.item.session.practiceJob.sources.some(s=>s.id==='sample-notion-navigation-latest')?[]:[{id:'practice:prototype',label:'Try prototype',icon:'code',kind:'navigation',placement:'contextual',run:openPracticePrototype},{id:'practice:export-prototype',label:'Copy HTML',icon:'code',kind:'navigation',placement:'contextual',run:async()=>{const result=await native.copyAppletPrototype?.(practiceTimerHTML);voice?.setGuide?.({source:'practice-export',takeover:true,text:result?.ok?'Copied the standalone timer. Save it as quiet-timer.html to keep or share it.':'Could not copy the prototype. Please try again.'});voice?.revealGuide?.();}}]};
    if(data.sample&&workSelection?.r.key===r.key&&workSelection.item.session&&!content.hidden)return {context:{key:'practice-code:'+workSelection.item.id,title:r.title+' · '+workSelection.item.title,detail:'Fictional '+r.title+' session, '+workSelection.item.session.status+'. The user can review its prepared result; no CLI is running.'},actions:workSelection.item.session.status==='Completed'?[]:[{id:'practice:code-result',label:'Review result',icon:'code',kind:'navigation',placement:'contextual',run:completePracticeSession}]};
    if(workSelection&&workSelection.r.key===r.key&&!content.hidden&&content.dataset.template==='coding-session')return {context:{key:'work:'+r.key+':'+workSelection.item.id,title:r.title+' · '+workSelection.item.title,detail:r.key==='github'?'Selected GitHub repository: '+workSelection.item.repo.id+'. Repository reads use the local gh CLI.':'Selected saved Claude Code session: '+workSelection.item.session.sessionId+'. Project: '+(workSelection.item.session.cwd||'Unknown')+'. Messages to Fox in this view resume this exact Claude Code session. Tool permission requests appear in Fox.'},actions:[]};
    if(data.sample&&(current==='sample-japan-dinner'||appReader?.app.key===r.key&&appReader?.record.noteId==='sample-japan-dinner'&&!content.hidden))return {context:{key:'notion:sample-japan-dinner',title:'Notion · Dinner with Alex',detail:libraryReadContext||pages.get('sample-japan-dinner').text},actions:[{id:'practice:email-alex',label:'Email Alex',icon:'mail',placement:'contextual',kind:'navigation',run:()=>preparePracticeEmail({to:'alex@example.com',subject:'Dinner in Shimokitazawa',body:practiceDinnerEmail(pages.get('sample-japan-dinner').markdown),sourceIds:['sample-japan-dinner']})}]};
    if(r.key==='voice-memos'&&memoReader&&!content.hidden)return memoReader.context();
    if(r.key==='messages'&&messagesReader&&!content.hidden)return messagesReader.context();
    if(appReader?.app.key===r.key&&ORIGINAL_READERS.includes(r.key)&&!content.hidden&&content.dataset.template==='app-source')return {context:{key:r.key+':'+appReader.record.id,title:r.title+' · '+appReader.record.title,detail:libraryReadContext||'Selected original is loading. Do not infer its contents.'},actions:[]};
    if(r.key==='meetings'&&!content.hidden&&content.dataset.template==='browser'){
      const meeting=openedMeeting,actions=[];
      if(meeting)actions.push({id:'meeting:brief:'+meeting.id,label:'Brief',icon:'spark',placement:'contextual',kind:'navigation',run:()=>{voice?.setGuide?.(null);return voice?.ask(MEETING_BRIEF_REQUEST,{displayText:'Meeting brief',icon:'spark'});}});
      // Transcription starts only from the person's own click, never from Fox.
      if(!data.sample&&native?.browser)actions.push(transcriptState?.active
        ?{id:'meeting:transcript:stop',label:'Stop transcript',icon:'pause',placement:'contextual',kind:'navigation',run:()=>setTranscribing(false)}
        :{id:'meeting:transcript:start',label:'Transcribe',icon:'mic',placement:'contextual',kind:'navigation',run:()=>setTranscribing(true)});
      const website=websiteContext(r);
      if(meeting)return {context:{key:'meeting:'+meeting.id,title:'Meetings · '+meeting.title,detail:meetingContextDetail(meeting)+(transcriptState?.active?'\nThe call is being transcribed into the World.':'')},actions};
      return website?{context:website,actions}:{actions};
    }
    if(r.entity==='app'){
      const actions=[],website=websiteContext(r);
      const suggestions={
        gmail:[['Check mail','Check my unread emails and summarize what needs my attention.']],
        'google-calendar':[['Today','Show my actual calendar for today and highlight conflicts.']],
        browser:[['Summarize','Summarize the webpage currently open. Read it first; do not infer its contents.']],
        youtube:[['Summarize','Summarize the video currently open using its available transcript. If unavailable, tell me.']],
      }[r.key]||[];
      // The conversation shows an action's icon and title, never the prompt behind it.
      for(const [label,request]of suggestions)actions.push({id:'applet:assist:'+r.moduleId+':'+label,label,icon:'spark',placement:'contextual',kind:'navigation',run:()=>{voice?.setGuide?.(null);return voice?.ask(request,{displayText:label,icon:'spark'});}});
      // Clean up, on every website page in the personal world (owner request 2026-10-05): Fox saves which parts of the
      // site Focus hides (core/browser/page-focus.ts), at once and for every later visit.
      if(website&&native?.browser&&!data.sample)actions.push({id:'applet:focus-rules:'+r.moduleId,label:'Clean up',icon:'focus',placement:'contextual',kind:'navigation',run:()=>{voice?.setGuide?.(null);return voice?.ask(FOCUS_RULES_REQUEST,{displayText:'Clean up this page',icon:'focus'});}});
      if(data.sample&&r.key==='google-calendar')actions.push({id:'practice:tennis',label:'Plan tennis',icon:'calendar',placement:'contextual',kind:'navigation',run:reviewTennis});
      if(MONEY_READERS.includes(r.key)&&content.hidden){actions.push({id:'money:refresh:'+r.key,label:'Refresh',icon:'refresh',placement:'contextual',kind:'navigation',run:()=>showMoney(r)});if(r.key==='stripe'&&moneyConnections.get(r.key))actions.push({id:'stripe:disconnect',label:'Disconnect',icon:'link',placement:'contextual',kind:'navigation',run:async()=>{await native.stripe({operation:'disconnect'});localStageRecords.delete(r.key);showMoney(r);}});}
      if(WORK_APPLETS.includes(r.key)&&content.hidden)actions.push({id:'work:refresh:'+r.key,label:'Refresh',icon:'refresh',placement:'contextual',kind:'navigation',run:()=>showWork(r)});
      return website?{context:website,actions}:{actions};
    }
    return {actions:[{id:'module:return:'+r.id,label:buildingFor(r.id)?.title||'World',icon:'map',placement:'contextual',kind:'navigation',run:()=>r.buildingId?visitBuilding(r.buildingId):home()},{id:'module:info:'+r.id,label:'Open '+r.title,icon:'file',placement:'contextual',kind:'navigation',run:()=>showModulePanel(r.moduleId)}]};
  }
  let memoReader=null,messagesReader=null;let deviceInventory,appReader=null,libraryWebReturn=null,libraryReadContext=null,originalRequest=0,codexApplet;
  // Opening an item takes the user into its Applet. Fox then offers only what this
  // kind of item can actually settle, and nothing here touches the outside service.
  let practiceTimer=null;
  function openPracticePrototype(){
   if(!data.sample||!workSelection?.item.session?.practiceJob)return;
   const job=workSelection.item.session.practiceJob;
   const state=practiceWorkState(),stored=state.jobs.find(j=>j.id===job.id);stored.reviewed=true;
   const saved=savePracticeRecord('sample-demo-work-state',JSON.stringify(state));if(!saved.ok){notify(saved.error);return;}
   job.reviewed=true;const item=workItems('codex',{sessions:[practiceJobSession(job)]})[0];workSelection.item=item;publishWork(workSelection.r,sampleWork('codex',state));scene?.setFocusItem?.('app-codex',item);
   practiceTimer?.stop();header('Quiet focus timer','Codex');content.dataset.template='coding-prototype';
   const get=()=>practiceWorkState().jobs?.find(j=>j.id===job.id)?.timer||{};
   practiceTimer=mountPracticeTimer(content,{read:get,save:timer=>{const state=practiceWorkState();const stored=state.jobs.find(j=>j.id===job.id);stored.timer=timer;savePracticeRecord('sample-demo-work-state',JSON.stringify(state));},onChange:()=>nativeHUD?.sync()});
   sceneState();nativeHUD?.sync();
  }
  function practiceCoding(name,args){
   const state=practiceWorkState(),r=sections.find(s=>s.key==='codex');
   if(name==='delegate_codex'){
    const result=createPracticeJob(args,state);if(result.error)return result;
    const job=result.job;
    if(!(state.jobs||[]).some(j=>j.id===job.id)){state.jobs=[job,...(state.jobs||[])].slice(0,12);const saved=savePracticeRecord('sample-demo-work-state',JSON.stringify(state));if(!saved.ok)return saved;}
    visitObject('app-codex');openWorkItem(r,workItems('codex',{sessions:[practiceJobSession(job)]})[0]);
    setTimeout(()=>{if(!document.body.contains(content)||current!==r.moduleId)return;publishWork(r,sampleWork('codex',practiceWorkState()));if(workSelection?.item.id===job.id&&content.dataset.template==='coding-session'){workSelection.item=workItems('codex',{sessions:[practiceJobSession(job)]})[0];scene?.setFocusItem?.(r.moduleId,workSelection.item);void workSelection.refresh?.();}nativeHUD?.sync();},PRACTICE_BUILD_MS+50);
    return {ok:true,id:job.id,status:'Running',fictional:true,scope:'Preparing an authored timer prototype locally. No CLI is running.'};
   }
   if(name==='list_codex_tasks')return {ok:true,fictional:true,tasks:(state.jobs||[]).map(practiceJobSession)};
   const job=(state.jobs||[]).find(j=>j.id===args.id);if(!job)return {error:'Task not found. List the coding tasks first.'};
   if(name==='show_codex_task'){visitObject('app-codex');openWorkItem(r,workItems('codex',{sessions:[practiceJobSession(job)]})[0]);}
   return {ok:true,id:job.id,fictional:true,...practiceJobDetail(job)};
  }
  function practiceWorkState(){try{return JSON.parse(pages.get('sample-demo-work-state')?.markdown||'{}')}catch{return {}}}
  function completePracticeSession(){
   if(!data.sample||!workSelection?.item.session)return;
   const {r,item}=workSelection,state=practiceWorkState();state[r.key+':'+item.session.sessionId.split('-').at(-1)]=true;
   const result=savePracticeRecord('sample-demo-work-state',JSON.stringify(state));if(!result.ok){notify(result.error);return;}
   item.session.status='Completed';item.when='Completed';publishWork(r,sampleWork(r.key,state));void workSelection.refresh?.();
   voice?.setGuide?.({text:'The prepared session result is ready to review. No local CLI was run.',source:'practice-code',takeover:true});nativeHUD?.sync();
  }
  function savePracticeRecord(id,body){
   const p=pages.get(id);if(!data.sample||!p)return {error:'Practice record not found.'};
   const result=contentStore.mutate('patch_content',{id,revision:p.revision,field:'body',old_text:p.markdown,new_text:body},{operationId:crypto.randomUUID()});
   let statuses={};try{statuses=JSON.parse(native?.storage?.getItem('items')||'{}')}catch{}
   const snoozes=readSnoozes();
   for(const page of pages.values())if(statuses[page.worldItemId])settleItemPage(page,statuses[page.worldItemId],snoozes[page.worldItemId]);
   return result;
  }
  function reviewTennis(){
   if(!data.sample)return;
   tennisDemo({read:id=>pages.get(id)?.markdown,save:savePracticeRecord,show:value=>{voice?.setGuide?.(value);voice?.revealGuide?.();},open:id=>open(id),onConfirmed:()=>{settleSampleItem('sample-item-1','done');nativeHUD?.sync();}});
  }
  function practiceDinnerEmail(source){
   const line=key=>source.match(new RegExp('^'+key+': (.+)$','m'))?.[1]||'';
   return `Hi Alex,\n\nHow about dinner at ${line('Restaurant')} on ${line('Date')} at ${line('Time')}? The address is ${line('Address')}. There are vegetarian options, around $35 per person. Let’s meet at the station at 18:45 and walk together. I haven’t booked a table yet.\n\nKelvin`;
  }
  function preparePracticeEmail(args){
   if(!data.sample)return {error:'Email preparation requires the native Gmail review.'};
   const sources=args.sourceIds;
   if(!Array.isArray(sources)||!sources.length||sources.some(id=>!pages.has(id)))return {error:'Read and provide the original sourceIds first.'};
   if(typeof args.to!=='string'||!/^[-.a-z0-9_+]+@example\.com$/i.test(args.to))return {error:'Use the fictional contact’s exact example.com address.'};
   if(typeof args.subject!=='string'||args.subject.length>300||typeof args.body!=='string'||!args.body.trim()||args.body.length>30000)return {error:'Provide a complete subject and message.'};
   const id=crypto.randomUUID(),draft={from:'kelvin@example.com',to:args.to,subject:args.subject,body:args.body};let sent=false;
   presentEmailReview(async(_action,request)=>{
    if(request.operation==='cancel')return {ok:true};
    if(request.operation!=='send')throw Error('Unsupported practice mail action.');
    if(!sent){const previous=pages.get('sample-demo-outbox')?.markdown||'';const result=savePracticeRecord('sample-demo-outbox',previous+'\n\n## '+draft.subject+'\nTo: '+draft.to+'\nStatus: recorded (practice)\nSources: '+sources.join(', ')+'\n\n'+draft.body);if(!result.ok)throw Error(result.error);sent=true;scene?.refreshContent?.();}
    return {status:'recorded',messageId:id};
   },()=>({setGuide:value=>{voice?.setGuide?.(value);voice?.revealGuide?.();}}),{id,draft,practice:true});
   return {ok:true,status:'awaiting_user_confirmation',message:'Full draft shown in Fox. Only the user can confirm the practice send.'};
  }
  function closeAttentionPreview(restoreFocus=true){
   if(!attentionPage)return;
   attentionPage=null;voice?.setAttentionActions?.([]);attentionPreview.close({restoreFocus});voice?.setGuide?.(null,{forget:true});nativeHUD?.sync();voice?.sync();
  }
  function openAttentionOriginal(page,ref=null){
   closeAttentionPreview(false);
   if(!ref){focusContent(page.id);return;}
   // Resolve this exact reference; never send every icon to the primary original.
   const note=pages.get(ref.id)||[...pages.values()].find(p=>p.sourceId===ref.id&&(!p.sourceProvider||p.sourceProvider===ref.provider));
   if(note){if(!data.sample&&note.sourceId)focusContent(note.id);else open(note.id);return;}
   // An email the item came from opens in Mail, read again from Gmail, so it can be checked
   // before Fox acts on it (#1618); the host reads the item's first Gmail thread.
   const mailRef=(page.worldItemSources||[]).find(r=>r?.provider==='gmail');
   if(!data.sample&&page.sourceProvider==='gmail'&&String(page.sourceId||'').startsWith('world-item:')&&ref.provider==='gmail'&&ref.local!==true&&String(ref.id).startsWith('thread:')&&mailRef?.id===ref.id){focusContent(page.id);return;}
   const url=safeAttentionSourceURL(ref.url);
   if(url){openWorldURL(url);return;}
   // A brought conversation opens back to itself (core/tasks/attention.ts), read from the World like a local original.
   const originalId=ref.local===true?ref.id:ref.provider==='conversations'&&!data.sample?'conversation:'+ref.id:'';
   if(originalId&&native?.original){
    const request=++originalRequest,body=dialog(ref.title||'Source');body.append(element('p','ui-caption','Reading original…'));
    native.original(originalId).then(value=>{if(request!==originalRequest||!body.isConnected)return;body.replaceChildren(element('h2','',value.title||'Source'),renderMarkdown(value.text||'',{title:value.title||'Source',path:'original.md'}));}).catch(()=>{if(request!==originalRequest||!body.isConnected)return;body.replaceChildren(element('h2','','Saved source excerpt'),element('p','',ref.quote||'No saved excerpt.'));});return;
   }
   const body=dialog(ref.title||'Saved source excerpt');
   body.append(element('p','ui-caption',(ref.provider||'Source')+' · Saved excerpt'),element('p','',ref.quote||'No saved excerpt is available for this source.'));
  }
  let helpingTask='',helpNarrator:ReturnType<typeof narrateHelp>|null=null;
  function previewActions(page){
   const data=attentionPreviewData(page),id=page.worldItemId;
   const action=(key,label,request)=>({id:'attention:'+key+':'+id,label,icon:'spark',placement:'contextual',kind:'navigation',run:()=>{
    if(data.kind==='task')helpingTask=id;
    root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id,phase:'started'}}));
    // A task with a verified website opens it at once under Fox's glow, instead of after
    // Fox's first planning steps; Fox then continues on the page that is already open.
    const site=firstValueLinks({websiteURLs:page.worldItemWebsites})[0];
    if(data.kind==='task'&&site&&native?.browser){attentionOrigin={key:'attention:'+id,title:page.title,at:Date.now()};attentionOpening={key:'attention:'+id,title:page.title,site:webSite(site)};}
    const onPage=!!(data.kind==='task'&&site&&native?.browser&&asToolNavigation(()=>openWorldURL(site,{attention:page})));
    if(onPage)browserPanel.foxControl(true);
    // Fox keeps talking while it plans (replacing the browser's own greeting), until its
    // first step on the page; the turn's end clears it for Fox's reply.
    helpNarrator?.stop();
    const say=(text:string)=>voice?.setGuide?.({source:'attention-help:'+id,text});
    const narrator=helpNarrator=narrateHelp(helpNarration(page.title,onPage),say);
    const quiet=()=>{narrator.stop();attentionOpening=null;if(helpNarrator===narrator)helpNarrator=null;voice?.setGuide?.(null,{only:'attention-help:'+id,forget:true});};
    return Promise.resolve(voice?.ask(attentionRequest(request,id,page.title,firstValueRequest(id,firstValueLinks({websiteURLs:page.worldItemWebsites}))),{displayText:label})).then(result=>{
     if(helpingTask===id)helpingTask='';quiet();root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id,phase:'finished',result}}));return result;
    },error=>{if(helpingTask===id)helpingTask='';quiet();root.dispatchEvent(new CustomEvent('worldlet:attention-help',{detail:{id,phase:'finished',result:{outcome:'error'}}}));throw error;});
   }});
   if(data.actionLabel)return [action(data.kind==='update'?'explore':'help',data.actionLabel,'Help me with this next step: '+data.actionLabel+'. Read the saved evidence first, then complete it directly.')];
   if(data.kind==='update')return [action('explore','Explore more','Explain what this update means and useful next steps')];
   if(data.kind==='task')return [action('help','Help me do it','Help me complete the next step')];
   return [action('help','Help prepare','Help me prepare for this event'),...(data.physical?[action('route','Plan route','Help me plan a route to the saved location; ask for a starting point if unknown')]:[])];
  }
  function showAttentionGuide(page){
   const id=page.worldItemId,kind=page.worldItemKind;
   const makeAction=(key,label,run)=>{const b=button(label,run);b.dataset.actionId='attention:'+key+':'+id;return b;};
   const settle=(status,until=null)=>settleAttention(page,status,until,{advance:true}).catch(e=>notify(e.message));
   const primary=previewActions(page).slice(0,1).map(a=>makeAction(a.id.split(':')[1],a.label,a.run));
   // The card owns the item's outcome; Fox keeps the offer of help.
   // A task is done; an event or update is acknowledged ("Got it") and leaves the Center.
   // Dismiss only closes the card: the item stays in the Center (owner decision).
   const outcomes=()=>[
    {key:'done',label:kind==='task'?'Done':'Got it',primary:true,run:()=>settle(kind==='update'?'read':'done')},
    {key:'dismiss',label:'Dismiss',run:()=>closeAttentionPreview()},
    {key:'later',label:'Later',run:later}];
   function later(){try{return settle('open',attentionLaterUntil(Date.now(),Intl.DateTimeFormat().resolvedOptions().timeZone));}catch(error){notify(error.message);}}
   attentionPreview.setActions(outcomes());
   // Changed evidence for this task, found by a background pass, is decided here, not in Fox's dialog (owner Order 2026-10-07).
   attentionPreview.setReview(native?.taskReview?taskReviewLine(data.taskReviews,id,(review,choice,candidate)=>native.taskReview(review,choice,candidate)
    .then(result=>{if(result?.error)throw Error(result.error);attentionPreview.setReview(null);}).catch(e=>notify(e.message))):null);
   // A reply Fox prepared for this item waits in the Journal (owner decision 2026-10-09): one line says so and opens it.
   showDraftLine(page);if(native?.emailReviews&&kind==='task')void readDrafts().then(()=>{if(attentionPage===page)showDraftLine(page);}).catch(()=>{});
   voice?.setAttentionActions?.([]);
   voice?.setGuide?.({source:'attention-preview:'+id,takeover:true,text:attentionPreviewData(page).suggestion,remember:true,actions:primary});voice?.revealGuide?.();
  }
  function showDraftLine(page){
   const thread=page.worldItemKind==='task'?replyThread({sources:page.worldItemSources}):'',draft=thread?waitingDrafts.find(d=>d.thread===thread):null;
   attentionPreview.setDraft(draft?{text:'Fox drafted a reply',label:'Review',run:()=>{closeAttentionPreview(false);window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{day:dayKey(new Date(draft.createdAt*1000||Date.now()))}}));}}:null);
  }
  const itemPage=(id:string)=>[...pages.values()].find(p=>p.worldItemId===id);
  function previewAttention(item){
   const page=[...pages.values()].find(p=>p.worldItemId&&p.worldItemId===item.worldItemId);if(!page)return false;
   foxArtifact.close();shownArtifact=null;attentionPage=page;attentionPreview.open({...page,attentionTimeMembers:(item.pageIds||[page.id]).map(id=>pages.get(id)).filter(Boolean).map(p=>p.worldItemSignal||{})});nativeHUD?.sync();showAttentionGuide(page);
   const card=attentionPreviewData(page);
   keepArtifact({id:attentionArtifactId(item.worldItemId),kind:'attention',title:card.title,body:card.summary,chart:null,size:'medium',category:card.category,origin:{type:'attention',item:item.worldItemId}});
   // Previewing is not a settlement: keep this row available until an explicit action.
   return true;
  }
  function itemActions(item){
   if(!item?.worldItemId)return;
   const page=[...pages.values()].find(p=>p.worldItemId===item.worldItemId);if(!page)return;
   voice?.setGuide?.({source:'attention:'+item.worldItemId,takeover:true,
    text:attentionBrief(page),remember:true,actions:[]});
   nativeHUD?.sync();voice?.revealGuide?.();
  }
  // The sample settles its items locally: the page goes quiet the way the ledger
  // would make it, and the status stays in memory until the app restarts.
  function settleSampleItem(id,status){
    const page=pages.get('world-item-'+id);if(!page)return;
    settleItemPage(page,status);
    let saved={};try{saved=JSON.parse(native?.storage?.getItem('items')||'{}')||{};}catch{}
    saved[id]=status;native?.storage?.setItem('items',JSON.stringify(saved));
    const r=sections.find(s=>s.moduleId===current);
    if(r?.entity==='app'&&r.fullView?.kind==='scene')scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));
    scene?.refreshContent?.();
  }
  // Sample supplies records through the same Open renderer; never fetch real sources.
  // The notes that carry a sample Applet's name. Items it published are not
  // records: they reach the stage through the ledger.
  const sampleStageRecords=r=>data.sample?(r.sampleRecords||[]).map(id=>pages.get(id)).filter(Boolean).map(p=>({id:p.id,title:p.title,text:p.markdown||p.text,...(p.id==='sample-tennis-plan'?{start:p.markdown?.match(/^Start: (.+)$/m)?.[1]}:{})})):[];
  const localStageRecords=new Map();
  // Events the person made in Calendar (ui/applets/google-calendar/applet.md#local-events): kept in this World, shown
  // beside the synced calendar's, and the only ones the Applet edits. Saves show at once; the host's list follows.
  let calendarEvents=[];
  // A change shows in Calendar, if it is open, and in Attention's Coming Up (and so on the phone).
  const calendarStage=()=>{const r=sections.find(s=>s.key==='google-calendar'&&s.entity==='app');if(r&&current===r.moduleId&&content.hidden)scene?.setAppStage?.(r.moduleId,appletStageData(r));nativeHUD?.sync();};
  // Coming Up: what is on in the next day, at most five, each time a repeating event happens on its own.
  const calendarSoon=()=>{const now=Date.now();return upcomingCalendarEvents(calendarEvents,now,24).slice(0,5).map(o=>{const at=alertAt(o);
   return {key:o.event.id+(o.event.repeat&&o.event.repeat!=='none'?'@'+o.day:''),day:o.day,title:o.event.title,context:o.event.location||'Your calendar',start:o.start,end:o.end,allDay:o.event.allDay,alerting:at!=null&&at<=now&&Date.parse(o.start)>now};});};
  // Opening one from Attention shows its day in Calendar (ui/world/pixi-stage.ts).
  const openCalendarEvent=event=>{const r=sections.find(s=>s.key==='google-calendar'&&s.entity==='app');if(!r)return;if(event?.day)window.dispatchEvent(new CustomEvent('worldlet:calendar-show',{detail:{day:event.day}}));visitObject(r.moduleId);calendarStage();};
  const loadCalendarEvents=async()=>{try{const result=await native?.calendarEvents?.({operation:'list'});if(Array.isArray(result?.events)){calendarEvents=result.events;calendarStage();}}catch{/* Keep what is shown. */}};
  const calendarActions={
   save:async event=>{const before=calendarEvents;calendarEvents=[...calendarEvents.filter(e=>e.id!==event.id),event];calendarStage();
    try{const result=native?.calendarEvents?await native.calendarEvents({operation:'save',event}):null;if(result?.error||result?.ok===false)throw Error(result.error||'Could not save the event.');if(result?.event){calendarEvents=[...calendarEvents.filter(e=>e.id!==event.id),result.event];calendarStage();}}
    catch(error){calendarEvents=before;calendarStage();notify(error?.message||'Could not save the event.');}},
   remove:async id=>{const before=calendarEvents;calendarEvents=calendarEvents.filter(e=>e.id!==id);calendarStage();
    try{const result=native?.calendarEvents?await native.calendarEvents({operation:'delete',id}):null;if(result?.error||result?.ok===false)throw Error(result.error||'Could not delete the event.');}
    catch(error){calendarEvents=before;calendarStage();notify(error?.message||'Could not delete the event.');}},
  };
  window.addEventListener('worldlet:calendar-events',()=>void loadCalendarEvents());
  window.addEventListener('worldlet:calendar-open',(event:any)=>openCalendarEvent(event.detail));
  void loadCalendarEvents();
  // The Applet whose stage the generic scene path drew (not Work, Meetings or a curated reader).
  let sceneStageApp='';
  const sourceIssues=new Map();let sourceIssueSignature='';
  function setSourceIssue(provider,action){if(action)sourceIssues.set(provider,action);else sourceIssues.delete(provider);publishSourceIssues();}
  const appletRetryTimers=new Map();const appletRetryCounts=new Map();
  function quietAppletFailure(r,error,retry){
    const action=sourceReadAction(error);setSourceIssue(r.provider,action);
    if(current===r.moduleId)scene?.setAppStage?.(r.moduleId,appletStageData(r));
    if(action||appletRetryTimers.has(r.moduleId))return;
    const attempt=(appletRetryCounts.get(r.moduleId)||0)+1;appletRetryCounts.set(r.moduleId,attempt);
    appletRetryTimers.set(r.moduleId,setTimeout(()=>{appletRetryTimers.delete(r.moduleId);if(root.isConnected&&current===r.moduleId&&!data.sample)retry();},readRetryDelay(attempt)));
  }
  window.addEventListener('pagehide',()=>{for(const timer of appletRetryTimers.values())clearTimeout(timer);appletRetryTimers.clear();},{once:true});
  function publishSourceIssues(){
    if(data.sample)return;
    const issues=sections.filter(r=>r.entity==='app').flatMap(r=>{const link=data.moduleConnections?.find(c=>c.provider===r.provider),action=sourceIssues.get(r.provider)||sourceReadAction(link);return action?[{provider:r.provider,title:r.title,action,run:()=>native?.setup?.('connection',r.region,r.key)}]:[];});
    const signature=JSON.stringify(issues.map(({provider,action})=>[provider,action]));if(signature===sourceIssueSignature)return;sourceIssueSignature=signature;
    root.dispatchEvent(new CustomEvent('worldlet:source-issues',{detail:issues}));
  }
  const sourceReader=quietSourceReader({
    enabled:provider=>!data.sample&&!!native?.appContent&&connectionLive(data.moduleConnections?.find(c=>c.provider===provider)),
    read:async(provider,refresh)=>{const revision=mailReadRevision,identityRevision=mailIdentityRevision;const result=await native.appContent({provider,refresh});if(result?.error||result?.ok===false)throw Error(result.error||'Read incomplete');return {result,revision,identityRevision};},
    onIssue:setSourceIssue,
    onSuccess:(provider,{result,revision,identityRevision})=>{if(provider==='gmail'&&identityRevision!==mailIdentityRevision)return;const r=sections.find(s=>s.provider===provider&&s.entity==='app');if(!r)return;
      // Discovery results that streamed in during the read are newer: keep them over the read's
      // copy instead of dropping the read, which left Mail nearly empty until a refresh (#1281).
      if(provider==='gmail')deliverMail(result?.pages||[]);
      const streamed=provider==='gmail'&&revision!==mailReadRevision?localStageRecords.get(r.key)||[]:[];
      localStageRecords.set(r.key,streamed.length?[...new Map([...(result?.pages||[]),...streamed].map(p=>[p.id,p])).values()].slice(-100):result?.pages||[]);if(current===r.moduleId&&content.hidden)scene?.setAppStage?.(r.moduleId,appletStageData(r,result?.pages||[]));}
  });
  window.addEventListener('pagehide',()=>sourceReader.stop(),{once:true});
  let mailReadRevision=0,mailIdentityRevision=0;
  window.addEventListener('worldlet:source-results',(event:any)=>{
    if(data.sample||event.detail?.provider!=='gmail'||!Array.isArray(event.detail.pages))return;
    const r=sections.find(r=>r.key==='gmail');if(!r)return;deliverMail(event.detail.pages);
    // Discovery and exact-thread reads arrive separately; keep the visible inbox stable.
    const records=new Map((localStageRecords.get(r.key)||[]).map(p=>[p.id,p]));
    for(const page of event.detail.pages)if(page.id)records.set(page.id,page);
    const loaded=[...records.values()].slice(-100);
    mailReadRevision++;localStageRecords.set(r.key,loaded);
    if(current===r.moduleId&&content.hidden)scene?.setAppStage?.(r.moduleId,appletStageData(r,loaded));
  });

  const mailIdentityReads=new Set<string>(),mailIdentities=new Map<string,any>();
  async function hydrateMailIdentity(r,items){
   if(data.sample||!native?.original)return;
   const revision=mailIdentityRevision;
   const pending=items.filter(item=>item.attention&&item.record.sourceId&&!mailMetadata(item.record).from&&!mailIdentityReads.has(item.record.sourceId)).slice(0,9);
   // Read exact saved originals, two at a time, only for the foreground attention board.
   for(let i=0;i<pending.length;i+=2){
    if(current!==r.moduleId)return;
    await Promise.all(pending.slice(i,i+2).map(async item=>{
     const id=item.record.sourceId;if(!id)return;mailIdentityReads.add(id);
     try{const original=await native.original(id);const record=mailMetadata({...original,id,sourceId:id,title:item.record.title});
      if(record.from&&revision===mailIdentityRevision)mailIdentities.set(id,record);
     }catch{/* Keep the saved letter readable; retry on the next app session. */}
    }));
   }
   if(current===r.moduleId&&content.hidden)scene?.setAppStage?.(r.moduleId,appletStageData(r));
  }
  function appletStageData(r,records=[]){
    if([...HOME_NATIVE,...ORIGINAL_READERS,'voice-memos','messages'].includes(r.key)){
      const source=data.sample?records:(localStageRecords.get(r.key)||records);
      const link=data.moduleConnections?.find(c=>c.provider===r.provider);
      // Fox's findings stay on the board after Fox's own Gmail reads stream letters in; dropping
      // them left Mail empty under its attention mark until a refresh (#1281).
      const items=[...coreAppletItems(r.provider,r.key==='gmail'&&!data.sample?[...source,...mailIdentities.values()]:source,[...pages.values()]),...(r.key==='google-calendar'?localCalendarItems(calendarEvents):[])];
      if(r.key==='gmail'&&items.some(item=>item.attention&&item.record.sourceId&&!mailMetadata(item.record).from&&!mailIdentityReads.has(item.record.sourceId)))queueMicrotask(()=>void hydrateMailIdentity(r,items));
      return {accountLabel:link?.label||'',sample:!!data.sample,loaded:data.sample||localStageRecords.has(r.key),reading:!!link?.reading,items,connected:!!data.sample||connectionLive(data.moduleConnections?.find(c=>c.provider===r.provider)||{}),now:Date.now(),...(r.key==='google-calendar'?{calendar:calendarActions}:{})};
    }
    const items: any[]=[...pages.values()].filter(p=>p.worldItemId&&p.sourceProvider===r.provider).map(p=>{
      const signal=p.events?.[0]||p.activities?.[0]||{};
      const when=signal.start?eventWhen(signal.start,{end:signal.end,allDay:signal.allDay}):null;
      return {id:p.worldItemId,title:p.title,context:signal.quote||'',summary:signal.summary||'',
        state:p.worldItemKind==='task'?'needsAction':p.worldItemKind==='event'?'event':'unseen',
        status:p.worldItemStatus||'open',start:signal.start||null,when:when?when.relative+' \u00b7 '+when.clock:''};
    }).filter(item=>item.status!=='dismissed');
    items.sort((a,b)=>(a.start?Date.parse(a.start):Infinity)-(b.start?Date.parse(b.start):Infinity));
    // Fox's findings come first and carry its words. Anything else the Applet holds
    // follows as itself, so a full notebook never reads as an empty one.
    const known=new Set(items.map(i=>i.title));
    for(const record of records)if(record?.title&&!known.has(record.title)){known.add(record.title);items.push({id:'record:'+record.id,title:record.title,context:'',summary:'',state:'unseen',status:'open',start:null,when:'',record:record});}
    return {items,connected:connectionLive(data.moduleConnections?.find(c=>c.provider===r.provider)||{}),now:Date.now(),
      weather:r.key==='weather'?(scene?.metrics?.environment||null)&&{...scene.metrics.environment,temperature:scene.metrics.environment.temperature,wind:scene.metrics.environment.windSpeed,windFrom:scene.metrics.environment.windFrom}:null};
  }
  function openStageItem(itemId){
    const r=sections.find(s=>s.moduleId===current);if(!r)return;
    const item=scene?.selectStageItem?.(current,itemId);if(!item)return;if(r.key==='meetings'&&item.meetingUrl){openMeeting(r,item.meetingUrl,item.title,item.kind==='call'?item.meeting:null);return;}if(WORK_APPLETS.includes(r.key)){openWorkItem(r,item);return;}if(item.record){openAppRecord(r,{...item.record,...(data.sample&&pages.has(item.id.slice(7))?{noteId:item.id.slice(7)}:{}),presentation:item});return;}
    const page=[...pages.values()].find(p=>p.worldItemId===item.id);if(page)focusContent(page.id);
    itemActions({...item,worldItemId:item.id,actionTitle:item.title,fullAction:item.title,fullContext:item.context,summary:item.summary});
  }
  function foregroundActions(r,body,text=''){
    if(!body)return; // Opening an installation alone is not a request for Fox to speak.
    if(restoringWorld&&voice?.active)return;
    foregroundGuide=r.moduleId;voice?.setGuide?.({text,source:'applet:'+r.moduleId,body,takeover:!restoringWorld});if(!restoringWorld)voice?.revealGuide?.();
  }
  function ensureCodexApplet(){
    if(!codexApplet)codexApplet=createCodexApplet({call:native.codexSession,renderMarkdown,onSelect:openCodexSession,isVisible:()=>current==='app-codex'||current==='building-work',onState:value=>{scene?.setAppActivity?.('app-codex',value);const r=sections.find(s=>s.key==='codex');if(r){workCache.set(r.key,value);publishWork(r,value);}},onRequest:body=>{voice?.setGuide?.({text:'',body,source:'codex'});voice?.revealGuide?.();},onRequestDone:()=>voice?.setGuide?.(null,{only:'codex',forget:true})});
    return codexApplet;
  }
  function openCodexSession(session){
    scene?.setFocusItem?.('app-codex',{id:session.id,title:session.title,context:session.cwd,when:session.status});content.dataset.applet='codex';header(session.title,'Work / Codex');content.dataset.template='coding-session';content.dataset.sessionApp='app-codex';
    const body=element('section','codex-reader');content.append(body);void codexApplet.inspect(session,body);
    dismissFox();sceneState();codexApplet.showPending();
  }
  const workCache=new Map();let workReadSerial=0,workSelection=null;
  const claudeRoute=createClaudeSession(body=>native.claudeSession(body),(value,options)=>voice?.setGuide(value,options),()=>workSelection);
  function refreshWorkRegion(){
    if(data.sample){for(const key of CODING_SESSIONS){const r=sections.find(s=>s.key===key);if(r)publishWork(r,sampleWork(key,practiceWorkState()));}return;}
    if(native?.codexSession)void ensureCodexApplet().refresh();
    const claude=sections.find(s=>s.key==='claude-code');if(claude&&native?.developmentSessions)void loadWork(claude);
  }
  let meetingRecords=[],meetingLoading=false,meetingReadAt=0,meetingAttemptAt=0;
  const meetingSeenKey='worldlet-meetings-seen-'+(data.workspaceId||data.workspace);
  const meetingSeen=new Set<string>();try{for(const id of JSON.parse(localStorage.getItem(meetingSeenKey)||'[]'))meetingSeen.add(id);}catch{}
  // The calendar call on screen (null for a new call or a pasted link): Fox's context and brief.
  let openedMeeting=null;const briefedMeetings=new Map<string,number>();
  function openMeeting(r,url,title,meeting=null){
    libraryWebReturn={app:r,record:null};appReader=null;openedMeeting=meeting;transcriptDeclined=false;
    header(title||r.title,'Meetings',{applet:true});browserPanel.mount('meetings',{url,platform:'web'});sceneState();
    dismissFox();syncTranscriptBar();
    // Opening a calendar call is the request for its brief: Fox says who and what, with what the
    // World knows, while the meeting's waiting page loads. Once per call within half an hour.
    if(meeting&&!data.sample&&Date.now()-(briefedMeetings.get(meeting.id)||0)>1800000){briefedMeetings.set(meeting.id,Date.now());void voice?.ask?.(MEETING_BRIEF_REQUEST,{displayText:'Meeting brief',icon:'spark'});}
  }
  function meetingsStageValue(error=''){return {...meetingsStage(meetingRecords,error),transcripts:meetingTranscripts,openTranscript,openLink:(url,provider)=>{const r=sections.find(s=>s.key==='meetings');if(r)openMeeting(r,url,provider);}};}
  // Live transcripts of calls (Meetings): the host's state, the bar over the call while it runs, and the
  // saved transcripts listed on the sheet. A call starts its transcript by itself (owner request
  // 2026-10-06); once the person stops it, or it could not start, it stays off for that call.
  let meetingTranscripts=[],transcriptState=null,transcriptView=null,transcriptBarTimer=null,transcriptDeclined=false;
  // Every transcribed call gets a summary artifact once its last line is kept (owner request 2026-10-06).
  const summarizedTranscripts=new Set<string>();
  async function loadTranscripts(){
    if(data.sample||!native?.browser)return;
    try{const value=await native.browser.command('transcripts',{},false);if(!Array.isArray(value?.transcripts))return;meetingTranscripts=value.transcripts;
      if(current==='app-meetings'&&content.hidden)scene?.setAppStage?.(current,meetingsStageValue());}catch{}
  }
  async function openTranscript(session,meeting){
    const r=sections.find(s=>s.key==='meetings');if(!r||!native?.browser)return;
    let lines=[];try{const value=await native.browser.command('transcript',{session},false);lines=Array.isArray(value?.lines)?value.lines:[];}catch{}
    if(current!==r.moduleId)return;
    header(meeting||'Transcript','Meetings',{applet:true});content.dataset.applet='meetings';content.dataset.template='meeting-transcript';
    renderTranscript(content,{meeting,lines});sceneState();
  }
  function meetingCallOpen(){return current==='app-meetings'&&!content.hidden&&content.dataset.template==='browser';}
  function syncTranscriptBar(){
    const state=transcriptState,show=!!state&&(state.active||state.waiting>0||Date.now()-(state.endedAt||0)<4000)&&meetingCallOpen();
    if(!show){transcriptView?.element.remove();return;}
    transcriptView??=transcriptBar(()=>void setTranscribing(false));
    transcriptView.update(state);
    const viewport=content.querySelector('.browser-viewport');
    if(viewport&&transcriptView.element.nextElementSibling!==viewport)content.insertBefore(transcriptView.element,viewport);
  }
  async function setTranscribing(on){
    const title=openedMeeting?.title||browserPanel.lastVisit('meetings')?.title||'Meeting';
    if(!on)transcriptDeclined=true;
    let error='';
    try{const value=await native?.browser?.command('transcribe',{on,meeting:title},false);if(value?.error)error=String(value.error);}
    catch(e){error=e?.message||'Could not start the transcript.';}
    if(error){transcriptDeclined=true;voice?.setGuide?.({source:'meeting-transcript',text:error});voice?.revealGuide?.();}
    nativeHUD?.sync();
  }
  window.addEventListener('worldlet:browser',(event:any)=>{
    const value=event.detail;
    if(value?.phase==='meeting-ready'){if(!data.sample&&!transcriptDeclined&&!transcriptState?.active&&meetingCallOpen())void setTranscribing(true);return;}
    if(value?.phase!=='transcript')return;
    const ended=transcriptState?.active&&!value.active;
    transcriptState={...value,endedAt:value.active?0:(transcriptState?.endedAt||Date.now())};
    syncTranscriptBar();nativeHUD?.sync();
    if(ended||!value.active&&!value.waiting){clearTimeout(transcriptBarTimer);transcriptBarTimer=setTimeout(()=>{syncTranscriptBar();void loadTranscripts();},4500);}
    if(!value.active&&!value.waiting&&value.lines>0&&typeof value.visit==='string'&&value.visit&&!data.sample&&!summarizedTranscripts.has(value.session)){
      summarizedTranscripts.add(value.session);
      void voice?.ask?.(meetingSummaryRequest({meeting:value.meeting,visit:value.visit}),{displayText:'Meeting summary',icon:'spark'});
    }
  });
  function showMeetings(r){
    content.hidden=true;hud.classList.remove('is-reading');appReader=null;openedMeeting=null;void loadTranscripts();
    // The sample world shows its authored meeting notes where calendar calls would be.
    const stage=meetingsStageValue();if(data.sample)stage.items=[...appletStageData(r,sampleStageRecords(r)).items,...stage.items];
    scene?.setAppStage?.(r.moduleId,stage);sceneState();
    void refreshMeetings();
  }
  async function refreshMeetings(){
    if(meetingLoading||data.sample||!native?.appContent)return;
    const connected=connectionLive(data.moduleConnections?.find(c=>c.provider==='google-calendar')||{});
    if(!connected){meetingRecords=[];if(current==='app-meetings')scene?.setAppStage?.(current,{...meetingsStageValue(),connected:false});return;}
    meetingLoading=true;meetingAttemptAt=Date.now();
    try{const value=await native.appContent({provider:'google-calendar',refresh:true});meetingRecords=calendarMeetings(value?.pages||[]);meetingReadAt=Date.now();
      if(current==='app-meetings'&&content.hidden)scene?.setAppStage?.(current,meetingsStageValue());
    }catch{meetingReadAt=0;if(current==='app-meetings'&&content.hidden)scene?.setAppStage?.(current,meetingsStageValue('Calendar could not refresh. Ask Fox to retry.'));}
    finally{meetingLoading=false;}
  }
  const meetingPoll=setInterval(()=>{
    if(!root.isConnected||data.sample)return;
    // No stale/offline prompts, no replacement of a meeting already on screen.
    // A hidden page offers nothing, so it does not read Calendar every minute either;
    // the first tick after it is shown again refreshes.
    if(!document.hidden&&Date.now()-meetingAttemptAt>60000&&!meetingLoading)void refreshMeetings();
    if(document.hidden||root.dataset.onboarding==='true'||Date.now()-meetingReadAt>90000||current==='app-meetings'&&!content.hidden)return;
    const due=dueMeeting(meetingRecords,meetingSeen),r=sections.find(s=>s.key==='meetings');if(!due||!r)return;
    meetingSeen.add(due.id);try{localStorage.setItem(meetingSeenKey,JSON.stringify([...meetingSeen].slice(-200)));}catch{}
    offerMeeting(r,due);
  },5000);
  // Any invite can put a valid meeting link on the calendar, so a due meeting is only
  // offered: Fox shows it with an explicit Join action and nothing opens by itself.
  function offerMeeting(r,due){
    const source='meeting-due',close=()=>voice?.setGuide?.(null,{only:source,forget:true});
    const body=element('p','',due.title+' · '+due.provider);
    voice?.setGuide?.({source,text:'A meeting is starting.',body,actions:[
      button('Join',()=>{close();visitObject(r.moduleId,{enter:false});openMeeting(r,due.url,due.title,due);}),
      button('Not now',close)]});
    voice?.revealGuide?.();
  }
  // The day's plan in the morning and its summary in the evening (owner request 2026-10-06), each asked of Fox
  // once a day. The plan is the morning brief, made at 6 AM before the person sits down (owner Order 2026-10-07), so
  // a hidden window or an open Applet does not hold it back; the summary waits for a day they used and for the World.
  // Neither runs beside a dialog or a turn in progress, nor before the first-run tour is over (Fox stays quiet
  // through it, #1948; Mac RCs 2983 and 2985 saw the plan take Fox's bubble from the first win). Automated
  // browsers (the RC's UI checks) never get an unasked turn. Nor while the tour's phone step, which comes after the
  // first win, is still to come or showing: the evening summary took the World from it (Mac RC 3035).
  const DAILY_ARTIFACT=/^(Plan|Summary) · /;
  const dailyKey='worldlet-daily-artifacts-'+(data.workspaceId||data.workspace);
  let daily=readDailyArtifactsState(null);try{daily=readDailyArtifactsState(JSON.parse(localStorage.getItem(dailyKey)||'null'));}catch{}
  const saveDaily=()=>{try{localStorage.setItem(dailyKey,JSON.stringify(daily));}catch{}};
  window.addEventListener('worldlet:product-event',(event:any)=>{if(event.detail?.event!=='user_engaged'||data.sample)return;daily=markDailyUse(daily,new Date());saveDaily();});
  let dailyAsking=false;
  // The morning brief and the day's summary open the Journal on their day rather than a card (owner request
  // 2026-10-08): kept first, then the book opens on today's page for the person, not for an empty room (owner Order
  // 2026-10-08, "早上起来的时候…直接把那个 journal 打开就是今天今早的第一页"): at once when they are at the computer,
  // otherwise at their first touch, key or screen wake that day, even after Worldlet restarts in between.
  let lastPresence=0;
  const present=()=>Date.now()-lastPresence<120000;
  const journalMoment=()=>!document.hidden&&!insideApplet()&&!inPageLayer()&&!attentionPage&&!foxArtifact.visible&&!$('notionDialog').open&&!voice?.active&&root.dataset.onboarding!=='true'&&root.dataset.onboardingLocked!=='true'&&!root.dataset.tourStep&&!root.dataset.tourCoda;
  const openWaitingJournal=()=>{
   if(!daily.journal)return;
   if(daily.journal!==dayKey(new Date())){daily=journalSeen(daily);saveDaily();return;}
   if(!present()||!journalMoment())return;
   daily=journalSeen(daily);saveDaily();window.dispatchEvent(new CustomEvent('worldlet:journal-open',{detail:{}}));
  };
  function showDailyInJournal(artifact){
   daily=journalWaiting(daily,dayKey(new Date()));saveDaily();
   void Promise.resolve(native?.artifacts?.({operation:'save',artifact})).catch(()=>{}).then(()=>{window.dispatchEvent(new Event('worldlet:artifacts'));openWaitingJournal();});
   return {ok:true,id:artifact.id,size:artifact.size,shown:'journal'};
  }
  const arrived=()=>{const away=!present();lastPresence=Date.now();if(away&&daily.journal)setTimeout(openWaitingJournal,300);};
  for(const type of ['pointermove','pointerdown','keydown','wheel'])window.addEventListener(type,arrived,{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)arrived();setTimeout(openWaitingJournal,400);});
  // The person opened the book themselves: today's page is seen.
  document.addEventListener('worldlet:journal-opened',()=>{if(daily.journal){daily=journalSeen(daily);saveDaily();}},true);
  // The one gate for work Fox starts by itself (core/artifacts/replies.ts backgroundBlocked): never in the practice
  // world, an automated browser, onboarding, the first-run tour (its phone step included) or beside another request.
  const backgroundMoment=()=>backgroundBlocked({sample:!!data.sample,automated:!!navigator.webdriver,onboarding:root.dataset.onboarding==='true'||root.dataset.onboardingLocked==='true',tour:!!root.dataset.tourStep||!!root.dataset.tourCoda,firstRun:!!native?.firstRun?.(),asking:dailyAsking||replyAsking});
  const dailyPoll=setInterval(()=>{
    if(!root.isConnected){clearInterval(dailyPoll);return;}
    openWaitingJournal();
    if(backgroundMoment()||foxArtifact.visible||$('notionDialog').open||voice?.active)return;
    const due=dailyArtifactDue(daily,new Date());
    if(!due){void prepareReply();return;}
    if(due.kind==='summary'&&(document.hidden||insideApplet()||inPageLayer()))return;
    void askDaily(due);
  },30000);
  // What Fox is doing, for its name tag and the World's top-right (worldlet:fox-status): the step while it works, then
  // empty with what was done, which the top-right shows briefly (ui/hud/fox-work-line.ts). Reply drafts made meanwhile
  // are counted from the host's worldlet:email-drafted.
  function backgroundWork(source:string,kind:FoxWorkKind,text:string){
    let drafted=0;const count=()=>{drafted++;};
    window.addEventListener('worldlet:email-drafted',count);
    window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source,text}}));
    return {drafted:()=>drafted,end(ok:boolean){window.removeEventListener('worldlet:email-drafted',count);
     window.dispatchEvent(new CustomEvent('worldlet:fox-status',{detail:{source,text:'',...(ok?{done:foxWorkDone(kind,drafted)}:{})}}));}};
  }
  async function askDaily(due:{kind:'plan'|'summary';day:string}){
    dailyAsking=true;
    // What the brief holds, as the person wrote it (Morning brief in the Journal, or told to Fox).
    let brief:string|undefined;if(due.kind==='plan')try{brief=await native?.morningBrief?.();}catch{}
    const before=daily;daily=markDailyMade(daily,due.kind,due.day);saveDaily();
    const request=dailyArtifactRequest(due.kind,due.day,brief);
    // Made quietly in a background session beside the conversation (owner Orders 2026-10-07): no message in Fox's card
    // and no reply line, the person can talk to Fox meanwhile, and the long request never fills the conversation.
    const work=backgroundWork('daily',due.kind,due.kind==='plan'?'Making your morning brief…':'Writing the day’s summary…');
    let ok=true;
    // Other background work still running: asked again at the next poll.
    await Promise.resolve(voice?.background?.(request.text,{displayText:request.displayText}))
     .catch(error=>{ok=false;if(/busy/i.test(String(error?.message||''))){daily=before;saveDaily();}})
     .finally(()=>{work.end(ok);dailyAsking=false;});
  }
  // Replies Fox prepares by itself (owner decision 2026-10-09; rules in core/artifacts/replies.ts): a new Worth Doing
  // item from a Gmail thread that waits for the person gets a reply draft in a background session, a reply card in
  // today's Journal that only the person sends. Each item once, a few a day, for someone who used Worldlet lately.
  const repliesKey='worldlet-prepared-replies-'+(data.workspaceId||data.workspace);
  let replies=readPreparedRepliesState(null);try{replies=readPreparedRepliesState(JSON.parse(localStorage.getItem(repliesKey)||'null'));}catch{}
  const saveReplies=()=>{try{localStorage.setItem(repliesKey,JSON.stringify(replies));}catch{}};
  let replyAsking=false;
  // The drafts waiting for review, by Gmail thread, so an Attention card can point at the draft made for it.
  let waitingDrafts:{id:string;thread:string;createdAt:number}[]=[];
  async function readDrafts(){
    if(!native?.emailReviews)return waitingDrafts=[];
    const list=await native.emailReviews();
    return waitingDrafts=(Array.isArray(list)?list:[]).filter(r=>r&&!r.attempted&&typeof r.id==='string').map(r=>({id:r.id,thread:String(r.draft?.threadId||''),createdAt:Number(r.createdAt)||0}));
  }
  window.addEventListener('worldlet:email-drafted',()=>{void readDrafts().then(()=>{if(attentionPage)showDraftLine(attentionPage);}).catch(()=>{});});
  async function prepareReply(){
    if(replyAsking||!native?.emailReviews||!voice?.background)return;
    const now=new Date();
    if(!replies.since){replies=preparedRepliesSettling(replies,now);saveReplies();return;}
    const items=[...pages.values()].filter(p=>p.worldItemId).map(p=>({id:p.worldItemId,kind:p.worldItemKind,status:p.worldItemStatus,snoozedUntil:p.worldItemSnoozedUntil,ready:p.worldItemContentReady,title:p.worldItemSignal?.title||p.title,sources:p.worldItemSources,receivedAt:p.worldItemSignal?.receivedAt,occurredAt:p.worldItemSignal?.occurredAt,sourceUpdatedAt:p.worldItemSignal?.sourceUpdatedAt}));
    if(!replyCandidates(items,replies,{now}).length)return;
    replyAsking=true;
    try{
     const drafts=await readDrafts();
     if(!replyPrepareDue(replies,{now,daily,waiting:drafts.length}).due)return;
     const candidates=replyCandidates(items,replies,{now,drafted:drafts.map(d=>d.thread)});
     // An item whose thread already has a draft waiting (the morning brief's, say) counts as prepared, without asking.
     for(const item of items)if(!candidates.some(c=>c.id===item.id)&&drafts.some(d=>d.thread&&d.thread===replyThread(item))&&!replies.prepared.includes(item.id))replies=markReplyPrepared(replies,item.id,now,{asked:false,thread:replyThread(item)});
     saveReplies();
     const next=candidates[0];if(!next)return;
     const before=replies;replies=markReplyPrepared(replies,next.id,now,{thread:next.thread});saveReplies();
     const request=replyPrepareRequest(next),work=backgroundWork('reply','reply',replyPrepareStatus(next));
     let ok=true;
     // Busy with other background work: the item is asked again at the next poll.
     await Promise.resolve(voice.background(request.text,{displayText:request.displayText}))
      .catch(error=>{ok=false;if(/busy/i.test(String(error?.message||''))){replies=before;saveReplies();}})
      .finally(()=>work.end(ok));
    }catch{}finally{replyAsking=false;}
  }
  window.addEventListener('pagehide',()=>clearInterval(meetingPoll),{once:true});
  const workPoll=setInterval(()=>{if(!document.hidden&&current==='building-work'){const r=sections.find(s=>s.key==='claude-code');if(r&&!data.sample&&native?.developmentSessions)void loadWork(r);}},15000);
  window.addEventListener('pagehide',()=>clearInterval(workPoll),{once:true});
  function publishWork(r,value){
    const items=workItems(r.key,value),error=workError(r.key,value);scene?.setAppActivity?.(r.moduleId,{sessions:items.map(i=>i.session).filter(Boolean),usage:value.usage});
    scene?.setAppStage?.(r.moduleId,{items,connected:true,error,scope:value.scope||'',loadMore:value.nextOffset!=null?()=>loadWork(r,value.nextOffset):value.cursor?()=>codexApplet?.refresh(true):null});
  }
  async function loadWork(r,offset=0){
    try{const value=await native.developmentSessions(r.key==='claude-code'?'claude':r.key,{offset});
      // A repeated Load more returns the same page again; keep each repository once.
      if(offset&&r.key==='github')value.repositories=[...new Map([...(workCache.get(r.key)?.repositories||[]),...(value.repositories||[])].map(repo=>[repo.id,repo])).values()];
      workCache.set(r.key,value);publishWork(r,value);
    }catch(e){publishWork(r,{error:e.message||'Could not read this tool. Ask Fox to retry.'});}
  }
  function showWork(r){
    workSelection=null;content.hidden=true;hud.classList.remove('is-reading');appReader=null;
    if(data.sample){const value=sampleWork(r.key,practiceWorkState());workCache.set(r.key,value);publishWork(r,value);}
    else if(r.key==='codex'&&native?.codexSession){publishWork(r,workCache.get(r.key)||{scope:'Reading Codex sessions…'});ensureCodexApplet().refresh();}
    else if(native?.developmentSessions){publishWork(r,workCache.get(r.key)||{scope:'Reading '+r.title+'…'});void loadWork(r);}
    else publishWork(r,{error:'Open Worldlet on your Mac to read this tool.'});
    sceneState();
  }
  function openWorkItem(r,item){
    workSelection={r,item};scene?.setFocusItem?.(r.moduleId,item);
    if(r.key==='codex'&&!data.sample){ensureCodexApplet();openCodexSession(item.session);return;}
    header(item.title,r.title);content.dataset.applet=r.key;content.dataset.template='coding-session';content.dataset.sessionApp=r.moduleId;
    const body=element('section','work-reader');content.append(body);sceneState();dismissFox();
    const read=async(offset=0)=>{const serial=++workReadSerial;body.replaceChildren(element('p','ui-caption','Reading…'));
      try{const value=data.sample?sampleWorkDetail(item):await native.developmentSessions(r.key==='claude-code'?'claude':r.key,{operation:'read',id:item.repo?.id||item.session?.sessionId,offset});
       if(serial!==workReadSerial||!body.isConnected)return;renderWorkDetail(body,r.key,value,renderMarkdown,read);
      }catch(e){if(serial===workReadSerial)readerFailed(body,e,()=>read(offset));}};
    workSelection.refresh=read;void read();
  }
  const curatedReads=new Map();
  // A changed source drops its listing and any original being read from it; closeReader also empties the open reader.
  function invalidateCurated(key,closeReader=false){curatedReads.set(key,(curatedReads.get(key)||0)+1);localStageRecords.delete(key);if(current==='app-'+key){originalRequest++;if(closeReader){content.replaceChildren();content.hidden=true;appReader=null;}libraryReadContext='';}}
  window.addEventListener('worldlet:home-changed',(event:any)=>{if(event.detail?.provider==='todoist')invalidateCurated('todoist');});
  async function showCuratedSource(r,cursor=null){
    const serial=(curatedReads.get(r.key)||0)+1;curatedReads.set(r.key,serial);content.hidden=true;hud.classList.remove('is-reading');appReader=null;
    scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));sceneState();
    if(data.sample)return;
    try{
      const value=await native.curatedSourceContent({provider:r.key,operation:'list',...(cursor?{cursor}:{})});
      if(serial!==curatedReads.get(r.key)||current!==r.moduleId)return;
      const records=cursor?[...(localStageRecords.get(r.key)||[]),...value.pages]:value.pages;
      localStageRecords.set(r.key,[...new Map(records.map(row=>[row.id,row])).values()]);
      scene?.setAppStage?.(r.moduleId,{...appletStageData(r),connected:true,scope:value.scope,loadMore:value.next?()=>showCuratedSource(r,value.next):null});
      foregroundActions(r,null,'Choose an item to read it.'+(r.fullView?.original?' Editing is available in Web.':''));
    }catch(error){if(serial===curatedReads.get(r.key)&&current===r.moduleId){
      if(r.connection?.kind==='local-cli'){localStageRecords.delete(r.key);const message=error.message||'Could not read the local tool. Retry when it is running.';scene?.setAppStage?.(r.moduleId,{items:[],connected:false,error:message});foregroundActions(r,button('Retry',()=>showCuratedSource(r)),message);}
      else quietAppletFailure(r,error,()=>showCuratedSource(r,cursor));
    }}
  }
  const moneyReads=new Map(),moneyConnections=new Map();
  async function showMoney(r,cursor=null){
    const generation=(moneyReads.get(r.key)||0)+1;moneyReads.set(r.key,generation);
    content.hidden=true;hud.classList.remove('is-reading');appReader=null;
    scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));sceneState();
    if(data.sample)return;
    const guidance=(message,connected=false)=>{
      const actions=element('div','fox-app-options');
      if(!connected)actions.append(button('Refresh',()=>showMoney(r),'module-connect'));
      if(r.key==='stripe'){
        if(!connected)actions.append(button('Connect Stripe',()=>connectStripe(r),'module-connect'));

      }else if(!connected)actions.append(button('Connect PayPal',()=>native.setup('connection',r.region,r.key),'module-connect'));
      foregroundActions(r,connected?null:actions,message);
    };
    try{
      const value=await loadMoney(native,r.key,cursor);
      if(moneyReads.get(r.key)!==generation||current!==r.moduleId)return;
      const records=cursor?[...(localStageRecords.get(r.key)||[]),...value.records]:value.records;
      localStageRecords.set(r.key,[...new Map(records.map(x=>[x.id,x])).values()]);moneyConnections.set(r.key,value.connected!==false);
      scene?.setAppStage?.(r.moduleId,{...appletStageData(r),connected:value.connected!==false,scope:value.scope,loadMore:value.next?()=>showMoney(r,value.next):null});
      guidance(value.connected===false?'Connect Stripe to read customer billing. The CLI sign-in may also update your terminal’s Stripe session.':'Choose a record to read it.',value.connected!==false);
    }catch(e){if(current!==r.moduleId||moneyReads.get(r.key)!==generation)return;quietAppletFailure(r,e,()=>showMoney(r,cursor));}
  }
  async function connectStripe(r){
    let pairing=false;
    try{
      let state=await native.stripe({operation:'configure',mode:'live'});
      if(state.authorizing){pairing=true;const actions=element('div','fox-app-options');actions.append(button('Cancel sign-in',()=>native.stripe({operation:'cancel'}),'module-connect'));foregroundActions(r,actions,'Approve Stripe in your browser.'+(state.verificationCode?' Pairing code: '+state.verificationCode:''));state=await native.stripe({operation:'complete'});}
    }catch{if(!pairing)return;}
    // The pairing prompt ends with the sign-in; a connected reader shows no guide.
    if(pairing&&foregroundGuide===r.moduleId){foregroundGuide=null;voice?.setGuide?.(null,{only:'applet:'+r.moduleId,forget:true});}
    if(current===r.moduleId)showMoney(r);
  }
  let vaultRead=0;
  async function showObsidian(r,operation='list'){
    const request=++vaultRead;
    content.hidden=true;hud.classList.remove('is-reading');appReader=null;
    scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));sceneState();
    if(data.sample)return;
    try{
      const value=await native.obsidianContent({operation});
      if(request!==vaultRead||current!==r.moduleId)return;
      localStageRecords.set(r.key,value.pages||[]);
      if(current!==r.moduleId)return;
      scene?.setAppStage?.(r.moduleId,{...appletStageData(r,value.pages||[]),connected:value.connected,scope:value.scope});
      const actions=element('div','fox-app-options');
      actions.append(button(value.connected?'Change vault':'Choose vault',()=>showObsidian(r,'choose'),'module-connect'));
      if(value.connected)actions.append(button('Disconnect vault',()=>showObsidian(r,'disconnect'),'module-connect'));
      foregroundActions(r,actions,value.connected?'Pick a note. I read Markdown files without changing them.':'Choose the folder you use as your Obsidian vault.');
    }catch(e){if(request===vaultRead&&current===r.moduleId){quietAppletFailure(r,e,()=>showObsidian(r,'list'));}}
  }
  let memoRead=0,memoPermissionPending=false,memoPermissionAttempted=false;
  window.addEventListener('worldlet:app-active',()=>{
    if(!memoPermissionPending||!root.isConnected)return;
    memoPermissionPending=false;
    const r=sections.find(s=>s.moduleId==='app-voice-memos');
    if(r&&current===r.moduleId)void showVoiceMemos(r,'connect');
  });
  async function showVoiceMemos(r,operation='list'){
    const request=++memoRead;content.hidden=true;hud.classList.remove('is-reading');appReader=null;
    scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));sceneState();
    if(data.sample)return;
    const guide=(text,connected=false)=>{const actions=element('div','fox-app-options');actions.append(button('Connect Voice Memos',()=>showVoiceMemos(r,'connect'),'module-connect'),button('Open permission settings',()=>showVoiceMemos(r,'permissions'),'module-connect'));if(memoPermissionAttempted&&!connected)actions.append(button('Restart Worldlet',()=>showVoiceMemos(r,'restart'),'module-connect'));actions.append(button(connected?'Change folder':'Choose recordings',()=>showVoiceMemos(r,'choose'),'module-connect'));if(connected)actions.append(button('Refresh',()=>showVoiceMemos(r),'module-connect'),button('Disconnect',()=>showVoiceMemos(r,'disconnect'),'module-connect'));foregroundActions(r,actions,text);};
    try{
      if(operation==='permissions'){memoPermissionPending=true;memoPermissionAttempted=true;}
      const value=await native.voiceMemos({operation});if(request!==memoRead||current!==r.moduleId)return;
      if(value.awaitingPermission){guide('Drag the selected '+(value.appName||'Worldlet')+' app from Finder into Full Disk Access and turn it on. This permits access to protected local files. Return here and I’ll retry automatically. Or choose an exported recordings folder instead.');return;}
      if(value.restarting)return;
      if(value.connected){memoPermissionPending=false;memoPermissionAttempted=false;}
      if(value.cancelled){showVoiceMemos(r);return;}
      localStageRecords.set(r.key,value.pages||[]);
      scene?.setAppStage?.(r.moduleId,{...appletStageData(r,value.pages||[]),connected:value.connected,scope:value.scope});
      guide(value.connected?'Pick a recording to listen. Files stay on this Mac.':'Connect Voice Memos to read recordings on this Mac. If access is blocked, open permission settings; I’ll locate this app for you. You can also choose an export folder.',value.connected);
    }catch(e){if(request!==memoRead||current!==r.moduleId)return;quietAppletFailure(r,e,()=>showVoiceMemos(r,'list'));}
  }
  // Messages (Mac): conversations come from chat.db behind Full Disk Access, and sending asks macOS to let
  // Worldlet control Messages. Opening the Applet says which permission is missing, with a button to the
  // exact System Settings pane, and checks again when the person comes back to Worldlet.
  let messagesRead=0,messagesPermissionPending=false,messagesPermissionAttempted=false;
  window.addEventListener('worldlet:app-active',()=>{
    if(!messagesPermissionPending||!root.isConnected)return;
    messagesPermissionPending=false;
    const r=sections.find(s=>s.moduleId==='app-messages');
    if(r&&current===r.moduleId&&content.hidden)void showMessages(r);
  });
  const newMessage=r=>openAppRecord(r,{id:'messages-new',title:'New message',newMessage:true});
  function messagesAccess(r,access){
    const actions=element('div','fox-app-options');
    actions.append(button('Open permission settings',()=>showMessages(r,'permissions',access),'module-connect'));
    if(access==='full-disk'&&messagesPermissionAttempted)actions.append(button('Restart Worldlet',()=>showMessages(r,'restart'),'module-connect'));
    if(access==='full-disk')actions.append(button('New message',()=>newMessage(r),'module-connect'));
    foregroundActions(r,actions,access==='automation'
      ?'To send, macOS needs to let Worldlet use Messages. Open permission settings, turn on Messages under Worldlet in Automation, then press Send again.'
      :'To show your conversations, Worldlet needs Full Disk Access, because macOS keeps Messages history there. Open permission settings, drag the selected '+(messagesAppName||'Worldlet')+' app into Full Disk Access and turn it on. I’ll check again when you come back. You can still send a new message without it.');
  }
  let messagesAppName='';
  async function showMessages(r,operation='list',access=''){
    const request=++messagesRead;
    if(operation==='list'){content.hidden=true;hud.classList.remove('is-reading');appReader=null;scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));sceneState();}
    if(data.sample)return;
    try{
      if(operation==='permissions'){messagesPermissionPending=true;if(access!=='automation')messagesPermissionAttempted=true;}
      const value=await native.messages({operation,...(access?{access}:{})});if(request!==messagesRead||current!==r.moduleId)return;
      if(value.restarting)return;
      if(value.awaitingPermission){messagesAppName=value.appName||messagesAppName;messagesAccess(r,value.awaitingPermission);return;}
      if(value.access==='missing'){const actions=element('div','fox-app-options');actions.append(button('New message',()=>newMessage(r),'module-connect'));foregroundActions(r,actions,'Messages is not set up on this Mac yet. Sign in to iMessage in the Messages app, then come back.');return;}
      if(value.access==='full-disk'){localStageRecords.set(r.key,[]);scene?.setAppStage?.(r.moduleId,{...appletStageData(r,[]),connected:false});messagesAccess(r,'full-disk');return;}
      messagesPermissionPending=false;messagesPermissionAttempted=false;
      localStageRecords.set(r.key,value.pages||[]);
      scene?.setAppStage?.(r.moduleId,{...appletStageData(r,value.pages||[]),connected:value.connected,scope:value.scope});
      const actions=element('div','fox-app-options');
      actions.append(button('New message',()=>newMessage(r),'module-connect'),button('Refresh',()=>showMessages(r),'module-connect'));
      foregroundActions(r,actions,'Pick a conversation to read and reply. Messages go out from your own Apple ID through Messages on this Mac. The first time you send, macOS asks to let Worldlet use Messages; choose OK.');
    }catch(e){if(request!==messagesRead||current!==r.moduleId)return;quietAppletFailure(r,e,()=>showMessages(r));}
  }
  // Presentation changes keep the Applet and its native selection intact. The switch is one of
  // the Applet's own controls in the top bar (#951, pixi-world.css): a capsule of two icon
  // buttons, the chosen view lit (owner decision 2026-10-03: the switch stays a capsule).
  function syncAppletMode(){
    let toggle=root.querySelector('.applet-mode-toggle');
    const r=sections.find(s=>s.moduleId===current);
    if(depth!=='object'||r?.fullView?.kind!=='scene'||!r.fullView.original||r.key==='obsidian'){toggle?.remove();return;}
    if(!toggle){
      toggle=element('div','applet-mode-toggle');toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Applet view');
      const nativeMode=button('',()=>{},'applet-mode-native'),webMode=button('',()=>{},'applet-mode-web');
      nativeMode.innerHTML=worldletMark();nativeMode.setAttribute('aria-label','Native');
      webMode.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg>';webMode.setAttribute('aria-label','Web');
      toggle.append(nativeMode,webMode);(root.querySelector('.applet-bar-controls')||root).append(toggle);
    }
    const web=!content.hidden&&content.dataset.template==='browser';
    const nativeButton=toggle.querySelector('.applet-mode-native'),webButton=toggle.querySelector('.applet-mode-web');
    nativeButton.setAttribute('aria-pressed',String(!web));webButton.setAttribute('aria-pressed',String(web));
    nativeButton.title='Native · '+r.title;webButton.title='Web · '+r.title;
    nativeButton.onclick=e=>{
      e.stopPropagation();if(!web)return;
      const previous=libraryWebReturn;libraryWebReturn=null;
      // Removing the browser viewport hides the page with its media paused and muted (browser-device.ts).
      content.replaceChildren();content.hidden=true;
      if(previous?.app.moduleId===r.moduleId&&previous.record)openAppRecord(r,previous.record);
      else showAppPanel(r);
    };
    webButton.onclick=e=>{
      e.stopPropagation();if(web)return;
      let url=r.fullView.original.url;
      if(appReader?.app.key===r.key){try{const u=new URL(appReader.record.url),base=new URL(url);const domains={notion:['notion.so','notion.com','notion.site'],gmail:['mail.google.com']}[r.key]||[base.hostname];if(u.protocol==='https:'&&!u.username&&!u.password&&domains.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))url=u.href;}catch{}}
      libraryWebReturn={app:r,record:appReader?.app.key===r.key?appReader.record:null};
      header(r.title,'Website',{applet:true});browserPanel.mount(r.key,{url,platform:r.fullView.original.platform||'web'});sceneState();
    };
  }
  // The person's own page or conversation Applet sits on the background painted for it on this computer, when there
  // is one (core/applets/MY-APPLETS.md#pictures); a website Applet shows the site itself.
  function ownBackground(r,element:HTMLElement){
    delete element.dataset.ownBackground;element.style.removeProperty('--own-applet-background');
    const kind=myAppletKind(r);if(!native?.appletArt||data.sample||(kind!=='page'&&kind!=='conversation'))return;
    void native.appletArt({operation:'get',applet:r.moduleId}).then(result=>{
      const background=result?.art?.background;
      if(current!==r.moduleId||!element.isConnected||typeof background!=='string'||!background.startsWith('data:image/'))return;
      element.style.setProperty('--own-applet-background',`url("${background}")`);element.dataset.ownBackground='';
    }).catch(()=>{});
  }
  function showAppPanel(r){
    if(r.key==='meetings'){showMeetings(r);return;}
    if(r.key==='weather'&&data.sample){content.hidden=true;hud.classList.remove('is-reading');appReader=null;scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));sceneState();return;}
    if(r.key==='weather'){header('Weather',undefined,{applet:true});content.dataset.template='weather';appReader=null;scene?.setAppStage?.(r.moduleId,{connected:true,items:[]});weatherPanel=createWeatherPanel({refresh:()=>environmentController.refresh(),locate:()=>environmentController.requestLocation()});weatherPanel.update(environmentController.weatherState);content.append(weatherPanel.element);sceneState();return;}
    // A game is built fresh on every open and is gone with the panel: nothing of it runs while closed.
    if(r.fullView?.kind==='game'){const game=createGameApplet(r.key,r.title);if(game){header(r.title,undefined,{applet:true});content.dataset.template='game';appReader=null;scene?.setAppStage?.(r.moduleId,{connected:true,items:[]});content.append(game.element);sceneState();return;}}
    const show=new Map<string,(r:any)=>void>([...WORK_APPLETS.map(key=>[key,showWork] as const),['voice-memos',r=>showVoiceMemos(r)],['messages',r=>showMessages(r)],['obsidian',r=>showObsidian(r)],...CURATED_READERS.map(key=>[key,r=>showCuratedSource(r)] as const),...MONEY_READERS.map(key=>[key,r=>showMoney(r)] as const)]).get(r.key);if(show){show(r);return;}

    const panelContext={native,content,notify,call:!data.sample&&native?.doorDash,ask:text=>voice?.ask(text),onChange:()=>scene?.refreshContent()};
    // An Applet Fox made for a moment (core/artifacts/README.md): one panel shows whichever is opened.
    if(r.moment&&native){
      let applet=appletPanels.get('moment');if(!applet){applet=createAppletPanel('moment',panelContext);appletPanels.set('moment',applet);}
      header(r.title,buildingFor(r.id)?.title||'World');content.querySelector('.notion-reader-head')?.remove();content.dataset.template='moment';content.append(applet.element);sceneState();
      applet.open({...r.moment,title:r.title,blurb:r.description,color:r.color});ownBackground(r,applet.element);dismissFox();return;
    }
    if(r.fullView?.kind==='panel'&&native){
      let applet=appletPanels.get(r.key);if(!applet){applet=createAppletPanel(r.panel||r.key,r.ongoing?{...panelContext,thing:r.ongoing}:panelContext);appletPanels.set(r.key,applet);}
      header(r.title,buildingFor(r.id)?.title||'World');content.querySelector('.notion-reader-head')?.remove();content.dataset.template=r.key;content.append(applet.element);sceneState();applet.show();ownBackground(r,applet.element);dismissFox();return;
    }
    if(r.fullView?.kind==='scene'){
      content.hidden=true;hud.classList.remove('is-reading');appReader=null;sceneStageApp=r.moduleId;
      scene?.setAppStage?.(r.moduleId,appletStageData(r,sampleStageRecords(r)));sceneState();
      if(native?.appContent&&!data.sample&&connectionLive(data.moduleConnections?.find(c=>c.provider===r.provider)||{})){
        void sourceReader.run(r.provider);
      }
      if(root.dataset.onboardingLocked!=='true'&&native?.setup&&!data.sample&&r.capability==='connect'&&!connectionLive(data.moduleConnections?.find(c=>c.provider===r.provider)))native.setup('connection',r.region,r.key);
      return;
    }

    if(r.fullView?.kind==='launcher'){
      appReader=null;content.hidden=true;sceneState();
      const website=()=>{header(r.title,'Applet',{applet:true});browserPanel.mount(r.key,{url:r.fullView.url,platform:'web'});sceneState();};
      if(!native?.launchApplet){website();return;}
      void native.launchApplet(r.key).then(result=>{
        if(current!==r.moduleId)return;
        if(!result?.opened)website();
      }).catch(()=>{if(current===r.moduleId)website();});
      return;
    }
    if(r.fullView?.kind==='web'){
      appReader=null;
      // A website made into an Applet is not in the catalog: it brings its own page.
      header(r.title,'Applet',{applet:true});browserPanel.mount(r.key,r.site?{url:r.fullView.url,platform:'web'}:{});sceneState();
      dismissFox();
      return;
    }
    const connectedStatus=appStatus(r,data.moduleConnections||[]);
    if(native?.appContent&&!data.sample&&(connectedStatus.state==='connected'||connectedStatus.connected)){
      header(r.title,'Applet',{applet:true});content.dataset.template='app';
      deviceInventory??=createAppDevice({root,call:native.appContent,openRecord:openAppRecord,onRecords(app,records){
        const link=data.moduleConnections?.find(c=>c.provider===app.provider);if(link){link.records=records;scene?.refreshContent();}saveRegions();
      }});
      sceneState();content.append(deviceInventory.element);deviceInventory.show(r,data.moduleConnections?.find(c=>c.provider===r.provider));dismissFox();return;
    }
    if(native.setup&&!data.sample){content.hidden=true;hud.classList.remove('is-reading');sceneState();if(!restoringWorld)native.setup('app',r.region,r.key);return;}
    const status=appStatus(r,data.moduleConnections||[]),appBody=element('section','fox-app-options');
    content.hidden=true;hud.classList.remove('is-reading');sceneState();
    const logo=appLogoSource(r);if(logo){const badge=element('img','app-brand');badge.src=logo;badge.alt=r.title;appBody.append(badge);}appBody.append(element('p','module-description',r.description));
    const note=data.sample?'No personal account is connected.':status.state==='connected'?'Your account is connected. Ask Fox to find or act on what you need.':'Your account is not connected. Connect when you are ready.';
    appBody.append(element('p','ui-caption',note));
    if(r.capability==='connect'&&!data.sample)appBody.append(button('Connect '+r.title,async()=>{try{await native.connect(r.provider,r.region);}catch(e){notify(e.message);}},'module-connect'));
    else appBody.append(element('p','app-availability',r.capability==='planned'?'Connection support is being prepared.':'Connect your account in your personal Mac world.'));
    appBody.append(element('p','ui-caption','Applets supply context. Your matters bring related information together across applets.'));
    const related=sections.filter(m=>m.entity==='matter'&&m.region===r.region);if(related.length){appBody.append(element('h3','',data.sample?'Matters nearby':'Matters nearby'));for(const m of related)appBody.append(button(m.title,()=>visitObject(m.moduleId),'world-action-row'));}
    foregroundActions(r,appBody);
  }
  const originalRetryCounts=new Map();const originalRetryTimers=new Set<ReturnType<typeof setTimeout>>();
  window.addEventListener('pagehide',()=>{for(const timer of originalRetryTimers)clearTimeout(timer);originalRetryTimers.clear();},{once:true});
  function readerFailed(body,error,retry){
    if(!body.isConnected||content.hidden)return;
    const selected=appReader,provider=selected?.app.provider,action=sourceReadAction(error);
    const saved=selected&&[...pages.values()].find(p=>p.worldItemId===selected.record.worldItemId);
    body.replaceChildren(...(saved?[renderMarkdown(attentionBrief(saved),{title:saved.title,path:'attention.md'})]:[]));
    if(provider)setSourceIssue(provider,action);
    if(action)return;
    const key=provider+':'+(selected?.record.id||current),attempt=(originalRetryCounts.get(key)||0)+1;originalRetryCounts.set(key,attempt);
    const timer=setTimeout(()=>{originalRetryTimers.delete(timer);if(body.isConnected&&!content.hidden&&appReader===selected)retry();},readRetryDelay(attempt));originalRetryTimers.add(timer);
  }
  function openAppRecord(app,record){
    if(!data.sample)window.dispatchEvent(new CustomEvent('worldlet:product-event',{detail:{event:'content_opened',applet:app.key,trigger:restoringWorld?'background':eventTrigger()}}));
    memoReader?.dispose();memoReader=null;messagesReader?.dispose();messagesReader=null;libraryReadContext=null;delete content.dataset.tennis;
    scene?.setFocusItem?.(app.moduleId,record.presentation||{id:record.id,title:record.title,context:'',curated:!!record.worldItemId});appReader={app,record};content.dataset.applet=app.key;header(record.title,app.title+(app.key==='weather'?' · Forecast':app.key==='messages'?(record.newMessage?'':' · Conversation'):record.worldItemId?' · Saved item':' · Original'));content.dataset.template='app-source';content.dataset.sourceId=record.sourceId||record.id;
    if(app.key==='messages'&&!data.sample){messagesReader=createMessagesReader({call:body=>native.messages(body),record:{chat:record.newMessage?'':record.id,title:record.title},onChange:()=>nativeHUD?.sync(),onNeedsAccess:access=>messagesAccess(app,access),onSent:()=>{if(foregroundGuide===app.moduleId){foregroundGuide=null;voice?.setGuide?.(null,{forget:true});}}});content.append(messagesReader.element);messagesReader.focus();
    }else if(app.key==='voice-memos'&&!record.localOriginal){memoReader=createVoiceMemoReader({call:body=>native.voiceMemos(body),record:{...record,sampleText:data.sample?(pages.get(record.id)?.markdown||pages.get(record.id)?.text):''},sample:!!data.sample,onChange:()=>nativeHUD?.sync()});content.append(memoReader.element);
    }else if(app.key==='weather'&&!record.localOriginal){const body=element('div','app-source-body weather-day-detail');const glyph=element('div','weather-day-icon');glyph.innerHTML=weatherGlyph(record.presentation?.weatherCode);body.append(glyph,renderMarkdown(record.text,{title:record.title,path:'forecast.md'}),element('p','ui-caption','Forecast by Open-Meteo · Temperatures in °C'));content.append(body);acknowledgeAttention(record);libraryReadContext='Weather forecast: '+record.title+'\n'+record.text;nativeHUD?.sync();
    }else if(ORIGINAL_READERS.includes(app.key)&&!data.sample&&!record.localOriginal){
      // Retries reload only the original; the open itself (analytics, focus) happened once.
      const body=element('div','app-source-body');content.append(body);
      const load=()=>{const request=++originalRequest;body.replaceChildren(element('p','ui-caption','Reading original…'));
      const readers=new Map<string,()=>Promise<any>>([['notion',()=>native.notionContent({operation:'fetch',id:record.id})],['obsidian',()=>native.obsidianContent({operation:'read',id:record.id})],...MONEY_READERS.map(key=>[key,()=>readMoneyItem(native,app,record)] as const),...CURATED_READERS.map(key=>[key,()=>native.curatedSourceContent({provider:app.key,operation:'read',id:record.id}).then(curatedOriginal)] as const)]);
      const read=readers.get(app.key)();
      read.then(value=>{if(request!==originalRequest||!body.isConnected)return;const page=value.page||value;if(typeof (page.markdown??page.text)!=='string')throw Error(value.error||'Original is unavailable.');sourceIssues.delete(app.provider);publishSourceIssues();originalRetryCounts.delete(app.provider+':'+record.id);libraryReadContext='Read-only '+app.title+' original: '+(page.title||record.title)+'\nSource: '+record.id+'\n'+String(page.markdown??page.text??'').slice(0,8000);nativeHUD?.sync();body.replaceChildren(page.table?renderCuratedTable(page.table):renderMarkdown(MONEY_READERS.includes(app.key)?String(page.text||'').replaceAll('\n','\n\n'):page.markdown??page.text??'',{title:page.title||record.title,path:page.path||'original.md'}));acknowledgeAttention(record);if(page.notice||page.partial)body.prepend(element('p','ui-caption',page.notice||'Some blocks are not available here. Open Notion on the web to see the complete page.'));}).catch(e=>{if(request===originalRequest)readerFailed(body,e,load);});};load();
    }else if(data.sample&&record.noteId&&pages.has(record.noteId)){
      // The sample's original is the note the item was read from. Opening it reads
      // the item, the way opening a real original would.
      const note=pages.get(record.noteId),body=element('div','app-source-body');if(note.id==='sample-tennis-plan'){content.dataset.tennis='true';body.append(tennisCard(note,renderMarkdown));}else{delete content.dataset.tennis;body.append(app.key==='gmail'?renderMailFocus({title:record.title,text:note.markdown,displayTitle:record.presentation?.curated?record.presentation.title:undefined,summary:record.presentation?.curated?record.presentation.summary:undefined},renderMarkdown):renderHomeFocus(app.key,{text:note.markdown,title:note.title},record,renderMarkdown));}content.append(body);
      libraryReadContext='Fictional '+app.title+' record. Source: '+note.id+'\n'+note.title+'\n'+String(note.markdown||note.text||'').slice(0,8000);
      for(const p of pages.values())if(p.worldItemId===record.worldItemId){read.add(p.id);if(p.worldItemKind==='update'&&p.worldItemStatus==='open')settleSampleItem(p.worldItemId,'read');}
      try{localStorage.setItem(readKey,JSON.stringify([...read]))}catch{}nativeHUD?.sync();
    }else{
      const body=element('div','app-source-body');content.append(body);
      const load=()=>{const request=++originalRequest;body.replaceChildren(element('p','ui-caption','Loading original…'));
      native.original(record.sourceId||record.id).then(value=>{if(request!==originalRequest||!body.isConnected)return;if(typeof value.text!=='string')throw Error(value.error||'Original is unavailable.');sourceIssues.delete(app.provider);publishSourceIssues();originalRetryCounts.delete(app.provider+':'+record.id);body.replaceChildren(app.key==='gmail'?renderMailFocus({...value,title:record.title,displayTitle:record.presentation?.curated?record.presentation.title:undefined,summary:record.presentation?.curated?record.presentation.summary:undefined},renderMarkdown):renderHomeFocus(app.key,value,record,renderMarkdown));libraryReadContext='Selected original. Source: '+(record.sourceId||record.id)+'\n'+value.title+'\n'+String(value.text||'').slice(0,8000);for(const p of pages.values())if(p.sourceId===(record.sourceId||record.id)){read.add(p.id);}acknowledgeAttention(record);try{localStorage.setItem(readKey,JSON.stringify([...read]))}catch{}nativeHUD?.sync();}).catch(e=>{if(request===originalRequest)readerFailed(body,e,load);});};load();
    }
    sceneState();
  }
  function showModulePanel(id){
    const r=sections.find(s=>s.moduleId===id);if(!r)return;
    if(currentSpace!==r.id||depth!=='object'){current=id;currentSpace=r.id;depth='object';searching=false;scene?.focus(id,'object');sceneState();}
    if(r.entity==='app'){showAppPanel(r);return;}
    if(!r.children.some(id=>pages.has(id))){content.hidden=true;hud.classList.remove('is-reading');sceneState();const body=element('section','fox-app-options');body.append(button('Add local content',()=>native.setup('sources',r.region,r.moduleKey),'module-connect'));foregroundActions(r,body,'There are no records here yet. Add something or ask me to help.');return;}
    const status=moduleStatus(r,pages,!!data.sample,data.moduleConnections||[]);
    header(r.title,(buildingFor(r.id)?.title||'World')+' / '+status.label);content.dataset.template='module';
    content.append(element('p','module-description',r.description));
    if(r.entity==='matter'){const origins=[...new Set(r.children.flatMap(id=>(pages.get(id)?.provenance||[]).map(v=>v.provider)))];if(origins.length)content.append(element('p','matter-sources','Sources · '+origins.join(' · ')));}
    const badge=element('p','module-state',status.label);badge.dataset.state=status.state;content.append(badge);
    const ids=r.children.filter(id=>pages.has(id));
    if(r.moduleKey==='browser')content.append(button('Open X',()=>{header('Browser','Library');browserPanel.mount();sceneState();},'module-connect'));
    // Empty modules returned above, so there is always at least one record.
    const list=element('div','module-records');for(const id of ids)list.append(pageLink(pages.get(id)));content.append(list);
    if(data.sample)content.append(element('p','ui-caption','Fictional records, organized around this matter. No accounts are connected.'));
    content.append(button('Manage sources',()=>{content.hidden=true;sceneState();native.setup('sources',r.region,r.moduleKey);},'module-connect'));
    nativeHUD?.sync();
  }
  function header(title: string,meta?: string,{applet=false}: {applet?: boolean}={}){delete content.dataset.sourceId;deviceInventory?.hide();content.dataset.template='document';content.hidden=false;content.replaceChildren(root.querySelector('.world-context'));hud.classList.add('is-reading');$('notionBack').hidden=false;$('notionWorldTitle').hidden=true;const h=element('div','notion-reader-head');if(!applet)h.append(element('p','notion-eyebrow',meta),element('h1','',title));const close=button('×',back,'notion-close');close.setAttribute('aria-label','Close details');h.append(close);content.append(h);breadcrumbs();content.setAttribute('role','region');content.setAttribute('aria-label',title);h.tabIndex=-1;if(document.activeElement!==$('notionInput'))h.focus({preventScroll:true});}
  function pageLink(p){const row=button('',()=>open(p.id),'notion-page-link');row.append(...(data.matterCatalog?[]:[element('span','notion-page-glyph',p.table?'▦':'▤')]),element('span','',p.title),element('small','',p.table?p.table.rows.length+' rows':p.children.length?p.children.length+' subpages':'↗'));row.dataset.target=p.id;return row}
  function resolve(raw,page){if(raw.startsWith('#note=')&&pages.has(raw.slice(6)))return {page:raw.slice(6)};const href=raw;if(/^https?:\/\//i.test(href)){const match=href.match(/([a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})/i);if(/https?:\/\/(?:www\.|app\.)?notion\.(so|com)\//i.test(href)&&match&&pages.has(match[1].replaceAll('-','')))return {page:match[1].replaceAll('-','')};return {external:raw};}if(/^[a-z][a-z\d+.-]*:/i.test(href)||href.startsWith('//'))return {};const decoded=new URL(href,'https://local/'+page.path.split('/').map(encodeURIComponent).join('/')).pathname.slice(1);let path;try{path=decodeURIComponent(decoded)}catch{path=decoded}const id=byPath.get(path);if(id)return {page:id};if(assetPaths.has(path))return {asset:'/local-source/files/'+path.split('/').map(encodeURIComponent).join('/')};return {missing:raw,excluded:excludedPaths.has(path)};}
  // `p` names the page the Markdown belongs to: its title (a matching leading H1 is dropped) and path (relative links resolve against it).
  function renderMarkdown(markdown,p?:{title?:string;path?:string;localArchive?:boolean}){p={...p,title:p?.title||'',path:p?.path||'page.md'};const article=element('article','notion-prose');
    const lines=markdown.split('\n');let start=lines[0]?.startsWith('# ')?1:0;while(lines[start]==='')start++;let end=start;while(/^[^:\n]{1,48}: .+/.test(lines[end]||''))end++;
    if(end>start&&lines.slice(start,end).some(l=>/^(Created time|Last edited time|AI summary):/.test(l))){const details=element('details','notion-properties');details.append(element('summary','','Original properties'));const dl=element('dl');for(const line of lines.slice(start,end)){const split=line.indexOf(':');dl.append(element('dt','',line.slice(0,split)),element('dd','',line.slice(split+1).trim()))}details.append(dl);article.append(details);lines.splice(start,end-start);markdown=lines.join('\n')}
    markdown=markdown.replace(/\[\[([^\]\n]+)\]\]/g,(full,title)=>{const matches=[...pages.values()].filter(p=>p.title.toLocaleLowerCase()===title.toLocaleLowerCase());return matches.length===1?'['+title+'](#note='+matches[0].id+')':full;});
    const clean=DOMPurify.sanitize(marked.parse(markdown) as string,{ALLOWED_TAGS:['p','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','del','s','a','img','blockquote','pre','code','hr','br','table','thead','tbody','tr','th','td','details','summary','input','figure','figcaption','span','div'],ALLOWED_ATTR:['href','src','alt','title','type','checked','disabled','start','colspan','rowspan'],RETURN_DOM_FRAGMENT:true});
    // Resolve resources before inserting anything into the live document.
    for(const img of clean.querySelectorAll('img')){const resolved=resolve(img.getAttribute('src')||'',p);if(resolved.asset){img.src=resolved.asset;img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(element('p','notion-attachment-missing','Attachment unavailable: '+(img.alt||'')))}else{img.replaceWith(element('span','notion-attachment-missing',resolved.excluded?'This image exceeds the preview size limit. View it in Notion.':resolved.external?'External image (not included in export)':p.localArchive?'This attachment is in the local export but is not loaded in this view.':'Attachment not included in export'))}}
    for(const a of clean.querySelectorAll('a')){const resolved=resolve(a.getAttribute('href')||'',p);a.removeAttribute('href');if(resolved.page){a.href='#note='+resolved.page;a.onclick=e=>{e.preventDefault();open(resolved.page)}}else if(resolved.asset){a.href=resolved.asset;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('download','');if(/\.(mp4|webm|mov|mp3|m4a|ogg|wav)$/i.test(resolved.asset)){const media=element(/\.(mp4|webm|mov)$/i.test(resolved.asset)?'video':'audio');media.controls=true;media.preload='none';media.src=resolved.asset;media.setAttribute('aria-label',a.textContent);a.before(media)}}else if(resolved.external){a.href=resolved.external;a.target='_blank';a.rel='noopener noreferrer'}else{a.className='notion-attachment-missing';a.title=resolved.excluded?'This attachment exceeds the preview size limit. View it in Notion.':'This link target is not included in the local export.';if(resolved.excluded)a.append(element('small','',' · Not loaded'))}}
    for(const input of clean.querySelectorAll('input')){input.type='checkbox';input.disabled=true;input.closest('li')?.classList.add('notion-check-item');input.setAttribute('aria-label',input.closest('li')?.textContent?.trim()||'Checklist item');}
    for(const table of clean.querySelectorAll('table')){const scroll=element('div','reader-table');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Table · Scroll horizontally');table.before(scroll);scroll.append(table);}
    // Page title is already rendered by the persistent reader header.
    const first=clean.firstElementChild;if(first?.tagName==='H1'&&first.textContent===p.title)first.remove();article.append(clean);return article;}
  function renderTable(p){const holder=element('section','notion-database');const bar=element('div','notion-db-bar'),input=element('input');input.type='search';input.placeholder='Filter this table…';input.setAttribute('aria-label','Filter records');const total=element('span');bar.append(input,total);holder.append(bar);const viewport=element('div','notion-table-wrap');viewport.tabIndex=0;viewport.setAttribute('aria-label',p.title+'，Full table · Scroll horizontally');const table=element('table'),thead=element('thead'),tr=element('tr');for(const c of p.table.columns)tr.append(element('th','',c));thead.append(tr);table.append(thead);const tbody=element('tbody');table.append(tbody);viewport.append(table);holder.append(viewport);const footer=element('div','notion-table-pager');holder.append(footer);
    function draw(){const rows=p.table.rows.filter(r=>!query||r.join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));total.textContent=`${rows.length} / ${p.table.rows.length} rows`;tbody.replaceChildren();for(const row of rows){const tr=element('tr');row.forEach((v,i)=>{const td=element('td');const title=v.replace(/\s*\([^)]*\)\s*$/,'');const child=p.children.map(id=>pages.get(id)).find(c=>c.title===title||c.title===v);if(i===0&&child)td.append(button(v,()=>open(child.id),'notion-cell-link'));else td.textContent=v;tr.append(td)});tbody.append(tr)}footer.hidden=!!rows.length;footer.replaceChildren(element('span','','No matching records'))}input.oninput=()=>{query=input.value;draw()};draw();return holder;}
  function renderPage(){const p=pages.get(current);if(p.webApp?.kind==='x'){header(p.title,'Reading terminal');browserPanel.mount();return;}header(p.title,p.localArchive?'Notion Original export · Local, read-only':data.sample?(p.projectStatus?'Project · '+p.projectStatus:'Explore freely'):native?(p.intentId?'My intents / wishes':p.sourceId?(p.pending?'Local original · Not yet organized':'Sources & knowledge'):'Personal knowledge'):p.virtual?'NOTION / COLLECTION':p.kind==='database'?'NOTION / DATABASE':'NOTION / NOTE');if(p.provenance?.length){const refs=element('details','world-provenance');refs.append(element('summary','','Source · '+p.provenance.map(r=>r.provider).join(' / ')));for(const ref of p.provenance)refs.append(element('p','',ref.label));content.append(refs);}const template=detailTemplate(p);content.dataset.template=template?.element.dataset.template||'document';if(template)content.append(template.element);if(p.table)content.append(renderTable(p));if(p.markdown?.trim()&&!template?.replaceMarkdown)content.append(renderMarkdown(p.markdown,p));
    if(native&&p.sourceId&&!nativeHUD)content.append(button('View local original',async()=>{try{const original=await native.original(p.sourceId);const body=dialog(original.title);body.append(element('pre','private-original',original.text))}catch(e){notify(e.message)}}));
    if(p.children.length){const children=element('section','notion-children');children.append(element('h2','',`${p.virtual?'Notes':'Subpages'} · ${p.children.length}`));const list=element('div');children.append(list);const more=button('Explore further',()=>{catalogOffset+=30;drawChildren()});function drawChildren(){list.replaceChildren(...p.children.slice(0,catalogOffset+30).map(id=>pageLink(pages.get(id))));more.hidden=catalogOffset+30>=p.children.length}drawChildren();children.append(more);content.append(children)}
    if(!p.table&&!p.markdown?.trim()&&!p.children.length)content.append(element('p','notion-empty','This note has no body text.'));
    if(p.virtual){content.scrollTop=0;return}if(p.url){const source=element('a','notion-original','Open original in Notion ↗');source.href=p.url;source.target='_blank';source.rel='noopener noreferrer';content.append(source);}content.scrollTop=0;nativeHUD?.decorateReader();}
  function showSearch(text: string,{offset:restoredOffset=0,scroll=0}: {offset?: number;scroll?: number}={}){query=text;searching=true;current=null;currentSpace=null;depth='search';scene?.focus('overview');sceneState();header(text?'Search “'+text+'”':'All notes','NOTION / SEARCH');const searchForm=element('form','world-note-search'),searchInput=element('input'),searchButton=element('button','','Search');searchInput.type='search';searchInput.value=text;searchInput.placeholder='Search notes…';searchInput.setAttribute('aria-label','Search notes');searchButton.type='submit';searchForm.append(searchInput,searchButton);searchForm.onsubmit=e=>{e.preventDefault();showSearch(searchInput.value)};content.append(searchForm);const terms=text.toLocaleLowerCase().split(/\s+/).filter(Boolean);const matches=searchNotes(pages,text);content.append(element('p','notion-search-count',`${matches.length}  matches · Titles and full text`));const list=element('div','notion-search-results');content.append(list);let offset=restoredOffset;const more=button('Show more',()=>{offset+=30;draw()});function draw(){searchOffset=offset;list.replaceChildren();for(const p of matches.slice(0,offset+30)){const row=pageLink(p);const wrap=element('div');wrap.append(row,element('small','notion-result-path',trails(p.id).map(a=>a.title).join(' / ')));if(text){const at=p.text.toLocaleLowerCase().indexOf(terms[0]);wrap.append(element('p','notion-result-excerpt',p.text.slice(Math.max(0,at-35),Math.max(0,at-35)+140)))}list.append(wrap)}more.hidden=offset+30>=matches.length}draw();content.append(more);content.scrollTop=scroll;}
  const worldState=()=>({...(attentionPage?{attention:{id:attentionPage.worldItemId,title:attentionPage.title,summary:attentionPreviewData(attentionPage).summary}}:{}),depth,id:current,title:pages.get(current)?.title||buildings.find(b=>b.id===current)?.title||objectFor(current)?.title||'My world',place:depth==='building'?buildingFor(current)?.rooms[0]:depth==='area'?null:currentSpace});
  function contentChanged(change){
    const p=pages.get(change.id),place=change.place||(p?sectionFor(change.id):currentSpace);
    scene?.refreshContent(place);
    if(p)open(p.id);else if(place)visitSpace(place,'shelf');else home();
  }
  const executeWorld=createWorldTools({pages,sections,state:worldState,home,back,next,visitSpace,open,sectionFor,contentStore,onChange:contentChanged,
    scrollBrowser:direction=>!content.hidden&&content.dataset.template==='browser'&&native?.browser?native.browser.command('scroll',{direction},true):{error:'Open an Applet website first.'},
    contextTree:()=>({...data.sample&&data.persona?{profile:{...data.persona,sourceId:data.profilePageId,fictional:true}}:{},areas:areas.map(a=>({id:a.id,title:a.title})),buildings:buildings.map(b=>({id:b.id,title:b.title,rooms:b.rooms})),objects:sections.flatMap(r=>objectsFor(r).map(o=>({id:o.id,title:o.title,room:r.id,notes:o.pageIds})))}),
    visitContext:id=>{if(areas.some(a=>a.id===id))visitArea(id);else if(buildings.some(b=>b.id===id))visitBuilding(id);else if(sections.some(r=>r.id===id))visitSpace(id);else if(objectFor(id))visitObject(id);else return {error:'Unknown context ID. Inspect the world first.'};return {ok:true,current:worldState()};},
    actionList:()=>nativeHUD?.availableActions()||[],runAction:(id,meta)=>{if(!meta.request||!nativeHUD?.availableActions().some(a=>a.id===id))return {error:'Action is not available in the current context.'};return nativeHUD.run(id);}});
  const practiceWalkthrough=data.sample?createPracticeWalkthrough({root,scene:()=>scene,home,storage:native?.storage||localStorage,show:value=>{voice?.setGuide?.(value);voice?.revealGuide?.();}}):null;
  // One question at most, before the last step (owner decision 2026-10-03). The tool runtime
  // refuses navigation that could carry data out before it reaches the page, and marks clicks
  // and submits after untrusted content (meta.effectCheck). Opening, reading, filling and other
  // clicks run directly. A click or Enter that pays, sends, submits, books, grants access or
  // deletes (browserFinalStep) waits for the person's Go ahead here; that tap is also their
  // confirmation of the result, so once Fox has checked the result page a linked task is
  // settled without asking again. The site's own "Are you sure?" button for that step runs on
  // the same Go ahead (browserFollowThrough), so a two-page cancellation asks once.
  // Keep the tool-navigation marker for an open that runs after an await.
  const asToolNavigation=<T,>(run: ()=>T)=>{const previous=toolNavigation;toolNavigation=true;try{return run();}finally{toolNavigation=previous;}};
  const FINAL_STEP='browser-final-step';
  // The last step the person just went ahead with (browserFollowThrough).
  let approvedStep: {label:string;url:unknown;taskId?:string;at:number}|null=null;
  function confirmFinalStep(label: string,url: unknown,signal?: AbortSignal){
    return new Promise<boolean>(resolve=>{
      if(signal?.aborted||!voice?.setGuide){resolve(false);return;}
      let site='';try{site=new URL(String(url)).hostname.replace(/^www\./,'');}catch{}
      // Page text never formats the question.
      const shown=label.replace(/[*_`[\]<>\\]/g,'').trim()||'this step';
      let settled=false;
      const finish=(value: boolean)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',stop);voice?.setGuide?.(null,{only:FINAL_STEP,forget:true});resolve(value);};
      const stop=()=>finish(false);
      const timer=setTimeout(stop,10*60_000);
      signal?.addEventListener('abort',stop,{once:true});
      voice.setGuide({source:FINAL_STEP,takeover:true,text:'Last step: **'+shown+'**'+(site?' on '+site:'')+'. This can’t be taken back. Go ahead?',
        actions:[button('Go ahead',()=>finish(true)),button('Not now',()=>finish(false))]});
      voice.revealGuide?.();
    });
  }
  // The person went ahead with this step. The host reads the result page again and refuses
  // without a fresh inspection, or when the linked task changed since the attempt.
  async function settleConfirmedStep(receipt: any){
    if(!receipt?.inspectedAt||!native?.browserOutcome||data.sample)return receipt;
    try{
      const settled=await native.browserOutcome(receipt.id,true);
      if(typeof settled?.taskID==='string'){
        // Same signal as the card's own Done, so a first task still earns its first win.
        root.dispatchEvent(new CustomEvent('worldlet:attention-settled',{detail:{id:settled.taskID,status:'done'},cancelable:true}));
        nativeHUD?.sync();
      }
      return settled||receipt;
    }catch{return receipt;}
  }
  async function automateBrowser(args: any,meta: any={}){
    if(args.operation==='receipts')return browserPanel.automate(args);
    // While Fox helps with a saved task, its consequential steps belong to that task, so the
    // person's Go ahead at the last step settles it (and a first task earns its first win).
    if(helpingTask&&!args.taskId&&['click','submit'].includes(args.operation))args={...args,taskId:helpingTask};
    if(!['open','receipts','outcome'].includes(args.operation))helpNarrator?.acting();
    // Fox's page in the task picture-in-picture window stays Fox's; pages it opens load there (#1175),
    // as they do in Fox's copy of the page in view (FOX_COPY), leaving the person's page as it is.
    if(!browserPanel.inTaskPicture()&&!browserPanel.foxCopy()&&(args.operation==='open'||content.hidden||content.dataset.template!=='browser')){
      if(args.operation==='open'){if(!asToolNavigation(()=>openWorldURL(args.url)))return {error:'Choose a valid HTTPS page.'};}
      else return {error:'No browser panel is open. Use the open browser action with the requested HTTPS URL before inspecting or interacting.'};
    }
    if(meta.signal?.aborted)return {error:'Task stopped.'};
    let confirmed=false,approval: {label:string;url:unknown;taskId?:string}|null=null;
    if(['click','submit'].includes(args.operation)){
      const prepared=await browserPanel.automate({...args,operation:'prepare',intent:args.operation});
      if(!prepared?.ok)return prepared;
      const step=browserFinalStep({operation:args.operation,prepared,untrusted:meta.effectCheck===true});
      // The site's "Are you sure?" button after a Go ahead finishes the same step: no second question.
      if(step.confirm&&browserFollowThrough({approved:approvedStep,operation:args.operation,prepared,taskId:args.taskId,now:Date.now()})){approvedStep=null;confirmed=true;}
      else if(step.confirm){
        approvedStep=null;
        if(!voice?.setGuide){const decision=browserEffectDecision({operation:args.operation,prepared});return {error:decision.allowed?'Not done: “'+step.label+'” is a last step the person confirms, and they cannot be asked here. Nothing was clicked.':decision.error};}
        if(!await confirmFinalStep(step.label,prepared.url,meta.signal))
          return meta.signal?.aborted?{error:'Task stopped.'}:{error:'Not done: the person chose not to “'+step.label+'” now, and nothing was clicked. Do not try it again; tell them what is ready and that they can finish it themselves.'};
        confirmed=true;
        approval={label:step.label,url:prepared.url,taskId:args.taskId};
      }
      if(meta.signal?.aborted)return {error:'Task stopped.'};
    }
    const result=await browserPanel.automate(args);
    if(approval&&!result?.error)approvedStep={...approval,at:Date.now()};
    if(result?.receipt && result.receipt.status==='unverified'){
      const inspected=['click','submit'].includes(args.operation)?await inspectBrowserOutcome(value=>browserPanel.automate(value),result.receipt.id,meta.signal):result;
      let receipt=inspected.receipt||result.receipt;
      if(confirmed&&!meta.signal?.aborted)receipt=await settleConfirmedStep(receipt);
      if(!meta.signal?.aborted)window.dispatchEvent(new CustomEvent('worldlet:browser-outcome',{detail:{receipt,observation:inspected.observation}}));
      const settled=receipt.status!=='unverified';
      return {...result,...inspected,receipt,outcome:settled?'confirmed':'unverified',guidance:settled
        ?'The person went ahead with this step and the result page was checked'+(receipt.taskID?', so the linked task is marked done':'')+'. State the result and its evidence from the page; if the page shows it did not work, say so plainly. Do not mention receipts. Never repeat the submission.'
        :'Submission was attempted. The page is evidence, not proof of completion. State the result and its evidence; do not mention receipts or pending actions, and do not ask the person to confirm it. Never repeat the submission just because the result is uncertain.'};
    }
    return result;
  }
  // The same tool surface Fox uses, reachable from a check: it says whether a
  // failed answer was the model's or the world's.
  window.worldletExecute=(name,args={},meta={})=>execute(name,args,meta);
  // Shared by all Chromium hosts; replaces coordinate guesses for canvas objects.
  (window as any).worldletUI=createWorldUI(()=>({version:1,
    context:{id:current||'overview',title:worldState().title,depth},
    targets:[...buildings.map(b=>({id:b.id,label:b.title,kind:'region' as const})),
      ...sections.map(r=>({id:r.moduleId,label:r.title,kind:'applet' as const}))]
  }),command=>command.action==='activate'
    ? execute('visit_context',{id:command.id})
    : execute('move_view',{direction:command.action}));

  const executeAction=(name: string,args: any,meta?: any)=>{if(name==='show_artifact'){const tooLong=artifactFitProblem(args);if(tooLong)return {error:tooLong};const id=artifactId();if(DAILY_ARTIFACT.test(String(args.title||'')))return showDailyInJournal({id,kind:'answer',title:args.title,body:args.body,brief:args.brief||undefined,detail:args.detail||undefined,chart:args.chart||null,actions:args.actions||[],blocks:args.blocks||[],tone:args.tone||undefined,art:args.art||undefined,size:args.size||'large',origin:{type:'conversation',place:current||'world'}});return showArtifact({...args,id},{id,kind:'answer',title:args.title,body:args.body,brief:args.brief||undefined,detail:args.detail||undefined,chart:args.chart||null,actions:args.actions||[],blocks:args.blocks||[],tone:args.tone||undefined,art:args.art||undefined,origin:{type:'conversation',place:current||'world'}});}
   if(name==='open_artifact')return openArtifact(String(args.id||''));
   if(name==='list_artifacts'){if(!native?.artifacts)return {artifacts:[],scope:'The practice world keeps no artifacts.'};return Promise.resolve(native.artifacts({operation:'list'})).then(r=>({artifacts:findArtifacts((r?.artifacts||[]).map(readArtifact).filter(Boolean),args.query||'',args.limit||12)}));}if(['run_practice_iteration','practice_applet'].includes(name))return practiceWalkthrough?practiceWalkthrough.execute(name,args,meta):{error:'Only available in the practice world.'};if(name==='customize_companion'){if(!data.sample)return {error:'This control belongs to the practice world.'};const name=String(args.name||'').trim();if(!name||name.length>24||!['idle','happy','waving','sleeping'].includes(args.expression))return {error:'Choose a short name and an available expression.'};window.dispatchEvent(new CustomEvent('worldlet:companion-appearance',{detail:{name,expression:args.expression}}));return {ok:true,name,expression:args.expression};}if(data.sample&&['delegate_codex','list_codex_tasks','read_codex_task','show_codex_task'].includes(name))return practiceCoding(name,args);if(name==='manage_weather_location')return environmentController.manageLocation(args,meta?.signal);if(name==='set_scene_lighting')return environmentController.setSceneLighting(args.lighting);if(name==='set_scene_weather')return environmentController.setSceneWeather(args.weather);if(name==='prepare_email')return preparePracticeEmail(args);const panelTool=PANEL_TOOLS.get(name);if(panelTool){const [key,title]=panelTool;if(current!=='app-'+key||content.hidden)visitObject('app-'+key);return appletPanels.get(key)?.agent(args)||{error:title+' is unavailable.'};}if(name==='review_email_drafts'){window.dispatchEvent(new Event('worldlet:email-drafts'));return {ok:true,status:'user_review'};}if(name==='review_notion_drafts'){window.dispatchEvent(new Event('worldlet:notion-reviews'));return {ok:true,status:'user_review'};}if(name==='manage_companion_memory'){window.dispatchEvent(new Event('worldlet:memory-manager'));return {ok:true,status:'user_review',guidance:'Memory management opened. The user makes changes directly.'};}if(name==='automate_browser')return automateBrowser(args,meta);if(name==='browse_web'){if(['records','record'].includes(args.operation)){if(data.sample)return {visits:[],scope:'The practice world records no browsing.'};return browserPanel.agent(args);}if(args.operation==='history'){if(data.sample)return {items:[],scope:'Practice world has no personal browsing history. Use find_content for authored history notes.'};return browserPanel.agent(args);}if(args.operation==='open'){if(!openWorldURL(args.url))return {error:'Use a valid HTTPS website URL.'};return browserPanel.agent(args);}if(['outline','focus'].includes(args.operation)&&(content.hidden||content.dataset.template!=='browser'))return {error:'Open the website first: Focus rules are for the site open in a website Applet.'};if(data.sample&&args.operation==='saved'){const terms=String(args.query||'').toLowerCase().split(/\s+/).filter(Boolean);const records=[...pages.values()].filter(p=>['sample-web-research-history','sample-web-shoes-history'].includes(p.id)&&terms.every(t=>(p.title+' '+p.markdown).toLowerCase().includes(t)));return {ok:true,fictional:true,results:records.map(p=>({id:p.id,title:p.title,text:p.markdown,url:p.markdown.match(/^URL: (.+)$/m)?.[1]}))};}if(args.operation!=='saved'&&(content.hidden||content.dataset.template!=='browser')){if(pages.has('device-x'))open('device-x');else {showModulePanel('module-browser');header('Browser','Library');browserPanel.mount();sceneState();}}return browserPanel.agent(args);}return executeWorld(name,args,meta);};
  const execute=(name: string,args: any,meta?: any)=>{toolNavigation=true;try{return native&&!data.sample?recordWorldCommand(name,args,()=>executeAction(name,args,meta)):executeAction(name,args,meta);}finally{toolNavigation=false;}};
  // Resolve only real destinations; the model cannot invent executable actions in links.
  function resolveReplyLink(value){
    if(!value.startsWith('#')){const matches=[...pages.values()].filter(p=>!p.virtual&&p.title.toLocaleLowerCase()===value.toLocaleLowerCase());return matches.length===1?'#note='+encodeURIComponent(matches[0].id):null;}
    const params=new URLSearchParams(value.slice(1));if([...params].length!==1)return null;
    const [kind,id]=[...params][0]||[];
    const valid=kind==='note'?pages.has(id)&&!pages.get(id).virtual:kind==='room'?sections.some(r=>r.id===id):kind==='building'?!!buildingFor(id):kind==='area'?areas.some(a=>a.id===id):kind==='object'?!!objectFor(id):kind==='world'&&id==='overview';
    return valid?'#'+kind+'='+encodeURIComponent(id):null;
  }
  function onReplyNavigate(hash){
    if(!resolveReplyLink(hash))return;
    const [kind,id]=[...new URLSearchParams(hash.slice(1))][0];
    if($('notionDialog').open)$('notionDialog').close();
    execute(kind==='note'?'open_content':kind==='world'?'move_view':'visit_context',kind==='world'?{direction:'overview'}:{id});
  }
  voice=native.chat({greetingContext:()=>{const r=sections.find(s=>s.moduleId===current);return {applet:r?.title,lastVisited:r?browserPanel.lastVisit(r.key):null};},chatRoute:()=>current==='app-codex'&&!content.hidden&&content.dataset.template==='coding-session'&&codexApplet?.selected?codexApplet:!data.sample&&current==='app-claude-code'&&!content.hidden&&content.dataset.template==='coding-session'&&workSelection?.item.session?claudeRoute:null,button:$('notionVoice'),input:$('notionInput'),status:$('notionVoiceStatus'),dialog,closeDialog:()=>$('notionDialog').close(),execute,foxPageHeld:()=>browserPanel.foxPageHeld(),state:worldState,sample:!!data.sample,resolveReplyLink,onReplyNavigate,speechVocabulary:()=>worldSpeechTerms(data)});$('notionCommand').onsubmit=e=>{e.preventDefault();
   // In a website, an address typed to Fox opens there: the input is also the address bar.
   const input=$('notionInput') as HTMLTextAreaElement|HTMLInputElement,address=!content.hidden&&content.dataset.template==='browser'?typedAddress(input.value):null;
   if(address&&openWorldURL(address)){input.value='';input.dispatchEvent(new Event('input'));return;}
   voice.submit()};
  // The first-run tour's first value can be a conversation the person brought (ui/onboarding/first-value.ts).
  let firstValueOngoing:{list:()=>{id:string,title:string,say:string}[],make:(id:string)=>Promise<boolean>}|null=null;
  if(native){
    // The paired iPhone mirrors the Center and talks to Fox through this page (core/phone/README.md).
    let widgetsNow:any[]=[],phoneWorldLog:{lines:any[],now:any[]}={lines:[],now:[]};
    // Ongoing things (core/tasks/README.md): proposals stand in Worth Doing as themes; each one kept earlier is an Applet of
    // its own, a device in the area Fox picked (app-job-…), with its own tile in the phone's Applet world and its own thread.
    let ongoingProposals:OngoingThing[]=[],ongoingKept:(OngoingThing&{recent:{text:string,at:string}[]})[]=[];
    const ongoingDecide=async(id:string,operation:'later'|'decline')=>{if(native.ongoing)await native.ongoing({operation,id});};
    // What Fox offers from them is a theme, never one conversation (core/tasks/themes.ts): the conversations about one part
    // of life, pulled together by Fox into one artifact laid out like every other (Kelvin 2026-10-07).
    const themesNow=()=>ongoingThemes(ongoingProposals,Date.now()/1000);
    const decideTheme=async(id:string,operation:'later'|'decline')=>{
     const theme=themesNow().find(t=>t.id===id);if(!theme)return null;
     for(const thing of theme.things)await ongoingDecide(thing.id,operation);
     ongoingProposals=ongoingProposals.filter(t=>!theme.things.some(x=>x.id===t.id));nativeHUD?.sync();phone?.world();
     return theme;
    };
    // Asking for the page puts the theme off for a while (Not now's week), so the row leaves Worth Doing; Fox's turn makes
    // the artifact. Resolves when the turn is over, telling whether Fox showed one.
    const makeTheme=async(id:string)=>{
     const theme=await decideTheme(id,'later');if(!theme||!voice?.ask)return false;
     const before=artifactsShown,request=ongoingThemeRequest(theme);
     await voice.ask(request.text,{displayText:request.displayText,icon:'spark'});
     for(let i=0;i<1500&&voice?.active;i++)await new Promise(resolve=>setTimeout(resolve,400));
     return artifactsShown>before;
    };
    firstValueOngoing={list:()=>themesNow().map(t=>({id:t.id,title:t.title,say:t.say})),make:makeTheme};
    // Fox lays the offer out the way it lays out an item's card: why, then the choices.
    const offerOngoing=(id:string)=>{
     const theme=themesNow().find(t=>t.id===id);if(!theme||!voice?.setGuide)return;
     const choice=(label:string,run:()=>Promise<unknown>)=>{
      const b=document.createElement('button');b.type='button';b.textContent=label;
      b.onclick=()=>{voice?.setGuide?.(null);void run().catch(error=>notify(error?.message||String(error)));};
      return b;
     };
     voice.setGuide({source:'ongoing:'+id,takeover:true,text:theme.say,actions:[choice(theme.option,()=>makeTheme(id)),choice('Not now',()=>decideTheme(id,'later')),choice('Don\'t ask again',()=>decideTheme(id,'decline'))]});
     voice.revealGuide?.();
    };
    const phone=!data.sample&&native.phonePublish?mountPhoneBridge({publish:native.phonePublish,publishLive:value=>native.phonePublish(value,'live'),answer:(id,choice)=>native.harnessApproval?.(id,choice),ask:text=>voice?.ask(text,{origin:'user',displayText:text}),
     // A line or the option chosen on the phone with an item's card open opens that card here too, so it joins the
     // item's own conversation and both screens show the same dialogue.
     askItem:(id,text)=>{previewAttention({worldItemId:id});return voice?.ask(text,{origin:'user',displayText:text});},
     choose:id=>{if(id.startsWith('ongoing:'))return isOngoingThemeId(id.slice(8))?makeTheme(id.slice(8)):undefined;const page=itemPage(id);if(!page||!previewAttention({worldItemId:id}))return;return previewActions(page)[0]?.run();},
     itemFox:id=>{if(id.startsWith('ongoing:')){const theme=themesNow().find(t=>'ongoing:'+t.id===id);if(!theme)return null;return {say:theme.say,option:theme.option,turns:[]};}const page=itemPage(id);if(!page)return null;return {say:attentionPreviewData(page).suggestion,option:previewActions(page)[0]?.label||'',turns:voice?.threadOf?.('attention:'+id)||[]};},
     // The Applet world (core/phone phoneApplets): the Applets in this World with their lamps, what each is doing, the
     // world log, the widgets for now and each Applet's thread. A line said in an Applet's page opens it here first.
     askApplet:(key,text)=>{const r=sections.find(s=>s.entity==='app'&&s.key===key);if(r&&root.appletLayout.has(r.moduleId))visitObject(r.moduleId);return voice?.ask(text,{origin:'user',displayText:text});},
     openApplet:key=>{const r=sections.find(s=>s.entity==='app'&&s.key===key);if(r&&root.appletLayout.has(r.moduleId))visitObject(r.moduleId);},
     order:said=>voice?.order?.(said),
     world:()=>({places:sections.filter(r=>r.entity==='app'&&r.key&&!r.ongoing&&!r.moment&&root.appletLayout.has(r.moduleId)).sort((a,b)=>lastUse(b,regionLayout)-lastUse(a,regionLayout)).map(r=>{const status=appStatus(r,data.moduleConnections||[]),phase=status.phase;
       return {key:r.key,title:r.title,provider:r.provider||r.key,label:status.label,source:!['browser','local','unavailable','planned'].includes(phase),mine:myAppletKind(r)??undefined,url:phoneWebAddress(r),
        state:['reading','syncing'].includes(phase)?'busy':status.failed?'failed':status.connected||status.usableWithoutLogin||['browser','local'].includes(phase)?'ready':'off'};}),
      now:phoneWorldLog.now,log:phoneWorldLog.lines,widgets:widgetsNow.map(w=>({id:w.id,title:w.title})),jobs:ongoingKept.map(t=>({id:t.id,title:t.title,line:ongoingLine(t,Date.now()/1000),recent:t.recent})),thread:key=>voice?.threadOf?.('object:app-'+key)||[]}),
     // On the phone, Done asks Fox for a theme's page, Later is Not now and Remove is Don't ask again.
     settle:(item,status,until)=>{if(!item.worldItemId.startsWith('ongoing:'))return settleAttention(item,status,until);const id=item.worldItemId.slice(8);return status==='dismissed'?decideTheme(id,'decline'):until?decideTheme(id,'later'):makeTheme(id);},kindOf:id=>[...pages.values()].find(p=>p.worldItemId===id)?.worldItemKind,ready:()=>!!voice&&root.dataset.onboardingLocked!=='true'}):null;
    if(phone)root.addEventListener('worldlet:fox-thread',()=>phone.refresh());
    window.addEventListener('worldlet:world-log',(event:any)=>{phoneWorldLog=event.detail||phoneWorldLog;phone?.world();});
    if(phone)root.addEventListener('worldlet:fox-live',(event:any)=>phone.live(event.detail));
    if(phone)window.addEventListener('worldlet:harness-approval',(event:any)=>phone.approval(event.detail));
    if(phone){root.addEventListener('worldlet:source-issues',(event:any)=>phone.accounts(event.detail||[]));sourceIssueSignature='';publishSourceIssues();}
    // Widgets for now lead the Center (core/artifacts/README.md); the first one Fox makes puts the Widgets Applet on the
    // ground, and the panel opens it next.

    const loadWidgets=()=>{if(data.sample||!native.widgets)return;void native.widgets({operation:'list'}).then(result=>{widgetsNow=Array.isArray(result?.now)?result.now:[];nativeHUD?.sync();phone?.world();}).catch(()=>{});};
    // A made Applet's device arrives with the World update the host sends with this event.
    window.addEventListener('worldlet:widgets',()=>loadWidgets());
    loadWidgets();
    const loadOngoing=async()=>{
     if(data.sample||!native.ongoing)return;
     try{
      const result=await native.ongoing({operation:'list'});
      ongoingProposals=Array.isArray(result?.proposals)?result.proposals.filter(t=>!(t.laterUntil>Date.now()/1000)):[];
      const kept:OngoingThing[]=Array.isArray(result?.kept)?result.kept:[];
      ongoingKept=await Promise.all(kept.map(async t=>{const r=await native.ongoing({operation:'turns',id:t.id,limit:4}).catch(()=>null);
       return {...t,recent:Array.isArray(r?.recent)?r.recent:[]};}));
      nativeHUD?.sync();phone?.world();
     }catch{}
    };
    window.addEventListener('worldlet:ongoing',()=>void loadOngoing());
    void loadOngoing();
    nativeHUD=mountNativeHUD({root,onAttention:view=>phone?.attention(view),calendar:calendarSoon,openCalendar:openCalendarEvent,widgets:()=>widgetsNow,openWidget:id=>visitObject(momentAppletId(id)),ongoing:()=>themesNow().map(({id,title,context})=>({id,title,context})),openOngoing:offerOngoing,updates:native.updates,connectApplet:moduleId=>{const r=sections.find(s=>s.moduleId===moduleId);if(r?.key==='voice-memos'){visitObject(r.moduleId,{enter:false});showVoiceMemos(r,'connect');}else if(r?.key==='messages'){visitObject(r.moduleId,{enter:false});showMessages(r);}else if(r?.key==='obsidian'){visitObject(r.moduleId);showObsidian(r,'choose');}else if(r&&native?.setup)native.setup('connection',r.region,r.key);},snapshot:()=>({data,pages,sections,areas,buildings,composites,arrivals,read,current,currentSpace,depth,attentionItemId:attentionPage?.worldItemId}),previewAttention,open,visitArea,visitSpace,visitBuilding,visitObject,focusContent,showSearch,connect:()=>{if(data.personal)templateLibrary();else sourceInfo();},original:async id=>{const item=pages.get(id);if(data.sample&&item?.noteId&&pages.has(item.noteId)){open(item.noteId);return;}const result=await native.original(pages.get(id).sourceId);const body=dialog(result.title);body.append(element('pre','private-original',result.text));},chat:()=>voice,back,home,leaveApplet:()=>{libraryWebReturn=null;back();},dialog,itemActions,onDecision:(d,choice)=>{const p=pages.get(d.pageId);if(!p)return {error:'Note not found'};const r=contentStore.mutate('patch_content',{id:p.id,revision:p.revision,field:'body',old_text:'',new_text:'\n## Selected option\n'+choice+'\nPlan only. No booking, payment or message was sent.'},{operationId:crypto.randomUUID()});if(r.ok)contentChanged(r);return r;},storage:native.storage,sample:()=>!!data.sample,toggleSample:native.toggleSample,contextual:()=>attentionPage?moduleContext():travelExperiment?.context()||moduleContext(),tasks:()=>travelExperiment?.tasks()||[]});
    // The Applet shelf above an open Applet (ui/hud/applet-shelf.ts): the recently used Applets, the open one in the middle.
    const shelfApp=(id:string)=>{const r=sections.find(s=>s.moduleId===id&&s.entity==='app');if(!r||!root.appletLayout?.has(id))return null;return {title:r.title,image:themeAppletIcon(r.key)||appLogoSource(r)||''};};
    appletShelf=mountAppletShelf({root,applet:shelfApp,lastUsed:id=>regionLayout.lastUsedAt[id]||0,
     recent:()=>sections.filter(r=>r.entity==='app'&&(regionLayout.lastUsedAt[r.moduleId]||0)>0).sort((a,b)=>(regionLayout.lastUsedAt[b.moduleId]||0)-(regionLayout.lastUsedAt[a.moduleId]||0)).map(r=>r.moduleId),
     open:id=>visitObject(id),leave:()=>home(),
     // + enters the Browser with its address ready to type, or opens a new tab when the Browser is already open (ui/browser/browser-device.ts).
     newPage:()=>{const inside=current==='app-browser';if(!inside)visitObject('app-browser');requestAnimationFrame(()=>window.dispatchEvent(new CustomEvent('worldlet:browser-navigate',{detail:inside?'new-tab':'address',cancelable:true})));}});
    appletShelf.sync(depth==='object'?current:null);
    if(data.sample&&buildings.length){travelExperiment=mountTravelExperiment({root,room:sections.find(s=>s.trip),pages,visit:visitObject,refresh:()=>{scene?.refreshContent();nativeHUD?.sync();},open:dialog,state:worldState,storage:native.storage,onContext:()=>nativeHUD?.sync()});scene?.refreshContent();}saveRegions();
    let searchTimer;const input=$('notionInput');
    input.addEventListener('input',()=>{clearTimeout(searchTimer);if(input.isComposing||root.classList.contains('companion-console'))return;const value=input.value.trim();searchTimer=setTimeout(()=>{if(document.activeElement!==input||voice.active)return;if(value&&value.length<100&&[...pages.values()].some(p=>!p.virtual&&(p.title+' '+p.text).toLocaleLowerCase().includes(value.toLocaleLowerCase())))showSearch(value);else if(searching){home();if(!value)input.focus();}},180);});
    input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&searching){const first=content.querySelector('.notion-page-link');if(first){e.preventDefault();first.focus();}}});
  }
  $('notionHome').onclick=home;$('notionBack').onclick=()=>{if($('notionDialog').open)$('notionDialog').close();else back();};$('notionNext').onclick=next;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(native&&$('notionDialog').open)$('notionDialog').close();else if(!$('notionDialog').open)back()}if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();if(native)voice?.openVoice();else $('notionInput').focus()}});
  function followLocation(){const params=new URLSearchParams(location.hash.slice(1)),id=params.get('note'),place=params.get('place'),level=params.get('level'),area=params.get('area'),building=params.get('building'),room=params.get('room'),object=params.get('object');if(object==='app-sessions'){visitBuilding('building-development');return;}if(buildings.length&&building&&buildingFor(building))visitBuilding(building);else if(buildings.length&&object&&objectFor(object))visitObject(object);else if(buildings.length&&room&&sections.some(s=>s.id===room))visitSpace(room);else if(area&&areas.some(a=>a.id===area))visitArea(area);else if(id&&pages.has(id))open(id);else if(sections.some(s=>s.id===place))visitSpace(place,['place','room','shelf'].includes(level)?level:'place');else home()}
  window.addEventListener('worldlet:search',()=>showSearch(''));window.addEventListener('hashchange',followLocation);followLocation();if(contentStore.error)notify(contentStore.error);
  if(native&&!nativeHUD&&data.pages.length<=1){$('notionWorldMeta').textContent='Connect sources and let your world grow';$('notionNext').textContent='Connect your sources →';$('notionNext').onclick=()=>native.settings()}
  // The person's own Applets are named to the host, which paints those with no pictures yet one at a time with the
  // image model on this computer (core/applets/MY-APPLETS.md#pictures). Each set is asked for once per session.
  function askForPictures(){
    if(!native?.appletArt||data.sample)return;
    const applets=(data.spaces||[]).flatMap(s=>{const kind=myAppletKind(s);return kind&&s.moduleId?[{applet:s.moduleId,title:s.title,about:s.description||'',kind}]:[];});
    const key=applets.map(a=>a.applet).sort().join();if(!applets.length||key===picturesAsked)return;picturesAsked=key;
    void Promise.resolve(native.appletArt({operation:'ensure',applets})).catch(()=>{});
  }
  function applyWorld(next,owned=false){
    // Worker results are already detached and exclusively owned by this UI.
    // Other callers (including refreshOverlay(data)) retain defensive copying.
    if(!owned)next=structuredClone(next);if(native&&next.buildings?.length)applyModuleWorld(next);applyRegionLayout(next,regionLayout);
    if(!native)return;const previousCodex=current==='app-codex'&&!content.hidden&&content.dataset.template==='coding-session'?codexApplet?.selected:null;const previousAppPanel=!content.hidden&&content.dataset.template==='app'?{id:current,scroll:content.scrollTop}:null;const previousBrowser=!content.hidden&&content.dataset.template==='browser',previousYouTube=!content.hidden&&content.dataset.template==='youtube',previousStripe=!content.hidden&&content.dataset.template==='stripe',previousPageLayer=inPageLayer()?pageLayer:null;const previous=worldState(),previousAppReader=!content.hidden&&(content.dataset.template==='app-source'||current==='app-notion'&&content.dataset.template==='browser')?appReader:null;if(next.personal)next.buildingNow=(next.buildings||[]).filter(b=>!b.unbuilt&&!data.buildings?.some(old=>old.id===b.id&&!old.unbuilt)).map(b=>b.id);const rebuild=JSON.stringify(data.buildings?.map(({unbuilt,...b})=>b))!==JSON.stringify(next.buildings?.map(({unbuilt,...b})=>b))||sections.map(s=>s.id).join()!==next.spaces.map(s=>s.id).join() || (native&&JSON.stringify(data.spaces.map(s=>[s.layout,s.module]))!==JSON.stringify(next.spaces.map(s=>[s.layout,s.module])))||data.spaces.map(s=>s.icon||'').join()!==next.spaces.map(s=>s.icon||'').join();if(rebuild)scene?.destroy();
    if(native){const changed=next.pages.filter(p=>{const old=pages.get(p.id);return p.sourceId&&p.text?.trim()&&(!old||p.sourceRevision!==old.sourceRevision)}).map(p=>p.id);for(const id of changed)read.delete(id);arrivals=[...new Set([...arrivals,...changed])];}
    for(const link of next.moduleConnections||[]){const old=data.moduleConnections?.find(c=>c.provider===link.provider);if(sourceReadAction(old)&&!sourceReadAction(link)&&connectionLive(link))sourceIssues.delete(link.provider);}
    const sourceIdentity=(world,key)=>{const link=world.moduleConnections?.find(c=>c.provider===curatedConnection(key));return JSON.stringify(link?[link.id,link.label,link.contentRevision,connectionLive(link)]:null);};
    if(sourceIdentity(data,'gmail')!==sourceIdentity(next,'gmail')){mailIdentityRevision++;mailIdentityReads.clear();mailIdentities.clear();localStageRecords.delete('gmail');}
    const changedReaders=CURATED_READERS.filter(key=>sourceIdentity(data,key)!==sourceIdentity(next,key));
    for(const key of changedReaders)invalidateCurated(key,true);
    observeMail(next);data=next;askForPictures();buildings.splice(0,buildings.length,...(data.buildings||[]));areas.splice(0,areas.length,...(data.areas||[]));composites.splice(0,composites.length,...(data.viewObjects||[]));const nextSections=data.spaces.map(s=>({...s,virtual:true,kind:'space',parent:null,paths:[],text:'',markdown:''}));
    contentStore.replaceBase(data.pages,nextSections,true);memberOf.clear();for(const section of sections)for(const child of section.children)memberOf.set(child,section.id);
    byPath.clear();for(const p of pages.values())for(const path of p.paths||[])byPath.set(path,p.id);
    if(rebuild){$('notionPins').replaceChildren();for(const k of Object.keys(pins))delete pins[k];}loadSampleLayout();if(rebuild)buildScene();else{scene?.setConnections?.(data.moduleConnections||[]);loadSampleLayout();scene?.setAppletLayout?.(data.hiddenApplets,data.appletPositions);scene?.setUnlockedApplets?.(data.unlockedApplets);scene?.refreshContent();}saveRegions();
    $('notionNext').onclick=()=>{if(depth==='overview'&&data.pages.length<=1){if(native)native.settings();}else nextLevel()};
    if(!rebuild&&previous.depth==='object'&&previous.id===current){
      // An open Applet shows what the update brought at once: findings that arrive while it is
      // open (right after onboarding, for one) must not wait for a refresh or a re-entry (#1281).
      if(current===sceneStageApp&&content.hidden){
        const r=sections.find(s=>s.moduleId===current);
        if(r?.key==='gmail'){const connection=data.moduleConnections?.find(c=>c.provider==='gmail');const records=new Map((localStageRecords.get('gmail')||[]).map(p=>[p.id,p]));for(const record of connection?.records||[])records.set(record.id,record);localStageRecords.set('gmail',[...records.values()].slice(-100));}
        if(r)scene?.setAppStage?.(current,appletStageData(r,sampleStageRecords(r)));
        if(r&&!localStageRecords.has(r.key))void sourceReader.run(r.provider);
      }
      if(changedReaders.some(key=>current==='app-'+key)){const r=sections.find(s=>s.moduleId===current);if(r)void showCuratedSource(r);}
      nativeHUD?.sync();return;
    }
    restoringWorld=true;try{
    if(previous.depth==='note'&&pages.has(previous.id))open(previous.id,{remember:false});else if(previous.depth==='object'&&objectFor(previous.id))visitObject(previous.id);else if(previous.depth==='building'&&buildingFor(previous.id))visitBuilding(previous.id);else if(previous.place&&sections.some(s=>s.id===previous.place))visitSpace(previous.place,previous.depth==='shelf'?'shelf':'room');else home();
    if((previousBrowser||previousYouTube||previousStripe)&&current===previous.id){content.hidden=false;hud.classList.add('is-reading');
      // A page open over the World stays one (home() above dropped it), so its close and the first win's return still find it.
      if(previousBrowser)pageLayer=previousPageLayer;sceneState();if(previousYouTube)appletPanels.get('youtube')?.show();if(previousStripe)appletPanels.get('stripe')?.show();}
    if(previousAppPanel&&current===previousAppPanel.id){const app=sections.find(s=>s.moduleId===current);if(app){showAppPanel(app);content.scrollTop=previousAppPanel.scroll;}}
    if(previousAppReader&&!changedReaders.includes(previousAppReader.app.key)&&current===previousAppReader.app.moduleId)openAppRecord(previousAppReader.app,previousAppReader.record);
    if(previousCodex&&current==='app-codex')openCodexSession(previousCodex);
    if(codexApplet)scene?.setAppActivity?.('app-codex',codexApplet.snapshot);
    }finally{restoringWorld=false;}
    if(data.buildingNow?.length)notify('Building a new place…');
  }
  const nextLevel=next;
  // Open an item's card and start its primary Fox action (the onboarding "do it for me").
  function helpWithAttention(id:string){
    const page=[...pages.values()].find(p=>p.worldItemId===id);if(!page||!previewAttention({worldItemId:id}))return false;
    const [primary]=previewActions(page);if(!primary)return false;
    void Promise.resolve(primary.run()).catch(e=>notify(e.message));return true;
  }
  // `by:'fox'` records that Fox did the work the person confirms (the first-run tour's Mark it done).
  async function settleAttentionById(id:string,status:string,{by}:{by?:'fox'}={}){
    const page=[...pages.values()].find(p=>p.worldItemId===id);if(!page)return false;
    await settleAttention(page,status,null,{by});return true;
  }
  return {applyWorld,previewAttention:id=>previewAttention({worldItemId:id}),helpWithAttention,ongoingProposals:()=>firstValueOngoing?.list()||[],makeOngoing:(id:string)=>firstValueOngoing?firstValueOngoing.make(id):Promise.resolve(false),settleAttention:settleAttentionById,browseURL:url=>execute('browse_web',{operation:'open',url}),openApplet:id=>visitObject(id),connectApplet:(id:string)=>{const r=sections.find(s=>s.moduleId===id);if(r&&native?.setup&&!data.sample)native.setup('connection',r.region,r.key);else visitObject(id);},lookAt(id,stage='building'){scene?.focus(!id||id==='overview'?'overview':id,!id||id==='overview'?'overview':stage);},showOverview:home,revealGuide:()=>voice?.revealGuide?.(),cancel:()=>voice?.cancel(),ask:text=>voice?.ask(text),openText:()=>voice?.openText(),setGuide(value){if(!value&&foregroundGuide&&depth==='object'&&current===foregroundGuide&&content.hidden)return;foregroundGuide=null;voice?.setGuide?.(value)},openSource(id){const p=[...pages.values()].find(p=>(p.sourceId===id||(p.worldItemId&&'world-item:'+p.worldItemId===id))&&!p.intentId);if(p){if(p.appletId)focusContent(p.id);else open(p.id);}else throw Error('This source is not ready to view yet. Try again.');},refreshOverlay(){contentStore.reloadStored();applyWorld(data)},get busy(){return !!voice?.active},get guideSource(){return voice?.guideSource||''},get lastReply(){return voice?.lastReplyText||''},get current(){return current},get pageOpen(){return inPageLayer()},get metrics(){return scene?.metrics}};
}
