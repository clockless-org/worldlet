import {validateWorldItem} from '../items/index.ts';
type Row=Record<string,any>;
/** Extraction candidates are private staging; M owns final card copy constraints. */
export function appletCandidateContent(raw:Row):Row {
 const bounded=(key:string,max:number)=>{
  const value=raw[key];
  if(typeof value!=='string'||!value.trim()||[...value].length>max)throw Error(`Invalid Applet candidate ${key}.`);
  return value.trim();
 };
 const title=bounded('title',200),reason=bounded('reason',600),summary=bounded('summary',1200);
 const item:Row={...raw,title,reason,summary,context:reason,...(raw.kind==='task'?{attentionReason:raw.attentionReason||reason}:{})};
 delete item.attentionContentVersion;
 validateWorldItem(item,{start:typeof item.start==='string'?Date.parse(item.start):null,end:typeof item.end==='string'?Date.parse(item.end):null});
 return item;
}
// Characters a model copying a quote drops or retypes without changing its words: invisible format
// characters (zero-width spaces and joiners, soft hyphens, the combining grapheme joiner mail
// preheaders pad with), typographic quotes, dashes and ellipses, and composed vs decomposed accents.
const INVISIBLE=/[\p{Cf}\u034f]/gu;
const TYPOGRAPHIC:Record<string,string>={'\u2018':"'",'\u2019':"'",'\u201a':"'",'\u201b':"'",'\u02bc':"'",'\u2032':"'",'\u201c':'"','\u201d':'"','\u201e':'"','\u201f':'"','\u2033':'"',
 '\u2010':'-','\u2011':'-','\u2012':'-','\u2013':'-','\u2014':'-','\u2015':'-','\u2212':'-'};
/** Text folded for matching, with the [start,end) span of the original each folded character came from. */
function folded(text:string){
 let out='';const spans:[number,number][]=[];
 for(const match of text.matchAll(/\P{M}\p{M}*|\p{M}+/gu)){
  const start=match.index,end=start+match[0].length,unit=match[0].replace(INVISIBLE,'');
  if(!unit)continue;
  if(/^\s+$/u.test(unit)){if(out&&!out.endsWith(' ')){out+=' ';spans.push([start,end]);}continue;}
  for(const ch of unit.normalize('NFKC')){const c=TYPOGRAPHIC[ch]??ch;out+=c;for(let i=0;i<c.length;i++)spans.push([start,end]);}
 }
 return {out,spans};
}
/** Restore an exact source span only when a unique match differs by whitespace, invisible characters or
 * typography alone. The returned quote is always a verbatim substring of the source text. */
export function canonicalSourceQuotes(items:Row[],evidence:Record<string,Row>):Row[] {
 return items.map(item=>({...item,sources:Array.isArray(item.sources)?item.sources.map((ref:Row)=>{
  const text=evidence[ref.provider+':'+ref.id]?.text,quote=ref.quote;
  if(typeof text!=='string'||typeof quote!=='string'||!quote.trim()||quote.length>1000||text.includes(quote))return ref;
  const needle=folded(quote).out.trim();
  if(!needle)return ref;
  const source=folded(text),at=source.out.indexOf(needle);
  if(at<0||source.out.indexOf(needle,at+1)>=0)return ref;
  const restored=text.slice(source.spans[at][0],source.spans[at+needle.length-1][1]);
  return [...restored].length<=1000?{...ref,quote:restored}:ref;
 }):item.sources}));
}
