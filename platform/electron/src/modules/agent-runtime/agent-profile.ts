import {AGENT_PROFILE_DIGEST,AGENT_PROFILE_TIMEOUT_MS,agentProfilePrompt,type AgentConversationDigest,parseAgentProfile,type AgentProfile} from '../../../../../agent/agent/index.ts';
import {WORLD_APPS} from '../../../../../context/applets/index.ts';
import {readAgentSetting,writeAgentSetting} from '../../store/agent-settings.ts';
import type {AgentRuntime} from './types.ts';
import {hermesThread,hermesThreads} from './agent-files.ts';
import {openClawThread,openClawThreads} from './openclaw-files.ts';

// The person's own Agent describes itself once it is chosen (agent/agent/agent-profile.ts). One background turn on that
// Agent, in Worldlet's setup home, with no World tools; the answer is kept in the World's database beside the other
// Agent settings and never leaves this computer. Any failure only means setup goes on with what its files held.

const SETTING='agent-profile';
export type AgentProfileResult='ok'|'timeout'|'invalid'|'failed';

/** Asks once, and once more when the reply was not the JSON; each answer gets AGENT_PROFILE_TIMEOUT_MS. `conversations`: what
 * Worldlet read of the Agent's conversations (conversationDigest). */
export async function describeAgent(runtime:()=>AgentRuntime,home:string,conversations:readonly AgentConversationDigest[]=[],timeout=AGENT_PROFILE_TIMEOUT_MS):Promise<{profile:AgentProfile|null;result:AgentProfileResult}> {
 const prompt=agentProfilePrompt(WORLD_APPS.filter(app=>app.region!=='health').map(app=>app.key),conversations);
 let result:AgentProfileResult='failed';
 for(let attempt=0;attempt<2;attempt++){
  const agent=runtime();
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;agent.cancel?.();},timeout);
  try{
   const reply=await agent.run({action:'chat',text:attempt?prompt+'\n\nYour last reply was not that JSON object. Reply with the JSON object only.':prompt,_background:true},home);
   const profile=parseAgentProfile(reply?.message);
   if(profile)return {profile,result:'ok'};
   result='invalid';
  }catch{
   return {profile:null,result:timedOut?'timeout':'failed'};
  }finally{clearTimeout(timer);}
 }
 return {profile:null,result};
}

export function readAgentProfile(root:string,id:string):AgentProfile|null {
 const saved=readAgentSetting(root,SETTING) as Record<string,any>|null;
 const entry=saved&&typeof saved==='object'?saved[id]:null;
 return entry&&typeof entry==='object'&&entry.profile&&typeof entry.profile==='object'?entry.profile as AgentProfile:null;
}
/** Keeps what it said, or, when it said nothing usable, how asking ended beside what it said before. */
export function writeAgentProfile(root:string,id:string,profile:AgentProfile|null,result:AgentProfileResult='ok',now=Date.now()){
 const saved=readAgentSetting(root,SETTING) as Record<string,any>|null,all=saved&&typeof saved==='object'?saved:{};
 const before=all[id]&&typeof all[id]==='object'?all[id]:{};
 writeAgentSetting(root,SETTING,{...all,[id]:profile?{at:now,result,profile}:{...before,result,triedAt:now}} as any);
}

/** The Agent's conversations as Worldlet reads them from its files, newest first (core AgentConversationDigest): what
 * it is asked to summarize instead of going through its history itself. Group chats are left out. */
export function conversationDigest(id:string,home?:string,environment?:NodeJS.ProcessEnv):AgentConversationDigest[] {
 const day=(ms:number)=>ms>0?new Date(ms).toISOString().slice(0,10):undefined;
 const digest=(title:string,turns:{role:string;text:string}[],last:number):AgentConversationDigest=>({title,messages:turns.length,...day(last)?{last:day(last)}:{},
  opening:turns.filter(turn=>turn.role==='user').map(turn=>turn.text).filter(Boolean).slice(0,AGENT_PROFILE_DIGEST.lines)});
 const limit=AGENT_PROFILE_DIGEST.conversations;
 try{
  if(id==='hermes')return (hermesThreads(home,environment)??[]).filter(thread=>!thread.shared).sort((a,b)=>b.last-a.last).slice(0,limit)
   .map(thread=>digest(thread.title,hermesThread(thread,home,environment)?.turns??[],thread.last*1000));
  if(id==='openclaw')return (openClawThreads(home,environment)??[]).filter(thread=>!thread.shared).sort((a,b)=>b.last-a.last).slice(0,limit)
   .map(thread=>digest(thread.title,openClawThread(thread.id,home,environment)?.turns??[],thread.last));
 }catch{}
 return [];
}
