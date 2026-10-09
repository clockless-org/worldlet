import os from 'node:os';
import {app} from 'electron';
import type {Host,Row} from '../../host/types.ts';
import {AGENT,BROWSER,COMPANION,FOX,ORDER,PHONE,VAULT,WIDGETS,type AgentService,type BrowserService,type CompanionService,type FoxService,type OrderService,type PhoneService,type VaultService,type WidgetsService} from '../../host/services.ts';
import {WorldletError} from '../../files.ts';
import {PHONE_LIMITS,readRemoteToHost,remoteHostInfo,phoneAttentionPushes,phoneConversation,phoneDesktop,phoneFoxPush,phonePush,type PhoneAttention,type PhoneMessage,type PhonePushRequest} from '../../../../../core/phone/index.ts';
import {createPhoneRelay} from './relay.ts';
import {createRemoteAgentHost} from './remote-host.ts';
import {phoneWebRecording} from './web.ts';

// Phone pairing (core/phone/README.md): the iPhone app mirrors the Attention Center and Fox's main conversation.
// This module owns the pairing secret and the relay connection; the World page supplies the Attention snapshot
// (`phonePublish`, sent the moment the Center changes) and carries out the phone's messages (`worldletPhoneMessage`),
// because Center ordering and Fox turns live there. While the phone is open (it reached the relay in the last two
// minutes) the desktop long-polls the relay, so a chat line or a Done from the phone arrives within about a second, and
// it re-reads Fox's conversation every two seconds while Fox works. Otherwise it checks every 15 seconds.
// Notifications (core/phone/README.md#push) go out only while the phone is not showing the app: it reached the relay in
// the last 45 seconds (an open app long-polls every 20), a shorter window than the two minutes that keep this loop quick, so
// a reply that lands just after the person put the phone away still reaches them. New Coming Up and Worth Doing items
// (core/phone phoneAttentionPushes, diffed against the previous snapshot) and Fox's finished reply to a line said on the
// phone are pushed here; other modules call PhoneService.notify.
const QUICK=2000,SLOW=15000,ACTIVE=120000,WAIT=15,CONVERSATION=15000,SHOWING=45000,ASKED=3600000;
export function computerName(){return os.hostname().replace(/\.(local|lan|home)$/i,'').slice(0,60)||'Computer';}

export function installPhone(host:Host){
 const vault=host.use<VaultService>(VAULT);
 const orderReady=()=>host.optional<OrderService>(ORDER)?.ready()??Promise.resolve(false);
 const version=app.getVersion();
 const web=phoneWebRecording((visits,records)=>host.optional<BrowserService>(BROWSER)?.recorded(visits,records),{onError:error=>host.diagnostics.record(error,'phoneWebRecord')});
 // The last Attention snapshot sent while paired (to find new items), and lines said on the phone whose reply is due.
 let attention:PhoneAttention|undefined,liveAsked=false;
 const asked=new Map<string,{item?:string,applet?:string,at:number}>();
 const askedKey=(text:unknown)=>typeof text==='string'?text.trim().slice(0,PHONE_LIMITS.field):'';
 const relay=createPhoneRelay({
  fetch:(input,init)=>fetch(input,init),vault,name:computerName,userAgent:`Worldlet/${version} (phone pairing)`,
  relay:process.env.WORLDLET_PAIR_RELAY||undefined,
  deliver:async(message:PhoneMessage,key:string)=>{
   // A widget edit is the host's own (modules/widgets): it is merged and saved even while the page reloads.
   if(message.type==='widget'){
    lastActive=Date.now();
    const widgets=host.optional<WidgetsService>(WIDGETS);if(!widgets)return false;
    widgets.applyPhoneState(message.widget,message.state);return true;
   }
   // What happened on a website the phone opened is kept in the World by the host, like the computer's own browsing.
   if(message.type==='web'){lastActive=Date.now();web.record(message);return true;}
   // An Order from the phone goes out as the computer's own (the page sends it and Fox says how it went); one this
   // computer cannot send now (another channel, no Claude Code or enrolment) is dropped without a word.
   if(message.type==='order'&&!await orderReady())return true;
   if(!host.page.ready())return false;
   lastActive=Date.now();
   const taken=(await host.page.call<boolean>('worldletPhoneMessage',message,key))===true;
   // A line said on the phone: its reply is pushed if the phone is put away before Fox finishes.
   if(taken&&message.type==='chat')asked.set(askedKey(message.text),{item:message.item,applet:message.applet,at:Date.now()});
   return taken;
  },
  onChange:status=>{if(status.state!=='paired')attention=undefined;host.page.event('worldlet:phone-status',status);},
 });
 let lastActive=0,stopped=false;
 const conversation=()=>{
  const fox=host.optional<FoxService>(FOX),companion=host.optional<CompanionService>(COMPANION);
  if(!fox||!companion||fox.scope().sample||fox.scope().setup)return null;
  const archive:Row=companion.archive();
  return phoneConversation({turns:archive.conversations||[],busy:fox.turnActive(),name:archive.identity?.name||'Fox'},Date.now());
 };
 const foxBusy=()=>!!host.optional<FoxService>(FOX)?.turnActive();
 const quiet=()=>{const scope=host.optional<FoxService>(FOX)?.scope();return !scope||scope.sample||scope.setup;};
 const showing=()=>{const seen=relay.status().seenAt;return !!seen&&Date.now()-seen<SHOWING;};
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
   if(!service?.available)throw new WorldletError(`Fox’s Agent on ${computerName()} is not ready yet. Open Worldlet there and check Settings › Model.`);
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
 const links=[{relay,open:phoneOpen,phone:true},{relay:agent,open:agentOpen,phone:false}].map(link=>{
  let timer:ReturnType<typeof setTimeout>|null=null,running=false,foxWasBusy=false,conversationAt=0;
  async function publishConversation(){
   conversationAt=Date.now();
   const value=conversation();if(value)await link.relay.publish('conversation',value);
  }
  async function tick(){
   timer=null;if(stopped||running||!link.relay.pairing)return schedule();
   running=true;
   const listen=link.relay.paired&&link.open();
   try{
    if(await link.relay.poll(listen?WAIT:0)&&link.phone)lastActive=Date.now();
    if(link.relay.paired){
     if(link.phone)await publishConversation();
     const desktop=phoneDesktop({name:computerName(),version,order:link.phone&&await orderReady()},Date.now());
     await link.relay.publish('desktop',link.phone?desktop:{...desktop,agent:await hostInfo()});
    }
   }catch(e){host.diagnostics.record(e,'phonePairing');}
   finally{running=false;schedule(listen?100:undefined);}
  }
  function schedule(delay?:number){
   if(stopped)return;
   if(timer)clearTimeout(timer);
   const quick=link.relay.status().state==='waiting'||link.open()||foxBusy();
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
 host.provide<PhoneService>(PHONE,{
  publish:(slot,value)=>relay.publish(slot,value),
  idleSeconds:()=>{const last=Math.max(relay.status().seenAt||0,lastActive);return last?Math.max(0,(Date.now()-last)/1000):null;},
  notify,
 });
 host.register({
  // `kind: 'agent'` is the pairing with another Worldlet; otherwise the phone's.
  phonePair:async request=>{
   const link=links[request.kind==='agent'?1:0];
   if(request.operation==='status')return link.relay.status();
   if(request.operation==='start'){const status=await link.relay.start();link.schedule(QUICK);return status;}
   if(request.operation==='end')return await link.relay.end();
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
   // A live turn goes only to an open phone, except while it asks for an approval and the update that settles it: the
   // phone the notification wakes then finds the approval card with its buttons, and a settled one loses them.
   const approval=request.slot==='live'&&(!!request.value.approval||liveAsked);
   if(request.slot==='live')liveAsked=!!request.value.approval&&request.value.done!==true;
   let sent=false;
   for(const link of links)if(link.phone&&(request.slot!=='live'||approval||link.open()))sent=await link.relay.publish(request.slot,request.value)||sent;
   return {sent};
  },
 });
 host.onPageLoaded(()=>{for(const link of links)link.schedule(1000);});
 host.onQuit(()=>{stopped=true;clearInterval(watch);remoteHost.stop();for(const link of links)link.stop();});
}
