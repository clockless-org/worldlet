/** Background acceptance fixture using the actual upstream Applet stage and theme adapter. */
import {createAppletStage} from '../../../ui/world/pixi-stage.ts';
import {demoItems,demoNow} from './data.ts';
type VillageKind='mail'|'calendar'|'notes'|'reminders';
const global=globalThis as any;global.__WORLDLET_25D_ASSETS__={devices:{},open:{}};
const root=document.querySelector<HTMLElement>('#notionWorld')!,events:any[]=[];
let current:any,value:any;const stage=createAppletStage(root,event=>events.push(event));
const keys={mail:'gmail',calendar:'google-calendar',notes:'apple-notes',reminders:'apple-reminders'};
function open(kind:VillageKind){const key=keys[kind];current={key,moduleId:'app-'+key,title:kind,provider:key};value={now:demoNow,sample:true,connected:true,loaded:true,items:demoItems(kind).map(i=>({...i,local:kind==='calendar',record:{...i,id:i.id,notes:i.text,text:i.text,repeat:'none',skip:[],createdAt:demoNow/1000,updatedAt:demoNow/1000,allDay:false}})),calendar:{save:async event=>{events.push({save:event});const i=value.items.findIndex(i=>i.record.id===event.id);const item={id:'local:'+event.id,title:event.title,start:event.start,end:event.end,local:true,record:event};if(i<0)value.items.push(item);else value.items[i]=item;stage.render(current,value,true);},remove:async id=>{events.push({remove:id});value.items=value.items.filter(i=>i.record.id!==id);stage.render(current,value,true);}}};stage.render(current,value,true);}
global.villageFixture={open,events,stage,get value(){return value;},hide(){stage.render(current,value,false);}};
open('mail');

for(const name of Object.keys(keys)){const b=document.createElement('button');b.textContent=name;b.onclick=()=>open(name as VillageKind);document.querySelector('#theme-preview-nav')?.append(b);}
