import {lampSurface,LAMP_SURFACE_EXTENT} from './applet-lamp-surface.ts';
import {lampAnchor} from './applet-lamp-art.ts';
import {lampColors,lampOpacity,lampDisplayState,type LampSignal} from './applet-lamp.ts';
import {createLampLabel} from './applet-lamp-label.ts';

/** Plain HTML copies of device artwork share the live Pixi device's socket/state.
 * Decorative Open/Focus paintings are not device textures and are not matched. */
export function createAppletImageLamps(root:HTMLElement,assets:any){
 const sources=new Map<string,string[]>();
 for(const [key,value] of Object.entries<any>(assets?.devices||{})){
  const src=typeof value==='string'?value:value?.src;if(src)sources.set(src,[...(sources.get(src)||[]),key]);
 }
 // Several Applets can share one painted instrument. Pixels do not identify its owner.
 const owner=(image:HTMLImageElement)=>{const keys=sources.get(image.getAttribute('src'))||[],declared=image.dataset.applet||image.dataset.appletId?.replace(/^app-/,'');return declared?keys.includes(declared)?declared:undefined:keys.length===1?keys[0]:undefined;};
 const entries=new Map<HTMLImageElement,{key:string;lamp:HTMLElement;label:ReturnType<typeof createLampLabel>;layout?:string}>();let dirty=true;
 const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'||Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).some(n=>n instanceof Element&&(n.matches('img')||n.querySelector('img')))))dirty=true;});
 observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-applet','data-applet-id']});
 function scan(){
  dirty=false;
  for(const [image,entry] of entries)if(!root.contains(image)||owner(image)!==entry.key){entry.lamp.remove();entry.label.destroy();entries.delete(image);}
  for(const image of root.querySelectorAll<HTMLImageElement>('img')){
   const key=owner(image);if(!key||!lampAnchor(key)||entries.has(image))continue;
   const lamp=document.createElement('i');lamp.className='applet-image-lamp';lamp.dataset.applet=key;lamp.hidden=true;lamp.setAttribute('aria-hidden','true');root.append(lamp);entries.set(image,{key,lamp,label:createLampLabel(root,key)});
  }
 }
 return {update(states:Map<string,LampSignal>,foregroundKey?:string,actionsVisible=true,now=0,still=true){
  if(dirty)scan();if(!entries.size)return;
  let parent:DOMRect|undefined;
  // Measure every lamp before writing styles: alternating writes/reads forces
  // repeated document layout during Applet entry and exit animations.
  const commits:Array<()=>void>=[];
  for(const [image,entry] of entries){
   const {key,lamp}=entry;
   const signal=states.get(key)||{state:'off'},state=lampDisplayState(signal,actionsVisible);
   const opacity=String(lampOpacity(state,now,still));if(lamp.style.opacity!==opacity)commits.push(()=>{lamp.style.opacity=opacity;});
   const hideLabel=()=>entry.label.update(signal,key,false,0,0);if(lamp.dataset.state!==state)commits.push(()=>{lamp.dataset.state=state;});
   if(state==='off'){hideLabel();if(!lamp.hidden)commits.push(()=>{lamp.hidden=true;});continue;}
   const box=image.getBoundingClientRect();
   const hidden=!image.getClientRects().length||getComputedStyle(image).visibility==='hidden'||!box.width||!box.height;
   if(hidden){hideLabel();if(!lamp.hidden)commits.push(()=>{lamp.hidden=true;});continue;}
   parent??=root.getBoundingClientRect();
   const a=lampAnchor(key),size=Math.min(box.width/(image.naturalWidth||1),box.height/(image.naturalHeight||1));
   const width=image.naturalWidth*size,height=image.naturalHeight*size;
   const layout=[box.left,box.top,box.width,box.height,parent.left,parent.top,width,height,state].join(':');
   if(entry.layout!==layout){commits.push(()=>{entry.layout=layout;Object.assign(lamp.style,{left:(box.left-parent.left+(box.width-width)/2+a.center[0]*width)+'px',top:(box.top-parent.top+(box.height-height)/2+a.center[1]*height)+'px',width:(a.radius[0]*2*width*.88*LAMP_SURFACE_EXTENT)+'px',height:(a.radius[1]*2*height*.88*LAMP_SURFACE_EXTENT)+'px',backgroundImage:'url('+lampSurface(lampColors[state]).url+')'});});
   }
   // Respect bounded scrolling panels; an off-screen device must not leave a lamp behind.
   let clip:Element|null=image.parentElement,visible=true;
   const cx=box.left+(box.width-width)/2+a.center[0]*width,cy=box.top+(box.height-height)/2+a.center[1]*height;
   while(clip&&clip!==root){const style=getComputedStyle(clip);if(/auto|scroll|hidden|clip/.test(style.overflow+style.overflowX+style.overflowY)){const r=clip.getBoundingClientRect();if(cx<r.left||cx>r.right||cy<r.top||cy>r.bottom){visible=false;break;}}clip=clip.parentElement;}
   if(lamp.hidden===visible)commits.push(()=>{lamp.hidden=!visible;});
   commits.push(()=>entry.label.update(signal,key,visible&&actionsVisible&&foregroundKey!==key,box.left-parent.left+box.width/2,box.top-parent.top));
  }
  for(const commit of commits)commit();
 },destroy(){observer.disconnect();for(const {lamp,label} of entries.values()){lamp.remove();label.destroy();}entries.clear();}};
}
