import {WORLD_TOOLS} from '../../services.ts';
import type {WorldToolsService} from '../../services.ts';
import type {Host} from '../../types.ts';
import {AttentionCenter} from './center.ts';
import {WORLD_TOOL_NAMES,worldTool,worldToolReply} from './tools.ts';

/** World tools, the Attention Center and background scheduling (source checks, Applet analysis,
 * synthesis). Mac: AttentionCenter, AppletRuntime, WorldInteraction, RuntimeTasks. */
export function installAttention(host:Host){
 const center=new AttentionCenter(host);
 let registryReported=false;
 // The ledger's runtime lease policy reads the same validated Applet registry.
 host.store.runtimeRows=()=>{
  try{return center.runtimeRows();}
  catch(error){if(!registryReported){registryReported=true;host.diagnostics.record(error,'appletRuntime');}return [];}
 };
 const service:WorldToolsService={
  names:WORLD_TOOL_NAMES,
  reply:(name,args,turn,monitorProvider,agent)=>worldToolReply(center,name,args,turn,monitorProvider,agent),
  start:()=>center.start(),
  stop:()=>center.stop(),
  requestAttentionSynthesis:()=>center.requestAttentionSynthesis(),
  requestAppletAnalysis:()=>center.requestAppletAnalysis(),
  checkWorldIfDue:only=>center.checkWorldIfDue(only),
  readConnectedApps:()=>center.readConnectedApps(),
  startOnboardingMailCheck:()=>center.startOnboardingMailCheck(),
  observeWeather:value=>center.observeWeather(value),
  observeConversations:records=>center.observeConversations(records),
  seedFromAgent:entries=>center.seedFromAgent(entries),
  runtimeTaskReport:()=>center.runtimeTaskReport(),
  cancelProvider:provider=>center.cancelProvider(provider),
  finishTurn:(turn,cancelled)=>center.finishTurn(turn,cancelled)
 };
 host.provide(WORLD_TOOLS,service);
 // Owner of the `backgroundSourceChecks` host capability.
 host.provide('sourceChecks',service);
 host.register({
  runtimeTaskControl:request=>center.runtimeTaskControl(request),
  worldSourceCheck:request=>{const {action:_,...args}=request;return worldTool(center,'configure_world_check',args,'world-source-check');}
 });
 // Checks start with the host (the World's first load, or a run in background with no page); each lane re-checks
 // consent and practice mode itself.
 host.onStarted(()=>center.start());
 // The World learns when Attention starts or stops reading (first value waits on it); the lanes flip it
 // without a store change of their own.
 // The host sends a snapshot only for a new revision, so a flip the last snapshot did not carry moves the activity
 // revision; the watch compares with what the last snapshot said, not with its own last look.
 const extras=host.store.snapshotExtras;
 let reading=false,told=false;
 host.store.snapshotExtras=()=>{told=false;return {...extras(),attentionReading:reading=center.attentionReading()};};
 const watch=setInterval(()=>{if(!told&&center.attentionReading()!==reading){told=true;host.store.activityRevision+=1;host.store.notify();}},1000);
 watch.unref?.();
 host.onQuit(()=>{clearInterval(watch);center.stop();});
 let allowed=false;
 host.store.onChange(()=>{
  const now=host.store.writable&&host.store.state.cloudConsent===true&&!host.store.sampleEnabled();
  if(now===allowed)return;
  allowed=now;
  if(!now){center.cancelPrivateWork();return;}
  center.requestSourceChecks();center.requestAttentionSynthesis();center.requestAppletAnalysis();
 });
}
