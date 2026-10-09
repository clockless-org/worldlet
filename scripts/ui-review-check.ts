// RC 录像 review (scripts/ui-review.ts): which pictures go to Codex, the strict answer shape, fresh runs only, and a
// whole run against a fake Codex CLI: a blocker fails the gate, issues and nits do not, no pictures or a Codex error SKIP.
import assert from 'node:assert/strict';
import {execFile,spawnSync} from 'node:child_process';
import http from 'node:http';
import {mkdirSync,readFileSync,rmSync,utimesSync,writeFileSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {MAX_IMAGES,inboxItem,parseReview,pickFrames,freshRuns,reviewPrompt,type FrameIndex} from './ui-review.ts';
import {withTempDir} from './test-temp.ts';

const frames=(n:number)=>Array.from({length:n},(_,i)=>({file:`frame-${String(i+1).padStart(4,'0')}.jpg`,at:i*1500}));
const index=(n:number,lines:{at:number;line:string}[]=[]):FrameIndex=>({check:'onboarding-flow',startedAt:new Date().toISOString(),seconds:n*1.5,passed:true,frames:frames(n),lines});
assert.deepEqual(pickFrames(index(3)),['frame-0001.jpg','frame-0002.jpg','frame-0003.jpg'],'few pictures all go');
const many=pickFrames(index(400,[{at:30_000,line:'PASS sign-in'},{at:300_000,line:'PASS tour'}]));
assert.equal(many.length,MAX_IMAGES);assert.equal(many[0],'frame-0001.jpg');assert.equal(many.at(-1),'frame-0400.jpg');
assert.ok(many.includes('frame-0021.jpg')&&many.includes('frame-0201.jpg'),'the picture at each printed step');
assert.deepEqual([...many].sort(),many,'in time order');
assert.match(reviewPrompt(index(2,[{at:3000,line:'PASS sign-in'}]),['a.jpg']),/3s PASS sign-in/);
assert.deepEqual(parseReview(JSON.stringify({summary:'ok',findings:[]})).findings,[]);
for(const bad of ['{',JSON.stringify({summary:'x'}),JSON.stringify({summary:'x',findings:[{severity:'fatal',frame:'a',title:'t',detail:'d'}]})])assert.throws(()=>parseReview(bad));

await withTempDir('worldlet-ui-review-item-',async unit=>{
 writeFileSync(path.join(unit,'frame-0002.jpg'),'jpeg');
 const finding=(severity:'issue'|'nit'|'blocker',frame:string)=>({severity,frame,title:severity,detail:'d'});
 assert.equal(inboxItem({machine:'m',sha:'abc',dir:unit,index:index(3),summary:'s',findings:[finding('nit','frame-0002.jpg'),finding('blocker','frame-0002.jpg')]}),null,'only issues are sent');
 const item=inboxItem({machine:'windows-release',sha:'0123456789abcdef',dir:unit,index:index(3),summary:'s',findings:[finding('issue','frame-0002.jpg'),finding('issue','frame-0003.jpg')]})!;
 assert.equal(item.sourceId,'windows-release.onboarding-flow.0123456789ab');assert.equal(item.frames.length,1,'only pictures that exist');assert.deepEqual(item.frames[0],{at:2,jpeg:Buffer.from('jpeg').toString('base64')});
});

await withTempDir('worldlet-ui-review-check-',async logs=>{
 const dir=path.join(logs,'onboarding-flow-frames');mkdirSync(dir);
 for(const f of frames(20))writeFileSync(path.join(dir,f.file),'jpeg');
 writeFileSync(path.join(dir,'index.json'),JSON.stringify(index(20,[{at:6000,line:'PASS sign-in'}])));
 const stale=path.join(logs,'old-frames');mkdirSync(stale);writeFileSync(path.join(stale,'index.json'),JSON.stringify(index(2)));
 const old=new Date(Date.now()-7*3600_000);utimesSync(path.join(stale,'index.json'),old,old);
 assert.deepEqual(freshRuns(logs).map(r=>path.basename(r.dir)),['onboarding-flow-frames'],'only pictures from this gate run');
 // The whole run below uses a fake Codex CLI as a script with a shebang, which Windows cannot run directly.
 if(process.platform==='win32'){console.log('PASS UI review (selection and parsing; the fake-CLI run is skipped on Windows)');process.exit(0);}
 // A fake Codex CLI (the runs clear the hosted-runner skip, WORLDLET_CODEX_GATES_SKIP): checks the read-only invocation and the pictures, answers with the scenario's JSON.
 const fake=path.join(logs,'codex.mjs'),answer=path.join(logs,'answer.json');
 writeFileSync(fake,`#!/usr/bin/env node
import fs from 'node:fs';
const a=process.argv.slice(2),get=k=>a[a.indexOf(k)+1];
if(a[0]!=='exec'||get('--sandbox')!=='read-only'||a.at(-1)!=='-')process.exit(3);
const images=get('--image').split(',');if(images.length!==${MAX_IMAGES}||!images.every(f=>fs.existsSync(f)))process.exit(4);
JSON.parse(fs.readFileSync(get('--output-schema'),'utf8'));
const prompt=fs.readFileSync(0,'utf8');if(!prompt.includes('PASS sign-in'))process.exit(5);
const v=fs.readFileSync(${JSON.stringify(answer)},'utf8');if(v==='crash')process.exit(9);
fs.writeFileSync(get('--output-last-message'),v);
`);chmodSync(fake,0o755);
 const run=(review:unknown)=>{writeFileSync(answer,typeof review==='string'?review:JSON.stringify(review));return spawnSync(process.execPath,['scripts/ui-review.ts'],{encoding:'utf8',env:{...process.env,WORLDLET_CODEX_GATES_SKIP:'',WORLDLET_CHECK_LOGS:logs,WORLDLET_UI_REVIEW_CODEX:fake,WORLDLET_MACHINE_SERVICE_CONFIG:path.join(logs,'not-enrolled.json')}});};
 let r=run({summary:'Looks fine.',findings:[{severity:'nit',frame:'frame-0003.jpg',title:'Tight padding',detail:'The chat bubble padding is tight.'},{severity:'issue',frame:'frame-0005.jpg',title:'Clipped label',detail:'A region label is cut off.'}]});
 assert.equal(r.status,0,r.stderr+r.stdout);assert.match(r.stdout,/ISSUE frame-0005\.jpg: Clipped label/);assert.match(r.stdout,/PASS UI review/);
 assert.equal(JSON.parse(readFileSync(path.join(logs,'ui-review.json'),'utf8')).results[0].findings.length,2,'findings are saved');
 r=run({summary:'Broken.',findings:[{severity:'blocker',frame:'frame-0010.jpg',title:'Black World',detail:'The World is black.'}]});
 assert.equal(r.status,1);assert.match(r.stderr,/FAIL UI review: 1 blocker/);
 r=run('crash');assert.equal(r.status,0,'a Codex error never blocks');assert.match(r.stderr,/could not run/);
 r=run('not json');assert.equal(r.status,0);assert.match(r.stderr,/could not run/);
 // Issue findings go to the admin requirement inbox with the pictures they name, once a day per check.
 const posts:any[]=[];
 const admin=http.createServer((req,res)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{posts.push({path:req.url,auth:req.headers.authorization,body:JSON.parse(b)});res.setHeader('Content-Type','application/json');res.end('{"added":true}');});});
 await new Promise<void>(ok=>admin.listen(0,'127.0.0.1',ok));
 const config=path.join(logs,'machine-service.json');
 writeFileSync(config,JSON.stringify({url:`http://127.0.0.1:${(admin.address() as any).port}`,token:'t'.repeat(40),machine:'mac-release'}));
 const send=()=>new Promise<{code:number;out:string}>(ok=>execFile(process.execPath,['scripts/ui-review.ts'],{env:{...process.env,WORLDLET_CODEX_GATES_SKIP:'',WORLDLET_CHECK_LOGS:logs,WORLDLET_UI_REVIEW_CODEX:fake,WORLDLET_MACHINE_SERVICE_CONFIG:config}},(e,out,err)=>ok({code:e?Number(e.code)||1:0,out:out+err})));
 writeFileSync(answer,JSON.stringify({summary:'One clipped label.',findings:[{severity:'issue',frame:'frame-0005.jpg',title:'Clipped label',detail:'A region label is cut off.'},{severity:'nit',frame:'frame-0003.jpg',title:'Tight',detail:'Tight padding.'}]}));
 let s=await send();assert.equal(s.code,0,s.out);assert.match(s.out,/sent to the admin requirement inbox \(1 pictures\)/);
 assert.equal(posts.length,1);assert.equal(posts[0].path,'/api/machine/inbox');assert.equal(posts[0].auth,'Bearer '+'t'.repeat(40));
 assert.equal(posts[0].body.source,'rc-ui');assert.match(posts[0].body.sourceId,/^mac-release\.onboarding-flow\./);assert.match(posts[0].body.body,/Clipped label \(screenshot 0\)/);assert.doesNotMatch(posts[0].body.body,/Tight/,'nits stay out');
 assert.equal(posts[0].body.frames[0].at,6);
 s=await send();assert.match(s.out,/less than a day ago/);assert.equal(posts.length,1,'once a day per check');
 admin.close();
 rmSync(dir,{recursive:true});r=run({summary:'',findings:[]});assert.equal(r.status,0);assert.match(r.stdout,/SKIP UI review: no pictures/);
});
console.log('PASS UI review: step pictures and even spacing up to 16, strict JSON, fresh runs only; a blocker fails, issues and nits are reported, a Codex error or no pictures SKIP; issues go to the admin inbox once a day.');
