// HTTP JSON: bounded, read-only reads of JSON over HTTPS at addresses the person gave, each a named endpoint with an
// optional bearer token kept in the vault. An Agent picks an endpoint by its name and a path under that endpoint's
// base URL (with a query string), and optionally which array holds the records and which keys give each record's ID,
// title, link and fields; it never picks the address. GET only. The Platform sends each request only to the endpoint's
// own origin, follows no redirect, refuses a name that resolves to a private, loopback or link-local address, and stops
// at the gate's time and size (service-source.ts). Every answer is cut to flat, bounded records before it reaches an
// Agent (contracts/services.ts); the answer is data, never instructions.
import type {ServiceRead,ServiceRecord,ServiceRecords} from '../../../contracts/services.ts';
import {privateAddress,type ServiceGate,type ServiceHttp} from './http.ts';
import {ValueError,isDict} from '../mcp/python.ts';

/** Caps: endpoints one World keeps, an endpoint's name and base URL, a read's path, records and fields per read,
 * characters per key, value and title, keys in a JSON path, and the request (`query`) as a whole. */
export const HTTP_JSON_LIMITS=Object.freeze({endpoints:10,name:32,url:300,path:1000,records:50,fields:30,key:60,cell:300,title:200,depth:8,query:2000});
export const HTTP_JSON_GATE:ServiceGate=Object.freeze({name:'http',title:'HTTP JSON',timeoutSeconds:15,maxBytes:1_000_000,publicOnly:true,
 connectMessage:'Connect an HTTP JSON endpoint first, in Settings › Connectors.',
 refused:'This endpoint did not accept the token. Check the token (Worldlet sends it as a Bearer header), then paste it again.',
 disconnected:'This HTTP JSON endpoint no longer accepts its token. Connect it again under the same name with a new token.',
 forbidden:'This endpoint refused that read (403). Check the path and what the token may read.',
 missing:'This endpoint has nothing at that path (404). Check the path.',
 invalid:'This endpoint could not answer that read (400).',
 busy:'This endpoint is limiting reads right now. Try again in a minute.'});

/** An endpoint's name, chosen by the person: what an Agent and a preset name it by. */
export const HTTP_JSON_NAME=new RegExp(`^[a-z0-9][a-z0-9-]{0,${HTTP_JSON_LIMITS.name-1}}$`);
export function httpJsonName(value:unknown):string {
 const text=typeof value==='string'?value.trim().toLowerCase():'';
 if(!HTTP_JSON_NAME.test(text))throw new ValueError(`Name the endpoint with lowercase letters, digits and -, at most ${HTTP_JSON_LIMITS.name}, such as status.`);
 return text;
}
/** An endpoint's base URL: HTTPS, no sign-in in the address, no query or fragment, not this computer or the local
 * network written as a name or an IP address. Kept with a trailing `/`, so every read's path is under it. */
export function httpJsonBaseUrl(value:unknown):string {
 const text=typeof value==='string'?value.trim():'';
 const plain='Use the endpoint\'s base address, starting with https://, such as https://api.example.com/v1/ (no ? or #, and no password in it).';
 if(!text||text.length>HTTP_JSON_LIMITS.url)throw new ValueError(plain);
 let url:URL;
 try{url=new URL(text);}catch{throw new ValueError(plain);}
 if(url.protocol!=='https:'||url.username||url.password||url.search||text.includes('?')||text.includes('#')||!url.hostname)throw new ValueError(plain);
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 const ip=/^[\d.]+$/.test(host)||host.startsWith('[');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||ip&&privateAddress(host))
  throw new ValueError('Worldlet reads HTTP JSON only on the internet, never this computer or your local network.');
 return url.origin+(url.pathname.endsWith('/')?url.pathname:url.pathname+'/');
}
export interface HttpJsonSettings {name:string;url:string}
export function httpJsonSettings(value:unknown):HttpJsonSettings {
 const row=isDict(value)?value:{};
 return {name:httpJsonName(row.name),url:httpJsonBaseUrl(row.url)};
}

/** What one read asks for: a path under the base URL (with its query string), the dotted path of the array that holds
 * the records (`data.items`; the answer itself, or its `items`, `data`, `results` or `records`, by default), and the
 * keys that give each record's ID, title and link, and its fields (each a dotted path; all top-level scalars by
 * default). `query` is the path alone, or these as a JSON object: {"path":"…","records":"…","id":"…","title":"…",
 * "url":"…","fields":["…"]}. */
export interface HttpJsonRequest {path:string;records?:string;id?:string;title?:string;url?:string;fields?:string[]}
const CONTROL=/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/,CONTROLS=new RegExp(CONTROL.source,'g');
const KEY_PATH=new RegExp(`^(?:\\$\\.)?[^.\\s]{1,${HTTP_JSON_LIMITS.key}}(?:\\.[^.\\s]{1,${HTTP_JSON_LIMITS.key}}){0,${HTTP_JSON_LIMITS.depth-1}}$`);
function keyPath(value:unknown,what:string):string {
 if(typeof value!=='string'||CONTROL.test(value)||!KEY_PATH.test(value.trim()))throw new ValueError(`Give ${what} as keys joined by dots, such as data.items, up to ${HTTP_JSON_LIMITS.depth} keys.`);
 return value.trim().replace(/^\$\./,'');
}
/** A path under the base URL: relative (a leading `/` is still under the base), no `..` or `.` segment in any
 * spelling, no fragment, no backslash, no spaces or control characters, no other address. */
export function httpJsonPath(value:unknown):string {
 const text=typeof value==='string'?value.trim():'';
 const plain=`Read a path under the endpoint's address, such as items?state=open, up to ${HTTP_JSON_LIMITS.path} characters.`;
 if(text.length>HTTP_JSON_LIMITS.path||CONTROL.test(text)||/[\s\\#]/.test(text)||/^[a-z][a-z0-9+.-]*:/i.test(text)||text.startsWith('//'))throw new ValueError(plain);
 const path=text.replace(/^\/+/,''),pathname=path.split('?')[0];
 let decoded:string;try{decoded=decodeURIComponent(pathname);}catch{throw new ValueError(plain);}
 if(decoded.split(/[/\\]/).some(segment=>segment==='..'||segment==='.')||/%2f|%5c/i.test(pathname))throw new ValueError('A path stays under the endpoint\'s address: no .. or encoded slashes.');
 return path;
}
export function httpJsonRequest(value:unknown):HttpJsonRequest {
 if(value===undefined||value===null||value==='')return {path:''};
 if(typeof value!=='string'||value.length>HTTP_JSON_LIMITS.query)throw new ValueError(`Ask HTTP JSON with a path, or a JSON object of up to ${HTTP_JSON_LIMITS.query} characters.`);
 const text=value.trim();
 if(!text.startsWith('{'))return {path:httpJsonPath(text)};
 let given:unknown;try{given=JSON.parse(text);}catch{throw new ValueError('The read is not valid JSON. Give a path, or {"path":"…","records":"…"}.');}
 if(!isDict(given))throw new ValueError('Give a path, or {"path":"…","records":"…"}.');
 const keys=['path','records','id','title','url','fields'];
 const other=Object.keys(given).find(key=>!keys.includes(key));
 if(other!==undefined)throw new ValueError(`An HTTP JSON read takes only ${keys.join(', ')}.`);
 const request:HttpJsonRequest={path:httpJsonPath(given.path??'')};
 if(given.records!==undefined)request.records=keyPath(given.records,'records');
 for(const key of ['id','title','url'] as const)if(given[key]!==undefined)request[key]=keyPath(given[key],key);
 if(given.fields!==undefined){
  if(!Array.isArray(given.fields)||!given.fields.length||given.fields.length>HTTP_JSON_LIMITS.fields)throw new ValueError(`Give fields as a list of 1 to ${HTTP_JSON_LIMITS.fields} keys.`);
  request.fields=[...new Set(given.fields.map((field:unknown)=>keyPath(field,'each field')))];
 }
 return request;
}

const cut=(value:string,limit:number)=>[...value].length>limit?[...value].slice(0,limit-1).join('')+'…':value;
const at=(value:unknown,path:string):unknown=>{
 let here:unknown=value;
 for(const key of path.split('.')){
  if(Array.isArray(here)&&/^\d+$/.test(key))here=here[Number(key)];
  else if(isDict(here)&&Object.hasOwn(here,key))here=here[key];
  else return undefined;
 }
 return here;
};
/** A value a record may hold: text (cut), a finite number or true/false; anything else is left out. */
function scalar(value:unknown):string|number|boolean|undefined {
 if(typeof value==='string')return cut(value.replace(CONTROLS,' '),HTTP_JSON_LIMITS.cell);
 if(typeof value==='number')return Number.isFinite(value)?value:undefined;
 if(typeof value==='boolean')return value;
 return undefined;
}
const first=(row:unknown,keys:readonly string[])=>{for(const key of keys){const value=scalar(at(row,key));if(value!==undefined&&value!=='')return value;}return undefined;};
const ID_KEYS=['id','key','slug','uuid','name'],TITLE_KEYS=['title','name','label','summary'],URL_KEYS=['url','html_url','link','href'];
const LIST_KEYS=['items','data','results','records'];

/** The answer's records: the array `records` names (the answer itself, or its first of items, data, results, records
 * that is an array, by default), one object as a single record, nothing else. */
function rows(answer:unknown,records:string|undefined):unknown[] {
 const chosen=records===undefined?answer:at(answer,records);
 if(records!==undefined&&chosen===undefined)throw new ValueError(`The answer has nothing at “${cut(records,80)}”.`);
 if(Array.isArray(chosen))return chosen;
 if(records===undefined&&isDict(chosen))for(const key of LIST_KEYS)if(Array.isArray(chosen[key]))return chosen[key] as unknown[];
 if(isDict(chosen))return [chosen];
 if(scalar(chosen)!==undefined)return [chosen];
 throw new ValueError('The answer holds no records.');
}
function shape(row:unknown,index:number,request:HttpJsonRequest,settings:HttpJsonSettings,fallback:string):ServiceRecord {
 const fields:Record<string,string|number|boolean>={};
 if(!isDict(row)){const value=scalar(row);if(value!==undefined)fields.value=value;}
 else if(request.fields)for(const key of request.fields){const value=scalar(at(row,key));if(value!==undefined&&key!=='__proto__')fields[key]=value;}
 else for(const [key,entry] of Object.entries(row)){
  if(Object.keys(fields).length>=HTTP_JSON_LIMITS.fields)break;
  const value=scalar(entry);
  if(value!==undefined&&key&&key!=='__proto__'&&!CONTROL.test(key))fields[cut(key,HTTP_JSON_LIMITS.key)]=value;
 }
 const id=String((request.id?scalar(at(row,request.id)):first(row,ID_KEYS))??index+1);
 const title=String((request.title?scalar(at(row,request.title)):first(row,TITLE_KEYS))??id);
 const link=request.url?scalar(at(row,request.url)):first(row,URL_KEYS);
 let url=fallback;
 if(typeof link==='string'){try{const parsed=new URL(link);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password)url=parsed.href;}catch{}}
 return {id:cut(`${settings.name}/${id.replace(CONTROLS,' ')}`,HTTP_JSON_LIMITS.title),title:cut(title.replace(CONTROLS,' '),HTTP_JSON_LIMITS.title)||id,url,fields};
}

/** The one read before an endpoint is kept: a GET of the base URL. An answer that is not JSON, or 404 there, still
 * shows the address answers and accepts the token; a refused token (401), a redirect or no answer does not. */
export async function checkHttpJson(http:ServiceHttp,settings:HttpJsonSettings):Promise<void> {
 try{await http.get(new URL(settings.url).pathname);}
 catch(error){
  const message=error instanceof Error?error.message:'';
  if(message===HTTP_JSON_GATE.missing||message===`${HTTP_JSON_GATE.title} returned an unsupported answer.`)return;
  throw error;
 }
}

/** `list`: the endpoints the person connected, by name, with their base URLs (never a token). */
export function httpJsonEndpoints(endpoints:readonly {settings:HttpJsonSettings;token:boolean}[]):ServiceRecords {
 return {provider:'http',operation:'list',scope:`The ${endpoints.length} HTTP JSON endpoints you connected · Read only`,
  records:endpoints.map(({settings,token})=>({id:settings.name,title:settings.name,url:settings.url,fields:{kind:'endpoint',host:new URL(settings.url).host,token}}))};
}

/** `read` with `id` naming the endpoint and `query` the request (httpJsonRequest): one GET, its records shaped. */
export async function readHttpJson(http:ServiceHttp,settings:HttpJsonSettings,body:ServiceRead|Record<string,any>):Promise<ServiceRecords> {
 if(!isDict(body)||body.operation!=='read')throw new ValueError('Unsupported HTTP JSON read. Use list or read.');
 if(body.cursor)throw new ValueError('HTTP JSON reads one page: put any page or limit in the path\'s query string.');
 const request=httpJsonRequest(body.query);
 const base=new URL(settings.url),target=new URL(request.path,base);
 if(target.origin!==base.origin||!target.pathname.startsWith(base.pathname))throw new ValueError('A path stays under the endpoint\'s address.');
 const answer=await http.get(target.pathname+target.search);
 const found=rows(answer,request.records);
 const records=found.slice(0,HTTP_JSON_LIMITS.records).map((row,index)=>shape(row,index,request,settings,target.href));
 const more=found.length>records.length?`the first ${records.length} of ${found.length} records`:`${records.length} records`;
 return {provider:'http',operation:'read',records,scope:`GET ${cut(target.host+target.pathname+target.search,200)} · ${more} · Read only`};
}
