import {renderBuildTheme,type ThemeMount} from '../themes/index.ts';
import {renderHomeOpen,renderMailOpen,renderMeetingsOpen,type HomeOpenState} from '../applets/index.ts';
import {HOME_RECORDS} from '../../core/applets/index.ts';
/** Product data/capability adapter. All scene art, coordinates and HTML composition belong to the Sim. */
export function createAppletStage(host,onPick){
 host.classList.add('ui-theme-world');
 const panel=document.createElement('section');panel.className='pixi-applet-stage ui-theme-applet';panel.hidden=true;panel.setAttribute('aria-label','Applet contents');host.append(panel);
 const homeState:HomeOpenState={mode:'week',offset:0};const mailState={category:'attention',offset:0};
 let mount:ThemeMount|null=null,signature='',owner='',selected:any=null,items:any[]=[],motion=true,destroyed=false,generation=0;
 let current:any=null,latest:any=null,visible=false;
 const dispose=()=>{generation++;if(mount){try{mount.dispose();}catch(error){console.warn('Sim cleanup failed',error);}mount=null;}panel.replaceChildren();delete panel.dataset.themeRendered;};
 const pick=(id:string)=>{const item=items.find(i=>i.id===id);if(item){selected=item;onPick({action:'applet-item',id});}};
 const redraw=()=>{if(destroyed||!visible||!current)return;signature='';render(current,latest,true);};
 const showCalendar=(event:Event)=>{const day=(event as CustomEvent).detail?.day;if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return;const today=new Date(latest?.now||Date.now());today.setHours(12,0,0,0);homeState.offset=Math.round((+new Date(day+'T12:00:00')-+today)/86400000);homeState.mode='day';if(current?.key==='google-calendar')redraw();};
 window.addEventListener('worldlet:calendar-show',showCalendar);
 function render(room,value,shown,_focused=false,_showDevice=false){
  if(destroyed)return;current=room;latest=value||{};visible=shown;
  if(panel.hidden===shown)panel.hidden=!shown;
  if(!shown){if(mount)dispose();signature='';return;}
  if(owner!==room.moduleId){owner=room.moduleId;selected=null;homeState.mode='week';homeState.offset=0;homeState.editing=null;homeState.scroll=null;homeState.undo=null;}
  items=(value?.items||[]).filter(i=>!['done','dismissed'].includes(i.status));
  const next=JSON.stringify([owner,room.key,items,value?.connected,value?.reading,value?.error,value?.sample,value?.loaded,!!value?.calendar,motion,new Date(value?.now||Date.now()).toDateString()]);
  if(next===signature)return;signature=next;dispose();const epoch=generation;
  panel.dataset.applet=room.key||'';panel.dataset.themeRendered='true';
  mount=renderBuildTheme({host:panel,applet:{id:room.key,title:room.title},items:items.map(i=>({...i,record:i.record?{...i.record}:undefined})),
   data:{now:value?.now,sample:value?.sample,connected:value?.connected,reading:value?.reading,error:value?.error},
   actions:{records:value?.calendar,openItem:pick},
   invalidate:()=>{if(epoch===generation)redraw();},
   renderDefault:target=>{
    target.classList.add('ui-theme-default');
    if(HOME_RECORDS.includes(room.key)){target.classList.add('home-open');renderHomeOpen(target,room,items,value,homeState,item=>pick(item.id),redraw);}
    else if(room.key==='meetings')renderMeetingsOpen(target,room,items,value,item=>pick(item.id));
    else if(room.key==='gmail'){const device=document.createElement('img');device.hidden=true;renderMailOpen(target,items,value,mailState,item=>pick(item.id),redraw,device);}
    else {if(!items.length){const empty=document.createElement('p');empty.textContent=value?.error||(value?.reading?'Reading…':'Nothing here yet');target.append(empty);}for(const item of items){const button=document.createElement('button');button.type='button';button.className='ui-button';button.textContent=item.title;button.onclick=()=>pick(item.id);target.append(button);}}
   }});
 }
 return {render,setMotion(value:boolean){motion=value;redraw();},setSelected(room,item){owner=room.moduleId;selected=item;},select(id){selected=items.find(i=>i.id===id)||null;return selected;},
  get metrics(){return panel.hidden?null:{items:items.length,shown:true,preview:false,selected:selected?.id||null};},
  destroy(){if(destroyed)return;destroyed=true;dispose();window.removeEventListener('worldlet:calendar-show',showCalendar);panel.remove();}};
}
