import {spawn} from 'node:child_process';
import type {HarnessSend} from '../../../../../contracts/harness-services.ts';
import {CHANNEL_REPLY,channelTitle,harnessSendResult,harnessService,hermesSendArgs,openClawSendArgs,openClawSendRoute,type HermesSendRoute,type OpenClawSendRoute} from '../../../../../core/agent/index.ts';
import {hermesSendRouteOf} from './agent-files.ts';
import {currentEnvironment,harnessEnvironment,locateLocalHarnesses,type HarnessEnvironment,type LocalHarnessInstall} from './local-harness.ts';
import {openClawSessionEntry} from './openclaw-files.ts';
import {stopChild} from './protocol.ts';

// The `send` Harness service (contracts/harness-services.ts HarnessSend) for the local Harnesses that declare it
// (core/agent/harness-services.ts): a reply the person approved goes into the channel thread a `history` thread came
// from, sent by the person's own Agent with its own channel sign-in. Where it goes is read from the Agent's own record of
// that thread (read-only); the Agent's command line sends it (Core's harness-send.ts has the rules). The World asks
// for the service, never for a Harness by name: one that declares no `send`, or is not installed here, gets null.

export type SendCommand=(install:LocalHarnessInstall,args:string[],options:{env:Record<string,string>;input?:string;timeout:number})=>Promise<{code:number|null;stdout:string;stderr:string}>;
/** Runs the Agent's command once: arguments as an array (no shell), the text on stdin where it takes it there. */
export const runSendCommand:SendCommand=(install,args,{env,input,timeout})=>new Promise(resolve=>{
 let stdout='',stderr='';
 let child;
 try{child=spawn(install.command,[...install.prefix,...args],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});}
 catch(error){resolve({code:null,stdout:'',stderr:String((error as Error)?.message??error)});return;}
 const timer=setTimeout(()=>{stopChild(child);stderr+='\nThe Agent took too long to send it.';},timeout);
 child.stdout?.on('data',(chunk:Buffer)=>{if(stdout.length<65536)stdout+=chunk.toString('utf8');});
 child.stderr?.on('data',(chunk:Buffer)=>{if(stderr.length<65536)stderr+=chunk.toString('utf8');});
 child.once('error',error=>{clearTimeout(timer);resolve({code:null,stdout,stderr:stderr+'\n'+error.message});});
 child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
 child.stdin?.on('error',()=>{});
 child.stdin?.end(input??'');
});

/** The `send` service of the person's `id` Agent on this computer, or null. */
export function harnessSend(id:string,environment:HarnessEnvironment=currentEnvironment(),{locate=locateLocalHarnesses,run=runSendCommand}:{locate?:(environment:HarnessEnvironment)=>LocalHarnessInstall[];run?:SendCommand}={}):HarnessSend|null {
 if(harnessService(id,'send')!=='native')return null;
 const {home,env}=environment;
 let install:LocalHarnessInstall|null|undefined;
 const installed=()=>install===undefined?(install=locate(environment).find(item=>item.id===id)??null):install;
 const routeOf=(thread:string):OpenClawSendRoute|HermesSendRoute|null=>{
  try{return id==='openclaw'?openClawSendRoute(openClawSessionEntry(thread,home,env)):id==='hermes'?hermesSendRouteOf(thread,home,env):null;}catch{return null;}
 };
 const channelOf=(route:OpenClawSendRoute|HermesSendRoute)=>'channel' in route?route.channel:route.platform;
 return {
  async route(thread){
   const route=installed()?routeOf(thread):null;
   return route?{thread,channel:channelOf(route),where:channelTitle(channelOf(route))||channelOf(route)}:null;
  },
  async send(thread,text){
   const agent=installed(),route=agent?routeOf(thread):null;
   if(!agent||!route)throw Error('Your Agent cannot send to this conversation.');
   const args='channel' in route?openClawSendArgs(route,text):hermesSendArgs(route);
   const {code,stdout,stderr}=await run(agent,args,{env:harnessEnvironment(agent,environment),...'channel' in route?{}:{input:text},timeout:CHANNEL_REPLY.sendMs});
   const result=harnessSendResult(code,stdout,stderr);
   if('error' in result)throw Error(result.error);
   return result.id?{id:result.id}:{};
  },
 };
}
