import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {HarnessVoice} from '../../../../../contracts/harness-services.ts';
import {HARNESS_VOICE,harnessService,harnessVoiceArgs,harnessVoiceResult,harnessVoiceText} from '../../../../../core/agent/index.ts';
import {currentEnvironment,harnessEnvironment,locateLocalHarnesses,type HarnessEnvironment,type LocalHarnessInstall} from './local-harness.ts';
import {runSendCommand,type SendCommand} from './harness-send.ts';

// The `voice` Harness service (contracts/harness-services.ts HarnessVoice) for the local Harnesses that declare it
// (core/agent/harness-services.ts): one clip of Fox's reply synthesized by the person's own Agent into a private
// temporary folder, read back and removed. The World asks for the service, never for a Harness by name: one that
// declares no `voice`, or is not installed here, gets null and Fox reads with a system voice.

/** The `voice` service of the person's `id` Agent on this computer, or null. */
export function harnessVoice(id:string,environment:HarnessEnvironment=currentEnvironment(),{locate=locateLocalHarnesses,run=runSendCommand}:{locate?:(environment:HarnessEnvironment)=>LocalHarnessInstall[];run?:SendCommand}={}):HarnessVoice|null {
 if(harnessService(id,'voice')!=='native'||!harnessVoiceArgs(id,'-','-'))return null;
 let install:LocalHarnessInstall|null|undefined;
 const installed=()=>install===undefined?(install=locate(environment).find(item=>item.id===id)??null):install;
 return {
  async speak(value){
   const text=harnessVoiceText(value),agent=installed();
   if(!text||!agent)throw Error('Your Agent cannot speak this reply.');
   const folder=fs.mkdtempSync(path.join(os.tmpdir(),'worldlet-voice-'));
   try{
    const {code,stdout,stderr}=await run(agent,harnessVoiceArgs(id,text,path.join(folder,'reply.mp3'))!,{env:harnessEnvironment(agent,environment),timeout:HARNESS_VOICE.timeoutMs});
    const result=harnessVoiceResult(code,stdout,stderr);
    if('error' in result)throw Error(result.error);
    // Only the clip it wrote where it was asked to.
    if(path.dirname(path.resolve(result.path))!==folder)throw Error('Your Agent put its clip somewhere else.');
    const stat=fs.statSync(result.path);
    if(!stat.isFile()||stat.size===0||stat.size>HARNESS_VOICE.bytes)throw Error('Your Agent’s clip could not be played.');
    return {audio:new Uint8Array(fs.readFileSync(result.path)),mimeType:result.mimeType,...result.provider?{provider:result.provider}:{}};
   }finally{fs.rmSync(folder,{recursive:true,force:true});}
  },
 };
}
