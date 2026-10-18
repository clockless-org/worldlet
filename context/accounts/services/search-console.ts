// Bounded, read-only Google Search Console reads of the sites a Google service account can see, through the Search
// Console API: `list` (the sites) and `query` (one Search Analytics query for one site: clicks, impressions,
// click-through rate and position, over the last N days or between two dates, grouped by up to three of query, page,
// date, country and device). No writes. By default the person signs in with Worldlet's own Google sign-in, which adds
// the read-only Search Console permission (SEARCH_CONSOLE_SCOPE) only when they connect it, and reads the sites their
// Google account can see. Under Advanced, a service account instead: the person pastes its JSON key; the Platform keeps
// it only in the vault, signs a short-lived assertion with it (RS256, the claims below) and exchanges that at Google's
// token address for an access token kept in memory (service-source.ts). A service account suits a World that runs with
// no one at the screen: it needs no sign-in window and no refresh token. Core decides which requests are made and what
// of each answer reaches an Agent (contracts/services.ts).
import type {ServiceRead,ServiceRecord,ServiceRecords} from '../../../contracts/services.ts';
import type {ServiceGate,ServiceHttp} from './http.ts';
import {ValueError,isDict} from '../mcp/python.ts';

export const SEARCH_CONSOLE_API='https://www.googleapis.com';
/** Google's token address: the only place an assertion is sent, whatever the pasted key names. */
export const GOOGLE_TOKEN_URL='https://oauth2.googleapis.com/token';
export const SEARCH_CONSOLE_SCOPE='https://www.googleapis.com/auth/webmasters.readonly';
export const SEARCH_CONSOLE_DIMENSIONS:readonly string[]=Object.freeze(['query','page','date','country','device']);
/** Caps: sites one `list` returns, rows one `query` returns (and its default), days back (Search Console keeps about
 * 16 months), dimensions per query, characters of a query's spec and of a site, characters of a row's key. */
export const SEARCH_CONSOLE_LIMITS=Object.freeze({sites:100,rows:250,rowsDefault:25,days:480,daysDefault:28,dimensions:3,spec:300,site:200,key:150});
export const SEARCH_CONSOLE_GATE:ServiceGate=Object.freeze({name:'search-console',title:'Search Console',timeoutSeconds:30,maxBytes:2_000_000,
 connectMessage:'Connect Search Console first.',
 refused:'Google did not accept this service account key. Check that it is the whole JSON key of a service account that has not been deleted or disabled, then paste it again.',
 disconnected:'Search Console is disconnected or its service account key was revoked. Connect Search Console again with a new key.',
 forbidden:'This service account cannot read that site. In Search Console, open Settings › Users and permissions for the site and add the service account\'s email as a user.',
 missing:'Search Console has no such site for this service account. Read list for the sites it can see.',
 invalid:'Search Console could not run this read.',
 busy:'Search Console is limiting reads right now. Try again in a minute.',
 signedOut:'Google signed you out of Search Console. Sign in again in Settings › Connectors.',
 signInForbidden:'Your Google account cannot see that site in Search Console. Read list for the sites it can see, or ask the site\'s owner in Search Console to add you as a user.'});

/** What is kept of a pasted key, and all the Platform signs with. */
export interface SearchConsoleKey {clientEmail:string;privateKey:string;keyId?:string}
const KEY_MESSAGE='Paste the whole JSON key of a Google service account (in Google Cloud, IAM & Admin › Service accounts › Keys › Add key › JSON).';
/** A pasted service account key, checked: its email and private key (and key ID), nothing else. A key that names
 * another token address is refused, since the assertion goes only to Google's. Messages never repeat the paste. */
export function searchConsoleKey(value:unknown):SearchConsoleKey {
 let parsed:unknown=value;
 if(typeof value==='string'){try{parsed=JSON.parse(value.trim());}catch{throw new ValueError(KEY_MESSAGE);}}
 if(!isDict(parsed))throw new ValueError(KEY_MESSAGE);
 if(isDict(parsed.installed)||isDict(parsed.web))throw new ValueError('That is an OAuth client file, not a service account key. '+KEY_MESSAGE);
 const email=parsed.client_email??parsed.clientEmail,key=parsed.private_key??parsed.privateKey,id=parsed.private_key_id??parsed.keyId;
 if(parsed.type!==undefined&&parsed.type!=='service_account')throw new ValueError(KEY_MESSAGE);
 if(typeof email!=='string'||email.length>200||!/^[a-z0-9][a-z0-9._-]*@[a-z0-9][a-z0-9.-]*\.gserviceaccount\.com$/i.test(email))throw new ValueError(KEY_MESSAGE);
 if(typeof key!=='string'||key.length>6000||!/^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PRIVATE KEY-----\n?$/.test(key.replace(/\r\n/g,'\n')))throw new ValueError(KEY_MESSAGE);
 if(parsed.token_uri!==undefined&&parsed.token_uri!==GOOGLE_TOKEN_URL)throw new ValueError('This key names another token address. Worldlet exchanges keys only with Google at '+GOOGLE_TOKEN_URL+'.');
 return {clientEmail:email.toLowerCase(),privateKey:key.replace(/\r\n/g,'\n'),...typeof id==='string'&&/^[0-9a-f]{16,64}$/i.test(id)?{keyId:id}:{}};
}
/** Search Console takes no settings besides the key (or the Google sign-in). */
export function searchConsoleSettings(value:unknown):Record<string,never> {
 if(value!==undefined&&value!==null&&(!isDict(value)||Object.keys(value).length))throw new ValueError('Search Console takes only the service account key.');
 return {};
}
/** The header and claims of the assertion the Platform signs (RS256) for an access token: read-only Search Console,
 * issued now for an hour (Google's most). `now` is in seconds. */
export function searchConsoleAssertion(key:SearchConsoleKey,now:number){
 const iat=Math.floor(now);
 return {header:{alg:'RS256',typ:'JWT',...key.keyId?{kid:key.keyId}:{}},claims:{iss:key.clientEmail,scope:SEARCH_CONSOLE_SCOPE,aud:GOOGLE_TOKEN_URL,iat,exp:iat+3600}};
}
/** Google's token answer: the access token and until when (ms) to use it, a minute before it expires. */
export function searchConsoleAccessToken(value:unknown,now:number):{token:string;until:number} {
 if(!isDict(value)||typeof value.access_token!=='string'||!/^[\x21-\x7e]{10,4096}$/.test(value.access_token))throw new Error('Google returned an unsupported answer.');
 const seconds=typeof value.expires_in==='number'&&Number.isFinite(value.expires_in)&&value.expires_in>0?Math.min(value.expires_in,3600):3600;
 return {token:value.access_token,until:now+(seconds-60)*1000};
}

/** A Search Console property: a domain property (`sc-domain:example.com`) or a URL prefix (`https://example.com/`). */
export function searchConsoleSite(value:unknown):string {
 const text=typeof value==='string'?value.trim():'';
 const plain='Name the Search Console site as it appears there: sc-domain:example.com for a domain property, or a URL prefix such as https://example.com/.';
 if(!text||text.length>SEARCH_CONSOLE_LIMITS.site)throw new ValueError(plain);
 const domain=/^sc-domain:([a-z0-9.-]+)$/i.exec(text);
 if(domain){
  if(!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i.test(domain[1]))throw new ValueError(plain);
  return 'sc-domain:'+domain[1].toLowerCase();
 }
 let url:URL;
 try{url=new URL(text);}catch{throw new ValueError(plain);}
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||!url.hostname||!text.endsWith('/'))throw new ValueError(plain);
 return url.href;
}

/** What one `query` asks, as a preset keeps it: the last `days` days (ending yesterday) or `startDate` to `endDate`,
 * grouped by `dimensions`, at most `rowLimit` rows. */
export interface SearchConsoleSpec {days?:number;startDate?:string;endDate?:string;dimensions:string[];rowLimit:number}
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const day=(text:string)=>{const ms=Date.parse(text+'T00:00:00Z');return DATE.test(text)&&Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===text?ms:NaN;};
const SPEC_MESSAGE=`Give a Search Console query as JSON, such as {"days":28,"dimensions":["query"],"rowLimit":25}: days (1 to ${SEARCH_CONSOLE_LIMITS.days}) or startDate and endDate (YYYY-MM-DD), up to ${SEARCH_CONSOLE_LIMITS.dimensions} dimensions of ${SEARCH_CONSOLE_DIMENSIONS.join(', ')}, and rowLimit (1 to ${SEARCH_CONSOLE_LIMITS.rows}).`;
/** A `query` argument, checked: empty means the last 28 days in total. */
export function searchConsoleSpec(value:unknown):SearchConsoleSpec {
 if(value===undefined||value===null||value==='')return {days:SEARCH_CONSOLE_LIMITS.daysDefault,dimensions:[],rowLimit:SEARCH_CONSOLE_LIMITS.rowsDefault};
 let parsed:unknown=value;
 if(typeof value==='string'){
  if(value.length>SEARCH_CONSOLE_LIMITS.spec)throw new ValueError(SPEC_MESSAGE);
  try{parsed=JSON.parse(value);}catch{throw new ValueError(SPEC_MESSAGE);}
 }
 if(!isDict(parsed)||Object.keys(parsed).some(key=>!['days','startDate','endDate','dimensions','rowLimit'].includes(key)))throw new ValueError(SPEC_MESSAGE);
 const dimensions=parsed.dimensions===undefined?[]:parsed.dimensions;
 if(!Array.isArray(dimensions)||dimensions.length>SEARCH_CONSOLE_LIMITS.dimensions||dimensions.some(d=>typeof d!=='string'||!SEARCH_CONSOLE_DIMENSIONS.includes(d))||new Set(dimensions).size!==dimensions.length)throw new ValueError(SPEC_MESSAGE);
 const rowLimit=parsed.rowLimit===undefined?SEARCH_CONSOLE_LIMITS.rowsDefault:parsed.rowLimit;
 if(!Number.isInteger(rowLimit)||rowLimit<1||rowLimit>SEARCH_CONSOLE_LIMITS.rows)throw new ValueError(SPEC_MESSAGE);
 const spec:SearchConsoleSpec={dimensions:[...dimensions],rowLimit};
 if(parsed.startDate!==undefined||parsed.endDate!==undefined){
  if(parsed.days!==undefined||typeof parsed.startDate!=='string'||typeof parsed.endDate!=='string')throw new ValueError(SPEC_MESSAGE);
  const start=day(parsed.startDate),end=day(parsed.endDate);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||(end-start)/86_400_000>=SEARCH_CONSOLE_LIMITS.days)throw new ValueError(SPEC_MESSAGE);
  spec.startDate=parsed.startDate;spec.endDate=parsed.endDate;
 }else{
  const days=parsed.days===undefined?SEARCH_CONSOLE_LIMITS.daysDefault:parsed.days;
  if(!Number.isInteger(days)||days<1||days>SEARCH_CONSOLE_LIMITS.days)throw new ValueError(SPEC_MESSAGE);
  spec.days=days;
 }
 return spec;
}
/** The dates a spec covers on `now`: the last `days` whole days (UTC) ending yesterday, or its own dates. */
function dates(spec:SearchConsoleSpec,now:number):{startDate:string;endDate:string} {
 if(spec.startDate&&spec.endDate)return {startDate:spec.startDate,endDate:spec.endDate};
 const today=Math.floor(now/86_400_000)*86_400_000,iso=(ms:number)=>new Date(ms).toISOString().slice(0,10);
 return {startDate:iso(today-(spec.days??SEARCH_CONSOLE_LIMITS.daysDefault)*86_400_000),endDate:iso(today-86_400_000)};
}

const cut=(value:unknown,limit:number)=>{const text=typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' '):'';return [...text].length>limit?[...text].slice(0,limit-1).join('')+'…':text;};
const count=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
const round=(value:number,places:number)=>Math.round(value*10**places)/10**places;
const performance=(site:string)=>`https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(site)}`;
const sitesPath='/webmasters/v3/sites';

/** The one read before a key is kept, and of the connection test: the sites it can see (none is fine). */
export async function checkSearchConsole(http:ServiceHttp):Promise<void> {
 const answer=await http.get(sitesPath);
 if(!isDict(answer))throw new Error('Search Console returned an unsupported answer.');
}

/** `list`: the sites the service account can see. `query`: one Search Analytics query for the site `id`, as `query`
 * (searchConsoleSpec) asks. */
export async function readSearchConsole(http:ServiceHttp,_settings:unknown,body:ServiceRead|Record<string,any>,now=Date.now()):Promise<ServiceRecords> {
 if(!isDict(body)||!['list','query'].includes(body.operation))throw new ValueError('Unsupported Search Console read. Use list or query.');
 if(body.cursor)throw new ValueError('Search Console reads have one page. Narrow the query or raise its rowLimit.');
 if(body.operation==='list'){
  if(body.id||body.query)throw new ValueError('Search Console\'s list takes nothing else.');
  const answer=await http.get(sitesPath);
  if(!isDict(answer))throw new Error('Search Console returned an unsupported answer.');
  const records:ServiceRecord[]=(Array.isArray(answer.siteEntry)?answer.siteEntry:[]).flatMap((entry:unknown)=>{
   if(!isDict(entry))return [];
   let site:string;try{site=searchConsoleSite(entry.siteUrl);}catch{return [];}
   return [{id:site,title:site.replace(/^sc-domain:/,''),url:performance(site),
    fields:{kind:site.startsWith('sc-domain:')?'domain':'url-prefix',permission:cut(entry.permissionLevel,40)}}];
  }).slice(0,SEARCH_CONSOLE_LIMITS.sites).sort((a:ServiceRecord,b:ServiceRecord)=>a.id.localeCompare(b.id));
  return {provider:'search-console',operation:'list',records,scope:`The Search Console sites this connection can see · up to ${SEARCH_CONSOLE_LIMITS.sites} · Read only`};
 }
 const site=searchConsoleSite(body.id),spec=searchConsoleSpec(body.query),{startDate,endDate}=dates(spec,now);
 const answer=await http.post(`${sitesPath}/${encodeURIComponent(site)}/searchAnalytics/query`,{startDate,endDate,dimensions:spec.dimensions,rowLimit:spec.rowLimit});
 if(!isDict(answer))throw new Error('Search Console returned an unsupported answer.');
 const rows=(Array.isArray(answer.rows)?answer.rows:[]).slice(0,spec.rowLimit);
 const records:ServiceRecord[]=rows.flatMap((row:unknown)=>{
  if(!isDict(row))return [];
  const keys=Array.isArray(row.keys)?row.keys:[];
  if(keys.length!==spec.dimensions.length||keys.some((key:unknown)=>typeof key!=='string'))return [];
  const fields:Record<string,string|number|boolean>={};
  spec.dimensions.forEach((dimension,index)=>{fields[dimension]=cut(keys[index],SEARCH_CONSOLE_LIMITS.key);});
  Object.assign(fields,{clicks:count(row.clicks),impressions:count(row.impressions),ctrPercent:round(count(row.ctr)*100,2),position:round(count(row.position),1)});
  const named=spec.dimensions.map(dimension=>String(fields[dimension]));
  return [{id:named.length?named.join(' · '):'total',title:named.length?named.join(' · '):`All of ${site.replace(/^sc-domain:/,'')}`,url:performance(site),fields}];
 });
 // A trend reads in time order; Search Console returns rows by clicks.
 if(spec.dimensions[0]==='date')records.sort((a,b)=>String(a.fields.date).localeCompare(String(b.fields.date)));
 const by=spec.dimensions.length?` by ${spec.dimensions.join(', ')}`:' in total';
 return {provider:'search-console',operation:'query',records,scope:`Google Search clicks and impressions for ${site} from ${startDate} to ${endDate}${by} · up to ${spec.rowLimit} rows · Read only`};
}
