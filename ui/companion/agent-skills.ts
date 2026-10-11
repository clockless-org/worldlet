/** Settings › Your Agent › Skills: each Agent's own skills on this computer (host `harnessSkills`,
 * contracts/harness-services.ts HarnessSkills), each with its one-line description, when it last ran (the Agent's own
 * record or the World's synced conversations) and an Off mark; Turn off or Turn on, and Remove where the Agent has its
 * own command for it, each run as that Agent's own command after the person confirmed it (agent-change.ts). Fox's offer
 * to save a task it keeps repeating stays on Fox's page (companion-skills.ts). */
import {skillLastRanLabel} from '../../core/agent/index.ts';
import {agentButton,agentEl as el,confirmAgentChange,type AgentCall} from './agent-change.ts';

type Skill={name:string;description:string;lastRanAt:number|null;enabled?:boolean;removable?:boolean};
type Harness={harness:string;title:string;skills:Skill[];changes:boolean;inUse?:boolean;error?:string;note?:string};

export async function showAgentSkills(target:HTMLElement,call:AgentCall,current:()=>boolean){
 const box=el('div','companion-settings-agent-skills'),said=el('p','companion-settings-status');said.setAttribute('role','status');
 target.append(box,said);
 const ASK={
  disable:{verb:'Turn off',question:(t:string,n:string)=>`${t} will stop using “${n}” until you turn it on again. It stays in its skills.`,done:(t:string,n:string)=>`${t} no longer uses “${n}”. It takes effect in its next conversation.`},
  enable:{verb:'Turn on',question:(t:string,n:string)=>`${t} will use “${n}” again.`,done:(t:string,n:string)=>`${t} uses “${n}” again from its next conversation.`},
  remove:{verb:'Remove',question:(t:string,n:string)=>`${t} will remove “${n}”. This can’t be undone.`,done:(t:string,n:string)=>`“${n}” was removed from ${t}.`},
 } as const;
 function change(row:HTMLElement,harness:Harness,skill:Skill,action:keyof typeof ASK){
  const words=ASK[action];
  return confirmAgentChange({call,action:'harnessSkills',harness:harness.harness,title:harness.title,request:{skill:skill.name,change:action},where:row,said,current,
   question:words.question(harness.title,skill.name),verb:words.verb,working:`${harness.title} is working on it…`,
   done:async()=>{await draw();said.textContent=words.done(harness.title,skill.name);}});
 }
 async function draw(){
  const listed=await call('harnessSkills',{operation:'list'}).catch((e:Error)=>({error:e.message}));
  if(!current())return;
  box.replaceChildren();
  if(listed?.error)box.append(el('p','companion-info-note',listed.error));
  const harnesses:Harness[]=Array.isArray(listed?.harnesses)?listed.harnesses:[],now=Date.now();
  for(const harness of harnesses){
   const rows=el('div','companion-settings-rows');rows.dataset.harness=harness.harness;
   box.append(el('h5','companion-settings-subhead',harness.title+(harness.inUse?' · In use':'')),rows);
   if(harness.error){rows.append(el('p','companion-info-note',harness.error));continue;}
   if(!harness.skills.length)rows.append(el('p','companion-info-note','No skills of its own yet.'));
   for(const skill of harness.skills){
    const row=el('div','companion-settings-row'),words=el('div');row.dataset.skill=skill.name;
    const name=el('strong','',skill.name);if(skill.enabled===false)name.append(' ',el('span','companion-settings-tag','Off'));
    words.append(name,...skill.description?[el('span','',skill.description)]:[],el('span','companion-settings-quiet',skillLastRanLabel(skill.lastRanAt,now)));
    row.append(words);
    if(harness.changes&&(skill.enabled!==undefined||skill.removable)){
     const actions=el('div','companion-settings-actions');
     if(skill.enabled!==undefined)actions.append(skill.enabled?agentButton('Turn off','disable-skill',()=>change(row,harness,skill,'disable')):agentButton('Turn on','enable-skill',()=>change(row,harness,skill,'enable')));
     if(skill.removable)actions.append(agentButton('Remove','remove-skill',()=>change(row,harness,skill,'remove')));
     row.append(actions);
    }
    rows.append(row);
   }
   if(harness.note)rows.append(el('p','companion-info-note',harness.note));
   else if(!harness.changes&&harness.skills.length)rows.append(el('p','companion-info-note',`Change these in ${harness.title} itself.`));
  }
  const using=listed?.current as {title:string}|null|undefined;
  if(using&&!harnesses.some(h=>h.inUse))box.append(el('p','companion-info-note',`${using.title} has no skills of its own Worldlet can read.`));
  if(!harnesses.length&&!using&&!listed?.error)box.append(el('p','companion-info-note','No Agent on this computer keeps skills Worldlet can read.'));
 }
 await draw();
}
