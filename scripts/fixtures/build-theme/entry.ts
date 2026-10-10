/** Background acceptance fixture using the actual upstream Applet stage and theme adapter. */
import './start-theme.ts';
import {createAppletStage} from '../../../ui/world/theme-applet-stage.ts';
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

// Exercise the production World adapter as well as individual Applet stages.
import {createModuleScene} from '../../../ui/world/build-theme-world.ts';
import {BUILD_THEMES,switchBuildTheme} from '../../../ui/themes/build-theme.ts';
const rooms=Object.entries(keys).map(([title,key])=>({id:'place-'+key,moduleId:'app-'+key,key,title,region:'home',entity:'app'}));
rooms.push({id:'place-future',moduleId:'app-future',key:'future',title:'Future applet',region:'home',entity:'app'});
let worldScene:any,worldHost:HTMLElement;
// The built-in Village is the Pixi World, not a package; the fixture exercises every package through the contract.
const packages=[...BUILD_THEMES.values()].filter(theme=>theme.package);
global.simFixture={events,themes:packages.map(theme=>theme.id),
 async use(id:string){const result=await switchBuildTheme(id);if('error' in result)throw Error(result.error);},
 open(){stage.render(current,value,false);worldScene?.destroy();worldHost?.remove();worldHost=document.createElement('div');worldHost.id='sim-world-fixture';Object.assign(worldHost.style,{position:'absolute',inset:'0'});root.append(worldHost);
  worldScene=createModuleScene(worldHost,rooms,event=>{events.push(event);if(event.action==='space'){const room=rooms.find(r=>r.id===event.id)!;worldScene.setAppStage(room.moduleId,{sample:true,items:[{id:'sim-record',title:'Contract record'}]});worldScene.focus(room.moduleId,'object');}else if(event.action==='building')worldScene.focus(event.id,'building');},()=>{},new Map(),{buildings:[{id:'building-home',title:'Home'}]});
 },home(){worldScene.focus('overview');},get scene(){return worldScene;},get host(){return worldHost;},destroy(){worldScene.destroy();worldHost.remove();}
};
const worldButton=document.createElement('button');worldButton.textContent='World';worldButton.onclick=()=>global.simFixture.open();document.querySelector('#theme-preview-nav')?.append(worldButton);
for(const {id,title} of packages){const b=document.createElement('button');b.textContent=title;b.onclick=async()=>{await global.simFixture.use(id);global.simFixture.open();};document.querySelector('#theme-preview-nav')?.append(b);}
