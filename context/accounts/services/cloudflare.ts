// Bounded, read-only analytics of the person's own Cloudflare account through Cloudflare's GraphQL Analytics API: a
// fixed set of reads over the last 24 hours (`read` with `id` `workers`: invocations and errors per Worker; `zones`:
// requests per zone). No writes, and nothing but these reads: an Agent picks which, never the query. By default the
// person signs in to Cloudflare (context/accounts/connectors.ts): its sign-in belongs to Cloudflare's own MCP server, which
// runs a short program against Cloudflare's API with it, so each read goes there as one fixed request built here
// (cloudflareExecute), never code an Agent wrote. With an API token pasted under Advanced the Platform sends each
// request only to Cloudflare's API address (service-source.ts). Every answer is cut to a fixed size before it reaches
// an Agent (contracts/services.ts).
import type {ServiceRead,ServiceRecord,ServiceRecords} from '../../../contracts/services.ts';
import type {McpToolResult} from '../mcp/session.ts';
import type {ServiceGate,ServiceHttp} from './http.ts';
import {ValueError,isDict} from '../mcp/python.ts';

export const CLOUDFLARE_API='https://api.cloudflare.com';
/** Caps on what one read returns: Workers and zones per read, and the window (hours) every read covers. */
export const CLOUDFLARE_LIMITS=Object.freeze({workers:20,zones:20,hours:24,name:100});
export const CLOUDFLARE_GATE:ServiceGate=Object.freeze({name:'cloudflare',title:'Cloudflare',timeoutSeconds:30,maxBytes:1_000_000,
 connectMessage:'Connect Cloudflare first.',
 refused:'Cloudflare did not accept this token. Check that it is an API token (not the Global API Key) that has not expired, with Account Analytics Read for this account, then paste it again.',
 disconnected:'Cloudflare is disconnected or its token has expired. Connect Cloudflare again with a new API token.',
 forbidden:'This Cloudflare token cannot read that. Check the account ID and that the token has Account Analytics Read for it (and Zone Read and Zone Analytics Read for zones).',
 missing:'Cloudflare has no such account for this token. Check the account ID.',
 invalid:'Cloudflare could not run this read.',
 busy:'Cloudflare is limiting reads right now. Try again in a minute.',
 signedOut:'Cloudflare signed you out. Sign in to Cloudflare again in Settings › Connectors.',
 signInForbidden:'Your Cloudflare sign-in does not let Worldlet read that. Sign in to Cloudflare again in Settings › Connectors and keep reading analytics allowed.'});

/** Cloudflare's own MCP server, where the person signs in. */
export const CLOUDFLARE_SIGN_IN='https://mcp.cloudflare.com/mcp';
/** The same server for reads, asked for whole answers: it otherwise cuts a long one down to fit a chat, and Core cuts
 * each answer to its own limits anyway. */
export const CLOUDFLARE_SIGN_IN_READS=CLOUDFLARE_SIGN_IN+'?truncateToolResult=false';
/** The server's one tool that reaches Cloudflare's API. */
export const CLOUDFLARE_EXECUTE='execute';
const API_PATH='/client/v4';

/** The `execute` arguments for one request to Cloudflare's API (`path` under /client/v4, with its query): a fixed
 * program that makes exactly that request with the person's sign-in and returns the answer. Built only from the
 * reads here; nothing an Agent wrote is ever run. */
export function cloudflareExecute(method:'GET'|'POST'|'PATCH',path:string,body?:unknown):{code:string} {
 const url=new URL(path,CLOUDFLARE_API);
 if(url.origin!==CLOUDFLARE_API||!url.pathname.startsWith(API_PATH+'/'))throw new ValueError('Cloudflare is read only through its API.');
 const query=Object.fromEntries(url.searchParams);
 const request={method,path:url.pathname.slice(API_PATH.length),...Object.keys(query).length?{query}:{},...body===undefined?{}:{body}};
 // JSON is a JavaScript literal: the request is data inside the program, never code.
 return {code:`async () => cloudflare.request(${JSON.stringify(request)})`};
}

/** Cloudflare's REST error codes, as the server reports them, by the status a direct request would have had. */
const FORBIDDEN_CODES=new Set([9103,9106,9109,10000,10001]),MISSING_CODES=new Set([1001,1049,7000,7003,10007]),BUSY_CODES=new Set([971,1015,10429]);
/** The answer `execute` gave for `path`, as a direct request would have: its status and JSON text. GraphQL comes back
 * as `{data,errors}`; a refusal gets the status its message or code names, and the message in short as
 * `{error:{message}}`. */
export function cloudflareExecuteAnswer(result:McpToolResult,path:string):{status:number;text:string} {
 const text=(Array.isArray(result?.content)?result.content:[]).map(part=>isDict(part)&&part.type==='text'&&typeof part.text==='string'?part.text:'').join('');
 if(result?.isError){
  const said=text.replace(/^\s*Error:\s*/,'').replace(/\s+/g,' ').trim();
  const refusal=(status:number,message:string)=>({status,text:JSON.stringify({error:{message:cut(message,300)}})});
  const status=/^Cloudflare API error: ([1-5]\d\d)\b/.exec(said);
  if(status)return refusal(Number(status[1]),said.slice(status[0].length).trim());
  const coded=/^Cloudflare API error: (\d+): (.*)$/.exec(said);
  if(coded){
   const code=Number(coded[1]);
   return refusal(FORBIDDEN_CODES.has(code)?403:MISSING_CODES.has(code)?404:BUSY_CODES.has(code)?429:400,coded[2]);
  }
  return refusal(400,said.replace(/^GraphQL error: /,''));
 }
 let value:unknown;
 try{value=JSON.parse(text);}catch{return {status:502,text:''};}
 if(/\/graphql\/?(?:\?|$)/.test(path))return {status:200,text:JSON.stringify(isDict(value)?{data:value.result??null,errors:Array.isArray(value.errors)?value.errors:[]}:null)};
 return {status:200,text:JSON.stringify(value)};
}

/** One Cloudflare account the sign-in can read. */
export interface CloudflareChoice {id:string;name:string}
/** The accounts in an answer to GET /client/v4/accounts, up to 50. */
export function cloudflareAccounts(answer:unknown):CloudflareChoice[] {
 const listed=isDict(answer)&&Array.isArray(answer.result)?answer.result:[];
 const accounts:CloudflareChoice[]=[];
 for(const item of listed){
  if(!isDict(item)||typeof item.id!=='string'||!/^[0-9a-f]{32}$/.test(item.id)||accounts.some(account=>account.id===item.id))continue;
  accounts.push({id:item.id,name:cut(item.name,CLOUDFLARE_LIMITS.name)||'Account '+item.id.slice(0,6)});
  if(accounts.length>=50)break;
 }
 return accounts;
}

/** A Cloudflare account ID: 32 hexadecimal characters, from the dashboard's address or the account's overview. */
export function cloudflareAccount(value:unknown):string {
 const text=typeof value==='string'?value.trim().toLowerCase():'';
 if(!/^[0-9a-f]{32}$/.test(text))throw new ValueError('Enter the Cloudflare account ID: the 32 letters and digits after dash.cloudflare.com/ in your dashboard\'s address.');
 return text;
}
export interface CloudflareSettings {account:string}
export function cloudflareSettings(value:unknown):CloudflareSettings {
 return {account:cloudflareAccount(isDict(value)?value.account:undefined)};
}

/** The reads there are; an Agent names one, nothing else. */
export const CLOUDFLARE_READS:readonly string[]=Object.freeze(['workers','zones']);
const WORKERS=`query Workers($account:string!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$account}){workersInvocationsAdaptive(limit:${CLOUDFLARE_LIMITS.workers},filter:{datetime_geq:$since,datetime_lt:$until},orderBy:[sum_requests_DESC]){dimensions{scriptName}sum{requests errors subrequests}quantiles{cpuTimeP50 cpuTimeP99}}}}}`;
const ZONES=`query Zones($zones:[string!]!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag_in:$zones}){zoneTag httpRequests1hGroups(limit:${CLOUDFLARE_LIMITS.hours+1},filter:{datetime_geq:$since,datetime_lt:$until}){sum{requests cachedRequests threats bytes}}}}}`;
/** The one read before a token is kept: the account's Workers over the last hour (none is fine). */
const CHECK='query Check($account:string!,$since:Time!,$until:Time!){viewer{accounts(filter:{accountTag:$account}){workersInvocationsAdaptive(limit:1,filter:{datetime_geq:$since,datetime_lt:$until}){sum{requests}}}}}';

const cut=(value:unknown,limit:number)=>{const text=typeof value==='string'?value:'';return [...text].length>limit?[...text].slice(0,limit-1).join('')+'…':text;};
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
/** The last 24 whole hours, ending at the start of this hour, as Cloudflare's GraphQL takes them. */
function lastDay(now:number){
 const until=Math.floor(now/3_600_000)*3_600_000;
 return {since:new Date(until-CLOUDFLARE_LIMITS.hours*3_600_000).toISOString(),until:new Date(until).toISOString()};
}
/** A GraphQL answer's data; its first error, short, when it has one. */
async function graphql(http:ServiceHttp,query:string,variables:Record<string,unknown>):Promise<Record<string,any>> {
 const answer=await http.post('/client/v4/graphql',{query,variables});
 if(!isDict(answer))throw new Error('Cloudflare returned an unsupported answer.');
 if(Array.isArray(answer.errors)&&answer.errors.length){
  const said=isDict(answer.errors[0])&&typeof answer.errors[0].message==='string'?cut(answer.errors[0].message.replace(/\s+/g,' '),200):'';
  throw new Error(CLOUDFLARE_GATE.invalid+(said?' Cloudflare said: '+said:''));
 }
 if(!isDict(answer.data)||!isDict(answer.data.viewer))throw new Error('Cloudflare returned an unsupported answer.');
 return answer.data.viewer;
}
function account(viewer:Record<string,any>){
 const accounts=Array.isArray(viewer.accounts)?viewer.accounts:[];
 if(accounts.length!==1||!isDict(accounts[0]))throw new Error(CLOUDFLARE_GATE.missing);
 return accounts[0];
}

export async function checkCloudflare(http:ServiceHttp,settings:CloudflareSettings,now=Date.now()):Promise<void> {
 const until=Math.floor(now/60_000)*60_000;
 account(await graphql(http,CHECK,{account:settings.account,since:new Date(until-3_600_000).toISOString(),until:new Date(until).toISOString()}));
}

/** `read` with `id` `workers` or `zones`, over the last 24 hours. */
export async function readCloudflare(http:ServiceHttp,settings:CloudflareSettings,body:ServiceRead|Record<string,any>,now=Date.now()):Promise<ServiceRecords> {
 if(!isDict(body)||body.operation!=='read')throw new ValueError('Unsupported Cloudflare read. Use read.');
 if(body.query||body.cursor)throw new ValueError(`A Cloudflare read takes only which one: ${CLOUDFLARE_READS.join(' or ')}.`);
 const {since,until}=lastDay(now),dash=`https://dash.cloudflare.com/${settings.account}`;
 if(body.id==='workers'){
  const groups=account(await graphql(http,WORKERS,{account:settings.account,since,until})).workersInvocationsAdaptive;
  const records:ServiceRecord[]=(Array.isArray(groups)?groups:[]).slice(0,CLOUDFLARE_LIMITS.workers).flatMap((group:unknown)=>{
   if(!isDict(group))return [];
   const script=isDict(group.dimensions)?group.dimensions.scriptName:null;
   if(typeof script!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(script))return [];
   const sum=isDict(group.sum)?group.sum:{},quantiles=isDict(group.quantiles)?group.quantiles:{};
   const requests=count(sum.requests),errors=count(sum.errors);
   const fields:Record<string,string|number|boolean>={kind:'worker',requests,errors,errorRatePercent:requests?Math.round(errors/requests*10000)/100:0,subrequests:count(sum.subrequests)};
   // Cloudflare gives CPU time in microseconds.
   if(typeof quantiles.cpuTimeP50==='number')fields.cpuTimeP50Ms=Math.round(quantiles.cpuTimeP50/10)/100;
   if(typeof quantiles.cpuTimeP99==='number')fields.cpuTimeP99Ms=Math.round(quantiles.cpuTimeP99/10)/100;
   return [{id:`worker/${script}`,title:script,url:`${dash}/workers/services/view/${script}/production/metrics`,fields}];
  });
  return {provider:'cloudflare',operation:'read',records,scope:`Workers invocations and errors from ${since} to ${until} · the ${CLOUDFLARE_LIMITS.workers} busiest at most · Read only`};
 }
 if(body.id==='zones'){
  const listed=await http.get(`/client/v4/zones?account.id=${settings.account}&per_page=${CLOUDFLARE_LIMITS.zones}&status=active`);
  if(!isDict(listed)||!Array.isArray(listed.result))throw new Error('Cloudflare returned an unsupported answer.');
  const zones=new Map<string,string>();
  for(const zone of listed.result.slice(0,CLOUDFLARE_LIMITS.zones))
   if(isDict(zone)&&typeof zone.id==='string'&&/^[0-9a-f]{32}$/.test(zone.id)&&typeof zone.name==='string'&&/^[A-Za-z0-9.-]{1,253}$/.test(zone.name))zones.set(zone.id,zone.name);
  const totals=new Map<string,{requests:number;cachedRequests:number;threats:number;bytes:number}>();
  if(zones.size){
   const viewer=await graphql(http,ZONES,{zones:[...zones.keys()],since,until});
   for(const zone of Array.isArray(viewer.zones)?viewer.zones:[]){
    if(!isDict(zone)||typeof zone.zoneTag!=='string'||!zones.has(zone.zoneTag))continue;
    const total={requests:0,cachedRequests:0,threats:0,bytes:0};
    for(const hour of (Array.isArray(zone.httpRequests1hGroups)?zone.httpRequests1hGroups:[]).slice(0,CLOUDFLARE_LIMITS.hours+1)){
     const sum=isDict(hour)&&isDict(hour.sum)?hour.sum:{};
     total.requests+=count(sum.requests);total.cachedRequests+=count(sum.cachedRequests);total.threats+=count(sum.threats);total.bytes+=count(sum.bytes);
    }
    totals.set(zone.zoneTag,total);
   }
  }
  const records:ServiceRecord[]=[...zones].map(([id,name])=>{
   const total=totals.get(id)??{requests:0,cachedRequests:0,threats:0,bytes:0};
   return {id:`zone/${name}`,title:cut(name,CLOUDFLARE_LIMITS.name),url:`${dash}/${name}/analytics/traffic`,
    fields:{kind:'zone',...total,cachedPercent:total.requests?Math.round(total.cachedRequests/total.requests*10000)/100:0}};
  }).sort((a,b)=>Number(b.fields.requests)-Number(a.fields.requests));
  return {provider:'cloudflare',operation:'read',records,scope:`Requests per zone from ${since} to ${until} · up to ${CLOUDFLARE_LIMITS.zones} active zones · Read only`};
 }
 throw new ValueError(`Read one of Cloudflare's reports: ${CLOUDFLARE_READS.join(' or ')}.`);
}
