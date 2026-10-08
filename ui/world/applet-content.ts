import {mailMetadata} from '../applets/index.ts';
import {appletAttention} from './applet-attention.ts';
// Fox owns interpretation. Originals retain their identity and are never rewritten.
export function coreAppletItems(provider,records,pages){
 if(provider==='gmail')records=records.map(mailMetadata);
 const findings=pages.filter(p=>p.worldItemId&&p.sourceProvider===provider);
 const canonical=id=>String(id||'').replace('live:'+provider+':','');
 const represented=new Set();
 const curated=findings.map(p=>{
  const refs=(p.worldItemSources||[]).filter(s=>s.provider===provider);
  const matches=records.filter(r=>(p.sourceId&&canonical(r.sourceId||r.id)===canonical(p.sourceId))||refs.some(s=>canonical(s.id)===canonical(r.sourceId||r.id)||(provider==='gmail'&&r.threadId&&canonical(s.id)==='thread:'+r.threadId)));
  const sourcePage=pages.find(source=>!source.worldItemId&&refs.some(ref=>canonical(ref.id)===canonical(source.sourceId||source.id)));
  const record=matches[0]||(provider==='gmail'&&sourcePage?mailMetadata(sourcePage):undefined);
  for(const match of matches)represented.add(match.id);
  const signal=p.worldItemSignal||p.events?.[0]||p.activities?.[0]||{};
  const start=signal.start||record?.start||record?.due;
  return {id:'curated:'+p.worldItemId,title:p.title,context:signal.quote||'',summary:signal.summary||'',curated:true,attention:appletAttention(provider,[p]),start,allDay:signal.allDay||record?.allDay,status:p.worldItemStatus||'open',priority:signal.priority,
   when:dateLabel(start,signal.allDay||record?.allDay),record:{...record,...(provider==='gmail'&&matches.length?{messageCount:Math.max(matches.length,record?.messageCount||1)}:{}),id:p.sourceId,sourceId:p.sourceId,title:record?.title||p.title,noteId:p.noteId,worldItemId:p.worldItemId}};
 });
 const raw=records.filter(r=>!represented.has(r.id)).map(record=>({id:'record:'+record.id,title:record.title,context:record.list||record.from||'',curated:false,start:record.start||record.due,allDay:record.allDay,when:dateLabel(record.start||record.due,record.allDay),status:record.completed===true||record.completed==='true'?'done':'open',record}));
 return [...curated.sort((a,b)=>rank(b.priority)-rank(a.priority)),...raw];
}
function rank(p){return p==='urgent'?2:p==='high'?1:0;}
function dateLabel(value,allDay){if(!value)return '';const date=new Date(allDay?String(value).slice(0,10)+'T12:00:00':value);return Number.isNaN(+date)?'':allDay?date.toLocaleDateString():date.toLocaleString();}
export function calendarDay(value,allDay=false){if(!value)return '';const d=new Date(allDay?String(value).slice(0,10)+'T12:00:00':value);return Number.isNaN(+d)?'':[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
