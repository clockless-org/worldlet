import {attentionOver} from './attention-rank.ts';
// Existing priorities retain their meaning; missing priority is transparent.
export function attentionLevel(item:any,now=Date.now()):number{
 if(item.state==='event'){
  const lead=item.signals?.[0]||{},start=lead.start??item.start;
  // An event that is over is no longer urgent, however close its start was.
  if(attentionOver({start,end:lead.end??item.end,allDay:lead.allDay??item.allDay},now))return 1;
  const time=typeof start==='number'?start:Date.parse(start);
  if(!Number.isFinite(time))return 1;
  const minutes=(time-now)/60000;
  return minutes<=15?5:minutes<=60?4:minutes<=360?3:minutes<=1440?2:1;
 }
 return ({normal:1,elevated:2,important:3,high:4,urgent:5})[item.priority]||1;
}
