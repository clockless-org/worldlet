// Fox's own Hermes profile moving into the person's stock Hermes Agent (platform/electron/src/modules/agent-runtime/fox-move.ts):
// once, only what that Hermes Agent lacks (memory files missing or empty there, skills it has not got, the person's own
// scheduled jobs when it has none), never settings, keys, sign-ins, Hermes' bundled skills or Worldlet's own jobs, and
// nothing of the person's Hermes Agent replaced.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {moveFoxProfile} from '../platform/electron/src/modules/agent-runtime/fox-move.ts';
import {withTempDir} from './test-temp.ts';

const write=(file:string,text:string)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};
await withTempDir('worldlet-fox-move-',async temp=>{
 const root=path.join(temp,'library'),own=path.join(root,'agent','private','hermes'),target=path.join(temp,'home','.hermes');
 write(path.join(own,'config.yaml'),'model:\n  provider: local-codex\n');
 write(path.join(own,'.env'),'OPENAI_API_KEY=secret\n');write(path.join(own,'auth.json'),'{}');
 write(path.join(own,'memories','USER.md'),'Prefers short answers.');write(path.join(own,'memories','MEMORY.md'),'Fox remembers the garden.');
 write(path.join(own,'skills','.bundled_manifest'),'plan:abc\n');
 write(path.join(own,'skills','productivity','plan','SKILL.md'),'bundled');
 write(path.join(own,'skills','travel','trip-notes','SKILL.md'),'# Trip notes');write(path.join(own,'skills','travel','trip-notes','references','a.md'),'ref');
 write(path.join(own,'skills','kept','SKILL.md'),'Fox version');
 write(path.join(own,'cron','jobs.json'),JSON.stringify({jobs:[{id:'mine',prompt:'Water the plants',origin:{platform:'cli'}},{id:'world',prompt:'Check mail',origin:{platform:'worldlet'}}]}));
 // Nothing before the person's Hermes Agent is there.
 assert.equal(moveFoxProfile(root,own,target),null);
 write(path.join(target,'config.yaml'),'model:\n  provider: openai-codex\n');
 write(path.join(target,'memories','MEMORY.md'),'Their own memory.');write(path.join(target,'memories','USER.md'),'  \n');
 write(path.join(target,'skills','kept','SKILL.md'),'Their version');
 write(path.join(target,'cron','jobs.json'),JSON.stringify({jobs:[],updated_at:'x'}));
 const moved=moveFoxProfile(root,own,target);
 assert.deepEqual(moved,{memories:['USER.md'],skills:1,jobs:1});
 assert.equal(fs.readFileSync(path.join(target,'memories','USER.md'),'utf8'),'Prefers short answers.','an empty memory file is filled');
 assert.equal(fs.readFileSync(path.join(target,'memories','MEMORY.md'),'utf8'),'Their own memory.','their memory stays');
 assert.equal(fs.readFileSync(path.join(target,'skills','travel','trip-notes','references','a.md'),'utf8'),'ref','a skill comes whole');
 assert.equal(fs.readFileSync(path.join(target,'skills','kept','SKILL.md'),'utf8'),'Their version','their skill stays');
 assert.equal(fs.existsSync(path.join(target,'skills','productivity','plan')),false,'Hermes’ bundled skills are its own installer’s');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(target,'cron','jobs.json'),'utf8')),{jobs:[{id:'mine',prompt:'Water the plants',origin:{platform:'cli'}}],updated_at:'x'},'only the person’s own jobs');
 assert.equal(fs.readFileSync(path.join(target,'config.yaml'),'utf8'),'model:\n  provider: openai-codex\n','its settings stay');
 for(const name of ['.env','auth.json'])assert.equal(fs.existsSync(path.join(target,name)),false,name+' never moves');
 assert.equal(fs.readFileSync(path.join(own,'memories','USER.md'),'utf8'),'Prefers short answers.','Fox’s profile is left as it was');
 // Once.
 fs.rmSync(path.join(target,'memories','USER.md'));
 assert.equal(moveFoxProfile(root,own,target),null);assert.equal(fs.existsSync(path.join(target,'memories','USER.md')),false);
 // A Hermes Agent that already has jobs keeps its list.
 const other=path.join(temp,'other'),otherRoot=path.join(temp,'library-2');
 fs.cpSync(own,path.join(otherRoot,'agent','private','hermes'),{recursive:true});
 write(path.join(other,'config.yaml'),'x: 1\n');write(path.join(other,'cron','jobs.json'),JSON.stringify({jobs:[{id:'theirs'}]}));
 assert.equal(moveFoxProfile(otherRoot,path.join(otherRoot,'agent','private','hermes'),other)?.jobs,0);
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(other,'cron','jobs.json'),'utf8')),{jobs:[{id:'theirs'}]});
});
console.log('PASS Fox moves into stock Hermes Agent: once, only memory files, skills and the person’s own jobs it lacks; settings, keys, sign-ins, bundled skills and Worldlet’s jobs stay');
