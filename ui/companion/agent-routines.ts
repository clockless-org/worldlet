/** Settings › Agent › Routines: the jobs each Agent on this computer runs on its own scheduler (host
 * `harnessSchedule`, contracts/harness-services.ts HarnessSchedule): each with its plain time, where its results go,
 * its newest result and a Paused mark, and whether that scheduler runs now (and how to start it). Pause or Resume, Run
 * now and Remove each run as the Agent's own command after the person confirmed it in plain words (agent-change.ts);
 * creating or changing one is a request to Fox, done in the conversation by the Agent's own tools. After a change the
 * Task panel's Routines read again (`worldlet:routines`). Plain words only: no cron, no prompts. */
import {nextCronRun,routineClock,taskHowOften,taskPlannedWhen} from '../../core/tasks/index.ts';
import type {HarnessJob} from '../../contracts/harness-services.ts';
import {agentButton,agentDay,agentEl as el,confirmAgentChange,type AgentCall} from './agent-change.ts';

type Job={id:string;name:string;paused:boolean;when:HarnessJob['when'];delivery?:string;last?:{at:number;status:'ok'|'failed'|'silent'}};
type Harness={harness:string;title:string;jobs:Job[];running:boolean|null;start?:string;changes:boolean;inUse?:boolean;error?:string};
const fixed=(value:string|undefined)=>!!value&&/^\d+$/.test(value);
/** “Every day at 8:00 AM”, “Every 2 hours”, “Once, Tomorrow 6:00 AM”, “Next Mon 9:00 AM”. */
export function routineWhenLine(when:HarnessJob['when'],now=Date.now(),locale?:string):string {
 if('everySeconds' in when)return taskHowOften(when);
 if('at' in when)return 'Once, '+taskPlannedWhen(when.at,now,locale);
 const how=taskHowOften(when),[minute,hour]=when.cron.trim().split(/\s+/);
 if(how==='On its own schedule')return nextLine(when.cron,now,locale)??how;
 return how!=='Every hour'&&fixed(minute)&&fixed(hour)?how+' at '+routineClock(new Date(now).setHours(Number(hour),Number(minute),0,0),locale):how;
}
const nextLine=(cron:string,now:number,locale?:string)=>{const next=nextCronRun(cron,now);return next?'Next '+taskPlannedWhen(next,now,locale):null;};
const word=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1);
/** Where its results go: the Agent's own channel and, for the Agent Fox talks through, here and the phone. */
export function routineDeliveryLine(job:Job,title:string,inUse:boolean):string {
 const here=inUse?'here and on your phone':'';
 if(job.delivery)return `Sends its results to ${word(job.delivery)}`+(here?`, and ${here}`:'');
 return here?`Its results show ${here}`:`Keeps its results in ${title}`;
}
const STATUS={ok:'done',failed:'did not finish',silent:'nothing to report'} as const;
export function routineLastLine(job:Job):string {return job.last?`Last run ${agentDay(job.last.at)}: ${STATUS[job.last.status]}`:'Not run yet';}

export async function showAgentRoutines(target:HTMLElement,call:AgentCall,current:()=>boolean,{ask}:{ask:(text:string)=>void}){
 const box=el('div','companion-settings-agent-routines'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(box,said);
 const changed=()=>window.dispatchEvent(new CustomEvent('worldlet:routines',{detail:{changed:true}}));
 const ASK={
  pause:{verb:'Pause',question:(t:string,n:string)=>`${t} will pause “${n}”. It does not run until you resume it.`,done:(n:string)=>`“${n}” is paused.`},
  resume:{verb:'Resume',question:(t:string,n:string)=>`${t} will resume “${n}”. It runs on its schedule again.`,done:(n:string)=>`“${n}” runs on its schedule again.`},
  run:{verb:'Run now',question:(t:string,n:string)=>`${t} will run “${n}” once now. Its result comes back like any other run.`,done:(n:string)=>`“${n}” ran.`},
  remove:{verb:'Remove',question:(t:string,n:string)=>`${t} will remove “${n}”. This can’t be undone; ask Fox to set it up again if you need it.`,done:(n:string)=>`“${n}” was removed.`},
 } as const;
 function change(row:HTMLElement,harness:Harness,job:Job,action:keyof typeof ASK){
  const words=ASK[action];
  return confirmAgentChange({call,action:'harnessSchedule',harness:harness.harness,title:harness.title,request:{job:job.id,change:action},where:row,said,current,
   question:words.question(harness.title,job.name),verb:words.verb,working:action==='run'?`${harness.title} is running it…`:`${harness.title} is working on it…`,
   done:async()=>{changed();await draw();said.textContent=words.done(job.name);}});
 }
 async function draw(){
  const listed=await call('harnessSchedule',{operation:'list'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  if(listed?.error)box.append(el('p','companion-info-note',listed.error));
  const harnesses:Harness[]=Array.isArray(listed?.harnesses)?listed.harnesses:[];
  for(const harness of harnesses){
   const rows=el('div','companion-settings-rows');rows.dataset.harness=harness.harness;
   box.append(el('h5','companion-settings-subhead',harness.title+(harness.inUse?' · In use':'')),rows);
   if(harness.error){rows.append(el('p','companion-info-note',harness.error));continue;}
   if(harness.running===true)rows.append(el('p','companion-settings-quiet',`${harness.title}’s scheduler is running.`));
   else if(harness.running===false&&harness.jobs.length){
    const stopped=el('p','companion-info-note',`${harness.title}’s scheduler is not running, so these do not run now.`+(harness.start?' Start it in Terminal: ':''));
    if(harness.start)stopped.append(el('code','',harness.start));
    rows.append(stopped);
   }
   if(!harness.jobs.length)rows.append(el('p','companion-info-note','No routines yet.'));
   for(const job of harness.jobs){
    const row=el('div','companion-settings-row'),words=el('div');row.dataset.job=job.id;
    const name=el('strong','',job.name);if(job.paused)name.append(' ',el('span','companion-settings-tag','Paused'));
    words.append(name,el('span','',routineWhenLine(job.when)+' · '+routineDeliveryLine(job,harness.title,!!harness.inUse)),el('span','companion-settings-quiet',routineLastLine(job)));
    row.append(words);
    if(harness.changes){
     const actions=el('div','companion-settings-actions');
     actions.append(job.paused?agentButton('Resume','resume-job',()=>change(row,harness,job,'resume')):agentButton('Pause','pause-job',()=>change(row,harness,job,'pause')),
      agentButton('Run now','run-job',()=>change(row,harness,job,'run')),agentButton('Remove','remove-job',()=>change(row,harness,job,'remove')));
     row.append(actions);
    }
    rows.append(row);
   }
   if(!harness.changes)rows.append(el('p','companion-info-note',`Change these in ${harness.title} itself.`));
   // New tasks and changes to what one does go through the conversation, done by the Agent's own tools.
   if(harness.inUse)rows.append(agentButton('Ask Fox to set one up or change one','ask-routine',()=>ask(`I want to set up or change a routine in ${harness.title}. Ask me what it should do and when, then make the change with ${harness.title}’s own scheduler.`)));
   else rows.append(el('p','companion-settings-quiet',`To set one up or change what one does, ask ${harness.title} in its own chat.`));
  }
  const using=listed?.current as {title:string}|null|undefined;
  if(using&&!harnesses.some(h=>h.inUse))box.append(el('p','companion-info-note',`${using.title} has no routines of its own.`));
  if(!harnesses.length&&!using&&!listed?.error)box.append(el('p','companion-info-note','No Agent on this computer keeps routines Worldlet can read.'));
 }
 await draw();
}
