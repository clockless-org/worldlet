import crypto from 'node:crypto';
import {AGENT_AUDIT_KEEP,GITHUB_DRAFT_REASONS,GITHUB_WRITE_REASONS,githubAppJwtClaims,githubDraftAttentionItem,githubDraftChange,githubDraftCreatedPath,githubDraftCreatedUrl,githubDraftHeadline,githubDraftItemId,githubDraftOutcome,githubDraftPending,githubDraftReadPath,githubDraftRequests,githubDraftSignature,
 githubDraftResultUrl,githubDraftTarget,githubDraftTargetParts,githubWriteAuditEntry,githubWriteChange,githubWriteDraft,githubWriteGrantFor,makeGithubDraft,readGithubApp,readGithubDraftCreate,readGithubDrafts,readGithubWriteRun,readStoredGithubApp,readStoredGithubDraft,settleGithubDraft,startGithubDraftWrite,type GithubWriteRequest,type GithubWriter} from '../../../../../core/agent/index.ts';
import {GITHUB_DRAFT_TARGET,type GithubAppCredentials,type GithubDraft,type GithubWrite} from '../../../../../contracts/github-drafts.ts';
import type {AgentAuditEntry,Grant} from '../../../../../contracts/agent-identity.ts';
import type {VaultService} from '../../host/services.ts';
import {GITHUB_APP} from '../../../../../context/accounts/index.ts';
import type {Row} from './types.ts';

// GitHub drafts (core/agent/GRANTS.md#github-drafts). Core decides; this keeps the records and talks to GitHub: each
// draft in the World's ledger (`state.github-drafts` in world.sqlite) beside its Attention item (provider `agents`), and
// each GitHub request over GitHub's REST API as the person, through their GitHub sign-in with the Worldlet GitHub App
// (context/applets/INTEGRATIONS.md#github-sign-in; `userToken`), or, when they connected one under Settings › Connectors ›
// Advanced, as their own GitHub App. That App's ID, installation ID and private key are kept only in the vault
// (`github-app`); they, the token the App signs, the installation token GitHub gives for it and the sign-in's user token
// never leave this module: not to a page, an Agent, an audit entry, a log or an event. Every error here is one of this
// module's own sentences, never a message that could carry a request. A new Issue or comment ends with a line naming the
// Agent that drafted it (core githubDraftSignature). A standing GitHub write (core/agent/GRANTS.md#standing-github-writes)
// runs the same way, at once, with no draft kept, and only as the person's own GitHub App: through the sign-in every
// write is a draft the person approves first.

export const GITHUB_APP_VAULT_KEY='github-app';
export const GITHUB_API='https://api.github.com';
/** The World's ledger, while it is the person's own World (not the practice World) and writable. */
export type DraftLedger={
 githubDrafts():Row[];
 saveGithubDraft(draft:Row,item:Row,origin:'user'|'agent'):void;
 value(bucket:string,id:string):Row|null;
 recordAgentAudit(entry:Row,keep:number):boolean;
};
/** `fetch`, as far as this module uses it. */
export type GithubFetch=(url:string,init:{method:string;headers:Record<string,string>;body?:string;redirect:'manual';signal?:AbortSignal})=>Promise<{status:number;json():Promise<unknown>}>;
export interface GithubDrafts {
 /** One `github_drafts` call (`github-drafts/create`, `read`) by `agentId`, already admitted by its Grants. */
 call(agentId:string,args:Row):Promise<Row>;
 /** The person chose Approve on the draft's card (`githubDraft` `approve`): read the target again, refuse when it
  * changed, otherwise write once. */
 approve(id:unknown):Promise<Row>;
 /** The person chose Dismiss (`githubDraft` `dismiss`): nothing is written. */
 dismiss(id:unknown):Row;
 /** What became of these drafts, for the asks that carry them (agent-asks.ts): each found draft's Agent, status, result
  * link and why it was not written. */
 summaries(ids:readonly string[]):{id:string;agentId:string;service:'github';status:string;resultUrl?:string;reason?:string}[];
 /** One `github_writes` call (`github-writes/run`) by `agentId`, already admitted by its Grants (`grants`, its own):
  * refused unless one of its standing GitHub write Grants reaches this repository, write and label prefix; otherwise
  * the target is read again, refused when it is not as the Agent read it, and written once. Each is audited. */
 run(agentId:string,args:Row,grants:readonly Grant[]):Promise<Row>;
 /** The person's own GitHub App as GitHub's write identity (`githubApp`): whether one is connected, connecting one
  * (checked with GitHub before it is kept) and disconnecting it. None of them returns the App's settings. */
 app:{status():Row;connect(input:unknown):Promise<Row>;disconnect():Row};
 /** Who writes approved drafts now: the person's own GitHub App, the person through their GitHub sign-in, or nobody
  * (GitHub is not connected). */
 writer():'app'|'person'|null;
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';
export const GITHUB_DRAFT_MESSAGES=Object.freeze({
 noApp:'GitHub writes need GitHub connected. The person connects it in Settings › Connectors.',
 standingNeedsApp:'Changing GitHub without asking needs the person\'s own GitHub App, under Settings › Connectors › Advanced. Draft the change instead; the person approves it.',
 signedOut:'GitHub no longer accepts the sign-in. The person connects GitHub again in Settings › Connectors.',
 keyRefused:'GitHub did not accept the GitHub App. Check its App ID and private key, then connect it again.',
 noInstallation:'GitHub does not know this installation of the GitHub App. Check the installation ID, then connect it again.',
 unreachable:'GitHub did not answer. Try again in a moment.',
 notFound:'Worldlet cannot see this on GitHub. Check the name, and that Worldlet may see that repository (Choose projects on the GitHub tile in Settings › Connectors).',
 unreadable:'GitHub could not read this right now. Try again in a moment.',
 busy:'This draft is already being written.',
 lost:'GitHub did not answer the write, so it may or may not have been made. Check on GitHub before drafting it again.',
 createLost:'GitHub did not answer, so this Issue may or may not have been made. Choose Approve again to look for it on GitHub; it is not posted twice.',
 notFoundAfterStart:'Writing this Issue began but was not seen to finish, and GitHub shows no Issue with its title made through Worldlet, so it may or may not have been made. Check on GitHub before drafting it again.',
});
const TIMEOUT_MS=30_000;
const error=(message:string):never=>{throw new Error(message);};
/** How the audit names who wrote. */
const as=(who:'app'|'person'|undefined)=>who==='person'?'as the person, through their GitHub sign-in':'as the GitHub App';
const own=(value:unknown)=>value instanceof Error&&value.message?value.message:'Could not do that.';

/** `userToken`: the person's GitHub sign-in with the Worldlet GitHub App (McpAccounts), its user token renewed when it
 * has expired (`force`: also when GitHub just refused it); null when GitHub is not signed in that way. `signedIn`: whether
 * it is, without asking GitHub. */
export function createGithubDrafts({ledger,vault,name,changed,userToken=async()=>null,signedIn=()=>false,fetch=globalThis.fetch as unknown as GithubFetch,api=GITHUB_API,userAgent='Worldlet',
 now=()=>new Date().toISOString(),clock=()=>Date.now(),newId=()=>crypto.randomUUID()}:
 {ledger:()=>DraftLedger|null;vault:VaultService;name:(agentId:string)=>string;changed:()=>void;userToken?:(force?:boolean)=>Promise<string|null>;signedIn?:()=>boolean;fetch?:GithubFetch;api?:string;userAgent?:string;now?:()=>string;clock?:()=>number;newId?:()=>string}):GithubDrafts {
 const load=(db:DraftLedger)=>db.githubDrafts().flatMap(row=>{const draft=readStoredGithubDraft(row);return draft?[draft]:[];});
 const save=(db:DraftLedger,draft:GithubDraft,origin:'user'|'agent')=>db.saveGithubDraft(draft as unknown as Row,githubDraftAttentionItem(draft,name(draft.agentId)) as Row,origin);
 const audit=(db:DraftLedger,draft:GithubDraft,action:string,decision:AgentAuditEntry['decision'],reason:string,at:string)=>{
  try{db.recordAgentAudit({at,agentId:draft.agentId,target:GITHUB_DRAFT_TARGET,action,decision,reason:[...reason].slice(0,300).join('')},AGENT_AUDIT_KEEP);}catch{}
 };
 // Done or Dismiss on the draft's Attention card through the ordinary item status (a phone, a browser on another
 // device): the draft is dismissed. Approving needs this computer (`githubDraft`), so neither writes anything.
 const settle=(db:DraftLedger,drafts:GithubDraft[],at:string)=>drafts.map(draft=>{
  if(!githubDraftPending(draft))return draft;
  const item=db.value('items',githubDraftItemId(draft.id));
  if(item?.statusOrigin!=='user'||item.status!=='done'&&item.status!=='dismissed')return draft;
  // A create already begun may have been made: never said to have written nothing.
  const next=draft.writeStartedAt?settleGithubDraft(draft,'unknown',at,{reason:GITHUB_DRAFT_REASONS.unknown}):settleGithubDraft(draft,'dismissed',at);
  save(db,next,'user');audit(db,next,'dismiss','allowed',draft.writeStartedAt?'The person settled this draft\'s card while its write had begun: '+GITHUB_DRAFT_REASONS.unknown:'The person settled this draft\'s card without approving it; nothing was written.',at);
  return next;
 });

 // The installation token GitHub gives the App, kept in memory only until a minute before it expires.
 let installation:{token:string;until:number}|null=null;
 async function request(method:string,path:string,token:string,body?:Row):Promise<{status:number;json:unknown}> {
  let response;
  try{
   response=await fetch(api+path,{method,redirect:'manual',signal:AbortSignal.timeout(TIMEOUT_MS),
    headers:{accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','user-agent':userAgent,authorization:'Bearer '+token,...body?{'content-type':'application/json'}:{}},
    ...body?{body:JSON.stringify(body)}:{}});
  }catch{return error(GITHUB_DRAFT_MESSAGES.unreachable);}
  let json:unknown=null;try{json=await response.json();}catch{}
  return {status:response.status,json};
 }
 /** The App's signed token (RS256, contracts' claims), for asking GitHub for an installation token. */
 function appToken(app:GithubAppCredentials):string {
  const part=(value:Row)=>Buffer.from(JSON.stringify(value)).toString('base64url');
  const data=part({alg:'RS256',typ:'JWT'})+'.'+part(githubAppJwtClaims(app.appId,clock()/1000));
  try{return data+'.'+crypto.sign('sha256',Buffer.from(data),app.privateKey).toString('base64url');}
  catch{return error(GITHUB_DRAFT_MESSAGES.keyRefused);}
 }
 async function exchange(app:GithubAppCredentials):Promise<{token:string;until:number}> {
  const answer=await request('POST',`/app/installations/${app.installationId}/access_tokens`,appToken(app));
  if(answer.status===401||answer.status===403)error(GITHUB_DRAFT_MESSAGES.keyRefused);
  if(answer.status===404)error(GITHUB_DRAFT_MESSAGES.noInstallation);
  const value=answer.json as Row|null,expires=Date.parse(String(value?.expires_at??''));
  if(answer.status!==201||typeof value?.token!=='string'||!value.token)return error(GITHUB_DRAFT_MESSAGES.unreachable);
  return {token:value.token,until:(Number.isFinite(expires)?expires:clock()+600_000)-60_000};
 }
 const ownApp=()=>readStoredGithubApp(vault.get(GITHUB_APP_VAULT_KEY));
 /** Who writes, and how GitHub shows what they made: the person's own App when one is connected, else the person
  * through the sign-in. */
 function writer():{as:'app';by:GithubWriter}|{as:'person';by:GithubWriter}|null {
  const app=ownApp();
  if(app)return {as:'app',by:{appId:app.appId}};
  return signedIn()?{as:'person',by:{clientId:GITHUB_APP.clientId,slug:GITHUB_APP.slug}}:null;
 }
 async function token(force=false):Promise<string> {
  const app=ownApp();
  if(app){
   if(!force&&installation&&installation.until>clock())return installation.token;
   installation=await exchange(app);
   return installation.token;
  }
  let user:string|null;
  try{user=await userToken(force);}catch{return error(GITHUB_DRAFT_MESSAGES.unreachable);}
  if(user)return user;
  return error(signedIn()?GITHUB_DRAFT_MESSAGES.signedOut:GITHUB_DRAFT_MESSAGES.noApp);
 }
 /** GitHub refused the token: the own App's is asked for again next time; the sign-in's is renewed once, here. */
 const refusedToken=async()=>{
  if(ownApp()){installation=null;return error(GITHUB_DRAFT_MESSAGES.keyRefused);}
  return token(true);
 };
 /** The target as it is now, or null when it is gone (deleted, moved, or Worldlet can no longer see it). */
 async function target(write:GithubWrite,parts:{owner:string;repo:string;number?:number}) {
  let answer=await request('GET',githubDraftReadPath(write,parts),await token());
  if(answer.status===401){
   answer=await request('GET',githubDraftReadPath(write,parts),await refusedToken());
   if(answer.status===401)error(GITHUB_DRAFT_MESSAGES.signedOut);
  }
  if([301,302,307,308,404,410].includes(answer.status))return null;
  if(answer.status!==200)return error(GITHUB_DRAFT_MESSAGES.unreadable);
  return githubDraftTarget(write==='issue.create'?'repository':'issue',answer.json,parts);
 }
 const running=new Set<string>();
 /** Each request once, in order, until one is not accepted: GitHub's own words, or that it did not answer. */
 /** Each request once, in order, stopping at the first GitHub refuses unless `independent` (labels.remove: each label
  * is its own request, so one refused does not stop the others). `refused` is the first refusal or no answer in words;
  * `answers` what GitHub said to each; `lost` when one had no answer. */
 async function write(requests:GithubWriteRequest[],independent=false):Promise<{refused:string;answer:unknown;answers:{status:number;message?:string}[];lost:boolean}> {
  const auth=await token();
  const answers:{status:number;message?:string}[]=[];
  let answer:unknown=null,refused='',lost=false;
  try{
   for(const step of requests){
    const reply=await request(step.method,step.path,auth,step.body),message=(reply.json as Row|null)?.message;
    answers.push({status:reply.status,...typeof message==='string'?{message}:{}});
    if(!step.accept.includes(reply.status)){
     const said=typeof message==='string'?message.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200):'';
     refused||=`GitHub refused the write (${reply.status}${said?': '+said:''}).`;
     if(independent)continue;
     break;
    }
    answer=reply.json;
   }
  }catch{refused||=GITHUB_DRAFT_MESSAGES.lost;lost=true;}
  return {refused,answer,answers,lost};
 }
 // Issues a standing write is running on: a second write to the same one waits for the Agent to read it again.
 const writing=new Set<string>();

 return {
  async call(agentId,args){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   try{
    const at=now(),{operation,...input}=args??{},drafts=settle(db,load(db),at);
    if(operation==='read')return {drafts:readGithubDrafts(drafts,agentId,input),untrustedContent:true};
    if(operation!=='create')return {error:'Unknown GitHub drafts operation.'};
    // Checked before GitHub is asked anything.
    const create=readGithubDraftCreate(input);
    const found=await target(create.write,{owner:create.owner,repo:create.repoName,...create.number?{number:create.number}:{}});
    if(!found)return {error:GITHUB_DRAFT_MESSAGES.notFound};
    const draft=makeGithubDraft(drafts,agentId,input,found,newId(),now());
    save(db,draft,'agent');changed();
    return {ok:true,draft,untrustedContent:true,guidance:'The person sees this in their Attention Center and approves or dismisses it. Nothing is written to GitHub until they approve. Read it later with github-drafts/read to see what happened; do not draft it again.'};
   }catch(failure){return {error:own(failure)};}
  },
  async approve(id){
   const db=ledger();
   if(!db)error(NOT_READY);
   const key=typeof id==='string'?id:'';
   if(running.has(key))error(GITHUB_DRAFT_MESSAGES.busy);
   running.add(key);
   try{
    const drafts=settle(db!,load(db!),now()),draft=drafts.find(item=>item.id===key);
    if(!draft)return error(GITHUB_DRAFT_REASONS.missing);
    if(!githubDraftPending(draft))error(GITHUB_DRAFT_REASONS.settled);
    // A create that began before and was not seen to finish (Worldlet stopped mid-write): look for the Issue it made
    // instead of posting it again; if there is none, say it is unknown rather than risk a second Issue.
    if(draft.writeStartedAt){
     const who=writer();
     if(!who)error(GITHUB_DRAFT_MESSAGES.noApp);
     const listed=await request('GET',githubDraftCreatedPath(draft),await token());
     if(listed.status===401&&who!.as==='app')installation=null;
     if(listed.status!==200)error(GITHUB_DRAFT_MESSAGES.unreadable);
     const url=githubDraftCreatedUrl(draft,listed.json,who!.by),at=now();
     const next=url?settleGithubDraft(draft,'written',at,{resultUrl:url}):settleGithubDraft(draft,'unknown',at,{reason:GITHUB_DRAFT_MESSAGES.notFoundAfterStart});
     save(db!,next,'user');audit(db!,next,'approve','allowed',url?`The person approved; found already written to GitHub ${as(who!.as)}: ${url}`:'The person approved; '+GITHUB_DRAFT_MESSAGES.notFoundAfterStart,at);changed();
     return url?{ok:true,status:'written',url}:{ok:true,status:'unknown',reason:next.reason};
    }
    // Read again, as the writer, right before writing: anything not as it was refuses the whole draft.
    const change=githubDraftChange(draft,await target(draft.write,githubDraftTargetParts(draft)));
    if(change){
     const at=now(),next=settleGithubDraft(draft,'stale',at,{reason:change});
     save(db!,next,'user');audit(db!,next,'approve','denied','The person approved, but the target changed on GitHub: '+change,at);changed();
     return {ok:true,status:'stale',reason:change};
    }
    const who=writer(),{requests,result}=githubDraftRequests(draft,githubDraftSignature(name(draft.agentId)));
    // A new Issue is the one write a later read cannot tell was made, so it is recorded as begun before GitHub is asked.
    let begun=draft;
    if(draft.write==='issue.create'){begun=startGithubDraftWrite(draft,now());save(db!,begun,'user');}
    const {answer,answers,lost}=await write(requests,draft.write==='labels.remove');
    const at=now();
    // A new Issue left unanswered stays begun: Approve again looks for it on GitHub instead of posting it twice.
    if(lost&&draft.write==='issue.create')error(GITHUB_DRAFT_MESSAGES.createLost);
    if(lost){
     const next=settleGithubDraft(begun,'unknown',at,{reason:GITHUB_DRAFT_MESSAGES.lost});
     save(db!,next,'user');audit(db!,next,'approve','allowed','The person approved; '+GITHUB_DRAFT_MESSAGES.lost,at);changed();
     return {ok:true,status:'unknown',reason:GITHUB_DRAFT_MESSAGES.lost};
    }
    const outcome=githubDraftOutcome(draft,answers);
    if(outcome.status==='failed'){
     const next=settleGithubDraft(begun,'failed',at,{reason:outcome.reason});
     save(db!,next,'user');audit(db!,next,'approve','denied','The person approved; '+outcome.reason,at);changed();
     return {ok:true,status:'failed',reason:outcome.reason};
    }
    const url=result==='response'?githubDraftResultUrl(draft,answer):draft.target.url;
    const next=settleGithubDraft(begun,'written',at,{resultUrl:url,...outcome.reason?{reason:outcome.reason}:{}});
    save(db!,next,'user');audit(db!,next,'approve','allowed',`The person approved; written to GitHub ${as(who?.as)}: `+url+(outcome.reason?' '+outcome.reason:''),at);changed();
    return {ok:true,status:'written',url,...outcome.reason?{reason:outcome.reason}:{}};
   }finally{running.delete(key);}
  },
  dismiss(id){
   const db=ledger();
   if(!db)error(NOT_READY);
   if(running.has(String(id)))error(GITHUB_DRAFT_MESSAGES.busy);
   const at=now(),drafts=settle(db!,load(db!),at),draft=drafts.find(item=>item.id===id);
   // A create already begun may have been made: dismissing it never says nothing was written.
   if(draft?.writeStartedAt){
    const next=settleGithubDraft(draft,'unknown',at,{reason:GITHUB_DRAFT_REASONS.unknown});
    save(db!,next,'user');audit(db!,next,'dismiss','allowed','The person dismissed this draft while its write had begun: '+GITHUB_DRAFT_REASONS.unknown,at);changed();
    return {ok:true,status:'unknown',reason:GITHUB_DRAFT_REASONS.unknown};
   }
   const next=settleGithubDraft(draft,'dismissed',at);
   save(db!,next,'user');audit(db!,next,'dismiss','allowed','The person dismissed this draft; nothing was written.',at);changed();
   return {ok:true,status:'dismissed'};
  },
  summaries(ids){
   const db=ledger();
   if(!db)return [];
   const drafts=settle(db,load(db),now());
   return ids.flatMap(id=>{const draft=drafts.find(item=>item.id===id);
    return draft?[{id,agentId:draft.agentId,service:'github' as const,status:draft.status,...draft.resultUrl?{resultUrl:draft.resultUrl}:{},...draft.reason?{reason:draft.reason}:{}}]:[];});
  },
  async run(agentId,args,grants){
   const db=ledger();
   if(!db)return {error:NOT_READY};
   const record=(entry:AgentAuditEntry)=>{try{db.recordAgentAudit(entry as unknown as Row,AGENT_AUDIT_KEEP);}catch{}};
   let key='';
   try{
    const {operation,...input}=args??{};
    if(operation!=='run')return {error:'Unknown GitHub writes operation.'};
    // Checked before GitHub is asked anything: the same limits as a draft, then the Grant's reach.
    const run=readGithubWriteRun(input),at=now(),parts={owner:run.owner,repo:run.repoName,number:run.number};
    const grant=githubWriteGrantFor(agentId,grants,run,at),headline=githubDraftHeadline({write:run.write,repo:`${run.owner}/${run.repoName}`,number:run.number} as GithubDraft);
    if(!grant){record(githubWriteAuditEntry(agentId,undefined,headline,{written:false,reason:GITHUB_WRITE_REASONS.notGranted},at));return {error:GITHUB_WRITE_REASONS.notGranted};}
    key=`${run.owner}/${run.repoName}#${run.number}`.toLowerCase();
    if(writing.has(key)){key='';return {error:GITHUB_WRITE_REASONS.busy};}
    writing.add(key);
    // Only as the person's own GitHub App: through the sign-in, every write is a draft the person approves first.
    if(!ownApp()){record(githubWriteAuditEntry(agentId,grant.id,headline,{written:false,reason:GITHUB_DRAFT_MESSAGES.standingNeedsApp},at));return {error:GITHUB_DRAFT_MESSAGES.standingNeedsApp};}
    // Read as the App right before writing: anything not as the Agent read it refuses the whole write.
    const found=await target('issue.comment',parts),change=githubWriteChange(run,found);
    const current=found?{current:{state:found.state,updatedAt:found.updatedAt,title:found.title,url:found.url,...found.labels?{labels:found.labels}:{}}}:{};
    if(change){
     record(githubWriteAuditEntry(agentId,grant.id,headline,{written:false,reason:change},now()));
     return {error:change,status:'stale',...current,untrustedContent:true};
    }
    const draft=githubWriteDraft(run,agentId,found!,at),{requests,result}=githubDraftRequests(draft,githubDraftSignature(name(agentId))),{refused,answer}=await write(requests);
    if(refused){
     record(githubWriteAuditEntry(agentId,grant.id,headline,{written:false,reason:refused},now()));
     return {error:refused,status:'failed',untrustedContent:true};
    }
    const url=result==='response'?githubDraftResultUrl(draft,answer):draft.target.url;
    record(githubWriteAuditEntry(agentId,grant.id,headline,{written:true,url},now()));
    return {ok:true,status:'written',url,untrustedContent:true};
   }catch(failure){return {error:own(failure)};}
   finally{if(key)writing.delete(key);}
  },
  app:{
   status(){return {connected:readStoredGithubApp(vault.get(GITHUB_APP_VAULT_KEY))!==null};},
   async connect(input){
    const app=readGithubApp(input);
    // Checked with GitHub before it is kept: an App GitHub refuses replaces nothing.
    const checked=await exchange(app);
    vault.set(GITHUB_APP_VAULT_KEY,JSON.stringify(app));installation=checked;
    return {ok:true,connected:true};
   },
   disconnect(){vault.delete(GITHUB_APP_VAULT_KEY);installation=null;return {ok:true,connected:false};},
  },
  writer(){return writer()?.as??null;},
 };
}
