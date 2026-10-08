import {node,textButton as button} from '../../components/index.ts';
import {widgetUntil,type Widget} from '../../../core/widgets/index.ts';

const el:(tag:string,cls?:string,text?:unknown)=>any=node;
export const momentLine=(moment:Pick<Widget,'pinned'|'archivedAt'|'endsAt'>)=>widgetUntil({archivedAt:null,...moment} as Widget,Date.now()/1000);

// A moment Applet (core/widgets/README.md): the page Fox made, in its own sandboxed view that the host lays over the
// slot this panel reserves (never an iframe: the World page allows none), with its end, Pin, a change and Delete.
// One panel serves every moment Applet; `open` points it at one.
export function createMomentApplet({native,content,ask=(_text:string)=>{}}){
 const root=el('section','moment-applet');
 const status=el('p','moment-message');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.hidden=true;
 const bar=el('div','moment-bar'),until=el('p','moment-until'),actions=el('div','moment-actions'),slot=el('div','moment-slot');
 bar.append(until,actions);slot.setAttribute('aria-label','Applet page');root.append(status,bar,slot);
 let selected:any=null,visible=false,shown='',lastRect='',epoch=0;
 const api=body=>{if(!native?.widgets)throw Error('Applets Fox makes work in your own world in the Worldlet app.');return native.widgets(body);};
 const player=body=>{if(!native?.widgetPlayer)throw Error('Applets Fox makes work in your own world in the Worldlet app.');return native.widgetPlayer(body);};
 const message=(text:string,error=false)=>{status.textContent=text;status.dataset.error=String(error);status.hidden=!text;};
 async function run(fn:()=>unknown){try{return await fn();}catch(e){message(e.message||String(e),true);return null;}}
 function draw(){
  if(!selected)return;
  root.style.setProperty('--moment-accent',selected.color);root.dataset.moment=selected.id;
  until.textContent=[momentLine(selected),selected.blurb].filter(Boolean).join(' · ');
  actions.replaceChildren(
   button(selected.pinned?'Unpin':'Keep it',()=>run(()=>update(selected.pinned?'unpin':'pin'))),
   button('Ask Fox to change it',()=>ask(`Change my Applet “${selected.title}” (${selected.id}): `)),
   button('Delete',()=>run(()=>update('delete')),'moment-delete'));
 }
 async function load(){
  const id=selected?.id;if(!id)return;
  const list=await api({operation:'list'}),found=[...list.now||[],...list.finished||[]].find(w=>w.id===id);
  if(!found){selected=null;await hide();return;}
  selected=found;draw();message('');
 }
 async function update(operation:string){
  const id=selected?.id;if(!id)return;
  const result=await api({operation,id});if(result?.cancelled)return;
  if(operation==='delete'){selected=null;await hide();return;}
  await load();
 }
 function rect(){const r=slot.getBoundingClientRect(),p=content.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,visible:!document.hidden&&r.width>0&&r.top>=p.top-1&&r.bottom<=p.bottom+1,focus:true};}
 async function layout(){
  if(!visible||!selected)return;
  const r=rect(),key=JSON.stringify(r),id=selected.id,current=epoch;
  if(shown===id&&key===lastRect)return;lastRect=key;
  if(shown!==id){await player({operation:'show',id,rect:r});if(current===epoch&&visible&&selected?.id===id)shown=id;}
  else await player({operation:'layout',rect:r});
 }
 async function hide(){epoch++;shown='';lastRect='';await player({operation:'hide'}).catch(()=>{});}
 function sync(){
  const next=root.isConnected&&!content.hidden&&content.contains(root);if(next===visible)return;visible=next;
  if(!visible)void run(hide);else void run(async()=>{await load();await layout();});
 }
 new MutationObserver(()=>{sync();if(visible)void run(layout);}).observe(content,{attributes:true,childList:true,subtree:true,attributeFilter:['hidden','data-template']});
 new ResizeObserver(()=>{if(visible)void run(layout);}).observe(slot);
 window.addEventListener('resize',()=>void run(layout));document.addEventListener('visibilitychange',()=>void run(layout));
 window.addEventListener('worldlet:widgets',(event:any)=>{if(visible&&event.detail?.id===selected?.id)void run(load);});
 return {element:root,
  /** Point the panel at one moment Applet (its record from the World) and show it. */
  open(moment:{id:string;title:string;blurb?:string;color:string;endsAt:number;pinned:boolean}){
   if(selected?.id!==moment.id){epoch++;shown='';lastRect='';}
   selected={archivedAt:null,...selected?.id===moment.id?selected:{},...moment};message('');draw();sync();if(visible)void run(async()=>{await load();await layout();});
  }};
}
