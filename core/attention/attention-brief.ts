// Local, bounded presentation of saved evidence; never infer facts from a title.
const plain=(value:unknown)=>String(value||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
const escape=(value:string)=>value.replace(/[\\`*_{}\[\]()<>#|]/g,'\\$&');
const short=(value:unknown,max:number)=>{const text=plain(value);return text.length<=max?text:text.slice(0,max-1).replace(/\s+\S*$/,'')+'…';};
const url=(value:unknown)=>{try{const parsed=new URL(String(value));return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.href.replaceAll('(','%28').replaceAll(')','%29'):null;}catch{return null;}};
export function attentionBrief(page){
 const signal=page.worldItemSignal||{},lines=['**'+escape(short(page.title,100))+'**'];
 const date=(value)=>{const d=new Date(signal.allDay?String(value).slice(0,10)+'T12:00:00':value);return Number.isFinite(+d)?d:null;};
 const start=signal.start&&date(signal.start),end=signal.end&&date(signal.end);
 if(start){const day=start.toLocaleDateString(undefined,{month:'short',day:'numeric'}),clock=d=>d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
  lines.push('**When:** '+day+(signal.allDay?' · All day':' · '+clock(start)+(end?'–'+(end.toDateString()===start.toDateString()?'':end.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' ')+clock(end):'')));
 }
 const location=signal.location||String(signal.summary||'').match(/^(?:Location|Where|地点):\s*(.+)$/im)?.[1];
 if(location){const href=url(location);lines.push('**Where:** '+(href?'[Join / view location]('+href+')':escape(short(location,100))));}
 // The saved summary is model-written for every provider, Calendar included
 // (core/attention/README.md content contract); show only its first sentence.
 const summary=signal.summary;
 if(summary&&plain(summary)!==plain(page.title)){
  const first=String(summary).split(/\n|(?<=[.!?。！？])\s+/).map(s=>s.trim()).find(s=>s&&!/^(?:Start|End|Location|Where|When|Title|Subject|From|To):/i.test(s));
  if(first)lines.push('**'+(page.worldItemKind==='task'?'Next':'Key point')+':** '+escape(short(first,160)));
 }
 const links=[...new Set([page.sourceURL,...(page.worldItemSources||[]).map(s=>s.url)].map(url).filter(Boolean))].slice(0,2);
 if(links.length)lines.push(links.map((href,i)=>'['+(i?'Related source':'Open original')+']('+href+')').join(' · '));
 return lines.join('\n\n');
}
