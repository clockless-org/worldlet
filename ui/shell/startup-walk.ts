import atlas from '../../resources/styles/builtin/assets/companion/sprites-v4/atlas.json' with {type:'json'};
/** A registered walking sprite, independent of the heavy world bundle. */
export function startupWalk(loader:HTMLElement){
 // Theme assets load before this lightweight boot script. A themed still must not
 // be covered by the Village walker while the world bundle is starting.
 const environment=(globalThis as any).__WORLDLET_ENV_ASSETS__;
 if(environment?.surfaces?.startup||(!environment?.companionRive&&environment?.companionPortrait))return;
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=320;canvas.className='startup-walk';canvas.setAttribute('aria-hidden','true');
 const ctx=canvas.getContext('2d'),image=new Image(),sheet=atlas.sheets.walking,frames=sheet.frames.filter(f=>!f.touchesEdge);
 let stopped=false,raf=0,last=-1;const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const stop=()=>{stopped=true;cancelAnimationFrame(raf);canvas.remove();loader.classList.remove('has-walk');};
 document.addEventListener('worldlet:setup-start',stop,{once:true});document.addEventListener('worldlet:world-revealed',stop,{once:true});document.addEventListener('worldlet:world-error',stop,{once:true});
 image.onload=()=>{if(stopped||!loader.isConnected)return;loader.querySelector('.startup-scene')?.append(canvas);loader.classList.add('has-walk');const began=performance.now();
  const draw=(now:number)=>{if(stopped||!loader.isConnected)return;const index=reduced.matches?0:Math.floor(Math.max(0,now-began)%1400/1400*frames.length);if(index!==last){last=index;const f=frames[index],s=sheet.scale,w=f.frame.w*s,h=f.frame.h*s;ctx.clearRect(0,0,320,320);ctx.drawImage(image,f.frame.x,f.frame.y,f.frame.w,f.frame.h,160-w/2,310-f.pivot.y*h,w,h);}raf=requestAnimationFrame(draw);};raf=requestAnimationFrame(draw);
 };image.src='assets/fox-walking.png';
}
