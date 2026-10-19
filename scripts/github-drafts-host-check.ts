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
import {ASK_REASONS,askItemId} from '../agent/agents/asks.ts';
import {roomDenied} from '../contracts/web-world.ts';
import {STANDING_OUTSIDE_TURN} from '../agent/agents/grants.ts';
import {GITHUB_DRAFT_REASONS,GITHUB_DRAFT_STALE,GITHUB_WRITE_REASONS,GITHUB_WRITE_STALE,githubDraftCreatedUrl,githubDraftItemId,githubDraftSignature} from '../agent/agents/github-drafts.ts';
import {GITHUB_APP} from '../context/sources/index.ts';

// GitHub drafts on the host (agent/agents/GRANTS.md#github-drafts), the same modules the Electron and Node hosts run,
// against a stubbed GitHub: an Agent drafts only under its own "Can draft GitHub changes" Grant; the draft keeps the
// target as read; Approve reads it again and refuses when its state or updatedAt changed or it is gone, and otherwise
// writes once as the GitHub App (a JWT it signs, exchanged for an installation token) and keeps the result's link;
// Dismiss writes nothing; everything is audited. The App's private key, its signed token and the installation token
// appear in no answer, item, audit entry, stored row or log line. Through the person's GitHub sign-in (no own App),
// approved drafts are written as the person with the sign-in's user token, renewed once when GitHub refuses it, each new
// Issue or comment ending with "Drafted by <Agent> in Worldlet", and standing writes are refused. A label transition (`labels.set`) is drafted and
// approved against the labels the Agent read. Standing GitHub writes (agent/agents/GRANTS.md#standing-github-writes) run
// at once, without a card, only within the reach of the Agent's own Grant for that repository, each read again and
// refused when not as the Agent read it, each audited.
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
 // The GitHub sign-in's user tokens (McpAccounts.bearer): the next one each time it is renewed.
 const USER_TOKENS=['ghu_'+'U1xture'.repeat(6),'ghu_'+'U2xture'.repeat(6)];
 let signedIn=false,userToken=0,renewed=0,refuseUser=false;
 // Stubbed GitHub: an Issue, a pull request and a repository, each with its state and updated_at; every request kept.
 const issues=new Map<string,any>([
  ['example/app#12',{number:12,title:'Build fails on Windows',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/issues/12'}],
  ['example/app#13',{number:13,title:'Add dark mode',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/pull/13',pull_request:{url:'x'}}],
  ['example/app#14',{number:14,title:'Old crash',state:'closed',updated_at:'2026-10-14T10:00:00Z',html_url:'https://github.com/example/app/issues/14'}],
 ]);
 const repos=new Map<string,any>([['example/app',{full_name:'example/app',archived:false,updated_at:'2026-10-15T09:00:00Z',html_url:'https://github.com/example/app'}]]);
 const requests:{method:string;path:string;auth:string;body?:any}[]=[];
 const jwts:string[]=[];
 let comments=0,edits=0;
 const touch=(found:any)=>{edits+=1;found.updated_at=new Date(Date.parse('2026-10-15T15:00:00Z')+edits*1000).toISOString().replace('.000','');};
 // Issues the App made, as GitHub lists them back.
 const madeIssues:any[]=[];
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
  assert.equal(auth,signedIn&&!secrets.has(GITHUB_APP_VAULT_KEY)?USER_TOKENS[userToken]:INSTALLATION_TOKEN,'everything else is asked as the App\'s installation, or as the person through the sign-in');
  if(auth.startsWith('ghu_')&&refuseUser){refuseUser=false;return answer(401,{message:'Bad credentials'});}
  const issue=/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)(\/.*)?$/.exec(u.pathname),repo=/^\/repos\/([^/]+)\/([^/]+)(\/issues)?$/.exec(u.pathname);
  if(issue){
   const key=`${issue[1]}/${issue[2]}#${issue[3]}`,found=issues.get(key);
   if(!found)return answer(404,{message:'Not Found'});
   if(!issue[4]&&init.method==='GET')return answer(200,found);
   if(!issue[4]&&init.method==='PATCH'){Object.assign(found,{state:body.state,updated_at:'2026-10-15T13:00:00Z'});return answer(200,found);}
   if(issue[4]==='/comments'&&init.method==='POST'){comments+=1;found.updated_at='2026-10-15T13:00:00Z';return answer(201,{html_url:`${found.html_url}#issuecomment-${900+comments}`});}
   // An Issue that lists its labels keeps them: added and removed as GitHub would, each change moving updated_at.
   if(issue[4]==='/labels'&&init.method==='POST'&&found.labels){
    for(const name of body.labels)if(!found.labels.some((l:any)=>l.name.toLowerCase()===name.toLowerCase()))found.labels.push({name});
    touch(found);return answer(200,found.labels);
   }
   if(issue[4]?.startsWith('/labels/')&&init.method==='DELETE'&&found.labels){
    const name=decodeURIComponent(issue[4].slice('/labels/'.length)),at=found.labels.findIndex((l:any)=>l.name===name);
    if(at<0)return answer(404,{message:'Label does not exist'});
    found.labels.splice(at,1);touch(found);return answer(200,found.labels);
   }
   if(issue[4]==='/labels'&&init.method==='POST')return answer(200,body.labels.map((name:string)=>({name})));
   if(issue[4]?.startsWith('/labels/')&&init.method==='DELETE')return issue[4]==='/labels/locked'?answer(403,{message:'Must have admin rights'}):answer(issue[4]==='/labels/wontfix'?404:200,[]);
  }
  if(repo){
   const found=repos.get(`${repo[1]}/${repo[2]}`);
   if(!found)return answer(404,{message:'Not Found'});
   if(!repo[3]&&init.method==='GET')return answer(200,found);
   if(repo[3]&&init.method==='POST'){
    const number=99+madeIssues.length,made={number,title:body.title,body:body.body,created_at:now(),html_url:`https://github.com/example/app/issues/${number}`,
     ...auth.startsWith('ghu_')?{user:{login:'alex',type:'User'},performed_via_github_app:{id:777,slug:GITHUB_APP.slug,client_id:GITHUB_APP.clientId}}:{user:{login:'worldlet-test[bot]',type:'Bot'},performed_via_github_app:{id:1001}}};
    madeIssues.push(made);return answer(201,made);
   }
   if(repo[3]&&init.method==='GET'){assert.equal(u.searchParams.get('state'),'all');return answer(200,[...madeIssues].reverse());}
  }
  return answer(500,{message:'unexpected'});
 };
 let changes=0;
 const drafts=createGithubDrafts({ledger:()=>ledger,vault,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{changes+=1;},fetch:github,now,clock:()=>clock,
  signedIn:()=>signedIn,userToken:async force=>{if(!signedIn)return null;if(force){renewed+=1;userToken=Math.min(userToken+1,USER_TOKENS.length-1);}return USER_TOKENS[userToken];}});
 const asks=createAgentAsks({ledger:()=>ledger,name:agentId=>access.identity(agentId)?.name??agentId,changed:()=>{},drafts:()=>drafts,now});
 const standing=await openStandingWorldTools({access,drafts:(agentId,args)=>drafts.call(agentId,args),writes:(agentId,args,grants)=>drafts.run(agentId,args,grants),asks:(agentId,args)=>asks.call(agentId,args),channel:async()=>({error:'not here'})});
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
  assert.deepEqual(requests.find(r=>r.path.endsWith('/comments'))!.body,{body:comment.body+'\n\n_Drafted by Codex in Worldlet_'},'exactly the drafted text, with the line naming the Agent');
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
  assert.deepEqual(requests.at(-1)!.body,{title:'Crash on start',body:'Steps: open the app.\n\n_Drafted by Codex in Worldlet_',labels:['bug']});
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

  // Removing some labels but not others: written, saying which were removed and which GitHub refused; none removed is
  // failed. Each label is asked once.
  const partial=await codex('create',{write:'labels.remove',target:'example/app#16',labels:['triage','locked']});
  assert.deepEqual(keep(await drafts.approve(partial.draft.id)),{ok:true,status:'written',url:'https://github.com/example/app/issues/16',
   reason:'Removed triage. GitHub refused removing locked (403: Must have admin rights), so it is still there.'});
  assert.equal((await codex('read',{ids:[partial.draft.id]})).drafts[0].reason,'Removed triage. GitHub refused removing locked (403: Must have admin rights), so it is still there.');
  const none=await codex('create',{write:'labels.remove',target:'example/app#16',labels:['locked']});
  assert.deepEqual(await drafts.approve(none.draft.id),{ok:true,status:'failed',reason:'GitHub refused the write (403: Must have admin rights).'});

  // A new Issue is recorded as begun before it is posted. Worldlet stopping after GitHub made it (its result never
  // saved): Approve again finds the Issue the App made and keeps its link, and posts nothing.
  const posts=()=>requests.filter(r=>r.method==='POST'&&/\/issues$/.test(r.path)).length;
  const crashing:any={githubDrafts:()=>ledger.githubDrafts(),value:(bucket:string,id:string)=>ledger.value(bucket,id),recordAgentAudit:(entry:any,n:number)=>ledger.recordAgentAudit(entry,n),
   saveGithubDraft:(draft:any,item:any,origin:'user'|'agent')=>{if(draft.status!=='pending')throw new Error('Worldlet quit');ledger.saveGithubDraft(draft,item,origin);}};
  const quitting=(fetch:GithubFetch)=>createGithubDrafts({ledger:()=>crashing,vault,name:()=>'Codex',changed:()=>{},fetch,now,clock:()=>clock});
  const made=await codex('create',{write:'issue.create',target:'example/app',title:'Settings reset on update'});
  const postsBefore=posts();
  assert.equal(await refused(()=>quitting(github).approve(made.draft.id)),'Worldlet quit');
  const begun=(await codex('read',{ids:[made.draft.id]})).drafts[0];
  assert.deepEqual([begun.status,typeof begun.writeStartedAt,posts()],['pending','string',postsBefore+1]);
  clock+=60_000;
  assert.deepEqual(keep(await drafts.approve(made.draft.id)),{ok:true,status:'written',url:madeIssues.at(-1).html_url});
  assert.equal(posts(),postsBefore+1,'never posted twice');
  // Stopped before GitHub made it: no such Issue from the App, so unknown (check GitHub), and still not posted again.
  const unmade=await codex('create',{write:'issue.create',target:'example/app',title:'Sync stalls'});
  const busy:GithubFetch=async(url,init)=>init.method==='POST'&&url.endsWith('/issues')?answer(502,{message:'Server Error'}):github(url,init);
  assert.equal(await refused(()=>quitting(busy).approve(unmade.draft.id)),'Worldlet quit');
  assert.deepEqual(keep(await drafts.approve(unmade.draft.id)),{ok:true,status:'unknown',reason:GITHUB_DRAFT_MESSAGES.notFoundAfterStart});
  assert.equal(ledger.value('items',githubDraftItemId(unmade.draft.id))!.githubDraftStatus,'unknown');
  // GitHub not answering the post: the draft stays begun, and Dismiss then says it is unknown, never "nothing written".
  const silent=await codex('create',{write:'issue.create',target:'example/app',title:'Export is empty'});
  const lost:GithubFetch=async(url,init)=>{if(init.method==='POST'&&url.endsWith('/issues'))throw new Error('socket hang up');return github(url,init);};
  assert.equal(await refused(()=>createGithubDrafts({ledger:()=>ledger,vault,name:()=>'Codex',changed:()=>{},fetch:lost,now,clock:()=>clock}).approve(silent.draft.id)),GITHUB_DRAFT_MESSAGES.createLost);
  assert.equal((await codex('read',{ids:[silent.draft.id]})).drafts[0].status,'pending');
  assert.deepEqual(drafts.dismiss(silent.draft.id),{ok:true,status:'unknown',reason:GITHUB_DRAFT_REASONS.unknown});
  assert.equal(posts(),postsBefore+1);

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

  // A label transition (labels.set) as a draft: refused at once when the labels under its prefix are not the ones the
  // Agent read; otherwise it adds and removes only what differs, other labels untouched.
  issues.set('example/app#20',{number:20,title:'Index the archive',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/issues/20',labels:[{name:'bug'},{name:'state:queued'}]});
  const transition={write:'labels.set',target:'example/app#20',prefix:'state:',expected:['state:queued'],set:['state:running']};
  assert.equal((await codex('create',{...transition,expected:['state:done']})).error,GITHUB_DRAFT_STALE.labels('state:',['state:queued']));
  assert.equal((await codex('create',{...transition,set:['bug']})).error,GITHUB_DRAFT_REASONS.prefix);
  const moved=await codex('create',transition);
  assert.deepEqual([moved.draft.labels,moved.draft.labelPrefix,moved.draft.expectedLabels,moved.draft.target.labels],[['state:running'],'state:',['state:queued'],['bug','state:queued']]);
  const movedItem=ledger.value('items',githubDraftItemId(moved.draft.id))!;
  assert.deepEqual([movedItem.title,movedItem.githubDraftText],['Change labels on example/app#20','Add: state:running\nRemove: state:queued\nOnly if its labels under “state:” are exactly: state:queued']);
  const beforeMove=requests.length;
  assert.deepEqual(keep(await drafts.approve(moved.draft.id)),{ok:true,status:'written',url:'https://github.com/example/app/issues/20'});
  assert.deepEqual(requests.slice(beforeMove).filter(r=>r.method!=='GET').map(r=>[r.method,r.path,r.body]),
   [['POST','/repos/example/app/issues/20/labels',{labels:['state:running']}],['DELETE','/repos/example/app/issues/20/labels/state%3Aqueued',undefined]],'added, then removed: nothing else');
  assert.deepEqual(issues.get('example/app#20').labels.map((l:any)=>l.name),['bug','state:running']);
  // Approve finds other labels under the prefix now: stale, nothing written.
  const again=await codex('create',{...transition,expected:['state:running'],set:['state:done']});
  issues.get('example/app#20').labels.push({name:'state:blocked'});
  assert.deepEqual(await drafts.approve(again.draft.id),{ok:true,status:'stale',reason:GITHUB_DRAFT_STALE.labels('state:',['state:running','state:blocked'])});
  issues.get('example/app#20').labels.pop();

  // Standing GitHub writes: none by default, nor from Can draft GitHub changes; nothing is read or written for them.
  const write=(who:typeof codex,args:object)=>who('github-writes/run',args);
  const comment20={write:'issue.comment',target:'example/app#20',body:'Started on this.'};
  const step={write:'labels.set',target:'example/app#20',prefix:'state:',expected:['state:running'],set:['state:review']};
  const quiet=requests.length;
  assert.equal((await write(codex,comment20)).error,STANDING_OUTSIDE_TURN);
  assert.equal(requests.length,quiet,'nothing asked of GitHub');
  // The person allows it for one repository: a comment and state: labels. Another Agent still may not.
  assert.equal(access.grantGithubWrites('codex','example/app','close',''),false,'only Core\'s choices');
  assert.equal(access.grantGithubWrites('codex','example/app','labels',''),false,'labels need a prefix');
  assert.ok(access.grantGithubWrites('codex','example/app','comment-labels','state:'));
  assert.equal((await write(claude,comment20)).error,STANDING_OUTSIDE_TURN);
  // Within its reach: written at once as the App, the result's link returned.
  const commented=await write(codex,{...comment20,expectedState:'open'});
  assert.deepEqual([commented.ok,commented.status,commented.untrustedContent],[true,'written',true]);
  assert.match(commented.url,/^https:\/\/github\.com\/example\/app\/issues\/20#issuecomment-\d+$/);
  assert.deepEqual(requests.at(-1),{method:'POST',path:'/repos/example/app/issues/20/comments',auth:INSTALLATION_TOKEN,body:{body:'Started on this.\n\n_Drafted by Codex in Worldlet_'}});
  const stepped=await write(codex,step);
  assert.deepEqual([stepped.status,stepped.url],['written','https://github.com/example/app/issues/20']);
  assert.deepEqual(issues.get('example/app#20').labels.map((l:any)=>l.name),['bug','state:review']);
  // Not as the Agent read it: stale, the answer says what it is now, nothing written.
  const writesNow=writes();
  const stale=await write(codex,step);
  assert.deepEqual([stale.status,stale.error,stale.current.labels,stale.current.state],['stale',GITHUB_DRAFT_STALE.labels('state:',['state:review']),['bug','state:review'],'open']);
  assert.equal((await write(codex,{...comment20,expectedState:'closed'})).error,GITHUB_WRITE_STALE.state('closed','open'));
  assert.equal((await write(codex,{...comment20,expectedUpdatedAt:'2026-10-15T10:00:00Z'})).error,GITHUB_WRITE_STALE.updated);
  assert.equal((await write(codex,{...comment20,target:'example/app#404'})).error,GITHUB_DRAFT_STALE.gone);
  assert.equal(writes(),writesNow);
  // Outside its reach, or not a standing write: refused before GitHub is asked anything.
  const asked=requests.length;
  repos.set('example/other',{full_name:'example/other',archived:false,updated_at:'2026-10-15T09:00:00Z',html_url:'https://github.com/example/other'});
  assert.equal((await write(codex,{...comment20,target:'example/other#20'})).error,GITHUB_WRITE_REASONS.notGranted,'another repository');
  assert.equal((await write(codex,{...step,prefix:'stage:',expected:['stage:a'],set:['stage:b']})).error,GITHUB_WRITE_REASONS.notGranted,'another prefix');
  assert.equal((await write(codex,{...step,prefix:undefined,expected:['bug','state:review'],set:['bug']})).error,GITHUB_WRITE_REASONS.notGranted,'every label, not only state:');
  assert.equal((await write(codex,{write:'issue.close',target:'example/app#20'})).error,GITHUB_WRITE_REASONS.write);
  assert.equal((await write(codex,{write:'issue.create',target:'example/app',title:'New'})).error,GITHUB_WRITE_REASONS.write);
  assert.equal((await write(codex,{...comment20,body:'token ghp_'+'b'.repeat(36)})).error,GITHUB_DRAFT_REASONS.secret);
  assert.equal((await write(codex,{...comment20,body:'bell \u0007'})).error,GITHUB_DRAFT_REASONS.control);
  assert.equal(requests.length,asked,'nothing asked of GitHub');
  // Two writes to one Issue never overlap: the second waits for the Agent to read it again.
  const both=await Promise.all([drafts.run('codex',{operation:'run',...comment20},access.grants('codex')),drafts.run('codex',{operation:'run',...comment20},access.grants('codex'))]);
  assert.deepEqual(both.map(r=>r.status??r.error),['written',GITHUB_WRITE_REASONS.busy]);
  // Choosing again for the repository replaces its Grant; Remove takes it back, and the next call is refused.
  assert.ok(access.grantGithubWrites('codex','example/app','comment',''));
  assert.equal(access.grants('codex').filter(g=>g.github&&!g.revokedAt).length,1,'one per repository');
  assert.equal((await write(codex,{...step,expected:['state:review'],set:['state:done']})).error,GITHUB_WRITE_REASONS.notGranted,'comments only now');
  assert.ok(access.ungrantGithubWrites('codex','example/app'));
  assert.equal((await write(codex,comment20)).error,STANDING_OUTSIDE_TURN);
  // Audit: each call's decision and what came of it, and each change the person made.
  const writeAudit=ledger.agentAudit('codex',500).filter(e=>e.target==='github-writes').map(e=>[e.action,e.decision]).reverse();
  assert.deepEqual(writeAudit.filter(([action])=>action!=='run'),[['grant','allowed'],['write','allowed'],['write','allowed'],['write','denied'],['write','denied'],['write','denied'],['write','denied'],
   ['write','denied'],['write','denied'],['write','denied'],['write','allowed'],['grant','allowed'],['write','denied'],['ungrant','allowed']]);
  const last=ledger.agentAudit('codex',500).find(e=>e.target==='github-writes'&&e.action==='write'&&e.decision==='allowed')!;
  assert.match(String(last.reason),/^Comment on example\/app#20: written as the GitHub App without asking, under the person's standing Grant: https:\/\/github\.com\/example\/app\/issues\/20#issuecomment-\d+$/);
  assert.equal(last.grantId,'codex-github-writes-example/app');

  // Disconnecting forgets the App; drafting then says so again.
  drafts.app.disconnect();
  assert.equal(vault.get(GITHUB_APP_VAULT_KEY),null);
  assert.equal((await codex('create',comment)).error,GITHUB_DRAFT_MESSAGES.noApp);
  assert.equal(drafts.writer(),null);

  // Through the GitHub sign-in (Settings › Connectors), with no own App: the person writes what they approve, with the
  // sign-in's user token; a token GitHub refuses is renewed once; the Agent's line ends each new Issue and comment.
  signedIn=true;
  assert.equal(drafts.writer(),'person');
  assert.ok(access.grantGithubDrafts('claude-code'));
  issues.set('example/app#30',{number:30,title:'Slow start',state:'open',updated_at:'2026-10-15T10:00:00Z',html_url:'https://github.com/example/app/issues/30'});
  refuseUser=true;
  const asPerson=await claude('create',{write:'issue.comment',target:'example/app#30',body:'Looking into it.'});
  assert.deepEqual([asPerson.draft.status,renewed,userToken],['pending',1,1],'a refused user token is renewed once and the read made again');
  const viaSignIn=await drafts.approve(asPerson.draft.id);
  assert.equal(viaSignIn.status,'written');
  assert.deepEqual(requests.at(-1),{method:'POST',path:'/repos/example/app/issues/30/comments',auth:USER_TOKENS[1],body:{body:'Looking into it.\n\n_Drafted by Claude Code in Worldlet_'}});
  const personAudit=ledger.agentAudit('claude-code',500).find(e=>e.target==='github-drafts'&&e.action==='approve')!;
  assert.match(String(personAudit.reason),/written to GitHub as the person, through their GitHub sign-in: https:\/\/github\.com\/example\/app\/issues\/30#issuecomment-\d+$/);
  // A new Issue begun but not seen to finish is found by the Worldlet GitHub App that made it for the person.
  const newIssue=await claude('create',{write:'issue.create',target:'example/app',title:'Signed-in issue'});
  const madeBefore=madeIssues.length;
  await drafts.approve(newIssue.draft.id);
  const madeByPerson=madeIssues[madeBefore];
  assert.deepEqual([madeByPerson.user.login,madeByPerson.body],['alex','_Drafted by Claude Code in Worldlet_']);
  const begunByPerson={...newIssue.draft,writeStartedAt:madeByPerson.created_at};
  assert.equal(githubDraftCreatedUrl(begunByPerson,[madeByPerson],{clientId:GITHUB_APP.clientId,slug:GITHUB_APP.slug}),madeByPerson.html_url);
  assert.equal(githubDraftCreatedUrl(begunByPerson,[{...madeByPerson,performed_via_github_app:{id:5,slug:'other',client_id:'Iv1.other'}}],{clientId:GITHUB_APP.clientId,slug:GITHUB_APP.slug}),'','another App\'s Issue is not it');
  assert.equal(githubDraftCreatedUrl(begunByPerson,[madeByPerson],{appId:'1001'}),'','nor is it the own App\'s');
  // The Agent's name is kept to plain words: no link, mention or formatting.
  assert.equal(githubDraftSignature('Evil [x](https://example.com) @alex _b_'),'Drafted by Evil x https example.com alex b in Worldlet');
  assert.equal(githubDraftSignature(''),'Drafted by an Agent in Worldlet');
  // Through the sign-in nothing is written without asking: a standing write is refused, audited, and GitHub is not asked.
  assert.ok(access.grantGithubWrites('codex','example/app','comment',''));
  const beforeStanding=requests.length;
  assert.equal((await write(codex,comment20)).error,GITHUB_DRAFT_MESSAGES.standingNeedsApp);
  assert.equal(requests.length,beforeStanding);
  assert.ok(access.ungrantGithubWrites('codex','example/app'));
  // Signed out: drafting says to connect GitHub again.
  signedIn=false;
  assert.equal((await claude('create',{write:'issue.comment',target:'example/app#30',body:'Again.'})).error,GITHUB_DRAFT_MESSAGES.noApp);

  // The key never leaves the vault: not in an answer, item, stored row, audit entry or log line, and neither are the
  // App's signed tokens or the installation token.
  const stored=JSON.stringify([ledger.githubDrafts(),ledger.agentAudit('codex',500),ledger.agentAudit('claude-code',500),ledger.records('items'),ledger.history({limit:1000})]);
  const body=pem.split('\n').slice(1,-2).join('');
  for(const text of [...said,stored,...logged])for(const secret of [pem.trim(),body.slice(0,64),body.slice(-64),INSTALLATION_TOKEN,...USER_TOKENS,...jwts]){
   assert.ok(!text.includes(secret),'a credential leaked');
  }
  assert.deepEqual(logged.filter(line=>!line.includes('ExperimentalWarning')),[],'nothing is logged');
 }finally{standing.close();ledger.close();Object.assign(console,original);}
});
console.log('PASS GitHub drafts on the host: own Grant only, drafted against the target as read, Approve re-reads and refuses a changed, closed or deleted target, writes once as the GitHub App and keeps the link, reports labels removed in part, looks for a new Issue begun but not seen to finish instead of posting it twice, Dismiss and a phone settle write nothing, every Approve and Dismiss audited, an ask carrying drafts runs them only on this computer’s Approve and the Agent reads the results, a label transition checked against the labels read, standing GitHub writes run at once only within their Grant’s repository, writes and label prefix, refused when stale and audited, through the GitHub sign-in writes as the person with its user token (renewed once when refused), each new Issue and comment ending with the drafting Agent\'s line, no standing write, and the App key and tokens appear nowhere');
