import type {BuildTheme,ThemeAppletContext,ThemeItem} from '@worldlet/theme';
import {renderWorld} from './world.ts';
import {frame,node} from './frame.ts';
type SheetState={selected?:string;full?:boolean};
const sheets=new WeakMap<HTMLElement,Record<string,SheetState>>();
const when=(item:ThemeItem)=>{const at=item.start&&Date.parse(item.start);return at&&Number.isFinite(at)?new Date(at).toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';};
/** Every Applet, including ones added later, opens as a detail sheet: records on drafting paper, with the host's full reader one click away. */
function renderApplet(context:ThemeAppletContext){
 const {data,items,applet}=context;
 const mounted=frame(context.host,context.scene);mounted.canvas.classList.add('blueprint-sheet');
 const plate=node('img','blueprint-plate');plate.src=context.asset(context.scene.background);plate.alt='';plate.draggable=false;mounted.canvas.append(plate);
 let byApplet=sheets.get(context.host);if(!byApplet){byApplet={};sheets.set(context.host,byApplet);}const state=byApplet[applet.id]||={};
 const header=node('header','blueprint-heading');
 const status=node('p','blueprint-state',data.error||(data.reading?'Reading…':data.sample?'Sample records':data.connected?'Connected':items.length?'Saved records':'Not connected yet'));status.setAttribute('role','status');
 const toggle=node('button','blueprint-toggle',state.full?'Back to records':'Full view');toggle.type='button';toggle.setAttribute('aria-pressed',String(!!state.full));
 toggle.onclick=()=>{state.full=!state.full;context.invalidate();};
 header.append(node('h1','',applet.title),status,toggle);mounted.place(header,'header');
 const body=node('div','blueprint-body');mounted.place(body,'content');
 if(state.full)context.renderDefault(body);
 else if(!items.length){body.classList.add('blueprint-body-empty');body.append(node('h2','',data.error?'This sheet could not be read':data.reading?'Reading…':'Nothing on this sheet yet'),node('p','',data.error||'New records appear here as soon as they arrive.'));}
 else{
  body.classList.add('blueprint-records');
  const list=node('nav','blueprint-list'),reader=node('article','blueprint-reader');list.setAttribute('aria-label',applet.title+' records');reader.tabIndex=0;
  const show=(item:ThemeItem)=>{
   state.selected=item.id;for(const b of list.querySelectorAll<HTMLElement>('[data-item-id]'))b.setAttribute('aria-current',String(b.dataset.itemId===item.id));
   const open=node('button','blueprint-open','Open original');open.type='button';open.onclick=()=>context.actions.openItem(item.id);
   reader.replaceChildren(node('p','blueprint-eyebrow',[item.curated?'Fox summary':'',when(item)].filter(Boolean).join(' · ')||'Record'),node('h2','',item.title),node('div','blueprint-copy',item.summary||item.context||''),open);
  };
  for(const item of items){const b=node('button','blueprint-record');b.type='button';b.dataset.itemId=item.id;b.append(node('strong','',item.title),node('span','',item.context||when(item)||item.summary||''));b.onclick=()=>show(item);list.append(b);}
  body.append(list,reader);show(items.find(i=>i.id===state.selected)||items[0]);
 }
 return {dispose:mounted.dispose};
}
const theme:BuildTheme={contractVersion:2,id:'blueprint',renderWorld,renderApplet};
export default theme;
