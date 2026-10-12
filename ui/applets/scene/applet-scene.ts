import {fitThemeScene,themeAppletScene,themeSceneMaterial,type ThemeSceneRegistration,type ThemeSceneMaterialName} from '../../themes/index.ts';
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
 destroy():void;
 readonly metrics:{key:string;painted:boolean;compact?:boolean;primary:{x:number;y:number;width:number;height:number}|null;companion:{x:number;y:number;width:number;height:number}|null};
}
/** An Applet the theme did not paint still gets one paper region, where the old floating panel was, and no picture. */
export const PLAIN_SCENE:AppletSceneSource={registration:{imageSize:[1600,1000],sha256:'0'.repeat(64),regions:[{id:'main',role:'primary',rect:[.03,.1,.6,.72],material:'paper'}],companion:[.72,.55,.26,.42]}};
/** Below this painted width the primary region would shrink text past reading: the host lays a readable sheet over the
 * painting instead, where the shell's readers already go on a narrow window (the contract allows it). */
export const SCENE_COMPACT_WIDTH=420;
const VARIABLES:Record<string,string>={ink:'--scene-ink',muted:'--scene-muted',line:'--scene-line',accent:'--scene-accent',accentInk:'--scene-accent-ink',control:'--scene-control',controlInk:'--scene-control-ink',fill:'--scene-fill',bodyFont:'--scene-body-font',displayFont:'--scene-display-font',focus:'--scene-focus'};
/** A region's material as the CSS variables applet-scene.css and the Applets' own styles read. */
export function sceneMaterialStyle(material:ThemeSceneMaterialName):Record<string,string>{
 const m=themeSceneMaterial(material),out:Record<string,string>={};
 for(const [key,name] of Object.entries(VARIABLES))out[name]=String(m[key as keyof typeof m]);
 out['--scene-body-size']=m.bodySize+'px';out['--scene-title-size']=m.titleSize+'px';out['--scene-radius']=m.radius+'px';out['--scene-control-height']=m.controlHeight+'px';
 return out;
}
/**
 * Mount `key`'s scene in `host` (which it fills). `source` overrides the theme's scene, for a preview that serves the
 * package itself. The region elements are empty: the Applet renders into `primary.element` (and any secondary ones).
 * `shell`, when given, receives the primary and companion rectangles as CSS variables in its own coordinates
 * (--applet-scene-primary-left/top/width/height, --applet-scene-companion-*), for shell surfaces outside the scene
 * (an Applet's reader) to sit on the same painted region, along with the primary region's material (--scene-*).
 */
export function mountAppletScene(host:HTMLElement,key:string,options:{source?:AppletSceneSource;shell?:HTMLElement|null}={}):AppletScene{
 const own=options.source||themeAppletScene(key),painted=!!own?.background,source=own||PLAIN_SCENE;
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
 const primaryRegion=regions.find(r=>r.role==='primary')!,shellStyle=options.shell?sceneMaterialStyle(primaryRegion.material):{};
 for(const [name,value] of Object.entries(shellStyle))options.shell!.style.setProperty(name,value);
 let last:AppletScene['metrics']={key,painted,primary:null,companion:null};
 const place=(node:HTMLElement,rect:{x:number;y:number;width:number;height:number})=>Object.assign(node.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});
 function layout(){
  const width=element.clientWidth,height=element.clientHeight;if(!(width>0&&height>0))return;
  const fit=fitThemeScene(source.registration,width,height);
  if(painted)place(plate,fit.image);
  const fitted=fit.regions.find(r=>r.role==='primary')!,compact=fitted.width<SCENE_COMPACT_WIDTH;
  element.dataset.compact=String(compact);
  const primary=compact?{...fitted,x:16,y:84,width:width-32,height:Math.max(160,height*.75-84)}:fitted;
  for(const [index,region] of regions.entries()){region.element.hidden=compact&&region.role!=='primary';place(region.element,region.role==='primary'?primary:fit.regions[index]);}
  const round=(r:{x:number;y:number;width:number;height:number})=>({x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)});
  last={key,painted,compact,primary:round(primary),companion:round(fit.companion)};
  const shell=options.shell;if(!shell)return;
  if(compact){if(shell.dataset.appletScene===key)delete shell.dataset.appletScene;return;}
  const s=shell.getBoundingClientRect(),e=element.getBoundingClientRect();
  for(const [name,r] of [['primary',primary],['companion',fit.companion]] as const){
   shell.style.setProperty(`--applet-scene-${name}-left`,e.left-s.left+r.x+'px');shell.style.setProperty(`--applet-scene-${name}-top`,e.top-s.top+r.y+'px');
   shell.style.setProperty(`--applet-scene-${name}-width`,r.width+'px');shell.style.setProperty(`--applet-scene-${name}-height`,r.height+'px');
  }
  shell.dataset.appletScene=key;
 }
 const resize=new ResizeObserver(layout);resize.observe(element);layout();
 return {element,regions,primary:primaryRegion,painted,layout,
  get metrics(){return last;},
  destroy(){
   resize.disconnect();element.remove();const shell=options.shell;if(!shell||shell.dataset.appletScene!==key)return;
   delete shell.dataset.appletScene;for(const name of Object.keys(shellStyle))shell.style.removeProperty(name);
   for(const part of ['primary','companion'])for(const side of ['left','top','width','height'])shell.style.removeProperty(`--applet-scene-${part}-${side}`);
  }};
}
