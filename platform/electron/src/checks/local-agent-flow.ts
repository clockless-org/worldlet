import path from 'node:path';
import {AGENT,FOX,type AgentService,type FoxService} from '../host/services.ts';
import {LocalHarnessRuntime,readSelection} from '../modules/agent-runtime/local-harness.ts';
import {readModelSource} from '../modules/agent-runtime/model-access.ts';
import type {AgentEventHandler,Row} from '../modules/agent-runtime/types.ts';
import type {CheckContext} from './index.ts';
import {setTimeout as sleep} from 'node:timers/promises';
import {errorMessage as message} from '../files.ts';

// Release gate (npm run test:agent:local): Fox really talks through this computer's Codex CLI as
// the local Agent Harness, in the fictional practice world, and Codex works through Worldlet's World
// tools (the per-turn MCP server). No included-model (Worldlet model service) request is made, and no
// real account is read: the mail is the practice world's example.com mail, and "sending" only records
// the email in that world. A model answers differently each run, so each scenario judges what
// happened (tool calls the World accepted, their effect, facts in the reply) and is tried twice.
// The launcher selects Codex and the practice world; without Codex here the check reports SKIP.
const TURN_SECONDS=Number(process.env.WORLDLET_LOCAL_AGENT_TURN_SECONDS||300);

interface ToolCall {name:string;args:Row;answer:Row|null}
interface Turn {text:string;tools:ToolCall[];message:string;error:string;done:boolean}
interface Scenario {name:string;ask:string;judge:(turn:Turn)=>string|null;after?:()=>Promise<void>}

const accepted=(call:ToolCall)=>!!call.answer&&typeof call.answer.error!=='string';
const READS=['find_content','read_content','read_content_page','open_content'];

export async function localAgentFlow({host,view}:CheckContext){
 const {store}=host;
 const disposable=process.env.WORLDLET_PROFILE_ROOT;
 if(!disposable||path.resolve(disposable)!==path.resolve(store.root))throw Error('needs a disposable library: start with WORLDLET_PROFILE_ROOT (npm run test:agent:local)');
 const agent=host.use<AgentService>(AGENT);
 // The launcher saved Codex as the chosen Harness; the host keeps the built-in Agent when Codex is not installed here.
 // Even a SKIP ends after the World has started: quitting while the page still boots crashes Electron on Windows (0xC0000005).
 if(agent.id!=='local-codex'){
  for(let i=0;i<450&&await view.webContents.executeJavaScript("!!document.querySelector('#notionWorld')?.sceneMetrics?.renderer",true).catch(()=>false)!==true;i++)await sleep(200);
  console.log(`SKIP local agent flow: Fox's Agent is ${agent.id}, not the local Codex CLI (Codex is not installed where Worldlet looks for it)`);return;}
 if(!store.sampleEnabled())throw Error('the practice world is not open: the launcher sets worldlet.sampleEnabled');
 const status=await agent.status(agent.home('sample'));
 if(status.ready!==true)throw Error('the local Codex Agent is not ready: '+JSON.stringify(status));
 const fox=host.use<FoxService>(FOX);
 const started=Date.now();
 const mark=(step:string)=>console.log(`  ${((Date.now()-started)/1000).toFixed(1).padStart(5)}s  ${step}`);
 const web=view.webContents;
 const js=(code:string)=>web.executeJavaScript(code,true);
 const wait=async(what:string,code:string,seconds:number)=>{
  for(let i=0;i<seconds*5;i++){if(await js(code).catch(()=>false)===true){mark(what);return;}await sleep(200);}
  throw Error(`Timed out after ${seconds}s waiting for: ${what}`);
 };
 const seen=async()=>{try{return await js("JSON.stringify({fox:document.querySelector('#companionDialogue')?.innerText?.slice(0,300)??null,buttons:[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()).filter(Boolean).slice(0,24),locked:document.querySelector('#notionWorld')?.dataset.onboardingLocked??null})");}catch{return 'unavailable';}};
 const button=(label:string)=>`[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;

 // Every foreground turn of the local Harness, with the tool calls Codex made and the World's answers.
 const turns:Turn[]=[];
 const run=LocalHarnessRuntime.prototype.run;
 LocalHarnessRuntime.prototype.run=function(this:LocalHarnessRuntime,body:Row,home:string,onEvent?:AgentEventHandler){
  if(body.action!=='chat'||body._background===true)return run.call(this,body,home,onEvent);
  const turn:Turn={text:String(body.text??''),tools:[],message:'',error:'',done:false};turns.push(turn);
  const observed:AgentEventHandler=async event=>{
   const answer=onEvent?await onEvent(event):null;
   if(event.type==='tool'){
    const call={name:String(event.name),args:event.args&&typeof event.args==='object'?event.args as Row:{},answer:answer&&typeof answer==='object'?answer as Row:null};
    turn.tools.push(call);
    console.log(`         tool ${call.name} ${JSON.stringify(call.args).slice(0,160)} → ${JSON.stringify(call.answer).slice(0,160)}`);
   }
   return answer;
  };
  return run.call(this,body,home,observed).then(result=>{turn.message=typeof result.message==='string'?result.message:'';turn.done=true;return result;},
   error=>{turn.error=message(error);turn.done=true;throw error;});
 };
 try{
  // Any renderer: this check is about Fox's Agent, not drawing (the smoke and onboarding checks judge WebGL).
  await wait('practice world arrival',"!!document.querySelector('#notionWorld')?.sceneMetrics?.renderer",90);
  await wait('Fox ready for a message',"!!document.getElementById('notionInput')&&!!document.getElementById('notionCommand')",30);

  /** Types one message to Fox, as a person does, and waits for Codex's turn to end. */
  const ask=async(text:string):Promise<Turn>=>{
   for(let i=0;i<300&&fox.turnActive();i++)await sleep(200);
   if(fox.turnActive())throw Error('Fox was still busy with an earlier turn');
   // A retry asks the same words again: only a turn begun by this message counts, not the earlier attempt's.
   const before=turns.length;
   const sent=await js(`(()=>{const input=document.getElementById('notionInput'),form=document.getElementById('notionCommand');if(!input||!form)return false;input.value=${JSON.stringify(text)};form.requestSubmit();return true;})()`);
   if(sent!==true)throw Error('could not type to Fox');
   let turn:Turn|undefined;
   for(let i=0;i<TURN_SECONDS*5;i++){turn=turns.slice(before).find(item=>item.text===text&&item.done);if(turn)return turn;await sleep(200);}
   throw Error((turns.slice(before).some(item=>item.text===text)?`Codex did not finish within ${TURN_SECONDS}s`:'the message never reached the local Codex Agent')+`\n  screen: ${await seen()}\n  turns seen: ${JSON.stringify(turns.map(item=>item.text.slice(0,60)))}`);
  };

  const scenarios:Scenario[]=[
   {name:'conversation: answers from mail it read',
    ask:'What is Mia Tan’s invoice email about, and how much is it? Look it up in my mail here.',
    judge:turn=>!turn.tools.some(call=>READS.includes(call.name)&&accepted(call))?'Fox did not read any mail through the World tools'
     :!/2[,.\s]?400/.test(turn.message)?'the reply does not state the $2,400 from the email':null},
   {name:'action: opens an Applet',
    ask:'Open the Weather app.',
    judge:turn=>turn.tools.some(call=>call.name==='open_applet'&&call.args.id==='app-weather'&&accepted(call))?null:'Fox did not open the Weather Applet through the World tools'},
   {name:'mail task: drafts a reply for review, then the practice send is recorded',
    ask:'Sam Okafor emailed me questions before the investor meeting. Read his email and prepare a short reply draft to him saying I will send the numbers tomorrow. Do not send it; I will review it.',
    judge:turn=>{
     const draft=turn.tools.find(call=>call.name==='prepare_email'&&accepted(call));
     if(!draft)return 'Fox did not prepare an email draft the World accepted';
     if(String(draft.args.to).toLowerCase()!=='sam.okafor@example.com')return 'the draft is not addressed to sam.okafor@example.com: '+String(draft.args.to);
     return null;
    },
    after:async()=>{
     // The review Fox showed; Send in the practice world only records the email there.
     await wait('the draft shown for review',`!!document.querySelector('.fox-email-review')&&!!${button('Send')}`,20);
     await js(`${button('Send')}.click();true`);
     await wait('the practice email recorded',`/Email recorded for sam\\.okafor@example\\.com/i.test(document.body.innerText)`,30);
    }}
  ];
  for(const scenario of scenarios){
   let failure='';
   for(let attempt=1;attempt<=2;attempt++){
    try{
     const turn=await ask(scenario.ask);
     failure=turn.error?'the turn failed: '+turn.error:scenario.judge(turn)??'';
     if(!failure&&scenario.after)await scenario.after();
     if(failure)failure+=` (tools: ${turn.tools.map(call=>call.name+(accepted(call)?'':' ✗ '+String(call.answer?.error??'no answer').slice(0,120))).join(', ')||'none'}; reply: ${JSON.stringify(turn.message.slice(0,300))})`;
    }catch(error){failure=message(error);}
    if(!failure){mark(`PASS ${scenario.name}${attempt>1?' (second try)':''}`);break;}
    mark(`attempt ${attempt} of “${scenario.name}” failed: ${failure}`);
   }
   if(failure)throw Error(`${scenario.name}: ${failure}`);
  }
 }finally{LocalHarnessRuntime.prototype.run=run;}
 // Reset Fox starts onboarding on its sign-in page, so the local Agent chosen there is forgotten too
 // (owner report 2026-10-03: after Reset Fox, setup reopened on its apps page).
 await agent.forgetSetupChoice?.();
 const after:string=agent.id;
 if(after!=='hermes'||readSelection(store.root)||readModelSource(store.root))throw Error(`Reset left the local Agent chosen: Fox's Agent is ${after}`);
 mark('PASS reset forgets the local Agent chosen at setup');
 console.log(`PASS local agent flow: Fox on the local Codex CLI talked, read practice mail, opened an Applet and drafted a reply through World tools (${Math.round((Date.now()-started)/1000)}s)`);
}
