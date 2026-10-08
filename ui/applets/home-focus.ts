import {HOME_RECORDS} from '../../core/applets/index.ts';
/** Each Home reader keeps the source body intact inside its device's paper leaf. */
export function renderHomeFocus(key,value,record,renderBody){
 if(!HOME_RECORDS.includes(key))return renderBody(value.text,{title:value.title,path:'original.md'});
 const root=document.createElement('article');root.className='home-record';root.dataset.kind=key;const facts=document.createElement('dl');facts.className='home-record-facts';
 const date=raw=>{if(!raw)return '';const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(raw))?raw+'T12:00:00':raw);return Number.isNaN(+d)?String(raw):record.allDay?d.toLocaleDateString():d.toLocaleString();};
 const entries=key==='google-calendar'?[['When',date(record.start)],['Until',date(record.end)],['Where',record.location],['Calendar',record.calendar],['Attendees',Array.isArray(record.attendees)?record.attendees.map(p=>typeof p==='string'?p:p.name||p.email).filter(Boolean).join(', '):'']]:key==='apple-notes'?[['Notebook',record.folder],['Updated',date(record.modifiedAt||record.updatedAt)]]:[['Due',date(record.due)],['List',record.list],['Status',(record.completed===true||record.completed==='true')?'Completed':'To do']];
 for(const [label,value] of entries)if(value){const pair=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);pair.append(dt,dd);facts.append(pair);}
 if(facts.children.length)root.append(facts);root.append(renderBody(value.text,{title:value.title,path:'original.md'}));return root;
}
