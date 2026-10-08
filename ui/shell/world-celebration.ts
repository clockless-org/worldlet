import {FINALE,welcomeFinale} from './world-celebration-finale.ts';
import {skyFireworks} from './world-celebration-sky.ts';
import {Fireworks} from 'fireworks-js';
const running=new WeakMap<HTMLElement,()=>void>();
// A brief, non-interactive welcome over the world; never covers it with a modal.
export function celebrateWorld(root:HTMLElement){
 running.get(root)?.();
 // Guided steps start after the welcome, so nothing competes with it on screen.
 const done=()=>root.dispatchEvent(new CustomEvent('worldlet:celebration-done'));
 root.querySelector('.world-celebration')?.remove();
 const layer=document.createElement('div');layer.className='world-celebration';layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{position:'fixed',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'78'});root.append(layer);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!reduced){
  const timers:ReturnType<typeof setTimeout>[]=[];
  let endFinale=()=>{};
  // The detail also carries where each rocket starts and bursts; the sound cue reads only its kind.
  const sound=(kind:string,detail:object={})=>window.dispatchEvent(new CustomEvent('worldlet:celebration-sound',{detail:{...detail,kind}}));
  // Ten staggered rockets of varied shapes and colours over ~3.4 s, each with its launch and burst cue.
  const endSky=skyFireworks(layer,event=>sound(event.kind,event));
  const cleanup=()=>{endFinale();endSky();timers.forEach(clearTimeout);layer.remove();running.delete(root);done();};
  running.set(root,cleanup);
  // "Welcome ♥" rises from the mountain foot while the last rockets burst at the sides,
  // then falls as embers; the guided introduction follows while the welcome still feels fresh.
  timers.push(setTimeout(()=>{endFinale=welcomeFinale(layer);sound('chime',{textTop:FINALE.textTop,originTop:FINALE.originTop});},2700));
  timers.push(setTimeout(cleanup,7400));
  return;
 }
 const colors=['#f8d58a','#fff2c7','#b8d7cf','#e9b6a2'];
 const bursts=[[.27,.28],[.68,.22],[.48,.35],[.79,.38],[.36,.18]];
 for(const [index,[x,y]] of bursts.entries())for(let i=0;i<20;i++){
  const spark=document.createElement('i'),angle=i/20*Math.PI*2,radius=55+(i%3)*22;
  Object.assign(spark.style,{position:'absolute',left:x*100+'%',top:y*100+'%',width:'4px',height:'4px',borderRadius:'50%',background:colors[index%colors.length],boxShadow:'0 0 7px '+colors[index%colors.length],opacity:'0'});layer.append(spark);
  const dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
  spark.animate([
   {opacity:0,transform:`translate(${dx}px,${dy}px)`},{opacity:.6},{opacity:0}
  ],{duration:900,easing:'ease-out',fill:'both'});
 }
 const timer=setTimeout(()=>{layer.remove();running.delete(root);done();},1000);
 running.set(root,()=>{clearTimeout(timer);layer.remove();running.delete(root);});
}

/** A small burst for the first thing Fox gets done: no text, over in about two seconds. */
export function celebrateWin(root:HTMLElement){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const layer=document.createElement('div');layer.className='world-celebration world-win';layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{position:'fixed',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'78'});root.append(layer);
 const fireworks=new Fireworks(layer,{particles:40,explosion:3,traceLength:5,traceSpeed:10,acceleration:1.05,friction:.965,gravity:1.1,
  hue:{min:30,max:60},brightness:{min:75,max:95},decay:{min:.015,max:.022},rocketsPoint:{min:35,max:65},sound:{enabled:false},mouse:{click:false,move:false}});
 fireworks.updateBoundaries({x:layer.clientWidth*.25,y:layer.clientHeight*.12,width:layer.clientWidth*.75,height:layer.clientHeight*.4});
 fireworks.launch(1);window.dispatchEvent(new CustomEvent('worldlet:celebration-sound',{detail:{kind:'launch'}}));
 const second=setTimeout(()=>fireworks.launch(1),450);
 setTimeout(()=>{clearTimeout(second);fireworks.stop(true);layer.remove();},2600);
}
