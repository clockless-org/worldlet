import {themeAppletIcon,activeBuildTheme,themeAssetURL} from '../themes/index.ts';
import type {WorldState,WorldMark,WorldApplet,WorldLampState} from './world-renderer.ts';
import {renderVillageWorld} from './village/village-world.ts';
import {createAppletStage} from './pixi-stage.ts';
import {createAppletImageLamps} from './applet-image-lamps.ts';
import {createLampLabel,stackLampLabels} from './applet-lamp-label.ts';
import {createLevelZoom} from './level-zoom.ts';
import type {LampSignal} from './applet-lamp.ts';
import {appletStatus,myAppletKind,CODING_SESSIONS,HOME_NATIVE} from '../../core/applets/index.ts';
import {lastUse,regionId} from './region-layout.ts';
import {weeklyQuota} from './weekly-allowance.ts';
import {appletLamp,appletLampContent,lampDisplayState} from './applet-lamp.ts';
import {appletConnectionGuide} from './applet-attention.ts';
import {shellInteraction,worldPaused as paused} from './shell-interaction.ts';
/** The picture of an Applet: a person's own Applet's icon, else the active theme's. */
function appletIcon(room):string|undefined {
 if(myAppletKind(room)&&typeof room.icon==='string')return room.icon;
 return themeAppletIcon(room.art||room.key);
}
/** The product's scene controller over the Village World (village/village-world.ts, through world-renderer.ts). The
 * World draws the place; the host draws the pins, lamp labels and lamps on device pictures, the Applet stage and the
 * zoom between the World and an Applet. */
export function createModuleScene(host,rooms,onPick,onProject,pages,options):any {
 const shellRoot=(host.closest('.notion-world')||host) as HTMLElement;
 const world=document.createElement('div');world.className='ui-theme-world-scene';world.dataset.renderer='village';Object.assign(world.style,{position:'absolute',inset:'0'});
 host.prepend(world);
 const stage=createAppletStage(host,onPick),stages=new Map(),activities=new Map<string,any>();
 const imageLamps=createAppletImageLamps(shellRoot,(globalThis as any).__WORLDLET_25D_ASSETS__),lampLabels=new Map<string,ReturnType<typeof createLampLabel>>();
 const levelZoom=createLevelZoom(shellRoot,host);
 let view:WorldState['view']={id:'overview',level:'overview'},environment={},motion=true,disposed=false,connections=options.connections||[],marked=false;
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
 const lamp=(r,shell:ReturnType<typeof shellInteraction>):WorldLampState|undefined=>{
  const signal=signalOf(r);return signal?lampDisplayState(signal,!shell.covered&&(view.level!=='applet'||view.id===r.moduleId)):undefined;
 };
 const state=():WorldState=>{const shell=shellInteraction(host);return {view:{...view},environment:{...environment},motion,paused:paused(),...(arriving.length?{arriving:[...arriving]}:{}),interaction:{...interaction,...shell},pins:structuredClone(options.regionLayout?.pins||{}),
  areas:(options.buildings||[]).filter(b=>b.id!=='building-people').map(b=>{const look=options.regionLayout?.themes?.[regionId(b.id)]||b.visualTheme;return {id:b.id,title:b.title,...(look?{look}:{})};}),
  applets:rooms.map(r=>({id:r.moduleId||r.id,key:r.key||r.id,title:r.title,region:r.region||String(r.buildingId||'').replace(/^building-/,''),visible:visible(r),status:r.status?.state,count:r.status?.count,icon:appletIcon(r),
   lamp:lamp(r,shell),connected:r.entity==='matter'?undefined:!!appletStatus(r,connections)?.connected,mine:myAppletKind(r)||undefined,object:r.entity==='matter'||undefined,
   art:r.art&&r.art!==r.key?r.art:undefined,usedAt:lastUse(r,options.regionLayout)||undefined,staged:staged(r)||undefined,allowance:allowance(r)}))};};
 /** The Village's Applet stage draws the Applet's own open picture in front of the World (pixi-stage.ts): not for coding
  * sessions or the Home Applets drawn natively, and only once its contents arrived. */
 const staged=r=>stages.has(r.moduleId)&&!!(globalThis as any).__WORLDLET_25D_ASSETS__?.open?.[r.key]&&!CODING_SESSIONS.includes(r.key)&&!HOME_NATIVE.includes(r.key);
 /** A coding Applet's weekly allowance, from the usage its sessions last reported (setAppActivity). */
 function allowance(r):WorldApplet['allowance'] {
  if(!CODING_SESSIONS.includes(r.key))return undefined;
  const usage=activities.get(r.moduleId)?.usage;if(usage?.placeholder===true)return {unavailable:true};
  const quota=weeklyQuota(usage);return quota?{remaining:quota.remaining,resetsAt:quota.resetsAt}:{};
 }
 /** The World's marks as the shell's pins: the shell draws the buttons, names, lamps and attention marks. */
 const marks=(points:Readonly<Record<string,WorldMark>>)=>{
  if(disposed)return;marked=true;const out={},action={applet:'space',area:'region-more','area-add':'region-more',slot:'placement'},kind={applet:'app',area:'region-more','area-add':'region-add',slot:'region-slot'};
  for(const m of Object.values(points)){
   const room=m.kind==='applet'?rooms.find(r=>(r.moduleId||r.id)===m.id):null,area=(options.buildings||[]).find(b=>b.id===m.id);
   if(m.kind==='applet'&&!room)continue;
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
  drawLamps(out);
 };
 /** Lamp labels and the lamps on device pictures, where the marks put them (applet-lamp-label.ts, applet-image-lamps.ts). */
 function drawLamps(points:Record<string,any>){
  const covered=shellInteraction(host).covered,current=view.level==='applet'?rooms.find(r=>r.moduleId===view.id):null;
  const byKey=new Map<string,LampSignal>();for(const r of rooms){const s=signalOf(r);if(s)byKey.set(r.key,s);}
  const still=!motion||matchMedia('(prefers-reduced-motion: reduce)').matches||document.hidden;
  imageLamps.update(byKey,current?.key,!covered,performance.now(),still);
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
 const theme=activeBuildTheme(),mount=renderVillageWorld({...context,asset:path=>themeAssetURL(theme.id,path)});
 function refresh(){if(disposed)return;mount.update(state());world.hidden=view.level==='applet'&&!mount.behindApplet;
  const room=rooms.find(r=>r.moduleId===view.id||r.id===view.id);
  // The host's Applet stage: its reader stays put while the item's detail or the website is open.
  const shell=shellInteraction(host),open=view.level==='applet'&&!!room&&stages.has(room.moduleId);
  stage.render(room||{},room?stages.get(room.moduleId):undefined,open&&!shell.website&&!shell.detailOpen,open&&shell.detailOpen&&!shell.website,view.level==='applet');
  // Until the World marks its places, the shell shows no pins.
  if(!marked)onProject({});
 }
 // The shell's own state changes without a scene call; follow it, and redraw only when it changed.
 let shellKey=JSON.stringify(shellInteraction(host))+paused(),checking=false;
 const follow=()=>{if(checking||disposed)return;checking=true;requestAnimationFrame(()=>{checking=false;const next=JSON.stringify(shellInteraction(host))+paused();if(next!==shellKey){shellKey=next;refresh();}});};
 const observer=new MutationObserver(follow);observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open','data-onboarding-locked','data-detail-open','data-attention-preview','data-template']});
 document.addEventListener('visibilitychange',follow);window.addEventListener('worldlet:desktop-companion',follow);
 // The World says when it is drawn (WorldMount.ready); the shell's loading page waits for it.
 queueMicrotask(()=>{if(!disposed){refresh();
  // Ready once the World's first frame is drawn (WorldMount.ready), or at once when it does not say.
  Promise.resolve(mount.ready).then(()=>{if(!disposed)host.dispatchEvent(new Event('worldlet:world-ready',{bubbles:true}));},()=>{if(!disposed)host.dispatchEvent(new Event('worldlet:world-error',{bubbles:true}));});}});
 /** Where an Applet's device is on screen, for the zoom between the World and an Applet. */
 const center=(id:string)=>{const b=mount.bounds(id);if(!b||!(b.width>0))return null;const r=world.getBoundingClientRect();return {x:r.left+b.x+b.width/2,y:r.top+b.y+b.height/2};};
 return {
  focus(id,level='building'){
   const next:WorldState['view']=id==='overview'?{id,level:'overview'}:level==='object'?{id:rooms.find(r=>r.moduleId===id||r.id===id)?.moduleId||id,level:'applet'}:{id,level:'area'};
   // Moving between the World (or an open area) and an Applet zooms (level-zoom.ts); moving between two Applets does not.
   const entering=view.level!=='applet'&&next.level==='applet',leaving=view.level==='applet'&&next.level!=='applet';
   const shot=(entering||leaving)&&motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.hidden?mount.picture?.()||null:null;
   const origin=shot?entering?levelZoom.enter(next.id,center(next.id)):levelZoom.leave(view.id,center(view.id)):null;
   if(!shot&&(entering||leaving))levelZoom.finish();
   view=next;refresh();
   if(shot&&origin)levelZoom.run(entering?'in':'out',shot,origin,{settle:()=>!interaction.framedArea});
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
  setAppActivity(id,value){activities.set(id,value);signalsAt=-Infinity;refresh();},
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
   const m=mount.metrics?.() as any||{};return {...m,theme:theme.id,presentation:{...m.presentation,stage:stage.metrics},levelZoom:levelZoom.metrics};},
  destroy(){if(disposed)return;disposed=true;observer.disconnect();document.removeEventListener('visibilitychange',follow);window.removeEventListener('worldlet:desktop-companion',follow);mount.dispose();stage.destroy();imageLamps.destroy();for(const label of lampLabels.values())label.destroy();levelZoom.dispose();world.remove();}
 };
}
