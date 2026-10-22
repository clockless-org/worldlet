import type {ThemeSceneDelivery} from '../../style/index.ts';
/** Decorative media only. The host supplies a deduplicated mail event; entering a scene never plays it. */
export function mountMailDelivery(host:HTMLElement,spec:ThemeSceneDelivery){
 const video=document.createElement('video');video.className='applet-mail-delivery';video.muted=true;video.playsInline=true;video.preload='none';video.hidden=true;video.setAttribute('aria-hidden','true');video.tabIndex=-1;
 Object.assign(video.style,{position:'absolute',pointerEvents:'none',objectFit:'fill'});host.append(video);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let foreground=true,enabled=true,closed=false,ticket=0,plays=0,frame=0,state:'idle'|'loading'|'playing'|'failed'='idle';
 const stop=()=>{ticket++;cancelAnimationFrame(frame);frame=0;video.pause();video.hidden=true;video.style.opacity='0';if(state!=='failed')state='idle';};
 const allowed=()=>enabled&&foreground&&!closed&&!reduced.matches&&!document.hidden&&host.isConnected;
 const tick=()=>{if(!allowed()||video.currentTime>=spec.duration){stop();return;}video.style.opacity=String(Math.min(1,video.currentTime/.2,Math.max(0,(spec.duration-video.currentTime)/.6)));frame=requestAnimationFrame(tick);};
 const fail=()=>{stop();state='failed';};
 const inactive=()=>{foreground=false;stop();},active=()=>{foreground=true;},visibility=()=>{if(document.hidden)stop();};
 // Media query changes arrive at the next rendering update, possibly after a newer play(): only turning reduced motion on stops a clip.
 const motionPreference=()=>{if(reduced.matches)stop();};
 video.addEventListener('ended',stop);video.addEventListener('error',fail);
 document.addEventListener('visibilitychange',visibility);window.addEventListener('worldlet:app-inactive',inactive);window.addEventListener('blur',inactive);window.addEventListener('worldlet:app-active',active);window.addEventListener('focus',active);reduced.addEventListener('change',motionPreference);
 return {
  play(){
   if(!allowed()||state==='failed')return false;if(state==='playing'||state==='loading')return true;
   const request=++ticket;state='loading';if(!video.hasAttribute('src'))video.src=spec.video;video.currentTime=0;
   void video.play().then(()=>{if(request!==ticket)return;if(!allowed()){video.pause();return;}state='playing';plays++;video.hidden=false;tick();}).catch(()=>{if(request===ticket)fail();});return true;
  },
  enable(value:boolean){enabled=value;if(!value)stop();},
  layout(image:{x:number;y:number;width:number;height:number}){const [x,y,w,h]=spec.bounds;Object.assign(video.style,{left:image.x+x*image.width+'px',top:image.y+y*image.height+'px',width:w*image.width+'px',height:h*image.height+'px'});},
  get metrics(){return {state,time:video.currentTime,plays,visible:!video.hidden};},
  destroy(){closed=true;stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('worldlet:app-inactive',inactive);window.removeEventListener('blur',inactive);window.removeEventListener('worldlet:app-active',active);window.removeEventListener('focus',active);reduced.removeEventListener('change',motionPreference);video.removeEventListener('ended',stop);video.removeEventListener('error',fail);video.removeAttribute('src');video.load();video.remove();}
 };
}
