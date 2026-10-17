import {GITHUB_DRAFT_LIMITS,GITHUB_DRAFT_STATUSES,GITHUB_WRITES,type GithubAppCredentials,type GithubDraft,type GithubDraftCreate,type GithubDraftStatus,type GithubDraftTarget,type GithubWrite} from '../../contracts/github-drafts.ts';
import {AGENT_ASK_PROVIDER} from '../../contracts/agent-asks.ts';
import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import type {WorldItem} from '../../contracts/world.ts';
import {looksSecret} from './agent-profile.ts';

/** GitHub drafts (contracts/github-drafts.ts, core/agent/GRANTS.md#github-drafts). Pure: hosts supply the stored
 * drafts, the calling Agent's ID (from its token), the target as GitHub returned it, new IDs and the clock; they make the
 * requests this plans and save what comes back. Every refusal throws an Error whose message the Agent or the page is
 * shown, and never repeats a credential. */

export const GITHUB_DRAFT_REASONS=Object.freeze({
 invalid:'This GitHub draft is not valid.',
 write:'Choose what to write: issue.create, issue.comment, labels.add, labels.remove, issue.close or issue.reopen.',
 target:'Name the target as owner/repo for a new Issue, or owner/repo#123 for anything else.',
 secret:'GitHub drafts may not hold passwords, tokens or keys. Name the thing instead.',
 control:'GitHub drafts may not hold control characters.',
 full:`This Agent already has ${GITHUB_DRAFT_LIMITS.pendingPerAgent} GitHub drafts waiting. Wait for the person to approve or dismiss some first.`,
 pull:'Only an Issue can be closed or reopened here, not a pull request.',
 alreadyClosed:'This Issue is already closed.',
 alreadyOpen:'This Issue is already open.',
 archived:'This repository is archived: nothing can be written to it.',
 missing:'No such GitHub draft.',
 settled:'This GitHub draft is already settled.',
 unknown:'Worldlet began writing this but cannot tell whether GitHub made it. Check GitHub before drafting it again.',
 app:'The GitHub App is not valid: enter its App ID, its installation ID and its private key (a .pem file\'s whole text).',
});
/** Why Approve wrote nothing: the target is not as it was when the Agent drafted. */
export const GITHUB_DRAFT_STALE=Object.freeze({
 gone:'It is gone from GitHub (deleted, moved or no longer visible to the GitHub App), so nothing was written.',
 state:(was:string,now:string)=>`It is ${now} now; it was ${was} when this was drafted, so nothing was written.`,
 updated:'It changed on GitHub after this was drafted, so nothing was written. Ask the Agent to read it again and draft anew.',
});

/** A draft ID: host-made, file-name safe. */
export const GITHUB_DRAFT_ID_PATTERN=/^[a-z0-9][a-z0-9-]{7,63}$/;
const REPO=/^([A-Za-z0-9-]{1,39})\/((?!\.+$)[A-Za-z0-9_.-]{1,100})$/;
const ISSUE=/^([A-Za-z0-9-]{1,39})\/((?!\.+#)[A-Za-z0-9_.-]{1,100})#([1-9][0-9]{0,8})$/;
// C0 controls (except tab and line breaks, allowed in multi-line text only), DEL, C1 controls, and the bidirectional
// overrides that can make a card read differently from what it holds.
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const LINE_BREAK=/[\t\r\n]/;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const instant=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const count=(value:string)=>[...value].length;
const fail=(reason:string):never=>{throw new Error(reason);};
const only=(value:Record<string,unknown>,keys:string[])=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(GITHUB_DRAFT_REASONS.invalid);};

function text(value:unknown,limit:number,{multiline=false,required=false}={}):string {
 if(value===undefined||value===null||value===''){if(required)fail(GITHUB_DRAFT_REASONS.invalid);return '';}
 if(typeof value!=='string')return fail(GITHUB_DRAFT_REASONS.invalid);
 if(CONTROL.test(value)||!multiline&&LINE_BREAK.test(value))fail(GITHUB_DRAFT_REASONS.control);
 const clean=value.replace(/\r\n?/g,'\n').trim();
 if(required&&!clean||count(clean)>limit)fail(GITHUB_DRAFT_REASONS.invalid);
 if(looksSecret(clean))fail(GITHUB_DRAFT_REASONS.secret);
 return clean;
}
function labels(value:unknown,required:boolean):string[] {
 if(value===undefined&&!required)return [];
 if(!Array.isArray(value)||value.length>GITHUB_DRAFT_LIMITS.labels||required&&!value.length)return fail(GITHUB_DRAFT_REASONS.invalid);
 const items=value.map(entry=>text(entry,GITHUB_DRAFT_LIMITS.label,{required:true}));
 if(new Set(items.map(item=>item.toLowerCase())).size!==items.length)fail(GITHUB_DRAFT_REASONS.invalid);
 return items;
}

/** A target, checked: `owner/repo` (a new Issue) or `owner/repo#123`. */
export function githubDraftTargetId(write:GithubWrite,value:unknown):{owner:string;repo:string;number?:number} {
 const match=typeof value==='string'?(write==='issue.create'?REPO:ISSUE).exec(value):null;
 if(!match)return fail(GITHUB_DRAFT_REASONS.target);
 return {owner:match[1],repo:match[2],...match[3]?{number:Number(match[3])}:{}};
}

/** `github-drafts/create` arguments, checked. An `agentId` the model sent is dropped: the host stamps the caller's own.
 * Each write takes exactly what it writes: a title, body and optional labels for a new Issue, a body for a comment,
 * labels to add or remove, nothing else to close or reopen. */
export function readGithubDraftCreate(input:unknown):GithubDraftCreate&{owner:string;repoName:string;number?:number} {
 const value={...record(input)};delete value.agentId;
 only(value,['write','target','title','body','labels']);
 if(!GITHUB_WRITES.includes(value.write as GithubWrite))fail(GITHUB_DRAFT_REASONS.write);
 const write=value.write as GithubWrite,target=githubDraftTargetId(write,value.target);
 const takes:Record<GithubWrite,string[]>={'issue.create':['title','body','labels'],'issue.comment':['body'],'labels.add':['labels'],'labels.remove':['labels'],'issue.close':[],'issue.reopen':[]};
 for(const key of ['title','body','labels'])if(value[key]!==undefined&&!takes[write].includes(key))fail(GITHUB_DRAFT_REASONS.invalid);
 const draft:GithubDraftCreate&{owner:string;repoName:string;number?:number}={write,target:value.target as string,owner:target.owner,repoName:target.repo,...target.number?{number:target.number}:{}};
 if(write==='issue.create'){
  draft.title=text(value.title,GITHUB_DRAFT_LIMITS.title,{required:true});
  const body=text(value.body,GITHUB_DRAFT_LIMITS.body,{multiline:true});if(body)draft.body=body;
  const given=labels(value.labels,false);if(given.length)draft.labels=given;
 }
 if(write==='issue.comment')draft.body=text(value.body,GITHUB_DRAFT_LIMITS.body,{multiline:true,required:true});
 if(write==='labels.add'||write==='labels.remove')draft.labels=labels(value.labels,true);
 return draft;
}

/** What GitHub's REST API returned for the target (`GET /repos/{owner}/{repo}` or `…/issues/{number}`), as a target;
 * null when it is not the one asked for. */
export function githubDraftTarget(kind:'repository'|'issue',value:unknown,expected:{owner:string;repo:string;number?:number}):GithubDraftTarget|null {
 const v=record(value),name=`${expected.owner}/${expected.repo}`.toLowerCase();
 if(kind==='repository'){
  if(typeof v.full_name!=='string'||v.full_name.toLowerCase()!==name||!instant(v.updated_at))return null;
  const url=typeof v.html_url==='string'&&v.html_url.toLowerCase()===`https://github.com/${name}`?v.html_url:`https://github.com/${v.full_name}`;
  return {kind:'repository',state:v.archived===true||v.disabled===true?'archived':'active',updatedAt:v.updated_at,title:[...v.full_name].slice(0,GITHUB_DRAFT_LIMITS.title).join(''),url};
 }
 if(v.number!==expected.number||(v.state!=='open'&&v.state!=='closed')||!instant(v.updated_at)||typeof v.title!=='string')return null;
 const pull=v.pull_request!==undefined&&v.pull_request!==null;
 const web=typeof v.html_url==='string'?v.html_url:'',prefix=`https://github.com/${name}/${pull?'pull':'issues'}/${expected.number}`;
 if(web.toLowerCase()!==prefix)return null;
 return {kind:pull?'pull request':'issue',state:v.state,updatedAt:v.updated_at,title:[...v.title].slice(0,GITHUB_DRAFT_LIMITS.title).join(''),url:web};
}

/** Whether a draft still waits on the person. */
export const githubDraftPending=(draft:GithubDraft)=>draft.status==='pending';

/** A new draft from `agentId` (the caller's own, from its token), with the target as the host just read it. Refused
 * when the input is not valid, the write does not fit the target (closing a pull request, closing a closed Issue,
 * anything in an archived repository), or this Agent already has GITHUB_DRAFT_LIMITS.pendingPerAgent pending. */
export function makeGithubDraft(drafts:readonly GithubDraft[],agentId:string,input:unknown,target:GithubDraftTarget,id:string,now:string):GithubDraft {
 if(!AGENT_ID_PATTERN.test(agentId)||!GITHUB_DRAFT_ID_PATTERN.test(id)||!instant(now))fail(GITHUB_DRAFT_REASONS.invalid);
 const create=readGithubDraftCreate(input);
 if(drafts.filter(draft=>draft.agentId===agentId&&githubDraftPending(draft)).length>=GITHUB_DRAFT_LIMITS.pendingPerAgent)fail(GITHUB_DRAFT_REASONS.full);
 if(drafts.some(draft=>draft.id===id))fail(GITHUB_DRAFT_REASONS.invalid);
 if((create.write==='issue.create')!==(target.kind==='repository'))fail(GITHUB_DRAFT_REASONS.invalid);
 if(target.kind==='repository'&&target.state!=='active')fail(GITHUB_DRAFT_REASONS.archived);
 if((create.write==='issue.close'||create.write==='issue.reopen')&&target.kind!=='issue')fail(GITHUB_DRAFT_REASONS.pull);
 if(create.write==='issue.close'&&target.state!=='open')fail(GITHUB_DRAFT_REASONS.alreadyClosed);
 if(create.write==='issue.reopen'&&target.state!=='closed')fail(GITHUB_DRAFT_REASONS.alreadyOpen);
 return {id,agentId,write:create.write,repo:`${create.owner}/${create.repoName}`,...create.number?{number:create.number}:{},
  ...create.title?{title:create.title}:{},...create.body?{body:create.body}:{},...create.labels?{labels:create.labels}:{},
  target:{...target},status:'pending',createdAt:now,updatedAt:now};
}

/** Approve's check: why the target as it is now (null: gone) is not the one the draft was made against, or '' when it
 * is the same. An Issue or pull request must have the same state and updatedAt; a repository must still exist and not
 * be archived (its updatedAt moves with stars and settings, so it is not compared). */
export function githubDraftChange(draft:GithubDraft,now:GithubDraftTarget|null):string {
 if(!now||now.kind!==draft.target.kind)return GITHUB_DRAFT_STALE.gone;
 if(now.state!==draft.target.state)return GITHUB_DRAFT_STALE.state(draft.target.state,now.state);
 if(now.kind!=='repository'&&now.updatedAt!==draft.target.updatedAt)return GITHUB_DRAFT_STALE.updated;
 return '';
}

/** The read Approve makes again, and the one a draft is made with: GitHub REST paths under the API's root. */
export function githubDraftReadPath(write:GithubWrite,target:{owner:string;repo:string;number?:number}):string {
 const repo=`/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
 return write==='issue.create'?repo:`${repo}/issues/${target.number}`;
}
export function githubDraftTargetParts(draft:GithubDraft):{owner:string;repo:string;number?:number} {
 const [owner,repo]=draft.repo.split('/');
 return {owner,repo,...draft.number?{number:draft.number}:{}};
}
/** The requests one approved draft makes, in order, each once. `accept` lists the statuses that count as done (removing
 * a label that is no longer there is done). `result` names which answer's `html_url` is what the draft made. */
export type GithubWriteRequest={method:'POST'|'PATCH'|'DELETE';path:string;body?:Record<string,unknown>;accept:number[]};
export function githubDraftRequests(draft:GithubDraft):{requests:GithubWriteRequest[];result:'response'|'target'} {
 const parts=githubDraftTargetParts(draft),repo=githubDraftReadPath('issue.create',parts),issue=`${repo}/issues/${draft.number}`;
 switch(draft.write){
  case 'issue.create':return {requests:[{method:'POST',path:`${repo}/issues`,body:{title:draft.title,...draft.body?{body:draft.body}:{},...draft.labels?.length?{labels:draft.labels}:{}},accept:[201]}],result:'response'};
  case 'issue.comment':return {requests:[{method:'POST',path:`${issue}/comments`,body:{body:draft.body},accept:[201]}],result:'response'};
  case 'labels.add':return {requests:[{method:'POST',path:`${issue}/labels`,body:{labels:draft.labels},accept:[200]}],result:'target'};
  case 'labels.remove':return {requests:(draft.labels??[]).map(label=>({method:'DELETE' as const,path:`${issue}/labels/${encodeURIComponent(label)}`,accept:[200,204,404]})),result:'target'};
  case 'issue.close':return {requests:[{method:'PATCH',path:issue,body:{state:'closed',state_reason:'completed'},accept:[200]}],result:'target'};
  case 'issue.reopen':return {requests:[{method:'PATCH',path:issue,body:{state:'open'},accept:[200]}],result:'target'};
 }
}
/** What the answers to an approved draft's requests (in order, as many as were made) come to: `written`, `failed` with
 * GitHub's words, or, when labels.remove removed some labels and GitHub refused others, `written` with a reason naming
 * both. Each label is its own request, so a refusal does not undo the removals before it. */
export function githubDraftOutcome(draft:GithubDraft,answers:readonly {status:number;message?:string}[]):{status:'written'|'failed';reason?:string} {
 const {requests}=githubDraftRequests(draft);
 const said=(answer:{status:number;message?:string})=>{
  const words=typeof answer.message==='string'?answer.message.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200):'';
  return `${answer.status}${words?': '+words:''}`;
 };
 const refused=answers.flatMap((answer,i)=>requests[i]&&!requests[i].accept.includes(answer.status)?[{i,answer}]:[]);
 if(!refused.length&&answers.length===requests.length)return {status:'written'};
 const first=refused[0];
 if(draft.write==='labels.remove'&&first){
  const labels=draft.labels??[],failed=new Set(refused.map(r=>r.i));
  const removed=labels.filter((_,i)=>i<answers.length&&!failed.has(i)),kept=labels.filter((_,i)=>failed.has(i));
  if(removed.length)return {status:'written',reason:`Removed ${removed.join(', ')}. GitHub refused removing ${kept.join(', ')} (${said(first.answer)}), so ${kept.length===1?'it is':'they are'} still there.`};
 }
 return {status:'failed',reason:`GitHub refused the write (${first?said(first.answer):'no answer'}).`};
}

/** issue.create: the draft marked as being written, saved before the request is made. */
export function startGithubDraftWrite(draft:GithubDraft,now:string):GithubDraft {
 if(!githubDraftPending(draft))fail(GITHUB_DRAFT_REASONS.settled);
 return {...draft,writeStartedAt:now,updatedAt:now};
}
/** How long after a create began its Issue is looked for: a write that began is answered within GitHub's timeout. */
const CREATED_WITHIN_MS=10*60_000;
/** A started create Worldlet did not see finish: the repository's Issues updated since a minute before it began,
 * newest first, to look for it in (`githubDraftCreatedUrl`) instead of posting it again. */
export function githubDraftCreatedPath(draft:GithubDraft):string {
 const since=new Date(Date.parse(draft.writeStartedAt??draft.updatedAt)-60_000).toISOString();
 return `${githubDraftReadPath('issue.create',githubDraftTargetParts(draft))}/issues?state=all&sort=created&direction=desc&per_page=50&since=${encodeURIComponent(since)}`;
}
/** The link of the Issue a started create made, from GitHub's answer to githubDraftCreatedPath: one with exactly the
 * draft's title, made by the GitHub App `appId` within minutes of the write beginning; '' when there is none. */
export function githubDraftCreatedUrl(draft:GithubDraft,answer:unknown,appId:string):string {
 const started=Date.parse(draft.writeStartedAt??''),prefix=`https://github.com/${draft.repo.toLowerCase()}/issues/`;
 if(!Number.isFinite(started)||!Array.isArray(answer))return '';
 for(const value of answer){
  const v=record(value),app=record(v.performed_via_github_app),user=record(v.user),made=Date.parse(String(v.created_at??''));
  const byApp=v.performed_via_github_app?String(app.id)===appId:user.type==='Bot';
  if(v.pull_request===undefined&&v.title===draft.title&&byApp&&made>=started-60_000&&made<=started+CREATED_WITHIN_MS
   &&typeof v.html_url==='string'&&v.html_url.toLowerCase().startsWith(prefix))return v.html_url;
 }
 return '';
}

/** The written result's link: what GitHub answered with (a new Issue or comment), or else the target. */
export function githubDraftResultUrl(draft:GithubDraft,answer:unknown):string {
 const web=record(answer).html_url;
 return typeof web==='string'&&web.toLowerCase().startsWith(`https://github.com/${draft.repo.toLowerCase()}/`)?web:draft.target.url;
}

/** The draft settled: written (with its result, and what part was not written), stale, failed or unknown (with why),
 * or dismissed. Only a pending draft settles. */
export function settleGithubDraft(draft:GithubDraft|null|undefined,status:Exclude<GithubDraftStatus,'pending'>,now:string,detail:{resultUrl?:string;reason?:string}={}):GithubDraft {
 if(!draft)return fail(GITHUB_DRAFT_REASONS.missing);
 if(!githubDraftPending(draft))fail(GITHUB_DRAFT_REASONS.settled);
 const next:GithubDraft={...draft,status,updatedAt:now,settledAt:now};
 if(status==='written'&&detail.resultUrl)next.resultUrl=detail.resultUrl;
 if(status!=='dismissed'&&detail.reason)next.reason=[...detail.reason].slice(0,500).join('');
 return next;
}

/** `github-drafts/read`: the caller's own drafts, newest first, optionally of one status or the IDs it names. */
export function readGithubDrafts(drafts:readonly GithubDraft[],agentId:string,input:unknown={}):GithubDraft[] {
 const value=record(input);only(value,['status','ids']);
 if(value.status!==undefined&&!GITHUB_DRAFT_STATUSES.includes(value.status as GithubDraftStatus))fail(GITHUB_DRAFT_REASONS.invalid);
 if(value.ids!==undefined&&(!Array.isArray(value.ids)||value.ids.length>GITHUB_DRAFT_LIMITS.read||value.ids.some(id=>typeof id!=='string'||!GITHUB_DRAFT_ID_PATTERN.test(id))))fail(GITHUB_DRAFT_REASONS.invalid);
 const ids=(value.ids as string[]|undefined)??[];
 return drafts.filter(draft=>draft.agentId===agentId&&(value.status===undefined||draft.status===value.status)&&(!ids.length||ids.includes(draft.id)))
  .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,GITHUB_DRAFT_LIMITS.read);
}

/** A stored draft, checked; null when it is not one. */
export function readStoredGithubDraft(value:unknown):GithubDraft|null {
 const v=record(value),t=record(v.target);
 if(typeof v.id!=='string'||!GITHUB_DRAFT_ID_PATTERN.test(v.id)||typeof v.agentId!=='string'||!AGENT_ID_PATTERN.test(v.agentId)||!GITHUB_WRITES.includes(v.write as GithubWrite)
  ||typeof v.repo!=='string'||!REPO.test(v.repo)||!GITHUB_DRAFT_STATUSES.includes(v.status as GithubDraftStatus)||!instant(v.createdAt)||!instant(v.updatedAt)
  ||!['repository','issue','pull request'].includes(t.kind as string)||typeof t.state!=='string'||!instant(t.updatedAt)||typeof t.title!=='string'||typeof t.url!=='string')return null;
 if(v.write!=='issue.create'&&!(Number.isInteger(v.number)&&(v.number as number)>0))return null;
 const draft:GithubDraft={id:v.id,agentId:v.agentId,write:v.write as GithubWrite,repo:v.repo,
  target:{kind:t.kind as GithubDraftTarget['kind'],state:t.state,updatedAt:t.updatedAt,title:t.title,url:t.url},
  status:v.status as GithubDraftStatus,createdAt:v.createdAt,updatedAt:v.updatedAt};
 if(Number.isInteger(v.number))draft.number=v.number as number;
 if(typeof v.title==='string')draft.title=v.title;
 if(typeof v.body==='string')draft.body=v.body;
 if(Array.isArray(v.labels))draft.labels=v.labels.filter((l):l is string=>typeof l==='string').slice(0,GITHUB_DRAFT_LIMITS.labels);
 if(typeof v.resultUrl==='string')draft.resultUrl=v.resultUrl;
 if(typeof v.reason==='string')draft.reason=v.reason;
 if(instant(v.settledAt))draft.settledAt=v.settledAt;
 if(instant(v.writeStartedAt))draft.writeStartedAt=v.writeStartedAt;
 return draft;
}

/** What the draft does, in a line the card leads with: "Comment on example/app#12". */
export function githubDraftHeadline(draft:GithubDraft):string {
 const at=draft.number?`${draft.repo}#${draft.number}`:draft.repo;
 switch(draft.write){
  case 'issue.create':return `New Issue in ${at}`;
  case 'issue.comment':return `Comment on ${at}`;
  case 'labels.add':return `Add labels to ${at}`;
  case 'labels.remove':return `Remove labels from ${at}`;
  case 'issue.close':return `Close ${at}`;
  case 'issue.reopen':return `Reopen ${at}`;
 }
}
/** Exactly what will be written, as the card shows it. */
export function githubDraftText(draft:GithubDraft):string {
 const list=(draft.labels??[]).join(', ');
 switch(draft.write){
  case 'issue.create':return [draft.title,draft.body,list?'Labels: '+list:''].filter(Boolean).join('\n\n');
  case 'issue.comment':return draft.body??'';
  case 'labels.add':return 'Add: '+list;
  case 'labels.remove':return 'Remove: '+list;
  case 'issue.close':return `Close “${draft.target.title}” as completed.`;
  case 'issue.reopen':return `Reopen “${draft.target.title}”.`;
 }
}

/** The World item ID of a draft's Attention card. */
export const githubDraftItemId=(draftId:string)=>'ghd-'+draftId;
const ITEM_STATUS:Record<GithubDraftStatus,'open'|'done'|'dismissed'>={pending:'open',written:'done',stale:'dismissed',failed:'dismissed',unknown:'dismissed',dismissed:'dismissed'};
/** The draft as an Attention task from the host's own provider `agents`, written with no model: it names the Agent, the
 * repository and target, the exact text and a link to the target, and carries the draft's ID so its card approves this
 * draft and no other. */
export function githubDraftAttentionItem(draft:GithubDraft,agentName:string):WorldItem {
 let name=draft.agentId;try{name=text(agentName,80)||draft.agentId;}catch{}
 const headline=githubDraftHeadline(draft),body=[...githubDraftText(draft)].slice(0,1200).join('');
 const summary=`${name} wants to write this on GitHub as your GitHub App. Nothing is written until you approve it.`;
 return {id:githubDraftItemId(draft.id),provider:AGENT_ASK_PROVIDER,kind:'task',status:ITEM_STATUS[draft.status],title:headline,context:body,summary,
  reason:[...(name+' drafted a GitHub change')].slice(0,56).join(''),attentionContentVersion:1,
  attentionReason:[...summary].slice(0,600).join(''),
  sources:[{provider:AGENT_ASK_PROVIDER,id:draft.id,quote:[...(draft.target.title||headline)].slice(0,1000).join(''),url:draft.resultUrl??draft.target.url}],
  agentId:draft.agentId,agentName:name,githubDraftId:draft.id,githubDraftStatus:draft.status,githubDraftRepo:draft.repo,githubDraftWrite:draft.write,
  githubDraftUrl:draft.resultUrl??draft.target.url,githubDraftText:githubDraftText(draft),...draft.reason?{githubDraftReason:draft.reason}:{},createdAt:draft.createdAt,updatedAt:draft.updatedAt};
}

// The GitHub App the person connected as GitHub's write identity (contracts/github-drafts.ts GithubAppCredentials).

/** The App's settings as the person entered them, checked; the error never repeats what was entered. */
export function readGithubApp(input:unknown):GithubAppCredentials {
 const v=record(input);
 const appId=typeof v.appId==='string'?v.appId.trim():typeof v.appId==='number'?String(v.appId):'';
 const installationId=typeof v.installationId==='string'?v.installationId.trim():typeof v.installationId==='number'?String(v.installationId):'';
 const privateKey=typeof v.privateKey==='string'?v.privateKey.replace(/\r\n?/g,'\n').trim():'';
 if(!/^[1-9][0-9]{0,11}$/.test(appId)||!/^[1-9][0-9]{0,14}$/.test(installationId)
  ||!/^-----BEGIN (?:RSA )?PRIVATE KEY-----\n[A-Za-z0-9+/=\n]{100,8000}\n-----END (?:RSA )?PRIVATE KEY-----$/.test(privateKey))fail(GITHUB_DRAFT_REASONS.app);
 return {appId,installationId,privateKey};
}
/** A stored App, or null. */
export function readStoredGithubApp(value:string|null):GithubAppCredentials|null {
 if(!value)return null;
 try{return readGithubApp(JSON.parse(value));}catch{return null;}
}
/** The claims of the JSON Web Token the App signs (RS256) to ask GitHub for an installation token: issued a minute
 * early for clock drift, valid for nine minutes (GitHub allows ten). `now` is in seconds. */
export function githubAppJwtClaims(appId:string,now:number):{iat:number;exp:number;iss:string} {
 return {iat:Math.floor(now)-60,exp:Math.floor(now)+540,iss:appId};
}
