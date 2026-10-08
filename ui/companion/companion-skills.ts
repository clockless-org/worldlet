/** The skills on the Profile page's “What Fox knows” (core/agent/PORTABILITY.md#the-agents-skills-in-the-world): each
 * skill with when it last ran and whether it lives in the person's Agent, the World's copy or both, and Fox's offer to
 * save a task it keeps repeating, as a card the person confirms (Save as a skill) or turns down (Not now). */
import {skillLastRanLabel,type SkillProposal,type WorldSkill} from '../../core/agent/index.ts';

export type FoxSkills={skills:WorldSkill[];proposals:SkillProposal[];saves:'agent'|'world';agent:string|null};
const record=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function readFoxSkills(value:unknown):FoxSkills|null {
 if(!record(value)||!Array.isArray(value.skills)||!Array.isArray(value.proposals))return null;
 const skills=value.skills.filter(record).filter(s=>typeof s.name==='string').map(s=>({name:String(s.name),description:typeof s.description==='string'?s.description:'',
  where:(['agent','world','both'].includes(s.where)?s.where:'world') as WorldSkill['where'],lastRanAt:typeof s.lastRanAt==='number'?s.lastRanAt:null}));
 const proposals=value.proposals.filter(record).filter(p=>typeof p.id==='string'&&typeof p.name==='string').map(p=>({id:String(p.id),name:String(p.name),description:String(p.description??''),body:String(p.body??''),
  times:Number(p.times)||0,lastAt:Number(p.lastAt)||0,asks:Array.isArray(p.asks)?p.asks.filter((a:unknown)=>typeof a==='string'):[]}));
 return {skills,proposals,saves:value.saves==='agent'?'agent':'world',agent:typeof value.agent==='string'?value.agent:null};
}
const WHERE={agent:'In your Agent',world:'Kept in the World',both:'In your Agent and the World'} as const;
/** Fox's offers, one card each; `act` runs Save or Not now. */
export function skillOffers(state:FoxSkills,{el,button,name,act}:{el:(tag:string,cls?:string,text?:unknown)=>any;button:(label:string,action:()=>void)=>HTMLButtonElement;name:string;act:(operation:'save'|'decline',id:string)=>void}):HTMLElement[] {
 return state.proposals.map(proposal=>{
  const card=el('section','companion-skill-offer');card.dataset.offer=proposal.id;
  const where=state.saves==='agent'?`It goes into ${state.agent||'your Agent'}’s skills, and the World keeps a copy.`:'The World keeps it; your Agent has no way for Worldlet to add one.';
  card.append(el('h4','',`${name} did this ${proposal.times} times`),el('p','companion-skill-asks',proposal.asks.map(ask=>'“'+ask+'”').join(' · ')),
   el('p','',`Save it as the skill ${proposal.name}, so ${name} follows the same steps next time? ${where}`));
  const actions=el('div','companion-skill-actions');actions.append(button('Save as a skill',()=>act('save',proposal.id)),button('Not now',()=>act('decline',proposal.id)));
  card.append(actions);
  return card;
 });
}
/** The Skills group's body: newest run first. */
export function skillList(state:FoxSkills,{el,now=Date.now()}:{el:(tag:string,cls?:string,text?:unknown)=>any;now?:number}):HTMLElement {
 const ul=el('ul','companion-skill-list');
 for(const skill of state.skills.slice(0,80)){
  const li=el('li');li.dataset.skill=skill.name;li.title=skill.description;
  li.append(el('span','companion-skill-name',skill.name),el('span','companion-skill-meta',skillLastRanLabel(skill.lastRanAt,now)+' · '+WHERE[skill.where]));
  ul.append(li);
 }
 if(state.skills.length>80)ul.append(el('li','companion-knowledge-more','and '+(state.skills.length-80)+' more'));
 return ul;
}
