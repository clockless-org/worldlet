import {HTML5_ENTITIES} from './html-entities.ts';
/** Python's html.parser.HTMLParser (3.13, convert_charrefs=True) and html.unescape, ported so the Gmail reader reads
 * real-world mail exactly as its Python original did: unclosed and stray tags, RAWTEXT/RCDATA elements, comments,
 * declarations and character references all tokenize the same way. Subclasses override the handle_* methods. */

/** Python's str.isspace() characters; `\s` in a Python str pattern. */
export const WS='[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const edges=new RegExp(`^${WS}+|${WS}+$`,'g');
/** Python's str.strip() with no argument. */
export const pyStrip=(s:string)=>s.replace(edges,'');

const INVALID_CHARREFS=new Map<number,string>([[0x00,'�'],[0x0d,'\r'],[0x80,'€'],[0x81,'\x81'],[0x82,'‚'],[0x83,'ƒ'],[0x84,'„'],[0x85,'…'],[0x86,'†'],[0x87,'‡'],[0x88,'ˆ'],[0x89,'‰'],[0x8a,'Š'],[0x8b,'‹'],[0x8c,'Œ'],[0x8d,'\x8d'],[0x8e,'Ž'],[0x8f,'\x8f'],[0x90,'\x90'],[0x91,'‘'],[0x92,'’'],[0x93,'“'],[0x94,'”'],[0x95,'•'],[0x96,'–'],[0x97,'—'],[0x98,'˜'],[0x99,'™'],[0x9a,'š'],[0x9b,'›'],[0x9c,'œ'],[0x9d,'\x9d'],[0x9e,'ž'],[0x9f,'Ÿ']]);
const invalidCodepoint=(n:number)=>n>=0x1&&n<=0x8||n===0xb||n>=0xe&&n<=0x1f||n>=0x7f&&n<=0x9f||n>=0xfdd0&&n<=0xfdef||(n&0xfffe)===0xfffe;
const charref=/&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/gu;
const entity=(name:string)=>Object.hasOwn(HTML5_ENTITIES,name);
/** html.unescape: numeric references with the HTML5 replacements, named ones by the longest known prefix. */
export function unescape(s:string){
 if(!s.includes('&'))return s;
 return s.replace(charref,(_,ref:string)=>{
  if(ref[0]==='#'){
   const num=ref[1]==='x'||ref[1]==='X'?parseInt(ref.slice(2),16):parseInt(ref.slice(1),10);
   if(INVALID_CHARREFS.has(num))return INVALID_CHARREFS.get(num);
   if(0xd800<=num&&num<=0xdfff||num>0x10ffff)return '�';
   return invalidCodepoint(num)?'':String.fromCodePoint(num);
  }
  if(entity(ref))return HTML5_ENTITIES[ref];
  for(let x=ref.length-1;x>1;x--)if(entity(ref.slice(0,x)))return HTML5_ENTITIES[ref.slice(0,x)]+ref.slice(x);
  return '&'+ref;
 });
}
const attrCharref=/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*)[;=]?/g;
const unescapeAttr=(s:string)=>s.replace(attrCharref,ref=>ref.startsWith('&#')||!ref.endsWith('=')&&entity(ref.slice(1))?unescape(ref):ref);

const starttagopen=/<[a-zA-Z]/y,endtagopen=/<\/[a-zA-Z]/y,commentclose=/--!?>/g,commentabruptclose=/-?>/y;
const tagfind=/([a-zA-Z][^\t\n\r\f />]*)(?:[\t\n\r\f ]|\/(?!>))*/y;
const attrfind=/((?<=['"\t\n\r\f /])[^\t\n\r\f />][^\t\n\r\f /=>]*)([\t\n\r\f ]*=[\t\n\r\f ]*('[^']*'|"[^"]*"|(?!['"])[^>\t\n\r\f ]*))?(?:[\t\n\r\f ]|\/(?!>))*/y;
const locatetagend=/[a-zA-Z][^\t\n\r\f />]*[\t\n\r\f /]*(?:(?<=['"\t\n\r\f /])[^\t\n\r\f />][^\t\n\r\f /=>]*(?:[\t\n\r\f ]*=[\t\n\r\f ]*(?:'[^']*'|"[^"]*"|(?!['"])[^>\t\n\r\f ]*))?[\t\n\r\f /]*)*>?/y;
const at=(re:RegExp,s:string,i:number)=>{re.lastIndex=i;return re.exec(s);};
const CDATA=['script','style','xmp','iframe','noembed','noframes'],RCDATA=['textarea','title'];
export type HtmlAttrs=[string,string|null][];

export class HtmlParser {
 private raw='';private cdata:string|null=null;private escapable=true;private interesting:RegExp|null=null;
 private pending:string[]=[];private pendingLen=0;private threshold=1;
 handle_starttag(_tag:string,_attrs:HtmlAttrs){}
 handle_endtag(_tag:string){}
 handle_startendtag(tag:string,attrs:HtmlAttrs){this.handle_starttag(tag,attrs);this.handle_endtag(tag);}
 handle_data(_data:string){}
 feed(data:string){
  this.pendingLen+=data.length;
  if(this.pendingLen<this.threshold){this.pending.push(data);return;}
  if(this.pending.length){this.pending.push(data);this.raw+=this.pending.join('');this.pending=[];}else this.raw+=data;
  this.pendingLen=0;const n=this.raw.length;this.goahead(false);
  this.threshold=this.raw.length<n?1:this.raw.length;
 }
 close(){
  if(this.pending.length){this.raw+=this.pending.join('');this.pending=[];this.pendingLen=0;}
  this.goahead(true);
 }
 private emit(s:string){this.handle_data(this.escapable?unescape(s):s);}
 private setCdata(elem:string,escapable:boolean){
  this.cdata=elem.toLowerCase();this.escapable=escapable;
  this.interesting=this.cdata==='plaintext'?null:new RegExp(`</${this.cdata}(?=[\\t\\n\\r\\f />])`,'gi');
 }
 private goahead(end:boolean){
  const raw=this.raw,n=raw.length;let i=0;
  while(i<n){
   let j:number;
   if(!this.cdata){
    j=raw.indexOf('<',i);
    if(j<0){
     const amp=raw.lastIndexOf('&');
     if(amp>=Math.max(i,n-34)&&!/[\t\n\r\f ;]/.test(raw.slice(amp)))break;
     j=n;
    }
   }else if(this.cdata==='plaintext')j=n;
   else {const match=at(this.interesting,raw,i);if(match)j=match.index;else break;}
   if(i<j)this.emit(raw.slice(i,j));
   i=j;
   if(i===n)break;
   // convert_charrefs: text runs end only at '<' (or at a RAWTEXT/RCDATA end tag).
   let k:number;
   if(at(starttagopen,raw,i))k=this.starttag(i);
   else if(raw.startsWith('</',i))k=this.endtag(i);
   else if(raw.startsWith('<!--',i))k=this.comment(i);
   else if(raw.startsWith('<?',i))k=this.closeAt(i);
   else if(raw.startsWith('<!',i))k=this.declaration(i);
   else if(i+1<n||end){this.handle_data('<');k=i+1;}
   else break;
   if(k<0){
    if(!end)break;
    if(raw.startsWith('</',i)&&i+2===n)this.handle_data('</');
    k=n;
   }
   i=k;
  }
  if(end&&i<n){this.emit(raw.slice(i,n));i=n;}
  this.raw=raw.slice(i);
 }
 /** Bogus comments and processing instructions: up to the next '>'. */
 private closeAt(i:number){const pos=this.raw.indexOf('>',i+2);return pos<0?-1:pos+1;}
 private declaration(i:number){
  const raw=this.raw;
  if(raw.startsWith('<![CDATA[',i)){const j=raw.indexOf(']]>',i+9);return j<0?-1:j+3;}
  if(raw.slice(i,i+9).toLowerCase()==='<!doctype'){const gt=raw.indexOf('>',i+9);return gt<0?-1:gt+1;}
  return this.closeAt(i);
 }
 private comment(i:number){
  let match=at(commentabruptclose,this.raw,i+4);
  if(!match){commentclose.lastIndex=i+4;match=commentclose.exec(this.raw);if(!match)return -1;}
  return match.index+match[0].length;
 }
 private starttag(i:number){
  const raw=this.raw,whole=at(locatetagend,raw,i+1),endpos=whole.index+whole[0].length;
  if(raw[endpos-1]!=='>')return -1;
  const attrs:HtmlAttrs=[],name=at(tagfind,raw,i+1),tag=name[1].toLowerCase();
  let k=name.index+name[0].length;
  while(k<endpos){
   const m=at(attrfind,raw,k);
   if(!m)break;
   let value=m[2]?m[3]:null;
   if(value&&(value[0]==="'"&&value.endsWith("'")||value[0]==='"'&&value.endsWith('"')))value=value.slice(1,-1);
   if(value)value=unescapeAttr(value);
   attrs.push([m[1].toLowerCase(),value]);k=m.index+m[0].length;
  }
  const close=pyStrip(raw.slice(k,endpos));
  if(close!=='>'&&close!=='/>'){this.handle_data(raw.slice(i,endpos));return endpos;}
  if(close==='/>')this.handle_startendtag(tag,attrs);
  else {
   this.handle_starttag(tag,attrs);
   if(CDATA.includes(tag)||tag==='plaintext')this.setCdata(tag,false);
   else if(RCDATA.includes(tag))this.setCdata(tag,true);
  }
  return endpos;
 }
 private endtag(i:number){
  const raw=this.raw;
  if(raw.indexOf('>',i+2)<0)return -1;
  if(!at(endtagopen,raw,i))return raw.slice(i+2,i+3)==='>'?i+3:this.closeAt(i);
  const whole=at(locatetagend,raw,i+2),j=whole.index+whole[0].length;
  if(raw[j-1]!=='>')return -1;
  this.handle_endtag(at(tagfind,raw,i+2)[1].toLowerCase());
  this.cdata=null;this.escapable=true;this.interesting=null;
  return j;
 }
}
