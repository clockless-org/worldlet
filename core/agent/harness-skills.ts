// The `skills` Harness service (contracts/harness-services.ts HarnessSkills) as the World uses it, whichever Agent it is
// (owner parity plan 2026-10-08, blueprint row Skills): the Agent's own skills listed in the World with when each last
// ran, beside the World's own copy of every skill (core/agent/PORTABILITY.md#the-agents-skills-in-the-world), and a
// proposal to save one when Fox has done the same multi-step task again and again. Nothing here knows which Harness it
// is; the host reads and writes the Agent's folder (agent-runtime/harness-skills.ts). Kept ES-compatible for
// JavaScriptCore and Jint.
import type {HarnessSkill,HarnessSkillDraft} from '../../contracts/harness-services.ts';

const DAY=86_400_000;
/** How sure a repeat must be before Fox offers it: the same steps at least `times` times over `days` distinct days in
 * the past `within` days, each a task of at least `steps` different steps, every request sharing a word with the
 * others; at most `proposals` waiting at once. */
export const SKILL_REPEAT={within:14,times:3,days:2,steps:3,proposals:2} as const;
/** A skill name both Hermes Agent and OpenClaw accept (OpenClaw's rule is the narrower: lowercase letters, digits and
 * hyphens), and a description that fits Hermes Agent's 60-character budget for a new skill's index line. */
export const SKILL_LIMITS={name:64,description:60,body:20_000} as const;
const NAME=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Why the draft cannot be saved as it is, or null. */
export function skillDraftProblem(draft:HarnessSkillDraft):string|null {
 if(!draft||typeof draft.name!=='string'||!NAME.test(draft.name)||draft.name.length>SKILL_LIMITS.name)return 'A skill name is lowercase letters, digits and hyphens.';
 if(typeof draft.description!=='string'||!draft.description.trim()||/[\r\n]/.test(draft.description)||draft.description.length>SKILL_LIMITS.description)return `A skill needs a one-line description of at most ${SKILL_LIMITS.description} characters.`;
 if(typeof draft.body!=='string'||!draft.body.trim()||draft.body.length>SKILL_LIMITS.body)return 'A skill needs its steps.';
 return null;
}
/** SKILL.md with only the frontmatter both Agents read (`name`, `description`), then the steps. */
export function skillMarkdown(draft:HarnessSkillDraft):string {
 return `---\nname: ${draft.name}\ndescription: ${JSON.stringify(draft.description.trim())}\n---\n\n${draft.body.trim()}\n`;
}
/** `name` and `description` from a SKILL.md's frontmatter (one-line values, quoted or not), else the folder's name. */
export function skillFrontmatter(markdown:string,folder:string):{name:string;description:string} {
 const head=/^\ufeff?---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1]??'';
 const field=(key:string)=>{const raw=new RegExp('^'+key+':[ \\t]*(.+)$','m').exec(head)?.[1]?.trim()??'';if(/^".*"$/.test(raw))try{return String(JSON.parse(raw));}catch{}return raw.replace(/^'(.*)'$/,'$1').trim();};
 const body=markdown.replace(/^\ufeff?---\r?\n[\s\S]*?\r?\n---\r?\n?/,'').split(/\r?\n\s*\r?\n/).map(part=>part.replace(/^#+\s*/,'').replace(/\s+/g,' ').trim()).find(Boolean)??'';
 return {name:(field('name')||folder).slice(0,SKILL_LIMITS.name),description:(field('description')||body).slice(0,300)};
}

// When each last ran ------------------------------------------------------------------------------

/** Hermes Agent files a `/name` turn as this scaffold (agent/skill_commands.py `_SKILL_INVOCATION_PREFIX`), the name in
 * its first quotes; other Agents keep the line as typed. */
const SCAFFOLD='[IMPORTANT: The user has invoked the "';
/** The skill a person's turn invoked (`/name …` as typed, or Hermes Agent's expanded form), or null. */
export function skillInvocation(text:string):string|null {
 if(typeof text!=='string')return null;
 if(text.startsWith(SCAFFOLD)){const name=text.slice(SCAFFOLD.length).split('"')[0].replace(/^\//,'').trim();return name&&!name.includes(' ')?name.toLowerCase():null;}
 const typed=/^\/([\w][\w.-]{0,63})(?:\s|$)/u.exec(text.trim());
 return typed?typed[1].toLowerCase():null;
}
/** The latest time each skill was invoked in the World's synced turns (`at` in milliseconds; the person's own only). */
export function skillLastRuns(turns:readonly {role:string;text:string;at:number}[]):Map<string,number> {
 const runs=new Map<string,number>();
 for(const turn of turns){
  if(turn.role!=='user'||!Number.isFinite(turn.at))continue;
  const name=skillInvocation(turn.text);
  if(name&&(runs.get(name)??0)<turn.at)runs.set(name,turn.at);
 }
 return runs;
}

// The skills the World shows -------------------------------------------------------------------------

/** One skill as the World lists it: where it is (`agent`: in the Agent's folder; `world`: only the World's copy, kept
 * so changing Agents loses none; `both`) and when it last ran, null when nothing recorded it. */
export type WorldSkill={name:string;description:string;where:'agent'|'world'|'both';lastRanAt:number|null};
export function worldSkills(agent:readonly HarnessSkill[],world:readonly {name:string;description:string}[],runs:ReadonlyMap<string,number>):WorldSkill[] {
 const rows=new Map<string,WorldSkill>();
 const key=(name:string)=>name.trim().toLowerCase();
 for(const skill of agent){
  const id=key(skill.name);if(!id)continue;
  const at=Math.max(skill.lastUsedAt??0,runs.get(id)??0);
  rows.set(id,{name:skill.name,description:skill.description,where:'agent',lastRanAt:at||null});
 }
 for(const skill of world){
  const id=key(skill.name);if(!id)continue;
  const here=rows.get(id);
  if(here){if(here.where==='agent')here.where='both';continue;}
  rows.set(id,{name:skill.name,description:skill.description,where:'world',lastRanAt:runs.get(id)??null});
 }
 return [...rows.values()].sort((a,b)=>(b.lastRanAt??0)-(a.lastRanAt??0)||a.name.localeCompare(b.name));
}
/** "Ran today", "Ran yesterday", "Ran 3 days ago", "Ran on Sep 2"; "Not run yet" when nothing recorded it. */
export function skillLastRanLabel(at:number|null,now:number):string {
 if(!at)return 'Not run yet';
 const days=Math.floor(now/DAY)-Math.floor(at/DAY);
 if(days<=0)return 'Ran today';
 if(days===1)return 'Ran yesterday';
 if(days<30)return `Ran ${days} days ago`;
 const date=new Date(at);
 return 'Ran on '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getUTCMonth()]+' '+date.getUTCDate();
}

// Offering to save a repeated task -------------------------------------------------------------------

/** One of Fox's finished turns as the World keeps its card (ui/companion/fox-thread.ts ThreadEntry): what the person
 * asked, the steps Fox showed, when. */
export type SkillTurn={id:string;user:string;steps:readonly string[];status:string;at:number};
export type SkillProposal={id:string;name:string;description:string;body:string;times:number;lastAt:number;asks:string[]};
const STOP=new Set('the and for with that this from what your you have can please could would about into onto then them they their there here just also some any all are was were will its it’s our out off how who why when where which one two get got let make made show tell give find look check need want like to of in on at by a an is be do me my i it'.split(' '));
const words=(text:string)=>(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[]).filter(word=>!STOP.has(word));
const stepKey=(step:string)=>step.toLowerCase().replace(/[“”"'‘’«»]/g,'').replace(/\d+/g,'#').replace(/[^\p{L}\p{N}#]+/gu,' ').trim();
/** A short stable id for a repeat (FNV-1a over its steps). */
const fnv=(text:string)=>{let h=0x811c9dc5;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return h.toString(36);};
const slug=(parts:string[])=>parts.join('-').normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
const clip=(value:string,limit:number)=>value.length>limit?value.slice(0,limit-1).trimEnd()+'…':value;
const day=(at:number)=>{const d=new Date(at);return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0');};

/** Fox's tasks that repeat, conservatively (SKILL_REPEAT): the same steps in the same order, again and again on
 * different days, for requests that share a word. `known` holds the skill names already there and `decided` the
 * repeats the person already saved or declined; neither is offered again. Newest repeat first. */
export function skillRepeats(turns:readonly SkillTurn[],now:number,{known=new Set<string>(),decided=new Set<string>()}:{known?:ReadonlySet<string>;decided?:ReadonlySet<string>}={}):SkillProposal[] {
 const groups=new Map<string,{steps:string[];turns:SkillTurn[]}>();
 for(const turn of turns){
  if(turn.status!=='done'||!turn.user?.trim()||!Number.isFinite(turn.at)||turn.at<now-SKILL_REPEAT.within*DAY||turn.at>now+DAY)continue;
  const steps=turn.steps.map(step=>String(step).trim()).filter(Boolean),keys=steps.map(stepKey);
  if(new Set(keys).size<SKILL_REPEAT.steps)continue;
  const signature=keys.join(' > ');
  const group=groups.get(signature)??{steps,turns:[]};group.turns.push(turn);groups.set(signature,group);
 }
 const proposals:SkillProposal[]=[];
 for(const [signature,group] of groups){
  const id='repeat-'+fnv(signature);
  if(decided.has(id)||group.turns.length<SKILL_REPEAT.times||new Set(group.turns.map(turn=>day(turn.at))).size<SKILL_REPEAT.days)continue;
  const sorted=[...group.turns].sort((a,b)=>a.at-b.at),sets=sorted.map(turn=>new Set(words(turn.user)));
  const shared=[...sets[0]].filter(word=>sets.every(set=>set.has(word)));
  if(!shared.length)continue;
  const name=slug(shared.slice(0,3))||'repeated-task';
  if(known.has(name))continue;
  const latest=sorted[sorted.length-1],asks=[...new Set(sorted.map(turn=>clip(turn.user.replace(/\s+/g,' ').trim(),160)))].slice(-3);
  const description=clip('Use when asked: '+latest.user.replace(/\s+/g,' ').trim(),SKILL_LIMITS.description-1).replace(/[.…]?$/,'.');
  const body=[`# ${shared.slice(0,3).join(' ')}`,'',`The steps Fox took each time the person asked for this (${sorted.length} times, last on ${day(latest.at)}):`,'',
   ...group.steps.map((step,n)=>`${n+1}. ${step}`),'','Asked as:',...asks.map(ask=>`- “${ask}”`)].join('\n');
  proposals.push({id,name,description,body,times:sorted.length,lastAt:latest.at,asks});
 }
 return proposals.sort((a,b)=>b.lastAt-a.lastAt).slice(0,SKILL_REPEAT.proposals);
}
