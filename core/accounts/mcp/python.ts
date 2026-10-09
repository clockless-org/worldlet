// More of the Python semantics the MCP connector readers were written with (exception kinds, attribute access on
// provider JSON, urllib.parse.urlparse, uuid.UUID, json.dumps), on top of ../google/python.ts. Private to core/accounts.
import {pyType,pyFloat,pyRepr,pySorted,chars,strip} from '../google/python.ts';

/** Python's ValueError: bad input the reader refused (an invalid ID, URL, cursor or operation). Other failures are
 * plain Errors (RuntimeError: the provider answered something unusable) or TypeErrors (Python's AttributeError and
 * TypeError on a malformed provider answer). Callers that caught ValueError in Python test `instanceof ValueError`. */
export class ValueError extends Error {override name='ValueError';}
/** Python's OSError, for a missing review file. */
export class OSError extends Error {override name='OSError';}

export const isDict=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
/** `o.get(k, d)` on a value that must be a dict, raising Python's AttributeError otherwise. */
export function dget(o:unknown,k:string,d:any=null){
 if(!isDict(o))throw new TypeError(`'${pyType(o)}' object has no attribute 'get'`);
 return Object.hasOwn(o,k)?o[k]:d;
}
/** `o[k]` on a dict: KeyError (its message is the key's repr) when absent. */
export function item(o:unknown,k:string){
 if(!isDict(o))throw new TypeError(pyType(o)==='NoneType'?`'NoneType' object is not subscriptable`:`${pyType(o)} indices must be integers`);
 if(!Object.hasOwn(o,k))throw new TypeError(pyRepr(k));
 return o[k];
}
/** `v[:n]` of a list or str (by code points). */
export function slice(v:unknown,n:number):any[]|string{
 if(Array.isArray(v))return v.slice(0,n);
 if(typeof v==='string')return [...v].slice(0,n).join('');
 throw new TypeError(`'${pyType(v)}' object is not subscriptable`);
}
/** `len(v)` of a list, str or dict. */
export function len(v:unknown){
 if(Array.isArray(v))return v.length;
 if(typeof v==='string')return chars(v);
 if(isDict(v))return Object.keys(v).length;
 throw new TypeError(`object of type '${pyType(v)}' has no len()`);
}
/** `x in c` for a list, str or dict container, TypeError for anything else. */
export function contains(c:unknown,x:unknown){
 if(typeof c==='string'){if(typeof x!=='string')throw new TypeError(`'in <string>' requires string as left operand, not ${pyType(x)}`);return c.includes(x);}
 if(Array.isArray(c))return c.some(v=>pyEqual(v,x));
 if(isDict(c))return typeof x==='string'&&Object.hasOwn(c,x);
 throw new TypeError(`argument of type '${pyType(c)}' is not iterable`);
}
/** Python `==` over JSON values: True == 1, 1 == 1.0, dicts and lists by value. */
export function pyEqual(a:unknown,b:unknown):boolean{
 const n=(v:unknown)=>typeof v==='boolean'?+v:v;
 if((typeof a==='number'||typeof a==='boolean')&&(typeof b==='number'||typeof b==='boolean'))return n(a)===n(b);
 if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>pyEqual(v,b[i]));
 if(isDict(a))return isDict(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&pyEqual(a[k],b[k]));
 return a===b||(a===undefined&&b===null)||(a===null&&b===undefined);
}
/** `s.count(sub)`: non-overlapping occurrences; an empty `sub` counts every code point boundary. */
export function count(s:string,sub:string){
 if(!sub)return chars(s)+1;
 let n=0;for(let i=s.indexOf(sub);i>=0;i=s.indexOf(sub,i+sub.length))n++;
 return n;
}
/** `json.loads` of a provider text part: a SyntaxError is Python's JSONDecodeError (a ValueError). */
export function loads(text:unknown){
 if(typeof text!=='string')throw new TypeError(`the JSON object must be str, bytes or bytearray, not ${pyType(text)}`);
 try{return JSON.parse(text);}catch(error){throw new ValueError(error.message);}
}

/** `json.dumps(v)` with Python's defaults (`', '` and `': '`, ensure_ascii), optionally `sort_keys`. `floats` names
 * keys whose values Python holds as floats (time.time()), so a whole number keeps its `.0`. */
export function dumps(v:unknown,{sortKeys=false,floats=[] as string[]}={}):string{
 const text=(s:string)=>'"'+s.replace(/[^ -~]|["\\]/g,c=>({'\\':'\\\\','"':'\\"','\b':'\\b','\f':'\\f','\n':'\\n','\r':'\\r','\t':'\\t'} as Record<string,string>)[c]??'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'"';
 const number=(n:number,float:boolean)=>Number.isNaN(n)?'NaN':n===Infinity?'Infinity':n===-Infinity?'-Infinity':float||!Number.isInteger(n)?pyFloat(n):String(n);
 const write=(x:unknown,float=false):string=>{
  if(x===null||x===undefined)return 'null';
  if(typeof x==='boolean')return x?'true':'false';
  if(typeof x==='number')return number(x,float);
  if(typeof x==='string')return text(x);
  if(Array.isArray(x))return '['+x.map(y=>write(y)).join(', ')+']';
  const keys=sortKeys?pySorted(Object.keys(x)):Object.keys(x);
  return '{'+keys.map(k=>text(k)+': '+write((x as any)[k],floats.includes(k))).join(', ')+'}';
 };
 return write(v);
}

/** The canonical form `str(uuid.UUID(value))` of a 32-hex-digit value, '' for one that parses but is not plain hex
 * (it can never equal its canonical form), and Python's errors for one that does not parse. */
export function uuidCanonical(value:unknown){
 if(value===null||value===undefined)throw new TypeError('one of the hex, bytes, bytes_le, fields, or int arguments must be given');
 if(typeof value!=='string')throw new TypeError(`'${pyType(value)}' object has no attribute 'replace'`);
 const hex=value.replaceAll('urn:','').replaceAll('uuid:','').replace(/^[{}]+|[{}]+$/g,'').replaceAll('-','');
 if(chars(hex)!==32)throw new ValueError('badly formed hexadecimal UUID string');
 const number=strip(hex);
 if(!/^[+-]?(?:0[xX])?_?[0-9a-fA-F]+(?:_[0-9a-fA-F]+)*$/.test(number))throw new ValueError('invalid literal for int() with base 16: '+pyRepr(hex));
 if(number[0]==='-'&&/[1-9a-fA-F]/.test(number.replace(/^-(?:0[xX])?/,'')))throw new ValueError('int is out of range (need a 128-bit value)');
 return /^[0-9a-fA-F]{32}$/.test(hex)?hex.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})/,'$1-$2-$3-$4-'):'';
}

const partition=(s:string,sep:string):[string,string,string]=>{const i=s.indexOf(sep);return i<0?[s,'','']:[s.slice(0,i),sep,s.slice(i+sep.length)];};
const rpartition=(s:string,sep:string):[string,string,string]=>{const i=s.lastIndexOf(sep);return i<0?['','',s]:[s.slice(0,i),sep,s.slice(i+sep.length)];};
/** `ipaddress.ip_address(v)` being an IPv6 address (with an optional `%scope`), as urlsplit checks a bracketed host. */
function ipv4(text:string){return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(text);}
function ipv6(text:string){
 const [address,percent,scope]=partition(text,'%');
 if(percent&&(!scope||scope.includes('%'))||!address||address.length>45)return false;
 const parts=address.split(':');
 if(parts.length<3)return false;
 if(parts.at(-1).includes('.')){if(!ipv4(parts.pop()))return false;parts.push('0','0');}
 if(parts.length>9)return false;
 let skip=-1;
 for(let i=1;i<parts.length-1;i++)if(!parts[i]){if(skip>=0)return false;skip=i;}
 let hi=parts.length,lo=0;
 if(skip>=0){
  hi=skip;lo=parts.length-skip-1;
  if(!parts[0]&&--hi)return false;
  if(!parts.at(-1)&&--lo)return false;
  if(8-(hi+lo)<1)return false;
 }else if(parts.length!==8||!parts[0]||!parts.at(-1))return false;
 return [...parts.slice(0,hi),...parts.slice(parts.length-lo)].every(p=>/^[0-9a-fA-F]{1,4}$/.test(p));
}
function checkBracketedHost(host:string){
 if(host.startsWith('v')){if(!/^v[a-fA-F0-9]+\.[^]+$/.test(host))throw new ValueError('IPvFuture address is invalid');return;}
 if(ipv4(host))throw new ValueError('An IPv4 address cannot be in brackets');
 if(!ipv6(host))throw new ValueError(pyRepr(host)+' does not appear to be an IPv4 or IPv6 address');
}
const USES_PARAMS=new Set(['','ftp','hdl','prospero','http','imap','https','shttp','rtsp','rtsps','rtspu','sip','sips','mms','sftp','tel']);
/** `urllib.parse.urlparse(url)`: the parts the connectors look at (CPython 3.13). */
export function urlparse(input:string){
 let url=input.replace(/^[\x00-\x20]+/,'').replace(/[\t\r\n]/g,''),scheme='',netloc='';
 const colon=url.indexOf(':');
 if(colon>0&&/^[A-Za-z][A-Za-z0-9+.-]*$/.test(url.slice(0,colon))){scheme=url.slice(0,colon).toLowerCase();url=url.slice(colon+1);}
 if(url.startsWith('//')){
  const ends=['/','?','#'].map(c=>url.indexOf(c,2)).filter(i=>i>=0),end=ends.length?Math.min(...ends):url.length;
  netloc=url.slice(2,end);url=url.slice(end);
  if(netloc.includes('[')!==netloc.includes(']'))throw new ValueError('Invalid IPv6 URL');
  if(netloc.includes('[')&&netloc.includes(']')){
   const [before,open,bracketed]=partition(rpartition(netloc,'@')[2],'[');
   if(open){
    if(before)throw new ValueError('Invalid IPv6 URL');
    const [host,,port]=partition(bracketed,']');
    if(port&&!port.startsWith(':'))throw new ValueError('Invalid IPv6 URL');
    checkBracketedHost(host);
   }else checkBracketedHost(partition(rpartition(netloc,'@')[2],':')[0]);
  }
 }
 if(url.includes('#'))url=partition(url,'#')[0];
 if(url.includes('?'))url=partition(url,'?')[0];
 if(netloc&&/[^\x00-\x7f]/.test(netloc)){
  const n=netloc.replace(/[@:#?]/g,''),normal=n.normalize('NFKC');
  if(n!==normal&&/[/?#@:]/.test(normal))throw new ValueError(`netloc '${netloc}' contains invalid characters under NFKC normalization`);
 }
 if(USES_PARAMS.has(scheme)&&url.includes(';')){
  const i=url.includes('/')?url.indexOf(';',url.lastIndexOf('/')):url.indexOf(';');
  if(i>=0)url=url.slice(0,i);
 }
 const [userinfo,hasInfo,hostinfo]=rpartition(netloc,'@');
 let username:string=null,password:string=null;
 if(hasInfo){const [user,hasPassword,pass]=partition(userinfo,':');username=user;password=hasPassword?pass:null;}
 const [,open,bracketed]=partition(hostinfo,'[');
 const host=open?partition(bracketed,']')[0]:partition(hostinfo,':')[0];
 const [name,percent,zone]=partition(host,'%');
 return {scheme,netloc,path:url,username,password,hostname:host?name.toLowerCase()+percent+zone:null};
}
