import crypto from 'node:crypto';
import {AGENT_AUDIT_KEEP,GITHUB_DRAFT_REASONS,githubAppJwtClaims,githubDraftAttentionItem,githubDraftChange,githubDraftItemId,githubDraftPending,githubDraftReadPath,githubDraftRequests,
 githubDraftResultUrl,githubDraftTarget,githubDraftTargetParts,makeGithubDraft,readGithubApp,readGithubDraftCreate,readGithubDrafts,readStoredGithubApp,readStoredGithubDraft,settleGithubDraft} from '../../../../../core/agent/index.ts';
import {GITHUB_DRAFT_TARGET,type GithubAppCredentials,type GithubDraft,type GithubWrite} from '../../../../../contracts/github-drafts.ts';
import type {AgentAuditEntry} from '../../../../../contracts/agent-identity.ts';
import type {VaultService} from '../../host/services.ts';
import type {Row} from './types.ts';

// GitHub drafts (core/agent/GRANTS.md#github-drafts). Core decides; this keeps the records and talks to GitHub: each
// draft in the World's ledger (`state.github-drafts` in world.sqlite) beside its Attention item (provider `agents`), and
// each GitHub request over GitHub's REST API as the person's GitHub App. The App's ID, installation ID and private key
// are kept only in the vault (`github-app`); they, the token the App signs and the installation token GitHub gives for
// it never leave this module: not to a page, an Agent, an audit entry, a log or an event. Every error here is one of
// this module's own sentences, never a message that could carry a request.

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
 summaries(ids:readonly string[]):{id:string;agentId:string;status:string;resultUrl?:string;reason?:string}[];
 /** The GitHub App as GitHub's write identity (`githubApp`): whether one is connected, connecting one (checked with
  * GitHub before it is kept) and disconnecting it. None of them returns the App's settings. */
 app:{status():Row;connect(input:unknown):Promise<Row>;disconnect():Row};
}
const NOT_READY='Worldlet is not ready for this yet: the person has not finished setting up their own World.';
export const GITHUB_DRAFT_MESSAGES=Object.freeze({
 noApp:'GitHub writes need a GitHub App. The person connects one in Settings › Agent › Connections.',
 keyRefused:'GitHub did not accept the GitHub App. Check its App ID and private key, then connect it again.',
 noInstallation:'GitHub does not know this installation of the GitHub App. Check the installation ID, then connect it again.',
 unreachable:'GitHub did not answer. Try again in a moment.',
 notFound:'The GitHub App cannot see this on GitHub. Check the name, and that the App is installed on that repository.',
 unreadable:'GitHub could not read this right now. Try again in a moment.',
 busy:'This draft is already being written.',
 lost:'GitHub did not answer the write, so it may or may not have been made. Check on GitHub before drafting it again.',
});
const TIMEOUT_MS=30_000;
const error=(message:string):never=>{throw new Error(message);};
const own=(value:unknown)=>value instanceof Error&&value.message?value.message:'Could not do that.';

export function createGithubDrafts({ledger,vault,name,changed,fetch=globalThis.fetch as unknown as GithubFetch,api=GITHUB_API,userAgent='Worldlet',
 now=()=>new Date().toISOString(),clock=()=>Date.now(),newId=()=>crypto.randomUUID()}:
 {ledger:()=>DraftLedger|null;vault:VaultService;name:(agentId:string)=>string;changed:()=>void;fetch?:GithubFetch;api?:string;userAgent?:string;now?:()=>string;clock?:()=>number;newId?:()=>string}):GithubDrafts {
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
  const next=settleGithubDraft(draft,'dismissed',at);
  save(db,next,'user');audit(db,next,'dismiss','allowed','The person settled this draft\'s card without approving it; nothing was written.',at);
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
 async function token():Promise<string> {
  if(installation&&installation.until>clock())return installation.token;
  const app=readStoredGithubApp(vault.get(GITHUB_APP_VAULT_KEY));
  if(!app)return error(GITHUB_DRAFT_MESSAGES.noApp);
  installation=await exchange(app);
  return installation.token;
 }
 /** The target as it is now, or null when it is gone (deleted, moved, or the App can no longer see it). */
 async function target(write:GithubWrite,parts:{owner:string;repo:string;number?:number}) {
  const answer=await request('GET',githubDraftReadPath(write,parts),await token());
  if(answer.status===401){installation=null;error(GITHUB_DRAFT_MESSAGES.keyRefused);}
  if([301,302,307,308,404,410].includes(answer.status))return null;
  if(answer.status!==200)return error(GITHUB_DRAFT_MESSAGES.unreadable);
  return githubDraftTarget(write==='issue.create'?'repository':'issue',answer.json,parts);
 }
 const running=new Set<string>();

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
    // Read again, as the App, right before writing: anything not as it was refuses the whole draft.
    const change=githubDraftChange(draft,await target(draft.write,githubDraftTargetParts(draft)));
    if(change){
     const at=now(),next=settleGithubDraft(draft,'stale',at,{reason:change});
     save(db!,next,'user');audit(db!,next,'approve','denied','The person approved, but the target changed on GitHub: '+change,at);changed();
     return {ok:true,status:'stale',reason:change};
    }
    const {requests,result}=githubDraftRequests(draft),auth=await token();
    let answer:unknown=null,refused='';
    try{
     for(const step of requests){
      const reply=await request(step.method,step.path,auth,step.body);
      if(!step.accept.includes(reply.status)){
       const said=typeof (reply.json as Row|null)?.message==='string'?String((reply.json as Row).message).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200):'';
       refused=`GitHub refused the write (${reply.status}${said?': '+said:''}).`;break;
      }
      answer=reply.json;
     }
    }catch{refused=GITHUB_DRAFT_MESSAGES.lost;}
    const at=now();
    if(refused){
     const next=settleGithubDraft(draft,'failed',at,{reason:refused});
     save(db!,next,'user');audit(db!,next,'approve','denied','The person approved; '+refused,at);changed();
     return {ok:true,status:'failed',reason:refused};
    }
    const url=result==='response'?githubDraftResultUrl(draft,answer):draft.target.url;
    const next=settleGithubDraft(draft,'written',at,{resultUrl:url});
    save(db!,next,'user');audit(db!,next,'approve','allowed','The person approved; written to GitHub as the GitHub App: '+url,at);changed();
    return {ok:true,status:'written',url};
   }finally{running.delete(key);}
  },
  dismiss(id){
   const db=ledger();
   if(!db)error(NOT_READY);
   if(running.has(String(id)))error(GITHUB_DRAFT_MESSAGES.busy);
   const at=now(),drafts=settle(db!,load(db!),at),draft=drafts.find(item=>item.id===id);
   const next=settleGithubDraft(draft,'dismissed',at);
   save(db!,next,'user');audit(db!,next,'dismiss','allowed','The person dismissed this draft; nothing was written.',at);changed();
   return {ok:true,status:'dismissed'};
  },
  summaries(ids){
   const db=ledger();
   if(!db)return [];
   const drafts=settle(db,load(db),now());
   return ids.flatMap(id=>{const draft=drafts.find(item=>item.id===id);
    return draft?[{id,agentId:draft.agentId,status:draft.status,...draft.resultUrl?{resultUrl:draft.resultUrl}:{},...draft.reason?{reason:draft.reason}:{}}]:[];});
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
 };
}
