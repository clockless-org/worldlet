// Frozen copy of a package written against Theme contract v2 (scripts/theme-contract-check.ts). It uses every part
// of the contract a package can touch. Never edit it to follow a contract change: if it stops compiling or
// validating, the change is incompatible and needs a new contract version.
import type {BuildTheme,ThemeAppletContext,ThemeWorldContext,ThemeWorldState,ThemeWorldMount,ThemeMount,ThemeItem} from '@worldlet/theme';
function renderWorld(context:ThemeWorldContext):ThemeWorldMount {
 const {host,scene,navigate,menu,moveApplet,asset}=context;
 const list=document.createElement('nav');list.style.backgroundImage='url("'+asset(scene.background)+'")';host.append(list);
 const draw=(state:ThemeWorldState)=>{
  list.replaceChildren();
  const {view,areas,interaction,pins,environment,motion}=state;list.dataset.view=view.id+':'+view.level+':'+areas.length+':'+interaction.inset+':'+Object.keys(pins).length+':'+Object.keys(environment).length+':'+motion;
  for(const applet of state.applets){
   const b=document.createElement('button');b.textContent=applet.title+(applet.count?' '+applet.count:'')+(applet.status||'')+applet.key+applet.region;b.hidden=!applet.visible;
   if(applet.icon){const img=document.createElement('img');img.src=applet.icon;b.append(img);}
   b.onclick=()=>navigate({kind:'applet',id:applet.id});b.oncontextmenu=e=>menu(applet.id,e.clientX,e.clientY);b.ondrop=()=>moveApplet(applet.id,areas[0]?.id||'',0);list.append(b);
  }
 };
 draw(context.state);
 return {update:draw,event:e=>e.type==='mail.received'||e.ids.length>0,anchor:()=>({x:0,y:0}),bounds:()=>({x:0,y:0,width:1,height:1}),dispose(){list.remove();}};
}
function renderApplet(context:ThemeAppletContext):ThemeMount {
 const {host,applet,scene,items,data,actions,invalidate,renderDefault,asset}=context;
 const plane=document.createElement('section');plane.title=applet.title+scene.size.join('x')+asset(scene.background)+(data.now??'')+(data.sample?'s':'')+(data.connected?'c':'')+(data.reading?'r':'')+(data.error||'');host.append(plane);
 for(const item of items as readonly ThemeItem[]){const b=document.createElement('button');b.textContent=[item.title,item.summary,item.context,item.start,item.end,item.local,item.curated].join(' ');b.onclick=()=>actions.openItem(item.id);plane.append(b);
  if(actions.records&&item.record){void actions.records.save(item.record);void actions.records.remove(item.id);}}
 renderDefault(plane);invalidate();
 return {dispose(){plane.remove();}};
}
const theme:BuildTheme={contractVersion:2,id:'frozen-v2',renderWorld,renderApplet};
export default theme;
