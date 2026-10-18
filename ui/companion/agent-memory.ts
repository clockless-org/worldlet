/** Settings › Context (owner decision 2026-10-11): what each Agent on this computer remembers, read where it
 * keeps it (host `harnessMemory`, contracts/harness-services.ts HarnessMemory), as About you and What it remembers, the
 * first few of each with Show all. Read only: Worldlet never edits an Agent's memory. For the Agent Fox talks through,
 * Ask it to forget closes Settings and asks it in Fox's conversation, where its own memory does it; another Agent is
 * asked in its own chat. Fox's own saved memory stays on Fox's page. */
import {memoryForgetRequest} from '../../core/agent/index.ts';
import {agentButton,agentEl as el,type AgentCall} from './agent-change.ts';

type Entry={id:string;kind:'user'|'memory';text:string;where:string};
type Harness={harness:string;title:string;entries:Entry[];inUse?:boolean;error?:string};
const FIRST=4;
const GROUPS=[{kind:'user',title:'About you'},{kind:'memory',title:'What it remembers'}] as const;

export async function showAgentMemory(target:HTMLElement,call:AgentCall,current:()=>boolean,{ask}:{ask:(text:string)=>void}){
 const box=el('div','companion-settings-agent-memory');
 target.append(box);
 const open=new Set<string>();
 function group(harness:Harness,kind:Entry['kind'],title:string):HTMLElement|null {
  const entries=harness.entries.filter(entry=>entry.kind===kind);
  if(!entries.length)return null;
  const key=harness.harness+':'+kind,all=open.has(key),wrap=el('div','companion-settings-rows');wrap.dataset.memory=kind;
  wrap.append(el('strong','companion-settings-memory-group',`${title} · ${entries.length}`));
  for(const entry of all?entries:entries.slice(0,FIRST)){
   const row=el('div','companion-settings-row'),words=el('div');row.dataset.entry=entry.id;
   words.append(el('span','companion-settings-memory-text',entry.text));
   row.append(words);
   if(harness.inUse)row.append(agentButton('Ask it to forget','forget-memory',()=>ask(memoryForgetRequest(harness.title,entry))));
   wrap.append(row);
  }
  if(entries.length>FIRST)wrap.append(agentButton(all?'Show fewer':`Show all ${entries.length}`,'more-memory',()=>{all?open.delete(key):open.add(key);void draw();}));
  return wrap;
 }
 async function draw(){
  const listed=await call('harnessMemory',{operation:'list'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  if(listed?.error)box.append(el('p','companion-info-note',listed.error));
  const harnesses:Harness[]=Array.isArray(listed?.harnesses)?listed.harnesses:[];
  const using=listed?.current&&typeof listed.current.title==='string'?listed.current as {harness:string;title:string}:null;
  for(const harness of harnesses){
   const part=el('div','companion-settings-memory');part.dataset.harness=harness.harness;
   box.append(el('h5','companion-settings-subhead',harness.title+(harness.inUse?' · In use':'')),part);
   if(harness.error){part.append(el('p','companion-info-note',harness.error));continue;}
   const groups=GROUPS.map(g=>group(harness,g.kind,g.title)).filter((g):g is HTMLElement=>g!==null);
   if(!groups.length){part.append(el('p','companion-info-note','Nothing yet.'));continue;}
   part.append(...groups,el('p','companion-info-note',harness.inUse?`Worldlet only shows this. Ask it to forget sends ${harness.title} the request in Fox’s conversation.`:`Worldlet only shows this. To have ${harness.title} forget something, ask it in its own chat.`));
  }
  if(using&&!harnesses.some(h=>h.inUse))box.append(el('p','companion-info-note',`${using.title} keeps its memory where Worldlet cannot read it, so it is not shown here.`));
  if(!harnesses.length&&!using&&!listed?.error)box.append(el('p','companion-info-note','No Agent on this computer keeps a memory Worldlet can read.'));
 }
 await draw();
}
