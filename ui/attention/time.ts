import {validAttentionTime} from '../../core/attention/index.ts';
export interface AttentionTimeContext {now?:Date;locale?:string;timeZone?:string}
const instant=(value:unknown)=>typeof value==='number'&&Number.isFinite(new Date(value).getTime())?new Date(value).toISOString():value;
/** Formatting reads the viewer's environment on each render, never the workspace zone. */
export function attentionTimeRows(signal,context:AttentionTimeContext={}){
 const {now=new Date(),locale,timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone}=context;
 if(!timeZone)return [];
 const format=(options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat(locale,{...options,timeZone});
 const date=format({year:'numeric',month:'short',day:'numeric'}),clock=format({hour:'numeric',minute:'2-digit'});
 const exact=format({year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'longOffset'});
 // Received is when the mail arrived (reader-reported, owner decision 2026-10-04); it says more than
 // when Worldlet first saw it, which a first sync sets for a whole backlog at once.
 const fields:[string,string][]=[['dueAt','Due'],['start','Starts'],['occurredAt','Occurred'],['receivedAt','Received'],['observedAt','First observed'],['sourceUpdatedAt','Source updated']];
 const rows=[];
 for(const [key,label] of fields){
  const raw=signal[key];
  // Numeric start/end values are already-normalized UI event instants (milliseconds).
  const value=key==='start'?instant(raw):raw;
  if(!validAttentionTime(value))continue;
  const allDay=/^\d{4}-\d{2}-\d{2}$/.test(value)||key==='start'&&!!signal.allDay;
  const at=new Date(allDay?value.slice(0,10)+'T12:00:00Z':value);
  const display=allDay?new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(at):date.format(at);
  let clockText=allDay?'All day':clock.format(at);
  let absolute=display+(allDay?' · All day':' · '+clockText);
  let tooltip=label+': '+(allDay?display+' · All day (calendar date, no time zone)':exact.format(at)+' ['+timeZone+']');
  const endValue=instant(signal.end);
  if(key==='start'&&validAttentionTime(endValue)&&Date.parse(endValue)>Date.parse(value)){
   const end=new Date(endValue);
   if(!allDay)clockText+='–'+(date.format(at)===date.format(end)?clock.format(end):date.format(end)+' '+clock.format(end));
   absolute+=' – '+(allDay?endValue.slice(0,10)+' (exclusive)':date.format(end)+' · '+clock.format(end));
   tooltip+=' — '+(allDay?endValue.slice(0,10)+' (exclusive end)':exact.format(end)+' ['+timeZone+']');
  }
  let delta=(+at-+now)/1000;
  if(allDay){const parts=Object.fromEntries(format({year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));delta=(Date.parse(value.slice(0,10)+'T00:00:00Z')-Date.UTC(+parts.year,+parts.month-1,+parts.day))/1000;}
  const unit:Intl.RelativeTimeFormatUnit=allDay?'day':Math.abs(delta)<3600?'minute':Math.abs(delta)<86400?'hour':'day';
  const divisor=unit==='minute'?60:unit==='hour'?3600:86400;
  const amount=Math.round(delta/divisor);
  const ongoing=key==='start'&&!allDay&&validAttentionTime(endValue)&&+at<=+now&&Date.parse(endValue)>+now;
  const relativeIn=(style:Intl.RelativeTimeFormatStyle,numeric:'auto'|'always')=>new Intl.RelativeTimeFormat(locale,{numeric,style}).format(amount,unit);
  const relative=ongoing?'Now':relativeIn('short','auto');
  // The HUD row's countdown is narrow, numeric and unlabelled ("in 1d", not "Starts · tomorrow")
  // so it never takes room from the title; its meaning stays in the tooltip.
  const soon=ongoing||!amount&&!allDay?'Now':amount?relativeIn('narrow','always'):relativeIn('narrow','auto');
  if(key==='observedAt')tooltip+=' · First saved observation of this finding; not when the event occurred.';
  const headingDate=allDay?new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',...(at.getUTCFullYear()!==now.getFullYear()?{year:'numeric' as const}:{}),timeZone:'UTC'}).format(at):format({month:'short',day:'numeric',...(date.formatToParts(at).find(p=>p.type==='year')?.value!==date.formatToParts(now).find(p=>p.type==='year')?.value?{year:'numeric' as const}:{})}).format(at);
  // The row's key-facts line under the title says it in words: "Due tomorrow · 5:00 PM",
  // "Starts in 2 hr. · 3:00 PM", "Updated 3 days ago" (owner decision 2026-10-02, #1281).
  const timed=!allDay&&(key==='dueAt'||key==='start')&&Math.abs(delta)<7*86400?' · '+clockText:'';
  // A past due date says how late it is ("Overdue by 2 days"), never "Due 2 days ago".
  const overdue=key==='dueAt'&&amount<0;
  const late=overdue?'Overdue by '+new Intl.NumberFormat(locale,{style:'unit',unit,unitDisplay:'short'}).format(-amount):'';
  const factor=overdue?late:(key==='dueAt'?'Due ':key==='start'?(ongoing?'':'Starts '):key==='sourceUpdatedAt'?'Updated ':key==='occurredAt'?'Happened ':key==='receivedAt'?'Received ':'Found ')+(!amount&&!allDay&&!ongoing?'just now':relative)+timed;
  rows.push({key,date:label+' · '+headingDate,absolute:label+' · '+absolute,relative:label+' · '+(overdue?late:relative),soon,factor,ago:overdue?late:(!amount&&!allDay&&!ongoing?'just now':relative),clock:clockText,label:tooltip,deadline:key==='dueAt',overdue});
 }
 return rows;
}
/** The time context of one item at a glance: its leading time (due, start, occurrence) and, when
 * it is not already the lead, when its mail arrived. "Due tomorrow · 5:00 PM · Received 3 days ago". */
export function attentionTimeline(signal,context:AttentionTimeContext={}){
 const rows=attentionTimeRows(signal,context);
 if(!rows.length)return null;
 const lead=rows[0],received=lead.key==='receivedAt'?null:rows.find(row=>row.key==='receivedAt');
 return {...lead,factor:lead.factor+(received?' · '+received.factor:''),received:received?.factor||'',label:rows.map(row=>row.label).join('\n')};
}
/** A group never borrows its lead's timestamp or implies a continuous event range. */
export function attentionGroupWhen(signals:any[],context:AttentionTimeContext={}){
 const rows=signals.map(s=>attentionTimeRows(s,context));
 if(signals.length===1)return rows[0][0]??null;
 if(!rows.some(r=>r.length))return null;
 return {absolute:'Multiple source times',relative:'Multiple source times',factor:'Multiple times',clock:'',deadline:rows.some(r=>r.some(t=>t.deadline)),label:rows.map((times,i)=>'Member '+(i+1)+': '+(times.length?times.map(t=>t.label).join('; '):'Time unknown')).join('\n')};
}
/** When a put-off item comes back, for its row in Later ("Back tomorrow · 9:00 AM"). */
export function attentionReturnWhen(until:unknown,context:AttentionTimeContext={}){
 const at=new Date(typeof until==='string'||typeof until==='number'?until:NaN);if(!Number.isFinite(at.getTime()))return null;
 const {now=new Date(),locale}=context,delta=(+at-+now)/1000;
 const unit:Intl.RelativeTimeFormatUnit=Math.abs(delta)<3600?'minute':Math.abs(delta)<86400?'hour':'day';
 const relative=new Intl.RelativeTimeFormat(locale,{numeric:'auto',style:'short'}).format(Math.round(delta/(unit==='minute'?60:unit==='hour'?3600:86400)),unit);
 const clock=new Intl.DateTimeFormat(locale,{hour:'numeric',minute:'2-digit'}).format(at);
 return {key:'snoozedUntil',factor:'Back '+relative+(Math.abs(delta)>=3600?' · '+clock:''),relative:'Back · '+relative,soon:relative,clock,label:'Back in Attention Center: '+at.toLocaleString(locale),deadline:false};
}
