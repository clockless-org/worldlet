import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateHarnessServices} from '../contracts/harness-services.ts';
import {HARNESS_SERVICES,approvalChanges,approvalGrantFor,approvalThreadLabel,changesAnswered,changesAsked,changesCall,harnessApprovalFeatures,hermesAllowlistWithout,hermesStandingRules,lineDiff,
 openClawApprovalsWithout,openClawChangesEvent,openClawGrantRules,openClawStandingRules,readApprovalGrants,readHarnessApprovalResult,rememberApprovalGrant,standingRuleId} from '../core/agent/index.ts';
import {hermesStandingRulesService,openClawStandingRulesService,standingRules} from '../platform/electron/src/modules/agent-runtime/harness-approvals.ts';
import {LocalHarnessAdapter,type HarnessEnvironment} from '../platform/electron/src/modules/agent-runtime/local-harness.ts';
import {createHarnessApprovalRules} from '../platform/electron/src/modules/fox/harness-approvals.ts';
import {AGENT} from '../platform/electron/src/host/services.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {approvalRuleLine,showApprovalRules} from '../ui/companion/approval-rules.ts';
import {approvalResultBody,approvalResultText} from '../ui/companion/fox-harness-approval.ts';
import {withTempDir} from './test-temp.ts';

// Standing rules and what an approval changed (core/agent/PORTABILITY.md#standing-rules-and-what-an-approval-changed):
// the declared approval features, reading Hermes Agent's `command_allowlist` and OpenClaw's approvals document and
// grants, the documents without one rule, the World's record of who said Always and where, the tracker that ties an
// approval to its tool call, the host services against fixture `hermes` and `openclaw` commands (their own commands
// change their files; Worldlet never writes them), the restart a revoked Hermes rule needs, Settings › Approvals and the
// approval card's diff. scripts/harness-sessions-check.ts drives the trackers through the resident sessions.

// Declarations ------------------------------------------------------------------------------------------------------
assert.deepEqual(harnessApprovalFeatures('hermes'),{rules:'files',revoke:'restart',revokeNote:HARNESS_SERVICES.hermes.approvalFeatures!.revokeNote,changes:'diffs'});
assert.deepEqual([harnessApprovalFeatures('openclaw').rules,harnessApprovalFeatures('openclaw').revoke,harnessApprovalFeatures('openclaw').changes],['native','live','output']);
assert.deepEqual(harnessApprovalFeatures('remote'),{},'an Agent on another computer keeps its rules there');assert.deepEqual(harnessApprovalFeatures('codex'),{});
assert.throws(()=>validateHarnessServices({version:2,harness:'x',services:{},approvalFeatures:{rules:'files'}}),/approvals service/,'features need the service');
assert.throws(()=>validateHarnessServices({version:2,harness:'x',services:{approvals:'native'},approvalFeatures:{revoke:'live'}}),/readable rules/);
assert.throws(()=>validateHarnessServices({version:2,harness:'x',services:{approvals:'native'},approvalFeatures:{rules:'files',revoke:'sometimes'}}));
assert.throws(()=>validateHarnessServices({version:2,harness:'x',services:{approvals:'native'},approvalFeatures:{changes:'everything'}}));
assert.deepEqual(validateHarnessServices({version:2,harness:'x',services:{approvals:'native'},approvalFeatures:{rules:'files',extra:1} as any}).approvalFeatures,{rules:'files'});

// Hermes Agent's allowlist ----------------------------------------------------------------------------------------
const yaml='model:\n  default: x\ncommand_allowlist:\n  - recursive delete\n  - "script execution via heredoc"\n  - podman *\n  - recursive delete\nother: 1\n';
const hermes=hermesStandingRules(yaml,'default',{main:true});
assert.deepEqual(hermes.map(r=>[r.allows,r.agent,r.kind,r.main]),[['recursive delete','default','command',true],['script execution via heredoc','default','command',true],['podman *','default','command',true]],'each entry once, quotes read');
assert.equal(hermes[0].id,standingRuleId('hermes','default','recursive delete'));assert.match(hermes[0].id,/^rule-[0-9a-f]{16}$/);
assert.notEqual(standingRuleId('hermes','work','recursive delete'),hermes[0].id,'another profile\'s rule is another rule');
assert.deepEqual(hermesStandingRules('command_allowlist: [rm, systemctl]\n','work').map(r=>r.allows),['rm','systemctl']);
assert.deepEqual(hermesStandingRules('command_allowlist: []\n','x'),[]);assert.deepEqual(hermesStandingRules('',''),[]);
assert.deepEqual(hermesAllowlistWithout(['a','b','c'],'b'),['a','c']);assert.equal(hermesAllowlistWithout(['a'],'z'),null);assert.equal(hermesAllowlistWithout(null,'a'),null);

// OpenClaw's approvals document and grants ------------------------------------------------------------------------
const doc={path:'~/.openclaw/state/openclaw.sqlite#exec_approvals_config',hash:'h1',file:{version:1,socket:{path:'~/.openclaw/exec-approvals.sock'},defaults:{security:'allowlist',ask:'on-miss'},
 agents:{main:{security:'allowlist',allowlist:[{id:'A1',pattern:'/usr/bin/rm',argPattern:'sha256:argv:abc',source:'allow-always',lastUsedAt:1700000000000},{pattern:'~/bin/rg'}],mcpTools:[{server:'docs',tool:'publish',source:'allow-always',addedAt:1690000000000}]},
  work:{allowlist:[{id:'W1',pattern:'/usr/bin/git',source:'allow-always'}]}}}};
const claw=openClawStandingRules(doc);
assert.deepEqual(claw.map(r=>[r.agent,r.kind,r.allows,r.main??false]),[['main','command','/usr/bin/rm',true],['main','tool','docs › publish',true],['work','command','/usr/bin/git',false]],'allow-always entries only: a hand-written rule is the person\'s own policy');
assert.match(claw[0].note!,/exact arguments and folder/);assert.equal(claw[0].lastUsedAt,1700000000000);assert.equal(claw[1].grantedAt,1690000000000);
{
 const without=openClawApprovalsWithout(doc,claw[0].id)!;
 assert.deepEqual(without.agents.main.allowlist,[{pattern:'~/bin/rg'}],'only that entry goes');assert.equal(without.socket.path,'~/.openclaw/exec-approvals.sock');
 assert.equal(doc.file.agents.main.allowlist.length,2,'the document read is not changed');
 const noTools=openClawApprovalsWithout(doc,claw[1].id)!;assert.equal('mcpTools' in noTools.agents.main,false,'an empty list goes, as its CLI leaves it');
 const noWork=openClawApprovalsWithout(doc,claw[2].id)!;assert.equal('work' in noWork.agents,false,'an empty agent goes');
 assert.equal(openClawApprovalsWithout(doc,standingRuleId('nothing')),null);
}
const grants=openClawGrantRules({grants:[{grantId:'g1',agentId:'main',cronJobId:'j1',cronJobName:'Nightly backup',command:'restic backup ~',createdAtMs:1,lastUsedAtMs:2,expiresAtMs:null,revokedAtMs:null,useCount:3},
 {grantId:'g2',command:'x',createdAtMs:1,expiresAtMs:5,revokedAtMs:null},{grantId:'g3',command:'y',createdAtMs:1,expiresAtMs:null,revokedAtMs:4}]},10);
assert.deepEqual(grants.map(g=>[g.grant,g.kind,g.allows,g.note]),[['g1','automation','restic backup ~','Automation Nightly backup']],'expired and revoked grants are not standing');

// Who granted it and where --------------------------------------------------------------------------------------
let record:unknown=null;
record=rememberApprovalGrant(record,{harness:'hermes',agent:'',rule:'recursive delete',thread:'applet:gmail',at:100,title:'Hermes Agent asks: rm'});
record=rememberApprovalGrant(record,{harness:'hermes',agent:'',rule:'recursive delete',thread:'main',at:200,title:'again'});
record=rememberApprovalGrant(record,{harness:'openclaw',agent:'',rule:'rm -rf build',thread:'item:7',at:300,title:'OpenClaw asks to run a command'});
assert.deepEqual(readApprovalGrants(record).map(g=>[g.harness,g.thread,g.at]),[['openclaw','item:7',300],['hermes','applet:gmail',100]],'newest first; the same rule keeps its first grant');
assert.equal(approvalGrantFor(hermes[0],'hermes',readApprovalGrants(record))?.thread,'applet:gmail');
assert.equal(approvalGrantFor(hermes[2],'hermes',readApprovalGrants(record)),null,'a rule granted outside Worldlet has no World grant');
assert.equal(approvalGrantFor({...hermes[0],main:false,agent:'work'},'hermes',readApprovalGrants(record)),null,'another profile\'s rule is not the main one\'s grant');
assert.equal(approvalGrantFor({...claw[0],note:'/usr/bin/rm, with the exact arguments and folder it was approved in'},'openclaw',readApprovalGrants(record))?.at,300,'OpenClaw keeps the binary: matched by program');
assert.equal(approvalGrantFor(claw[2],'openclaw',readApprovalGrants(record)),null);
assert.equal(readApprovalGrants({grants:Array.from({length:300},(_,i)=>({harness:'h',rule:'r'+i,at:i}))}).length,200,'bounded');
assert.deepEqual(['main','item:x','applet:gmail'].map(approvalThreadLabel),['In Fox’s main conversation','On an item’s card','In the gmail Applet']);

// What an approved action changed ---------------------------------------------------------------------------------
assert.equal(lineDiff('a\nb\nc\nd\ne\nf','a\nb\nc\nD\ne\nf'),' b\n c\n-d\n+D\n e\n f');
assert.equal(lineDiff(null,'new\nfile'),'+new\n+file','a new file is all added');
assert.match(lineDiff('',Array.from({length:300},(_,i)=>'line '+i).join('\n'),10),/… 291 more lines$/);
{
 // Asked from inside the running call; allowed; its finish reports what it changed.
 const state=approvalChanges();
 changesCall(state,'c1',{status:'in_progress'});changesAsked(state,'a1');
 assert.deepEqual(changesAnswered(state,'a1','once'),[]);
 const [result]=changesCall(state,'c1',{files:[{path:'x.txt',change:'edit',diff:'-a\n+b'}],output:'ok',status:'completed'});
 assert.deepEqual(result,{id:'a1',status:'completed',files:[{path:'x.txt',change:'edit',diff:'-a\n+b'}],reported:true,output:'ok'});
 // Asked before its call starts (an edit approval): the next call is it, and the proposed diff stands when the call reports none.
 changesAsked(state,'a2',{files:[{path:'y.md',change:'add',diff:'+hi'}]});changesCall(state,'c2',{});
 assert.deepEqual(changesCall(state,'c2',{status:'completed'}),[],'nothing is reported before the answer');
 assert.deepEqual(changesAnswered(state,'a2','always')[0]?.files,[{path:'y.md',change:'add',diff:'+hi'}],'answered after it finished: reported at once');
 changesCall(state,'c3',{});changesAsked(state,'a3');changesAnswered(state,'a3','deny');
 assert.deepEqual(changesCall(state,'c3',{status:'completed'}),[],'a denied request reports nothing');
 changesCall(state,'c4',{});changesAsked(state,'a4',{files:[{path:'z',change:'edit',diff:'+z'}]});changesAnswered(state,'a4','once');
 assert.deepEqual(changesCall(state,'c4',{output:'boom',status:'failed'}).map(r=>[r.status,r.files,r.output]),[['failed',[],'boom']],'a failed call does not claim the proposed edit');
 // OpenClaw: output, and that it reports no files.
 const claws=approvalChanges({reported:false});
 openClawChangesEvent(claws,{stream:'tool',data:{phase:'start',name:'exec',toolCallId:'e1'}});changesAsked(claws,'ap-1');changesAnswered(claws,'ap-1','once');
 assert.deepEqual(openClawChangesEvent(claws,{stream:'tool',data:{phase:'result',name:'exec',toolCallId:'e1',result:{content:[{type:'text',text:'done'}],details:{exitCode:2}}}}),[{id:'ap-1',status:'completed',files:[],reported:false,output:'done\n(exit code 2)'}]);
 assert.deepEqual(openClawChangesEvent(claws,{stream:'assistant',data:{toolCallId:'e1'}}),[]);
}
assert.deepEqual(readHarnessApprovalResult({id:'acp-1',status:'completed',files:[{path:'a',diff:'+x',change:'weird'},{path:'',diff:''}],reported:true}),{id:'acp-1',status:'completed',files:[{path:'a',change:'edit',diff:'+x'}],reported:true});
assert.equal(readHarnessApprovalResult({id:'bad id!',status:'completed'}),null);assert.equal(readHarnessApprovalResult({id:'a',status:'maybe'}),null);

// The approval card shows it --------------------------------------------------------------------------------------
class Node {
 children:Node[]=[];className='';type='';disabled=false;dataset:Record<string,string>={};attributes:Record<string,string>={};onclick:any=null;isConnected=true;private own='';
 get textContent():string {return this.own+this.children.map(c=>c.textContent).join('');}
 set textContent(value:string){this.own=String(value);this.children=[];}
 append(...nodes:Node[]){this.children.push(...nodes);}replaceChildren(...nodes:Node[]){this.children=nodes;this.own='';}
 setAttribute(name:string,value:string){this.attributes[name]=value;}
 all(test:(n:Node)=>boolean):Node[] {return [...(test(this)?[this]:[]),...this.children.flatMap(c=>c.all(test))];}
}
(globalThis as any).document={createElement:()=>new Node()};
{
 const body=approvalResultBody({files:[{path:'build/notes.txt',change:'edit',diff:' one\n-two\n+2'}]}) as unknown as Node;
 assert.deepEqual(body.all(n=>/fox-approval-(add|del|same)/.test(n.className)).map(n=>[n.className,n.textContent]),[['fox-approval-same',' one\n'],['fox-approval-del','-two\n'],['fox-approval-add','+2\n']]);
 assert.match(body.textContent,/^Changed: build\/notes\.txt/);
 assert.equal(approvalResultText({status:'completed',files:[{}],reported:true}),'Done. It changed 1 file:');
 assert.match(approvalResultText({status:'completed',files:[],reported:false}),/reports what the command printed, not which files/,'said honestly when the Harness reports no files');
 assert.equal(approvalResultText({status:'completed',files:[],reported:true}),'Done. It reported no file changes.');
 assert.equal(approvalResultText({status:'failed',files:[]}),'It did not finish.');
 assert.equal((approvalResultBody({files:[],output:'removed 3 files'}) as unknown as Node).textContent,'removed 3 files');
}

// Hosts: fixture `hermes` and `openclaw` commands ------------------------------------------------------------------
if(process.platform==='win32'){console.log('SKIP standing-rule fixtures on Windows (shell fixtures); shared rules PASS');process.exit(0);}
await withTempDir('worldlet-approval-rules-',async temp=>{
 // Hermes homes are read at their real path (macOS's /var is /private/var), so the scratch folder is too.
 const scratch=fs.realpathSync(temp),home=path.join(scratch,'home'),bin=path.join(scratch,'bin');fs.mkdirSync(bin,{recursive:true});
 const script=(name:string,source:string)=>{const file=path.join(scratch,name+'.cjs');fs.writeFileSync(file,source);fs.writeFileSync(path.join(bin,name),`#!/bin/sh\nexec "${process.execPath}" "${file}" "$@"\n`);fs.chmodSync(path.join(bin,name),0o755);return path.join(bin,name);};
 const calls=path.join(scratch,'calls.jsonl'),called=()=>fs.existsSync(calls)?fs.readFileSync(calls,'utf8').trim().split('\n').map(l=>JSON.parse(l)):[];
 // Hermes Agent: `config get/set command_allowlist` in HERMES_HOME's config.yaml, as its own CLI does.
 const hermesHome=path.join(home,'.hermes'),work=path.join(hermesHome,'profiles','work');fs.mkdirSync(work,{recursive:true});
 fs.writeFileSync(path.join(hermesHome,'config.yaml'),'model:\n  default: x\ncommand_allowlist:\n  - recursive delete\n  - podman *\n');
 fs.writeFileSync(path.join(work,'config.yaml'),'command_allowlist: [systemctl]\n');
 const hermesCommand=script('hermes',String.raw`const fs=require('fs'),path=require('path');
const file=path.join(process.env.HERMES_HOME,'config.yaml'),args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({hermes:args,home:process.env.HERMES_HOME})+'\n');
const text=fs.readFileSync(file,'utf8'),block=/command_allowlist:\s*\n((?:\s+- .*\n?)*)/.exec(text),flow=/command_allowlist:\s*\[(.*)\]/.exec(text);
const list=block?block[1].split('\n').filter(Boolean).map(l=>l.trim().slice(2)):flow?flow[1].split(',').map(s=>s.trim()).filter(Boolean):[];
if(args[0]==='config'&&args[1]==='get'){console.log('Loaded profile');console.log(JSON.stringify(list));process.exit(0);}
if(args[0]==='config'&&args[1]==='set'){const next=JSON.parse(args[3]);fs.writeFileSync(file,text.replace(/command_allowlist:[\s\S]*?(?=\n\S|$)/,'command_allowlist:\n'+next.map(e=>'  - '+e).join('\n')));process.exit(0);}
process.exit(2);
`);
 const env:HarnessEnvironment={platform:'linux',env:{PATH:'/usr/bin:/bin',HOME:home},home,systemDirectories:[]};
 const hermesInstall={id:'hermes' as const,title:'Hermes Agent',command:hermesCommand,prefix:[],configured:true};
 const rulesOf=hermesStandingRulesService(hermesInstall,env);
 const listed=await rulesOf.list();
 assert.deepEqual(listed.map(r=>[r.agent,r.allows,r.main??false]),[['default','recursive delete',true],['default','podman *',true],['work','systemctl',false]],'every profile, read from its config.yaml');
 assert.equal(called().length,0,'listing only reads');
 // Profiles are found by their real path: macOS's temporary folder /var is /private/var (Mac RC 2026.1008.3186).
 const realHome=fs.realpathSync(hermesHome);
 await rulesOf.revoke(listed[0].id);
 assert.deepEqual(called().map(c=>[c.hermes.slice(0,3).join(' '),c.home]),[['config get command_allowlist',realHome],['config set command_allowlist',realHome]],'revoked with Hermes\' own config set, in that profile\'s home');
 assert.deepEqual(JSON.parse(called()[1].hermes[3]),['podman *']);
 assert.deepEqual((await rulesOf.list()).map(r=>r.allows),['podman *','systemctl']);
 await rulesOf.revoke(listed[2].id);assert.equal(called().at(-1).home,fs.realpathSync(work));
 await assert.rejects(rulesOf.revoke(listed[0].id),/no longer has this rule/);
 assert.ok(standingRules(hermesInstall,env),'declared, so offered');assert.equal(standingRules({...hermesInstall,id:'codex'},env),null,'a Harness that keeps none has none');

 // OpenClaw: `approvals get --json`, `set --stdin`, `grants list/revoke --json`; its own command keeps the document.
 const store=path.join(scratch,'claw-approvals.json');fs.writeFileSync(store,JSON.stringify(doc));
 const clawCommand=script('openclaw',String.raw`const fs=require('fs');const args=process.argv.slice(2),store=${JSON.stringify(store)};
let stdin='';process.stdin.on('data',c=>stdin+=c);process.stdin.on('end',()=>{
 fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({openclaw:args,stdin:stdin||undefined})+'\n');
 const doc=JSON.parse(fs.readFileSync(store,'utf8'));
 if(args.join(' ')==='approvals get --json'){console.log(JSON.stringify({...doc,effectivePolicy:{}}));return;}
 if(args.join(' ')==='approvals set --stdin'){const file=JSON.parse(stdin);file.socket={...doc.file.socket,...file.socket};fs.writeFileSync(store,JSON.stringify({...doc,hash:'h2',file}));return;}
 if(args.join(' ')==='approvals grants list --json'){console.log(JSON.stringify({grants:[{grantId:'g1',agentId:'main',cronJobName:'Nightly backup',command:'restic backup ~',createdAtMs:5,expiresAtMs:null,revokedAtMs:doc.revoked?9:null}]}));return;}
 if(args.slice(0,3).join(' ')==='approvals grants revoke'){doc.revoked=args[3];fs.writeFileSync(store,JSON.stringify(doc));console.log(JSON.stringify({outcome:'revoked'}));return;}
 process.exitCode=2;
});`);
 const clawInstall={id:'openclaw' as const,title:'OpenClaw',command:clawCommand,prefix:[],configured:true};
 const clawRules=openClawStandingRulesService(clawInstall,env);
 const all=await clawRules.list();
 assert.deepEqual(all.map(r=>[r.kind,r.allows]),[['command','/usr/bin/rm'],['tool','docs › publish'],['command','/usr/bin/git'],['automation','restic backup ~']]);
 await clawRules.revoke(all[0].id);
 const set=called().find(c=>c.openclaw?.[1]==='set');
 assert.deepEqual(JSON.parse(set.stdin).agents.main.allowlist,[{pattern:'~/bin/rg'}],'its document without that entry, through its own approvals set');
 assert.equal(JSON.parse(fs.readFileSync(store,'utf8')).file.agents.main.allowlist.length,1);
 await clawRules.revoke(all[3].id);
 assert.deepEqual(called().at(-1).openclaw,['approvals','grants','revoke','g1','--json'],'an automation grant through its own grants revoke');
 assert.deepEqual((await clawRules.list()).map(r=>r.allows),['docs › publish','/usr/bin/git']);
 await assert.rejects(clawRules.revoke(all[0].id),/no longer has this rule/);

 // A revoked Hermes rule restarts Worldlet's own Hermes process (it reads the list when it starts); OpenClaw's needs none.
 {
  const context={profile:{} as any,root:path.join(scratch,'root'),development:false,analyticsID:()=>'',openExternal:async()=>{},record:()=>true,failure:()=>{},changed:()=>{}};
  for(const [install,restarts] of [[hermesInstall,1],[clawInstall,0]] as const){
   const adapter=new LocalHarnessAdapter(context,install,env);let stopped=0;
   (adapter as any).conversation={noted:null,approvals:null,unavailable:async()=>null,open:async()=>{throw Error('unused');},shutdown(){stopped++;}};
   adapter.forgetApprovals(install.id);adapter.forgetApprovals('pi');
   assert.equal(stopped,restarts,install.title);
   (adapter as any).running.add({});adapter.forgetApprovals(install.id);assert.equal(stopped,restarts,'not while a turn runs');
  }
 }

 // Settings › Approvals through the World's consumer: grants recorded from the cards, listed with the rules, revoked.
 const world=new WorldLedger(path.join(scratch,'world'));
 const live=hermesStandingRulesService(hermesInstall,env);
 fs.writeFileSync(path.join(hermesHome,'config.yaml'),'command_allowlist:\n  - recursive delete\n  - podman *\n');
 const revoked:string[]=[];
 const service:any={harness:{id:'hermes',title:'Hermes Agent'},standingRules:()=>[{harness:'hermes',title:'Hermes Agent',rules:{list:()=>live.list(),revoke:async(id:string)=>{revoked.push(id);await live.revoke(id);}}},{harness:'openclaw',title:'OpenClaw',rules:{list:async()=>{throw Error('OpenClaw could not list its approvals: not set up');},revoke:async()=>{}}}]};
 const host:any={store:{writable:true,sampleEnabled:()=>false,ledger:()=>world},diagnostics:{record:(error:unknown)=>{throw error;}},optional:(name:string)=>name===AGENT?service:undefined};
 const rules=createHarnessApprovalRules(host);
 rules.asked({id:'acp-1',title:'Hermes Agent asks: rm',detail:'rm -rf build',choices:['once','always','deny'],rule:'recursive delete',thread:'applet:gmail'});
 rules.answered('acp-1','always');
 rules.asked({id:'acp-2',title:'Hermes Agent asks: ls',detail:'ls',choices:['once','deny'],rule:'ls'});rules.answered('acp-2','once');
 assert.deepEqual(readApprovalGrants(world.setting('approval-grants')).map(g=>[g.harness,g.rule,g.thread]),[['hermes','recursive delete','applet:gmail']],'only an Always is recorded, with its thread');
 const shown:any=await rules.list();
 assert.deepEqual(shown.harnesses.map((h:any)=>[h.harness,h.revoke,h.inUse,h.rules.length,h.error??null]),[['hermes','restart',true,2,null],['openclaw','live',false,0,'OpenClaw could not list its approvals: not set up']],'one Agent failing to list does not hide the others');
 const [granted,outside]=shown.harnesses[0].rules;
 assert.deepEqual([granted.allows,granted.thread,typeof granted.grantedAt,granted.inWorld],['recursive delete','In the gmail Applet','number',true]);
 assert.equal(outside.thread,undefined,'a rule granted outside Worldlet has no thread');
 await assert.rejects(rules.revoke('hermes','not-a-rule'),/no longer there/);
 assert.deepEqual(await rules.revoke('hermes',granted.id),{ok:true});assert.deepEqual(revoked,[granted.id]);
 service.harness={id:'remote',title:'Agent on Mac mini'};
 assert.equal((await rules.list()).elsewhere,'Agent on Mac mini','an Agent that keeps its rules elsewhere is said, not hidden');
 host.store.sampleEnabled=()=>true;
 await assert.rejects(rules.revoke('hermes',outside.id),/your own world/);
 host.store.sampleEnabled=()=>false;

 // The Settings page: a row per rule with its agent, when and where, and Revoke; an Agent that cannot revoke says how.
 const requests:any[]=[];
 let answer:any={harnesses:[{harness:'hermes',title:'Hermes Agent',inUse:true,revoke:'restart',note:'Hermes Agent reads its allowlist when it starts.',rules:[{id:granted.id,allows:'recursive delete',agent:'default',kind:'command',main:true,grantedAt:Date.UTC(2026,9,8,12),thread:'In the gmail Applet',inWorld:true},{id:outside.id,allows:'podman *',agent:'work',kind:'command'}]},
  {harness:'other',title:'Other Agent',revoke:null,rules:[{id:'rule-0000000000000000',allows:'x',agent:'*',kind:'command'}]}],elsewhere:'Agent on Mac mini'};
 const call=async(action:string,args:any)=>{requests.push([action,args]);if(args.operation==='revoke'){answer={harnesses:[{...answer.harnesses[0],rules:answer.harnesses[0].rules.slice(1)}]};return {ok:true};}return answer;};
 const target=new Node();
 await showApprovalRules(target as any,call,()=>true);
 const rows=target.all(n=>!!n.dataset.rule);
 assert.deepEqual(rows.map(r=>r.dataset.rule),[granted.id,outside.id,'rule-0000000000000000']);
 assert.match(rows[0].textContent,/recursive delete[\s\S]*Main agent · granted .*2026, in the gmail Applet\./);
 assert.match(rows[1].textContent,/Agent “work” · granted outside Worldlet; Hermes Agent keeps no date\./);
 assert.equal(rows[2].all(n=>n.dataset.action==='revoke-rule').length,0,'no Revoke where the Agent cannot have it revoked');
 assert.match(target.textContent,/Worldlet cannot revoke these\. Change them in Other Agent itself\./);
 assert.match(target.textContent,/Agent on Mac mini keeps its standing rules where it runs/);
 await rows[0].all(n=>n.dataset.action==='revoke-rule')[0].onclick();
 assert.deepEqual(requests.filter(([,a])=>a.operation==='revoke'),[['harnessApprovalRules',{operation:'revoke',harness:'hermes',id:granted.id}]]);
 assert.deepEqual(target.all(n=>!!n.dataset.rule).map(r=>r.dataset.rule),[outside.id],'the list is read again after a revoke');
 assert.match(target.textContent,/Hermes Agent will ask again before: recursive delete Hermes Agent reads its allowlist when it starts\./);
 assert.equal(approvalRuleLine({id:'r',allows:'x',agent:'*',kind:'command'},'OpenClaw'),'All agents · granted outside Worldlet; OpenClaw keeps no date.');
});
delete (globalThis as any).document;
console.log('PASS approval rules: declared features, Hermes Agent allowlist and OpenClaw approvals and grants read and revoked through their own commands (never written by Worldlet), the World\'s record of who said Always and where, the tracker that ties an approval to its tool call, the restart a revoked Hermes rule needs, Settings › Approvals and the approval card\'s diff');
