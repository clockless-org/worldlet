// Settings › Agents's controls for the Agent's own scheduled jobs and skills (owner plan 2026-10-11, PR 2): each
// change is one of the Agent's own commands, shown to the person before it runs, never an edit Worldlet makes to the
// Agent's files. Every command here was checked against the Agent's own source and documentation at the oldest version
// Worldlet supports (agent/agents/agent-versions.ts) and at its current release:
// - Hermes Agent (hermes_cli/subcommands/cron.py, skills.py, config.py; website/docs/reference/cli-commands.md):
//   `hermes cron pause|resume|run|remove <job_id>`; a skill turned off or on with `hermes config set skills.disabled
//   <list>` (the documented `skills.disabled` list its interactive `hermes skills config` writes, read back with
//   `hermes config get skills.disabled --json --raw`); `hermes skills uninstall <name> --yes` removes only a skill it
//   installed from its hub (tools/skills_hub_install.py refuses any other), so only those offer Remove.
// - OpenClaw (src/cli/cron-cli/register.cron-simple.ts, docs/cli/cron.md, docs/tools/skills.md, docs/cli/config.md):
//   `openclaw cron disable|enable|run|rm <id>` (they need its running Gateway);
//   a new time with `hermes cron edit <id> --schedule <expr|every Nh>` or `openclaw cron edit <id> --cron <expr>|--every
//   <Nh>`, a new name or prompt with the same `edit` and `--name <name>` / `--prompt <text>` (Hermes Agent) or `--name
//   <name>` / `--message <text>` (OpenClaw, checked at 2026.8.1), and a new job with `hermes cron create <schedule> <prompt> --name <name>` or `openclaw cron add --name <name>
//   --message <prompt> --cron <expr>|--every <Nh>` (both checked at Hermes Agent 0.21.4 and OpenClaw 2026.8.1 too); a skill turned off or on with `openclaw
//   config set skills.entries.<key>.enabled false|true --strict-json`. It has no command of its own that removes a
//   skill (its docs send people to the separate `clawhub uninstall`), so OpenClaw's skills offer no Remove.
// Kept ES-compatible for JavaScriptCore and Jint.
import type {HarnessJob,HarnessJobAction,HarnessJobChange,HarnessJobCreate,HarnessSkillChange,RoutineSchedule} from '../../contracts/harness-services.ts';
import {hermesConfigValues} from './harness-tools.ts';

export const JOB_ACTIONS:readonly HarnessJobAction[]=['pause','resume','run','remove','reschedule','edit'];
export const SKILL_ACTIONS:readonly HarnessSkillChange['action'][]=['disable','enable','remove'];
/** An id or name the Agent gave a job or skill, safe as one argument of its command: never a flag, no control
 * characters, no path separators. */
const ARGUMENT=/^[A-Za-z0-9_][A-Za-z0-9_.:@+-]{0,127}$/;
export const isControlArgument=(value:unknown):value is string=>typeof value==='string'&&ARGUMENT.test(value);

/** A time from the page: every day at a clock time, or every 1 to 24 hours. */
export function readRoutineSchedule(value:unknown):RoutineSchedule {
 const v=value&&typeof value==='object'?value as Record<string,any>:{};
 const whole=(n:unknown,low:number,high:number)=>Number.isInteger(n)&&(n as number)>=low&&(n as number)<=high;
 if(v.daily&&whole(v.daily.hour,0,23)&&whole(v.daily.minute,0,59))return {daily:{hour:v.daily.hour,minute:v.daily.minute}};
 if(whole(v.everyHours,1,24))return {everyHours:v.everyHours};
 throw Error('Choose when it runs.');
}
/** The change as the host reads it from the page, or why it cannot run. */
export function readJobChange(value:unknown):HarnessJobChange {
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 if(!isControlArgument(v.job))throw Error('This scheduled task is no longer there.');
 if(!JOB_ACTIONS.includes(v.action as HarnessJobAction))throw Error('Unknown change.');
 if(v.action==='reschedule')return {job:v.job,action:'reschedule',schedule:readRoutineSchedule(v.schedule)};
 if(v.action==='edit'){
  const edit:HarnessJobChange={job:v.job,action:'edit'};
  if(v.name!==undefined)edit.name=plainText(v.name,80,'its name');
  if(v.prompt!==undefined)edit.prompt=plainText(v.prompt,2000,'what it should do');
  if(v.schedule!==undefined)edit.schedule=readRoutineSchedule(v.schedule);
  if(!edit.name&&!edit.prompt&&!edit.schedule)throw Error('Change its name, what it does or when it runs.');
  return edit;
 }
 return {job:v.job,action:v.action as HarnessJobAction};
}
/** One line of plain text, never read as a flag by the Agent's command line. */
const plainText=(value:unknown,max:number,what:string)=>{
 const text=typeof value==='string'?value.replace(/\s+/g,' ').trim():'';
 if(!text)throw Error(`Say ${what}.`);
 if(text.length>max)throw Error(`Keep ${what} under ${max} characters.`);
 if(text.startsWith('-'))throw Error(`Start ${what} with a word.`);
 return text;
};
/** A new job as the host reads it from the page. */
export function readJobCreate(value:unknown):HarnessJobCreate {
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {name:plainText(v.name,80,'its name'),prompt:plainText(v.prompt,2000,'what it should do'),schedule:readRoutineSchedule(v.schedule)};
}
/** The cron expression for a daily time (the Agent's own clock: this computer's time zone). */
const dailyCron=(time:{hour:number;minute:number})=>`${time.minute} ${time.hour} * * *`;
/** Hermes Agent's schedule text: a cron expression, or `every Nh`. */
const hermesSchedule=(schedule:RoutineSchedule)=>'daily' in schedule?dailyCron(schedule.daily):`every ${schedule.everyHours}h`;
/** OpenClaw's schedule options: `--cron <expr>` or `--every <Nh>`. */
const openClawSchedule=(schedule:RoutineSchedule)=>'daily' in schedule?['--cron',dailyCron(schedule.daily)]:['--every',`${schedule.everyHours}h`];
/** Hermes Agent: `hermes cron create <schedule> <prompt> --name <name>`. */
export function hermesJobCreateCommand(job:HarnessJobCreate):string[] {return ['cron','create',hermesSchedule(job.schedule),job.prompt,'--name',job.name];}
/** OpenClaw: `openclaw cron add --name <name> --message <prompt> --cron <expr>|--every <Nh>`. */
export function openClawJobCreateCommand(job:HarnessJobCreate):string[] {return ['cron','add','--name',job.name,'--message',job.prompt,...openClawSchedule(job.schedule)];}
/** Whether a job's time is the schedule asked for. */
export function scheduleMatches(when:HarnessJob['when'],schedule:RoutineSchedule):boolean {
 if('everyHours' in schedule)return 'everySeconds' in when&&when.everySeconds===schedule.everyHours*3600;
 if(!('cron' in when))return false;
 const [minute,hour,...rest]=when.cron.trim().split(/\s+/);
 return Number(minute)===schedule.daily.minute&&Number(hour)===schedule.daily.hour&&rest.join(' ')==='* * *';
}
export function readSkillChange(value:unknown):HarnessSkillChange {
 const v=value&&typeof value==='object'?value as Record<string,unknown>:{};
 if(!isControlArgument(v.skill))throw Error('This skill is no longer there.');
 if(!SKILL_ACTIONS.includes(v.action as HarnessSkillChange['action']))throw Error('Unknown change.');
 return {skill:v.skill,action:v.action as HarnessSkillChange['action']};
}

// Scheduled jobs ---------------------------------------------------------------------------------------------------

/** Hermes Agent: `hermes cron pause|resume|run|remove <job_id>`, or `hermes cron edit <job_id> --name … --prompt …
 * --schedule …`. */
export function hermesJobCommand(change:HarnessJobChange):string[] {
 if(change.action==='reschedule')return ['cron','edit',change.job,'--schedule',hermesSchedule(change.schedule!)];
 if(change.action==='edit')return ['cron','edit',change.job,...change.name?['--name',change.name]:[],...change.prompt?['--prompt',change.prompt]:[],...change.schedule?['--schedule',hermesSchedule(change.schedule)]:[]];
 return ['cron',change.action,change.job];
}
/** OpenClaw: `openclaw cron disable|enable|run|rm <id>`, or `openclaw cron edit <id> --name … --message … --cron …|--every …`. */
export function openClawJobCommand(change:HarnessJobChange):string[] {
 if(change.action==='reschedule')return ['cron','edit',change.job,...openClawSchedule(change.schedule!)];
 if(change.action==='edit')return ['cron','edit',change.job,...change.name?['--name',change.name]:[],...change.prompt?['--message',change.prompt]:[],...change.schedule?openClawSchedule(change.schedule):[]];
 return ['cron',{pause:'disable',resume:'enable',run:'run',remove:'rm'}[change.action as 'pause'|'resume'|'run'|'remove'],change.job];
}
/** Whether the change is offered for this job now: Pause only when it runs, Resume only when paused. */
export function jobChangeOffered(job:HarnessJob,action:HarnessJobAction):boolean {
 return action==='pause'?!job.paused:action==='resume'?job.paused:true;
}
/** Whether the jobs read after the command show the change (a run leaves the job as it was). */
export function jobChangeDone(jobs:readonly HarnessJob[],change:HarnessJobChange):boolean {
 const job=jobs.find(item=>item.id===change.job);
 if(change.action==='reschedule')return !!job&&scheduleMatches(job.when,change.schedule!);
 // An edit reads back its name and time; a new prompt is the Agent's to keep (the World never reads prompts back).
 if(change.action==='edit')return !!job&&(!change.name||job.name===change.name)&&(!change.schedule||scheduleMatches(job.when,change.schedule));
 return change.action==='remove'?!job:change.action==='pause'?!!job?.paused:change.action==='resume'?!!job&&!job.paused:!!job;
}

// Skills -----------------------------------------------------------------------------------------------------------

/** A list Hermes Agent's config holds as a YAML list or, after `hermes config set`, as its JSON text. */
function nameList(value:unknown):string[] {
 if(typeof value==='string'&&value.trim().startsWith('[')){
  const text=value.trim();
  try{value=JSON.parse(text);}catch{try{value=JSON.parse(text.replace(/'/g,'"'));}catch{return [];}}
 }
 if(typeof value==='string')value=value.trim()?[value]:[];
 return Array.isArray(value)?[...new Set(value.map(item=>String(item).trim()).filter(Boolean))]:[];
}
/** The skills turned off in a Hermes Agent home's config.yaml (`skills.disabled`). */
export function hermesDisabledSkills(yaml:string):string[] {
 const skills=hermesConfigValues(yaml).skills;
 return nameList(skills&&typeof skills==='object'?(skills as Record<string,unknown>).disabled:undefined);
}
/** The `skills.disabled` list after the change, from the list `hermes config get skills.disabled --json --raw` printed;
 * null when nothing would change. */
export function hermesDisabledAfter(current:unknown,change:HarnessSkillChange):string[]|null {
 const list=nameList(current),has=list.includes(change.skill);
 if(change.action==='disable')return has?null:[...list,change.skill];
 if(change.action==='enable')return has?list.filter(name=>name!==change.skill):null;
 return null;
}
/** Hermes Agent: `hermes config set skills.disabled <json list>` or `hermes skills uninstall <name> --yes`. */
export function hermesSkillCommand(change:HarnessSkillChange,disabled:string[]|null):string[] {
 return change.action==='remove'?['skills','uninstall',change.skill,'--yes']:['config','set','skills.disabled',JSON.stringify(disabled??[])];
}
/** The skills Hermes Agent installed from its hub (`skills/.hub/lock.json` `installed`), the ones its uninstall removes. */
export function hermesHubSkills(lock:unknown):Set<string> {
 const installed=lock&&typeof lock==='object'?(lock as Record<string,any>).installed:null;
 return new Set(installed&&typeof installed==='object'&&!Array.isArray(installed)?Object.keys(installed):[]);
}
/** The key OpenClaw's `skills.entries` uses for a skill: its `metadata.openclaw.skillKey` when it declares one, else
 * its name; null when it cannot be one segment of a config path. */
export function openClawSkillKey(name:string,markdown=''):string|null {
 const key=/"skillKey"\s*:\s*"([^"]+)"/.exec(markdown)?.[1]??/^\s*skillKey:\s*["']?([^"'\s#]+)/m.exec(markdown)?.[1]??name;
 return /^[A-Za-z0-9_-]{1,64}$/.test(key)?key:null;
}
/** Whether OpenClaw's config turns the skill off (`skills.entries.<key>.enabled: false`). */
export function openClawSkillEnabled(config:unknown,key:string):boolean {
 const entries=(config as any)?.skills?.entries;
 return !(entries&&typeof entries==='object'&&entries[key]&&typeof entries[key]==='object'&&entries[key].enabled===false);
}
/** OpenClaw: `openclaw config set skills.entries.<key>.enabled false|true --strict-json`; null for Remove, which it has
 * no command of its own for. */
export function openClawSkillCommand(change:HarnessSkillChange,key:string):string[]|null {
 if(change.action==='remove')return null;
 return ['config','set',`skills.entries.${key}.enabled`,change.action==='disable'?'false':'true','--strict-json'];
}
