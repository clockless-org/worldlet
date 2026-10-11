import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {hermesDisabledAfter,hermesDisabledSkills,hermesHubSkills,hermesJobCommand,hermesSkillCommand,isControlArgument,jobChangeDone,jobChangeOffered,openClawJobCommand,openClawSkillCommand,openClawSkillEnabled,openClawSkillKey,readJobChange,readSkillChange} from '../core/agent/index.ts';
import {harnessScheduleControls} from '../platform/electron/src/modules/agent-runtime/harness-schedule-controls.ts';
import {harnessSkills} from '../platform/electron/src/modules/agent-runtime/harness-skills.ts';
import {createHarnessControls} from '../platform/electron/src/modules/fox/harness-controls.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {withTempDir} from './test-temp.ts';

// Settings › Agent's controls for the Agent's own skills and scheduled tasks (owner plan 2026-10-11, PR 2;
// core/agent/harness-controls.ts): every change is one of the Agent's own commands, checked against its source at the
// oldest supported version, run only after the person confirmed the exact preview, and read back from the Agent's own
// files. Fixture homes and fake `hermes` / `openclaw` commands that do what the real ones do to their files; no real
// Agent runs, no real home is touched, and Worldlet itself never writes an Agent's files.

// Core: the commands, exactly as each Agent spells them -------------------------------------------------------------
const job={id:'j1',name:'Digest',kind:'prompt' as const,paused:false,when:{cron:'0 7 * * *'}};
assert.deepEqual(['pause','resume','run','remove'].map(action=>hermesJobCommand({job:'j1',action:action as any})),[['cron','pause','j1'],['cron','resume','j1'],['cron','run','j1'],['cron','remove','j1']]);
assert.deepEqual(['pause','resume','run','remove'].map(action=>openClawJobCommand({job:'n1',action:action as any})),[['cron','disable','n1'],['cron','enable','n1'],['cron','run','n1'],['cron','rm','n1']],'OpenClaw calls pausing disable and removing rm');
assert.equal(jobChangeOffered(job,'pause'),true);assert.equal(jobChangeOffered(job,'resume'),false);assert.equal(jobChangeOffered({...job,paused:true},'resume'),true);
assert.equal(jobChangeDone([{...job,paused:true}],{job:'j1',action:'pause'}),true);assert.equal(jobChangeDone([job],{job:'j1',action:'pause'}),false);
assert.equal(jobChangeDone([],{job:'j1',action:'remove'}),true);assert.equal(jobChangeDone([job],{job:'j1',action:'run'}),true);
for(const bad of ['-rf','--all','a b','../x','',' j1','x\n'])assert.equal(isControlArgument(bad),false,JSON.stringify(bad));
assert.throws(()=>readJobChange({job:'--help',action:'run'}),/no longer there/,'never a flag');
assert.throws(()=>readJobChange({job:'j1',action:'edit'}),/Unknown change/,'editing a job is a conversation, not a command here');
assert.deepEqual(readSkillChange({skill:'seed-swap',action:'disable',extra:1}),{skill:'seed-swap',action:'disable'});
assert.deepEqual(hermesDisabledSkills('skills:\n  disabled:\n    - a\n    - b\n'),['a','b']);
assert.deepEqual(hermesDisabledSkills('skills:\n  disabled: \'["a", "b"]\'\n'),['a','b'],'the JSON text `hermes config set` may store');
assert.deepEqual(hermesDisabledSkills('model: x\n'),[]);
assert.deepEqual(hermesDisabledAfter(['a'],{skill:'b',action:'disable'}),['a','b']);
assert.deepEqual(hermesDisabledAfter(['a','b'],{skill:'a',action:'enable'}),['b']);
assert.equal(hermesDisabledAfter(['a'],{skill:'a',action:'disable'}),null);
assert.deepEqual(hermesSkillCommand({skill:'a',action:'disable'},['a']),['config','set','skills.disabled','["a"]']);
assert.deepEqual(hermesSkillCommand({skill:'k8s',action:'remove'},null),['skills','uninstall','k8s','--yes']);
assert.deepEqual([...hermesHubSkills({version:1,installed:{k8s:{source:'official'}}})],['k8s']);
assert.equal(openClawSkillKey('image-lab','---\nname: image-lab\nmetadata: {"openclaw": {"skillKey": "imagelab"}}\n---'),'imagelab');
assert.equal(openClawSkillKey('a.b'),null,'a key that is not one config path segment is not toggled');
assert.equal(openClawSkillEnabled({skills:{entries:{sag:{enabled:false}}}},'sag'),false);assert.equal(openClawSkillEnabled({},'sag'),true);
assert.deepEqual(openClawSkillCommand({skill:'sag',action:'disable'},'sag'),['config','set','skills.entries.sag.enabled','false','--strict-json']);
assert.equal(openClawSkillCommand({skill:'sag',action:'remove'},'sag'),null,'OpenClaw has no remove of its own');

const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
type Call={args:string[];env:Record<string,string|undefined>};
await withTempDir('worldlet-controls-',async scratch=>{
 const home=path.join(scratch,'home'),hermes=path.join(home,'.hermes'),state=path.join(home,'.openclaw');
 const environment={platform:process.platform,env:{HOME:home} as NodeJS.ProcessEnv,home};
 const hermesInstall={id:'hermes' as const,title:'Hermes Agent',command:'/fake/hermes',prefix:[],configured:true};
 const clawInstall={id:'openclaw' as const,title:'OpenClaw',command:'/fake/openclaw',prefix:[],configured:true};
 write(path.join(hermes,'config.yaml'),'model: x\n');
 const jobsFile=path.join(hermes,'cron','jobs.json');
 const hermesJobs=()=>JSON.parse(fs.readFileSync(jobsFile,'utf8')).jobs as any[];
 write(jobsFile,JSON.stringify({jobs:[{id:'j1',name:'Morning digest',prompt:'Summarize my inbox.',schedule:{kind:'cron',expr:'0 7 * * *'},enabled:true,deliver:'telegram'},{id:'j2',name:'Plants',prompt:'Water.',schedule:{kind:'interval',minutes:120},enabled:true}]}));
 const at=Date.parse('2026-10-10T07:00:00Z');
 const doc=(name:string,text:string,when:number)=>{const file=path.join(hermes,'cron','output','j1',name);write(file,text);fs.utimesSync(file,when/1000,when/1000);};
 doc('2026-10-09_07-00-00.md','# Cron Job: Morning digest\n\n## Response\n\nOld.\n',at-86_400_000);
 doc('2026-10-10_07-00-00.md','# Cron Job: Morning digest (FAILED)\n\n## Error\n\n```\nRuntimeError: quota\n```\n',at);

 // Hermes Agent's scheduled jobs: its own `hermes cron …` in its home, then read back -------------------------------
 const calls:Call[]=[];
 // The fake does to jobs.json what Hermes Agent's own command does.
 const fakeHermes=async(_install:unknown,_environment:unknown,args:string[],options:{env?:Record<string,string>}={})=>{
  calls.push({args,env:options.env??{}});
  const [group,action,id]=args;
  if(group!=='cron')return {code:2,stdout:'',stderr:'unknown'};
  const jobs=hermesJobs(),found=jobs.find(j=>j.id===id);
  if(!found)return {code:1,stdout:'Failed to '+action+' job: not found',stderr:''};
  if(action==='pause'){found.enabled=false;found.state='paused';}
  if(action==='resume'){found.enabled=true;found.state='scheduled';}
  write(jobsFile,JSON.stringify({jobs:action==='remove'?jobs.filter(j=>j.id!==id):jobs}));
  return {code:0,stdout:'ok',stderr:''};
 };
 const hm=harnessScheduleControls(hermesInstall,environment,{run:fakeHermes as any})!;
 assert.ok(hm.preview&&hm.change&&hm.latest);
 assert.deepEqual((await hm.latest!()).map(r=>[r.job,r.status,r.output]),[['j1','failed','RuntimeError: quota']],'the newest run of each job');
 assert.equal(await hm.preview!({job:'j1',action:'pause'}),'hermes cron pause j1');
 await assert.rejects(hm.preview!({job:'j1',action:'resume'}),/running already/);
 await assert.rejects(hm.preview!({job:'gone',action:'run'}),/no longer has this scheduled task/);
 assert.equal(calls.length,0,'a preview runs nothing');
 await hm.change!({job:'j1',action:'pause'});
 assert.deepEqual(calls[0].args,['cron','pause','j1']);assert.equal(calls[0].env.HERMES_HOME,fs.realpathSync(hermes),'in the person’s own Hermes home');
 assert.equal((await hm.jobs()).find(j=>j.id==='j1')?.paused,true);
 await hm.change!({job:'j1',action:'resume'});
 await hm.change!({job:'j2',action:'run'});
 await hm.change!({job:'j2',action:'remove'});
 assert.deepEqual(calls.map(c=>c.args.join(' ')),['cron pause j1','cron resume j1','cron run j2','cron remove j2']);
 assert.deepEqual((await hm.jobs()).map(j=>j.id),['j1']);
 // The Agent says no, or says yes without doing it: the person hears its reason, never a success.
 const refusing=harnessScheduleControls(hermesInstall,environment,{run:async()=>({code:1,stdout:'',stderr:'Failed to pause job: locked'})})!;
 await assert.rejects(refusing.change!({job:'j1',action:'pause'}),/Hermes Agent did not do it: Failed to pause job: locked/);
 const silent=harnessScheduleControls(hermesInstall,environment,{run:async()=>({code:0,stdout:'',stderr:''}),settle:[]})!;
 await assert.rejects(silent.change!({job:'j1',action:'pause'}),/did not do it/,'read back, never assumed');
 assert.equal(harnessScheduleControls({...hermesInstall,id:'pi'} as any,environment),null,'a Harness without `schedule` has none');

 // OpenClaw's scheduled jobs: `openclaw cron disable|enable|run|rm` (through its Gateway) ------------------------------
 const clawJobs=path.join(state,'cron','jobs.json');
 write(clawJobs,JSON.stringify({jobs:[{id:'news',name:'Morning news',enabled:true,schedule:{kind:'cron',expr:'0 8 * * *'},payload:{kind:'agentTurn',message:'News.'},delivery:{mode:'announce',channel:'telegram'}}]}));
 const clawCalls:string[]=[];
 const fakeClaw=async(_install:unknown,_environment:unknown,args:string[])=>{
  clawCalls.push(args.join(' '));
  const jobs=JSON.parse(fs.readFileSync(clawJobs,'utf8')).jobs,found=jobs.find((j:any)=>j.id===args[2]);
  if(args[1]==='disable')found.enabled=false;
  if(args[1]==='enable')found.enabled=true;
  write(clawJobs,JSON.stringify({jobs:args[1]==='rm'?jobs.filter((j:any)=>j.id!==args[2]):jobs}));
  return {code:0,stdout:'{"ok":true}',stderr:''};
 };
 const oc=harnessScheduleControls(clawInstall,environment,{run:fakeClaw as any})!;
 assert.equal(await oc.preview!({job:'news',action:'pause'}),'openclaw cron disable news');
 await oc.change!({job:'news',action:'pause'});await oc.change!({job:'news',action:'resume'});await oc.change!({job:'news',action:'run'});await oc.change!({job:'news',action:'remove'});
 assert.deepEqual(clawCalls,['cron disable news','cron enable news','cron run news','cron rm news']);
 const gatewayDown=harnessScheduleControls(clawInstall,environment,{run:async()=>({code:1,stdout:'',stderr:'Error: gateway not running'})})!;
 write(clawJobs,JSON.stringify({jobs:[{id:'news',name:'Morning news',enabled:true,schedule:{kind:'cron',expr:'0 8 * * *'},payload:{kind:'agentTurn',message:'News.'}}]}));
 await assert.rejects(gatewayDown.change!({job:'news',action:'run'}),/OpenClaw did not do it: Error: gateway not running/);

 // Hermes Agent's skills: `hermes config set skills.disabled` and `hermes skills uninstall` (hub skills only) ----------
 write(path.join(hermes,'skills','garden','seed-swap','SKILL.md'),'---\nname: seed-swap\ndescription: Organize seed swaps.\n---\nList.\n');
 write(path.join(hermes,'skills','k8s','SKILL.md'),'---\nname: k8s\ndescription: Kubernetes.\n---\nx\n');
 write(path.join(hermes,'skills','.hub','lock.json'),JSON.stringify({version:1,installed:{k8s:{source:'official',install_path:'k8s'}}}));
 const skillCalls:string[][]=[];
 const config=path.join(hermes,'config.yaml');
 const fakeSkills=async(_install:unknown,args:string[],options:{env:Record<string,string>})=>{
  skillCalls.push(args);
  assert.equal(options.env.HERMES_HOME,fs.realpathSync(hermes));
  if(args[0]==='config'&&args[1]==='get')return {code:0,stdout:JSON.stringify(hermesDisabledSkills(fs.readFileSync(config,'utf8'))),stderr:''};
  if(args[0]==='config'&&args[1]==='set'){write(config,'model: x\nskills:\n  disabled:\n'+JSON.parse(args[3]).map((n:string)=>'  - '+n+'\n').join(''));return {code:0,stdout:'✓ Set skills.disabled',stderr:''};}
  if(args[0]==='skills'&&args[1]==='uninstall'){fs.rmSync(path.join(hermes,'skills',args[2]),{recursive:true});return {code:0,stdout:'Uninstalled',stderr:''};}
  return {code:2,stdout:'',stderr:'unknown'};
 };
 const hs=harnessSkills('hermes',environment,{locate:()=>[hermesInstall],run:fakeSkills})!;
 assert.deepEqual((await hs.list()).map(s=>[s.name,s.enabled,s.removable]),[['seed-swap',true,false],['k8s',true,true]],'only a hub-installed skill can be removed by its own command');
 assert.equal(await hs.preview!({skill:'seed-swap',action:'disable'}),'hermes config set skills.disabled '+JSON.stringify('["seed-swap"]'),'the list it will hold, quoted as a shell would need it');
 await assert.rejects(hs.preview!({skill:'seed-swap',action:'remove'}),/no command of its own that removes/);
 await assert.rejects(hs.preview!({skill:'seed-swap',action:'enable'}),/on already/);
 assert.equal(skillCalls.length,0);
 await hs.change!({skill:'seed-swap',action:'disable'});
 assert.deepEqual(skillCalls.map(a=>a.join(' ')),['config get skills.disabled --json --raw','config set skills.disabled ["seed-swap"]'],'read from Hermes itself, then its own config set');
 assert.equal((await hs.list()).find(s=>s.name==='seed-swap')?.enabled,false);
 await hs.change!({skill:'seed-swap',action:'enable'});
 assert.equal((await hs.list()).find(s=>s.name==='seed-swap')?.enabled,true);
 await hs.change!({skill:'k8s',action:'remove'});
 assert.deepEqual(skillCalls.at(-1),['skills','uninstall','k8s','--yes']);
 assert.deepEqual((await hs.list()).map(s=>s.name),['seed-swap']);
 const stubborn=harnessSkills('hermes',environment,{locate:()=>[hermesInstall],run:async()=>({code:0,stdout:'',stderr:''})})!;
 await assert.rejects(stubborn.change!({skill:'seed-swap',action:'disable'}),/Hermes Agent did not do it/,'read back, never assumed');

 // OpenClaw's skills: `openclaw config set skills.entries.<key>.enabled`; no Remove ------------------------------------
 write(path.join(state,'openclaw.json'),'{agents:{entries:{main:{default:true}}}}');
 write(path.join(state,'workspace','skills','garden-log','SKILL.md'),'---\nname: garden-log\ndescription: Keep the garden log.\n---\nx\n');
 const clawSkillCalls:string[]=[];
 const fakeClawSkills=async(_install:unknown,args:string[])=>{
  clawSkillCalls.push(args.join(' '));
  const [,,key,value]=args,name=key.split('.')[2];
  write(path.join(state,'openclaw.json'),JSON.stringify({agents:{entries:{main:{default:true}}},skills:{entries:{[name]:{enabled:value==='true'}}}}));
  return {code:0,stdout:'',stderr:''};
 };
 const cs=harnessSkills('openclaw',environment,{locate:()=>[clawInstall],run:fakeClawSkills})!;
 assert.deepEqual((await cs.list()).map(s=>[s.name,s.enabled,s.removable]),[['garden-log',true,false]]);
 assert.equal(await cs.preview!({skill:'garden-log',action:'disable'}),'openclaw config set skills.entries.garden-log.enabled false --strict-json');
 await assert.rejects(cs.preview!({skill:'garden-log',action:'remove'}),/no command of its own/);
 await cs.change!({skill:'garden-log',action:'disable'});
 assert.equal((await cs.list())[0].enabled,false);
 await cs.change!({skill:'garden-log',action:'enable'});
 assert.deepEqual(clawSkillCalls,['config set skills.entries.garden-log.enabled false --strict-json','config set skills.entries.garden-log.enabled true --strict-json']);

 // The World's side: preview, then only the confirmed change runs, once --------------------------------------------
 const world=new WorldLedger(path.join(scratch,'world'));
 let sample=false;
 const ran:string[]=[];
 const schedule={jobs:async()=>[job],runs:async()=>({runs:[]}),running:async()=>false,start:'hermes gateway install',latest:async()=>[{id:'r',job:'j1',at,status:'ok' as const,output:'Secret result text'}],
  preview:async(c:any)=>'hermes cron '+c.action+' '+c.job,change:async(c:any)=>{ran.push(c.action+' '+c.job);}};
 const skills={list:async()=>[{name:'seed-swap',description:'Organize.',where:'/h/skills/seed-swap',enabled:true,removable:false}],preview:async(c:any)=>'hermes config set skills.disabled ["'+c.skill+'"]',change:async(c:any)=>{ran.push(c.action+' '+c.skill);}};
 const host:any={store:{writable:true,sampleEnabled:()=>sample,ledger:()=>world},diagnostics:{record:()=>{}},
  optional:(name:string)=>name==='agent'?{harness:{id:'hermes',title:'Hermes Agent'},harnessSchedules:()=>[{harness:'hermes',title:'Hermes Agent',schedule}],harnessSkillSets:()=>[{harness:'hermes',title:'Hermes Agent',skills}]}:null};
 const controls=createHarnessControls(host);
 const listed=await controls.scheduleRequest({operation:'list'}) as any;
 assert.deepEqual(listed.current,{harness:'hermes',title:'Hermes Agent'});
 assert.deepEqual(listed.harnesses[0],{harness:'hermes',title:'Hermes Agent',jobs:[{id:'j1',name:'Digest',kind:'prompt',paused:false,when:{cron:'0 7 * * *'},last:{at,status:'ok'}}],running:false,start:'hermes gateway install',changes:true,inUse:true},'names, times and results; never a prompt or a result’s text');
 const preview=await controls.scheduleRequest({operation:'preview',harness:'hermes',job:'j1',change:'pause'}) as any;
 assert.equal(preview.command,'hermes cron pause j1');assert.deepEqual(ran,[],'a preview runs nothing');
 await assert.rejects(controls.scheduleRequest({operation:'change',confirm:'made-up'}),/Confirm the change again/);
 assert.deepEqual(await controls.scheduleRequest({operation:'change',confirm:preview.confirm}),{ok:true,command:'hermes cron pause j1'});
 await assert.rejects(controls.scheduleRequest({operation:'change',confirm:preview.confirm}),/Confirm the change again/,'a confirmation runs once');
 await assert.rejects(controls.scheduleRequest({operation:'preview',harness:'hermes',job:'-x',change:'run'}),/no longer there/);
 await assert.rejects(controls.scheduleRequest({operation:'preview',harness:'nobody',job:'j1',change:'run'}),/no longer on this computer/);
 const skillList=await controls.skillRequest({operation:'list'}) as any;
 assert.deepEqual(skillList.harnesses[0].skills,[{name:'seed-swap',description:'Organize.',lastRanAt:null,enabled:true,removable:false}]);
 const skillPreview=await controls.skillRequest({operation:'preview',harness:'hermes',skill:'seed-swap',change:'disable'}) as any;
 await controls.skillRequest({operation:'change',confirm:skillPreview.confirm});
 assert.deepEqual(ran,['pause j1','disable seed-swap']);
 sample=true;
 assert.deepEqual((await controls.scheduleRequest({operation:'list'}) as any).harnesses,[],'never in the practice world');
 await assert.rejects(controls.skillRequest({operation:'preview',harness:'hermes',skill:'seed-swap',change:'disable'}),/your own world/);
});
console.log('PASS Agent controls: scheduled tasks paused, resumed, run or removed and skills turned off, on or removed only with each Agent’s own command (Hermes Agent `hermes cron …`, `hermes config set skills.disabled`, `hermes skills uninstall` for hub skills; OpenClaw `openclaw cron disable|enable|run|rm`, `openclaw config set skills.entries.<key>.enabled`, no remove), previewed, confirmed once and read back');
