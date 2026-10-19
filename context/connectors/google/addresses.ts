// `email.utils.getaddresses([value])` with its strict defaults (Python 3.13): the addr-spec of each address in one
// header value, or a single '' when the value does not parse as exactly the addresses its commas promise. A port of
// email._parseaddr.AddrlistClass, keeping only the addresses (display names and comments are dropped). Private.
import {strip} from './python.ts';

const SPECIALS='()<>@,:;."[]',LWS=' \t',CR='\r\n',ATOMENDS=SPECIALS+LWS+CR,PHRASEENDS=ATOMENDS.replace('.','');
const has=(set:string,c:string|undefined)=>c!==undefined&&set.includes(c);

function addressList(field:string):string[]{
 let pos=0;
 const at=()=>field[pos];
 const skip=()=>{let ws='';while(pos<field.length){if(has(LWS+'\n\r',at())){if(!has('\n\r',at()))ws+=at();pos++;}else if(at()==='(')comment();else break;}return ws;};
 const delimited=(begin:string,ends:string,comments:boolean)=>{
  if(at()!==begin)return '';
  let out='',quote=false;pos++;
  while(pos<field.length){
   if(quote){out+=at();quote=false;}
   else if(has(ends,at())){pos++;break;}
   else if(comments&&at()==='('){out+=comment();continue;}
   else if(at()==='\\')quote=true;
   else out+=at();
   pos++;
  }
  return out;
 };
 const quoted=()=>delimited('"','"\r',false);
 function comment():string{return delimited('(',')\r',true);}
 const atom=(ends=ATOMENDS)=>{let out='';while(pos<field.length&&!has(ends,at()))out+=field[pos++];return out;};
 const phrases=()=>{
  const list:string[]=[];
  while(pos<field.length){
   if(has(LWS+CR,at()))pos++;
   else if(at()==='"')list.push(quoted());
   else if(at()==='(')comment();
   else if(has(PHRASEENDS,at()))break;
   else list.push(atom(PHRASEENDS));
  }
  return list;
 };
 const domain=()=>{
  let out='';
  while(pos<field.length){
   if(has(LWS,at()))pos++;
   else if(at()==='(')comment();
   else if(at()==='[')out+='['+delimited('[',']\r',false)+']';
   else if(at()==='.'){pos++;out+='.';}
   else if(at()==='@')return '';
   else if(has(ATOMENDS,at()))break;
   else out+=atom();
  }
  return out;
 };
 const addrspec=()=>{
  const list:string[]=[];
  skip();
  while(pos<field.length){
   let preserve=true;
   if(at()==='.'){if(list.length&&!strip(list[list.length-1]))list.pop();list.push('.');pos++;preserve=false;}
   else if(at()==='"')list.push('"'+quoted().replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"');
   else if(has(ATOMENDS,at())){if(list.length&&!strip(list[list.length-1]))list.pop();break;}
   else list.push(atom());
   const ws=skip();
   if(preserve&&ws)list.push(ws);
  }
  if(pos>=field.length||at()!=='@')return list.join('');
  pos++;skip();
  const d=domain();
  return d?list.join('')+'@'+d:'';
 };
 const routeaddr=()=>{
  let expectroute=false,out='';
  pos++;skip();
  while(pos<field.length){
   if(expectroute){domain();expectroute=false;}
   else if(at()==='>'){pos++;break;}
   else if(at()==='@'){pos++;expectroute=true;}
   else if(at()===':')pos++;
   else{out=addrspec();pos++;break;}
   skip();
  }
  return out;
 };
 function address():string[]{
  skip();
  const old=pos,plist=phrases();
  skip();
  let found:string[]=[];
  if(pos>=field.length){if(plist.length)found=[plist[0]];}
  else if(has('.@',at())){pos=old;found=[addrspec()];}
  else if(at()===':'){
   pos++;
   while(pos<field.length){skip();if(pos<field.length&&at()===';'){pos++;break;}found=found.concat(address());}
  }
  else if(at()==='<')found=[routeaddr()];
  else if(plist.length)found=[plist[0]];
  else if(has(SPECIALS,at()))pos++;
  skip();
  if(pos<field.length&&at()===',')pos++;
  return found;
 }
 const result:string[]=[];
 while(pos<field.length){const found=address();if(found.length)result.push(...found);else result.push('');}
 return result;
}

// Iterates characters with backslash escapes kept together, as email.utils does.
function* escaped(value:string):Generator<[number,string]>{
 let escape=false,pos=0;
 for(;pos<value.length;pos++){
  if(escape){yield [pos,'\\'+value[pos]];escape=false;}
  else if(value[pos]==='\\')escape=true;
  else yield [pos,value[pos]];
 }
 if(escape)yield [pos-1,'\\'];
}
function stripQuotedNames(value:string){
 if(!value.includes('"'))return value;
 let start=0,open:number|null=null,out='';
 for(const [pos,c] of escaped(value)){
  if(c!=='"')continue;
  if(open===null)open=pos;
  else{if(start!==open)out+=value.slice(start,open);start=pos+1;open=null;}
 }
 return start<value.length?out+value.slice(start):out;
}
function balanced(value:string){
 let opens=0;
 for(const [,c] of escaped(stripQuotedNames(value))){if(c==='(')opens++;else if(c===')'&&--opens<0)return false;}
 return opens===0;
}
export function getaddresses(value:string):string[]{
 const field=balanced(value)?value:"('', '')";
 const result=field?addressList(field).map(a=>a.includes('[')?'':a):[];
 return result.length===1+stripQuotedNames(field).split(',').length-1?result:[''];
}
