// Bounded reads of the person's own PostHog project through PostHog's API, with PostHog's own sign-in or a personal API
// key they pasted (under Advanced): one
// read-only HogQL SELECT (`query`), a page of their insights, dashboards, feature flags or annotations (`read`), or their
// production errors: each error group seen in the last 7 days with its last 24 hours (`read` `errors`).
// No writes. PostHog's remote MCP server serves only PostHog Cloud and picks its project itself, so a self-hosted
// PostHog and a chosen project are read here directly; the Platform sends each request only to the address the
// person gave (service-source.ts). Every answer is cut to a fixed size before it reaches an Agent
// (contracts/services.ts); people's own rows can be personal data, which is why no Agent reads this without a Grant.
import type {ServiceRead,ServiceRecord,ServiceRecords} from '../../../contracts/services.ts';
import type {ServiceGate,ServiceHttp} from './http.ts';
import {ValueError,isDict} from '../mcp/python.ts';

export const POSTHOG_HOSTS=Object.freeze({us:'https://us.posthog.com',eu:'https://eu.posthog.com'});
/** Caps on what one read returns: rows, columns, characters per cell and in all, a query's length, list pages. */
export const POSTHOG_LIMITS=Object.freeze({rows:200,columns:30,cell:300,text:60_000,query:4000,pageSize:20,pages:5,search:100,title:200,description:500,tags:8});
export const POSTHOG_GATE:ServiceGate=Object.freeze({name:'posthog',title:'PostHog',timeoutSeconds:30,maxBytes:2_000_000,
 connectMessage:'Connect PostHog first.',
 refused:'PostHog did not accept this key. Check that it is a personal API key that has not expired, with read access to Project, Query, Insight, Dashboard, Feature flag and Annotation, then paste it again.',
 disconnected:'PostHog is disconnected or its key has expired. Connect PostHog again with a new personal API key.',
 forbidden:'This PostHog key cannot read that. Check the project ID and that the key has read access to it.',
 missing:'PostHog has no such project at this address. Check the PostHog address and the project ID.',
 invalid:'PostHog could not run this read.',
 busy:'PostHog is limiting reads right now. Try again in a minute.',
 signedOut:'PostHog signed you out. Sign in to PostHog again in Settings › Services.'});

/** PostHog's own sign-in (context/connectors/connectors.ts, `mcp-oauth`): its remote MCP server's address names its
 * authorization server, where Worldlet registers itself and signs in with PKCE on this computer. The access token it
 * gives is then sent as a Bearer to PostHog Cloud's API (the same endpoints a personal API key reads), never to the MCP
 * server's tools. */
export const POSTHOG_SIGN_IN='https://mcp.posthog.com/mcp';
/** Where a signed-in account's API answers: US Cloud first, then EU. */
export const POSTHOG_SIGN_IN_HOSTS:readonly string[]=Object.freeze([POSTHOG_HOSTS.us,POSTHOG_HOSTS.eu]);
/** One PostHog project the person can choose after signing in. */
export interface PosthogProject {id:string;name:string}
/** The projects `GET /api/users/@me/` names (its organization's teams) and the one it is on now. Ids are PostHog's
 * project numbers; names are cut to a title's length. At most 50, in PostHog's order. */
export function posthogProjects(me:unknown):{projects:PosthogProject[];current:string|null} {
 const row=isDict(me)?me:{};
 const organization=isDict(row.organization)?row.organization:{};
 const teams=Array.isArray(organization.teams)?organization.teams:[];
 const projects:PosthogProject[]=[];
 for(const team of teams){
  if(!isDict(team))continue;
  const id=String(team.id??'');
  if(!/^[1-9][0-9]{0,11}$/.test(id)||projects.some(project=>project.id===id))continue;
  projects.push({id,name:cut(team.name,POSTHOG_LIMITS.title)||'Project '+id});
  if(projects.length>=50)break;
 }
 const team=isDict(row.team)?String(row.team.id??''):'';
 return {projects,current:projects.some(project=>project.id===team)?team:projects[0]?.id??null};
}

/** PostHog's ingestion addresses and its old app address serve no private API; their Cloud's own address does. */
const CLOUD_ALIASES=new Map([['app.posthog.com',POSTHOG_HOSTS.us],['us.i.posthog.com',POSTHOG_HOSTS.us],['eu.i.posthog.com',POSTHOG_HOSTS.eu]]);
/** The address the person gave: US or EU Cloud or their own PostHog, over HTTPS, the origin alone. */
export function posthogHost(value:unknown):string {
 const text=typeof value==='string'?value.trim():'';
 const plain='Use your PostHog address on its own, starting with https://, such as https://us.posthog.com or https://eu.posthog.com.';
 if(!text||text.length>200)throw new ValueError(plain);
 let url:URL;
 try{url=new URL(/^[a-z][a-z0-9+.-]*:/i.test(text)?text:'https://'+text);}catch{throw new ValueError(plain);}
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname.replace(/\/$/,'')!==''||!url.hostname)throw new ValueError(plain);
 return CLOUD_ALIASES.get(url.hostname)??url.origin;
}
/** A PostHog project ID: the number in the project's address (`/project/12345`). */
export function posthogProject(value:unknown):string {
 const text=typeof value==='string'||typeof value==='number'?String(value).trim():'';
 if(!/^[1-9][0-9]{0,11}$/.test(text))throw new ValueError('Enter the PostHog project ID: the number after /project/ in its address.');
 return text;
}
export interface PosthogSettings {host:string;project:string}
export function posthogSettings(value:unknown):PosthogSettings {
 const row=isDict(value)?value:{};
 return {host:posthogHost(row.host),project:posthogProject(row.project)};
}

/** A query that may run: one HogQL SELECT (or WITH … SELECT), no other statement, no comments, at most 200 rows asked.
 * PostHog's query API runs only SELECTs itself; this refuses anything else before it is sent. Returns the query
 * without a trailing semicolon. */
export function hogqlSelect(value:unknown):string {
 const query=typeof value==='string'?value.trim().replace(/;\s*$/,'').trim():'';
 if(!query||[...query].length>POSTHOG_LIMITS.query)throw new ValueError(`Ask PostHog with one HogQL SELECT of up to ${POSTHOG_LIMITS.query} characters.`);
 // Quoted strings and identifiers are data: look only at what is outside them.
 let bare='';
 for(let i=0;i<query.length;){
  const quote=query[i];
  if(quote==='\''||quote==='"'||quote==='`'){
   let j=i+1;
   while(j<query.length&&query[j]!==quote)j+=query[j]==='\\'?2:1;
   if(j>=query.length)throw new ValueError('Close every quoted string in the query.');
   bare+=' _ ';i=j+1;continue;
  }
  bare+=query[i];i+=1;
 }
 if(/--|\/\*|#/.test(bare))throw new ValueError('Remove comments from the query.');
 if(bare.includes(';'))throw new ValueError('Run one query at a time.');
 if(!/^\(*\s*(?:select|with)\b/i.test(bare))throw new ValueError('Only a read-only SELECT runs on PostHog.');
 const write=/\b(insert|update|delete|alter|drop|create|truncate|rename|attach|detach|optimize|grant|revoke|kill)\b/i.exec(bare);
 if(write)throw new ValueError(`Only a read-only SELECT runs on PostHog; this query contains ${write[1].toUpperCase()}.`);
 if(/\blimit\s+all\b/i.test(bare))throw new ValueError(`Ask for at most ${POSTHOG_LIMITS.rows} rows (LIMIT ${POSTHOG_LIMITS.rows} or less).`);
 for(const match of bare.matchAll(/\blimit\s+(\d+)(?:\s*,\s*(\d+))?/gi)){
  if(Number(match[2]??match[1])>POSTHOG_LIMITS.rows)throw new ValueError(`Ask for at most ${POSTHOG_LIMITS.rows} rows (LIMIT ${POSTHOG_LIMITS.rows} or less).`);
 }
 return query;
}

const cut=(value:unknown,limit:number)=>{const text=typeof value==='string'?value:'';return [...text].length>limit?[...text].slice(0,limit-1).join('')+'…':text;};
const positive=(value:unknown):value is number=>Number.isInteger(value)&&(value as number)>0;
function cell(value:unknown):string|number|boolean {
 if(value===null||value===undefined)return '';
 if(typeof value==='boolean')return value;
 if(typeof value==='number')return Number.isFinite(value)?value:String(value);
 if(typeof value==='string')return cut(value,POSTHOG_LIMITS.cell);
 return cut(JSON.stringify(value)??'',POSTHOG_LIMITS.cell);
}
function tags(value:unknown):string {
 return Array.isArray(value)?value.filter((t):t is string=>typeof t==='string').slice(0,POSTHOG_LIMITS.tags).map(t=>cut(t,40)).join(', '):'';
}
/** Adds the fields that have a value. */
function present(fields:Record<string,string|number|boolean>,more:Record<string,unknown>){
 for(const [key,value] of Object.entries(more))if(typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value)fields[key]=value as string|number|boolean;
 return fields;
}

/** The lists `read` pages through, each a record shape that keeps only what describes the item (never who made it). */
type Lister={path:string;extra:string;record:(row:Record<string,any>,web:string)=>ServiceRecord|null};
const LISTS:ReadonlyMap<string,Lister>=new Map<string,Lister>([
 ['insights',{path:'insights',extra:'&basic=true',record:(row,web)=>{
  const short=typeof row.short_id==='string'&&/^[A-Za-z0-9]{1,20}$/.test(row.short_id)?row.short_id:null;
  if(!short)return null;
  const title=cut(row.name||row.derived_name||'Untitled insight',POSTHOG_LIMITS.title);
  return {id:`insight/${short}`,title,url:`${web}/insights/${short}`,...typeof row.last_modified_at==='string'?{updatedAt:cut(row.last_modified_at,40)}:{},
   fields:present({kind:'insight'},{description:cut(row.description,POSTHOG_LIMITS.description),favorited:row.favorited===true||undefined,tags:tags(row.tags)})};
 }}],
 ['dashboards',{path:'dashboards',extra:'',record:(row,web)=>{
  if(!positive(row.id))return null;
  return {id:`dashboard/${row.id}`,title:cut(row.name||'Untitled dashboard',POSTHOG_LIMITS.title),url:`${web}/dashboard/${row.id}`,
   fields:present({kind:'dashboard'},{description:cut(row.description,POSTHOG_LIMITS.description),pinned:row.pinned===true||undefined,tags:tags(row.tags),createdAt:cut(row.created_at,40)})};
 }}],
 ['feature-flags',{path:'feature_flags',extra:'',record:(row,web)=>{
  if(!positive(row.id)||typeof row.key!=='string'||!row.key)return null;
  const groups=isDict(row.filters)&&Array.isArray(row.filters.groups)?row.filters.groups:[];
  const rollout=groups.length===1&&isDict(groups[0])&&typeof groups[0].rollout_percentage==='number'?groups[0].rollout_percentage:undefined;
  return {id:`feature-flag/${row.id}`,title:cut(row.key,POSTHOG_LIMITS.title),url:`${web}/feature_flags/${row.id}`,...typeof row.updated_at==='string'?{updatedAt:cut(row.updated_at,40)}:{},
   fields:present({kind:'feature flag',active:row.active===true},{name:cut(row.name,POSTHOG_LIMITS.description),conditions:groups.length||undefined,rolloutPercentage:rollout,
    multivariate:isDict(row.filters)&&isDict(row.filters.multivariate)||undefined,tags:tags(row.tags)})};
 }}],
 ['annotations',{path:'annotations',extra:'',record:(row,web)=>{
  if(!positive(row.id)||typeof row.content!=='string')return null;
  return {id:`annotation/${row.id}`,title:cut(row.content,POSTHOG_LIMITS.title),url:`${web}/data-management/annotations`,...typeof row.updated_at==='string'?{updatedAt:cut(row.updated_at,40)}:{},
   fields:present({kind:'annotation'},{date:cut(row.date_marker,40),scope:cut(row.scope,40)})};
 }}],
]);
/** What `read` takes as its `id`: the lists, and `errors`. */
export const POSTHOG_LISTS:readonly string[]=Object.freeze([...LISTS.keys(),'errors']);
/** `read` `errors`: each error group PostHog made from `$exception` events (its own `$exception_issue_id`, never a bare
 * client fingerprint) seen in the last 7 days, the loudest in the last 24 hours first. `new` means first seen in the
 * last 24 hours. Which groups need someone is the person's call (a board threshold, an Agent's routine), not this read. */
export const POSTHOG_ERRORS=Object.freeze({groups:20,message:200,
 query:"SELECT toString(properties.$exception_issue_id) AS issue, any(toString(properties.$exception_types)) AS types, any(toString(properties.$exception_values)) AS message, "
  +"countIf(timestamp > now() - INTERVAL 24 HOUR) AS occurrences, uniqIf(person_id, timestamp > now() - INTERVAL 24 HOUR) AS people, min(timestamp) AS first_seen, max(timestamp) AS last_seen "
  +"FROM events WHERE event = '$exception' AND timestamp > now() - INTERVAL 7 DAY AND notEmpty(toString(properties.$exception_issue_id)) "
  +"GROUP BY issue ORDER BY occurrences DESC, last_seen DESC LIMIT 20"});
const ISSUE_ID=/^[A-Za-z0-9-]{1,64}$/;
/** An exception's types or values as PostHog keeps them (a JSON list as text), joined into one plain line; email
 * addresses and home folders in it are replaced, since an app's error text can carry them. */
function errorText(value:unknown,limit:number):string {
 let parts:unknown=value;
 if(typeof value==='string'){try{parts=JSON.parse(value);}catch{parts=[value];}}
 const text=(Array.isArray(parts)?parts:[parts]).filter(part=>typeof part==='string'&&part).join(' · ')
  .replace(/[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/g,'[email]').replace(/(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\/\\\s]+/g,'$1[name]');
 return cut(text,limit);
}
async function readPosthogErrors(http:ServiceHttp,project:string,web:string):Promise<ServiceRecords> {
 const answer=await http.post(`/api/projects/${project}/query/`,{query:{kind:'HogQLQuery',query:POSTHOG_ERRORS.query}});
 if(!isDict(answer)||!Array.isArray(answer.results))throw new Error('PostHog returned an unsupported answer.');
 const columns:unknown[]=Array.isArray(answer.columns)?answer.columns:[];
 const at=(row:unknown[],name:string)=>row[columns.indexOf(name)];
 const day=Date.now()-24*3600_000;
 const records=answer.results.slice(0,POSTHOG_ERRORS.groups).flatMap((row:unknown):ServiceRecord[]=>{
  if(!Array.isArray(row))return [];
  const issue=at(row,'issue');
  if(typeof issue!=='string'||!ISSUE_ID.test(issue))return [];
  const first=cut(at(row,'first_seen'),40),last=cut(at(row,'last_seen'),40),firstAt=Date.parse(first);
  const title=errorText(at(row,'message'),POSTHOG_ERRORS.message)||errorText(at(row,'types'),POSTHOG_ERRORS.message)||'Error';
  return [{id:`error/${issue}`,title,url:`${web}/error_tracking/${issue}`,...last?{updatedAt:last}:{},
   fields:present({kind:'error',occurrences:count(at(row,'occurrences')),people:count(at(row,'people')),new:Number.isFinite(firstAt)&&firstAt>day},
    {type:errorText(at(row,'types'),80),firstSeen:first,lastSeen:last})}];
 });
 return {provider:'posthog',operation:'read',records,
  scope:`PostHog errors on project ${project}: groups seen in the last 7 days, counted over the last 24 hours, the loudest ${POSTHOG_ERRORS.groups} · Read only`};
}
const count=(value:unknown)=>{const n=typeof value==='number'?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):0;return Number.isFinite(n)?n:0;};

/** The one read before a key is kept: the project, at that address, with that key. Returns its name. */
export async function checkPosthog(http:ServiceHttp,settings:PosthogSettings):Promise<{name:string}> {
 const project=await http.get(`/api/projects/${settings.project}/`);
 if(!isDict(project)||String(project.id)!==settings.project)throw new Error('PostHog answered with a different project. Check the project ID.');
 return {name:cut(project.name,POSTHOG_LIMITS.title)};
}

/** `query` (one HogQL SELECT, at most 200 rows) or `read` (`id`: insights, dashboards, feature-flags or annotations,
 * where `query` filters them by name and `cursor` pages; or errors). */
export async function readPosthog(http:ServiceHttp,settings:PosthogSettings,body:ServiceRead|Record<string,any>):Promise<ServiceRecords> {
 const {host,project}=settings;
 const web=`${host}/project/${project}`;
 const operation=isDict(body)?body.operation:undefined;
 if(operation==='query'){
  if(body.id||body.cursor)throw new ValueError('A PostHog query takes only the query. Narrow it with WHERE, ORDER BY and LIMIT.');
  const query=hogqlSelect(body.query);
  const answer=await http.post(`/api/projects/${project}/query/`,{query:{kind:'HogQLQuery',query}});
  if(!isDict(answer)||!Array.isArray(answer.results))throw new Error('PostHog returned an unsupported answer.');
  const columns=(Array.isArray(answer.columns)?answer.columns:[]).slice(0,POSTHOG_LIMITS.columns);
  // Each column's name once, short; an unnamed or repeated one is numbered.
  const names:string[]=[];
  columns.forEach((column:unknown,i:number)=>{let name=cut(typeof column==='string'&&column.trim()?column.trim():`column ${i+1}`,64);while(names.includes(name))name+=` (${i+1})`;names.push(name);});
  const records:ServiceRecord[]=[];
  let budget=POSTHOG_LIMITS.text,left=answer.results.length>POSTHOG_LIMITS.rows||answer.hasMore===true;
  for(const [i,row] of answer.results.slice(0,POSTHOG_LIMITS.rows).entries()){
   if(!Array.isArray(row))throw new Error('PostHog returned an unsupported answer.');
   const fields=Object.fromEntries(names.map((name,j)=>[name,cell(row[j])]));
   const size=JSON.stringify(fields).length;
   if(size>budget){left=true;break;}
   budget-=size;
   const first=fields[names[0]];
   records.push({id:`row/${i+1}`,title:cut(first===undefined||first===''?`Row ${i+1}`:String(first),POSTHOG_LIMITS.title),url:`${web}/sql`,fields});
  }
  return {provider:'posthog',operation,records,
   scope:`HogQL on PostHog project ${project} · ${records.length} ${records.length===1?'row':'rows'}, at most ${POSTHOG_LIMITS.rows}${left?' · more rows were left out: narrow the query':''} · Read only`};
 }
 if(operation==='read'){
  const kind=typeof body.id==='string'?body.id:'';
  if(kind==='errors'){
   if(body.query||body.cursor)throw new ValueError('PostHog errors take no filter or cursor: the read is the loudest groups of the last 24 hours.');
   return readPosthogErrors(http,project,web);
  }
  const list=LISTS.get(kind);
  if(!list)throw new ValueError(`Read one PostHog list: ${POSTHOG_LISTS.join(', ')}.`);
  const search=body.query===undefined||body.query===null||body.query===''?'':typeof body.query==='string'&&[...body.query.trim()].length<=POSTHOG_LIMITS.search?body.query.trim():null;
  if(search===null)throw new ValueError(`Filter a PostHog list by a name of up to ${POSTHOG_LIMITS.search} characters.`);
  const cursor=body.cursor;
  const page=cursor===undefined||cursor===null||cursor===''?1:/^[1-9]$/.test(String(cursor))?Number(cursor):0;
  if(page<1||page>POSTHOG_LIMITS.pages)throw new ValueError('Invalid PostHog cursor.');
  const answer=await http.get(`/api/projects/${project}/${list.path}/?limit=${POSTHOG_LIMITS.pageSize}&offset=${(page-1)*POSTHOG_LIMITS.pageSize}${list.extra}${search?'&search='+encodeURIComponent(search):''}`);
  if(!isDict(answer)||!Array.isArray(answer.results))throw new Error('PostHog returned an unsupported answer.');
  const records=answer.results.slice(0,POSTHOG_LIMITS.pageSize).flatMap((row:unknown)=>{const found=isDict(row)?list.record(row,web):null;return found?[found]:[];});
  const more=(typeof answer.next==='string'&&answer.next!==''||Number.isInteger(answer.count)&&answer.count>page*POSTHOG_LIMITS.pageSize)&&page<POSTHOG_LIMITS.pages;
  return {provider:'posthog',operation,records,...more?{cursor:String(page+1)}:{},
   scope:`PostHog ${kind.replace('-',' ')}${search?' named like “'+cut(search,40)+'”':''}, page ${page} of at most ${POSTHOG_LIMITS.pages} · ${POSTHOG_LIMITS.pageSize} a page · Read only`};
 }
 throw new ValueError('Unsupported PostHog read. Use query or read.');
}
