import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {validateHarnessServices} from '../contracts/harness-services.ts';
import {agentServerConnections,claudeCodeStandingRules,codexStandingRules,harnessApprovalFeatures,harnessReadOnlyNote,harnessService,isMemoryEntryId,memoryEntries,memoryForgetRequest} from '../agent/gate/index.ts';
import {standingRules} from '../platform/electron/src/modules/agent-runtime/harness-approvals.ts';
import {harnessConnections} from '../platform/electron/src/modules/agent-runtime/harness-connections.ts';
import {harnessMemory} from '../platform/electron/src/modules/agent-runtime/harness-memory.ts';
import {harnessSkills} from '../platform/electron/src/modules/agent-runtime/harness-skills.ts';
import {createHarnessControls} from '../platform/electron/src/modules/fox/harness-controls.ts';
import {createHarnessConnections} from '../platform/electron/src/modules/fox/harness-connections.ts';
import {withTempDir} from './test-temp.ts';

// Settings › Context and the read-only parts for Claude Code, Codex and pi (owner plan 2026-10-11, PR 3;
// agent/gate/harness-memory.ts): what each Agent remembers, read where it keeps it and never written; forgetting is a
// plain request in Fox's conversation. Claude Code's and Codex's skills, MCP servers and standing rules, and pi's
// skills, are listed with where to change them, never changed. Fixture homes only; no real Agent or home is touched.

// Declarations ------------------------------------------------------------------------------------------------------
for(const id of ['hermes','openclaw','claude-code','codex','pi'])assert.equal(harnessService(id,'memory'),'files',id);
for(const id of ['remote','remote-openclaw'])assert.equal(harnessService(id,'memory'),null,id);
for(const id of ['claude-code','codex','pi'])assert.equal(harnessService(id,'skills'),'files',id);
for(const id of ['claude-code','codex']){assert.equal(harnessService(id,'connections'),'files',id);assert.equal(harnessService(id,'approvals'),null,'Worldlet does not answer its prompts');
 const features=harnessApprovalFeatures(id);assert.equal(features.rules,'files');assert.equal(features.revoke,undefined,'never revoked from Worldlet');assert.match(features.revokeNote??'',/Change them|Delete a line/);}
assert.throws(()=>validateHarnessServices({version:2,harness:'x',services:{},approvalFeatures:{rules:'files',revoke:'live'}}),/except rules shown read-only/,'revoking needs the approvals service');
assert.throws(()=>validateHarnessServices({version:2,harness:'x',services:{},approvalFeatures:{changes:'diffs'}}),/except rules shown read-only/);
assert.ok(validateHarnessServices({version:2,harness:'x',services:{},approvalFeatures:{rules:'files',revokeNote:'Change them there.'}}));
for(const id of ['claude-code','codex','pi'])assert.match(harnessReadOnlyNote(id,'skills'),/skills folder of its home/);
assert.match(harnessReadOnlyNote('claude-code','connections'),/in Claude Code itself/);assert.match(harnessReadOnlyNote('codex','connections'),/in Codex itself/);
assert.equal(harnessReadOnlyNote('hermes','skills'),'','an Agent Worldlet changes needs no note');

// Core: entries, the forget request, rules and servers ---------------------------------------------------------------
const hermesUser=memoryEntries('Prefers Chinese.\n§\nRuns on Saturday mornings.\n§\nPrefers Chinese.',{harness:'hermes',kind:'user',where:'~/.hermes/memories/USER.md'});
assert.deepEqual(hermesUser.map(e=>e.text),['Prefers Chinese.','Runs on Saturday mornings.'],'Hermes Agent’s § items, each once');
assert.ok(hermesUser.every(e=>isMemoryEntryId(e.id)&&e.kind==='user'));
assert.equal(memoryEntries('Prefers Chinese.',{harness:'hermes',kind:'user',where:'~/.hermes/memories/USER.md'})[0].id,hermesUser[0].id,'stable ids');
assert.deepEqual(memoryEntries('# Memory\n\nThe lease renewal is due in November.\n\n---\n\n- Ships three times a day\n- Uses pnpm',{harness:'openclaw',kind:'memory',where:'MEMORY.md'}).map(e=>e.text),['The lease renewal is due in November.','- Ships three times a day\n- Uses pnpm'],'paragraphs without headings or rules');
assert.equal(memoryEntries('x'.repeat(5000),{harness:'pi',kind:'memory',where:'AGENTS.md'})[0].text.length,2000,'an entry is bounded');
assert.equal(memoryForgetRequest('Hermes Agent',{text:'Runs on\nSaturday mornings.'}),'Please forget this from Hermes Agent’s memory: “Runs on Saturday mornings.”. Use Hermes Agent’s own memory to remove it, then tell me it is gone.');
assert.deepEqual(claudeCodeStandingRules({permissions:{allow:['Bash(npm run test:*)','mcp__github__list_issues','WebFetch(domain:example.com)','Bash(npm run test:*)',3],deny:['Bash(rm:*)']}}).map(r=>[r.kind,r.allows]),
 [['command','npm run test:*'],['tool','mcp__github__list_issues'],['tool','WebFetch(domain:example.com)']],'allow entries only, each once');
assert.deepEqual(claudeCodeStandingRules(null),[]);
assert.deepEqual(codexStandingRules('prefix_rule(pattern=["git", "status"], decision="allow")\nprefix_rule(pattern=["echo", "Hello, world!"], decision="allow")\nprefix_rule(pattern=["rm"], decision="forbidden")\nprefix_rule(\n    pattern = ["npm"],\n)\nprefix_rule(pattern=["git", "status"], decision="allow")\n').map(r=>r.allows),
 ['git status','echo "Hello, world!"'],'the lines Codex appends for an always-allowed prefix; hand-written policy is the person’s own');
const servers=agentServerConnections('claude-code',[{name:'github',url:'https://api.example.com/mcp?token=abc123secret',headers:{Authorization:'Bearer x'}},{name:'files',command:'npx',args:['-y','@scope/server','--api-key=sk-abcdefghijklmnop']}]);
assert.deepEqual(servers.map(s=>[s.name,s.where,s.sign,s.removable]),[['github','https://api.example.com/mcp?token=•••','token',false],['files','npx -y @scope/server --api-key=•••','none',false]],'masked, never removable');

const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
await withTempDir('worldlet-memory-',async scratch=>{
 const home=path.join(scratch,'home'),environment={platform:process.platform,env:{HOME:home} as NodeJS.ProcessEnv,home};
 const install=(id:any,title:string)=>({id,title,command:'/fake/'+id,prefix:[],configured:true});
 write(path.join(home,'.hermes','config.yaml'),'model: x\n');
 write(path.join(home,'.hermes','memories','USER.md'),'Prefers Chinese.\n§\nRuns on Saturday mornings.');
 write(path.join(home,'.hermes','memories','MEMORY.md'),'Worldlet ships three times a day.');
 write(path.join(home,'.openclaw','workspace','USER.md'),'Lives in Lisbon.');
 write(path.join(home,'.openclaw','workspace','MEMORY.md'),'# Notes\n\nThe lease renewal is due in November.\n\nPrefers short replies.');
 write(path.join(home,'.claude','CLAUDE.md'),'Use pnpm, never npm.\n\nWrite commit messages in English.');
 write(path.join(home,'.claude','settings.json'),JSON.stringify({permissions:{allow:['Bash(pnpm test)','mcp__linear__create_issue']}}));
 write(path.join(home,'.claude.json'),JSON.stringify({mcpServers:{linear:{url:'https://mcp.linear.example/sse'}}}));
 write(path.join(home,'.claude','skills','release-notes','SKILL.md'),'---\nname: release-notes\ndescription: Draft release notes.\n---\nSteps.\n');
 write(path.join(home,'.codex','AGENTS.md'),'Prefer small pull requests.');
 write(path.join(home,'.codex','rules','default.rules'),'prefix_rule(pattern=["cargo", "test"], decision="allow")\n');
 write(path.join(home,'.codex','config.toml'),'[mcp_servers.docs]\ncommand = "npx"\nargs = ["-y", "docs-server"]\n');
 write(path.join(home,'.codex','skills','triage','SKILL.md'),'---\nname: triage\ndescription: Triage issues.\n---\nSteps.\n');
 write(path.join(home,'.pi','agent','AGENTS.md'),'Answer in British English.');
 write(path.join(home,'.pi','agent','skills','publish','SKILL.md'),'---\nname: publish\ndescription: Publish the site.\n---\nBuild.\n');
 const before=fs.readFileSync(path.join(home,'.hermes','memories','USER.md'),'utf8');

 const read=async(id:string,title:string)=>(await harnessMemory(install(id,title),environment)!.list()).map(e=>[e.kind,e.text,e.where]);
 assert.deepEqual(await read('hermes','Hermes Agent'),[['user','Prefers Chinese.','~/.hermes/memories/USER.md'],['user','Runs on Saturday mornings.','~/.hermes/memories/USER.md'],['memory','Worldlet ships three times a day.','~/.hermes/memories/MEMORY.md']]);
 assert.deepEqual(await read('openclaw','OpenClaw'),[['user','Lives in Lisbon.','~/.openclaw/workspace/USER.md'],['memory','The lease renewal is due in November.','~/.openclaw/workspace/MEMORY.md'],['memory','Prefers short replies.','~/.openclaw/workspace/MEMORY.md']]);
 assert.deepEqual(await read('claude-code','Claude Code'),[['memory','Use pnpm, never npm.','~/.claude/CLAUDE.md'],['memory','Write commit messages in English.','~/.claude/CLAUDE.md']]);
 assert.deepEqual(await read('codex','Codex'),[['memory','Prefer small pull requests.','~/.codex/AGENTS.md']]);
 assert.deepEqual(await read('pi','pi'),[['memory','Answer in British English.','~/.pi/agent/AGENTS.md']]);
 assert.equal(fs.readFileSync(path.join(home,'.hermes','memories','USER.md'),'utf8'),before,'read only');
 const empty={...environment,home:path.join(scratch,'nobody'),env:{HOME:path.join(scratch,'nobody')} as NodeJS.ProcessEnv};
 assert.deepEqual(await harnessMemory(install('codex','Codex'),empty)!.list(),[],'nothing kept, nothing listed');

 // Claude Code, Codex and pi: listed, never changed
 for(const [id,name] of [['claude-code','release-notes'],['codex','triage'],['pi','publish']]){
  const skills=harnessSkills(id,environment)!;
  assert.deepEqual((await skills.list()).map(s=>s.name),[name],id);
  assert.equal(skills.change,undefined,id+' has no command Worldlet uses');assert.equal(skills.save,undefined);
 }
 const ccRules=standingRules(install('claude-code','Claude Code'),environment)!,codexRules=standingRules(install('codex','Codex'),environment)!;
 assert.deepEqual((await ccRules.list()).map(r=>[r.kind,r.allows]),[['command','pnpm test'],['tool','mcp__linear__create_issue']]);
 assert.deepEqual((await codexRules.list()).map(r=>r.allows),['cargo test']);
 await assert.rejects(ccRules.revoke((await ccRules.list())[0].id),/only in Claude Code itself/);
 assert.deepEqual((await harnessConnections(install('claude-code','Claude Code'),environment)!.list()).map(c=>[c.name,c.where,c.removable]),[['linear','https://mcp.linear.example/sse',false]]);
 const codexConnections=harnessConnections(install('codex','Codex'),environment)!;
 assert.deepEqual((await codexConnections.list()).map(c=>[c.name,c.where]),[['docs','npx -y docs-server']]);assert.equal(codexConnections.change,undefined);

 // The World's side: memory for every Agent here, never in the practice world; read-only parts carry their note
 let sample=false;
 const memory=harnessMemory(install('claude-code','Claude Code'),environment)!;
 const host:any={store:{writable:true,sampleEnabled:()=>sample,ledger:()=>({skillTurns:()=>[]})},diagnostics:{record:()=>{}},
  optional:(name:string)=>name==='agent'?{harness:{id:'claude-code',title:'Claude Code'},harnessMemories:()=>[{harness:'claude-code',title:'Claude Code',memory}],
   harnessSkillSets:()=>[{harness:'claude-code',title:'Claude Code',skills:harnessSkills('claude-code',environment)!}],
   harnessConnections:()=>[{harness:'claude-code',title:'Claude Code',connections:harnessConnections(install('claude-code','Claude Code'),environment)!}]}:null};
 const controls=createHarnessControls(host);
 const listed=await controls.memoryRequest() as any;
 assert.deepEqual(listed.current,{harness:'claude-code',title:'Claude Code'});
 assert.equal(listed.harnesses[0].inUse,true);assert.deepEqual(listed.harnesses[0].entries.map((e:any)=>e.text),['Use pnpm, never npm.','Write commit messages in English.']);
 const skills=(await controls.skillRequest({operation:'list'}) as any).harnesses[0];
 assert.equal(skills.changes,false);assert.match(skills.note,/~\/\.claude\/skills/);
 await assert.rejects(controls.skillRequest({operation:'preview',harness:'claude-code',skill:'release-notes',change:'disable'}),/only in Claude Code itself/);
 const connections=(await createHarnessConnections(host).list() as any).harnesses[0];
 assert.equal(connections.changes,false);assert.match(connections.note,/in Claude Code itself/);
 sample=true;
 assert.deepEqual((await controls.memoryRequest() as any).harnesses,[],'never in the practice world');
});
console.log('PASS Agent memory: what Hermes Agent, OpenClaw, Claude Code, Codex and pi remember, read where each keeps it as entries and never written, forgetting a plain request to the Agent; Claude Code’s and Codex’s skills, MCP servers and standing rules, and pi’s skills, listed with where to change them, never changed');
