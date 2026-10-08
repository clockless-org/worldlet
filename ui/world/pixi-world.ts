import {areaCameraFrame} from './village-camera.ts';
import {createAreaScenery} from './area-scenery.ts';
import {createAppletEnchantments} from './applet-idle-motion.ts';
import {ACTIVE_THEME} from '../themes/index.ts';
import {createAppletImageLamps} from './applet-image-lamps.ts';
import {WORLD_WIDTH,WORLD_HEIGHT,APPLET_OVERVIEW_WIDTH,APPLET_OPTICAL_SCALE} from './world-design.ts';
import {REGION_LANDMARKS} from './region-landmarks.ts';
import {createLandmarkSprite} from './landmark-sprite.ts';
import {createSceneryTone} from './scenery-tone.ts';
import {WORLD_LAYOUT} from './world-layout.ts';
import {regionId} from './region-layout.ts';
import {guardFilterResolution} from './pixi-filter-resolution.ts';
import {viewportFilterArea as updateViewportFilterArea} from './viewport-filter-area.ts';
import {createRegisteredPlate} from './registered-plate.ts';
import {createWorkSignal} from './work-signal.ts';
import {createWorkMotion} from './work-motion.ts';
import {appletConnectionGuide} from './applet-attention.ts';
// Pixi's interpreter-based shader sync keeps the native CSP free of eval.
import 'pixi.js/unsafe-eval';
import {Application,Container,Sprite,Texture,Graphics,Rectangle,BlurFilter,ColorMatrixFilter,Matrix} from 'pixi.js';
import {createFocusScenery} from './pixi-focus.ts';
import {createLevelZoom} from './level-zoom.ts';
import {createAppletStage} from './pixi-stage.ts';
import {extraPlacements,resolvePlacements,type PlacementSlot} from './slot-placement.ts';
import {APPLET_SPRITES} from './applet-sprites.ts';
import {appletStatus,myAppletKind,HOME_NATIVE,CODING_SESSIONS} from '../../core/applets/index.ts';
import {myAppletMark} from './my-applet-mark.ts';
import {WORLD_FRAME_RATE,environmentShifted,windowActive,worldFrameRate} from './frame-budget.ts';
import {attachAppletLamp} from './applet-lamp-art.ts';
import {appletLamp,appletLampContent,lampDisplayState,type LampSignal} from './applet-lamp.ts';
import {createLampLabel,stackLampLabels} from './applet-lamp-label.ts';

// Authored image coordinates, not camera-dependent guesses. The internal
// "people" key remains stable while its displayed region is Explore.
import {themeScene} from './theme-scene.ts';
// The active theme's camera, light, ambience and sites (theme-scene.ts).

/** A texture's RGBA pixels, read back through a 2D canvas. */
function alphaOf(tex:Texture):Uint8ClampedArray {
 const canvas=document.createElement('canvas');canvas.width=tex.frame.width;canvas.height=tex.frame.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(tex.source.resource as HTMLImageElement,tex.frame.x,tex.frame.y,tex.frame.width,tex.frame.height,0,0,canvas.width,canvas.height);
 return ctx.getImageData(0,0,canvas.width,canvas.height).data;
}
/** The opaque box (alpha > 32) of `alpha`, as scripts/build-world-assets.ts paintedBox measures it at build time. */
function paintedBox(alpha:Uint8ClampedArray,width:number,height:number):number[] {
 let left=width,top=height,right=-1,bottom=-1;
 for(let y=0;y<height;y++){const row=y*width*4;for(let x=0;x<width;x++)if(alpha[row+x*4+3]>32){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;bottom=y;}}
 return [left,top,right,bottom,width,height];
}
export function createModuleScene(host,rooms,onPick,onProject,pages,options):any{
 const {areaZoom,camera:themeCamera,approachCamera,overviewCenter:OVERVIEW_CENTER,sites:THEME_SITES,lightingState,createLighting,createAmbience,workPath}=themeScene(ACTIVE_THEME.pack.id);
 const payload=(globalThis as any).__WORLDLET_25D_ASSETS__;
 const lampRoot=host.closest('.notion-world')||host;
 const imageLamps=createAppletImageLamps(lampRoot,payload);
 const lampLabels=new Map<string,ReturnType<typeof createLampLabel>>();
 const hoverName=document.createElement('div');hoverName.className='applet-hover-name';hoverName.setAttribute('role','tooltip');hoverName.hidden=true;document.body.append(hoverName);
 const hideName=()=>{hoverName.hidden=true;};
 const showName=(event,room)=>{if(level==='object'){hideName();return;}hoverName.textContent=room.title;const mine=myAppletKind(room);if(mine)hoverName.dataset.mine=mine;else delete hoverName.dataset.mine;hoverName.hidden=false;const x=event.clientX??event.global?.x??0,y=event.clientY??event.global?.y??0;hoverName.style.left=Math.max(8,Math.min(x+14,innerWidth-hoverName.offsetWidth-8))+'px';hoverName.style.top=Math.max(8,Math.min(y+18,innerHeight-hoverName.offsetHeight-8))+'px';};
 host.addEventListener('pointerleave',hideName);host.addEventListener('pointerdown',hideName);

 const app=new Application(),world=new Container(),buildings=(options.buildings||[]).filter(b=>b.id!=='building-people');world.sortableChildren=true;
 for(const room of rooms)if(room.region==='people'||room.buildingId==='building-people'){room.region='travel';room.buildingId='building-travel';}
 let view:any=null;const foregroundLayer=new Container(),softFocus=new BlurFilter({strength:3,quality:3,resolution:.5});
 const viewportFilterArea=new Rectangle();
 let blurredWorld=false;
 let placementArea:string|null=null;
 let cameraFrame={zoom:1,anchor:OVERVIEW_CENTER},cameraSettled=true;
 let shelfArea:string|null=null,shelfInset=0;
 // The area last framed for its panel and its extra places (slot-placement.ts extraPlacements); they fade out as it zooms back.
 let framedRegion:string|null=null,extra:Record<string,PlacementSlot>={},extraKey='';
 let framing=0,hoveredRegion=null,focusScenery=null,focusSceneryVisible=false;
 let areaScenery:Awaited<ReturnType<typeof createAreaScenery>>|null=null,closeArea:any=null;
 let closed=false,ready=false,motion=true,active='overview',level='overview',time=0,frames=0;
 let wakeUntil=0,frameRate=0;
 // Input, camera moves and scene changes draw at the full rate for a moment (frame-budget.ts).
 const wake=(ms:number=WORLD_FRAME_RATE.wakeMs)=>{wakeUntil=Math.max(wakeUntil,performance.now()+ms);if(ready&&frameRate!==WORLD_FRAME_RATE.moving)pace(WORLD_FRAME_RATE.moving);};
 // Pixi compares whole milliseconds against 1000/maxFPS, so a cap at exactly the rate drops every other frame.
 const pace=(fps:number)=>{frameRate=fps;app.ticker.maxFPS=fps*25/24;};
 const desktopPresentation=()=>{if(!ready||closed)return;if(document.documentElement.classList.contains('desktop-companion'))app.ticker.stop();else{wake();app.ticker.start();}};
 window.addEventListener('worldlet:desktop-companion',desktopPresentation);
 let workMotion:ReturnType<typeof createWorkMotion>|null=null;
 let smokeTime=0,smokeAt=0;
 let environment:any={},connections=options.connections||[],observer:ResizeObserver,lighting:(Awaited<ReturnType<typeof createLighting>>&{occludes?:(x:number,y:number,depth:number)=>boolean;updateMotion?:(time:number,animate:boolean)=>void})|null|undefined,ambience:ReturnType<typeof createAmbience>|undefined;
 const textures:Texture[]=[],regions=[],devices=[],stages=new Map();const attentionTransform=new Matrix();
 let unlocked=options.unlockedApplets?new Set<string>(options.unlockedApplets):null;
 let hidden=new Set<string>(options.hiddenApplets||[]);
 const positions={};
 const layout=options.regionLayout;
 const regionPages:Record<string,number>={};
 const eligible=room=>!hidden.has(room.moduleId)&&(unlocked?unlocked.has(room.moduleId):room.installByDefault!==false);
 let assigned=resolvePlacements(rooms,positions,eligible,regionPages,layout);
 const allowed=room=>level==='object'&&active===room.moduleId||eligible(room)&&(room.entity!=='app'||!!assigned[room.moduleId]||!!extra[room.moduleId]);

 function refreshPlacements(){
  assigned=resolvePlacements(rooms,positions,eligible,regionPages,layout);extraKey='';extra={};
  // Content reconciliation replaces room objects; follow the live entry so moved Applets keep their current region.
  for(const d of devices){d.room=rooms.find(r=>r.id===d.room.id)||d.room;d.region=regions.find(r=>r.b.id===d.room.buildingId);}
  for(const d of devices){const s=assigned[d.room.moduleId];if(s)d.anchor=d.baseAnchor=[...s.anchor];d.root.eventMode=allowed(d.room)?'static':'none';}
 }
 /** The framed area's extra places for this zoom; none once the World is back at its overview. */
 function refreshExtra(region:string|null,zoom:number){
  const key=region?region+'|'+zoom.toFixed(3):'';if(key===extraKey)return;
  const before=extra;extraKey=key;extra=region?extraPlacements(region,zoom,rooms,eligible,layout,assigned):{};
  for(const d of devices){const id=d.room.moduleId;if(!extra[id]&&!before[id])continue;const s=extra[id]||assigned[id];if(s)d.anchor=[...s.anchor];d.root.eventMode=allowed(d.room)?'static':'none';}
 }
 // Pixi follows the pointer across the whole document, under the tour's click catcher too: while the
 // spotlight shows, no device lights up or names itself (owner feedback 2026-10-02).
 const tourCovers=()=>!!document.querySelector('.tour-spotlight:not([hidden])');
 const regionAllowed=id=>!unlocked||host.closest('.notion-world')?.getAttribute('data-onboarding-locked')!=='true'||rooms.some(r=>r.buildingId===id&&allowed(r));
 const contentStage=createAppletStage(host,onPick);

 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const levelZoom=createLevelZoom(lampRoot as HTMLElement,host);
 // Decode a few images at a time: the World holds one device per catalog Applet (over a hundred),
 // and decoding them all at once can fail with EncodingError when image memory is tight.
 let decoding=0;const decodeQueue:(()=>void)[]=[];
 const decodeSlot=async<T>(work:()=>Promise<T>)=>{if(decoding>=8)await new Promise<void>(go=>decodeQueue.push(go));decoding++;try{return await work();}finally{decoding--;decodeQueue.shift()?.();}};
 const image=async(src,retain=true)=>{const im=await decodeSlot(async()=>{const im=new Image();im.src=src;try{await im.decode();}catch{await new Promise(r=>setTimeout(r,50));await im.decode();}return im;});if(closed)return null;const t=Texture.from(im);t.source.autoGenerateMipmaps=true;t.source.scaleMode='linear';if(retain)textures.push(t);return t;};
 const siteFor=b=>THEME_SITES[b.region||b.id.replace('building-','')]||THEME_SITES[b.id==='building-explore'?'people':'home'];
 const appletWidth=APPLET_OVERVIEW_WIDTH/themeCamera(WORLD_WIDTH,WORLD_HEIGHT,1,OVERVIEW_CENTER).scale;
 const toWorld=(point:number[])=>[point[0]*WORLD_WIDTH,point[1]*WORLD_HEIGHT];
 function transform(amount=1){
  const shell=host.closest('.notion-world') as HTMLElement,stageVisible=String(level==='object'&&stages.has(active));
  if(shell&&shell.getAttribute('data-pixi-stage')!==stageVisible)shell.setAttribute('data-pixi-stage',stageVisible);
  if(ready)app.stage.hitArea=new Rectangle(0,0,host.clientWidth,host.clientHeight);
  // An open area panel zooms its area into the World left of the panel (owner request 2026-10-06).
  const shelf=shelfArea&&level!=='object'?shelfArea:null,visibleWidth=Math.max(1,host.clientWidth-(shelf?shelfInset:0));
  if(shelf){const frame=areaCameraFrame(shelf,visibleWidth,host.clientHeight);cameraFrame={zoom:Math.max(1.6,frame.zoom),anchor:frame.anchor};}
  else cameraFrame=areaZoom&&level==='building'?areaCameraFrame(active.replace('building-',''),host.clientWidth,host.clientHeight):{zoom:1,anchor:OVERVIEW_CENTER};
  const target=themeCamera(host.clientWidth,host.clientHeight,cameraFrame.zoom,cameraFrame.anchor),overviewScale=themeCamera(host.clientWidth,host.clientHeight,1,OVERVIEW_CENTER).scale;
  // While an area is framed for its panel, Applets keep their overview size and its extra places fill the room
  // the zoom makes (owner request 2026-10-08); they stay while the World zooms back out, fading as it goes.
  if(shelf){framedRegion=regionId(shelf);refreshExtra(framedRegion,cameraFrame.zoom);}
  // Centre the area in the World the panel leaves visible; the plate only has to cover that part.
  if(shelf){const w=WORLD_WIDTH*target.scale;target.x=Math.max(visibleWidth-w,Math.min(0,visibleWidth/2-cameraFrame.anchor[0]*w));}
  view=approachCamera(view,target,amount);
  cameraSettled=Math.abs(view.scale-target.scale)<.001&&Math.abs(view.x-target.x)<.5&&Math.abs(view.y-target.y)<.5;
  if(!shelf&&framedRegion&&(cameraSettled||level==='object')){framedRegion=null;refreshExtra(null,1);}
  const framedZoom=framedRegion&&level!=='object'?view.scale/overviewScale:1,extraShown=Math.max(0,Math.min(1,(framedZoom-1)/Math.max(.05,Number(extraKey.split('|')[1])-1||.6)));
  closeArea=areaScenery?.update(level==='building'?active.replace('building-',''):null,host.clientWidth,host.clientHeight,reduced.matches?1:amount,time,motion&&!reduced.matches&&windowActive()&&!document.hidden)||null;
  if(shell){if(closeArea)shell.setAttribute('data-area-view',closeArea.id);else shell.removeAttribute('data-area-view');shell.toggleAttribute('data-area-compact',!!closeArea?.compact);}
  if(shell&&closeArea){const width=closeArea.frame.labelWidth+'px';if(shell.style.getPropertyValue('--area-label-width')!==width)shell.style.setProperty('--area-label-width',width);}
  const browserFocused=host.closest('.notion-world')?.querySelector('#notionContent[data-template=browser]:not([hidden])');
  const activeKey=level==='object'?devices.find(d=>d.room.moduleId===active)?.room.key:null;
  const immersive=payload.focus?.[activeKey]?.framing==='scene-fit';
  const focusKey=activeKey&&(browserFocused||immersive)?activeKey:null;
  focusSceneryVisible=focusScenery?.update(focusKey==='gmail'&&ACTIVE_THEME.pack.id==='village'&&!immersive?null:focusKey,host.clientWidth,host.clientHeight,immersive&&level==='object'?1:framing,time,motion&&!reduced.matches&&windowActive()&&!document.hidden)||false;
  if(shell){shell.toggleAttribute('data-immersive-background',focusSceneryVisible&&immersive);const content=focusSceneryVisible?focusScenery.content:null;if(content){shell.dataset.readingSurface=content.key;for(const key of ['x','y','width','height'])shell.style.setProperty('--reading-'+key,content[key]+'px');}else delete shell.dataset.readingSurface;}
  world.scale.set(view.scale);world.position.set(view.x,view.y);
  // Mail has one HTML device in Open, Focus and Web, including before source data arrives.
  for(const d of devices){const foreground=level==='object'&&d.room.moduleId===active,openInstallation=foreground&&stages.has(active)&&!!payload.open?.[d.room.key]&&!CODING_SESSIONS.includes(d.room.key)&&!d.nativeDevice&&host.closest('.notion-world')?.getAttribute('data-detail-open')!=='true';d.root.alpha+=( (d.presence??1)-d.root.alpha)*.12;d.root.visible=!(areaZoom&&level==='building'&&d.room.buildingId!==active)&&!d.arrivalPending&&allowed(d.room)&&d.root.alpha>.01&&(d.room.entity!=='matter'||foreground)&&!(foreground&&focusSceneryVisible)&&!openInstallation&&!(foreground&&d.room.key==='gmail');
   const closeSlot=closeArea?.slots.find(s=>s.id===assigned[d.room.moduleId]?.id);
   const closeVisual=closeSlot?areaScenery.visual(d,closeArea):null;
   d.body.visible=!closeVisual;for(const visual of d.closeVisuals?.values()||[])visual.body.visible=visual===closeVisual;d.closeVisual=closeVisual;
   Object.assign(d,closeVisual?{visibleLeft:-closeVisual.width/2,visibleTop:-closeVisual.height,visibleBottom:0,visibleWidth:closeVisual.width}:d.overviewBounds);
   d.root.hitArea=closeVisual?.hit||d.overviewHit;
   const parent=foreground?foregroundLayer:closeVisual?closeArea.group:world;if(d.root.parent!==parent)parent.addChild(d.root);
   const amount=closeVisual?Math.min(closeSlot.maxSize[0]*WORLD_WIDTH/d.visibleWidth,closeSlot.maxSize[1]*WORLD_HEIGHT/-d.visibleTop):foreground?Math.min(300,host.clientWidth*.23)/appletWidth:1/framedZoom;
   const age=d.revealAt==null?1:Math.max(0,Math.min(1,(performance.now()-d.revealAt)/(d.arrivalLogo?2800:1900))),ease=d.arrivalLogo?(()=>{const t=Math.max(0,(age-.25)/.75);return t*t*(3-2*t);})():1-Math.pow(1-age,3);if(d.arrivalLogo){const morph=Math.max(0,Math.min(1,(age-.12)/.25));for(const child of d.root.children)if(child!==d.arrivalLogo)child.alpha=morph;d.arrivalLogo.alpha=1-morph;if(age===1){d.arrivalLogo.destroy();d.arrivalLogo=null;}}d.root.alpha=(d.presence??1)*(reduced.matches||d.arrivalLogo?1:ease)*(extra[d.room.moduleId]?extraShown*extraShown*(3-2*extraShown):1);{const size=amount*(reduced.matches?1:d.arrivalLogo?2-ease:.8+.2*ease);d.root.scale.set(size);}if(d.spark){d.spark.alpha=reduced.matches?0:Math.sin(age*Math.PI)*.75;d.spark.rotation=age*.3;}d.root.zIndex=foreground?5000:100+d.anchor[1]*WORLD_HEIGHT;
   const shadowScale=(foreground?1:view.scale)*amount;
   if(!closeVisual&&!(Math.abs(Math.log(shadowScale/d.shadowScale))<.15))bakeShadow(d,shadowScale);
   if(d.shadowRevealAt!=null){const t=reduced.matches?1:Math.min(1,Math.max(0,(performance.now()-d.shadowRevealAt)/850));d.shadow.alpha=t*t*(3-2*t);if(t===1)d.shadowRevealAt=null;}
   if(foreground)d.root.position.set(d.room.key==='weather'?host.clientWidth*.835:view.foregroundX,view.foregroundY);
   else {const point=toWorld(closeSlot?.anchor||d.anchor),from=closeSlot?null:d.revealFrom;
    d.root.position.set(point[0]+(from&&!reduced.matches?(from[0]-point[0])*(1-ease):0),point[1]+(from&&!reduced.matches?(from[1]-point[1])*(1-ease):0));
   }
  }
  if(dragDevice&&dragged&&dragDevice.point){dragDevice.root.position.set(...dragDevice.point);dragDevice.root.zIndex=9999;}
  // Blur only the visible background, at blur-appropriate resolution. The HUD
  // and foreground device retain full Retina rendering.
  world.filterArea=updateViewportFilterArea(viewportFilterArea,view,host.clientWidth,host.clientHeight);
  if(blurredWorld!==(level==='object')){blurredWorld=level==='object';world.filters=blurredWorld?[softFocus]:null;}
  world.eventMode=level==='object'?'none':'passive';world.interactiveChildren=level!=='object';
  // Applets remain bright and operable; only scenery follows the ambient light.
  foregroundLayer.filters=null;
  // Focus plates include the device itself, so retain their authored brightness.
  if(focusScenery)focusScenery.layer.filters=null;
  const ambient=lightingState(environment);for(const r of regions)r.landmark?.update(ambient.lamps);
  for(const r of regions)if(r.glow){const target=level!=='object'&&hoveredRegion===r.b.id?1:0;r.glow.alpha+=(target-r.glow.alpha)*(reduced.matches?1:.16);if(r.glow.alpha<.002)r.glow.alpha=0;r.glow.visible=r.glow.alpha>0;}
  project();
 }
 // A baked shadow keeps the live look: the same blur in screen pixels at the filter's own texel
 // size, with room for the blur around the shape, re-baked when the on-screen scale moves.
 function bakeShadow(d,scale:number){
  const shape=d.shadow.children[0],blur=shape.filters?.[0];
  if(!blur)return;
  d.shadowBlur??=blur.strength;d.shadowBounds??=shape.getLocalBounds().rectangle.clone();d.shadowScale=scale;
  blur.strength=d.shadowBlur/scale;blur.resolution=scale;
  d.shadow.boundsArea=d.shadowBounds.clone().pad(blur.padding+1/scale);
  d.shadow.cacheAsTexture({resolution:scale*app.renderer.resolution});d.shadow.updateCacheTexture();
 }
 /** Something on screen is still easing toward where it is going: the detail framing,
  * an arrival, a shadow, a presence fade, a hover glow or a dragged Applet. */
 function moving(detail:number){
  if(!cameraSettled||areaScenery?.metrics&&!areaScenery.metrics.settled||Math.abs(framing-detail)>.002||(dragDevice&&dragged))return true;
  const now=performance.now();
  for(const d of devices){
   if(d.arrivalPending||d.arrivalLogo||d.shadowRevealAt!=null||(d.revealAt!=null&&now-d.revealAt<3000))return true;
   if(d.root.visible&&Math.abs(d.root.alpha-(d.presence??1))>.01)return true;
  }
  for(const r of regions)if(r.glow){const target=level!=='object'&&hoveredRegion===r.b.id?1:0;if(Math.abs(target-r.glow.alpha)>.005)return true;}
  return false;
 }
 function project(){
  if(closed)return;const points={};let byProvider=null;
  // One pass over pages per projection, in page order; built only when a device needs it.
  const providerPages=provider=>{if(!byProvider){byProvider=new Map();for(const p of pages.values()){const own=byProvider.get(p.sourceProvider);if(own)own.push(p);else byProvider.set(p.sourceProvider,[p]);}}return byProvider.get(provider)||[];};
  const add=(key,id,title,anchor,action,kind)=>{const [px,py]=toWorld(anchor),x=world.x+px*world.scale.x,y=world.y+py*world.scale.y;points[key]={id,title,action,kind,level:action==='space'?'room':'building',x,y,visible:x>15&&x<host.clientWidth-15&&y>40&&y<host.clientHeight-85};};

  const lampActionsVisible=lampRoot.dataset.attentionPreview!=='true'&&!lampRoot.querySelector('dialog[open]');
  const lampSignals=new Map<string,LampSignal>(),lampStill=!motion||reduced.matches||!windowActive()||document.hidden;
  for(const d of devices){
   const content=appletLampContent(d.room.provider,providerPages(d.room.provider),!!(d.room.children?.length||d.room.sampleRecords?.length));
   const state=appletLamp(d.status,d.activity,content),signal:LampSignal={state,action:options.lampAction?.(d.room,state,d.activity)};
   lampSignals.set(d.room.key,signal);d.working=state==='processing'&&d.room.entity==='app';(d.closeVisual?.lamp||d.lamp)?.update(lampDisplayState(signal,lampActionsVisible&&(level!=='object'||d.room.moduleId===active)),time*1000,lampStill);const running=state==='processing';
   // Keep device signals mounted independently of transient work and hover labels.
   const show=allowed(d.room)&&d.room.entity!=='matter'&&d.root.visible&&level!=='object';
   if(show){add('space:'+d.room.id,d.room.id,d.room.title,[d.anchor[0],d.anchor[1]+((d.visibleBottom+10/world.scale.x)/WORLD_HEIGHT)],'space','app');
    const point=points['space:'+d.room.id];point.labelVisible=false;
    if(closeArea){const p=d.root.toGlobal({x:0,y:d.visibleBottom+14/d.root.worldTransform.a});point.x=p.x;point.y=p.y;point.visible=true;point.labelVisible=true;}
    point.running=running;point.lampState=state;point.lampX=0;point.lampY=-10-d.width*.04*world.scale.y;
   }
  }
  if(level!=='object'&&!closeArea)for(const r of regions){
   if(!regionAllowed(r.b.id)||(areaZoom&&level==='building'&&r.b.id!==active))continue;
   const id=regionId(r.b.id),key='region-more:'+id;
   add(key,r.b.id,r.b.title,r.site.label,'region-more','region-more');
   points[key].caption='';points[key].description=(areaZoom?'Enter ':'Manage ')+r.b.title;points[key].hovered=hoveredRegion===r.b.id;
   if(!rooms.some(room=>room.entity==='app'&&regionId(room.buildingId)===id&&eligible(room)&&assigned[room.moduleId])){
    add('region-add:'+id,r.b.id,'+',WORLD_LAYOUT.regions[id].center,'region-more','region-add');
    points['region-add:'+id].description='Add applets to '+r.b.title;points['region-add:'+id].hovered=hoveredRegion===r.b.id;
   }
  }
  // Projection runs before render, so worldTransform still holds the last frame's camera; once the camera settles the World idles with the mark off its device.
  if(level==='building'||level==='overview')for(const d of devices){const point=points['space:'+d.room.id];if(!point||d.room.entity!=='app')continue;point.attention=point.lampState==='error'?null:appletConnectionGuide(d.room.provider,d.status);const scale=d.root.getGlobalTransform(attentionTransform).a;point.attentionOffset=closeArea?18:(d.visibleBottom-d.visibleTop)*scale+50;point.attentionX=(d.visibleLeft+d.visibleWidth/2)*scale;point.hovered=!!(d.root.isHovered||d.labelHovered);}
  if(placementArea&&level!=='object')WORLD_LAYOUT.regions[placementArea]?.placements.forEach((slot,index)=>{
   const key='region-slot:'+index;add(key,placementArea,'+',slot.anchor,'placement','region-slot');points[key].slot=index;points[key].description='Place applet in slot '+(index+1);
   const closeSlot=closeArea?.slots.find(s=>s.id===slot.id);if(closeSlot){const p=closeArea.group.toGlobal({x:closeSlot.anchor[0]*WORLD_WIDTH,y:closeSlot.anchor[1]*WORLD_HEIGHT});points[key].x=p.x;points[key].y=p.y;points[key].visible=true;}
  });
  const website=!!host.closest('.notion-world')?.querySelector('#notionContent[data-template=browser]:not([hidden])');
  const currentDevice=devices.find(d=>d.room.moduleId===active);contentStage.render(currentDevice?.room||{},stages.get(active),!website&&level==='object'&&stages.has(active)&&host.closest('.notion-world')?.getAttribute('data-detail-open')!=='true',level==='object'&&stages.has(active)&&host.closest('.notion-world')?.getAttribute('data-detail-open')==='true'&&!website,level==='object');
  imageLamps.update(lampSignals,level==='object'?currentDevice?.room.key:null,lampActionsVisible,time*1000,lampStill);
  for(const d of devices){
   const signal=lampSignals.get(d.room.key);if(!signal)continue;
   const point=points['space:'+d.room.id],foreground=level==='object'&&currentDevice===d;
   const visible=lampActionsVisible&&(foreground||!!point?.visible);
   let label=lampLabels.get(d.room.key);
   if(!label&&visible&&['processing','error'].includes(signal.state)){label=createLampLabel(lampRoot,d.room.key);lampLabels.set(d.room.key,label);}
   // Foreground includes website Focus, where the live device can be hidden.
   label?.update(signal,d.room.title,visible,foreground?lampRoot.clientWidth*.75:point?.x+(point?.attentionX||0),foreground?72:point?.y-(point?.attentionOffset||0),foreground);
  }
  stackLampLabels(lampRoot);
  onProject(points);
 }
 // What is on screen right now, drawn once more and copied, for the zoom between the World and an Applet (level-zoom.ts).
 // At one pixel per CSS pixel: it only swells or shrinks while it fades, and the full-density copy would be four times the memory.
 function picture(){if(!ready||!host.clientWidth||!host.clientHeight)return null;app.render();const c=document.createElement('canvas');c.width=host.clientWidth;c.height=host.clientHeight;c.getContext('2d')?.drawImage(app.canvas,0,0,c.width,c.height);return c;}
 function deviceCenter(id){const d=devices.find(d=>d.room.moduleId===id||d.room.id===id);if(!d?.root.visible||!view)return null;const b=d.root.getBounds(),r=host.getBoundingClientRect();return b.width>0?{x:r.left+b.x+b.width/2,y:r.top+b.y+b.height/2}:null;}
 function focus(id,stage='building'){
  wake();
  // Moving between the World (or an open area) and an Applet zooms; moving between two Applets does not.
  const next=id==='overview'?'overview':stage,entering=level!=='object'&&next==='object',leaving=level==='object'&&next!=='object';
  const shot=(entering||leaving)&&motion&&!reduced.matches&&!document.hidden?picture():null;
  const origin=shot?entering?levelZoom.enter(id,deviceCenter(id)):levelZoom.leave(active,deviceCenter(active)):null;
  if(!shot&&(entering||leaving))levelZoom.finish();
  if(active!==id||level!==(id==='overview'?'overview':stage)){hideName();hoveredRegion=null;for(const device of devices){device.root.isHovered=false;device.labelHovered=false;device.outlines?.forEach(edge=>edge.visible=false);}}

  active=id;level=id==='overview'?'overview':stage;cameraSettled=false;if(level==='overview')refreshPlacements();
  const d=devices.find(d=>d.room.moduleId===id||d.room.id===id);
  // Region-capable themes frame the area; Applet interiors use their own shared reader layout.
  if(level==='object'&&d)focusScenery?.preload(d.room.key);
  if(reduced.matches)transform();else project();
  if(shot&&origin)levelZoom.run(entering?'in':'out',shot,origin,{settle:()=>!shelfArea});
 }
 let pointerStart=[0,0],dragged=false,dragDevice:any=null;
 const dropGhost=new Graphics();world.addChild(dropGhost);dropGhost.zIndex=10000;dropGhost.eventMode='none';
 const pointerDown=e=>{wake();pointerStart=[e.clientX,e.clientY];dragged=false;};
 // Pointer travel suppresses accidental clicks, but never moves an Applet.
 const placementView=()=>closeArea?.group||world;
 const dropAt=(x,y)=>{if(!view)return null;const parent=placementView(),rect=host.getBoundingClientRect(),local=parent.toLocal({x:x-rect.left,y:y-rect.top}),point=[local.x/WORLD_WIDTH,local.y/WORLD_HEIGHT];let best=null,distance=60/parent.scale.x;
  for(const [id,r] of Object.entries(WORLD_LAYOUT.regions)){if(closeArea&&id!==closeArea.id)continue;
   for(const [index,slot] of r.placements.entries()){const anchor=closeArea?.slots.find(s=>s.id===slot.id)?.anchor||slot.anchor,d=Math.hypot((point[0]-anchor[0])*WORLD_WIDTH,(point[1]-anchor[1])*WORLD_HEIGHT);if(d<distance){best={region:id,index,anchor};distance=d;}}
  }return best;
 };
 const pointerMove=e=>{wake();if(e.buttons&&Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>6)dragged=true;
  if(dragDevice&&dragged){const rect=host.getBoundingClientRect(),parent=placementView(),local=parent.toLocal({x:e.clientX-rect.left,y:e.clientY-rect.top});dragDevice.point=[local.x,local.y];if(dropGhost.parent!==parent)parent.addChild(dropGhost);dropGhost.clear();const target=dropAt(e.clientX,e.clientY);if(target)dropGhost.ellipse(target.anchor[0]*WORLD_WIDTH,target.anchor[1]*WORLD_HEIGHT,30,10).fill({color:0xffedba,alpha:.6});}
 };
 const pointerUp=e=>{const device=dragDevice;dragDevice=null;dropGhost.clear();if(device&&dragged){const target=dropAt(e.clientX,e.clientY);if(target)options.onMoveApplet?.(device.id,target.region,target.index);}};
 const pointerCancel=()=>{dragDevice=null;dropGhost.clear();};
 const contextMenu=e=>e.preventDefault();
 const wheel=e=>{wake();e.preventDefault();};
 // Connection and error states belong to Fox and the opened Applet. A universal
 // coloured point makes every Peek read as the same status widget and competes
 // with the device's own visual language.
 function refreshContent(){for(const d of devices){d.status=(d.room.entity==='matter'?d.room.status:appletStatus(d.room,connections))||{};}}
 async function initialize(){
  if(!payload)throw Error('Missing 2.5D world assets');
  await app.init({preference:['webgl'],antialias:true,resolution:Math.min(devicePixelRatio,2),autoDensity:true,background:0xa9c9ce,resizeTo:host});
  if(closed){app.destroy(true);return;}
  guardFilterResolution(app.renderer.filter);
  // Compile the transition blur during scene setup, not the first Applet click.
  const warmBlur=new Container();warmBlur.addChild(new Graphics().rect(0,0,32,32).fill(0xffffff));warmBlur.filters=[softFocus];
  const warmTexture=app.renderer.generateTexture({target:warmBlur});warmTexture.destroy(true);warmBlur.filters=null;warmBlur.destroy({children:true});
  host.prepend(app.canvas);app.stage.eventMode='static';app.stage.hitArea=new Rectangle(0,0,host.clientWidth,host.clientHeight);app.stage.on('pointertap',e=>{if(e.button===0&&!dragged&&e.target===app.stage&&level!=='overview')onPick({action:'back'});});app.canvas.dataset.renderer='pixi-webgl';app.canvas.addEventListener('wheel',wheel,{passive:false});app.canvas.addEventListener('pointerdown',pointerDown);window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerUp);window.addEventListener('pointercancel',pointerCancel);window.addEventListener('blur',pointerCancel);app.canvas.addEventListener('contextmenu',contextMenu);app.stage.addChild(world,foregroundLayer);
  focusScenery=await createFocusScenery(payload,image,()=>{if(!dragged&&level!=='overview')onPick({action:'back'});});if(closed)return;app.stage.addChildAt(focusScenery.layer,1);
  areaScenery=await createAreaScenery(payload,image);if(closed)return;app.stage.addChildAt(areaScenery.layer,1);
  const extended=await image(payload.surroundings);if(closed)return;
  const surroundings=await createRegisteredPlate(extended,payload.hiresDay,image);if(closed)return;surroundings.eventMode='static';surroundings.on('pointertap',e=>{if(e.button===0&&!dragged&&level==='building'&&!areaZoom)onPick({action:'back'});});world.addChild(surroundings);
  // Ground, landmark and name share entry; independent devices keep their own taps.
  const areaTarget=(target:Container,b)=>{
   const open=()=>level==='overview'&&!tourCovers()&&host.closest('.notion-world')?.getAttribute('data-onboarding-locked')!=='true';
   target.cursor='pointer';
   target.on('pointertap',e=>{e.stopPropagation();if(e.button!==0||dragged)return;if(level==='building'){if(!areaZoom)onPick({action:'back'});}else if(open())onPick({action:'region-more',id:b.id});});
   target.on('pointerover',()=>{if(!open())return;wake();hoveredRegion=b.id;project();});
   target.on('pointerout',()=>{if(hoveredRegion!==b.id)return;wake();hoveredRegion=null;project();});
  };
  for(const b of buildings){const site=siteFor(b),[x,y,w,h]=site.bounds;const region=new Container();region.position.set(x*WORLD_WIDTH,y*WORLD_HEIGHT);region.hitArea=new Rectangle(0,0,w*WORLD_WIDTH,h*WORLD_HEIGHT);region.eventMode=regionAllowed(b.id)?'static':'none';areaTarget(region,b);world.addChild(region);regions.push({b,site,root:region});}
  for(const [key,tile] of Object.entries<any>(payload.regions)){const tex=await image(tile.image);if(closed)return;const sprite=new Sprite(tex);sprite.position.set(tile.bounds[0],tile.bounds[1]);sprite.eventMode='none';const r=regions.find(r=>(r.b.region||r.b.id.replace('building-',''))===key);if(r)r.tile=sprite;world.addChild(sprite);}
  for(const tile of payload.studies||[]){const tex=await image(tile.image);if(closed)return;const sprite=new Sprite(tex);sprite.position.set(tile.bounds[0],tile.bounds[1]);sprite.width=tile.bounds[2];sprite.height=tile.bounds[3];sprite.eventMode='none';world.addChild(sprite);}
  for(const r of regions){const [x,y,w,h]=r.site.bounds;const glow=new Graphics().ellipse((x+w*.5)*WORLD_WIDTH,(y+h*.5)*WORLD_HEIGHT,w*WORLD_WIDTH*.5,h*WORLD_HEIGHT*.5).fill({color:0xffedba,alpha:.22});glow.filters=[new BlurFilter({strength:15,quality:4})];glow.eventMode='none';glow.alpha=0;glow.visible=false;glow.zIndex=90;r.glow=glow;world.addChild(glow);}
  const landmarkTextures=Object.fromEntries(await Promise.all(Object.entries(payload.landmarks||{}).map(async([id,src])=>[id,await image(src)])));
  const landmarkNights=Object.fromEntries(await Promise.all(Object.entries(payload.landmarkNights||{}).map(async([id,src])=>[id,await image(src)])));
  if(closed)return;
  // Landmark art never changes its scenery tone: bake it into each texture once, not a filter pass per
  // landmark per frame.
  const tonedLandmarks=new Map<Texture,Texture>(),landmarkToneFilter=createSceneryTone();
  const landmarkTone=(texture:Texture)=>{let toned=tonedLandmarks.get(texture);if(!toned){const sprite=new Sprite(texture);sprite.filters=[landmarkToneFilter];toned=app.renderer.generateTexture({target:sprite,resolution:1,textureSourceOptions:{autoGenerateMipmaps:true,scaleMode:'linear'}});sprite.destroy();tonedLandmarks.set(texture,toned);textures.push(toned);}return toned;};
  for(const r of regions){const id=regionId(r.b.id),spec=REGION_LANDMARKS[id],tex=landmarkTextures[r.b.visualTheme||id];if(!spec||!tex)continue;
   r.landmark=createLandmarkSprite(tex,landmarkNights[r.b.visualTheme||id],spec.width,landmarkTone);r.landmark.root.position.set(...toWorld(spec.anchor));r.landmark.root.eventMode=regionAllowed(r.b.id)?'static':'none';areaTarget(r.landmark.root,r.b);world.addChild(r.landmark.root);
  }
  const updateThemes=()=>{for(const r of regions){const id=regionId(r.b.id),theme=layout?.themes[id]||r.b.visualTheme||id,tex=landmarkTextures[theme];if(!tex||!r.landmark)continue;r.landmark.setTextures(tex,landmarkNights[theme],theme);}};
  (options as any).updateThemes=updateThemes;updateThemes();
  const loaded=await Promise.all(rooms.map(async(room)=>{
   // The person's own Applet shows its icon over its device: the one painted for it, or a website's own
   // (core/applets/MY-APPLETS.md#pictures).
   const icon=myAppletKind(room)&&typeof room.icon==='string'?await image(room.icon).catch(()=>null):null;
   return {room,icon,tex:await image(payload.devices[room.art||room.key]||payload.devices['apple-notes']),};
  }));
  if(closed)return;
  for(const {room,icon,tex}of loaded){if(!tex)continue;const region=regions.find(r=>r.b.id===room.buildingId),i=devices.filter(d=>d.region===region&&d.room.entity===room.entity).length;
   const study=payload.studies?.find(s=>s.key===room.key);
   const installation=APPLET_SPRITES[room.key];
   const anchor=assigned[room.moduleId]?.anchor||study?.anchor||(room.entity==='matter'&&region?[region.site.center[0]-.065+(i%4)*.04,region.site.center[1]+.11+Math.floor(i/4)*.035]:installation?.anchor)||[.248,.55],root=new Container();root.position.set(...toWorld(anchor));
   const body=new Container();root.addChild(body);const sprite=new Sprite(tex);sprite.anchor.set(.5,1);const width=room.entity==='matter'?47.5:appletWidth*(APPLET_OPTICAL_SCALE[room.art||room.key]??1);sprite.width=width;sprite.height=width*tex.height/tex.width;
   const shadowShape=new Graphics().ellipse(0,-3.75,width*.34,6).fill({color:0x494939,alpha:.56});shadowShape.filters=[new BlurFilter({strength:2.5,quality:3})];
   // The blurred shadow never changes shape: transform() bakes it once per on-screen scale instead of
   // blurring every shadow every frame, which was most of an idle World's draw calls.
   const shadow=new Container();shadow.addChild(shadowShape);body.addChild(shadow,sprite);
   if(icon){const size=width*.34,badge=new Container(),mark=new Sprite(icon);mark.anchor.set(.5);mark.width=mark.height=size;
    badge.addChild(new Graphics().roundRect(-size/2-3,-size/2-3,size+6,size+6,7).fill({color:0xfff8ea,alpha:.95}).stroke({color:0x6b5a3e,alpha:.45,width:1}),mark);
    badge.position.set(0,-sprite.height*.58);badge.eventMode='none';body.addChild(badge);}
   // The person's own Applets carry a small honey mark at the device's lower right (core/applets/MY-APPLETS.md).
   const mine=myAppletKind(room)?myAppletMark(width):null;if(mine)body.addChild(mine);
   // The authored cinema sprite includes its painted mark; the official logo
   // remains in the context title and the separate Focus scenery.
   // The vehicle body is independent of its registered clean ground tile.
   if(study){const tones=new ColorMatrixFilter();tones.saturate(-.2);tones.brightness(1.08,true);sprite.filters=[tones];shadowShape.clear().ellipse(-width*.25,-sprite.height*.29,5,1.4).ellipse(width*.28,-sprite.height*.05,5,1.5).fill({color:0x625c39,alpha:.34});shadowShape.filters=[new BlurFilter({strength:.8,quality:3})];}
   const outlines=[[1,0],[-1,0],[0,1],[0,-1]].map(([x,y])=>{const edge=new Sprite(tex);edge.anchor.copyFrom(sprite.anchor);edge.width=sprite.width;edge.height=sprite.height;edge.position.set(x,y);const solid=new ColorMatrixFilter();solid.matrix=[0,0,0,0,1,0,0,0,0,.84,0,0,0,0,.42,0,0,0,1,0];edge.filters=[solid];edge.visible=false;body.addChildAt(edge,1);return edge;});
   root.eventMode=study?'dynamic':'static';root.cursor='pointer';
   const deviceKey=payload.devices[room.art||room.key]?room.art||room.key:'apple-notes',mask={width:tex.frame.width,height:tex.frame.height};
   // The build measures each device's painted box; hit testing reads the pixels only once the pointer
   // is inside it.
   const box=payload.deviceBoxes?.[deviceKey];let alpha:Uint8ClampedArray|null=null;
   const [firstOpaqueColumn,firstOpaqueRow,lastOpaqueColumn,lastOpaqueRow]=box&&box[4]===mask.width&&box[5]===mask.height?box:paintedBox(alpha=alphaOf(tex),mask.width,mask.height);
   let visibleLeft=(firstOpaqueColumn/mask.width-.5)*sprite.width,visibleWidth=(lastOpaqueColumn-firstOpaqueColumn+1)/mask.width*sprite.width;
   let visibleBottom=-sprite.height+(lastOpaqueRow+1)/mask.height*sprite.height;
   // Alpha padding is not ground: align every visible foot to its authored slot.
   if(!study){for(const child of body.children)if(child!==shadow)child.y-=visibleBottom;visibleBottom=0;}
   const visibleTop=sprite.y-sprite.height+firstOpaqueRow/mask.height*sprite.height;
   if(room.key==='youtube'){shadow.y=visibleBottom;shadowShape.clear().ellipse(-width*.26,-2,width*.13,3).ellipse(width*.24,-1,width*.13,3).fill({color:0x685f39,alpha:.34});}
   root.hitArea={contains(x,y){if(root.parent===world&&lighting?.occludes?.(root.x+x*root.scale.x,root.y+y*root.scale.y,root.zIndex))return false;const px=Math.floor((x/width+.5)*mask.width),py=Math.floor((y-sprite.y+sprite.height)/sprite.height*mask.height);if(px<firstOpaqueColumn||py<firstOpaqueRow||px>lastOpaqueColumn||py>lastOpaqueRow)return false;alpha??=alphaOf(tex);return alpha[(py*mask.width+px)*4+3]>32;}};
   root.on('rightclick',e=>{e.stopPropagation();if(room.entity==='app'&&allowed(room)&&['overview','building'].includes(level)){const rect=app.canvas.getBoundingClientRect();options.onAppletMenu?.(room.moduleId,e.global.x+rect.left,e.global.y+rect.top);}});
   if(room.key==='youtube')root.on('pointerdown',e=>{(e.nativeEvent as any).worldletKeepFox=true;});
   root.on('pointerdown',e=>{if(e.button!==0||level==='object'||!eligible(room)||host.closest('.notion-world')?.getAttribute('data-onboarding-locked')==='true')return;dragDevice={id:room.moduleId,start:[e.global.x,e.global.y],root};});
   root.on('pointertap',e=>{e.stopPropagation();if(e.button!==0||dragged||!allowed(room)||level==='object')return;onPick({action:'space',id:room.id,level:'room'});});root.on('pointermove',e=>{if(!tourCovers())showName(e,room);});root.on('pointerover',e=>{if(tourCovers())return;focusScenery?.preload(room.key);showName(e,room);(root as any).isHovered=true;hoveredRegion=devices.find(d=>d.root===root)?.region?.b.id||null;outlines.forEach(s=>s.visible=true);});root.on('pointerout',()=>{hideName();(root as any).isHovered=false;hoveredRegion=null;outlines.forEach(s=>s.visible=false);});
   const workSignal=CODING_SESSIONS.includes(room.key)?createWorkSignal(host,room.key,root,width,visibleTop):null;
   const spark=new Graphics();for(let n=0;n<5;n++){const a=n*Math.PI*2/5,x=Math.cos(a)*width*.65,y=Math.sin(a)*width*.4-width*.45;spark.moveTo(x-3,y).lineTo(x+3,y).moveTo(x,y-3).lineTo(x,y+3);}spark.stroke({color:0xffe4a0,width:1.8});spark.alpha=0;spark.eventMode='none';body.addChild(spark);
   root.visible=allowed(room);root.eventMode=allowed(room)?'static':'none';
   const lamp=room.entity==='app'?attachAppletLamp(sprite,deviceKey,payload.deviceEffects?.[deviceKey]?.lamp):null;
   const enchantment=createAppletEnchantments(sprite,room.key,payload.deviceEffects?.[deviceKey]?.idle);
   world.addChild(root);devices.push({body,overviewHit:root.hitArea,overviewBounds:{visibleLeft,visibleTop,visibleBottom,visibleWidth},enchantment,outlines,lamp,nativeDevice:HOME_NATIVE.includes(room.key),spark,revealAt:unlocked&&allowed(room)?performance.now():null,workSignal,room,region,anchor,root,sprite,shadow,shadowRevealAt:null,width,visibleBottom,visibleTop,visibleLeft,visibleWidth,study:!!study,baseAnchor:[...anchor],rideStart:null,rideOffset:0,status:room.status});
  }
  lighting=await createLighting({stage:app.stage,host,payload,image,dayLayers:[surroundings]});if(closed){lighting?.destroy();return;}
  if(lighting){surroundings.filters=[lighting.sceneryGrade];for(const child of world.children)if(child instanceof Sprite)child.filters=[...(child.filters||[]),lighting.grade];}
  ambience=createAmbience(world,payload);
  workMotion=createWorkMotion(world,workPath);
  const smoke=Array.from({length:8},()=>{const p=new Graphics().circle(0,0,6.25).fill({color:0xfff7e7,alpha:.24});p.eventMode='none';p.zIndex=2000;world.addChild(p);return p;});
  refreshContent();observer=new ResizeObserver(()=>{wake();transform();});observer.observe(host);transform();ready=true;focus(active,level);
  host.dispatchEvent(new Event('worldlet:world-ready',{bubbles:true}));pace(WORLD_FRAME_RATE.moving);wake();
  app.ticker.add(tick=>{frames++;const animate=motion&&!reduced.matches&&windowActive()&&!document.hidden;
   if(animate)time+=Math.min(tick.deltaMS,100)*.001;
   // Projection writes DOM pin positions. Read dimensions before those writes,
   // not between projection and lighting, which forces a second frame layout.
   const width=host.clientWidth,height=host.clientHeight;
   const amount=reduced.matches?1:1-Math.exp(-tick.deltaMS/100);const detail=host.closest('.notion-world')?.getAttribute('data-detail-open')==='true'&&host.clientWidth>800?1:0;framing+=(detail-framing)*amount;transform(amount);
   // The overview's atmosphere never leaks into an authored room.
   ambience?.update(time,animate&&level!=='object'&&!closeArea,lightingState(environment).lamps);
   // Working devices liven the World (work-motion.ts); not while an Applet is open.
   workMotion.update(time,devices.filter(d=>d.working&&d.root.visible&&allowed(d.room)).length,animate&&level!=='object'&&!closeArea);
   // The Home chimney smokes faster and higher the busier the World is.
   smokeTime+=(time-smokeAt)*(1+1.5*workMotion.liveliness);smokeAt=time;
   lighting?.update(environment,time,view,width,height,framing);
   lighting?.updateMotion?.(time,animate&&level==='overview'&&!closeArea);
   const chimney=regions.find(r=>r.landmark?.metrics.theme==='home')?.landmark;
   const smokeInDaylight=lightingState(environment).smoke;
   smoke.forEach((p,i)=>{p.visible=!!chimney&&smokeInDaylight;if(!p.visible)return;const m=chimney.metrics,age=(smokeTime*.18+i/8)%1,busy=workMotion.liveliness;p.position.set(m.anchor[0]+m.width*(.74-.5)+age*8,m.anchor[1]-m.height*.94-age*65*(1+.4*busy));p.scale.set(.4+age*1.3*(1+.25*busy));p.alpha=(1-age)*.65*(1+.3*busy);});
   for(const d of devices){
    d.enchantment?.update(time,animate&&d.root.visible&&d.body.visible&&level!=='object');
    d.closeVisual?.enchantment?.update(time,animate&&d.root.visible&&d.closeVisual.body.visible);
    if(d.workSignal){const p=d.root.toGlobal({x:0,y:d.visibleTop-d.width*.034});d.workSignal.update(d.activity,time,motion&&!reduced.matches,d.root.visible,p.x,p.y,d.root.worldTransform.a*d.width*.22/36);}
   }
   const fps=worldFrameRate({moving:performance.now()<wakeUntil||moving(detail),windowActive:windowActive(),animated:animate});
   if(fps!==frameRate)pace(fps);
  });
  desktopPresentation();
 }
 initialize().catch(error=>{if(closed)return;console.error('2.5D world failed',error);host.dispatchEvent(new Event('worldlet:world-error',{bubbles:true}));});
 return {stageState:()=>new Map(stages),focus,refreshContent,setPlacementArea(id:string|null){placementArea=id;project();},frameArea(id:string|null,inset=0){shelfArea=id;shelfInset=Math.max(0,inset);wake();if(reduced.matches)transform();},refreshRegions(){wake();refreshPlacements();options.updateThemes?.();transform();},setHoveredApplet(id){for(const d of devices){d.labelHovered=d.room.id===id;if(d.labelHovered)focusScenery?.preload(d.room.key);}},prepareArrival(ids){const selected=new Set<string>(ids);const planned=resolvePlacements(rooms,positions,r=>selected.has(r.moduleId),regionPages);for(const d of devices){const slot=planned[d.room.moduleId];if(slot)d.anchor=d.baseAnchor=[...slot.anchor];d.onArrivalPage=!!slot;}transform();},setHoveredArea(id){hoveredRegion=id;project();},setAppletLayout(ids,points){wake();hidden=new Set(ids||[]);refreshPlacements();for(const d of devices){d.root.eventMode=allowed(d.room)?'static':'none';}transform();},async setUnlockedApplets(ids,fromCenter=false,icons={},settled=false){wake();const previous=unlocked;unlocked=ids?new Set<string>(ids):null;refreshPlacements();
 const arriving=devices.filter(d=>allowed(d.room)&&previous&&!previous.has(d.room.moduleId));
 if(fromCenter&&!reduced.matches)arriving.forEach(d=>d.arrivalPending=true);
 if(fromCenter&&!reduced.matches)await Promise.all(arriving.map(async d=>{try{if(!icons[d.room.moduleId])return;const texture=await image(icons[d.room.moduleId]);if(!texture||closed)return;const logo=new Sprite(texture);logo.anchor.set(.5);logo.width=36/(2*view.scale);logo.height=logo.width;logo.y=(d.visibleTop+d.visibleBottom)/2;logo.eventMode='none';d.root.addChild(logo);d.arrivalLogo=logo;}catch{}}));
 if(closed)return;
 for(const [i,d] of arriving.entries()){d.arrivalPending=false;if(settled){d.shadowRevealAt=performance.now();d.shadow.alpha=reduced.matches?1:0;}d.revealAt=settled?null:performance.now()+(fromCenter&&!reduced.matches?i*65:0);d.revealFrom=fromCenter?[(host.clientWidth*.5+((i%6)-2.5)*44-view.x)/view.scale,(host.clientHeight*.45+Math.floor(i/6)*44-view.y)/view.scale-(d.arrivalLogo?.y||0)*2]:null;}
 for(const d of devices)d.root.eventMode=allowed(d.room)?'static':'none';for(const r of regions){r.root.eventMode=regionAllowed(r.b.id)?'static':'none';if(r.landmark)r.landmark.root.eventMode=r.root.eventMode;}transform();
 if(fromCenter&&!reduced.matches)await new Promise(resolve=>setTimeout(resolve,2800+Math.max(0,arriving.length-1)*65));
 },deliverMail(){if(level!=='object')return false;wake();focusScenery?.deliverMail();return true;},setDevicePresence(id,value){wake();const d=devices.find(d=>d.room.moduleId===id);if(!d)return false;d.presence=value?1:0;d.root.eventMode=value?'static':'none';return true;},devicePoint(id){const d=devices.find(d=>d.room.moduleId===id);if(!d||!ready)return null;const p=d.root.toGlobal({x:0,y:d.visibleTop*.5});return {x:p.x,y:p.y};},setConnections(list){connections=list||[];refreshContent();},setFocusItem(id,item){const d=devices.find(d=>d.room.moduleId===id);if(d)contentStage.setSelected(d.room,item);},setAppStage(id,value){stages.set(id,value);project();},selectStageItem(_id,itemId){return contentStage.select(itemId);},setAppActivity(id,value){const d=devices.find(d=>d.room.moduleId===id);if(d)d.activity=value;},setEnvironment(v){const next=v||{};if(environmentShifted(environment,next))wake(500);environment=next;},toggleMotion(){wake();motion=!motion;contentStage.setMotion(motion);return motion;},
 get metrics(){return {renderer:ready?'pixi-webgl':'initializing',level,active,viewSchema:'world-region-matter-v1',placement:{fixed:true},hoveredRegion,camera:{span:1/cameraFrame.zoom,anchor:cameraFrame.anchor,settled:cameraSettled,area:shelfArea},levelZoom:levelZoom.metrics,framing:{amount:framing,viewport:view},performance:{frames,fps:ready?app.ticker.FPS:null},representation:'layered-2.5d',workMotion:workMotion?.metrics||null,ambience:ambience?.metrics||null,areaView:areaScenery?.metrics||null,focusRoom:focusScenery?.metrics||null,presentation:{deviceVisible:devices.find(d=>d.room.moduleId===active)?.root.visible===true,id:level==='object'?active:null,focusScenery:focusSceneryVisible,zoom:1,foregroundWidth:devices.find(d=>d.room.moduleId===active)?.root.width||0,stage:contentStage.metrics},buildings:buildings.map(b=>({...b,unbuilt:!devices.some(d=>d.region?.b.id===b.id&&d.status?.connected)})),modules:devices.map(d=>({id:d.room.moduleId,lamp:(d.closeVisual?.lamp||d.lamp)?.metrics||null,scale:[d.root.scale.x,d.root.scale.y],unlocked:allowed(d.room),visible:d.root.visible,mine:myAppletKind(d.room),entity:d.room.entity||'matter',region:d.room.buildingId,state:d.status?.state,count:d.status?.count,position:d.anchor,arrivalVisible:d.onArrivalPage!==false,arrivalBounds:{x:world.x+(d.anchor[0]*WORLD_WIDTH+d.sprite.x-d.sprite.width*.5)*world.scale.x,y:world.y+(d.anchor[1]*WORLD_HEIGHT+d.sprite.y-d.sprite.height)*world.scale.y,width:d.sprite.width*world.scale.x,height:d.sprite.height*world.scale.y},peekBounds:{x:d.root.getGlobalPosition().x+d.visibleLeft*d.root.worldTransform.a,y:d.root.getGlobalPosition().y+d.visibleTop*d.root.worldTransform.d,width:d.visibleWidth*d.root.worldTransform.a,height:(d.visibleBottom-d.visibleTop)*d.root.worldTransform.d},peekHit:{x:d.root.getGlobalPosition().x,y:d.root.getGlobalPosition().y+(d.visibleTop+(d.visibleBottom-d.visibleTop)*.45)*d.root.worldTransform.d},presentation:{phase:d.status?.phase,rigMotion:0,enchantment:closeArea&&d.closeVisual?d.closeVisual.enchantment?.metrics:d.enchantment?.metrics||null}})),landmarks:regions.filter(r=>r.landmark).map(r=>({id:r.b.id,...r.landmark.metrics,hits:[.5,.3,.7].flatMap(across=>[.5,.3,.7,.15,.85].map(at=>[at,across])).map(([at,across])=>{const [x,y]=r.landmark.paintedPoint(at,across),p=r.landmark.root.toGlobal({x,y});return {x:p.x,y:p.y,landmark:(()=>{try{return app.renderer.events.rootBoundary.hitTest(p.x,p.y)===r.landmark.root;}catch{return false;}})(),top:(()=>{try{const t=app.renderer.events.rootBoundary.hitTest(p.x,p.y);for(let o=t;o;o=o.parent){const d=devices.find(d=>d.root===o);if(d)return d.room.moduleId;const g=regions.find(g=>g.root===o||g.landmark?.root===o);if(g)return (g.landmark?.root===o?'landmark:':'ground:')+g.b.id;}return t?String(t.label||t.constructor?.name||'object'):'none';}catch(e){return 'error:'+String(e).slice(0,60);}})()};})})),environment:{...environment,...(lighting?.metrics||{mode:'initializing'})}};},destroy(){closed=true;levelZoom.dispose();imageLamps.destroy();for(const label of lampLabels.values())label.destroy();lampLabels.clear();hoverName.remove();host.removeEventListener('pointerleave',hideName);host.removeEventListener('pointerdown',hideName);window.removeEventListener('worldlet:desktop-companion',desktopPresentation);observer?.disconnect();lighting?.destroy();ambience?.destroy(t=>textures.push(t));contentStage.destroy();devices.forEach(d=>d.workSignal?.destroy());focusScenery?.destroy();areaScenery?.destroy();softFocus.destroy();if(ready||app.renderer){app.canvas.removeEventListener('wheel',wheel);app.canvas.removeEventListener('pointerdown',pointerDown);window.removeEventListener('pointermove',pointerMove);window.removeEventListener('pointerup',pointerUp);window.removeEventListener('pointercancel',pointerCancel);window.removeEventListener('blur',pointerCancel);app.canvas.removeEventListener('contextmenu',contextMenu);app.destroy(true,{children:true});}focusScenery?.releaseTextures();textures.forEach(t=>t.destroy(true));}};
}
