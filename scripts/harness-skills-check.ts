import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {harnessService,skillDraftProblem,skillFrontmatter,skillInvocation,skillLastRanLabel,skillLastRuns,skillMarkdown,skillRepeats,worldSkills,SKILL_REPEAT,type SkillTurn} from '../core/agent/index.ts';
import {harnessSkills} from '../platform/electron/src/modules/agent-runtime/harness-skills.ts';
import {createFoxSkills} from '../platform/electron/src/modules/fox/skills.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {withTempDir} from './test-temp.ts';

// The `skills` Harness service (contracts/HARNESS.md#harness-services-v2, core/agent/PORTABILITY.md#the-agents-skills-in-the-world):
// Core's rules (a skill file, when one last ran, the conservative repeat detector), the host's reading and saving
// against fixture Hermes Agent and OpenClaw homes with a fake `openclaw` command, and the Harness-neutral World module
// on a real world.sqlite with a fake Agent. No real Agent runs and no real home is touched.

// Declarations: Hermes Agent from its folder, OpenClaw through its command line; the others declare none.
assert.equal(harnessService('hermes','skills'),'files');
assert.equal(harnessService('openclaw','skills'),'native');
for(const id of ['claude-code','codex','pi','remote','remote-openclaw']){assert.equal(harnessService(id,'skills'),null,id);assert.equal(harnessSkills(id),null,id);}

// Core: a skill file ---------------------------------------------------------------------------------------------
const draft={name:'mail-replies',description:'Use when asked to draft mail replies.',body:'1. Read the inbox\n2. Draft replies'};
assert.equal(skillDraftProblem(draft),null);
for(const bad of [{...draft,name:'Mail Replies'},{...draft,name:'a_b'},{...draft,name:'-x'},{...draft,description:''},{...draft,description:'x'.repeat(61)},{...draft,description:'two\nlines'},{...draft,body:' '}])assert.ok(skillDraftProblem(bad),JSON.stringify(bad));
const markdown=skillMarkdown(draft);
assert.equal(markdown,'---\nname: mail-replies\ndescription: "Use when asked to draft mail replies."\n---\n\n1. Read the inbox\n2. Draft replies\n','only the frontmatter both Agents read');
assert.deepEqual(skillFrontmatter(markdown,'folder'),{name:'mail-replies',description:'Use when asked to draft mail replies.'});
assert.deepEqual(skillFrontmatter("---\nname: seed-swap\ndescription: 'Organize seed swaps.'\n---\nList.",'x'),{name:'seed-swap',description:'Organize seed swaps.'});
assert.deepEqual(skillFrontmatter('# Plant notes\n\nSummarize what was planted.','plant-notes'),{name:'plant-notes',description:'Plant notes'},'no frontmatter: the folder and first paragraph');

// Core: when each last ran -------------------------------------------------------------------------------------
assert.equal(skillInvocation('/garden-log water the beans'),'garden-log','typed as a slash command');
assert.equal(skillInvocation('/Plan'),'plan');
assert.equal(skillInvocation('[IMPORTANT: The user has invoked the "seed-swap" skill, indicating they want you to follow its instructions. The full skill content is loaded below.]\n\n…'),'seed-swap','Hermes Agent files a /skill turn expanded');
assert.equal(skillInvocation('[IMPORTANT: The user has invoked the "/clean /work" skill bundle, loading 2 skills together.]'),null,'a bundle names no one skill');
for(const text of ['please /plan','/ plan','hello','//x'])assert.equal(skillInvocation(text),null,text);
const day=86_400_000,now=Date.UTC(2026,9,8,15);
const runs=skillLastRuns([{role:'user',text:'/garden-log',at:now-3*day},{role:'user',text:'/garden-log again',at:now-day},{role:'assistant',text:'/plan',at:now},{role:'user',text:'/plan',at:NaN}]);
assert.deepEqual([...runs],[['garden-log',now-day]],'the person’s latest invocation; never the Agent’s reply');
const rows=worldSkills([{name:'garden-log',description:'Keep the garden log.',where:'/a/skills/garden-log'},{name:'seed-swap',description:'Organize.',where:'/a/skills/seed-swap',lastUsedAt:now-10*day}],
 [{name:'seed-swap',description:'Organize.'},{name:'plant-notes',description:'Notes.'}],runs);
assert.deepEqual(rows.map(r=>[r.name,r.where,r.lastRanAt]),[['garden-log','agent',now-day],['seed-swap','both',now-10*day],['plant-notes','world',null]],'the Agent’s, both, the World’s copy; newest run first');
assert.deepEqual([null,now-1000,now-day,now-3*day,now-60*day].map(at=>skillLastRanLabel(at,now)),['Not run yet','Ran today','Ran yesterday','Ran 3 days ago','Ran on Aug 9']);

// Core: the repeat detector, conservative ---------------------------------------------------------------------------
const steps=['Reading your inbox','Finding mail that needs a reply','Drafting 3 replies'];
const turn=(id:string,at:number,user:string,patch:Partial<SkillTurn>={}):SkillTurn=>({id,user,steps,status:'done',at,...patch});
const three=[turn('a',now-5*day,'Draft replies to my mail from Acme'),turn('b',now-3*day,'Can you draft replies to today’s mail?'),turn('c',now-2*60_000,'draft replies for the new mail')];
const [offer,...rest]=skillRepeats(three,now);
assert.equal(rest.length,0);
assert.equal(offer.name,'draft-replies-mail','named from the words every request shares');
assert.equal(offer.times,3);assert.equal(offer.lastAt,now-2*60_000);
assert.ok(offer.description.length<=60&&offer.description.endsWith('.'),offer.description);
assert.equal(skillDraftProblem({name:offer.name,description:offer.description,body:offer.body}),null,'an offer is always a valid skill');
assert.match(offer.body,/1\. Reading your inbox\n2\. Finding mail that needs a reply\n3\. Drafting 3 replies/);
assert.deepEqual(skillRepeats(three.map(t=>({...t,steps:['Drafting 4 replies',...t.steps.slice(0,2)].reverse()})),now).length,1,'counts in a step do not make it a different task');
assert.equal(skillRepeats(three.slice(0,2),now).length,0,`fewer than ${SKILL_REPEAT.times} times`);
assert.equal(skillRepeats(three.map((t,n)=>({...t,at:now-n*60_000})),now).length,0,'all on one day: not yet a habit');
assert.equal(skillRepeats(three.map(t=>({...t,steps:steps.slice(0,2)})),now).length,0,'two steps are not a multi-step task');
assert.equal(skillRepeats(three.map(t=>({...t,steps:[steps[0],steps[0],steps[1]]})),now).length,0,'the same step again is not another step');
assert.equal(skillRepeats([...three.slice(0,2),{...three[2],status:'error'}],now).length,0,'a failed turn does not count');
assert.equal(skillRepeats([...three.slice(0,2),{...three[2],steps:[...steps].reverse()}],now).length,0,'other steps or another order are another task');
assert.equal(skillRepeats([...three.slice(0,2),{...three[2],user:'Summarize the Acme thread'}],now).length,0,'requests that share no word are not one task');
assert.equal(skillRepeats(three.map(t=>({...t,at:t.at-15*day})),now).length,0,'older than the window');
assert.equal(skillRepeats(three,now,{decided:new Set([offer.id])}).length,0,'saved or declined: never offered again');
assert.equal(skillRepeats(three,now,{known:new Set(['draft-replies-mail'])}).length,0,'a skill of that name is there already');
assert.equal(skillRepeats(three,now)[0].id,offer.id,'the same repeat keeps its id');

// Host: Hermes Agent's own folder -------------------------------------------------------------------------------------
const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
await withTempDir('worldlet-skills-',async scratch=>{
 const home=path.join(scratch,'home'),hermes=path.join(home,'.hermes'),env={HOME:home};
 write(path.join(hermes,'config.yaml'),'model: x\n');
 write(path.join(hermes,'skills','garden','seed-swap','SKILL.md'),'---\nname: seed-swap\ndescription: Organize seed swaps.\n---\nList what to trade.\n');
 write(path.join(hermes,'skills','research','arxiv','SKILL.md'),'---\nname: arxiv\ndescription: Shipped with Hermes.\n---\nx\n');
 write(path.join(hermes,'skills','.bundled_manifest'),'arxiv:abc\n');
 write(path.join(hermes,'skills','.usage.json'),JSON.stringify({'seed-swap':{use_count:2,last_used_at:'2026-10-01T10:00:00+00:00',last_viewed_at:'2026-10-03T09:00:00Z'}}));
 const environment={platform:process.platform,env,home};
 const service=harnessSkills('hermes',environment)!;
 const listed=await service.list();
 assert.deepEqual(listed.map(s=>[s.name,s.description,s.lastUsedAt]),[['seed-swap','Organize seed swaps.',Date.parse('2026-10-03T09:00:00Z')]],'its own skills, not the ones it ships; last run from its own record');
 assert.equal(listed[0].where,path.join(fs.realpathSync(hermes),'skills','garden','seed-swap'));
 const saved=await service.save!(draft);
 const file=path.join(fs.realpathSync(hermes),'skills','mail-replies','SKILL.md');
 assert.equal(saved.where,path.dirname(file));
 assert.equal(fs.readFileSync(file,'utf8'),markdown,'a new folder where its skill_manage creates one');
 assert.deepEqual(fs.readdirSync(path.dirname(file)),['SKILL.md'],'nothing left beside it');
 await assert.rejects(service.save!(draft),/already has a skill named mail-replies/,'never changes one already there');
 await assert.rejects(service.save!({...draft,name:'seed-swap'}),/already has/);
 await assert.rejects(service.save!({...draft,name:'arxiv'}),/already has/,'nor shadows one it ships');
 await assert.rejects(service.save!({...draft,name:'Bad Name'}),/lowercase/);
 assert.equal(fs.readFileSync(path.join(hermes,'skills','garden','seed-swap','SKILL.md'),'utf8').includes('List what to trade.'),true);
 write(path.join(hermes,'config.yaml'),'model: x\nskills:\n  create_dir: ~/fleet-skills\n');
 await assert.rejects(service.save!({...draft,name:'other'}),/another folder \(skills\.create_dir\)/,'a custom create_dir is not guessed');
 assert.equal(fs.existsSync(path.join(hermes,'skills','other')),false);
 assert.deepEqual(await harnessSkills('hermes',{platform:process.platform,env:{HOME:path.join(scratch,'nobody')},home:path.join(scratch,'nobody')})!.list(),[],'no Hermes Agent: no skills');

 // Host: OpenClaw's folders and its own `openclaw skills install` ------------------------------------------------------
 const state=path.join(home,'.openclaw'),workspace=path.join(state,'workspace');
 write(path.join(state,'openclaw.json'),'{agents:{entries:{main:{default:true}}}}');
 write(path.join(workspace,'skills','garden-log','SKILL.md'),'---\nname: garden-log\ndescription: Keep the garden log.\n---\nOne line per visit.\n');
 write(path.join(state,'skills','garden-log','SKILL.md'),'---\nname: garden-log\ndescription: Shared copy.\n---\nx\n');
 write(path.join(state,'skills','weather','SKILL.md'),'---\nname: weather\ndescription: Shared weather.\n---\nx\n');
 const calls:{args:string[];skill:string}[]=[];
 let answer={code:0,stdout:'Installed mail-replies',stderr:''};
 const install={id:'openclaw' as const,title:'OpenClaw',command:'/fake/openclaw',prefix:[],configured:true};
 const run=async(_install:unknown,args:string[])=>{calls.push({args,skill:fs.readFileSync(path.join(args[2],'SKILL.md'),'utf8')});return answer;};
 const claw=harnessSkills('openclaw',environment,{locate:()=>[install],run})!;
 assert.deepEqual((await claw.list()).map(s=>[s.name,s.description]),[['garden-log','Keep the garden log.'],['weather','Shared weather.']],'the workspace before the shared folder');
 const added=await claw.save!(draft);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0].args.slice(0,2),['skills','install']);
 assert.deepEqual(calls[0].args.slice(3),['--as','mail-replies','--agent','main'],'its own install, into the default agent’s workspace');
 assert.equal(path.basename(calls[0].args[2]),'mail-replies');
 assert.equal(calls[0].skill,markdown);
 assert.equal(fs.existsSync(calls[0].args[2]),false,'the staged folder is gone');
 assert.equal(added.where,path.join(fs.realpathSync(workspace),'skills','mail-replies'));
 assert.equal(fs.existsSync(path.join(workspace,'skills','mail-replies')),false,'Worldlet itself writes nothing into the workspace');
 answer={code:1,stdout:'',stderr:'Checking policy\nInstall policy warning: review required'};
 await assert.rejects(claw.save!({...draft,name:'other'}),/Install policy warning: review required/,'its reason');
 await assert.rejects(claw.save!({...draft,name:'weather'}),/already has a skill named weather/);
 assert.equal(calls.length,2,'a name already there runs nothing');
 await assert.rejects(harnessSkills('openclaw',environment,{locate:()=>[],run})!.save!(draft),/not installed/);

 // World: the skills and the offer, whichever Agent it is --------------------------------------------------------
 const world=new WorldLedger(path.join(scratch,'world'));
 world.replaceBrought('pi',{publish:{'SKILL.md':'---\nname: publish\ndescription: Publish the site.\n---\nBuild.\n'}},[]);
 world.addCompanionTurns('hermes',[{id:'h1',session:'Hermes · Nova',role:'user',text:'[IMPORTANT: The user has invoked the "seed-swap" skill, indicating they want you to follow its instructions. The full skill content is loaded below.]\n\nList what to trade.',createdAt:new Date(now-day).toISOString()}]);
 world.addCompanionTurns('pi',[{id:'p1',session:'pi · site',role:'user',text:'/publish now',createdAt:new Date(now-2*day).toISOString()},{id:'p2',session:'pi · site',role:'assistant',text:'/publish',createdAt:new Date(now).toISOString()}]);
 world.replaceCompanionViews([{key:'fox-thread',entries:three.map(t=>({...t,key:'overview',view:'',location:'Home',text:'Done.'}))}]);
 const savedList:any[]=[];
 let skills:{list():Promise<any[]>;save?:(d:any)=>Promise<any>}|null={list:async()=>[{name:'seed-swap',description:'Organize seed swaps.',where:'/h/skills/seed-swap',lastUsedAt:now-3*day}],save:async d=>{savedList.push(d);return {name:d.name,where:'/h/skills/'+d.name};}};
 let sample=false;
 const host:any={store:{writable:true,sampleEnabled:()=>sample,ledger:()=>world},diagnostics:{record:()=>{}},
  optional:(name:string)=>name==='agent'?{harness:{id:'any',title:'Nova'},harnessSkills:()=>skills}:null};
 const fox=createFoxSkills(host,{now:()=>now});
 let shown=await fox.request({operation:'list'});
 assert.deepEqual(shown.skills.map((s:any)=>[s.name,s.where,s.lastRanAt]),[['seed-swap','agent',now-day],['publish','world',now-2*day]],'the Agent’s own and the World’s copy, last run from synced turns');
 assert.equal(shown.saves,'agent');assert.equal(shown.agent,'Nova');
 assert.deepEqual(shown.proposals.map((p:any)=>p.name),['draft-replies-mail'],'Fox’s repeated task is offered');
 const id=shown.proposals[0].id;
 await assert.rejects(fox.request({operation:'save',id:'repeat-nothere'}),/not here any more/);
 const result=await fox.request({operation:'save',id});
 assert.equal(result.where,'agent');assert.match(result.note,/Saved in Nova’s skills/);
 assert.equal(savedList.length,1);assert.equal(savedList[0].name,'draft-replies-mail');
 assert.equal(world.broughtStores().find(s=>s.source==='fox')?.skills['draft-replies-mail']['SKILL.md'],skillMarkdown(savedList[0]),'the World keeps its copy');
 assert.deepEqual(result.proposals,[],'saved: not offered again');
 assert.ok(result.skills.some((s:any)=>s.name==='draft-replies-mail'&&s.where==='world'),'listed at once from the World’s copy');
 // The Agent refuses: the World still keeps it, and says why.
 world.replaceCompanionViews([{key:'fox-thread',entries:three.map(t=>({...t,steps:['Opening the calendar','Reading the invites','Answering 2 invites'],user:t.user.replace(/mail/i,'calendar invites').replace(/draft/i,'Answer'),key:'overview',view:'',location:'Home'}))}]);
 skills.save=async()=>{throw new Error('Install policy warning');};
 shown=await fox.request({operation:'list'});
 assert.equal(shown.proposals.length,1,shown.proposals.map((p:any)=>p.name).join());
 const refused=await fox.request({operation:'save',id:shown.proposals[0].id});
 assert.equal(refused.where,'world');assert.match(refused.note,/Nova did not take it \(Install policy warning\), so the World keeps it/);
 // No `save` (or no `skills` at all): only the World's copy, said plainly.
 world.replaceCompanionViews([{key:'fox-thread',entries:three.map(t=>({...t,steps:['Checking the week','Finding free time','Writing the plan'],user:t.user.replace(/draft replies/i,'plan week'),key:'overview',view:'',location:'Home'}))}]);
 skills=null;
 shown=await fox.request({operation:'list'});
 assert.equal(shown.saves,'world');
 const declined=await fox.request({operation:'decline',id:shown.proposals[0].id});
 assert.deepEqual(declined.proposals,[],'declined: not offered again');
 world.replaceCompanionViews([{key:'fox-thread',entries:three.map(t=>({...t,steps:['Opening the map','Finding the route','Saving the route'],user:t.user.replace(/draft replies/i,'route home'),key:'overview',view:'',location:'Home'}))}]);
 const kept=await fox.request({operation:'save',id:(await fox.request({})).proposals[0].id});
 assert.equal(kept.where,'world');assert.match(kept.note,/has no way for Worldlet to add a skill, so the World keeps it/);
 assert.deepEqual(Object.keys(world.setting('skill-proposals')!.decided).length,4);
 // The practice world shows none and saves none.
 sample=true;
 assert.deepEqual((await fox.request({})).skills,[]);
 await assert.rejects(fox.request({operation:'save',id}),/own world/);
 world.close?.();
});
console.log('PASS Harness skills: Core rules and repeat detector, Hermes Agent and OpenClaw readers and savers, World skills and offers');
