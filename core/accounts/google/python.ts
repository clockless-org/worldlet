// The Python semantics the Google reads were written with (dict.get, truthiness, int(), str(), code-point lengths
// and order), so the TypeScript ports answer exactly what the Hermes originals did. Private to core/accounts.

/** `o.get(k, d)`: a key that is present keeps its value, null included. */
export const got=(o:any,k:string,d:any=undefined)=>o!==null&&typeof o==='object'&&Object.hasOwn(o,k)?o[k]:d;
export const truthy=(v:unknown)=>Array.isArray(v)?v.length>0:v!==null&&typeof v==='object'?Object.keys(v).length>0:!!v;
export const pyType=(v:unknown)=>v===null||v===undefined?'NoneType':typeof v==='string'?'str':typeof v==='boolean'?'bool':typeof v==='number'?(Number.isInteger(v)?'int':'float'):Array.isArray(v)?'list':'dict';
/** `x in container`: a substring of a string, an element of a list, a key of a dict. */
export const pyIn=(x:unknown,c:any)=>typeof c==='string'?typeof x==='string'&&c.includes(x):Array.isArray(c)?c.includes(x):c!==null&&typeof c==='object'&&typeof x==='string'&&Object.hasOwn(c,x);
/** Iterating a value: a list's items, a dict's keys, a string's characters. */
export function pyIter(v:any):any[]{
 if(Array.isArray(v))return v;if(typeof v==='string')return [...v];
 if(v!==null&&typeof v==='object')return Object.keys(v);
 throw new TypeError(`'${pyType(v)}' object is not iterable`);
}
export const chars=(s:string)=>{let n=0;for(const _ of s)n++;return n;};
export const head=(s:string,n:number)=>s.length<=n?s:[...s].slice(0,n).join('');
export function pyCompare(a:string,b:string){
 for(let i=0,j=0;;){
  const x=a.codePointAt(i),y=b.codePointAt(j);
  if(x===undefined||y===undefined)return x===undefined?(y===undefined?0:-1):1;
  if(x!==y)return x-y;i+=x>0xffff?2:1;j+=y>0xffff?2:1;
 }
}
export const pySorted=(values:Iterable<string>)=>[...values].sort(pyCompare);
/** Python's Unicode whitespace (`\\s`, str.isspace), as a character class body. */
export const WS='\\t-\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const SPACE=new RegExp(`^[${WS}]+|[${WS}]+$`,'g');
export const strip=(s:string)=>s.replace(SPACE,'');
/** `int(v)` for the values JSON carries. */
export function pyInt(v:unknown):number{
 if(typeof v==='boolean')return +v;
 if(typeof v==='number')return Math.trunc(v);
 if(typeof v==='string'){
  const text=strip(v);
  if(/^[+-]?\d+(?:_\d+)*$/.test(text))return parseInt(text.replace(/_/g,''),10);
  throw new Error(`invalid literal for int() with base 10: ${pyRepr(v)}`);
 }
 throw new TypeError(`int() argument must be a string, a bytes-like object or a real number, not '${pyType(v)}'`);
}
/** `repr(float)`: the shortest digits, scientific below 1e-4 and from 1e16. */
export function pyFloat(n:number){
 if(Number.isInteger(n)&&Math.abs(n)<1e16)return n.toFixed(1);
 const [digits,exponent]=n.toExponential().split('e'),e=+exponent;
 if(e<-4||e>=16)return digits+'e'+(e<0?'-':'+')+String(Math.abs(e)).padStart(2,'0');
 return String(n);
}
const pyNumber=(n:number)=>Number.isInteger(n)?String(n):pyFloat(n);
function quoted(s:string){
 const q=s.includes("'")&&!s.includes('"')?'"':"'";
 return q+s.replace(/[\\\n\r\t\x00-\x1f\x7f-\x9f]/g,c=>({'\\':'\\\\','\n':'\\n','\r':'\\r','\t':'\\t'} as Record<string,string>)[c]??'\\x'+c.charCodeAt(0).toString(16).padStart(2,'0')).replaceAll(q,'\\'+q)+q;
}
export function pyRepr(v:unknown):string{
 if(v===null||v===undefined)return 'None';
 if(typeof v==='boolean')return v?'True':'False';
 if(typeof v==='number')return pyNumber(v);
 if(typeof v==='string')return quoted(v);
 if(Array.isArray(v))return '['+v.map(pyRepr).join(', ')+']';
 return '{'+Object.entries(v).map(([k,x])=>quoted(k)+': '+pyRepr(x)).join(', ')+'}';
}
export const pyStr=(v:unknown)=>typeof v==='string'?v:pyRepr(v);
/** `json.dumps(v, sort_keys=True, ensure_ascii=False)` with its default `', '` and `': '` separators. */
export function pyJson(v:unknown):string{
 if(v===null||v===undefined)return 'null';
 if(typeof v==='boolean')return v?'true':'false';
 if(typeof v==='number')return pyNumber(v);
 if(typeof v==='string')return '"'+v.replace(/[\x00-\x1f\\"]/g,c=>({'\\':'\\\\','"':'\\"','\b':'\\b','\f':'\\f','\n':'\\n','\r':'\\r','\t':'\\t'} as Record<string,string>)[c]??'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+'"';
 if(Array.isArray(v))return '['+v.map(pyJson).join(', ')+']';
 return '{'+pySorted(Object.keys(v)).map(k=>pyJson(k)+': '+pyJson((v as any)[k])).join(', ')+'}';
}
/** `base64.urlsafe_b64decode`: binascii's lenient decoder (other characters skipped, padding ends the data). */
export function urlsafeB64decode(text:string):Uint8Array{
 if(/[^\x00-\x7f]/.test(text))throw new Error('string argument should contain only ASCII characters');
 const out:number[]=[],alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
 let quad=0,left=0,pads=0;
 for(const c of text){
  if(c==='='){if(quad>=2&&quad+ ++pads>=4)return Uint8Array.from(out);continue;}
  const v=c==='+'?62:c==='/'?63:alphabet.indexOf(c);
  if(v<0)continue;
  pads=0;
  if(quad===0){quad=1;left=v;}
  else if(quad===1){quad=2;out.push((left<<2|v>>4)&255);left=v&15;}
  else if(quad===2){quad=3;out.push((left<<4|v>>2)&255);left=v&3;}
  else{quad=0;out.push((left<<6|v)&255);left=0;}
 }
 if(quad===1)throw new Error(`Invalid base64-encoded string: number of data characters (${Math.floor(out.length/3)*4+1}) cannot be 1 more than a multiple of 4`);
 if(quad)throw new Error('Incorrect padding');
 return Uint8Array.from(out);
}
