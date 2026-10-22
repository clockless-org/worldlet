import {node,uiIcon} from '../../style/index.ts';
import type {AppletSceneRegion} from '../scene/applet-scene.ts';
/** Optional separate book surfaces; Calendar still owns all dates, records and actions. */
export function calendarRegions(panel:HTMLElement,regions:readonly AppletSceneRegion[]){
 const slots=Object.fromEntries(regions.map(r=>[r.id,r.element]));
 const distributed=['heading','toolbar','details','status'].every(id=>slots[id])&&panel.closest<HTMLElement>('.applet-scene')?.dataset.compact!=='true';
 for(const r of regions){r.element.classList.toggle('calendar-region',distributed);if(r.role==='secondary')r.element.replaceChildren();}
 panel.dataset.calendarDistributed=String(distributed);
 return distributed?slots:null;
}
export function calendarDetails(details:HTMLElement,status:HTMLElement,item:any,value:any,edit:()=>void,open:()=>void){
 details.replaceChildren();status.replaceChildren();const content=node('div','calendar-detail-content');details.append(content);
 const heading=node('h3','calendar-detail-title',item?.title||'Select an event');heading.dataset.long=String((item?.title?.length||0)>20);content.append(heading);
 if(item){
  const start=new Date(item.allDay?item.start+'T12:00:00':item.start),end=new Date(item.end||item.record?.end||'');
  const row=(icon:string,text:string)=>{const p=node('p','calendar-detail-row'),i=node('span','');i.innerHTML=uiIcon(icon);i.setAttribute('aria-hidden','true');p.append(i,node('span','',text));content.append(p);};
  row('calendar',Number.isNaN(+start)?'Date not set':start.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'}));
  row('clock',item.allDay?'All day':start.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})+(!Number.isNaN(+end)?' – '+end.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):''));
  row('book',item.local?'On this computer':item.record?.calendar||'Synced calendar');
  if(item.context)content.append(node('p','calendar-detail-location',item.context));
  const action=node('button','calendar-detail-action',item.local?'Edit local event':'Original');action.type='button';action.disabled=!!item.local&&!value?.calendar;action.onclick=item.local?edit:open;details.append(action);
 }
 status.append(node('h4','','Synced calendars'),node('p','',value?.error||(value?.reading?'Reading calendar…':value?.sample?'Demo events · No calendar connected.':value?.connected?'Connected calendar · source events are read-only.':'No calendar connected. Local events stay on this computer.')));
}
