import {modelFailure} from './model-failure.ts';
import type {HarnessLocation} from '../../contracts/harness-services.ts';

// What Settings › Model says about Fox's model (owner request 2026-10-06: connect models fully in Settings and
// see and fix every connection problem there). The host's `modelHealth` reads the Agent's model status and
// how the last reply ended; this turns that into plain words and the fixes that fit.
export type ModelPath='codex'|'key'|'agent'|'remote'|'none';
export type ModelFix='connect'|'models'|'restart'|'update';
export interface ModelHealth {
 agent:string|null;available:boolean;error?:string;
 model:{name:string;id:string;provider:string;source:string|null;ready:boolean;configured:boolean};
 lastReply:{ok:boolean;at:number;error?:string}|null;
 /** Where Fox's Agent runs (Harness service `location`); absent: this computer. */
 location?:HarnessLocation;
}
export interface ModelHealthView {path:ModelPath;state:'ok'|'attention'|'none';title:string;detail:string;problem:string;fixes:ModelFix[]}

const time=(at:number)=>new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
// The failure's own words, without the link back to this page.
const plain=(message:string)=>message.split('\n\n').filter(part=>!part.includes('#fox-action=')).join(' ').trim();

/** `agentTitle` names the Agent on this computer that answers for Fox, when one is chosen (`agentHarness`). */
export function modelHealthView(health:ModelHealth|null,agentTitle:string|null=null):ModelHealthView {
 if(!health||!health.available)return {path:'none',state:'none',title:'Fox’s Agent is not running',
  detail:health?.error||'Fox’s Agent on this computer did not start or did not answer.',
  problem:'Restart Fox. If it still does not start, save diagnostics in Troubleshoot.',fixes:['restart']};
 // An Agent on another computer: its model is that computer's business; only how the last reply went is said here.
 if(health.location?.kind==='remote'){
  // Reached directly (its own Gateway address) or through Worldlet there (a pairing code).
  const computer=health.location.computer,last=health.lastReply,detail=`Your Agent on ${computer} answers for Fox, ${health.location.direct?'reached directly at its address':'through Worldlet there'}. This computer’s apps and Attention Center stay here.`;
  if(last&&!last.ok)return {path:'remote',state:'attention',title:'Fox’s last reply did not finish',detail,problem:`At ${time(last.at)}: ${plain(last.error||'')||'Fox could not reach '+computer+'.'}`,fixes:[]};
  return {path:'remote',state:'ok',title:`Fox uses your Agent on ${computer}`,detail:detail+(last?` Last reply finished at ${time(last.at)}.`:''),problem:'',fixes:[]};
 }
 const {model}=health,codex=model.provider==='openai-codex'||model.source==='local-codex';
 const path:ModelPath=agentTitle?'agent':codex?'codex':model.configured?'key':'none';
 const named=model.id&&model.id!==model.name?`${model.name} (${model.id})`:model.name||model.id;
 const how=path==='agent'?`${agentTitle} on this computer answers for Fox.`:path==='codex'?'Your ChatGPT plan, through the Codex sign-in on this computer.':path==='key'?`Your own API key${model.provider&&model.provider!=='custom'?' with '+model.provider:''}.`:'';
 if(path==='none'||!model.ready&&path!=='agent')return {path,state:'none',title:path==='key'?'Fox’s API key is missing':'No model connected',
  detail:'Fox needs an AI on this computer to answer. Sign in to Codex, add your own API key, or use an Agent below.',
  problem:path==='codex'?'The Codex sign-in on this computer is missing or expired.':path==='key'?'Add the API key again.':'',fixes:['connect']};
 const detail=[how,named?'Model: '+named+'.':''].filter(Boolean).join(' ');
 const last=health.lastReply;
 if(last&&!last.ok){
  const failure=modelFailure(last.error||'');
  const fixes:ModelFix[]=!failure?['restart','connect']:failure.code==='authentication'||failure.code==='no_local_model'?['connect']:failure.code==='model'?(codex?['models','connect']:['connect'])
   :failure.code==='update_required'?['update']:['quota','rate_limit','paused','included_allowance'].includes(failure.code)?['connect']:['restart'];
  return {path,state:'attention',title:'Fox’s last reply did not finish',detail,
   problem:`At ${time(last.at)}: `+(failure?plain(failure.message):`Fox could not finish the reply${last.error?' ('+last.error+')':''}. Restart Fox and send it again.`),fixes};
 }
 return {path,state:'ok',title:'Fox’s model is connected',detail:detail+(last?` Last reply finished at ${time(last.at)}.`:''),problem:'',fixes:[]};
}
