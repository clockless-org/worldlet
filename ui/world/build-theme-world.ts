import {renderBuildWorld,applyBuildThemeScene,activeBuildTheme,type ThemeWorldState} from '../themes/index.ts';
import {createAppletStage} from './pixi-stage.ts';
/** Compatibility adapter from the product's scene controller to the public Sim data interface. */
export function createModuleScene(host,rooms,onPick,onProject,_pages,options):any {
 const world=document.createElement('div');world.className='ui-theme-world-scene';world.dataset.renderer='sim-dom';Object.assign(world.style,{position:'absolute',inset:'0'});host.append(world);
 const stage=createAppletStage(host,onPick),stages=new Map();
 let view:ThemeWorldState['view']={id:'overview',level:'overview'},environment={},motion=true,disposed=false;
 const interaction={placementArea:null as string|null,framedArea:null as string|null,inset:0,hoveredApplet:null as string|null,hoveredArea:null as string|null};
 let hidden=new Set(options.hiddenApplets||[]),unlocked=options.unlockedApplets?new Set(options.unlockedApplets):null;
 const state=():ThemeWorldState=>({view:{...view},environment:{...environment},motion,interaction:{...interaction},pins:structuredClone(options.regionLayout?.pins||{}),
  areas:(options.buildings||[]).filter(b=>b.id!=='building-people').map(b=>({id:b.id,title:b.title})),
  applets:rooms.map(r=>({id:r.moduleId||r.id,key:r.key||r.id,title:r.title,region:r.region||String(r.buildingId||'').replace(/^building-/,''),visible:!hidden.has(r.moduleId)&&(unlocked?unlocked.has(r.moduleId):r.installByDefault!==false),status:r.status?.state,count:r.status?.count}))});
 const mount=renderBuildWorld({host:world,state:state(),navigate:target=>{
  if(target.kind==='applet'){const r=rooms.find(r=>(r.moduleId||r.id)===target.id);if(r&&state().applets.find(a=>a.id===target.id)?.visible)onPick({action:'space',id:r.id,level:'room'});}
  else if((options.buildings||[]).some(b=>b.id===target.id))onPick({action:'building',id:target.id});
 },moveApplet:(id,area,slot)=>{if(rooms.some(r=>r.moduleId===id)&&state().areas.some(a=>a.id==='building-'+area))options.onMoveApplet?.(id,area,slot);},menu:(id,x,y)=>{if(state().applets.some(a=>a.id===id&&a.visible))options.onAppletMenu?.(id,x,y);}});
 function refresh(){if(disposed)return;mount.update(state());world.hidden=view.level==='applet';
  const room=rooms.find(r=>r.moduleId===view.id||r.id===view.id);
  if(room)stage.render(room,stages.get(room.moduleId)||{items:[]},view.level==='applet');
  else stage.render({key:'',moduleId:'',title:''},{items:[]},false);
  if(view.level!=='applet')applyBuildThemeScene(activeBuildTheme().presentation.world);
  // Sim renders its own accessible map buttons. No duplicate legacy pins.
  onProject({});
 }
 queueMicrotask(()=>{if(!disposed){refresh();host.dispatchEvent(new Event('worldlet:world-ready',{bubbles:true}));}});
 return {
  focus(id,level='building'){view={id,level:id==='overview'?'overview':level==='object'?'applet':'area'};refresh();},
  refreshContent:refresh,refreshRegions:refresh,stageState:()=>new Map(stages),
  setAppStage(id,value){stages.set(id,value);refresh();},
  setFocusItem(id,item){const room=rooms.find(r=>r.moduleId===id);if(room)stage.setSelected(room,item);},
  selectStageItem(_id,id){return stage.select(id);},
  setAppletLayout(ids){hidden=new Set(ids||[]);refresh();},
  async setUnlockedApplets(ids){unlocked=ids?new Set(ids):null;refresh();},
  setEnvironment(value){environment=value||{};refresh();},setConnections(){refresh();},
  setAppActivity(id,value){const r=rooms.find(r=>r.moduleId===id);if(r)r.status={...r.status,...value};refresh();},
  devicePoint(id){return mount.anchor(id);},
  setDevicePresence(id,value){if(value)hidden.delete(id);else hidden.add(id);refresh();return true;},
  toggleMotion(){motion=!motion;stage.setMotion(motion);refresh();return motion;},
  setPlacementArea(id){interaction.placementArea=id;refresh();},frameArea(id,inset=0){interaction.framedArea=id;interaction.inset=inset;refresh();},
  setHoveredApplet(id){interaction.hoveredApplet=id;refresh();},setHoveredArea(id){interaction.hoveredArea=id;refresh();},
  prepareArrival(ids){mount.event({type:'applet.arrived',ids:ids||[]});},deliverMail(){return mount.event({type:'mail.received',ids:[]});},
  get metrics(){return {renderer:'sim-dom',theme:activeBuildTheme().id,level:view.level==='applet'?'object':view.level,active:view.id,environment,
   buildings:options.buildings||[],modules:state().applets.map(a=>({...a,unlocked:a.visible,visible:a.visible&&view.level!=='applet',peekBounds:mount.bounds(a.id),arrivalBounds:mount.bounds(a.id),arrivalVisible:a.visible})),presentation:{id:view.level==='applet'?view.id:null,stage:stage.metrics}};},
  destroy(){if(disposed)return;disposed=true;mount.dispose();stage.destroy();world.remove();}
 };
}
