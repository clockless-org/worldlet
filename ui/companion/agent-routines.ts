/** Settings › Agent › Routines: the jobs each Agent on this computer runs on its own scheduler (host
 * `harnessSchedule`, contracts/harness-services.ts HarnessSchedule): each with its plain time, where its results go,
 * its newest result and a Paused mark, and whether that scheduler runs now (and Start it, the Agent's own command). Pause or Resume, Run
 * now and Remove each run as the Agent's own command after the person confirmed it in plain words (agent-change.ts);
 * creating or changing one is a request to Fox, done in the conversation by the Agent's own tools. After a change the
 * Task panel's Routines read again (`worldlet:routines`). Plain words only: no cron, no prompts.
 * Above them, Worldlet's own two default Routines (core/artifacts/daily.ts): Today's prep and Wrap up today, which
 * Worldlet runs by asking the Agent at that time. Pause and Resume change only Worldlet's setting (host
 * `foxPreferenceChange` `daily_routines`), never the Agent. */
import {nextCronRun,routineClock,taskHowOften,taskPlannedWhen} from '../../core/tasks/index.ts';
import type {HarnessJob} from '../../contracts/harness-services.ts';
import {DAILY_PLAN_HOUR,DAILY_SUMMARY_HOUR,DAILY_ROUTINE_NAMES,readDailyRoutines} from '../../core/artifacts/index.ts';
import {agentButton,agentDay,agentEl as el,confirmAgentChange,type AgentCall} from './agent-change.ts';

type Job={id:string;name:string;paused:boolean;when:HarnessJob['when'];delivery?:string;last?:{at:number;status:'ok'|'failed'|'silent'}};
type Harness={harness:string;title:string;jobs:Job[];running:boolean|null;canStart?:boolean;changes:boolean;inUse?:boolean;error?:string};
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

/** What each of Worldlet's two default Routines does, in one line. */
const DAILY_LINES={
 plan:'What was done overnight, today’s schedule and reply drafts for mail that needs one, as one Attention card',
 summary:'What is still open and what to prepare for tomorrow, from today’s conversation, kept in the Journal with one Attention card',
} as const;
async function showWorldletRoutines(box:HTMLElement,call:AgentCall,current:()=>boolean,said:HTMLElement){
 const info=await call('foxPreferences').catch(()=>null);
 if(!current()||!info||!info.dailyRoutines)return;
 const on=readDailyRoutines(info.dailyRoutines),rows=el('div','companion-settings-rows');rows.dataset.harness='worldlet';
 box.append(el('h5','companion-settings-subhead','Worldlet'),rows,el('p','companion-settings-quiet','Worldlet runs these by asking your Agent at that time; nothing is added to your Agent’s own scheduler.'));
 for(const kind of ['plan','summary'] as const){
  const row=el('div','companion-settings-row'),words=el('div'),name=el('strong','',DAILY_ROUTINE_NAMES[kind]);row.dataset.job='worldlet:'+kind;
  if(!on[kind])name.append(' ',el('span','companion-settings-tag','Paused'));
  const clock=routineClock(new Date().setHours(kind==='plan'?DAILY_PLAN_HOUR:DAILY_SUMMARY_HOUR,0,0,0));
  words.append(name,el('span','','Every day at '+clock+' · '+DAILY_LINES[kind]));
  const actions=el('div','companion-settings-actions');
  actions.append(agentButton(on[kind]?'Pause':'Resume',on[kind]?'pause-job':'resume-job',async()=>{
   try{
    await call('foxPreferenceChange',{setting:'daily_routines',value:{[kind]:!on[kind]}});
    if(!current())return;
    box.replaceChildren();await showWorldletRoutines(box,call,current,said);
    said.textContent=on[kind]?`“${DAILY_ROUTINE_NAMES[kind]}” is paused.`:`“${DAILY_ROUTINE_NAMES[kind]}” runs every day again.`;
   }catch(e){said.textContent=(e as Error).message||'Could not change it.';}
  }));
  row.append(words,actions);rows.append(row);
 }
}

export async function showAgentRoutines(target:HTMLElement,call:AgentCall,current:()=>boolean,{ask}:{ask:(text:string)=>void}){
 const own=el('div','companion-settings-worldlet-routines'),box=el('div','companion-settings-agent-routines'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(own,box,said);
 await showWorldletRoutines(own,call,current,said);
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
    const stopped=el('div','companion-settings-row');stopped.dataset.scheduler='stopped';
    stopped.append(el('p','companion-info-note',`${harness.title}’s scheduler is not running, so these do not run now.`));
    // Start runs the Agent's own start command after one more ask in the page; it also starts with the computer from then on.
    if(harness.canStart)stopped.append(agentButton('Start it','start-scheduler',()=>{
     for(const open of box.querySelectorAll?.('.companion-settings-confirm')??[])open.remove();
     const ask=el('div','companion-settings-confirm');ask.setAttribute('role','group');
     ask.append(el('span','',`${harness.title} will start its scheduler and keep it running whenever this computer is on.`),
      agentButton('Start','confirm-start',async()=>{
       said.textContent=`${harness.title} is starting it…`;
       try{await call('harnessSchedule',{operation:'start',harness:harness.harness});if(ask.isConnected)ask.remove();await draw();said.textContent=`${harness.title}’s routines run on schedule again.`;}
       catch(e){said.textContent=(e as Error).message||'It did not start.';if(ask.isConnected)ask.remove();}
      },true),
      agentButton('Cancel','cancel-start',()=>{ask.remove();said.textContent='Nothing was changed.';}));
     stopped.append(ask);
    },true));
    else stopped.append(el('p','companion-settings-quiet',`Start it in ${harness.title} itself.`));
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
