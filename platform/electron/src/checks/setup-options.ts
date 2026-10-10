import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Menu,type MenuItem} from 'electron';
import {readSelection} from '../modules/agent-runtime/local-harness.ts';
import {readAdopted} from '../modules/agent-runtime/local-memory.ts';
import type {CheckContext} from './index.ts';
import {SETUP_OPTIONS,type SetupOption} from './setup-option-names.ts';
import {setTimeout as sleep} from 'node:timers/promises';

// RC setup options (#1503): every way in on setup's one page, one launch on one fresh library each
// (development builds only; launcher scripts/setup-options.ts). Mock Google; Continue with Codex (the
// host's own sign-in becomes Fox's model); OpenClaw, Claude Code, pi and Hermes Agent, each brought in
// from the launcher's fixture homes on setup's page (owner requests 2026-10-04, 2026-10-09: choosing an Agent
// brings it), so the World's database and the companion profile must hold what it brought. Each
// option then enters the World and Fox must answer on that choice: after a bring, a question only the
// brought memory answers. Ends with Quit Completely; the launcher proves nothing was left running.
const TURN_SECONDS=Number(process.env.WORLDLET_SETUP_TURN_SECONDS||150);

/** What a bring must leave (scripts/setup-fixtures.ts FIXTURE_EXPECTATIONS), passed by the launcher. */
interface Expectation {name:string|null;fact:string;ask:string;answer:string;turns:number;notes:number;skills:number;routines:number}

export async function setupOptions({host,view}:CheckContext){
 const {store}=host;
 const disposable=process.env.WORLDLET_PROFILE_ROOT;
 if(host.profile.channel!=='dev'||!disposable||path.resolve(disposable)!==path.resolve(store.root))throw Error('needs a disposable development library: start with scripts/setup-options.ts (npm run test:onboarding:options)');
 const option=process.env.WORLDLET_SETUP_OPTION as SetupOption;
 if(!SETUP_OPTIONS.includes(option))throw Error(`WORLDLET_SETUP_OPTION must be one of ${SETUP_OPTIONS.join(', ')}`);
 if(store.state.onboarding?.completed===true||store.state.connections.length)throw Error('the library is not fresh: '+store.root);
 const agent=option==='google'?null:option;
 // Codex is brought too, from this computer's own Codex: the fixture expectations cover only the others.
 const bring=agent!==null&&agent!=='codex';
 const expected:Expectation|null=bring?JSON.parse(process.env.WORLDLET_SETUP_EXPECT||'null'):null;
 if(bring&&!expected)throw Error('WORLDLET_SETUP_EXPECT is missing for '+option);
 const started=Date.now();
 const mark=(step:string)=>console.log(`  ${((Date.now()-started)/1000).toFixed(1).padStart(5)}s  ${step}`);
 const web=view.webContents;
 const js=(code:string)=>web.executeJavaScript(code,true);
 const seen=async()=>{try{return await js("JSON.stringify({fox:document.querySelector('#companionDialogue')?.innerText?.slice(0,300)??null,notes:[...document.querySelectorAll('.setup-note,.setup-error')].map(e=>e.textContent.trim()).filter(Boolean),buttons:[...document.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim()).filter(Boolean).slice(0,24),tour:document.querySelector('#notionWorld')?.dataset.tourStep??null})");}catch{return 'unavailable';}};
 const wait=async(what:string,code:string,seconds:number)=>{
  for(let i=0;i<seconds*5;i++){if(await js(code).catch(()=>false)===true){mark(what);return;}await sleep(200);}
  throw Error(`Timed out after ${seconds}s waiting for: ${what}\n  screen: ${await seen()}`);
 };
 const button=(label:string)=>`[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`;
 const press=async(label:string,seconds=30)=>{await wait(`button “${label}”`,`!!${button(label)}`,seconds);await js(`${button(label)}.click();true`);};
 const shown=(selector:string)=>`[...document.querySelectorAll(${JSON.stringify(selector)})].some(e=>e.offsetParent)`;
 const appsPage=`!!${button('Enter your world')}`;
 const available="[...document.querySelectorAll(':is(.setup-agent-default,.setup-agent-button):not(.is-missing)')].filter(b=>!b.disabled).map(b=>b.dataset.agent)";

 await wait('the setup page',shown('.setup-choose'),90);
 if(agent===null){
  // Google is under More options (owner request 2026-10-09).
  await js("document.querySelector('.setup-more-toggle').click();true");
  await press('Use mock Google (Dev)');
  await wait('Enter your world',appsPage,180);
  const live=['gmail','google-calendar'].filter(provider=>store.state.connections.some((c:any)=>c.provider===provider));
  if(live.length!==2)throw Error('mock Google reached Enter your world without Mail and Calendar connected: '+JSON.stringify(store.state.connections.map((c:any)=>c.provider)));
 }else{
  // Done once the loading cards are gone: while detection runs, More options lists every Agent as missing.
  await wait('local Agent detection',`(!document.querySelector('.setup-agent-cards.is-loading')&&(${available}.length>0||!!document.querySelector('.setup-agent-button.is-missing')))`,90);
  const found=await js(available) as string[];
  if(!found.includes(agent)){
   if(agent==='codex'){console.log('SKIP setup options codex: Codex is not installed where Worldlet looks for it');return;}
   throw Error(`setup did not find the fixture ${agent} (found: ${found.join(', ')||'none'})`);
  }
  await js(`document.querySelector(':is(.setup-agent-default,.setup-agent-button)[data-agent=${JSON.stringify(agent)}]').click();true`);
  mark('picked '+agent);
  // Build your world brings the picked Agent on the same page; Enter your world turns on once everything came over.
  await js("document.querySelector('.setup-next').click();true");
  await wait('the Agent moving in',shown('.setup-import'),300);
  await wait('the Agent brought in',appsPage,300);
  const choice=readSelection(store.root)??readAdopted(store.root);
  if(choice!==agent)throw Error(`Enter your world showed, but the library has ${choice??'no'} local Agent chosen, not ${agent}`);
  if(bring)broughtCheck(store.root,store.ledger(),agent,expected);
  mark(bring?`${agent}’s memory, conversations, notes, skills and routines are in the World`:'Fox runs on the Codex sign-in');
 }

 await press('Enter your world',120);
 await wait('world arrival',"!!document.querySelector('#notionWorld')?.sceneMetrics?.renderer",90);
 await wait('Fox ready for a message',"!!document.getElementById('notionInput')&&!!document.getElementById('notionCommand')",60);
 // Fox answers on this choice; after a bring only the brought memory knows the answer.
 const token='lantern'+crypto.randomInt(1000,9999);
 const question=expected?.ask??`Reply with only this word and nothing else: ${token}`;
 const answer=new RegExp(expected?.answer??token,'i');
 let failure='';
 for(let attempt=1;attempt<=2;attempt++){
  failure=await ask(question,answer);
  if(!failure){mark(`Fox answered${attempt>1?' (second try)':''}`);break;}
  mark(`attempt ${attempt}: ${failure}`);
 }
 if(failure)throw Error(`Fox did not answer on ${option}: ${failure}\n  screen: ${await seen()}`);
 await quitCompletely(`${option}: reached the World and Fox answered`);

 /** Types one message to Fox, as a person does; the answer is Fox's next turn in the World's database. */
 async function ask(text:string,pattern:RegExp):Promise<string> {
  const db=store.ledger(),before=db.companionTurns('fox').length;
  const sent=await js(`(()=>{const input=document.getElementById('notionInput'),form=document.getElementById('notionCommand');if(!input||!form)return false;input.value=${JSON.stringify(text)};form.requestSubmit();return true;})()`);
  if(sent!==true)return 'could not type to Fox';
  for(let i=0;i<TURN_SECONDS*5;i++){
   const turns=db.companionTurns('fox').slice(before),asked=turns.findIndex(turn=>turn.role==='user'&&turn.text===text);
   const reply=asked<0?undefined:turns.slice(asked+1).find(turn=>turn.role==='assistant');
   if(reply)return pattern.test(String(reply.text))?'':`the reply does not match ${pattern}: ${JSON.stringify(String(reply.text).slice(0,300))}`;
   // Fox records the question as its turn starts; a page that refuses it (no model yet) records nothing.
   if(asked<0&&i>=225)return 'Fox started no turn for it within 45s (see Fox’s card below)';
   await sleep(200);
  }
  return db.companionTurns('fox').slice(before).some(turn=>turn.text===text)?`no answer within ${TURN_SECONDS}s`:'Fox started no turn for it';
 }
 async function quitCompletely(what:string){
  const find=(items:MenuItem[]):MenuItem|undefined=>{for(const item of items){if(item.label==='Quit Completely')return item;const inner=item.submenu&&find(item.submenu.items);if(inner)return inner;}return undefined;};
  const quit=find(Menu.getApplicationMenu()?.items??[]);
  if(!quit)throw Error('the app menu has no Quit Completely');
  console.log(`PASS setup options ${option}: ${what} (${Math.round((Date.now()-started)/1000)}s); Quit Completely`);
  quit.click();
  await new Promise(()=>{});
 }
}

/** After a bring: the World's database and the companion profile hold what `agent` brought;
 * with no expectation (`expected` null), nothing from it. */
export function broughtCheck(root:string,db:{companionCounts():Record<string,{turns:number;notes:number}>;broughtStores():{source:string;skills:Record<string,unknown>;routines:unknown[]}[]},agent:string,expected:Expectation|null){
 const counts=db.companionCounts()[agent]??{turns:0,notes:0};
 const stored=db.broughtStores().find(item=>item.source===agent),skills=Object.keys(stored?.skills??{}).length,routines=stored?.routines.length??0;
 let profile='';
 try{profile=fs.readFileSync(path.join(root,'companion','profile.json'),'utf8');}catch{}
 if(!expected){
  if(counts.turns||counts.notes||skills||routines)throw Error(`nothing was to be brought, but ${agent} still brought: ${JSON.stringify({...counts,skills,routines})}`);
  return;
 }
 const short=[['companion_turns',counts.turns,expected.turns],['companion_notes',counts.notes,expected.notes],['brought_skills',skills,expected.skills],['brought_routines',routines,expected.routines]].filter(([,n,want])=>Number(n)<Number(want));
 if(short.length)throw Error(`after the bring, world.sqlite holds too little from ${agent}: ${short.map(([table,n,want])=>`${table} ${n} (expected at least ${want})`).join(', ')}`);
 if(!profile.includes(JSON.stringify(expected.fact).slice(1,-1)))throw Error(`the companion profile does not hold ${agent}’s memory (“${expected.fact}”)`);
 if(expected.name&&!profile.includes(JSON.stringify(expected.name)))throw Error(`Fox did not take ${agent}’s name ${expected.name}`);
}
