import {renderWorld} from './world.ts';
import {frame} from './frame.ts';
import {renderVillageSurface,type VillageKind,type VillageState,type VillageItem} from './surface.ts';
import type {BuildTheme,ThemeAppletContext} from '@worldlet/theme';
const kinds:Record<string,VillageKind>={gmail:'mail','google-calendar':'calendar','apple-notes':'notes','apple-reminders':'reminders'};
const stateByHost=new WeakMap<HTMLElement,Record<string,VillageState&{advanced?:boolean}>>();
/** Thin port seam: preserve upstream record IDs, original-reader callback and local-calendar owner. */
function renderApplet(context:ThemeAppletContext){
 const asset=context.asset;
 const {host:panel,data:value,invalidate:redraw}=context;
 const items=context.items.map(item=>({...item,record:item.record as Record<string,any>}));
 const room={key:context.applet.id};
 const pick=(item:{id:string})=>context.actions.openItem(item.id);
 const kind=kinds[room.key];
 const mounted=frame(panel,context.scene);
 if(!kind){const root=document.createElement('section');root.className='village-surface';root.dataset.kind='notes';const plate=document.createElement('img');plate.className='village-plate';plate.src=asset(context.scene.background);plate.alt='';const title=document.createElement('h1');title.textContent=context.applet.title;mounted.place(title,'header');const body=document.createElement('div');body.className='village-generic-content';mounted.place(body,'content');root.append(plate,title,body);mounted.canvas.append(root);context.renderDefault(body);return {dispose:mounted.dispose};}
 let states=stateByHost.get(panel);if(!states){states={};stateByHost.set(panel,states);}const state=states[kind]||=( {} );
 const records:VillageItem[]=items.map(i=>({id:i.id,title:i.record?.title||i.title,text:i.record?.text||i.record?.markdown||i.record?.notes||i.summary||i.context||'',meta:[i.record?.from||i.record?.folder||i.record?.list,i.curated?'Fox summary':'Saved source'].filter(Boolean).join(' · '),start:i.start,end:i.end||i.record?.end,due:i.record?.due,completed:i.record?.completed===true,editable:kind==='calendar'&&i.local&&(!i.record?.repeat||i.record.repeat==='none'),record:i.record}));
 const onOpen=(item:VillageItem)=>{const original=items.find(i=>i.id===item.id);if(original)pick(original);};
 const calendar=context.actions.records;
 const root=renderVillageSurface(mounted.canvas,{kind,assetRoot:asset('assets/'),items:records,now:value?.now,state,sample:!!value?.sample,status:value?.error||(value?.reading?'Reading…':value?.sample?'Sample records · Original actions stay in Worldlet':value?.connected?'Connected · Saved records':'Connect with Fox to read your records'),onOpen,
  ...(kind==='calendar'&&calendar?{onSave:async(item:VillageItem)=>{const old=item.record||{},timestamp=Date.now()/1000;await calendar.save({...old,id:old.id||item.id,title:item.title,start:item.start,end:item.end,allDay:!!old.allDay,location:old.location||'',notes:item.text||'',repeat:old.repeat||'none',skip:old.skip||[],alert:old.alert??10,createdAt:old.createdAt||timestamp,updatedAt:timestamp});},onDelete:async(item:VillageItem)=>{if(!item.editable||!item.record?.id)throw Error('Only local events can be deleted');await calendar.remove(item.record.id);}}:{}),
  ...(kind==='calendar'?{onAdvanced:()=>{state.advanced=true;redraw();}}:{})});
 if(kind==='calendar'&&state.advanced){root.classList.add('village-advanced');root.querySelector('.village-week')?.remove();const body=root.querySelector<HTMLElement>('.village-body')!;body.replaceChildren();context.renderDefault(body);const tools=root.querySelector('.village-tools')!;tools.replaceChildren();const back=document.createElement('button');back.type='button';back.textContent='Back to agenda';back.onclick=()=>{state.advanced=false;redraw();};tools.append(back);}
 mounted.place(root.querySelector<HTMLElement>('.village-body')!,'content');
 mounted.place(root.querySelector<HTMLElement>('.village-heading')!,'header');
 const week=root.querySelector<HTMLElement>('.village-week');if(week)mounted.place(week,'week');
 root.querySelector<HTMLImageElement>('.village-plate')!.src=asset(context.scene.background);
 return {dispose:mounted.dispose};
}

const theme:BuildTheme={contractVersion:2,id:"village-map",renderWorld,renderApplet};
export default theme;
