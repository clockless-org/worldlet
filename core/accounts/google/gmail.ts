import {HtmlParser,WS,pyStrip,type HtmlAttrs} from './html-parser.ts';
import type {GoogleRest} from './rest.ts';
/** Bounded read-only Gmail pages. Unread queries have no arbitrary age cutoff. Ported from the Gmail reader of
 * Worldlet's former built-in Hermes, whose pages, errors and excerpts it keeps byte for byte. Lengths count characters
 * as Python does (code points). */

const space=new RegExp(`${WS}+`,'g'),isSpace=new RegExp(`^${WS}$`);
const word='\\p{L}\\p{N}_';
/** A Python (?i) word: its `i` also matches dotless ı and dotted İ, as Python's case folding does. */
const ci=(s:string)=>s.replace(/i/g,'[i\\u0130\\u0131]');
const cpLength=(s:string)=>{let n=0;for(const _ of s)n++;return n;};
/** s[:n] in Python: the first n code points. */
const cpSlice=(s:string,n:number)=>{if(s.length<=n)return s;let out='',k=0;for(const c of s){if(k++>=n)break;out+=c;}return out;};
const pySplit=(s:string)=>s.split(space).filter(Boolean);
const own=(o:any,k:string)=>o!=null&&typeof o==='object'&&Object.hasOwn(o,k);
/** dict.get(k,fallback). */
const get=(o:any,k:string,fallback?:any)=>own(o,k)&&o[k]!==undefined?o[k]:fallback;
/** Python truthiness: empty lists and dicts are false too. */
const truthy=(v:unknown)=>Array.isArray(v)?v.length>0:v&&typeof v==='object'?Object.keys(v).length>0:!!v;
/** str() of a JSON value. */
const pyStr=(v:unknown)=>typeof v==='string'?v:v===null||v===undefined?'None':v===true?'True':v===false?'False':typeof v==='number'?String(v):JSON.stringify(v);

type Attrs=Record<string,string|null>;
export interface MailPicture {src:string;width:number;height:number;alt:string}

/** Email HTML as readable Markdown: paragraphs, headings, lists, quotes and labelled links.
 *
 * Layout tables, hidden preheaders, tracking pixels and styles are dropped; the sender's
 * words and link targets are kept. */
export class MailText extends HtmlParser {
 static blocks=new Set(['p','div','tr','table','section','article','header','footer','center','ul','ol','h5','h6','dl','dd','dt','address','pre']);
 static headings:Record<string,string>={h1:'## ',h2:'## ',h3:'### ',h4:'### '};
 static void=new Set(['br','img','hr','meta','link','input','col','area','base','wbr','source']);
 parts:string[]=[];hidden=0;link:[number,string]|null=null;stack:[string,boolean][]=[];bold:number[]=[];images:MailPicture[]=[];
 static concealed(attrs:Attrs){
  const style=(attrs.style||'').toLowerCase().replaceAll(' ','');
  return style.includes('display:none')||style.includes('mso-hide:all')||style.includes('max-height:0')&&style.includes('overflow:hidden')||attrs.hidden!=null||attrs['aria-hidden']==='true'&&style.includes('font-size:0');
 }
 override handle_starttag(tag:string,list:HtmlAttrs){
  const attrs:Attrs=Object.create(null);
  for(const [name,value] of list)attrs[name]=value;
  if(MailText.void.has(tag)){
   if(this.hidden)return;
   if(tag==='br')this.parts.push('\n');
   else if(tag==='hr')this.parts.push('\n\n---\n\n');
   else if(tag==='img'){
    const alt=pyStrip(attrs.alt||''),picture=contentImage(attrs);
    if(picture&&this.images.length<8)this.images.push(picture);
    // A linked image's alt is the link label; elsewhere only a sentence-like alt is
    // content. Logos, spacers and tracking pixels add only noise.
    if(cpLength(alt)>1&&(this.link||pySplit(alt).length>3)&&!PLACEHOLDER_ALT.test(alt)&&!['0','1'].includes(attrs.width||''))this.parts.push(alt);
   }
   return;
  }
  const hide=['style','script','head','title','template'].includes(tag)||MailText.concealed(attrs);
  this.stack.push([tag,hide]);
  if(hide)this.hidden++;
  if(this.hidden)return;
  if(Object.hasOwn(MailText.headings,tag))this.parts.push('\n\n'+MailText.headings[tag]);
  else if(MailText.blocks.has(tag))this.parts.push('\n\n');
  else if(tag==='blockquote')this.parts.push('\n\n\x02');
  else if(tag==='li')this.parts.push('\n- ');
  else if(tag==='td'||tag==='th')this.parts.push(' ');
  else if(tag==='strong'||tag==='b'){this.bold.push(this.parts.length);this.parts.push('**');}
  else if(tag==='a'){
   // A valueless attribute (<a href>) has no value.
   // A malformed marketing link must not abort the entire sync page.
   const url=attrs.href||'';
   if(url.startsWith('https://')||url.startsWith('http://')||url.startsWith('mailto:'))this.link=[this.parts.length,url];
  }
 }
 override handle_endtag(tag:string){
  if(MailText.void.has(tag))return;
  // Close the nearest matching element; unclosed children in sloppy mail close with it.
  let index=this.stack.length-1;
  while(index>=0&&this.stack[index][0]!==tag)index--;
  if(index<0)return;
  const closing=this.stack.splice(index),visible=!this.hidden;
  this.hidden-=closing.filter(([,hide])=>hide).length;
  if(!visible)return;
  const parts=this.parts;
  if(tag==='a'&&this.link){
   const [start,url]=this.link,label=pyStrip(pyStrip(parts.slice(start).join('').replace(space,' ')).replace(/^\*+|\*+$/g,''));
   parts.splice(start,parts.length,'['+(label||url).replaceAll(']','\\]')+'](<'+url.replaceAll('>','%3E')+'>)');
   this.link=null;
  }
  if(tag==='strong'||tag==='b'){
   const start=this.bold.length?this.bold.pop():-1;
   if(0<=start&&start<parts.length&&parts[start]==='**'){
    const inner=parts.slice(start+1).join('');
    // Emphasis that spans blocks, wraps a link or holds nothing would show as stray asterisks.
    if(!pyStrip(inner)||inner.includes('\n')||inner.includes('[')||this.link&&this.link[0]>start)parts[start]='';
    else parts.splice(start,parts.length,(isSpace.test(inner[0])?' ':'')+'**'+pyStrip(inner)+'**'+(isSpace.test(inner[inner.length-1])?' ':''));
   }
  }
  if(tag==='blockquote')parts.push('\x03\n\n');
  else if(MailText.blocks.has(tag)||Object.hasOwn(MailText.headings,tag))parts.push('\n\n');
 }
 override handle_data(data:string){if(!this.hidden)this.parts.push(data.replace(space,' '));}
 text(){return tidyMail(this.parts.join(''));}
 /** The sender's main picture: the first one declared at least banner-sized, else the first unsized one. */
 picture():MailPicture|null{return this.images.find(p=>p.width>=MIN_PICTURE_WIDTH)??this.images.find(p=>!p.width)??null;}
}
const PLACEHOLDER_ALT=new RegExp(`^(?:${ci('logo|image|spacer|icon|banner|pixel|img')})[^${word}]*[${word}]{0,3}$`,'iu');

// An email's own picture can stand in for Worldlet's illustration on its Attention card. Only content
// pictures qualify: HTTPS, not declared smaller than a banner, and never a logo, icon, avatar, social
// badge, spacer or tracking pixel (by its alt, file name or address).
export const MIN_PICTURE_WIDTH=280;
const NOT_CONTENT=new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${ci('logos?|icons?|avatars?|badges?|spacer|pixel|beacon|track(?:ing)?|open|blank|clear|transparent|signature|facebook|twitter|instagram|linkedin|youtube|tiktok|pinterest|whatsapp|wechat|social|app-?store|google-?play|unsubscribe|footer')})(?:$|[^\\p{L}\\p{Nl}\\p{No}])`,'iu');
const NOT_CONTENT_ALT=new RegExp(`(?<![${word}])(?:${ci('logos?|icons?|avatars?|badges?|spacer|pixel|signature|facebook|twitter|instagram|linkedin|youtube|tiktok|pinterest|whatsapp|wechat|app store|google play')})(?![${word}])`,'iu');
/** int() of Unicode decimal digits: every Nd run is whole blocks of 0–9. */
const digits=(s:string)=>{let n=0;for(const c of s){let zero=c.codePointAt(0),k=0;while(/\p{Nd}/u.test(String.fromCodePoint(zero-1))){zero--;k++;}n=n*10+k%10;}return n;};
export function contentImage(attrs:Attrs):MailPicture|null{
 const src=pyStrip(attrs.src||'');
 if(!src.startsWith('https://')||cpLength(src)>2000||new RegExp(WS).test(src))return null;
 const size=(name:string)=>{
  const value=new RegExp(`^${WS}*(\\p{Nd}+)(?:px)?${WS}*$`,'u').exec(attrs[name]||'');
  const style=new RegExp(`(?:^|;)${WS}*${name}${WS}*:${WS}*(\\p{Nd}+)px`,'u').exec((attrs.style||'').toLowerCase());
  return value?digits(value[1]):style?digits(style[1]):0;
 };
 const width=size('width'),height=size('height');
 if(0<width&&width<MIN_PICTURE_WIDTH||0<height&&height<120)return null;
 const alt=pyStrip(attrs.alt||''),path=src.split('?')[0].split('#')[0],slashes=path.split('/');
 if(NOT_CONTENT_ALT.test(alt)||NOT_CONTENT.test(slashes[slashes.length-1])||NOT_CONTENT.test(slashes.length>=3?slashes[2]:''))return null;
 return {src,width,height,alt:cpSlice(alt,200)};
}

const INVISIBLE=/[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ﻿ﾠ]/gu;
const quoteRuns=new RegExp(`\\n(?:>${WS}*\\n){2,}`,'g'),bareBullets=new RegExp(`(?<=^|\\n)(?:-${WS}*)(?=\\n|$)\\n?`,'g');
/** Even paragraph spacing: no invisible padding, empty emphasis or runs of blank lines. */
export function tidyMail(text:string):string{
 text=text.replace(INVISIBLE,'').replaceAll(' ',' ').replaceAll('\r\n','\n');
 // Innermost quotes first, so nested replies gain one marker per level.
 for(;;){
  const changed=text.replace(/\x02([^\x02\x03]*)\x03/g,(_,inner:string)=>tidyMail(inner).split('\n').map(line=>pyStrip(line)?'> '+line:'>').join('\n'));
  if(changed===text)break;
  text=changed;
 }
 text=text.replaceAll('\x02','').replaceAll('\x03','');
 text=text.split('\n').map(line=>pyStrip(line.replace(/[ \t]+/g,' '))).join('\n');
 text=text.replace(quoteRuns,'\n>\n');
 text=text.replace(/\n{3,}/g,'\n\n');
 text=text.replace(bareBullets,'');
 return pyStrip(text);
}

const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{ignoreBOM:true});
const B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** base64.urlsafe_b64decode: binascii's lenient decoder. Other characters are skipped and so is padding, which only
 * excuses an unfinished final group. */
function base64Decode(text:string){
 if(/[^\x00-\x7f]/.test(text))throw new Error('string argument should contain only ASCII characters');
 const out=new Uint8Array(Math.floor((text.length+3)/4)*3);
 let size=0,quad=0,left=0,pads=0,padded=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='='){if(quad>=2&&quad+ ++pads>=4)padded=true;continue;}
  const v=c==='-'?62:c==='_'?63:B64.indexOf(c);
  if(v<0)continue;
  pads=0;padded=false;
  if(quad===0){left=v;quad=1;}
  else if(quad===1){out[size++]=left<<2|v>>4;left=v&0x0f;quad=2;}
  else if(quad===2){out[size++]=(left<<4|v>>2)&0xff;left=v&0x03;quad=3;}
  else {out[size++]=(left<<6|v)&0xff;quad=0;}
 }
 if(quad===1&&!padded)throw new Error(`Invalid base64-encoded string: number of data characters (${Math.floor(size/3)*4+1}) cannot be 1 more than a multiple of 4`);
 if(quad&&!padded)throw new Error('Incorrect padding');
 return out.slice(0,size);
}
function base64UrlEncode(bytes:Uint8Array){
 const chars=B64.slice(0,62)+'-_';let out='';
 for(let i=0;i<bytes.length;i+=3){
  const n=bytes[i]<<16|(bytes[i+1]??0)<<8|(bytes[i+2]??0);
  out+=chars[n>>18&63]+chars[n>>12&63]+(i+1<bytes.length?chars[n>>6&63]:'=')+(i+2<bytes.length?chars[n&63]:'=');
 }
 return out;
}
/** Valid UTF-8 cut to at most limit bytes without a partial character: bytes[:limit].decode('utf-8','ignore'). */
function utf8Cut(bytes:Uint8Array,limit:number){
 if(bytes.length<=limit)return decoder.decode(bytes);
 let start=limit;
 while(start>0&&(bytes[start]&0xc0)===0x80)start--;
 return decoder.decode(bytes.subarray(0,start));
}
const utf8Length=(s:string)=>encoder.encode(s).length;
/** len(json.dumps(value)): Python's default separators, every non-ASCII UTF-16 unit as \uXXXX. */
export function jsonSize(value:unknown):number{
 if(value===null||value===undefined)return 4;
 if(typeof value==='boolean')return value?4:5;
 if(typeof value==='number')return String(value).length;
 if(typeof value==='string'){let n=2;for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);n+=c===0x22||c===0x5c||c===8||c===9||c===10||c===12||c===13?2:c<0x20||c>0x7e?6:1;}return n;}
 if(Array.isArray(value))return 2+value.reduce((n,v,i)=>n+(i?2:0)+jsonSize(v),0);
 return 2+Object.entries(value).reduce((n,[k,v],i)=>n+(i?2:0)+jsonSize(k)+2+jsonSize(v),0);
}

const HEADERS=['subject','from','to','cc','date','message-id','in-reply-to','references'];
/** Transport a bounded readable excerpt; never send inline MIME binaries. A null limit keeps the whole message. */
export function compactMessage(message:any,limit:number|null=24000){
 const plain:string[]=[],rich:string[]=[],attachments:any[]=[],pictures:MailPicture[]=[];
 const visit=(part:any,depth=0)=>{
  if(depth>20)return;
  const body=truthy(get(part,'body'))?part.body:{};
  if(truthy(get(part,'filename'))){
   if(limit===null||attachments.length<30)attachments.push({filename:limit===null?part.filename:cpSlice(part.filename,256),body:{size:get(body,'size',0)}});
   return;
  }
  const mime=get(part,'mimeType','');
  if((mime==='text/plain'||mime==='text/html')&&truthy(get(body,'data'))){
   const raw:string=body.data,text=decoder.decode(base64Decode(raw+'='.repeat((4-cpLength(raw)%4)%4)));
   if(mime==='text/plain')plain.push(text);
   else {
    const parser=new MailText();parser.feed(text);parser.close();rich.push(parser.text());
    if(parser.picture())pictures.push(parser.picture());
   }
  }
  for(const child of get(part,'parts',[]))visit(child,depth+1);
 };
 visit(get(message,'payload',{}));
 // The HTML part is the message as its sender laid it out; its plain alternative is often
 // an automatic flattening with bare tracking URLs. Use plain text only when it is all there is.
 let text:string=rich.filter(part=>pyStrip(part)).join('\n')||plain.join('\n')||get(message,'snippet','');
 const raw=encoder.encode(text),truncated=limit!==null&&raw.length>limit;
 text=limit===null?decoder.decode(raw):utf8Cut(raw,limit);
 if(truncated)text+='\n[Excerpt shortened. Open the original in Gmail for the complete message.]';
 const headers=(get(get(message,'payload',{}),'headers',[]) as any[]).filter(h=>HEADERS.includes(get(h,'name','').toLowerCase())).map(h=>{
  const value=pyStr(get(h,'value',''));
  return {name:get(h,'name',''),value:limit===null?value:cpSlice(value,1000)};
 }).slice(0,12);
 let remaining=limit!==null?2000:headers.reduce((n,h)=>n+utf8Length(h.value),0);
 for(const header of headers){header.value=utf8Cut(encoder.encode(header.value),remaining);remaining-=utf8Length(header.value);}
 const result:any={};
 for(const k of ['id','threadId','labelIds','internalDate','historyId','sizeEstimate'])if(own(message,k))result[k]=message[k];
 result.snippet=cpSlice(get(message,'snippet',''),1000);
 result.payload={mimeType:'text/plain',headers,body:{data:base64UrlEncode(encoder.encode(text))},parts:attachments};
 result.excerptTruncated=truncated;
 if(pictures.length)result.picture=pictures[0];
 return result;
}

/** int() of a JSON number or decimal string. */
function pyInt(v:unknown){
 if(typeof v==='number')return Math.trunc(v);
 const s=pyStrip(String(v));
 if(!/^[+-]?\d+(?:_\d+)*$/.test(s))throw new Error(`invalid literal for int() with base 10: '${v}'`);
 return Number(s.replaceAll('_',''));
}
const fail=(message:string):never=>{throw new Error(message);};
export interface MailPage {scannedCount:number;records:{id:string;data:any}[];metadataOnly:boolean;query:string;unreadOnly:boolean;nextPageToken:string;scope:string}

/** One page of messages or threads: recent 30 days, unread, a search, or one thread by ID (complete, never shortened). */
export async function readPage(api:GoogleRest,body:Record<string,unknown>,email:string):Promise<MailPage>{
 const limit=get(body,'limit',20);
 if(typeof limit!=='number'||!Number.isInteger(limit)||!(1<=limit&&limit<=20))fail('Gmail limit must be between 1 and 20.');
 const unread=get(body,'unreadOnly',false);
 if(typeof unread!=='boolean')fail('unreadOnly must be a boolean.');
 const token=get(body,'pageToken','');
 if(typeof token!=='string'||cpLength(token)>2048)fail('Invalid Gmail page token.');
 const queryText=get(body,'query',''),metadata=get(body,'metadataOnly',false);
 if(typeof queryText!=='string'||cpLength(queryText)>512||queryText.includes('\x00'))fail('Invalid Gmail search query.');
 if(typeof metadata!=='boolean')fail('metadataOnly must be a boolean.');
 let identifier=get(body,'id','');
 if(typeof identifier!=='string')fail('Invalid Gmail thread ID.');
 if(identifier.startsWith('thread:'))identifier=identifier.slice(7);
 if(identifier&&(identifier.length>64||/[^0-9a-fA-F]/.test(identifier)))fail('Invalid Gmail thread ID.');
 if(identifier&&(token||unread||queryText))fail('Use either a thread ID or a filtered page, not both.');
 const threads=truthy(get(body,'threads')),scanMessages=get(body,'scanMessages',false);
 if(typeof scanMessages!=='boolean')fail('Invalid scan mode.');
 const key=scanMessages?'messages':threads?'threads':'messages';
 const query=(queryText?'('+queryText+') '+(unread?'is:unread ':''):unread?'is:unread ':'newer_than:30d ')+'-in:spam -in:trash';
 const listing=identifier?{[key]:[{id:identifier}]}:await api.get(`gmail/v1/users/me/${key}`,{q:query,maxResults:limit,...(token?{pageToken:token}:{})});
 const seen=new Set<string>(),items:any[]=[];
 for(let item of get(listing,key,[])){
  if(scanMessages){
   const threadId=get(item,'threadId');
   if(!truthy(threadId))fail('Message has no thread identity.');
   if(seen.has(threadId))continue;
   seen.add(threadId);
   item={id:threadId};
  }
  items.push(item);
 }
 const resource=scanMessages?'threads':key;
 const fetched=items.length?await api.getAll(items.map(item=>({path:`gmail/v1/users/me/${resource}/${encodeURIComponent(item.id)}`,query:{format:metadata?'metadata':'full',...(metadata?{metadataHeaders:['Subject','From','To','Date']}:{})}}))):[];
 const records:MailPage['records']=[];
 items.forEach((item,n)=>{
  let data=fetched[n];
  const messages:any[]=threads?get(data,'messages',[]):[data];
  // A user may read a thread between list and get. Do not call it unread.
  if(unread&&!messages.some(m=>get(m,'labelIds',[]).includes('UNREAD')))return;
  if(threads){
   let recent=messages.map(m=>[pyInt(get(m,'internalDate',0)),m] as [number,any]).sort((a,b)=>b[0]-a[0]).map(([,m])=>m);
   if(!identifier)recent=recent.slice(0,8);
   const thread:any={};
   for(const k of ['id','historyId'])if(own(data,k))thread[k]=data[k];
   thread.messages=recent.map(m=>compactMessage(m,identifier?null:Math.floor(12000/Math.max(1,recent.length))));
   thread.messagesOmitted=Math.max(0,messages.length-recent.length);
   data=thread;
  }else data=compactMessage(data,identifier?null:24000);
  if(identifier&&jsonSize(data)>1800000)fail('This complete email is too large for the reader. Open the original in Gmail; no shortened copy is shown.');
  records.push({id:(threads?'thread:':'')+item.id,data:threads?{thread:data,userEmail:email}:data});
 });
 return {scannedCount:get(listing,key,[]).length,records,metadataOnly:metadata,query,unreadOnly:unread,nextPageToken:get(listing,'nextPageToken',''),
  scope:(queryText?'Search matches':unread?'Unread':'Recent 30 days')+(threads?' threads':' messages')+' · This page only, up to 20 · Read only; no read state changed'};
}

// Metadata-first; the model must fetch promising threads before publishing evidence.
export const DISCOVERY_QUERIES:[string,string][]=[
 ['recent','newer_than:30d'],
 ['meetings','newer_than:30d {"invitation" "meeting" "appointment" "会议" "预约"}'],
 ['renewals','newer_than:30d {"trial ends" "renewal" "renews" "续费" "试用到期"}'],
 ['obligations','newer_than:30d {"RSVP" "please confirm" "action required" "deadline" "请确认" "截止"}'],
];
/** Four metadata searches of the past 30 days, each thread once. */
export async function discover(api:GoogleRest,email:string,body?:Record<string,unknown>|null){
 body=truthy(body)?body:{};
 if(get(body,'discovery',true)!==true||['id','pageToken','query','unreadOnly'].some(k=>truthy(get(body,k))))fail('Discovery cannot be combined with a thread ID or other search filters.');
 const records:MailPage['records']=[],seen=new Set<string>(),coverage:{family:string;count:number;hasMore:boolean}[]=[];
 for(const [family,query] of DISCOVERY_QUERIES){
  const page=await readPage(api,{threads:true,metadataOnly:true,query,limit:5},email);
  coverage.push({family,count:page.records.length,hasMore:truthy(page.nextPageToken)});
  for(const row of page.records)if(!seen.has(row.id)){seen.add(row.id);records.push(row);}
 }
 return {ok:true as const,records,metadataOnly:true as const,coverage,
  scope:'Four searches within the past 30 days, up to five threads each (20 total); read/unread and archived mail included, spam/trash excluded. Metadata only; not an exhaustive inbox check.'};
}
