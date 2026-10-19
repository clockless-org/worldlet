import {SERVICE_DRAFT_LIMITS,SERVICE_DRAFT_PROVIDERS,SERVICE_DRAFT_STATUSES,SERVICE_DRAFT_TITLES,SERVICE_WRITES,type ServiceDraft,type ServiceDraftCreate,type ServiceDraftProvider,type ServiceDraftStatus,type ServiceDraftTarget,type ServiceWrite} from '../../contracts/service-drafts.ts';
import {AGENT_ASK_PROVIDER} from '../../contracts/agent-asks.ts';
import {AGENT_ID_PATTERN} from '../../contracts/agent-identity.ts';
import type {WorldItem} from '../../contracts/world.ts';
import {notionFingerprint,notionPage,notionPageId,notionPayload,notionWriteArgs,type McpSession,type PosthogSettings} from '../../context/sources/index.ts';
import {looksSecret} from './agent-profile.ts';

/** PostHog and Notion drafts (contracts/service-drafts.ts, agent/gate/GRANTS.md#posthog-and-notion-drafts), the same
 * rules as GitHub drafts (github-drafts.ts). Hosts supply the stored drafts, the calling Agent's ID (from its token),
 * new IDs, the clock and the World's own connection to each Service: a PostHog request function over the person's
 * personal API key (its settings, never the key) and a Notion MCP session. Every refusal throws an Error whose message
 * the Agent or the page is shown, and never repeats a credential. */

export const SERVICE_DRAFT_REASONS=Object.freeze({
 invalid:'This draft is not valid.',
 write:(provider:ServiceDraftProvider)=>`Choose what to write: ${SERVICE_WRITES[provider].join(' or ')}.`,
 flag:'Name the feature flag by its key or its ID.',
 page:'Name the Notion page (or database) by its URL or ID.',
 date:'Give the annotation\'s date and time as ISO 8601, such as 2026-10-15T12:00:00Z.',
 secret:'Drafts may not hold passwords, tokens or keys. Name the thing instead.',
 control:'Drafts may not hold control characters.',
 full:`This Agent already has ${SERVICE_DRAFT_LIMITS.pendingPerAgent} PostHog and Notion drafts waiting. Wait for the person to approve or dismiss some first.`,
 already:(state:string)=>`This feature flag is already ${state}.`,
 database:'A database takes new pages, not paragraphs. Append to a page instead.',
 missing:'No such draft.',
 settled:'This draft is already settled.',
});
/** Why Approve wrote nothing: the target is not as it was when the Agent drafted. */
export const SERVICE_DRAFT_STALE=Object.freeze({
 gone:(provider:ServiceDraftProvider)=>`It is gone from ${SERVICE_DRAFT_TITLES[provider]} (deleted, moved or no longer visible to your connection), so nothing was written.`,
 state:(was:string,now:string)=>`It is ${now} now; it was ${was} when this was drafted, so nothing was written.`,
 updated:(provider:ServiceDraftProvider)=>`It changed in ${SERVICE_DRAFT_TITLES[provider]} after this was drafted, so nothing was written. Ask the Agent to read it again and draft anew.`,
});
/** The host's own words for a Service that could not be asked: never a message that could carry a request. */
export const SERVICE_DRAFT_MESSAGES=Object.freeze({
 posthogMissing:'Connect PostHog first. The person connects it in Settings › Connectors.',
 notionMissing:'Connect Notion first. The person connects it in Settings › Connectors.',
 posthogKey:'PostHog no longer accepts its personal API key. The person connects PostHog again with a new key.',
 posthogRead:'This PostHog key cannot read that. Check that it has read access to the project and its feature flags.',
 notFound:(provider:ServiceDraftProvider)=>`Your ${SERVICE_DRAFT_TITLES[provider]} connection cannot see this. Check the name and that the connection can reach it.`,
 unreadable:(provider:ServiceDraftProvider)=>`${SERVICE_DRAFT_TITLES[provider]} could not read this right now. Try again in a moment.`,
 lost:(provider:ServiceDraftProvider)=>`${SERVICE_DRAFT_TITLES[provider]} did not answer the write, so it may or may not have been made. Check there before drafting it again.`,
 busy:'This draft is already being written.',
});

/** A draft ID: host-made, file-name safe (the same shape as a GitHub draft's). */
export const SERVICE_DRAFT_ID_PATTERN=/^[a-z0-9][a-z0-9-]{7,63}$/;
const FLAG_ID=/^[1-9][0-9]{0,11}$/,FLAG_KEY=/^[A-Za-z0-9_-]{1,400}$/,NOTION_ID=/^[a-f0-9]{32}$/;
// C0 controls (except tab and line breaks, allowed in multi-line text only), DEL, C1 controls, and the bidirectional
// overrides that can make a card read differently from what it holds.
const CONTROL=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const LINE_BREAK=/[\t\r\n]/;
const record=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const instant=(value:unknown):value is string=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const cut=(value:string,limit:number)=>[...value].slice(0,limit).join('');
const fail=(reason:string):never=>{throw new Error(reason);};
const only=(value:Record<string,unknown>,keys:string[])=>{for(const key of Object.keys(value))if(!keys.includes(key))fail(SERVICE_DRAFT_REASONS.invalid);};
const isProvider=(value:unknown):value is ServiceDraftProvider=>SERVICE_DRAFT_PROVIDERS.includes(value as ServiceDraftProvider);

function text(value:unknown,limit:number,{multiline=false,required=false}={}):string {
 if(value===undefined||value===null||value===''){if(required)fail(SERVICE_DRAFT_REASONS.invalid);return '';}
 if(typeof value!=='string')return fail(SERVICE_DRAFT_REASONS.invalid);
 if(CONTROL.test(value)||!multiline&&LINE_BREAK.test(value))fail(SERVICE_DRAFT_REASONS.control);
 const clean=value.replace(/\r\n?/g,'\n').trim();
 if(required&&!clean||[...clean].length>limit)fail(SERVICE_DRAFT_REASONS.invalid);
 if(looksSecret(clean))fail(SERVICE_DRAFT_REASONS.secret);
 return clean;
}

/** A checked `<provider>-drafts/create`: what to write and, parsed, what it writes on. */
export type ServiceDraftInput=ServiceDraftCreate&{flag?:{id:string}|{key:string};page?:string};
/** `<provider>-drafts/create` arguments, checked. An `agentId` the model sent is dropped: the host stamps the caller's
 * own; `provider` is the gateway's. Each write takes exactly what it writes. */
export function readServiceDraftCreate(input:unknown):ServiceDraftInput {
 const value={...record(input)};delete value.agentId;
 only(value,['provider','write','target','content','date','scope','active','title','body']);
 if(!isProvider(value.provider))fail(SERVICE_DRAFT_REASONS.invalid);
 const provider=value.provider as ServiceDraftProvider;
 if(!SERVICE_WRITES[provider].includes(value.write))fail(SERVICE_DRAFT_REASONS.write(provider));
 const write=value.write as ServiceWrite;
 const takes:Record<ServiceWrite,string[]>={'annotation.create':['content','date','scope'],'flag.set':['target','active'],'page.create':['target','title','body'],'page.append':['target','body']};
 for(const key of ['target','content','date','scope','active','title','body'])if(value[key]!==undefined&&!takes[write].includes(key))fail(SERVICE_DRAFT_REASONS.invalid);
 const draft:ServiceDraftInput={provider,write};
 if(write==='annotation.create'){
  draft.content=text(value.content,SERVICE_DRAFT_LIMITS.content,{required:true});
  if(!instant(value.date))fail(SERVICE_DRAFT_REASONS.date);
  draft.date=new Date(value.date).toISOString();
  if(value.scope!==undefined&&value.scope!=='project'&&value.scope!=='organization')fail(SERVICE_DRAFT_REASONS.invalid);
  draft.scope=value.scope??'project';
 }
 if(write==='flag.set'){
  const target=typeof value.target==='string'?value.target.trim():typeof value.target==='number'?String(value.target):'';
  if(!FLAG_ID.test(target)&&!FLAG_KEY.test(target))fail(SERVICE_DRAFT_REASONS.flag);
  if(typeof value.active!=='boolean')fail(SERVICE_DRAFT_REASONS.invalid);
  Object.assign(draft,{target,active:value.active,flag:FLAG_ID.test(target)?{id:target}:{key:target}});
 }
 if(write==='page.create'||write==='page.append'){
  let page='';try{page=notionPageId(value.target);}catch{fail(SERVICE_DRAFT_REASONS.page);}
  draft.target=page;draft.page=page;
  if(write==='page.create')draft.title=text(value.title,SERVICE_DRAFT_LIMITS.title,{required:true});
  draft.body=text(value.body,SERVICE_DRAFT_LIMITS.body,{multiline:true,required:write==='page.append'});
  if(!draft.body)delete draft.body;
 }
 return draft;
}

// Reading the target, as the host's connection to the Service. -------------------------------------------------------

/** One PostHog request over the person's personal API key, made by the host to the one address they gave: the status
 * and the answer's JSON. It throws only when PostHog did not answer. */
export type PosthogRequest=(method:'GET'|'POST'|'PATCH',path:string,body?:Record<string,unknown>)=>Promise<{status:number;json:unknown}>;
/** The World's own connection to each Service, as far as a draft needs it; absent when not connected. */
export interface ServiceDraftIO {posthog?:{settings:PosthogSettings;request:PosthogRequest};notion?:McpSession}

const NOTION_TIMEOUT=45;
const posthogWeb=(settings:PosthogSettings)=>`${settings.host}/project/${settings.project}`;
function posthogFlag(value:unknown,settings:PosthogSettings,expected:{id:string}|{key:string}):ServiceDraftTarget|null {
 const v=record(value);
 if(!Number.isInteger(v.id)||v.id<=0||typeof v.key!=='string'||v.deleted===true||typeof v.active!=='boolean')return null;
 if('id' in expected?String(v.id)!==expected.id:v.key!==expected.key)return null;
 return {kind:'feature flag',id:String(v.id),state:v.active?'on':'off',updatedAt:typeof v.updated_at==='string'?v.updated_at:'',title:cut(v.key,SERVICE_DRAFT_LIMITS.title),url:`${posthogWeb(settings)}/feature_flags/${v.id}`};
}
/** A Notion target from `notion-fetch`'s answer: the page or database, its title and its last edit (or, with none, a
 * fingerprint of what it holds). */
async function notionTarget(raw:Record<string,any>,id:string):Promise<ServiceDraftTarget> {
 const page=notionPage(raw,id);
 const kind=page.kind==='database'?'database':'page';
 const updatedAt=typeof page.lastEdited==='string'&&page.lastEdited?page.lastEdited:'sha256:'+await notionFingerprint(raw,id);
 return {kind,id,state:'active',updatedAt,title:cut(String(page.title||'Untitled'),SERVICE_DRAFT_LIMITS.title),url:'https://www.notion.so/'+id};
}
async function notionFetch(session:McpSession,id:string):Promise<Record<string,any>|null> {
 const answer=await session.callTool('notion-fetch',{id},NOTION_TIMEOUT);
 // Notion answers an error for a page that is gone or not shared with the connection.
 if(answer?.isError)return null;
 try{return notionPayload(answer);}catch{return null;}
}

/** The target as it is now, read through the World's connection; null when it is gone (deleted, moved, or the
 * connection can no longer see it). Throws, with the host's own words, when the Service is not connected or could not
 * be read. `raw` is Notion's own answer, which a database's new page needs. */
export async function readServiceDraftTarget(io:ServiceDraftIO,draft:{provider:ServiceDraftProvider;write:ServiceWrite;target?:string;flag?:{id:string}|{key:string};page?:string}):Promise<{target:ServiceDraftTarget|null;raw?:Record<string,any>}> {
 if(draft.provider==='posthog'){
  const posthog=io.posthog;
  if(!posthog)return fail(SERVICE_DRAFT_MESSAGES.posthogMissing);
  const {settings,request}=posthog,base=`/api/projects/${settings.project}`;
  const checked=(answer:{status:number})=>{
   if(answer.status===401)fail(SERVICE_DRAFT_MESSAGES.posthogKey);
   if(answer.status===403)fail(SERVICE_DRAFT_MESSAGES.posthogRead);
   return answer.status===404||answer.status===410?false:answer.status===200?true:fail(SERVICE_DRAFT_MESSAGES.unreadable('posthog'));
  };
  if(draft.write==='annotation.create'){
   const answer=await request('GET',`${base}/`);
   if(!checked(answer))return {target:null};
   const v=record(answer.json);
   if(String(v.id)!==settings.project)return {target:null};
   return {target:{kind:'project',id:settings.project,state:'active',updatedAt:'',title:cut(typeof v.name==='string'&&v.name?v.name:`Project ${settings.project}`,SERVICE_DRAFT_LIMITS.title),url:`${posthogWeb(settings)}/data-management/annotations`}};
  }
  const flag=draft.flag??(FLAG_ID.test(draft.target??'')?{id:draft.target!}:{key:draft.target??''});
  if('id' in flag){
   const answer=await request('GET',`${base}/feature_flags/${flag.id}/`);
   return {target:checked(answer)?posthogFlag(answer.json,settings,flag):null};
  }
  // By key: PostHog's list, searched by the key, and the one flag whose key is exactly it.
  const answer=await request('GET',`${base}/feature_flags/?limit=100&search=${encodeURIComponent(flag.key)}`);
  if(!checked(answer))return {target:null};
  const rows=Array.isArray(record(answer.json).results)?record(answer.json).results as unknown[]:[];
  for(const row of rows){const found=posthogFlag(row,settings,flag);if(found)return {target:found};}
  return {target:null};
 }
 const session=io.notion;
 if(!session)return fail(SERVICE_DRAFT_MESSAGES.notionMissing);
 const id=draft.page??draft.target??'';
 if(!NOTION_ID.test(id))return fail(SERVICE_DRAFT_REASONS.page);
 const raw=await notionFetch(session,id);
 if(!raw)return {target:null};
 try{return {target:await notionTarget(raw,id),raw};}catch{return {target:null};}
}

/** Whether a draft still waits on the person. */
export const serviceDraftPending=(draft:ServiceDraft)=>draft.status==='pending';

/** A new draft from `agentId` (the caller's own, from its token), with the target as the host just read it. Refused
 * when the input is not valid, the write does not fit the target (a flag already as asked, paragraphs for a database),
 * or this Agent already has SERVICE_DRAFT_LIMITS.pendingPerAgent pending. */
export function makeServiceDraft(drafts:readonly ServiceDraft[],agentId:string,input:unknown,target:ServiceDraftTarget,id:string,now:string):ServiceDraft {
 if(!AGENT_ID_PATTERN.test(agentId)||!SERVICE_DRAFT_ID_PATTERN.test(id)||!instant(now))fail(SERVICE_DRAFT_REASONS.invalid);
 const create=readServiceDraftCreate(input);
 if(drafts.filter(draft=>draft.agentId===agentId&&serviceDraftPending(draft)).length>=SERVICE_DRAFT_LIMITS.pendingPerAgent)fail(SERVICE_DRAFT_REASONS.full);
 if(drafts.some(draft=>draft.id===id))fail(SERVICE_DRAFT_REASONS.invalid);
 const fits:Record<ServiceWrite,ServiceDraftTarget['kind'][]>={'annotation.create':['project'],'flag.set':['feature flag'],'page.create':['page','database'],'page.append':['page','database']};
 if(!fits[create.write].includes(target.kind))fail(SERVICE_DRAFT_REASONS.invalid);
 if(create.write==='page.append'&&target.kind==='database')fail(SERVICE_DRAFT_REASONS.database);
 if(create.write==='flag.set'&&target.state===(create.active?'on':'off'))fail(SERVICE_DRAFT_REASONS.already(target.state));
 const draft:ServiceDraft={id,agentId,provider:create.provider,write:create.write,target:{...target},status:'pending',createdAt:now,updatedAt:now};
 for(const key of ['content','date','scope','active','title','body'] as const)if(create[key]!==undefined)(draft as unknown as Record<string,unknown>)[key]=create[key];
 return draft;
}

/** Approve's check: why the target as it is now (null: gone) is not the one the draft was made against, or '' when it
 * is the same. A feature flag must be in the same state with the same updated_at; a page appended to must not have been
 * edited since. A project, or the page or database a new page goes in, must only still be there. */
export function serviceDraftChange(draft:ServiceDraft,now:ServiceDraftTarget|null):string {
 if(!now||now.kind!==draft.target.kind||now.id!==draft.target.id)return SERVICE_DRAFT_STALE.gone(draft.provider);
 if(now.state!==draft.target.state)return SERVICE_DRAFT_STALE.state(draft.target.state,now.state);
 if((draft.write==='flag.set'||draft.write==='page.append')&&now.updatedAt!==draft.target.updatedAt)return SERVICE_DRAFT_STALE.updated(draft.provider);
 return '';
}

const scopeName:Partial<Record<ServiceWrite,string>>={'annotation.create':'annotation:write','flag.set':'feature_flag:write'};
/** Why PostHog refused a write, in plain words: a key without the write scope it needs says which. */
export function posthogWriteRefusal(write:ServiceWrite,status:number,answer:unknown):string {
 const said=typeof record(answer).detail==='string'?cut(String(record(answer).detail).replace(/[\u0000-\u001f\u007f]/g,' ').trim(),200):'';
 if(status===401)return SERVICE_DRAFT_MESSAGES.posthogKey;
 if(status===403)return `PostHog refused the write: the personal API key needs the ${scopeName[write]} scope. The person adds it to the key in PostHog (or makes a new key with it) and connects PostHog again.`;
 return `PostHog refused the write (${status}${said?': '+said:''}).`;
}

/** The written result: `written` with the link to what was made or changed, or `failed` with why. Throws (nothing was
 * sent) when the Service could not be asked; a write that was sent and not answered is `failed` as possibly made. */
export async function writeServiceDraft(io:ServiceDraftIO,draft:ServiceDraft,raw?:Record<string,any>):Promise<{status:'written';url:string}|{status:'failed';reason:string}> {
 if(draft.provider==='posthog'){
  const posthog=io.posthog;
  if(!posthog)return fail(SERVICE_DRAFT_MESSAGES.posthogMissing);
  const {settings,request}=posthog,base=`/api/projects/${settings.project}`;
  const step=draft.write==='annotation.create'
   ?{method:'POST' as const,path:`${base}/annotations/`,body:{content:draft.content,date_marker:draft.date,scope:draft.scope??'project'},accept:201}
   :{method:'PATCH' as const,path:`${base}/feature_flags/${draft.target.id}/`,body:{active:draft.active},accept:200};
  let answer;
  try{answer=await request(step.method,step.path,step.body);}catch{return {status:'failed',reason:SERVICE_DRAFT_MESSAGES.lost('posthog')};}
  if(answer.status!==step.accept&&!(step.accept===201&&answer.status===200))return {status:'failed',reason:posthogWriteRefusal(draft.write,answer.status,answer.json)};
  return {status:'written',url:draft.target.url};
 }
 const session=io.notion;
 if(!session)return fail(SERVICE_DRAFT_MESSAGES.notionMissing);
 const body=draft.body??'';
 let tool:string,candidates:unknown[];
 if(draft.write==='page.create'){
  tool='notion-create-pages';
  const page={content:body};
  if(draft.target.kind==='database'){
   // A database's new page goes in its first collection, its title in the collection's title property.
   const text=typeof raw?.text==='string'?raw.text:'';
   const source=/collection:\/\/([a-f0-9-]{32,36})/.exec(text)?.[1];
   let titleKey='title';
   try{const state=/<data-source-state>([^]*?)<\/data-source-state>/.exec(text);const schema=state?record(record(JSON.parse(state[1])).schema):{};
    titleKey=Object.entries(schema).find(([,prop])=>record(prop).type==='title')?.[0]??'title';}catch{}
   const pages=[{properties:{[titleKey]:draft.title},...page}];
   candidates=[...source?[{parent:{data_source_id:source},pages,allow_async:false},{parent:{data_source_id:source},pages}]:[],{parent:{database_id:draft.target.id},pages,allow_async:false},{parent:{database_id:draft.target.id},pages}];
  }else{
   const pages=[{properties:{title:draft.title},...page}];
   candidates=[{parent:{page_id:draft.target.id},pages,allow_async:false},{parent:{page_id:draft.target.id},pages}];
  }
 }else{
  tool='notion-update-page';
  // Append only: never replace a page, apply a template or change properties.
  candidates=[{page_id:draft.target.id,command:'insert_content',new_str:'\n\n'+body,allow_async:false},{page_id:draft.target.id,command:'insert_content',new_str:'\n\n'+body}];
 }
 let args:Record<string,unknown>;
 try{args=await notionWriteArgs(session,tool,candidates);}
 catch(error){return {status:'failed',reason:error instanceof Error&&error.message?cut(error.message,300):'Notion could not take this write.'};}
 let answer;
 try{answer=await session.callTool(tool,args,NOTION_TIMEOUT);}catch{return {status:'failed',reason:SERVICE_DRAFT_MESSAGES.lost('notion')};}
 if(answer?.isError){
  const said=cut((answer.content??[]).map(part=>typeof part?.text==='string'?part.text:'').join(' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim(),200);
  return {status:'failed',reason:`Notion refused the write${said?': '+said:''}. Check that your Notion connection can edit this page.`};
 }
 if(draft.write==='page.append')return {status:'written',url:draft.target.url};
 let url=draft.target.url;
 try{const value=notionPayload(answer),pages=value.pages??value.results;const first=Array.isArray(pages)?record(pages[0]):{};url='https://www.notion.so/'+notionPageId(first.url||first.id);}catch{}
 return {status:'written',url};
}

/** The draft settled: written (with its result), stale or failed (with why), or dismissed. Only a pending draft
 * settles. */
export function settleServiceDraft(draft:ServiceDraft|null|undefined,status:Exclude<ServiceDraftStatus,'pending'>,now:string,detail:{resultUrl?:string;reason?:string}={}):ServiceDraft {
 if(!draft)return fail(SERVICE_DRAFT_REASONS.missing);
 if(!serviceDraftPending(draft))fail(SERVICE_DRAFT_REASONS.settled);
 const next:ServiceDraft={...draft,status,updatedAt:now,settledAt:now};
 if(status==='written'&&detail.resultUrl)next.resultUrl=detail.resultUrl;
 if((status==='stale'||status==='failed')&&detail.reason)next.reason=cut(detail.reason,500);
 return next;
}

/** `<provider>-drafts/read`: the caller's own drafts on that Service, newest first, optionally of one status or the
 * IDs it names. */
export function readServiceDrafts(drafts:readonly ServiceDraft[],agentId:string,provider:ServiceDraftProvider,input:unknown={}):ServiceDraft[] {
 const value=record(input);only(value,['status','ids']);
 if(value.status!==undefined&&!SERVICE_DRAFT_STATUSES.includes(value.status))fail(SERVICE_DRAFT_REASONS.invalid);
 if(value.ids!==undefined&&(!Array.isArray(value.ids)||value.ids.length>SERVICE_DRAFT_LIMITS.read||value.ids.some((id:unknown)=>typeof id!=='string'||!SERVICE_DRAFT_ID_PATTERN.test(id))))fail(SERVICE_DRAFT_REASONS.invalid);
 const ids=(value.ids as string[]|undefined)??[];
 return drafts.filter(draft=>draft.agentId===agentId&&draft.provider===provider&&(value.status===undefined||draft.status===value.status)&&(!ids.length||ids.includes(draft.id)))
  .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,SERVICE_DRAFT_LIMITS.read);
}

/** A stored draft, checked; null when it is not one. */
export function readStoredServiceDraft(value:unknown):ServiceDraft|null {
 const v=record(value),t=record(v.target);
 if(typeof v.id!=='string'||!SERVICE_DRAFT_ID_PATTERN.test(v.id)||typeof v.agentId!=='string'||!AGENT_ID_PATTERN.test(v.agentId)||!isProvider(v.provider)||!SERVICE_WRITES[v.provider as ServiceDraftProvider].includes(v.write)
  ||!SERVICE_DRAFT_STATUSES.includes(v.status)||!instant(v.createdAt)||!instant(v.updatedAt)
  ||!['project','feature flag','page','database'].includes(t.kind)||typeof t.id!=='string'||typeof t.state!=='string'||typeof t.updatedAt!=='string'||typeof t.title!=='string'||typeof t.url!=='string')return null;
 const draft:ServiceDraft={id:v.id,agentId:v.agentId,provider:v.provider,write:v.write,
  target:{kind:t.kind,id:t.id,state:t.state,updatedAt:t.updatedAt,title:t.title,url:t.url},status:v.status,createdAt:v.createdAt,updatedAt:v.updatedAt};
 for(const key of ['content','date','title','body','resultUrl','reason'] as const)if(typeof v[key]==='string')draft[key]=v[key];
 if(v.scope==='project'||v.scope==='organization')draft.scope=v.scope;
 if(typeof v.active==='boolean')draft.active=v.active;
 if(instant(v.settledAt))draft.settledAt=v.settledAt;
 return draft;
}

/** What the draft does, in a line the card leads with: "Turn on the feature flag new-checkout". */
export function serviceDraftHeadline(draft:ServiceDraft):string {
 switch(draft.write){
  case 'annotation.create':return `New PostHog annotation in ${draft.target.title}`;
  case 'flag.set':return `Turn ${draft.active?'on':'off'} the feature flag ${draft.target.title}`;
  case 'page.create':return `New Notion page in ${draft.target.title}`;
  case 'page.append':return `Add to the Notion page ${draft.target.title}`;
 }
}
/** Exactly what will be written, as the card shows it. */
export function serviceDraftText(draft:ServiceDraft):string {
 switch(draft.write){
  case 'annotation.create':return `${draft.content}\n\nMarks ${draft.date}${draft.scope==='organization'?' for the whole organization':''}.`;
  case 'flag.set':return `Turn ${draft.active?'on':'off'} “${draft.target.title}” (it is ${draft.target.state} now).`;
  case 'page.create':return [draft.title,draft.body].filter(Boolean).join('\n\n');
  case 'page.append':return draft.body??'';
 }
}
/** Where it writes, for the card's line "<Agent> drafted this for <where>". */
export const serviceDraftWhere=(draft:ServiceDraft)=>draft.provider==='posthog'?`PostHog · ${draft.target.title}`:`Notion · ${draft.target.title}`;

/** The World item ID of a draft's Attention card. */
export const serviceDraftItemId=(draftId:string)=>'svd-'+draftId;
const ITEM_STATUS:Record<ServiceDraftStatus,'open'|'done'|'dismissed'>={pending:'open',written:'done',stale:'dismissed',failed:'dismissed',dismissed:'dismissed'};
/** The draft as an Attention task from the host's own provider `agents`, written with no model: it names the Agent, the
 * Service and target, the exact text and a link to the target, and carries the draft's ID so its card approves this
 * draft and no other. */
export function serviceDraftAttentionItem(draft:ServiceDraft,agentName:string):WorldItem {
 let name=draft.agentId;try{name=text(agentName,80)||draft.agentId;}catch{}
 const service=SERVICE_DRAFT_TITLES[draft.provider],headline=serviceDraftHeadline(draft),body=cut(serviceDraftText(draft),1200);
 const summary=`${name} wants to write this in ${service} through your ${service} connection. Nothing is written until you approve it.`;
 return {id:serviceDraftItemId(draft.id),provider:AGENT_ASK_PROVIDER,kind:'task',status:ITEM_STATUS[draft.status],title:cut(headline,200),context:body,summary,
  reason:cut(`${name} drafted a ${service} change`,56),attentionContentVersion:1,attentionReason:cut(summary,600),
  sources:[{provider:AGENT_ASK_PROVIDER,id:draft.id,quote:cut(draft.target.title||headline,1000),url:draft.resultUrl??draft.target.url}],
  agentId:draft.agentId,agentName:name,serviceDraftId:draft.id,serviceDraftStatus:draft.status,serviceDraftProvider:draft.provider,serviceDraftWrite:draft.write,
  serviceDraftWhere:serviceDraftWhere(draft),serviceDraftUrl:draft.resultUrl??draft.target.url,serviceDraftText:serviceDraftText(draft),...draft.reason?{serviceDraftReason:draft.reason}:{},createdAt:draft.createdAt,updatedAt:draft.updatedAt};
}
