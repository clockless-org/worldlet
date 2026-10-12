/** Low-resolution procedural painted mist; no network asset. */
/** The world's zoom-in (`.world-arriving`); the loader stays until it ends. */
export const WORLD_REVEAL_MS=3200;
/** The painted mist clears sooner, so most of the zoom is seen. */
export const WORLD_MIST_MS=2000;
export function dissolveWorldSurface(loader:HTMLElement){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const canvas=document.createElement('canvas');canvas.className='startup-mist';canvas.setAttribute('aria-hidden','true');
 // A hidden or zero-width window still gets a finite, modest mist.
 const width=320,height=Math.min(1280,Math.max(100,Math.round(width*innerHeight/Math.max(1,innerWidth))));canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const style=getComputedStyle(loader),paper=style.getPropertyValue('--brand-paper').trim()||'#f5f0e4',surface=style.getPropertyValue('--brand-surface').trim()||'#eee7d6';
 const gradient=ctx.createRadialGradient(width*.5,height*.4,0,width*.5,height*.4,width*.65);gradient.addColorStop(0,paper);gradient.addColorStop(1,surface);ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
 const pixels=ctx.getImageData(0,0,width,height),thresholds=new Float32Array(width*height);
 const hash=(x:number,y:number)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 const smooth=(t:number)=>t*t*(3-2*t);
 function noise(x:number,y:number){const ix=Math.floor(x),iy=Math.floor(y),u=smooth(x-ix),v=smooth(y-iy);const a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const nx=x/width,ny=y/height;
  const cloud=noise(nx*5,ny*5)*.6+noise(nx*13,ny*13)*.28+noise(nx*31,ny*31)*.12;
  const radius=Math.min(1,Math.hypot((nx-.5)*1.4,(ny-.45)*1.2));
  thresholds[y*width+x]=.12+radius*.37+cloud*.35;
 }
 loader.append(canvas);
 const began=performance.now();
 const frame=(now:number)=>{
  if(!canvas.isConnected)return;
  const t=Math.min(1,(now-began)/WORLD_MIST_MS),reveal=smooth(t);
  for(let i=0;i<thresholds.length;i++){
   const remaining=Math.max(0,Math.min(1,(thresholds[i]-reveal)/.22+.5));
   pixels.data[i*4+3]=Math.round(smooth(remaining)*255);
  }
  ctx.putImageData(pixels,0,0);
  if(t<1)requestAnimationFrame(frame);else canvas.remove();
 };
 // Paint fully opaque before the loader's original background is removed.
 requestAnimationFrame(frame);
}
