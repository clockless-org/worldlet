import {fitThemeScene,mountSceneFrame,themeAppletScene,themeSceneMaterial,type ThemeSceneRegistration,type ThemeSceneMaterialName} from '../../themes/index.ts';
import type {BrowserPaperEdge,SurfaceRect} from '../../../contracts/browser-surface.ts';
import {appletSceneKey} from './scene-family.ts';
/**
 * The shared Applet scene renderer. An Applet supplies records and controls; the active theme supplies the painting,
 * the regions measured on it and how each region's material looks (presentation.json `appletScenes`,
 * `sceneMaterials`). The renderer lays the painting out at one uniform scale, puts a live HTML element on every region
 * and gives each one its material as CSS variables, so an Applet never names a coordinate, a colour or a font, and a
 * new theme changes how Mail looks without a change to Mail. See README.md beside this file.
 */
export interface AppletSceneRegion {id:string;role:'primary'|'secondary';material:ThemeSceneMaterialName;element:HTMLElement}
export interface AppletSceneSource {background?:string;registration:ThemeSceneRegistration}
export interface AppletScene {
 element:HTMLElement;
 /** The region the Applet's main content goes in. */
 primary:AppletSceneRegion;
 regions:readonly AppletSceneRegion[];
 /** False when the theme has no painting for this Applet and the renderer drew its plain paper instead. */
 painted:boolean;
 layout():void;
 paperEdge(rect:SurfaceRect):BrowserPaperEdge|undefined;
 destroy():void;
 readonly metrics:{key:string;painted:boolean;compact?:boolean;primary:{x:number;y:number;width:number;height:number}|null;companion:{x:number;y:number;width:number;height:number}|null};
}
/** An Applet the theme did not paint still gets one paper region, where the old floating panel was, and no picture. */
export const PLAIN_SCENE:AppletSceneSource={registration:{imageSize:[1600,1000],sha256:'0'.repeat(64),regions:[{id:'main',role:'primary',rect:[.03,.1,.6,.72],material:'paper'}],companion:[.72,.55,.26,.42]}};
/** Below this painted width the primary region would shrink text past reading: the host lays a readable sheet over the
 * painting instead, where the shell's readers already go on a narrow window (the contract allows it). */
export const SCENE_COMPACT_WIDTH=420;
// Stage and reader scenes may briefly share a shell during a handoff, including the same Applet key.
const shellOwners=new WeakMap<HTMLElement,symbol>();
const VARIABLES:Record<string,string>={ink:'--scene-ink',muted:'--scene-muted',line:'--scene-line',accent:'--scene-accent',accentInk:'--scene-accent-ink',control:'--scene-control',controlInk:'--scene-control-ink',fill:'--scene-fill',bodyFont:'--scene-body-font',displayFont:'--scene-display-font',focus:'--scene-focus'};
/** A region's material as the CSS variables applet-scene.css and the Applets' own styles read. */
export function sceneMaterialStyle(material:ThemeSceneMaterialName):Record<string,string>{
 const m=themeSceneMaterial(material),out:Record<string,string>={};
 for(const [key,name] of Object.entries(VARIABLES))out[name]=String(m[key as keyof typeof m]);
 out['--scene-body-size']=m.bodySize+'px';out['--scene-title-size']=m.titleSize+'px';out['--scene-radius']=m.radius+'px';out['--scene-control-height']=m.controlHeight+'px';
 return out;
}
// Shell overlays use layout coordinates, not the transient visual bounds of the entrance zoom.
function layoutOrigin(element:HTMLElement){
 let x=0,y=0;
 for(let node:HTMLElement|null=element;node;node=node.offsetParent as HTMLElement|null){x+=node.offsetLeft;y+=node.offsetTop;}
 return {x,y};
}
/**
 * Mount `key`'s scene in `host` (which it fills): the theme's own for that Applet, else its family's (scene-family.ts). `source` overrides the theme's scene, for a preview that serves the
 * package itself. The region elements are empty: the Applet renders into `primary.element` (and any secondary ones).
 * `shell`, when given, receives the primary and companion rectangles as CSS variables in its own coordinates
 * (--applet-scene-primary-left/top/width/height, --applet-scene-companion-*), for shell surfaces outside the scene
 * (an Applet's reader) to sit on the same painted region, along with the primary region's material (--scene-*).
 */
export function mountAppletScene(host:HTMLElement,key:string,options:{source?:AppletSceneSource;shell?:HTMLElement|null}={}):AppletScene{
 const family=appletSceneKey(key),own=options.source||(family?themeAppletScene(family):undefined),painted=!!own?.background,source=own||PLAIN_SCENE;
 const element=document.createElement('div');element.className='applet-scene';element.dataset.applet=key;element.dataset.painted=String(painted);
 // The painting's outer margins: the same picture, blurred, rather than bare colour around a letterboxed scene.
 const margin=document.createElement('div');margin.className='applet-scene-margin';
 const plate=document.createElement('img');plate.className='applet-scene-plate';plate.alt='';plate.draggable=false;plate.decoding='async';
 if(painted){plate.src=source.background!;margin.style.backgroundImage='url("'+encodeURI(source.background!)+'")';element.append(margin,plate);}
 const regions:AppletSceneRegion[]=source.registration.regions.map(r=>{
  const region=document.createElement('section');region.className='applet-scene-region';
  Object.assign(region.dataset,{region:r.id,role:r.role,material:r.material});
  for(const [name,value] of Object.entries(sceneMaterialStyle(r.material)))region.style.setProperty(name,value);
  element.append(region);return {id:r.id,role:r.role,material:r.material,element:region};
 });
 host.append(element);
 const foreground=painted?mountSceneFrame(options.shell||element,source.background!,source.registration):null;
 const owner=Symbol(key);if(options.shell)shellOwners.set(options.shell,owner);
 const primaryRegion=regions.find(r=>r.role==='primary')!,shellStyle=options.shell?sceneMaterialStyle(primaryRegion.material):{};
 for(const [name,value] of Object.entries(shellStyle))options.shell!.style.setProperty(name,value);
 let last:AppletScene['metrics']={key,painted,primary:null,companion:null};
 const place=(node:HTMLElement,rect:{x:number;y:number;width:number;height:number})=>Object.assign(node.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});
 function layout(){
  const width=element.clientWidth,height=element.clientHeight;if(!(width>0&&height>0))return;
  const fit=fitThemeScene(source.registration,width,height);
  if(painted)place(plate,fit.image);
  // A distributed board has its filters and preview on separate sheets; its task column can be narrower.
  const distributed=regions.some(r=>r.id==='navigation')&&regions.some(r=>r.id==='details');
  const fitted=fit.regions.find(r=>r.role==='primary')!,compact=fitted.width<(distributed?280:SCENE_COMPACT_WIDTH);
  element.dataset.compact=String(compact);
  const sceneOrigin=layoutOrigin(element),shellOrigin=layoutOrigin(options.shell||element);
  const offset={x:sceneOrigin.x-shellOrigin.x,y:sceneOrigin.y-shellOrigin.y};
  foreground?.layout({...fit.image,x:fit.image.x+offset.x,y:fit.image.y+offset.y},!compact);
  const primary=compact?{...fitted,x:16,y:84,width:width-32,height:Math.max(160,height*.75-84)}:fitted;
  for(const [index,region] of regions.entries()){region.element.hidden=compact&&region.role!=='primary';place(region.element,region.role==='primary'?primary:fit.regions[index]);}
  const round=(r:{x:number;y:number;width:number;height:number})=>({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});
  last={key,painted,compact,primary:round(primary),companion:round(fit.companion)};
  const shell=options.shell;if(!shell||shellOwners.get(shell)!==owner)return;
  if(compact){if(shell.dataset.appletScene===key)delete shell.dataset.appletScene;delete shell.dataset.appletFrame;delete shell.dataset.appletCompanionBar;return;}
  for(const [name,r] of [['primary',primary],['companion',fit.companion]] as const){
   shell.style.setProperty(`--applet-scene-${name}-left`,offset.x+r.x+'px');shell.style.setProperty(`--applet-scene-${name}-top`,offset.y+r.y+'px');
   shell.style.setProperty(`--applet-scene-${name}-width`,r.width+'px');shell.style.setProperty(`--applet-scene-${name}-height`,r.height+'px');
  }
  shell.dataset.appletScene=key;
  // A short clearance below the paper carries a compact composer, not a full-height side lane.
  if(painted&&fit.companion.height<100&&fit.companion.width>=360&&fit.companion.y>=primary.y+primary.height)shell.dataset.appletCompanionBar="true";else delete shell.dataset.appletCompanionBar;
  if(source.registration.webFrame)shell.dataset.appletFrame=key;else delete shell.dataset.appletFrame;
 }
 const resize=new ResizeObserver(layout);resize.observe(element);layout();
 return {element,regions,primary:primaryRegion,painted,layout,
  get metrics(){return last;},
  paperEdge(rect){
   const profile=source.registration.webEdge||(source.registration.webFrame?{top:[0,0],right:[0,0],bottom:[0,0],left:[0,0]}:undefined);
   if(!painted||last.compact||!profile||!source.background||rect.width<=0||rect.height<=0)return;
   const image=plate.getBoundingClientRect(),scale=Math.min(1,image.width/source.registration.imageSize[0]);
   const samples=(values:readonly number[])=>values.map(n=>n*scale);
   const f=source.registration.webFrame,box=f?.target,frame=f&&box?{asset:f.mask,source:{x:f.source[0],y:f.source[1],width:f.source[2],height:f.source[3]},target:{x:image.x-rect.x+box[0]*image.width,y:image.y-rect.y+box[1]*image.height,width:box[2]*image.width,height:box[3]*image.height}}:undefined;
   return {...frame?{frame}:{},asset:source.background,image:{x:image.x-rect.x,y:image.y-rect.y,width:image.width,height:image.height},
    profile:{top:samples(profile.top),right:samples(profile.right),bottom:samples(profile.bottom),left:samples(profile.left)}};
  },
  destroy(){
   resize.disconnect();foreground?.destroy();element.remove();const shell=options.shell;if(!shell||shellOwners.get(shell)!==owner)return;
   shellOwners.delete(shell);
   delete shell.dataset.appletScene;delete shell.dataset.appletFrame;delete shell.dataset.appletCompanionBar;for(const name of Object.keys(shellStyle))shell.style.removeProperty(name);
   for(const part of ['primary','companion'])for(const side of ['left','top','width','height'])shell.style.removeProperty(`--applet-scene-${part}-${side}`);
  }};
}
