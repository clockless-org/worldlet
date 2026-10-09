import type {ThemeScene} from '@worldlet/theme';
/** One transform owns the artwork and every live HTML slot. */
export function frame(host:HTMLElement,scene:ThemeScene){
 const canvas=document.createElement('div');canvas.className='sim-canvas';Object.assign(canvas.style,{position:'absolute',width:scene.size[0]+'px',height:scene.size[1]+'px',transformOrigin:'0 0',overflow:'hidden'});host.append(canvas);
 const resize=()=>{const scale=Math.min(host.clientWidth/scene.size[0],host.clientHeight/scene.size[1]);canvas.style.transform=`translate(${(host.clientWidth-scene.size[0]*scale)/2}px,${(host.clientHeight-scene.size[1]*scale)/2}px) scale(${scale})`;};
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 const place=(element:HTMLElement,name:string)=>{element.dataset.simSlot=name;const r=scene.slots[name];if(!r)throw Error('Missing scene slot '+name);Object.assign(element.style,{position:'absolute',left:r[0]*100+'%',top:r[1]*100+'%',width:r[2]*100+'%',height:r[3]*100+'%'});};
 return {canvas,place,dispose(){observer.disconnect();canvas.remove();}};
}
export const asset=(path:string)=>path.replace(/^assets\//,'theme-assets/');
