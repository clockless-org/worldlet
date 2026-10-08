import {AGENT,type AgentService} from '../../host/services.ts';
import type {Host,Row} from '../../host/types.ts';
import {WorldletError} from '../../files.ts';
import {migrationSkillPath,skillDraftProblem,skillFrontmatter,skillLastRuns,skillMarkdown,skillRepeats,worldSkills,type SkillTurn} from '../../../../../core/agent/index.ts';

// The Agent's skills in the World (core/agent/PORTABILITY.md#the-agents-skills-in-the-world; owner parity plan
// 2026-10-08, approved 2026-10-08 “做”): Fox's Harness's own skills (its `skills` service) beside the World's copy of
// every skill (`brought_skills`, Fox's own under source `fox`), each with when it last ran, and an offer to save one
// when Fox has done the same multi-step task again and again (core skillRepeats over the cards Fox's turns left). A
// skill the person saves is kept in the World first, then added to their Agent its own way when it declares `save`;
// without one the World keeps it and says so. Nothing here knows which Harness it is. Decisions: `skill-proposals`.

const KEY='skill-proposals',OWN='fox',CARDS='fox-thread',ID=/^repeat-[a-z0-9]{1,13}$/;
type Shelf={companionViews():Row[];broughtStores():{source:string;skills:Record<string,Record<string,string>>;routines:Row[]}[];
 replaceBrought(source:string,skills:Record<string,Record<string,string>>,routines:Row[]):void;skillTurns(limit?:number):{role:string;text:string;at:number}[];
 setting(key:string):Row|null;saveSetting(key:string,value:Row|null):void};

export function createFoxSkills(host:Host,{now=()=>Date.now()}:{now?:()=>number}={}){
 const {store}=host;
 const own=()=>store.writable&&!store.sampleEnabled();
 const shelf=()=>store.ledger() as unknown as Shelf;
 const agent=()=>host.optional<AgentService>(AGENT);
 const service=()=>agent()?.harnessSkills?.()??null;
 const decided=(ledger:Shelf):Record<string,string>=>{const value=ledger.setting(KEY)?.decided;return value&&typeof value==='object'&&!Array.isArray(value)?value:{};};
 const decide=(ledger:Shelf,id:string,choice:'saved'|'declined')=>{const all=Object.entries({...decided(ledger),[id]:choice}).slice(-200);ledger.saveSetting(KEY,{decided:Object.fromEntries(all)});};
 /** Every skill the World keeps a copy of (each Agent's brought ones and Fox's own), by its SKILL.md. */
 const worldCopy=(ledger:Shelf)=>ledger.broughtStores().flatMap(value=>Object.entries(value.skills).flatMap(([folder,files])=>typeof files?.['SKILL.md']==='string'?[skillFrontmatter(files['SKILL.md'],folder)]:[]));
 /** The turns Fox's cards hold (ui/companion/fox-thread.ts), as the page saved them. */
 const turns=(ledger:Shelf):SkillTurn[]=>{
  const row=ledger.companionViews().find(value=>value?.key===CARDS);
  return (Array.isArray(row?.entries)?row.entries:[]).map((e:Row)=>({id:String(e?.id??''),user:typeof e?.user==='string'?e.user:'',steps:Array.isArray(e?.steps)?e.steps.filter((s:unknown)=>typeof s==='string'):[],status:String(e?.status??''),at:Number(e?.at)||0}));
 };
 async function list():Promise<Row> {
  const skills=service(),title=agent()?.harness?.title??null;
  if(!own())return {skills:[],proposals:[],saves:'world',agent:title};
  const ledger=shelf();
  const mine=skills?await skills.list().catch(error=>{host.diagnostics.record(error,'harnessSkills');return [];}):[];
  const rows=worldSkills(mine,worldCopy(ledger),skillLastRuns(ledger.skillTurns()));
  const proposals=skillRepeats(turns(ledger),now(),{known:new Set(rows.map(row=>row.name.toLowerCase())),decided:new Set(Object.keys(decided(ledger)))});
  return {skills:rows,proposals,saves:skills?.save?'agent':'world',agent:title};
 }
 async function save(id:unknown):Promise<Row> {
  if(!own())throw new WorldletError('Save skills in your own world. The practice world keeps none.');
  const proposal=typeof id==='string'&&ID.test(id)?((await list()).proposals as {id:string;name:string;description:string;body:string}[]).find(p=>p.id===id):undefined;
  if(!proposal)throw new WorldletError('That offer is not here any more.');
  const draft={name:proposal.name,description:proposal.description,body:proposal.body},problem=skillDraftProblem(draft);
  if(problem||!migrationSkillPath(draft.name,'SKILL.md'))throw new WorldletError(problem??'That skill name cannot be saved.');
  // The World's copy first, so changing Agents loses none.
  const ledger=shelf(),fox=ledger.broughtStores().find(value=>value.source===OWN);
  ledger.replaceBrought(OWN,{...fox?.skills,[draft.name]:{'SKILL.md':skillMarkdown(draft)}},fox?.routines??[]);
  decide(ledger,proposal.id,'saved');
  const skills=service(),name=agent()?.harness?.title??'Your Agent';
  let where:'agent'|'world'='world',note:string;
  if(skills?.save){
   try{const saved=await skills.save(draft);where='agent';note=`Saved in ${name}’s skills (${saved.where}) and kept in the World.`;}
   catch(error){note=`${name} did not take it (${(error as Error)?.message||'no reason given'}), so the World keeps it.`;}
  }else note=`${name==='Your Agent'?'Fox’s Agent':name} has no way for Worldlet to add a skill, so the World keeps it.`;
  return {name:draft.name,where,note,...await list()};
 }
 async function decline(id:unknown):Promise<Row> {
  if(!own())throw new WorldletError('That offer is not here any more.');
  if(typeof id!=='string'||!ID.test(id))throw new WorldletError('That offer is not here any more.');
  decide(shelf(),id,'declined');
  return list();
 }
 /** `foxSkills`: `list` (the default), `save` or `decline` one offer by its id. */
 return {list,save,decline,request:(request:Row)=>request.operation==='save'?save(request.id):request.operation==='decline'?decline(request.id):list()};
}
