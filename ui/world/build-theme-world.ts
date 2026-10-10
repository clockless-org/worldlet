import {renderBuildWorld,applyBuildThemeScene,activeBuildTheme,type ThemeWorldState,type ThemeWorldMark,type ThemeLampState} from '../themes/index.ts';
import {createAppletStage} from './theme-applet-stage.ts';
import {appletStatus,myAppletKind} from '../../core/applets/index.ts';
import {appletLamp,appletLampContent,lampDisplayState} from './applet-lamp.ts';
import {appletConnectionGuide} from './applet-attention.ts';
import {shellInteraction,worldPaused as paused} from './shell-interaction.ts';
/** The host's picture of an Applet: a person's own Applet's icon, else its shared device art. */
function appletIcon(room):string|undefined {
 if(myAppletKind(room)&&typeof room.icon==='string')return room.icon;
 const art=(globalThis as any).__WORLDLET_25D_ASSETS__?.devices?.[room.art||room.key];
 const src=typeof art==='string'?art:art?.src;return typeof src==='string'&&src?src:undefined;
}
/** Compatibility adapter from the product's scene controller to the public Sim data interface. */
export function createModuleScene(host,rooms,onPick,onProject,pages,options):any {
 const world=document.createElement('div');world.className='ui-theme-world-scene';world.dataset.renderer='sim-dom';Object.assign(world.style,{position:'absolute',inset:'0'});host.append(world);
 const stage=createAppletStage(host,onPick),stages=new Map(),activities=new Map<string,any>();
 let view:ThemeWorldState['view']={id:'overview',level:'overview'},environment={},motion=true,disposed=false,connections=options.connections||[],marked=false;
 const interaction={placementArea:null as string|null,framedArea:null as string|null,inset:0,hoveredApplet:null as string|null,hoveredArea:null as string|null};
 let hidden=new Set(options.hiddenApplets||[]),unlocked=options.unlockedApplets?new Set(options.unlockedApplets):null;
 const visible=r=>!hidden.has(r.moduleId)&&(unlocked?unlocked.has(r.moduleId):r.installByDefault!==false);
 /** The lamp as the host shows it (applet-lamp.ts): an error only shows while its action can be reached. */
 const lamp=(r,shell:ReturnType<typeof shellInteraction>):ThemeLampState|undefined=>{
  if(r.entity==='matter')return undefined;
  const own=r.provider?[...(pages?.values?.()||[])].filter(p=>p.sourceProvider===r.provider):[],activity=activities.get(r.moduleId);
  const state=appletLamp(appletStatus(r,connections)||{},activity,appletLampContent(r.provider,own,!!(r.children?.length||r.sampleRecords?.length)));
  return lampDisplayState({state,action:options.lampAction?.(r,state,activity)},!shell.covered&&(view.level!=='applet'||view.id===r.moduleId));
 };
 const state=():ThemeWorldState=>{const shell=shellInteraction(host);return {view:{...view},environment:{...environment},motion,paused:paused(),interaction:{...interaction,...shell},pins:structuredClone(options.regionLayout?.pins||{}),
  areas:(options.buildings||[]).filter(b=>b.id!=='building-people').map(b=>({id:b.id,title:b.title})),
  applets:rooms.map(r=>({id:r.moduleId||r.id,key:r.key||r.id,title:r.title,region:r.region||String(r.buildingId||'').replace(/^building-/,''),visible:visible(r),status:r.status?.state,count:r.status?.count,icon:appletIcon(r),
   lamp:lamp(r,shell),connected:r.entity==='matter'?undefined:!!appletStatus(r,connections)?.connected,mine:myAppletKind(r)||undefined,object:r.entity==='matter'||undefined}))};};
 /** The theme's marks as the shell's pins: the shell draws the buttons, names, lamps and attention marks. */
 const marks=(points:Readonly<Record<string,ThemeWorldMark>>)=>{
  if(disposed)return;marked=true;const out={},action={applet:'space',area:'region-more','area-add':'region-more',slot:'placement'},kind={applet:'app',area:'region-more','area-add':'region-add',slot:'region-slot'};
  for(const [key,m] of Object.entries(points)){
   const room=m.kind==='applet'?rooms.find(r=>(r.moduleId||r.id)===m.id):null,area=(options.buildings||[]).find(b=>b.id===m.id);
   if(m.kind==='applet'&&!room)continue;
   const point:any={id:room?room.id:m.id,title:m.kind==='area-add'||m.kind==='slot'?'+':room?.title||area?.title||m.id,action:action[m.kind],kind:kind[m.kind],level:m.kind==='applet'?'room':'building',x:m.x,y:m.y,visible:m.visible,hovered:!!m.hovered};
   if(m.kind==='slot'){point.slot=m.slot;point.description='Place applet in slot '+((m.slot||0)+1);}
   if(m.kind==='area'){point.caption='';point.description='Manage '+(area?.title||m.id);}
   if(m.kind==='area-add')point.description='Add applets to '+(area?.title||m.id);
   if(room){const lampState=lamp(room,shellInteraction(host))||'off',status=appletStatus(room,connections)||{};
    Object.assign(point,{labelVisible:!!m.label,running:lampState==='processing',lampState,lampX:m.lamp?.x||0,lampY:m.lamp?.y||0,attentionX:m.attention?.x||0,attentionOffset:-(m.attention?.y||0),
     attention:lampState==='error'||!['overview','area'].includes(view.level)?null:appletConnectionGuide(room.provider,status)});}
   out[key]=point;
  }
  onProject(out);
 };
 const mount=renderBuildWorld({host:world,state:state(),navigate:target=>{
  if(target.kind==='applet'){const r=rooms.find(r=>(r.moduleId||r.id)===target.id);if(r&&state().applets.find(a=>a.id===target.id)?.visible)onPick({action:'space',id:r.id,level:'room'});}
  else if((options.buildings||[]).some(b=>b.id===target.id))onPick({action:'building',id:target.id});
 },moveApplet:(id,area,slot)=>{if(rooms.some(r=>r.moduleId===id)&&state().areas.some(a=>a.id==='building-'+area))options.onMoveApplet?.(id,area,slot);},menu:(id,x,y)=>{if(state().applets.some(a=>a.id===id&&a.visible))options.onAppletMenu?.(id,x,y);},
  marks,back:()=>{if(!disposed&&view.level!=='overview')onPick({action:'back'});}});
 function refresh(){if(disposed)return;mount.update(state());world.hidden=view.level==='applet'&&!mount.behindApplet;
  const room=rooms.find(r=>r.moduleId===view.id||r.id===view.id);
  if(room)stage.render(room,stages.get(room.moduleId)||{items:[]},view.level==='applet');
  else stage.render({key:'',moduleId:'',title:''},{items:[]},false);
  if(view.level!=='applet')applyBuildThemeScene(activeBuildTheme().package!.presentation.world);
  // A theme that marks nothing renders its own accessible map buttons. No duplicate pins.
  if(!marked)onProject({});
 }
 // The shell's own state changes without a scene call; follow it, and redraw only when it changed.
 let shellKey=JSON.stringify(shellInteraction(host))+paused(),checking=false;
 const follow=()=>{if(checking||disposed)return;checking=true;requestAnimationFrame(()=>{checking=false;const next=JSON.stringify(shellInteraction(host))+paused();if(next!==shellKey){shellKey=next;refresh();}});};
 const observer=new MutationObserver(follow);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open','data-onboarding-locked','data-detail-open','data-attention-preview','data-template']});
 document.addEventListener('visibilitychange',follow);window.addEventListener('worldlet:desktop-companion',follow);
 queueMicrotask(()=>{if(!disposed){refresh();host.dispatchEvent(new Event('worldlet:world-ready',{bubbles:true}));}});
 return {
  focus(id,level='building'){view={id,level:id==='overview'?'overview':level==='object'?'applet':'area'};refresh();},
  refreshContent:refresh,refreshRegions:refresh,stageState:()=>new Map(stages),
  setAppStage(id,value){stages.set(id,value);refresh();},
  setFocusItem(id,item){const room=rooms.find(r=>r.moduleId===id);if(room)stage.setSelected(room,item);},
  selectStageItem(_id,id){return stage.select(id);},
  setAppletLayout(ids){hidden=new Set(ids||[]);refresh();},
  async setUnlockedApplets(ids,fromCenter=false,icons={},settled=false){
   const before=new Set(rooms.filter(visible).map(r=>r.moduleId)),had=!!unlocked;unlocked=ids?new Set(ids):null;refresh();
   const arriving=had?rooms.filter(r=>visible(r)&&!before.has(r.moduleId)).map(r=>r.moduleId):[];
   if(arriving.length)await mount.event({type:'applet.arrived',ids:arriving,...(fromCenter?{from:'center' as const,icons}:{}),settled});
  },
  setEnvironment(value){environment=value||{};refresh();},setConnections(list){connections=list||[];refresh();},
  setAppActivity(id,value){activities.set(id,value);const r=rooms.find(r=>r.moduleId===id);if(r)r.status={...r.status,...value};refresh();},
  devicePoint(id){return mount.anchor(id);},
  setDevicePresence(id,value){if(value)hidden.delete(id);else hidden.add(id);refresh();return true;},
  toggleMotion(){motion=!motion;stage.setMotion(motion);refresh();return motion;},
  setPlacementArea(id){interaction.placementArea=id;refresh();},frameArea(id,inset=0){interaction.framedArea=id;interaction.inset=inset;refresh();},
  setHoveredApplet(id){interaction.hoveredApplet=id;refresh();},setHoveredArea(id){interaction.hoveredArea=id;refresh();},
  // Arrivals play when the Applets are unlocked (setUnlockedApplets); preparing only refreshes their places.
  prepareArrival(){refresh();},
  deliverMail(){const played=mount.event({type:'mail.received',ids:[]});return typeof played==='boolean'?played:true;},
  picture(){return mount.picture?.()||null;},
  get metrics(){return {renderer:'sim-dom',theme:activeBuildTheme().id,level:view.level==='applet'?'object':view.level,active:view.id,environment,
   buildings:options.buildings||[],modules:state().applets.map(a=>({...a,unlocked:a.visible,visible:a.visible&&view.level!=='applet',peekBounds:mount.bounds(a.id),arrivalBounds:mount.bounds(a.id),arrivalVisible:a.visible})),presentation:{id:view.level==='applet'?view.id:null,stage:stage.metrics},
   ...(mount.metrics?.()||{})};},
  destroy(){if(disposed)return;disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',follow);window.removeEventListener('worldlet:desktop-companion',follow);mount.dispose();stage.destroy();world.remove();}
 };
}
