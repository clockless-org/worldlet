import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {app} from 'electron';
import type {Host,Row} from '../../host/types.ts';
import {AGENT,ANALYTICS,BROWSER,COMPANION,DESKTOP_COMPANION,FOX,PHONE,RTC_PAGE,RUN_IN_BACKGROUND,VAULT,WIDGETS,WORLD_ROOM_PAGE,WORLD_WEB,type WorldRoomPageService,type WorldWebService,type AgentService,type RtcPageFactory,type DesktopCompanionService,type AnalyticsService,type BrowserService,type CompanionService,type FoxService,type PhoneService,type VaultService,type WidgetsService} from '../../host/services.ts';
import {WorldletError} from '../../files.ts';
import {withWorldLink,PHONE_LIMITS,hostAppletPlaces,threadPairs,readRemoteToHost,remoteHostInfo,phoneActionStatus,phoneAttention,phoneAttentionPushes,phoneConversation,phoneDesktop,phoneFoxPush,phonePush,phonePlatform,pairKeys,fromBase64url,sha256Hex,type PhoneAttention,type PhoneMessage,type PhonePushRequest} from '../../../../../core/phone/index.ts';
import {createPhoneRelay} from './relay.ts';
import {createLocalRelay,serveLocalRelay,type LocalServer} from './local-relay.ts';
import {createRoomLink} from './room-link.ts';
import {createWorldRoomLink} from './world-room-link.ts';
import type {PhoneStatus} from './relay.ts';
import {createRtcHost} from './rtc-host.ts';
import {createRemoteAgentHost} from './remote-host.ts';
import {phoneWebRecording} from './web.ts';
import {openInBrowser} from '../../system-browser.ts';
import {attentionLaterUntil,hostAttention} from '../../../../../agent/attention/index.ts';
import {onboardingUnfinished} from '../../../../../agent/onboarding/index.ts';
import {taskPanel} from '../../../../../core/tasks/index.ts';
import {APP_DEFINITIONS} from '../../../../../context/applets/index.ts';
import {readArtifact} from '../../../../../context/artifacts/index.ts';

// Phone pairing (core/phone/README.md): the iPhone app mirrors the Attention Center and Fox's main conversation.
// This module owns the pairing secret and the relay connection; the World page supplies the Attention snapshot
// (`phonePublish`, sent the moment the Center changes) and carries out the phone's messages (`worldletPhoneMessage`),
// because Center ordering and Fox turns live there. While the phone is open (it reached the relay in the last two
// minutes, or any time in the last week; see LISTENING) the desktop long-polls the relay, so a chat line or a Done from
// the phone arrives within about a second; while the app is open it re-reads Fox's conversation every two seconds while
// Fox works. Otherwise it checks every 15 seconds.
// Notifications (core/phone/README.md#push) go out only while the phone is not showing the app: it reached the relay in
// the last 45 seconds (an open app long-polls every 20), a shorter window than the two minutes that keep this loop quick, so
// a reply that lands just after the person put the phone away still reaches them. New Coming Up and Worth Doing items
// (core/phone phoneAttentionPushes, diffed against the previous snapshot) and Fox's finished reply to a line said on the
// phone are pushed here; other modules call PhoneService.notify.
// A phone seen in the last week keeps the desktop long-polling even while the app is closed (owner 2026-10-12: Fox
// slower on the phone). A short check every 15 seconds left the first line typed after opening the app waiting up to 15
// seconds before Fox began; a long poll takes the same number of requests and picks the line up within a second.
// The ports a browser on this computer reaches Worldlet on (local-relay.ts), the first free one; the one used is kept.
const LOCAL_PORTS=Array.from({length:10},(_,i)=>47630+i),LOCAL_PORT='worldlet.localBrowserPort';
const QUICK=2000,SLOW=15000,WAITING_QUICK=600000,ACTIVE=120000,WAIT=15,CONVERSATION=15000,SHOWING=45000,ASKED=3600000,LISTENING=7*86400000,WEB_LISTENING=3600000;
export function computerName(){return os.hostname().replace(/\.(local|lan|home)$/i,'').slice(0,60)||'Computer';}

export function installPhone(host:Host){
 const vault=host.use<VaultService>(VAULT);
 const version=app.getVersion();
 const web=phoneWebRecording((visits,records)=>host.optional<BrowserService>(BROWSER)?.recorded(visits,records),{onError:error=>host.diagnostics.record(error,'phoneWebRecord')});
 // The last Attention snapshot sent while paired (to find new items), and lines said on the phone whose reply is due.
 let attention:PhoneAttention|undefined,liveAsked=false;
 // Whether the phone was paired before the latest status, so a new pairing is counted once (`phone_paired`).
 let paired:boolean|null=null;
 const usage=(event:string,dimensions:Row={})=>host.optional<AnalyticsService>(ANALYTICS)?.recordProductEvent(event,'',dimensions);
 // Its system (owner 2026-10-11 20:21 PDT: Production metrics) shows only once the phone registers for notifications
 // (`apns`, `apns-dev` or `fcm`), usually just after pairing: phone_paired waits up to a minute for it, else `unknown`.
 let pairedReport:ReturnType<typeof setTimeout>|null=null;
 const reportPaired=(push?:{platform:string}|null)=>{if(pairedReport)clearTimeout(pairedReport);pairedReport=null;usage('phone_paired',{phone_platform:phonePlatform(push)});};
 const asked=new Map<string,{item?:string,applet?:string,at:number}>();
 const askedKey=(text:unknown)=>typeof text==='string'?text.trim().slice(0,PHONE_LIMITS.field):'';
 const attachments=phoneAttachments(()=>path.join(app.getPath('userData'),'Phone files'));
 // What the phone or a paired browser (core/phone/README.md#web) asked; both are carried out alike.
 const deliver=async(message:PhoneMessage,key:string)=>{
   // A widget edit is the host's own (modules/artifacts): it is merged and saved even while the page reloads.
   if(message.type==='widget'){
    lastActive=Date.now();
    const widgets=host.optional<WidgetsService>(WIDGETS);if(!widgets)return false;
    widgets.applyPhoneState(message.widget,message.state);return true;
   }
   // What happened on a website the phone opened is kept in the World by the host, like the computer's own browsing.
   if(message.type==='web'){lastActive=Date.now();web.record(message);return true;}
   // Orders were retired on 2026-10-18: one an older phone still sends is dropped without a word.
   if(message.type==='order')return true;
   // A photo or file attached on the phone arrives in parts before its line; the whole file is saved on this computer.
   if(message.type==='file'){lastActive=Date.now();attachments.add(message);return true;}
   if(message.type==='chat'&&message.files?.length){
    // The line carries the saved files' paths, one a line, for Fox's Agent to read here (as "+" on the computer does).
    const paths=message.files.map(file=>attachments.path(file)).filter((p):p is string=>!!p);
    message={type:'chat',id:message.id,text:[message.text,...paths].filter(Boolean).join('\n'),...message.item?{item:message.item}:message.applet?{applet:message.applet}:{}};
    if(!message.text)return true;
   }
   // A line for Fox's main conversation while the World page is not there (a login launch set to run in background
   // still loading it, a reload): Fox answers on the host alone (FoxService.converse), and the conversation slot
   // carries the reply. Anything else waits for the page.
   if(!host.page.ready()){
    const fox=host.optional<FoxService>(FOX),scope=fox?.scope();
    // Done, Later or Remove on an item of the Center the host published (hostCenter) settles it here, every member
    // of a grouped card with it, as the desktop card does.
    if(message.type==='attention'&&hostRows.has(message.id)){
     lastActive=Date.now();
     const {kind,members}=hostRows.get(message.id)!,{status,later}=phoneActionStatus(message.action,kind);
     const until=later?attentionLaterUntil(Date.now(),Intl.DateTimeFormat().resolvedOptions().timeZone):null;
     for(const id of members)try{host.store.setWorldItemStatus(id,status,until);}catch{/* Gone or already settled; the next Center shows the truth. */}
     if(message.action==='done')usage('phone_approved',{approval_kind:'attention'});
     hostCenterAt=0;
     return true;
    }
    // The Agent's permission prompt in a turn running without the page is answered on the host too.
    if(message.type==='approval'&&fox?.answerApproval){
     lastActive=Date.now();
     try{await fox.answerApproval(message.approval,message.choice);}catch{/* Already answered or gone; the live turn shows the truth. */}
     if(message.choice!=='deny')usage('phone_approved',{approval_kind:'agent_permission'});
     return true;
    }
    if(message.type!=='chat'||!fox?.converse||!scope||scope.sample||scope.setup)return false;
    // A line on an item's card or in an Applet runs in that place's thread, as the page says it there
    // (ui/attention contextThread: the card's `attention:<id>`, the Applet's `object:app-<key>`).
    const item=message.item?host.store.worldItems().find(row=>String(row.id)===message.item):null;
    if(message.item&&!item)return false;
    const app=message.applet?APP_DEFINITIONS.find(a=>a.key===message.applet):null;
    if(message.applet&&!app)return false;
    const place=item?{thread:JSON.stringify(['attention:'+message.item,'attention:'+message.item]),location:String(item.title||'An item')}
     :app?{thread:JSON.stringify(['object:app-'+app.key,'']),location:app.title}:undefined;
    lastActive=Date.now();
    asked.set(askedKey(message.text),{item:message.item,applet:message.applet,at:Date.now()});
    // Its reply is pushed when Fox finishes (the live turn's done update, through PhoneService.live).
    void fox.converse(message.text,place).catch(error=>host.diagnostics.record(error,'phoneConverse'));
    return true;
   }
   lastActive=Date.now();
   const taken=(await host.page.call<boolean>('worldletPhoneMessage',message,key))===true;
   // A line said on the phone: its reply is pushed if the phone is put away before Fox finishes.
   if(taken&&message.type==='chat')asked.set(askedKey(message.text),{item:message.item,applet:message.applet,at:Date.now()});
   // Approved on the phone: an Attention item's Done, or Allow on the Agent's permission prompt.
   if(taken&&message.type==='attention'&&message.action==='done')usage('phone_approved',{approval_kind:'attention'});
   if(taken&&message.type==='approval'&&message.choice!=='deny')usage('phone_approved',{approval_kind:'agent_permission'});
   return taken;
 };
 const relay=createPhoneRelay({
  fetch:(input,init)=>fetch(input,init),vault,name:computerName,userAgent:`Worldlet/${version} (phone pairing)`,
  relay:process.env.WORLDLET_PAIR_RELAY||undefined,deliver,room:{},
  onChange:status=>{
   if(status.state!=='paired')attention=undefined;
   if(status.state==='paired'&&paired===false){if(status.push?.platform)reportPaired(status.push);else pairedReport=setTimeout(()=>reportPaired(relay.status().push),60_000);}
   else if(pairedReport&&status.push?.platform)reportPaired(status.push);
   paired=status.state==='paired';
   host.page.event('worldlet:phone-status',status);
  },
 });
 paired=relay.status().state==='paired';
 let lastActive=0,stopped=false;
 // The Center for a phone or browser while the World page is not there (agent/attention hostAttention): the same rows
 // the desktop builds from the saved World items, published when they change. The page publishes its own whenever it
 // is there. `hostRows` maps each published card to its item's kind and the items it settles.
 let hostFocus:Row|null=null,hostCenterAt=0,hostCenterRevision='',hostSent='';
 const hostRows=new Map<string,{kind:string,members:string[]}>();
 async function hostCenter(){
  if(host.page.ready()||!relay.paired&&!browser.paired&&!local.paired)return;
  const fox=host.optional<FoxService>(FOX),scope=fox?.scope();
  if(!scope||scope.sample||scope.setup||onboardingUnfinished(host.store.state.onboarding))return;
  const revision=String(host.store.state.revision);
  if(revision===hostCenterRevision&&Date.now()-hostCenterAt<60_000)return;
  hostCenterRevision=revision;hostCenterAt=Date.now();
  const items=host.store.worldItems(),center=hostAttention(items,{now:Date.now(),saved:hostFocus as any});
  // The Task panel's Routines and Applet tasks, and today's Journal, as the page would add them. The page's own extras
  // (the website Fox drives, its morning brief and day summary cards) wait for it.
  const panel=await fox.taskPanel?.().catch(error=>{host.diagnostics.record(error,'phoneTasks');return null;});
  const tasks=panel&&!panel.sample?taskPanel({jobs:panel.jobs,harness:panel.harness,working:panel.working},Date.now()):undefined;
  let journal:any[]|undefined;
  try{journal=host.store.writable?host.store.ledger().artifactRows().flatMap(row=>{const artifact=readArtifact(row);return artifact?[artifact]:[];}):undefined;}
  catch(error){host.diagnostics.record(error,'phoneJournal');}
  hostFocus=center.saved;
  const kinds=new Map(items.map(item=>[String(item.id),String(item.kind||'task')]));
  hostRows.clear();
  for(const row of [...center.now,...center.later])if(row.worldItemId)hostRows.set(row.worldItemId,{kind:kinds.get(row.worldItemId)||'task',members:row.worldItemIds?.length?row.worldItemIds:[row.worldItemId]});
  // The Applets page: the Applets kept in the World with their lamps, and each one's own turns with Fox.
  let world:any;
  try{const ledger=host.store.writable?host.store.ledger():null;
   world={places:hostAppletPlaces({onboarding:host.store.state.onboarding,connections:host.store.state.connections}),
    thread:(key:string)=>ledger?threadPairs(ledger.threadTurns(JSON.stringify(['object:app-'+key,'']),8)):[]};}
  catch(error){host.diagnostics.record(error,'phoneApplets');}
  const value=phoneAttention({now:center.now,later:center.later,world,tasks,journal},Date.now()),text=JSON.stringify({...value,at:''});
  if(text===hostSent)return;
  hostSent=text;
  const previous=attention;attention=relay.paired?value:undefined;
  if(attention)for(const push of phoneAttentionPushes(previous,attention))void notify(push).catch(e=>host.diagnostics.record(e,'phonePush'));
  for(const link of links)if(link.phone)await link.relay.publish('attention',value);
 }
 const conversation=()=>{
  const fox=host.optional<FoxService>(FOX),companion=host.optional<CompanionService>(COMPANION);
  if(!fox||!companion||fox.scope().sample||fox.scope().setup)return null;
  const archive:Row=companion.archive();
  return phoneConversation({turns:archive.conversations||[],busy:fox.turnActive(),name:archive.identity?.name||'Fox'},Date.now());
 };
 const foxBusy=()=>!!host.optional<FoxService>(FOX)?.turnActive();
 const quiet=()=>{const scope=host.optional<FoxService>(FOX)?.scope();return !scope||scope.sample||scope.setup;};
 // In the pairing room the app is there exactly while it shows (it leaves when put away, and a notification's button
 // only drops in to send), so a phone in the room is showing and one that left is not.
 const showing=()=>{if(relay.room)return relay.open;const seen=relay.status().seenAt;return !!seen&&Date.now()-seen<SHOWING;};
 async function notify({collapse,...request}:PhonePushRequest){
  if(!relay.paired||showing()||quiet())return false;
  const push=phonePush(request);if(!push)return false;
  const answer=await relay.notify(push,typeof collapse==='string'&&/^[A-Za-z0-9_.-]{1,64}$/.test(collapse)?collapse:undefined);
  if(answer.error)host.diagnostics.record(new Error(answer.error),'phonePush');
  return answer.sent;
 }
 // Fox finished a turn: when it answers a line said on the phone, the reply goes to the phone if it is put away.
 function finished(turn:any){
  const key=askedKey(turn?.user),ask=key?asked.get(key):undefined;
  for(const [k,v] of asked)if(Date.now()-v.at>ASKED)asked.delete(k);
  if(!ask)return;
  asked.delete(key);
  const name=host.optional<CompanionService>(COMPANION)?.archive()?.identity?.name||'Fox';
  const push=phoneFoxPush({name,text:String(turn.text||''),item:ask.item,applet:ask.applet});
  if(push)void notify(push).catch(e=>host.diagnostics.record(e,'phonePush'));
 }
 const phoneOpen=()=>{const seen=relay.status().seenAt;return !!seen&&Date.now()-seen<ACTIVE||Date.now()-lastActive<ACTIVE;};
 // Another Worldlet that runs Fox's turns on this computer's Agent (core/phone/README.md#another-computers-agent):
 // a second pairing on the same relay with a `worldlet://agent` code. Its turns run here on the Agent service's own
 // runtime (remote-host.ts), never through the World page: in that computer's own sessions, with its instructions and
 // view, and every World tool call goes back to run in its World. It gets nothing of this World (no Attention Center,
 // conversation, widgets or Applets) but the `desktop` slot, which lists the person's agents here, and anything it
 // sends but a turn, a tool's answer or a cancel is dropped. It reads the relay every minute while it runs, and
 // throughout a turn, so this side listens closely.
 const agentService=()=>host.optional<AgentService>(AGENT);
 const remoteHost=createRemoteAgentHost({
  send:message=>agent.send(message),name:computerName,client:()=>agent.status().phone?.name||'computer',
  agents:async()=>(await agentService()?.agents?.()?.list()??[]).map(item=>item.id),
  answer:(id,choice)=>void agentService()?.approvals?.()?.answer(id,choice).catch(error=>host.diagnostics.record(error,'agentPairing')),
  onError:error=>host.diagnostics.record(error,'agentPairing'),
  run:async(body,onEvent,signal,lane)=>{
   const service=agentService(),scope=host.optional<FoxService>(FOX)?.scope();
   if(!service?.available)throw new WorldletError(`Fox’s Agent on ${computerName()} is not ready yet. Open Worldlet there and check Settings › Agents.`);
   if(service.harness?.id==='remote')throw new WorldletError(`Fox on ${computerName()} also uses an Agent on another computer. Pair with that computer instead.`);
   if(!scope||scope.sample||scope.setup)throw new WorldletError(`Finish setting up Worldlet on ${computerName()} first.`);
   // The client's background work runs on this computer's background lane, beside its conversation.
   if(lane==='background'&&!service.supportsBackgroundChecks)throw new WorldletError(`Fox’s Agent on ${computerName()} does not run background work.`);
   const runtime=lane==='background'?service.makeBackground?.()??service.make():service.make(),stop=()=>runtime.cancel();
   signal.addEventListener('abort',stop);
   try{return await runtime.run(body,service.home('private'),onEvent);}finally{signal.removeEventListener('abort',stop);}
  },
 });
 const agent=createPhoneRelay({
  fetch:(input,init)=>fetch(input,init),vault,name:computerName,userAgent:`Worldlet/${version} (agent pairing)`,kind:'agent',
  relay:process.env.WORLDLET_PAIR_RELAY||undefined,read:readRemoteToHost,
  deliver:message=>remoteHost.receive(message),
  onChange:status=>{if(status.state!=='paired')remoteHost.stop();host.page.event('worldlet:agent-pair-status',status);},
 });
 // The full World on another device (core/phone/README.md#the-world-on-another-device): a `world` pairing of its own,
 // met in the pairing room. Each page that joins is the host's remote World page (WORLD_ROOM_PAGE), with only what
 // ROOM_ALLOWED lets through; a host without one closes it.
 const worldRoom=createWorldRoomLink({
  vault,name:computerName,version,relay:process.env.WORLDLET_PAIR_RELAY||undefined,
  accept:socket=>{const pages=host.optional<WorldRoomPageService>(WORLD_ROOM_PAGE);if(pages)pages.accept(socket);else socket.close(1011,'No World here');},
  onChange:status=>host.page.event('worldlet:world-pair-status',status),
 });
 // The browser link carries the World's pairing too (core/phone withWorldLink), so it opens the full World on a device
 // that can draw it and the Center on one that cannot.
 const webStatus=(status:PhoneStatus):PhoneStatus=>status.link?{...status,link:withWorldLink(status.link,worldRoom.status().link)}:status;
 // A web browser on another device (core/phone/README.md#web): the page at `<relay>/open/` meets this computer in the
 // pairing room (room-link.ts), which stores nothing, and gets the same Center, conversation and live turn as a phone,
 // over a direct line when the two can reach each other.
 // It takes no notifications; a tab seen in the last hour keeps the loop listening, so a Done from it lands at once.
 let webPaired:boolean|null=null;
 const rtcPage=host.optional<RtcPageFactory>(RTC_PAGE);
 const browser=createRoomLink({
  vault,vaultName:'web-room',name:computerName,relay:process.env.WORLDLET_PAIR_RELAY||undefined,deliver,
  // A browser that offers a direct line gets one (core/phone rtc.ts), run on the page the host opens for it (a hidden
  // window in the Electron host, rtc-window.ts). A host with none (the Node host, platform/node) runs the room only.
  rtc:rtcPage?createRtcHost(rtcPage):undefined,
  onChange:status=>{
   if(status.state==='paired'&&webPaired===false)usage('phone_paired',{phone_platform:'web'});
   webPaired=status.state==='paired';
   // Running in background is for this link: once it ends, closing the World leaves Fox on the desktop again.
   if(status.state==='none'&&local.status().state==='none'&&host.preferences.bool(RUN_IN_BACKGROUND))host.preferences.set(RUN_IN_BACKGROUND,false);
   host.page.event('worldlet:web-pair-status',webStatus(status));
  },
 });
 // A browser link from before the room kept its boxes on the relay: it is ended there once, which deletes them.
 if(vault.get('web-pairing'))void createPhoneRelay({fetch:(input,init)=>fetch(input,init),vault,name:computerName,userAgent:`Worldlet/${version} (web pairing)`,kind:'web',
  relay:process.env.WORLDLET_PAIR_RELAY||undefined,deliver:async()=>false}).end().catch(error=>host.diagnostics.record(error,'phonePairing'));
 webPaired=browser.status().state==='paired';
 // A browser on this computer (core/phone/README.md#web): a pairing of its own, served by this app on 127.0.0.1
 // (local-relay.ts) with the page and a relay in memory, so what it shows never leaves the computer. The server starts
 // with the first link and with a launch that kept one, on the port the last one used, so the browser's saved link and
 // bookmark keep working; a link made for another port is ended, since that browser storage is gone with its origin.
 const localRelay=createLocalRelay();
 let served:Promise<LocalServer>|null=null,localOrigin='';
 const serveLocal=()=>served??=(async()=>{
  const last=host.preferences.number(LOCAL_PORT,0);
  const server=await serveLocalRelay({relay:localRelay,pageRoot:path.join(host.profile.webRoot,'open'),ports:[...new Set([last,...LOCAL_PORTS])].filter(port=>port>0)});
  if(server.port!==last)host.preferences.set(LOCAL_PORT,server.port);
  host.onQuit(()=>void server.close());
  localOrigin=server.origin;return server;
 })().catch(error=>{served=null;throw error;});
 // The relay forgets everything when the app quits; the pairing the vault kept is handed back before anything reads it.
 const adopted=(async()=>{
  const raw=vault.get('local-pairing');if(!raw)return false;
  const saved=JSON.parse(raw),k=await pairKeys(fromBase64url(String(saved.secret)));
  localRelay.adopt(k.id,await sha256Hex(k.desktopToken),await sha256Hex(k.phoneToken),saved.paired===true);
  return true;
 })().catch(error=>{host.diagnostics.record(error,'localBrowser');return false;});
 let localPaired:boolean|null=null;
 const local=createPhoneRelay({
  fetch:async(input,init)=>{await adopted;return localRelay.fetch(new Request(input,init));},
  vault,vaultName:'local',name:computerName,userAgent:`Worldlet/${version} (local browser)`,kind:'web',relay:()=>localOrigin,deliver,
  onChange:status=>{
   if(status.state==='paired'&&localPaired===false)usage('phone_paired',{phone_platform:'web'});
   localPaired=status.state==='paired';
   if(status.state==='none'&&browser.status().state==='none'&&host.preferences.bool(RUN_IN_BACKGROUND))host.preferences.set(RUN_IN_BACKGROUND,false);
   host.page.event('worldlet:local-pair-status',status);
  },
 });
 localPaired=local.status().state==='paired';
 void adopted.then(async kept=>{
  if(!kept)return;
  const {origin}=await serveLocal();
  if(!local.status().link?.startsWith(origin+'/'))await local.end();
 }).catch(error=>host.diagnostics.record(error,'localBrowser'));
 const localOpen=()=>{const seen=local.status().seenAt;return !!seen&&Date.now()-seen<ACTIVE;};
 const localListening=()=>{const seen=local.status().seenAt;return !!seen&&Date.now()-seen<WEB_LISTENING;};
 const webOpen=()=>{const seen=browser.status().seenAt;return !!seen&&Date.now()-seen<ACTIVE;};
 const webListening=()=>{const seen=browser.status().seenAt;return !!seen&&Date.now()-seen<WEB_LISTENING;};
 const phoneListening=()=>{const seen=relay.status().seenAt;return phoneOpen()||!!seen&&Date.now()-seen<LISTENING;};
 const agentOpen=()=>{const seen=agent.status().seenAt;return remoteHost.busy||!!seen&&Date.now()-seen<ACTIVE;};
 // The person's agents here for the client's Applet menus, read at most once a minute.
 let agentsRead={at:0,info:remoteHostInfo([])};
 const hostInfo=async()=>{
  if(Date.now()-agentsRead.at>60_000){
   const list=await agentService()?.agents?.()?.list().catch(()=>[])??[];
   agentsRead={at:Date.now(),info:remoteHostInfo(list)};
  }
  return agentsRead.info;
 };
 // One loop per pairing. A long poll holds its tick while it waits, so Fox's replies reach an open side through the
 // watch below: every two seconds while Fox works and once more when it finishes, and at least every 15 seconds.
 const links=[{relay,open:phoneOpen,listening:phoneListening,phone:true},{relay:agent,open:agentOpen,listening:agentOpen,phone:false},{relay:browser,open:webOpen,listening:webListening,phone:true},{relay:local,open:localOpen,listening:localListening,phone:true},{relay:worldRoom,open:()=>worldRoom.open,listening:()=>false,phone:false}].map(link=>{
  let timer:ReturnType<typeof setTimeout>|null=null,running=false,foxWasBusy=false,conversationAt=0,waiting:{link:string,since:number}|null=null;
  async function publishConversation(){
   conversationAt=Date.now();
   const value=conversation();if(value)await link.relay.publish('conversation',value);
  }
  async function tick(){
   timer=null;if(stopped||running||!link.relay.pairing)return schedule();
   running=true;
   const listen=link.relay.paired&&link.listening();
   try{
    if(await link.relay.poll(listen?WAIT:0)&&link.phone)lastActive=Date.now();
    // The World on another device asks for what it shows: it gets no slots.
    if(link.relay.paired&&link.relay!==worldRoom){
     if(link.phone)await hostCenter();
     if(link.phone)await publishConversation();
     const desktop=phoneDesktop({name:computerName(),version},Date.now());
     await link.relay.publish('desktop',link.phone?desktop:{...desktop,agent:await hostInfo()});
    }
   }catch(e){host.diagnostics.record(e,'phonePairing');}
   finally{running=false;schedule(listen?100:undefined);}
  }
  function schedule(delay?:number){
   if(stopped)return;
   if(timer)clearTimeout(timer);
   // A code just shown is checked every two seconds, so pairing feels instant; one nobody took for ten minutes, every
   // 15 seconds (a code left on screen polled the relay all day).
   const status=link.relay.status();
   if(status.state!=='waiting')waiting=null;else if(waiting?.link!==status.link)waiting={link:String(status.link),since:Date.now()};
   const quick=!!waiting&&Date.now()-waiting.since<WAITING_QUICK||link.open()||foxBusy();
   timer=setTimeout(()=>void tick(),delay??(quick?QUICK:SLOW));
  }
  function watch(){
   if(stopped||!link.phone||!link.relay.paired||!link.open())return;
   const busy=foxBusy();
   if(busy||foxWasBusy||Date.now()-conversationAt>CONVERSATION)void publishConversation().catch(e=>host.diagnostics.record(e,'phonePairing'));
   foxWasBusy=busy;
  }
  return {...link,schedule,watch,stop(){if(timer)clearTimeout(timer);}};
 });
 const watch=setInterval(()=>{for(const link of links)link.watch();},QUICK);
 // A live turn goes only to an open phone or browser, except while it asks for an approval and the update that settles
 // it: the phone the notification wakes then finds the approval card with its buttons, and a settled one loses them.
 async function publishLive(value:Row){
  const approval=!!value.approval||liveAsked;
  liveAsked=!!value.approval&&value.done!==true;
  let sent=false;
  for(const link of links)if(link.phone&&(approval||link.open())&&await link.relay.publish('live',value))sent=true;
  return sent;
 }
 host.provide<PhoneService>(PHONE,{
  publish:async(slot,value)=>{const sent=await Promise.all([relay.publish(slot,value),browser.publish(slot,value),local.publish(slot,value)]);return sent.some(Boolean);},
  idleSeconds:()=>{const last=Math.max(relay.status().seenAt||0,lastActive);return last?Math.max(0,(Date.now()-last)/1000):null;},
  notify,
  live:async value=>{if(value.done===true)finished(value);return publishLive(value);},
  // Kept when there is one, so a browser that opened it stays paired; a new one is checked quickly like Copy link's.
  worldLink:async()=>{await worldRoom.ensure();const status=await browser.ensure();links[2].schedule(QUICK);links[4].schedule(QUICK);return webStatus(status);},
  localServer:serveLocal,
  worldRoomLink:async()=>{const status=await worldRoom.ensure();links[4].schedule(QUICK);return status;},
  worldRoomRenew:async()=>{const status=await worldRoom.start();links[4].schedule(QUICK);host.page.event('worldlet:web-pair-status',webStatus(browser.status()));return status;},
 });
 host.register({
  // `kind: 'agent'` is the pairing with another Worldlet, `kind: 'web'` a browser's through the relay (another device),
  // `kind: 'local'` a browser's on this computer, served here, `kind: 'world'` the full World on another device through
  // the room; otherwise the phone's.
  phonePair:async request=>{
   const link=links[request.kind==='agent'?1:request.kind==='web'?2:request.kind==='local'?3:request.kind==='world'?4:0];
   // The browser link for another device carries the World's: it is made, shown and ended with it.
   const shown=(status:PhoneStatus)=>request.kind==='web'?webStatus(status):status;
   if(request.operation==='status')return shown(link.relay.status());
   if(request.operation==='start'){
    if(request.kind==='local')try{await serveLocal();}catch{throw new WorldletError('Worldlet could not open a port on this computer for the browser. Copy the link instead.');}
    if(request.kind==='web'){await worldRoom.start();links[4].schedule(QUICK);}
    const status=await link.relay.start();link.schedule(QUICK);return shown(status);
   }
   if(request.operation==='end'){if(request.kind==='web')await worldRoom.end();return await link.relay.end();}
   // The full World in a browser on this computer (host/world-web.ts): its link, opened in the person's default browser.
   if(request.kind==='local'&&request.operation==='world'){
    const world=host.optional<WorldWebService>(WORLD_WEB);
    if(!world)throw new WorldletError('This Worldlet build cannot open the World in a browser.');
    let link:string;try{link=await world.link();}catch{throw new WorldletError('Worldlet could not open a port on this computer for the browser.');}
    try{await openInBrowser(link);}catch{throw new WorldletError('Could not open your browser. Open the link in world-link.txt in your Worldlet library instead.');}
    return {state:'open',link};
   }
   // A browser's link opens in the person's default browser, never inside the World. The World's link for another
   // device (`kind: 'world'`) is kept when there is one, so a device that opened it stays paired.
   if(request.operation==='open'&&(request.kind==='web'||request.kind==='local'||request.kind==='world')){
    if(request.kind==='world'){await worldRoom.ensure();links[4].schedule(QUICK);}
    const status=shown(link.relay.status());if(!status.link)throw new WorldletError('Make a link first.');
    try{await openInBrowser(status.link);}catch{throw new WorldletError('Could not open your browser. Copy the link instead.');}
    return status;
   }
   // Run in background: every window steps aside now, and closing the World or a login launch leaves none
   // (modules/shell/companion.ts RUN_IN_BACKGROUND) until the link ends. The World on another device counts: on a
   // computer the browser link goes straight on to it, so the Center's own pairing may never complete.
   if(request.operation==='background'&&(request.kind==='web'||request.kind==='local'||request.kind==='world')){
    if(!browser.paired&&!local.paired&&!worldRoom.paired)throw new WorldletError('Open the link in a browser first.');
    const companion=host.optional<DesktopCompanionService>(DESKTOP_COMPANION);
    if(!companion)throw new WorldletError('Running in background is not available here.');
    host.preferences.set(RUN_IN_BACKGROUND,true);
    if(!companion.background())throw new WorldletError('Finish setting up Worldlet first.');
    return shown(link.relay.status());
   }
   throw new WorldletError('Unknown pairing request.');
  },
  // The page's current Attention Center (Now and Later), already shaped by core/phone phoneAttention, and the turn Fox
  // is streaming (phoneLive), which only an open phone needs. Both go only to the phone.
  phonePublish:async request=>{
   if(!['attention','live'].includes(request.slot)||!request.value||typeof request.value!=='object')throw new WorldletError('Unknown phone update.');
   if(request.slot==='live'&&request.value.done===true)finished(request.value);
   // New Coming Up and Worth Doing items since the previous snapshot; the first one after launch or pairing has none.
   // Notifications go only to the phone, never to another Worldlet.
   if(request.slot==='attention'&&Array.isArray(request.value.now)&&Array.isArray(request.value.later)){
    const previous=attention;attention=relay.paired?request.value:undefined;
    if(attention)for(const push of phoneAttentionPushes(previous,attention))void notify(push).catch(e=>host.diagnostics.record(e,'phonePush'));
   }
   if(request.slot==='live')return {sent:await publishLive(request.value)};
   hostSent='';
   let sent=false;
   for(const link of links)if(link.phone&&(await link.relay.publish(request.slot,request.value)))sent=true;
   return {sent};
  },
 });
 // The links run with the host, with or without the World page.
 host.onStarted(()=>{for(const link of links)link.schedule(1000);});
 host.onPageLoaded(()=>{for(const link of links)link.schedule(1000);});
 host.onQuit(()=>{stopped=true;if(pairedReport)reportPaired(relay.status().push);clearInterval(watch);remoteHost.stop();for(const link of links)link.stop();});
}

// Photos and files attached on the phone (core/phone PhoneMessage `file`): parts are held until the file is whole, then
// saved under Phone files/<date>/ with a name no earlier file has; a line's `files` read back the saved paths. Parts of a
// file that never completes are dropped after an hour.
function phoneAttachments(folder:()=>string){
 const pending=new Map<string,{parts:string[],count:number,name:string,at:number}>(),saved=new Map<string,string>();
 const save=(name:string,data:Buffer)=>{
  const dir=path.join(folder(),new Date().toISOString().slice(0,10));fs.mkdirSync(dir,{recursive:true});
  const ext=path.extname(name),base=path.basename(name,ext)||'Attachment';
  for(let n=1;;n++){const file=path.join(dir,n===1?base+ext:`${base} ${n}${ext}`);try{fs.writeFileSync(file,data,{flag:'wx'});return file;}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}}
 };
 return {
  add(message:{file:string,part:number,parts:number,name:string,data:string}){
   const now=Date.now();for(const [id,p] of pending)if(now-p.at>3600_000)pending.delete(id);
   if(saved.has(message.file))return;
   const entry=pending.get(message.file)??{parts:new Array(message.parts).fill(''),count:0,name:message.name,at:now};
   if(entry.parts.length!==message.parts||entry.parts[message.part])return;
   entry.parts[message.part]=message.data;entry.count++;pending.set(message.file,entry);
   if(entry.count<entry.parts.length)return;
   pending.delete(message.file);
   try{saved.set(message.file,save(entry.name,Buffer.from(entry.parts.join(''),'base64')));}catch{}
   while(saved.size>200)saved.delete(saved.keys().next().value!);
  },
  path:(file:string)=>saved.get(file)??null,
 };
}
