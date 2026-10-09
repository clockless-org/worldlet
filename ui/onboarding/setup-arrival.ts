/** Keep the same painted devices in front of the revealing world until landing. */
export async function landSetupDevices(root:HTMLElement,onLanded:()=>void=()=>{}){
 const layer=document.getElementById('setupArrivingDevices');if(!layer){onLanded();return;}
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let metricFrame=-1,liveModules=new Map<string,any>(),settled=false;
 function frameModules(now:number){if(now!==metricFrame){metricFrame=now;liveModules=new Map(((root as any).sceneMetrics?.modules||[]).map(m=>[m.id,m]));}return liveModules;}
 try{
  const modules=(root as any).sceneMetrics?.modules||[];
  await Promise.all(Array.from(layer.querySelectorAll<HTMLImageElement>('img')).map(async (img,i)=>{
   const module=modules.find(m=>m.id===img.dataset.appletId),target=module?.arrivalBounds||module?.peekBounds;
   const start=img.getBoundingClientRect();
   // Freeze the completed transformation, so flight owns the geometry from now on.
   img.getAnimations().forEach(a=>a.cancel());
   Object.assign(img.style,{left:start.left+'px',top:start.top+'px',width:start.width+'px',height:start.height+'px',transform:'none',transformOrigin:'0 0',willChange:'transform,opacity',filter:'none',opacity:'1'});
   if(!target){await img.animate([{opacity:1},{opacity:0}],{duration:reduced?0:600,fill:'forwards'}).finished;return;}
   // The opening camera can still move. Follow live ground coordinates rather
   // than freezing a hidden Sprite's transform before the first rendered frame.
   await new Promise<void>(resolve=>{
    // The first device lands as the world's 3.2 s zoom-in settles (world-reveal.ts).
    const began=performance.now(),delay=reduced?0:200+i*65,duration=reduced?0:3000;
    let landed=false;
    const frame=(now:number)=>{
     const progress=duration?Math.max(0,Math.min(1,(now-began-delay)/duration)):1;
     const ease=progress*progress*(3-2*progress);
     let live=frameModules(now).get(img.dataset.appletId)?.arrivalBounds||target;
     const bubble=module?.arrivalVisible===false?root.querySelector<HTMLElement>('[data-action="region-more"][data-page="'+module.region+'"]'):null;
     const canvas=root.querySelector<HTMLElement>('[data-renderer="sim-dom"],canvas[data-renderer="pixi-webgl"]'),base=(canvas||root).getBoundingClientRect();
     const sx=canvas?base.width/canvas.clientWidth:1,sy=canvas?base.height/canvas.clientHeight:1;
     if(bubble){const r=bubble.getBoundingClientRect();live={x:(r.left+r.width/2-base.left)/sx-8,y:(r.top+r.height/2-base.top)/sy-8,width:16,height:16};}
     const mix=(a:number,b:number)=>a+(b-a)*ease;
     const dx=base.left+live.x*sx-start.left,dy=base.top+live.y*sy-start.top;
     // A gentle floating arc decelerates into the exact slot, without a bounce.
     const arc=Math.sin(Math.PI*ease),spread=(i%2?1:-1)*(24+(i%3)*10);
     const lift=Math.min(70,24+Math.hypot(dx,dy)*.10);
     const width=mix(start.width,live.width*sx),height=mix(start.height,live.height*sy);
     Object.assign(img.style,{
      transform:`translate3d(${mix(0,dx)+arc*spread}px,${mix(0,dy)-arc*lift}px,0) scale(${width/start.width},${height/start.height})`,
      opacity:module?.arrivalVisible===false?String(1-Math.max(0,(progress-.75)/.25)):String(1-.22*arc)
     });
     if(progress===1&&!landed){landed=true;if(bubble&&!reduced)bubble.animate([{filter:'brightness(1)'},{filter:'brightness(1.8)'},{filter:'brightness(1)'}],{duration:500});resolve();}
     // A landed device keeps following its live slot while others are still flying.
     if(!settled)requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
   });
  }));
  // Reveal the settled canvas sprites before withdrawing their DOM stand-ins.
  onLanded();
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  if(!reduced)await layer.animate([{opacity:1},{opacity:0}],{duration:160,fill:'forwards'}).finished;
 }finally{settled=true;layer.remove();}
}
