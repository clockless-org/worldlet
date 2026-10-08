import {WORLD_TOOLS} from '../../host/services.ts';
import type {WorldToolsService} from '../../host/services.ts';
import type {Host} from '../../host/types.ts';
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
  reply:(name,args,turn,monitorProvider)=>worldToolReply(center,name,args,turn,monitorProvider),
  start:()=>center.start(),
  stop:()=>center.stop(),
  requestAttentionSynthesis:()=>center.requestAttentionSynthesis(),
  requestAppletAnalysis:()=>center.requestAppletAnalysis(),
  checkWorldIfDue:only=>center.checkWorldIfDue(only),
  readConnectedApps:()=>center.readConnectedApps(),
  startOnboardingMailCheck:()=>center.startOnboardingMailCheck(),
  observeWeather:value=>center.observeWeather(value),
  observeConversations:records=>center.observeConversations(records),
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
 // Mac starts checks when the World appears; each lane re-checks consent and practice mode itself.
 host.onPageLoaded(()=>center.start());
 // The World learns when Attention starts or stops reading (first value waits on it); the lanes flip it
 // without a store change of their own.
 const extras=host.store.snapshotExtras;
 host.store.snapshotExtras=()=>({...extras(),attentionReading:center.attentionReading()});
 let reading=false;
 const watch=setInterval(()=>{const now=center.attentionReading();if(now!==reading){reading=now;host.store.notify();}},1000);
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
