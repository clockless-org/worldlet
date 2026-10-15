import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {withTempDir} from './test-temp.ts';
import {WorldLedger} from '../platform/electron/src/store/ledger.ts';
import {createAgentAccess} from '../platform/electron/src/modules/agent-runtime/agent-access.ts';
import {GITHUB_APP_VAULT_KEY,GITHUB_DRAFT_MESSAGES,createGithubDrafts,type GithubFetch} from '../platform/electron/src/modules/agent-runtime/github-drafts.ts';
import {openStandingWorldTools} from '../platform/electron/src/modules/agent-runtime/world-tool-bridge.ts';
import {createAgentAsks} from '../platform/electron/src/modules/agent-runtime/agent-asks.ts';
import {ASK_REASONS,askItemId} from '../core/agent/asks.ts';
import {roomDenied} from '../contracts/web-world.ts';
import {STANDING_OUTSIDE_TURN} from '../core/agent/grants.ts';
import {GITHUB_DRAFT_REASONS,GITHUB_DRAFT_STALE,githubDraftItemId} from '../core/agent/github-drafts.ts';

// GitHub drafts on the host (core/agent/GRANTS.md#github-drafts), the same modules the Electron and Node hosts run,
// against a stubbed GitHub: an Agent drafts only under its own "Can draft GitHub changes" Grant; the draft keeps the
// target as read; Approve reads it again and refuses when its state or updatedAt changed or it is gone, and otherwise
// writes once as the GitHub App (a JWT it signs, exchanged for an installation token) and keeps the result's link;
// Dismiss writes nothing; everything is audited. The App's private key, its signed token and the installation token
// appear in no answer, item, audit entry, stored row or log line.
await withTempDir('worldlet-github-drafts-',async dir=>{
 const ledger=new WorldLedger(path.join(dir,'world'));
 let clock=Date.parse('2026-10-15T12:00:00.000Z');
 const now=()=>new Date(clock).toISOString();
 const secrets=new Map<string,string>();
 const vault={get:(id:string)=>secrets.get(id)??null,set:(id:string,value:string)=>{secrets.set(id,value);},delete:(id:string)=>{secrets.delete(id);},deleteAll:()=>secrets.clear()};
 const access=createAgentAccess({root:path.join(dir,'access'),vault,ledger:()=>ledger});
 const logged:string[]=[];
 const original={log:console.log,error:console.error,warn:console.warn};
 for(const name of ['log','error','warn'] as const)console[name]=(...args:unknown[])=>{logged.push(args.map(String).join(' '));};

 // The GitHub App: a fixture key made for this run.
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const pem=privateKey.export({type:'pkcs1',format:'pem'}).toString();
 const otherPem=crypto.generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString();
 const INSTALLATION_TOKEN='ghs_'+'F1xture'.repeat(6);
 // Stubbed GitHub: an Issue, a pull request and a repository, each with its state and updated_at; every request kept.
 const issues=new Map<string,any>([
  ['example/app#12',{number:12,title:'Build fails on Windows',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/issues/12'}],
  ['example/app#13',{number:13,title:'Add dark mode',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/pull/13',pull_request:{url:'x'}}],
  ['example/app#14',{number:14,title:'Old crash',state:'closed',updated_at:'2026-10-14T10:00:00Z',html_url:'https://github.com/example/app/issues/14'}],
 ]);
 const repos=new Map<string,any>([['example/app',{full_name:'example/app',archived:false,updated_at:'2026-10-15T09:00:00Z',html_url:'https://github.com/example/app'}]]);
 const requests:{method:string;path:string;auth:string;body?:any}[]=[];
 const jwts:string[]=[];
 let comments=0;
 const answer=(status:number,json:unknown)=>({status,json:async()=>json});
 const github:GithubFetch=async(url,init)=>{
  assert.equal(init.redirect,'manual');
  const u=new URL(url),auth=init.headers.authorization.replace(/^Bearer /,''),body=init.body?JSON.parse(init.body):undefined;
  assert.equal(u.origin,'https://api.github.com');
  requests.push({method:init.method,path:u.pathname,auth,...body?{body}:{}});
  if(u.pathname==='/app/installations/4242/access_tokens'&&init.method==='POST'){
   jwts.push(auth);
   const [head,claims,signature]=auth.split('.');
   const signed=crypto.verify('sha256',Buffer.from(head+'.'+claims),publicKey,Buffer.from(signature,'base64url'));
   const value=JSON.parse(Buffer.from(claims,'base64url').toString());
   assert.deepEqual(JSON.parse(Buffer.from(head,'base64url').toString()),{alg:'RS256',typ:'JWT'});
   if(!signed)return answer(401,{message:'A JSON web token could not be decoded'});
   assert.equal(value.iss,'1001');assert.equal(value.exp-value.iat,600);assert.ok(value.iat<=clock/1000);
   return answer(201,{token:INSTALLATION_TOKEN,expires_at:new Date(clock+3600_000).toISOString()});
  }
  if(u.pathname.startsWith('/app/'))return answer(404,{message:'Not Found'});
  assert.equal(auth,INSTALLATION_TOKEN,'everything else is asked as the App\'s installation');
  const issue=/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)(\/.*)?$/.exec(u.pathname),repo=/^\/repos\/([^/]+)\/([^/]+)(\/issues)?$/.exec(u.pathname);
  if(issue){
   const key=`${issue[1]}/${issue[2]}#${issue[3]}`,found=issues.get(key);
   if(!found)return answer(404,{message:'Not Found'});
   if(!issue[4]&&init.method==='GET')return answer(200,found);
   if(!issue[4]&&init.method==='PATCH'){Object.assign(found,{state:body.state,updated_at:'2026-10-15T13:00:00Z'});return answer(200,found);}
   if(issue[4]==='/comments'&&init.method==='POST'){comments+=1;found.updated_at='2026-10-15T13:00:00Z';return answer(201,{html_url:`${found.html_url}#issuecomment-${900+comments}`});}
   if(issue[4]==='/labels'&&init.method==='POST')return answer(200,body.labels.map((name:string)=>({name})));
   if(issue[4]?.startsWith('/labels/')&&init.method==='DELETE')return answer(issue[4]==='/labels/wontfix'?404:200,[]);
  }
  if(repo){
   const found=repos.get(`${repo[1]}/${repo[2]}`);
   if(!found)return answer(404,{message:'Not Found'});
   if(!repo[3]&&init.method==='GET')return answer(200,found);
   if(repo[3]&&init.method==='POST')return answer(201,{number:99,html_url:'https://github.com/example/app/issues/99'});
  }
  return answer(500,{message:'unexpected'});
 };
 let changes=0;
 const drafts=createGithubDrafts({ledger:()=>ledger,vault,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{changes+=1;},fetch:github,now,clock:()=>clock});
 const asks=createAgentAsks({ledger:()=>ledger,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{},drafts:()=>drafts,now});
 const standing=await openStandingWorldTools({access,drafts:(agentId,args)=>drafts.call(agentId,args),asks:(agentId,args)=>asks.call(agentId,args),channel:async()=>({error:'not here'})});
 const said:string[]=[];
 const keep=<T>(value:T):T=>{said.push(JSON.stringify(value));return value;};
 const refused=async(run:()=>Promise<unknown>|unknown)=>{try{await run();}catch(error){return keep((error as Error).message);}assert.fail('expected a refusal');};
 try{
  const agent=(id:string,name:string)=>{
   const home=path.join(dir,id);fs.mkdirSync(home);
   const {url,token}=JSON.parse(fs.readFileSync(standing.server(home,{id,name,harness:id,kind:'local'}).env.WORLDLET_MCP_ENDPOINT_FILE,'utf8'));
   return async(action:string,args:object={})=>{
    const [target,verb]=action.includes('/')?action.split('/'):['github-drafts',action];
    const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token},body:JSON.stringify({method:'call',name:'call_world_tool',arguments:{target,action:verb,arguments:JSON.stringify(args)}})});
    if(response.status!==200)return {status:response.status};
    return keep(JSON.parse((await response.json()).text));
   };
  };
  const codex=agent('codex','Codex'),claude=agent('claude-code','Claude Code');
  const comment={write:'issue.comment',target:'example/app#12',body:'Fixed on main in **#20**.\nPlease retry.'};

  // No Grant by default, and none from the default Grants: refused, nothing read on GitHub, nothing stored.
  assert.equal((await codex('create',comment)).error,STANDING_OUTSIDE_TURN);
  assert.equal((await codex('read')).error,STANDING_OUTSIDE_TURN);
  assert.deepEqual([requests.length,ledger.githubDrafts().length],[0,0]);
  assert.ok(access.grantGithubDrafts('codex'));
  // Granted, but no GitHub App yet: it says so, and nothing is stored.
  assert.equal((await codex('create',comment)).error,GITHUB_DRAFT_MESSAGES.noApp);

  // Connecting the App: checked with GitHub (a JWT signed with its key, exchanged for an installation token) before
  // it is kept; a key GitHub refuses or a malformed one keeps nothing and repeats nothing.
  assert.deepEqual(drafts.app.status(),{connected:false});
  assert.equal(await refused(()=>drafts.app.connect({appId:'1001',installationId:'4242',privateKey:'not a key'})),GITHUB_DRAFT_REASONS.app);
  assert.equal(await refused(()=>drafts.app.connect({appId:'1001',installationId:'4242',privateKey:otherPem})),GITHUB_DRAFT_MESSAGES.keyRefused);
  assert.equal(await refused(()=>drafts.app.connect({appId:'1001',installationId:'7',privateKey:pem})),GITHUB_DRAFT_MESSAGES.noInstallation);
  assert.equal(vault.get(GITHUB_APP_VAULT_KEY),null);
  assert.deepEqual(keep(await drafts.app.connect({appId:'1001',installationId:'4242',privateKey:pem})),{ok:true,connected:true});
  assert.deepEqual(JSON.parse(vault.get(GITHUB_APP_VAULT_KEY)!),{appId:'1001',installationId:'4242',privateKey:pem.trim()},'kept only in the vault');
  assert.deepEqual(keep(drafts.app.status()),{connected:true});

  // Drafting: the target is read once as the App and kept with the draft; an agentId the model sends is dropped.
  const first=await codex('create',{...comment,agentId:'claude-code'});
  assert.equal(first.ok,true);
  assert.deepEqual([first.draft.agentId,first.draft.status,first.draft.repo,first.draft.number,first.draft.body],['codex','pending','example/app',12,comment.body]);
  assert.deepEqual(first.draft.target,{kind:'issue',state:'open',updatedAt:'2026-10-15T10:00:00Z',title:'Build fails on Windows',url:'https://github.com/example/app/issues/12'});
  const item=ledger.value('items',githubDraftItemId(first.draft.id))!;
  assert.deepEqual([item.provider,item.kind,item.status,item.agentId,item.agentName,item.title,item.githubDraftRepo,item.githubDraftText,item.githubDraftUrl],
   ['agents','task','open','codex','Codex','Comment on example/app#12','example/app',comment.body,'https://github.com/example/app/issues/12']);
  assert.deepEqual(requests.filter(r=>r.method!=='GET'&&!r.path.startsWith('/app/')),[],'drafting writes nothing');
  // What does not fit is refused before anything is stored: closing a pull request or a closed Issue, a token in the text,
  // a target that is not there.
  assert.equal((await codex('create',{write:'issue.close',target:'example/app#13'})).error,GITHUB_DRAFT_REASONS.pull);
  assert.equal((await codex('create',{write:'issue.close',target:'example/app#14'})).error,GITHUB_DRAFT_REASONS.alreadyClosed);
  assert.equal((await codex('create',{write:'issue.comment',target:'example/app#12',body:'token ghp_'+'a'.repeat(36)})).error,GITHUB_DRAFT_REASONS.secret);
  assert.equal((await codex('create',{write:'issue.comment',target:'example/app#404',body:'Hi'})).error,GITHUB_DRAFT_MESSAGES.notFound);
  assert.equal((await codex('create',{write:'issue.comment',target:'example/app',body:'Hi'})).error,GITHUB_DRAFT_REASONS.target);
  assert.equal(ledger.githubDrafts().length,1);

  // Another Agent reads none of Codex's drafts, and without its own Grant drafts nothing.
  assert.equal((await claude('read')).error,STANDING_OUTSIDE_TURN);
  assert.ok(access.grantGithubDrafts('claude-code'));
  assert.deepEqual((await claude('read')).drafts,[]);

  // Stale: the Issue changed on GitHub after the draft. Approve reads it again and refuses; nothing is written.
  issues.get('example/app#12').updated_at='2026-10-15T11:00:00Z';
  const writes=()=>requests.filter(r=>r.method!=='GET'&&!r.path.startsWith('/app/')).length;
  assert.deepEqual(keep(await drafts.approve(first.draft.id)),{ok:true,status:'stale',reason:GITHUB_DRAFT_STALE.updated});
  assert.equal(writes(),0);
  assert.equal(ledger.value('items',githubDraftItemId(first.draft.id))!.status,'dismissed');
  assert.equal(await refused(()=>drafts.approve(first.draft.id)),GITHUB_DRAFT_REASONS.settled,'a settled draft is never approved again');
  // Its state changed: refused with both states named.
  const second=await codex('create',comment);
  issues.get('example/app#12').state='closed';
  assert.deepEqual((await drafts.approve(second.draft.id)).reason,GITHUB_DRAFT_STALE.state('open','closed'));
  issues.get('example/app#12').state='open';issues.get('example/app#12').updated_at='2026-10-15T11:00:00Z';
  // It was deleted: refused.
  issues.set('example/app#15',{number:15,title:'Flaky test',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/issues/15'});
  const gone=await codex('create',{write:'labels.add',target:'example/app#15',labels:['flaky']});
  issues.delete('example/app#15');
  assert.deepEqual((await drafts.approve(gone.draft.id)).reason,GITHUB_DRAFT_STALE.gone);
  assert.equal(writes(),0);

  // Fresh: written once as the App, the result's link kept; a second Approve is refused and writes nothing.
  const third=await codex('create',comment);
  clock+=60_000;
  assert.deepEqual(keep(await drafts.approve(third.draft.id)),{ok:true,status:'written',url:'https://github.com/example/app/issues/12#issuecomment-901'});
  assert.equal(writes(),1);assert.equal(comments,1);
  assert.deepEqual(requests.find(r=>r.path.endsWith('/comments'))!.body,{body:comment.body},'exactly the drafted text');
  assert.equal(await refused(()=>drafts.approve(third.draft.id)),GITHUB_DRAFT_REASONS.settled);
  assert.equal(writes(),1);
  const read=await codex('read',{ids:[third.draft.id]});
  assert.deepEqual([read.drafts[0].status,read.drafts[0].resultUrl,read.untrustedContent],['written','https://github.com/example/app/issues/12#issuecomment-901',true]);
  assert.equal(ledger.value('items',githubDraftItemId(third.draft.id))!.status,'done');
  // The installation token is reused until it nears expiry.
  assert.equal(jwts.length,2,'one refused key and one connect: the installation token from connecting is reused');

  // Each other write: a new Issue, labels added and removed, close and reopen.
  const created=await codex('create',{write:'issue.create',target:'example/app',title:'Crash on start',body:'Steps: open the app.',labels:['bug']});
  assert.equal(created.draft.target.kind,'repository');
  repos.get('example/app').updated_at='2026-10-15T12:30:00Z';
  clock+=2*3600_000;
  assert.deepEqual((await drafts.approve(created.draft.id)),{ok:true,status:'written',url:'https://github.com/example/app/issues/99'},'a repository\'s updatedAt is not compared');
  assert.equal(jwts.length,3,'an expired installation token is exchanged again');
  assert.deepEqual(requests.at(-1)!.body,{title:'Crash on start',body:'Steps: open the app.',labels:['bug']});
  issues.set('example/app#16',{number:16,title:'Docs typo',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/issues/16'});
  const label=await codex('create',{write:'labels.remove',target:'example/app#16',labels:['triage','wontfix']});
  assert.equal((await drafts.approve(label.draft.id)).status,'written','a label that is already gone counts as removed');
  assert.deepEqual(requests.slice(-2).map(r=>[r.method,r.path]),[['DELETE','/repos/example/app/issues/16/labels/triage'],['DELETE','/repos/example/app/issues/16/labels/wontfix']]);
  const close=await codex('create',{write:'issue.close',target:'example/app#16'});
  assert.equal((await drafts.approve(close.draft.id)).status,'written');
  assert.deepEqual(requests.at(-1),{method:'PATCH',path:'/repos/example/app/issues/16',auth:INSTALLATION_TOKEN,body:{state:'closed',state_reason:'completed'}});
  repos.get('example/app').archived=true;
  assert.equal((await codex('create',{write:'issue.create',target:'example/app',title:'More'})).error,GITHUB_DRAFT_REASONS.archived);
  repos.get('example/app').archived=false;

  // Dismiss writes nothing; Done or Dismiss through the item's ordinary status (a phone) dismisses too, never writes.
  const before=writes();
  const dismissed=await codex('create',comment);
  assert.deepEqual(keep(drafts.dismiss(dismissed.draft.id)),{ok:true,status:'dismissed'});
  const phone=await codex('create',comment);
  ledger.update(githubDraftItemId(phone.draft.id),'done');
  assert.equal((await codex('read',{ids:[phone.draft.id]})).drafts[0].status,'dismissed');
  assert.equal(writes(),before);

  // GitHub refuses a write: failed, with GitHub's words, never retried.
  const refusedDraft=await codex('create',{write:'labels.add',target:'example/app#12',labels:['p1']});
  const plain=github;
  const failing:GithubFetch=async(url,init)=>init.method==='POST'&&url.endsWith('/labels')?answer(403,{message:'Resource not accessible by integration'}):plain(url,init);
  const failingDrafts=createGithubDrafts({ledger:()=>ledger,vault,name:()=>'Codex',changed:()=>{},fetch:failing,now,clock:()=>clock});
  assert.deepEqual(keep(await failingDrafts.approve(refusedDraft.draft.id)),{ok:true,status:'failed',reason:'GitHub refused the write (403: Resource not accessible by integration).'});

  // Audit: each Approve and Dismiss is one entry for the drafting Agent.
  const audit=ledger.agentAudit('codex',500).filter(e=>e.target==='github-drafts'&&['approve','dismiss','grant'].includes(e.action)).map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(audit,[['grant','allowed'],['approve','denied'],['approve','denied'],['approve','denied'],['approve','allowed'],['approve','allowed'],['approve','allowed'],['approve','allowed'],['dismiss','allowed'],['dismiss','allowed'],['approve','denied']]);
  assert.ok(changes>0);

  // An ask that carries drafts (b5): it offers Approve; only the Agent's own pending drafts; Approve sent as a plain
  // answer (what a page on another device may send) is refused; approveDrafts runs each as on its own card, a changed
  // target refused; any other answer leaves them unrun; the Agent reads what became of them through asks/read.
  assert.ok(access.grantAsks('codex','ask')&&access.grantAsks('claude-code','ask'));
  issues.set('example/app#17',{number:17,title:'Release notes',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/issues/17'});
  const fresh=await codex('create',{write:'issue.comment',target:'example/app#17',body:'Release notes are ready.'});
  const changing=await codex('create',{write:'labels.add',target:'example/app#12',labels:['released']});
  assert.equal((await codex('asks/post',{title:'Ship these?',draftIds:[fresh.draft.id,third.draft.id]})).error,ASK_REASONS.drafts,'a written draft cannot be carried');
  assert.equal((await claude('asks/post',{title:'Ship these?',draftIds:[fresh.draft.id]})).error,ASK_REASONS.drafts,'nor another Agent\'s');
  assert.equal((await codex('asks/post',{title:'Ship these?',choices:['Yes','No'],draftIds:[fresh.draft.id]})).error,ASK_REASONS.approve);
  const carrying=await codex('asks/post',{title:'Ship these?',draftIds:[fresh.draft.id,changing.draft.id]});
  assert.deepEqual([carrying.ask.choices,carrying.ask.draftIds],[['Approve','Not now'],[fresh.draft.id,changing.draft.id]]);
  assert.deepEqual(ledger.value('items',askItemId(carrying.ask.id))!.askDraftIds,[fresh.draft.id,changing.draft.id]);
  const declined=await codex('asks/post',{title:'Also this?',draftIds:[changing.draft.id]});
  const writesBefore=writes();
  assert.equal(await refused(()=>asks.answer({operation:'answer',id:carrying.ask.id,outcome:'answered',choice:'Approve'})),ASK_REASONS.local);
  assert.equal(roomDenied({action:'agentAsk',operation:'approveDrafts'})!=='',true,'a page on another device cannot approve drafts');
  assert.equal(roomDenied({action:'agentAsk',operation:'answer'}),'','it still answers asks');
  assert.equal(writes(),writesBefore);
  // Any other answer: the drafts stay unrun.
  assert.deepEqual(await asks.answer({operation:'answer',id:declined.ask.id,outcome:'answered',choice:'Not now'}),{ok:true,status:'answered'});
  assert.equal(writes(),writesBefore);
  assert.deepEqual((await codex('asks/read',{ids:[declined.ask.id]})).asks[0].drafts,[{id:changing.draft.id,status:'pending'}]);
  // Approve: one written, one whose target changed refused; the ask answered; the Agent reads both results.
  issues.get('example/app#12').updated_at='2026-10-15T14:00:00Z';
  const approved=await asks.answer({operation:'approveDrafts',id:carrying.ask.id,outcome:'answered',choice:'Approve'});
  assert.deepEqual(approved,{ok:true,status:'answered',drafts:[{id:fresh.draft.id,status:'written',resultUrl:'https://github.com/example/app/issues/17#issuecomment-902'},{id:changing.draft.id,status:'stale',reason:GITHUB_DRAFT_STALE.updated}]});
  assert.equal(writes(),writesBefore+1);
  const told=(await codex('asks/read',{ids:[carrying.ask.id]})).asks[0];
  assert.deepEqual([told.status,told.answer.choice,told.drafts],['answered','Approve',approved.drafts]);
  assert.equal((await claude('asks/read')).asks.length,0,'another Agent sees none of it');
  assert.equal(await refused(()=>asks.answer({operation:'approveDrafts',id:carrying.ask.id,outcome:'answered',choice:'Approve'})),ASK_REASONS.settled,'an ask is approved once');
  assert.equal(writes(),writesBefore+1);
  // GitHub not answering leaves the ask open, so Approve can be chosen again.
  const later=await codex('create',{write:'issue.comment',target:'example/app#17',body:'One more thing.'});
  const waiting=await codex('asks/post',{title:'And this?',draftIds:[later.draft.id]});
  const down=createGithubDrafts({ledger:()=>ledger,vault,name:()=>'Codex',changed:()=>{},fetch:async()=>{throw new Error('offline');},now,clock:()=>clock});
  const offline=createAgentAsks({ledger:()=>ledger,name:()=>'Codex',changed:()=>{},drafts:()=>down,now});
  assert.equal(await refused(()=>offline.answer({operation:'approveDrafts',id:waiting.ask.id,outcome:'answered',choice:'Approve'})),GITHUB_DRAFT_MESSAGES.unreachable);
  assert.deepEqual([(await codex('asks/read',{ids:[waiting.ask.id]})).asks[0].status,(await codex('read',{ids:[later.draft.id]})).drafts[0].status],['open','pending']);

  // Disconnecting forgets the App; drafting then says so again.
  drafts.app.disconnect();
  assert.equal(vault.get(GITHUB_APP_VAULT_KEY),null);
  assert.equal((await codex('create',comment)).error,GITHUB_DRAFT_MESSAGES.noApp);

  // The key never leaves the vault: not in an answer, item, stored row, audit entry or log line, and neither are the
  // App's signed tokens or the installation token.
  const stored=JSON.stringify([ledger.githubDrafts(),ledger.agentAudit('codex',500),ledger.agentAudit('claude-code',500),ledger.records('items'),ledger.history({limit:1000})]);
  const body=pem.split('\n').slice(1,-2).join('');
  for(const text of [...said,stored,...logged])for(const secret of [pem.trim(),body.slice(0,64),body.slice(-64),INSTALLATION_TOKEN,...jwts]){
   assert.ok(!text.includes(secret),'a credential leaked');
  }
  assert.deepEqual(logged.filter(line=>!line.includes('ExperimentalWarning')),[],'nothing is logged');
 }finally{standing.close();ledger.close();Object.assign(console,original);}
});
console.log('PASS GitHub drafts on the host: own Grant only, drafted against the target as read, Approve re-reads and refuses a changed, closed or deleted target, writes once as the GitHub App and keeps the link, Dismiss and a phone settle write nothing, every Approve and Dismiss audited, an ask carrying drafts runs them only on this computer’s Approve and the Agent reads the results, and the App key and tokens appear nowhere');
