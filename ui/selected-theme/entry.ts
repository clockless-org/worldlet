import {renderVillageSurface,type VillageKind,type VillageState,type VillageItem} from './surface.ts';
import type {BuildTheme,ThemeAppletContext} from '@worldlet/theme';
const kinds:Record<string,VillageKind>={gmail:'mail','google-calendar':'calendar','apple-notes':'notes','apple-reminders':'reminders'};
const stateByHost=new WeakMap<HTMLElement,Record<string,VillageState&{advanced?:boolean}>>();
/** Thin port seam: preserve upstream record IDs, original-reader callback and local-calendar owner. */
function renderApplet(context:ThemeAppletContext){
 const {host:panel,items,data:value,invalidate:redraw}=context;
 const room={key:context.applet.id};
 const pick=(item:{id:string})=>context.openItem(item.id);
 const kind=kinds[room.key];if(!kind)return false;
 let states=stateByHost.get(panel);if(!states){states={};stateByHost.set(panel,states);}const state=states[kind]||=( {} );
 const records:VillageItem[]=items.map(i=>({id:i.id,title:i.record?.title||i.title,text:i.record?.text||i.record?.markdown||i.record?.notes||i.summary||i.context||'',meta:[i.record?.from||i.record?.folder||i.record?.list,i.curated?'Fox summary':'Saved source'].filter(Boolean).join(' · '),start:i.start,end:i.end||i.record?.end,due:i.record?.due,completed:i.record?.completed===true,editable:kind==='calendar'&&i.local&&(!i.record?.repeat||i.record.repeat==='none'),record:i.record}));
 const onOpen=(item:VillageItem)=>{const original=items.find(i=>i.id===item.id);if(original)pick(original);};
 const calendar=value?.calendar;
 const root=renderVillageSurface(panel,{kind,assetRoot:'theme-assets/',items:records,now:value?.now,state,sample:!!value?.sample,status:value?.error||(value?.reading?'Reading…':value?.sample?'Sample records · Original actions stay in Worldlet':value?.connected?'Connected · Saved records':'Connect with Fox to read your records'),onOpen,
  ...(kind==='calendar'&&calendar?{onSave:async(item:VillageItem)=>{const old=item.record||{},timestamp=Date.now()/1000;await calendar.save({...old,id:old.id||item.id,title:item.title,start:item.start,end:item.end,allDay:!!old.allDay,location:old.location||'',notes:item.text||'',repeat:old.repeat||'none',skip:old.skip||[],alert:old.alert??10,createdAt:old.createdAt||timestamp,updatedAt:timestamp});},onDelete:async(item:VillageItem)=>{if(!item.editable||!item.record?.id)throw Error('Only local events can be deleted');await calendar.remove(item.record.id);}}:{}),
  ...(kind==='calendar'?{onAdvanced:()=>{state.advanced=true;redraw();}}:{})});
 if(kind==='calendar'&&state.advanced){root.classList.add('village-advanced');root.querySelector('.village-week')?.remove();const body=root.querySelector<HTMLElement>('.village-body')!;body.replaceChildren();context.renderDefault(body);const tools=root.querySelector('.village-tools')!;tools.replaceChildren();const back=document.createElement('button');back.type='button';back.textContent='Back to agenda';back.onclick=()=>{state.advanced=false;redraw();};tools.append(back);}
 return {dispose(){}};
}

const theme:BuildTheme={contractVersion:1,id:"village",renderApplet};
export default theme;
