import {renderBuildWorld,applyBuildThemeScene,activeBuildTheme,type ThemeWorldState,type ThemeWorldMark,type ThemeWorldApplet,type ThemeLampState} from '../themes/index.ts';
import {createAppletStage} from './theme-applet-stage.ts';
import {createAppletStage as createVillageStage} from './pixi-stage.ts';
import {renderVillageWorld,type VillageWorldMount} from './village/village-world.ts';
import {createAppletImageLamps} from './applet-image-lamps.ts';
import {createLampLabel,stackLampLabels} from './applet-lamp-label.ts';
import {createLevelZoom} from './level-zoom.ts';
import type {LampSignal} from './applet-lamp.ts';
import {appletStatus,myAppletKind,CODING_SESSIONS} from '../../core/applets/index.ts';
import {lastUse,regionId} from './region-layout.ts';
import {weeklyQuota} from './weekly-allowance.ts';
import {appletLamp,appletLampContent,lampDisplayState} from './applet-lamp.ts';
import {appletConnectionGuide} from './applet-attention.ts';
import {shellInteraction,worldPaused as paused} from './shell-interaction.ts';
/** The host's picture of an Applet: a person's own Applet's icon, else its shared device art. */
function appletIcon(room):string|undefined {
 if(myAppletKind(room)&&typeof room.icon==='string')return room.icon;
 const art=(globalThis as any).__WORLDLET_25D_ASSETS__?.devices?.[room.art||room.key];
 const src=typeof art==='string'?art:art?.src;return typeof src==='string'&&src?src:undefined;
}
/** Compatibility adapter from the product's scene controller to the public Sim data interface. Every theme's World,
 * the built-in Village's too, is drawn through it; the host draws what is the same in every theme: the pins, lamp
 * labels and lamps on device pictures, and the zoom between the World and an Applet. */
export function createModuleScene(host,rooms,onPick,onProject,pages,options):any {
 const builtIn=!activeBuildTheme().package,shellRoot=(host.closest('.notion-world')||host) as HTMLElement;
 const world=document.createElement('div');world.className='ui-theme-world-scene';world.dataset.renderer=builtIn?'village':'sim-dom';Object.assign(world.style,{position:'absolute',inset:'0'});
 // The Village draws under the shell's pins; a package draws its own buttons over them.
 if(builtIn)host.prepend(world);else host.append(world);
 const stage=builtIn?createVillageStage(host,onPick):createAppletStage(host,onPick),stages=new Map(),activities=new Map<string,any>();
 const imageLamps=builtIn?createAppletImageLamps(shellRoot,(globalThis as any).__WORLDLET_25D_ASSETS__):null,lampLabels=new Map<string,ReturnType<typeof createLampLabel>>();
 const levelZoom=builtIn?createLevelZoom(shellRoot,host):null;
 let view:ThemeWorldState['view']={id:'overview',level:'overview'},environment={},motion=true,disposed=false,connections=options.connections||[],marked=false;
 const interaction={placementArea:null as string|null,framedArea:null as string|null,inset:0,hoveredApplet:null as string|null,hoveredArea:null as string|null};
 let arriving:string[]=[],hidden=new Set(options.hiddenApplets||[]),unlocked=options.unlockedApplets?new Set(options.unlockedApplets):null;
 const visible=r=>!hidden.has(r.moduleId)&&(unlocked?unlocked.has(r.moduleId):r.installByDefault!==false);
 /** Each Applet's lamp (applet-lamp.ts), read again at most twice a second: pins move every frame, records do not. */
 let signals=new Map<string,LampSignal>(),signalsAt=-Infinity;
 const signalOf=(r):LampSignal|undefined=>{
  if(r.entity==='matter')return undefined;
  if(performance.now()-signalsAt>500){signalsAt=performance.now();signals=new Map();const byProvider=new Map<string,any[]>();
   for(const p of pages?.values?.()||[]){const own=byProvider.get(p.sourceProvider);if(own)own.push(p);else byProvider.set(p.sourceProvider,[p]);}
   for(const room of rooms)if(room.entity!=='matter'){const activity=activities.get(room.moduleId),state=appletLamp(appletStatus(room,connections)||{},activity,appletLampContent(room.provider,byProvider.get(room.provider)||[],!!(room.children?.length||room.sampleRecords?.length)));
    signals.set(room.moduleId,{state,action:options.lampAction?.(room,state,activity)});}}
  return signals.get(r.moduleId);
 };
 /** The lamp as the host shows it: an error only shows while its action can be reached. */
 const lamp=(r,shell:ReturnType<typeof shellInteraction>):ThemeLampState|undefined=>{
  const signal=signalOf(r);return signal?lampDisplayState(signal,!shell.covered&&(view.level!=='applet'||view.id===r.moduleId)):undefined;
 };
 const state=():ThemeWorldState=>{const shell=shellInteraction(host);return {view:{...view},environment:{...environment},motion,paused:paused(),...(arriving.length?{arriving:[...arriving]}:{}),interaction:{...interaction,...shell},pins:structuredClone(options.regionLayout?.pins||{}),
  areas:(options.buildings||[]).filter(b=>b.id!=='building-people').map(b=>{const look=options.regionLayout?.themes?.[regionId(b.id)]||b.visualTheme;return {id:b.id,title:b.title,...(look?{look}:{})};}),
  applets:rooms.map(r=>({id:r.moduleId||r.id,key:r.key||r.id,title:r.title,region:r.region||String(r.buildingId||'').replace(/^building-/,''),visible:visible(r),status:r.status?.state,count:r.status?.count,icon:appletIcon(r),
   lamp:lamp(r,shell),connected:r.entity==='matter'?undefined:!!appletStatus(r,connections)?.connected,mine:myAppletKind(r)||undefined,object:r.entity==='matter'||undefined,
   art:r.art&&r.art!==r.key?r.art:undefined,usedAt:lastUse(r,options.regionLayout)||undefined,staged:stages.has(r.moduleId)||undefined,allowance:allowance(r)}))};};
 /** A coding Applet's weekly allowance, from the usage its sessions last reported (setAppActivity). */
 function allowance(r):ThemeWorldApplet['allowance'] {
  if(!CODING_SESSIONS.includes(r.key))return undefined;
  const usage=activities.get(r.moduleId)?.usage;if(usage?.placeholder===true)return {unavailable:true};
  const quota=weeklyQuota(usage);return quota?{remaining:quota.remaining,resetsAt:quota.resetsAt}:{};
 }
 /** The theme's marks as the shell's pins: the shell draws the buttons, names, lamps and attention marks. */
 const marks=(points:Readonly<Record<string,ThemeWorldMark>>)=>{
  if(disposed)return;marked=true;const out={},action={applet:'space',area:'region-more','area-add':'region-more',slot:'placement'},kind={applet:'app',area:'region-more','area-add':'region-add',slot:'region-slot'};
  for(const m of Object.values(points)){
   const room=m.kind==='applet'?rooms.find(r=>(r.moduleId||r.id)===m.id):null,area=(options.buildings||[]).find(b=>b.id===m.id);
   if(m.kind==='applet'&&!room)continue;
   // The shell's pins keep one key per place, whichever theme marks it.
   const key=m.kind==='applet'?'space:'+room.id:m.kind==='slot'?'region-slot:'+m.slot:kind[m.kind]+':'+regionId(m.id);
   const point:any={id:room?room.id:m.id,title:m.kind==='area-add'||m.kind==='slot'?'+':room?.title||area?.title||m.id,action:action[m.kind],kind:kind[m.kind],level:m.kind==='applet'?'room':'building',x:m.x,y:m.y,visible:m.visible,hovered:!!m.hovered};
   if(m.kind==='slot'){point.slot=m.slot;point.description='Place applet in slot '+((m.slot||0)+1);}
   if(m.kind==='area'){point.caption='';point.description='Manage '+(area?.title||m.id);}
   if(m.kind==='area-add')point.description='Add applets to '+(area?.title||m.id);
   if(room){const lampState=signalOf(room)?.state||'off',status=appletStatus(room,connections)||{};
    Object.assign(point,{labelVisible:!!m.label,running:lampState==='processing',lampState,lampX:m.lamp?.x||0,lampY:m.lamp?.y||0,attentionX:m.attention?.x||0,attentionOffset:-(m.attention?.y||0),
     attention:lampState==='error'||!['overview','area'].includes(view.level)?null:appletConnectionGuide(room.provider,status)});}
   out[key]=point;
  }
  onProject(out);
  if(builtIn)drawLamps(out);
 };
 /** Lamp labels and the lamps on device pictures, where the marks put them (applet-lamp-label.ts, applet-image-lamps.ts). */
 function drawLamps(points:Record<string,any>){
  const covered=shellInteraction(host).covered,current=view.level==='applet'?rooms.find(r=>r.moduleId===view.id):null;
  const byKey=new Map<string,LampSignal>();for(const r of rooms){const s=signalOf(r);if(s)byKey.set(r.key,s);}
  const still=!motion||matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden;
  imageLamps?.update(byKey,current?.key,!covered,performance.now(),still);
  for(const r of rooms){
   const signal=byKey.get(r.key);if(!signal)continue;
   const point=points['space:'+r.id],foreground=current===r,visible=!covered&&(foreground||!!point?.visible);
   let label=lampLabels.get(r.key);
   if(!label&&visible&&['processing','error'].includes(signal.state)){label=createLampLabel(shellRoot,r.key);lampLabels.set(r.key,label);}
   // Foreground includes website Focus, where the live device can be hidden.
   label?.update(signal,r.title,visible,foreground?shellRoot.clientWidth*.75:point?.x+(point?.attentionX||0),foreground?72:point?.y-(point?.attentionOffset||0),foreground);
  }
  stackLampLabels(shellRoot);
 }
 const context={host:world,state:state(),navigate:target=>{
  if(target.kind==='applet'){const r=rooms.find(r=>(r.moduleId||r.id)===target.id);if(r&&state().applets.find(a=>a.id===target.id)?.visible)onPick({action:'space',id:r.id,level:'room'});}
  else if((options.buildings||[]).some(b=>b.id===target.id))onPick({action:'building',id:target.id});
 },moveApplet:(id,area,slot)=>{if(rooms.some(r=>r.moduleId===id)&&state().areas.some(a=>a.id==='building-'+area))options.onMoveApplet?.(id,area,slot);},menu:(id,x,y)=>{if(state().applets.some(a=>a.id===id&&a.visible))options.onAppletMenu?.(id,x,y);},
  marks,back:()=>{if(!disposed&&view.level!=='overview')onPick({action:'back'});},
  openArea:id=>{if(!disposed&&state().areas.some(a=>a.id===id))onPick({action:'region-more',id});}};
 const village:VillageWorldMount|null=builtIn?renderVillageWorld(context):null;
 const mount=village||renderBuildWorld(context);
 function refresh(){if(disposed)return;mount.update(state());world.hidden=view.level==='applet'&&!mount.behindApplet;
  const room=rooms.find(r=>r.moduleId===view.id||r.id===view.id);
  if(village){
   // The Village's Applet stage: its reader stays put while the item's detail or the website is open.
   const shell=shellInteraction(host),open=view.level==='applet'&&!!room&&stages.has(room.moduleId);
   stage.render(room||{},room?stages.get(room.moduleId):undefined,open&&!shell.website&&!shell.detailOpen,open&&shell.detailOpen&&!shell.website,view.level==='applet');
  }
  else if(room)stage.render(room,stages.get(room.moduleId)||{items:[]},view.level==='applet');
  else stage.render({key:'',moduleId:'',title:''},{items:[]},false);
  if(!village&&view.level!=='applet')applyBuildThemeScene(activeBuildTheme().package!.presentation.world);
  // A theme that marks nothing renders its own accessible map buttons. No duplicate pins.
  if(!marked)onProject({});
 }
 // The shell's own state changes without a scene call; follow it, and redraw only when it changed.
 let shellKey=JSON.stringify(shellInteraction(host))+paused(),checking=false;
 const follow=()=>{if(checking||disposed)return;checking=true;requestAnimationFrame(()=>{checking=false;const next=JSON.stringify(shellInteraction(host))+paused();if(next!==shellKey){shellKey=next;refresh();}});};
 const observer=new MutationObserver(follow);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open','data-onboarding-locked','data-detail-open','data-attention-preview','data-template']});
 document.addEventListener('visibilitychange',follow);window.addEventListener('worldlet:desktop-companion',follow);
 // The Village says it is ready itself, once its first frame is drawn (pixi-world.ts).
 queueMicrotask(()=>{if(!disposed){refresh();if(!village)host.dispatchEvent(new Event('worldlet:world-ready',{bubbles:true}));}});
 /** Where an Applet's device is on screen, for the zoom between the World and an Applet. */
 const center=(id:string)=>{const b=mount.bounds(id);if(!b||!(b.width>0))return null;const r=world.getBoundingClientRect();return {x:r.left+b.x+b.width/2,y:r.top+b.y+b.height/2};};
 return {
  focus(id,level='building'){
   const next:ThemeWorldState['view']=id==='overview'?{id,level:'overview'}:level==='object'?{id:rooms.find(r=>r.moduleId===id||r.id===id)?.moduleId||id,level:'applet'}:{id,level:'area'};
   // Moving between the World (or an open area) and an Applet zooms (level-zoom.ts); moving between two Applets does not.
   const entering=view.level!=='applet'&&next.level==='applet',leaving=view.level==='applet'&&next.level!=='applet';
   const shot=levelZoom&&(entering||leaving)&&motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.hidden?mount.picture?.()||null:null;
   const origin=shot?entering?levelZoom!.enter(next.id,center(next.id)):levelZoom!.leave(view.id,center(view.id)):null;
   if(!shot&&(entering||leaving))levelZoom?.finish();
   view=next;refresh();
   if(shot&&origin)levelZoom!.run(entering?'in':'out',shot,origin,{settle:()=>!interaction.framedArea});
  },
  refreshContent(){refresh();},refreshRegions(){refresh();},stageState:()=>new Map(stages),
  setAppStage(id,value){stages.set(id,value);refresh();},
  // A new selection shows at once; nothing else redraws the stage until the shell changes.
  setFocusItem(id,item){const room=rooms.find(r=>r.moduleId===id);if(room){stage.setSelected(room,item);refresh();}},
  selectStageItem(_id,id){const item=stage.select(id);refresh();return item;},
  setAppletLayout(ids){hidden=new Set(ids||[]);refresh();},
  async setUnlockedApplets(ids,fromCenter=false,icons={},settled=false){
   const before=new Set(rooms.filter(visible).map(r=>r.moduleId)),had=!!unlocked;unlocked=ids?new Set(ids):null;arriving=[];refresh();
   const landing=had?rooms.filter(r=>visible(r)&&!before.has(r.moduleId)).map(r=>r.moduleId):[];
   if(landing.length)await mount.event({type:'applet.arrived',ids:landing,...(fromCenter?{from:'center' as const,icons}:{}),settled});
  },
  setEnvironment(value){environment=value||{};refresh();},setConnections(list){connections=list||[];signalsAt=-Infinity;refresh();},
  setAppActivity(id,value){activities.set(id,value);signalsAt=-Infinity;if(!builtIn){const r=rooms.find(r=>r.moduleId===id);if(r)r.status={...r.status,...value};}refresh();},
  devicePoint(id){return mount.anchor(id);},
  setDevicePresence(id,value){if(value)hidden.delete(id);else hidden.add(id);refresh();return true;},
  toggleMotion(){motion=!motion;stage.setMotion(motion);refresh();return motion;},
  setPlacementArea(id){interaction.placementArea=id;refresh();},frameArea(id,inset=0){interaction.framedArea=id;interaction.inset=inset;refresh();},
  setHoveredApplet(id){interaction.hoveredApplet=id==null?null:rooms.find(r=>r.id===id||r.moduleId===id)?.moduleId||id;refresh();},setHoveredArea(id){interaction.hoveredArea=id;refresh();},
  // Arrivals play when the Applets are unlocked (setUnlockedApplets); preparing only places them.
  prepareArrival(ids){arriving=[...ids||[]];refresh();},
  deliverMail(){const played=mount.event({type:'mail.received',ids:[]});return typeof played==='boolean'?played:true;},
  picture(){return mount.picture?.()||null;},
  get metrics(){
   if(village){const m=village.metrics?.() as any||{};return {...m,theme:activeBuildTheme().id,presentation:{...m.presentation,stage:stage.metrics},levelZoom:levelZoom?.metrics};}
   return {renderer:'sim-dom',theme:activeBuildTheme().id,level:view.level==='applet'?'object':view.level,active:view.id,environment,
   buildings:options.buildings||[],modules:state().applets.map(a=>({...a,unlocked:a.visible,visible:a.visible&&view.level!=='applet',peekBounds:mount.bounds(a.id),arrivalBounds:mount.bounds(a.id),arrivalVisible:a.visible})),presentation:{id:view.level==='applet'?view.id:null,stage:stage.metrics},
   ...(mount.metrics?.()||{})};},
  destroy(){if(disposed)return;disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',follow);window.removeEventListener('worldlet:desktop-companion',follow);mount.dispose();stage.destroy();imageLamps?.destroy();for(const label of lampLabels.values())label.destroy();levelZoom?.dispose();world.remove();}
 };
}
