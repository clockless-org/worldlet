import type {ThemeScene} from '@worldlet/theme';
/** One transform for the drawing and every live HTML slot on it. */
export function frame(host:HTMLElement,scene:ThemeScene){
 const canvas=document.createElement('div');canvas.className='blueprint-canvas';Object.assign(canvas.style,{position:'absolute',left:'0',top:'0',width:scene.size[0]+'px',height:scene.size[1]+'px',transformOrigin:'0 0',overflow:'hidden'});host.append(canvas);
 const resize=()=>{const scale=Math.min(host.clientWidth/scene.size[0],host.clientHeight/scene.size[1])||1;canvas.style.transform=`translate(${(host.clientWidth-scene.size[0]*scale)/2}px,${(host.clientHeight-scene.size[1]*scale)/2}px) scale(${scale})`;};
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 const place=(element:HTMLElement,name:string)=>{const r=scene.slots[name];if(!r)throw Error('Missing scene slot '+name);element.dataset.simSlot=name;Object.assign(element.style,{position:'absolute',left:r[0]*100+'%',top:r[1]*100+'%',width:r[2]*100+'%',height:r[3]*100+'%'});canvas.append(element);};
 return {canvas,place,dispose(){observer.disconnect();canvas.remove();}};
}
export const node=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text='')=>Object.assign(document.createElement(tag),{className,textContent:text});
