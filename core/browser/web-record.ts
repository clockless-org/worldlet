/** What the built-in browser records of a website, and how a recording reads back (owner decision
 * 2026-10-04: Worldlet is the browser, so it keeps what happens in its pages, as text and data, never
 * pixels or sound). A Meetings call the person chose to transcribe adds its transcript as text
 * (`transcript` records, core/applets/meeting-transcript.ts); its audio is never kept. Hosts do the DevTools IO and storage; these rules decide what is kept, what is
 * never kept, and how the records read for Fox. Pure: no clock, no IO. */

export const WEB_RECORD={
 /** A response or request body kept whole up to this many characters; longer ones are cut and marked. */
 bodyLimit:2_000_000,
 /** One WebSocket or event-stream message. */
 messageLimit:256_000,
 /** One snapshot of a page's text. */
 textLimit:1_000_000,
 /** A typed value or a clicked label. */
 inputLimit:4000,
 /** Raw network records (bodies, WebSocket messages) are kept this many days; page text, typing,
  * clicks and visits stay until the person deletes them. */
 rawDays:30,
 /** All recordings together; above this the oldest raw network records go first. */
 maxBytes:2_000_000_000,
 /** A pause this long on one site starts a new visit. */
 visitGapSeconds:30*60,
 /** Requests followed at once in one page. */
 openRequests:2000,
 /** One read returns at most this many characters of a recording. */
 readLimit:24_000,
} as const;

export type WebRecordKind='page'|'text'|'text-more'|'request'|'response'|'ws-in'|'ws-out'|'sse'|'input'|'click'|'submit'|'gap'|'transcript';
export const RAW_KINDS:WebRecordKind[]=['request','response','ws-in','ws-out','sse'];
export interface WebRecord {at:number;kind:WebRecordKind;url:string;meta:Record<string,unknown>;body:string}
export interface WebVisit {id:string;site:string;url:string;title:string;applet:string;startedAt:number;endedAt:number}

/** The site a page belongs to: its host without a leading `www.`, or '' for anything not http(s). */
export function webSite(url:string):string {
 let parsed:URL;try{parsed=new URL(url);}catch{return '';}
 if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')return '';
 return parsed.hostname.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');
}

// Account sign-in, payment and banking pages are never recorded, nor anything sent to or from them.
const SIGN_IN_HOSTS=['accounts.google.com','appleid.apple.com','login.microsoftonline.com','login.live.com','auth0.com','okta.com'];
const SIGN_IN_HOST=/^(login|logon|auth|sso|signin|id|idp)\./;
const MONEY_HOSTS=/(^|\.)(paypal\.com|venmo\.com|stripe\.com|chase\.com|wellsfargo\.com|bankofamerica\.com|citi\.com|capitalone\.com|americanexpress\.com|usbank\.com|schwab\.com|fidelity\.com|vanguard\.com|robinhood\.com|coinbase\.com|alipay\.com|tenpay\.com)$|bank/;
// Anywhere in the path, not only whole segments: /wp-login.php, /users/sign_in, /reset-password, /api/payment_methods.
const PRIVATE_PATH=/log[-_]?(in|on)|sign[-_]?(in|up|on)|oauth|authori[sz]e|(^|[^a-z])auth([^a-z]|$)|callback|checkout|payment|billing|passw(or)?d|2fa|mfa|verify/i;
/** A page or request that is never recorded. */
export function privateWebAddress(url:string):boolean {
 let parsed:URL;try{parsed=new URL(url);}catch{return true;}
 if(parsed.username||parsed.password)return true;
 const host=parsed.hostname.toLowerCase().replace(/\.$/,'');
 if(SIGN_IN_HOSTS.some(name=>host===name||host.endsWith('.'+name))||SIGN_IN_HOST.test(host)||MONEY_HOSTS.test(host))return true;
 let path=parsed.pathname;try{path=decodeURIComponent(path);}catch{}
 return PRIVATE_PATH.test(path);
}
// Query values that only matter to a sign-in or a signed link.
const URL_SECRET=/^(code|key|state|nonce|ticket|sig|jwt|samlresponse|relaystate)$/i;
/** The address as stored: no credentials, and query or fragment values that look like secrets are hidden. */
export function cleanWebAddress(url:string):string {
 let parsed:URL;try{parsed=new URL(url);}catch{return '';}
 if(!['https:','http:','wss:','ws:'].includes(parsed.protocol))return '';
 parsed.username='';parsed.password='';
 for(const key of [...parsed.searchParams.keys()])if(SECRET_NAME.test(key)||URL_SECRET.test(key))parsed.searchParams.set(key,'[hidden]');
 if(/token|secret|code|session|key=|state=|nonce|jwt|sig/i.test(parsed.hash))parsed.hash='';
 return parsed.href.slice(0,4096);
}

/** A field, key, header or parameter name whose value is never recorded. The observer
 * (platform/bridge/web-record.js) runs a copy, which web-record-check holds equal to this one. */
export const SECRET_NAME=/^pass(word|wd|code|phrase)?$|password|passwd|pwd|passcode|secret|token|^auth$|authorization|^session(.?(id|key|token))?$|^sid$|cookie|credential|api.?key|card.?(number|no|num)|cc.?(num|number)|^cvv|^cvc|^csc|^cvn|(^|[^a-z])t?otp|otp$|mfa|2fa|one.?time|^code$|(sms|auth|verify|confirm|access|login|security|email|phone).?code|verification|^pin$|ssn|social.?security|iban|routing.?number|account.?number|signature|assertion|jwt|bearer|^refresh$|nonce|csrf|xsrf/i;
// What a person sent (a request body, a WebSocket message) can carry a sign-in token in free text.
const TOKEN_RUN=/[A-Za-z0-9+/=_.%-]{64,}/g;
const JWT=/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const DIGIT_RUN=/(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g;
const luhn=(digits:string)=>{let sum=0;for(let i=0;i<digits.length;i++){let d=Number(digits[digits.length-1-i]);if(i%2){d*=2;if(d>9)d-=9;}sum+=d;}return sum%10===0;};
/** JWTs and card numbers (Luhn-valid runs of 13–19 digits) anywhere in text are hidden. */
export function scrubCards(text:string):string {
 return String(text??'').replace(JWT,'[hidden]').replace(DIGIT_RUN,run=>{const digits=run.replace(/\D/g,'');return digits.length>=13&&luhn(digits)?'[hidden]':run;});
}
/** Long unbroken token-like runs, JWTs and card numbers in something the person's page sent are hidden. */
export function scrubSent(text:string):string {return scrubCards(String(text??'').replace(TOKEN_RUN,'[hidden]'));}
const FIELD_HINT=/\bpassword\b|^cc-|one-time-code|current-password|new-password/i;
/** A form field name, id, type, autocomplete hint or label that marks a value which is never recorded:
 * each hint is checked by itself and word by word. The observer runs the same rule in the page. */
export function secretField(...hints:unknown[]):boolean {
 return hints.some(hint=>typeof hint==='string'&&!!hint.trim()&&(FIELD_HINT.test(hint)||[hint.trim(),...hint.split(/[^A-Za-z0-9]+/)].some(word=>!!word&&SECRET_NAME.test(word))));
}

const DROPPED_HEADERS=new Set(['cookie','set-cookie','authorization','proxy-authorization','x-csrf-token','x-xsrf-token','x-api-key','x-auth-token','x-amz-security-token']);
const SECRET_HEADER=/session|key|sig|jwt|token|auth|cookie|csrf|xsrf/;
/** Headers kept with a record: everything except credentials, cookies and secret-looking values;
 * addresses in them lose their secret query values. */
export function cleanHeaders(headers:unknown):Record<string,string> {
 const out:Record<string,string>={};
 if(!headers||typeof headers!=='object')return out;
 for(const [name,value] of Object.entries(headers as Record<string,unknown>)){
  const key=name.toLowerCase();
  if(DROPPED_HEADERS.has(key)||SECRET_HEADER.test(key)||SECRET_NAME.test(key)||typeof value!=='string')continue;
  if(Object.keys(out).length>=40)break;
  const kept=/^(referer|origin|location|content-location)$/.test(key)?cleanWebAddress(value):value;
  if(kept)out[key]=kept.slice(0,500);
 }
 return out;
}

const TEXT_TYPE=/^(text\/(plain|html|xml|csv|markdown|x-markdown|calendar|vtt)|application\/([a-z0-9.+-]*\+)?(json|xml|x-ndjson|ld\+json|graphql|x-www-form-urlencoded|javascript-?json)|application\/vnd\.[a-z0-9.+-]*json)/i;
const KEPT_TYPES=new Set(['Document','XHR','Fetch','EventSource','Other','Prefetch']);
/** A response whose body is kept: a page document or data a page asked for, in a text format.
 * Scripts, styles, images, media and fonts are not recorded at all. */
export function keptResponse(resourceType:unknown,mimeType:unknown):boolean {
 return typeof resourceType==='string'&&KEPT_TYPES.has(resourceType)&&typeof mimeType==='string'&&TEXT_TYPE.test(mimeType.trim());
}
/** A request whose own record (method, address, body) is kept. */
export function keptRequest(resourceType:unknown):boolean {return typeof resourceType==='string'&&KEPT_TYPES.has(resourceType)&&resourceType!=='Other';}

// A key whose whole value is a payment card or method, and {name:"password",value:…} pairs.
const CARD_PARENT=/^((credit|debit|bank|payment).?)?card$|^cc$|^payment.?(method|source|details|info|data)?$|^billing.?(details|info)?$/i;
const PAIR_NAME=/^(name|key|field|id|label)$/i,PAIR_VALUE=/^(value|val|data|text|content)$/i;
/** JSON with values under secret-named keys, payment-card parents and secret name/value pairs hidden:
 * every such value when `all` (what was sent), text ones otherwise (what was received). */
function hideKeys(value:unknown,all:boolean):unknown {
 if(Array.isArray(value))return value.map(inner=>hideKeys(inner,all));
 if(!value||typeof value!=='object')return value;
 const entries=Object.entries(value as Record<string,unknown>);
 const pair=entries.some(([key,inner])=>PAIR_NAME.test(key)&&typeof inner==='string'&&SECRET_NAME.test(inner));
 return Object.fromEntries(entries.map(([key,inner])=>[key,
  CARD_PARENT.test(key)||pair&&PAIR_VALUE.test(key)||SECRET_NAME.test(key)&&(all||typeof inner==='string')?'[hidden]':hideKeys(inner,all)]));
}
// "secret":"value" in text that is not whole JSON (NDJSON, inline page data, a cut body).
const hideJsonText=(text:string)=>text.replace(/"([^"\\]{1,80})"(\s*:\s*)"((?:[^"\\]|\\.)*)"/g,(match,key,sep)=>SECRET_NAME.test(key)?`"${key}"${sep}"[hidden]"`:match);
const ATTR=(name:string)=>new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*'|[^\\s"'>]+)`,'i');
// Hidden and password inputs (CSRF tokens, prefilled values) and secret <meta> values in markup.
const hideMarkup=(text:string)=>text.replace(/<(input|meta)\b[^>]*>/gi,(tag,kind:string)=>{
 const name=(tag.match(ATTR('name'))?.[2]??'').replace(/^["']|["']$/g,'');
 if(kind.toLowerCase()==='meta')return SECRET_NAME.test(name)?tag.replace(ATTR('content'),'$1"[hidden]"'):tag;
 return /\stype\s*=\s*["']?(hidden|password)\b/i.test(tag)||secretField(name)?tag.replace(ATTR('value'),'$1"[hidden]"'):tag;
});
const FORM_SHAPE=/^[^\s=&]+=[^\s&]*(&[^\s=&]+=[^\s&]*)*$/;
const formDecode=(text:string)=>{try{return decodeURIComponent(text.replace(/\+/g,' '));}catch{return text;}};
/** Form fields with secret names hidden; other values scrubbed one by one, the marker left readable. */
function cleanForm(text:string,scrub:(value:string)=>string):string {
 return text.split('&').map(pair=>{
  const at=pair.indexOf('=');if(at<0)return pair;
  const key=pair.slice(0,at),plain=formDecode(pair.slice(at+1));
  if(SECRET_NAME.test(formDecode(key)))return key+'=[hidden]';
  const kept=scrub(plain);
  return kept===plain?pair:key+'='+kept.split('[hidden]').map(encodeURIComponent).join('[hidden]');
 }).join('&');
}
const hideJwt=(text:string)=>text.replace(JWT,'[hidden]');

/** A request body as stored: JSON and form fields with secret-looking names are hidden. */
export function cleanRequestBody(body:string,contentType=''):string {
 const text=String(body??'');
 if(!text)return '';
 if(/json/i.test(contentType)||/^\s*[{[]/.test(text)){
  try{
   const parsed=JSON.parse(text);
   // A GraphQL sign-in or password change is not kept at all.
   if([parsed].flat().some(op=>op&&typeof op==='object'&&typeof op.query==='string'&&/passw(or)?d|pwd/i.test(op.query)))return '';
   return clip(scrubSent(JSON.stringify(hideKeys(parsed,true))),WEB_RECORD.bodyLimit).text;
  }catch{}
 }
 if(/x-www-form-urlencoded/i.test(contentType)||FORM_SHAPE.test(text.slice(0,4000)))return clip(cleanForm(text,scrubSent),WEB_RECORD.bodyLimit).text;
 // A body in another format cannot be checked field by field, so only text without secret-looking
 // words or multipart field names is kept.
 if(SECRET_NAME.test(text.slice(0,20000))||[...text.matchAll(/\bname="([^"]*)"/g)].some(match=>secretField(match[1])))return '';
 return clip(scrubSent(text),WEB_RECORD.bodyLimit).text;
}

/** A received body as stored, before it is cut: secret-looking JSON and form fields (tokens, sessions),
 * JWTs, hidden-input and CSRF values are hidden. */
export function cleanResponseBody(body:string,contentType=''):string {
 const text=String(body??'');
 if(/json/i.test(contentType)){
  try{return hideJwt(JSON.stringify(hideKeys(JSON.parse(text),false)));}catch{}
 }
 if(/x-www-form-urlencoded/i.test(contentType)||FORM_SHAPE.test(text.slice(0,4000)))return cleanForm(text,hideJwt);
 return hideMarkup(hideJwt(hideJsonText(text)));
}

/** A WebSocket or event-stream text message as stored: JSON (also after a Socket.IO-style number)
 * has its secret keys hidden as in bodies; what was sent also loses token runs and card numbers. */
export function cleanMessage(text:string,sent:boolean):string {
 let value=String(text??'');
 const json=value.match(/^(\d*)\s*([{[][\s\S]*)$/);
 try{if(!json)throw 0;value=json[1]+JSON.stringify(hideKeys(JSON.parse(json[2]),sent));}catch{value=hideJsonText(value);}
 return sent?scrubSent(value):hideJwt(value);
}

export function clip(text:string,limit:number):{text:string;truncated:boolean} {
 const value=String(text??'');
 return value.length>limit?{text:value.slice(0,limit),truncated:true}:{text:value,truncated:false};
}

/** Which visit a record joins: the current one, or a new one when the site changed or the person
 * was away from it for a while. */
export function continuesVisit(visit:{site:string;lastAt:number}|null,site:string,at:number):boolean {
 return !!visit&&!!site&&visit.site===site&&at-visit.lastAt<WEB_RECORD.visitGapSeconds;
}

const time=(seconds:number,offsetMinutes:number)=>{
 const date=new Date((seconds+offsetMinutes*60)*1000);
 return date.toISOString().slice(11,19);
};
const day=(seconds:number,offsetMinutes:number)=>new Date((seconds+offsetMinutes*60)*1000).toISOString().slice(0,10);
const size=(n:number)=>n>=1_000_000?(n/1_000_000).toFixed(1)+' MB':n>=1000?(n/1000).toFixed(1)+' KB':n+' B';
const meta=(record:WebRecord,key:string)=>typeof record.meta?.[key]==='string'||typeof record.meta?.[key]==='number'?String(record.meta[key]):'';

/** A very long line (a JSON message, a minified payload) shortens to its start in a first read; the
 * whole record reads with `full`. Repeated per-turn state is most of a long game's bytes, so a long
 * line that starts like one already shown in the same read (`seen`: its first characters → record
 * number) shortens further and names that record. */
export const LONG_LINE={keep:300,over:600,again:80,shape:24} as const;
function compact(body:string,index:number|undefined,seen?:Map<string,number>){
 return body.split('\n').map(line=>{
  if(line.length<=LONG_LINE.over)return line;
  const shape=line.slice(0,LONG_LINE.shape),like=seen?.get(shape);
  if(like!==undefined&&like!==index)return line.slice(0,LONG_LINE.again)+` … [+${line.length-LONG_LINE.again} characters, shaped like #${like}]`;
  if(seen&&index!==undefined&&like===undefined)seen.set(shape,index);
  return line.slice(0,LONG_LINE.keep)+` … [+${line.length-LONG_LINE.keep} characters]`;
 }).join('\n');
}
/** One record as a readable line (or block), in the visit's own time zone. */
export function webRecordLine(record:WebRecord,offsetMinutes=0,{index,full=true,seen}:{index?:number;full?:boolean;seen?:Map<string,number>}={}):string {
 const at=time(record.at,offsetMinutes)+(index===undefined?'':' #'+index),body=full?record.body||'':compact(record.body||'',index,seen);
 const cut=record.meta?.truncated===true?' (cut)':'';
 switch(record.kind){
  case 'page':return `[${at}] Page ${record.url}${meta(record,'title')?' — '+meta(record,'title'):''}`;
  case 'text':return `[${at}] Page text${cut}:\n${body}`;
  case 'text-more':return `[${at}] New on the page:\n${body}`;
  case 'request':return `[${at}] Sent ${meta(record,'method')||'POST'} ${record.url}${body?':\n'+body:''}`;
  case 'response':return `[${at}] Received ${meta(record,'status')} ${meta(record,'method')||'GET'} ${record.url} (${meta(record,'mime')}, ${size(Number(record.meta?.size)||body.length)})${cut}${body?':\n'+body:''}`;
  case 'ws-in':return record.meta?.binary?`[${at}] WebSocket binary message received (${size(Number(record.meta?.size)||0)})`:`[${at}] WebSocket received:\n${body}`;
  case 'ws-out':return record.meta?.binary?`[${at}] WebSocket binary message sent (${size(Number(record.meta?.size)||0)})`:`[${at}] WebSocket sent:\n${body}`;
  case 'sse':return `[${at}] Event stream${meta(record,'event')?' '+meta(record,'event'):''}:\n${body}`;
  case 'input':return `[${at}] Typed into ${meta(record,'field')||'a field'}: ${body}`;
  case 'click':return `[${at}] Clicked ${body?'“'+body+'”':'the page'}${meta(record,'href')?' → '+meta(record,'href'):''}`;
  case 'submit':return `[${at}] Submitted a form${body?': '+body:''}`;
  case 'gap':return `[${at}] Not recorded: ${meta(record,'reason')||'some of this visit'}`;
  case 'transcript':return `[${at}] ${meta(record,'speaker')||'Someone'} said${meta(record,'meeting')?' in “'+meta(record,'meeting')+'”':''}: ${body.replace(/^(?:You|Others): /,'')}`;
 }
 return '';
}

/** A visit's records as text for Fox, oldest first, from `offset` (a record number); stops before
 * `limit` characters and says where to continue. Each record carries its number (#n, its `index` when
 * the host read a filtered slice); without `full` very long lines are shortened, and `pages` (the
 * visit's address changes, first read only) lets Fox jump to one page, such as one game, by its number.
 * `after` is how many records the read could still return from `offset` on. */
export function webTranscript(visit:WebVisit,records:(WebRecord&{index?:number})[],{offset=0,limit=WEB_RECORD.readLimit,offsetMinutes=0,total,after,full=true,pages=[]}:{offset?:number;limit?:number;offsetMinutes?:number;total?:number;after?:number;full?:boolean;pages?:{index:number;url:string;title?:string;at:number}[]}={}){
 const head=`${visit.title||visit.site} (${visit.site}) · ${day(visit.startedAt,offsetMinutes)} ${time(visit.startedAt,offsetMinutes)}–${time(visit.endedAt,offsetMinutes)}`
  +(pages.length>1?'\nPages in this visit (read one from its #):\n'+pages.slice(-60).map(page=>`#${page.index} ${time(page.at,offsetMinutes)} ${page.url}${page.title?' — '+page.title:''}`).join('\n'):'')
  +(full?'':'\nLong lines are shortened; read a record whole with full and its #.');
 const lines:string[]=[],seen=new Map<string,number>();let used=head.length,shown=0,read=0;
 for(const [i,record] of records.entries()){
  let line=webRecordLine(record,offsetMinutes,{index:record.index??offset+i,full,seen});
  if(line&&used+line.length>limit){
   if(shown>0)break;
   line=line.slice(0,Math.max(200,limit-used))+' … (cut)';
  }
  read++;
  if(!line)continue;
  lines.push(line);used+=line.length+1;shown++;
 }
 const next=read?(records[read-1].index??offset+read-1)+1:offset,left=after??(total===undefined?records.length:total-offset);
 return {text:[head,...lines].join('\n'),nextOffset:read<left?next:null,records:shown};
}

/** Search arguments as the host runs them: a few plain terms, a time range in seconds and paging. */
export function webSearchPlan(args:Record<string,unknown>,now:number){
 const terms=String(args.query??'').normalize('NFC').split(/[\s　]+/u).map(term=>term.trim()).filter(term=>term.length>0).slice(0,8);
 const instant=(value:unknown)=>{
  if(typeof value!=='string'||!value.trim())return null;
  const parsed=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00':value);
  return Number.isFinite(parsed)?parsed/1000:null;
 };
 const site=typeof args.site==='string'?webSite(args.site.includes('://')?args.site:'https://'+args.site):'';
 const offset=Number.isInteger(args.offset)&&Number(args.offset)>0?Number(args.offset):0;
 return {terms,site,after:instant(args.after),before:instant(args.before)??now+1,offset,limit:10};
}
